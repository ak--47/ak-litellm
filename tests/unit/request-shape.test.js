/**
 * @fileoverview What actually goes on the wire. Fully offline — the `openai`
 * SDK is replaced by the mock in `_harness.js`.
 */

import { jest } from '@jest/globals';
import { setup, mock, chatResponse, toolCall, streamChunks } from './_harness.js';
import { _resetWarnings } from '../../compat.js';
import log from '../../logger.js';

const { Chat, Message, ToolAgent, Transformer, RagAgent } = await setup();

const OPTS = { logLevel: 'none' };

beforeEach(() => {
	mock.reset();
	_resetWarnings();
	jest.spyOn(log, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('client construction', () => {
	it('points the SDK at the gateway /v1 root', async () => {
		new Chat(OPTS);
		expect(mock.constructorArgs[0].baseURL).toBe('https://litellm.invalid/v1');
		expect(mock.constructorArgs[0].maxRetries).toBe(5);
	});

	it('accepts a baseURL that already ends in /v1', () => {
		new Chat({ ...OPTS, baseURL: 'https://gw.example.com/v1/' });
		expect(mock.constructorArgs[0].baseURL).toBe('https://gw.example.com/v1');
	});

	it('throws at construction when no key is configured', () => {
		const prev = process.env.LITELLM_API_KEY;
		delete process.env.LITELLM_API_KEY;
		try {
			expect(() => new Chat(OPTS)).toThrow(/no API key/);
		} finally {
			process.env.LITELLM_API_KEY = prev;
		}
	});

	it('exposes the raw client under the ak-claude namespace', () => {
		const chat = new Chat(OPTS);
		expect(chat.clients.openai).toBe(chat.client);
		expect(chat.clients.raw).toBe(chat.client);
		expect(chat.clients.anthropic).toBeNull();
		expect(chat.clients.vertex).toBeNull();
	});
});

describe('request body', () => {
	it('sends the system prompt as a system message, first', async () => {
		const chat = new Chat({ ...OPTS, systemPrompt: 'be brief', modelName: 'gemini-3.8-flash' });
		mock.queue(chatResponse('ok', { model: 'gemini-3.8-flash' }));
		await chat.send('hi');

		const req = mock.lastRequest();
		expect(req.messages[0]).toEqual({ role: 'system', content: 'be brief' });
		expect(req.messages[1]).toEqual({ role: 'user', content: 'hi' });
		expect(req.model).toBe('gemini-3.8-flash');
		expect(req.max_tokens).toBe(8192);
	});

	it('omits the system message when systemPrompt is null', async () => {
		const chat = new Chat({ ...OPTS, systemPrompt: null });
		mock.queue(chatResponse('ok'));
		await chat.send('hi');
		expect(mock.lastRequest().messages.every(m => m.role !== 'system')).toBe(true);
	});

	it('sends no sampling params to the Claude 5 family, defaults included', async () => {
		const chat = new Chat({ ...OPTS, modelName: 'claude-sonnet-5' });
		mock.queue(chatResponse('ok'));
		await chat.send('hi');

		const req = mock.lastRequest();
		expect(req.temperature).toBeUndefined();
		expect(req.top_p).toBeUndefined();
		expect(req.top_k).toBeUndefined();
	});

	it('sends all three to a Google model', async () => {
		const chat = new Chat({ ...OPTS, modelName: 'gemini-3.8-flash', temperature: 0.3, topP: 0.8, topK: 20 });
		mock.queue(chatResponse('ok', { model: 'gemini-3.8-flash' }));
		await chat.send('hi');

		expect(mock.lastRequest()).toMatchObject({ temperature: 0.3, top_p: 0.8, top_k: 20 });
	});

	it('drops top_p on claude-haiku-4-5 when temperature is also set', async () => {
		const chat = new Chat({ ...OPTS, modelName: 'claude-haiku-4-5', temperature: 0.5, topP: 0.9 });
		mock.queue(chatResponse('ok', { model: 'claude-haiku-4-5' }));
		await chat.send('hi');

		const req = mock.lastRequest();
		expect(req.temperature).toBe(0.5);
		expect(req.top_p).toBeUndefined();
	});

	it('sends top_p alone on claude-haiku-4-5 when temperature is suppressed', async () => {
		const chat = new Chat({ ...OPTS, modelName: 'claude-haiku-4-5', temperature: null, topP: 0.9 });
		mock.queue(chatResponse('ok', { model: 'claude-haiku-4-5' }));
		await chat.send('hi');

		const req = mock.lastRequest();
		expect(req.temperature).toBeUndefined();
		expect(req.top_p).toBe(0.9);
	});

	it('null means never-send, distinct from undefined meaning use-the-default', async () => {
		const withDefault = new Chat({ ...OPTS, modelName: 'gemini-3.8-flash' });
		mock.queue(chatResponse('ok', { model: 'gemini-3.8-flash' }));
		await withDefault.send('hi');
		expect(mock.lastRequest().temperature).toBe(0.7);

		const suppressed = new Chat({ ...OPTS, modelName: 'gemini-3.8-flash', temperature: null, topP: null });
		mock.queue(chatResponse('ok', { model: 'gemini-3.8-flash' }));
		await suppressed.send('hi');
		expect(mock.lastRequest().temperature).toBeUndefined();
		expect(mock.lastRequest().top_p).toBeUndefined();
	});

	it('maps effort onto reasoning_effort', async () => {
		for (const [effort, wire] of [['minimal', 'low'], ['medium', 'medium'], ['max', 'high']]) {
			const chat = new Chat({ ...OPTS, effort });
			mock.queue(chatResponse('ok'));
			await chat.send('hi');
			expect(mock.lastRequest().reasoning_effort).toBe(wire);
		}
	});

	it('drops sampling params on a Claude model once effort turns thinking on', async () => {
		const chat = new Chat({ ...OPTS, modelName: 'claude-haiku-4-5', effort: 'low', temperature: 0.2, topP: 0.9, topK: 5 });
		mock.queue(chatResponse('ok', { model: 'claude-haiku-4-5' }));
		await chat.send('hi');

		const req = mock.lastRequest();
		expect(req.reasoning_effort).toBe('low');
		expect(req.temperature).toBeUndefined();
		expect(req.top_p).toBeUndefined();
		expect(req.top_k).toBeUndefined();
	});

	it('keeps sampling params on a Google model under effort', async () => {
		const chat = new Chat({ ...OPTS, modelName: 'gemini-3.8-flash', effort: 'low', temperature: 0.2 });
		mock.queue(chatResponse('ok', { model: 'gemini-3.8-flash' }));
		await chat.send('hi');

		expect(mock.lastRequest().reasoning_effort).toBe('low');
		expect(mock.lastRequest().temperature).toBe(0.2);
	});

	it('sends ak-gemini labels as gateway metadata tags', async () => {
		const chat = new Chat({ ...OPTS, labels: { team: 'eng' } });
		mock.queue(chatResponse('ok'));
		await chat.send('hi');
		expect(mock.lastRequest().metadata).toEqual({ tags: ['team:eng'] });
	});

	it('merges per-message labels over constructor labels', async () => {
		// ak-gemini allows `chat.send(msg, { labels })`. Dropping them silently
		// would break a drop-in app's cost attribution.
		const chat = new Chat({ ...OPTS, labels: { team: 'eng', env: 'prod' } });
		mock.queue(chatResponse('ok'));
		await chat.send('hi', { labels: { env: 'staging', feature: 'search' } });

		expect(mock.lastRequest().metadata.tags.sort())
			.toEqual(['env:staging', 'feature:search', 'team:eng']);
	});

	it('keeps constructor labels when a call passes none', async () => {
		const chat = new Chat({ ...OPTS, labels: { team: 'eng' } });
		mock.queue(chatResponse('ok'));
		await chat.send('hi', {});
		expect(mock.lastRequest().metadata).toEqual({ tags: ['team:eng'] });
	});

	it('turns on stream_options.include_usage when streaming', async () => {
		const chat = new Chat(OPTS);
		mock.queueStream(streamChunks(['a', 'b']));
		// eslint-disable-next-line no-empty
		for await (const _ of chat.stream('hi')) { }
		expect(mock.lastRequest().stream).toBe(true);
		expect(mock.lastRequest().stream_options).toEqual({ include_usage: true });
	});

	it('prepends the Anthropic web-search server tool on a claude model', async () => {
		const chat = new Chat({ ...OPTS, enableWebSearch: true, webSearchConfig: { max_uses: 2 } });
		mock.queue(chatResponse('ok'));
		await chat.send('hi');
		expect(mock.lastRequest().tools[0]).toMatchObject({ type: 'web_search_20250305', name: 'web_search', max_uses: 2 });
	});

	it('sends no web-search tool on a non-Claude model', async () => {
		const chat = new Chat({ ...OPTS, modelName: 'gemini-3.8-flash', enableGrounding: true });
		mock.queue(chatResponse('ok', { model: 'gemini-3.8-flash' }));
		await chat.send('hi');
		expect(mock.lastRequest().tools).toBeUndefined();
	});
});

describe('Message structured output', () => {
	const SCHEMA = {
		type: 'object', required: ['source'], additionalProperties: false,
		properties: { source: { type: 'string', enum: ['web', 'db'] } }
	};

	it('sends response_format.json_schema', async () => {
		const msg = new Message({ ...OPTS, responseSchema: SCHEMA });
		mock.queue(chatResponse(JSON.stringify({ source: 'web' })));
		const r = await msg.send('hi');

		expect(mock.lastRequest().response_format.type).toBe('json_schema');
		expect(mock.lastRequest().response_format.json_schema.schema).toEqual(SCHEMA);
		expect(r.data).toEqual({ source: 'web' });
	});

	it('sends the lightweight json_object mode for responseMimeType', async () => {
		const msg = new Message({ ...OPTS, responseMimeType: 'application/json' });
		mock.queue(chatResponse('{"a":1}'));
		const r = await msg.send('hi');
		expect(mock.lastRequest().response_format).toEqual({ type: 'json_object' });
		expect(r.data).toEqual({ a: 1 });
	});

	it('parses a fenced JSON reply — claude fences json_object output', async () => {
		const msg = new Message({ ...OPTS, responseFormat: 'json' });
		mock.queue(chatResponse('```json\n{"a":1}\n```'));
		const r = await msg.send('hi');
		expect(r.data).toEqual({ a: 1 });
	});

	it('retries a schema-invalid reply, then surfaces validationErrors', async () => {
		const msg = new Message({ ...OPTS, responseSchema: SCHEMA, validationRetries: 1 });
		mock.queue(chatResponse(JSON.stringify({ source: 'ftp' }), { promptTokens: 5, completionTokens: 7 }));
		mock.queue(chatResponse(JSON.stringify({ source: 'ftp' }), { promptTokens: 5, completionTokens: 7 }));

		const r = await msg.send('hi');
		expect(r.data).toBeNull();
		expect(r.validationErrors.length).toBeGreaterThan(0);
		expect(mock.requests.length).toBe(2);
		expect(r.usage.promptTokens).toBe(10);
		expect(r.usage.attempts).toBe(2);
	});

	it('recovers when the retry validates', async () => {
		const msg = new Message({ ...OPTS, responseSchema: SCHEMA, validationRetries: 2 });
		mock.queue(chatResponse(JSON.stringify({ source: 'ftp' })));
		mock.queue(chatResponse(JSON.stringify({ source: 'web' })));

		const r = await msg.send('hi');
		expect(r.data).toEqual({ source: 'web' });
		expect(r.validationErrors).toBeUndefined();
		expect(mock.requests.length).toBe(2);
	});

	it('validationMode warn keeps the parsed data alongside the errors', async () => {
		const msg = new Message({ ...OPTS, responseSchema: SCHEMA, validationRetries: 0, validationMode: 'warn' });
		mock.queue(chatResponse(JSON.stringify({ source: 'ftp' })));

		const r = await msg.send('hi');
		expect(r.data).toEqual({ source: 'ftp' });
		expect(r.validationErrors.length).toBeGreaterThan(0);
	});
});

describe('ToolAgent wire protocol', () => {
	const TOOLS = [{ name: 'lookup', description: 'look up', input_schema: { type: 'object', properties: { q: { type: 'string' } } } }];

	it('converts a Claude tool declaration to the OpenAI shape', async () => {
		const agent = new ToolAgent({ ...OPTS, tools: TOOLS, toolExecutor: async () => 'result' });
		mock.queue(chatResponse('done'));
		await agent.chat('hi');

		expect(mock.lastRequest().tools).toEqual([
			{ type: 'function', function: { name: 'lookup', description: 'look up', parameters: TOOLS[0].input_schema } }
		]);
	});

	it('returns exactly one tool message per tool_call, with the id echoed verbatim', async () => {
		const agent = new ToolAgent({ ...OPTS, tools: TOOLS, toolExecutor: async () => ({ ok: true }) });
		// Gemini hides a thought_signature inside the id — it must survive intact.
		const id = 'call_1902376__thought__AY89aQxx';
		mock.queue(chatResponse(null, { toolCalls: [toolCall('lookup', { q: 'x' }, id)] }));
		mock.queue(chatResponse('all done'));

		const r = await agent.chat('hi');
		expect(r.text).toBe('all done');

		const second = mock.requests[1];
		const assistantTurn = second.messages.find(m => m.role === 'assistant');
		expect(assistantTurn.tool_calls[0].id).toBe(id);

		const toolMessages = second.messages.filter(m => m.role === 'tool');
		expect(toolMessages).toHaveLength(1);
		expect(toolMessages[0].tool_call_id).toBe(id);
	});

	it('parses the arguments JSON string into an object for the executor', async () => {
		const seen = [];
		const agent = new ToolAgent({
			...OPTS, tools: TOOLS,
			toolExecutor: async (name, args) => { seen.push([name, args]); return 'ok'; }
		});
		mock.queue(chatResponse(null, { toolCalls: [toolCall('lookup', { q: 'hello' })] }));
		mock.queue(chatResponse('done'));

		await agent.chat('hi');
		expect(seen).toEqual([['lookup', { q: 'hello' }]]);
	});

	it('sends parallel_tool_calls: false only when asked', async () => {
		const off = new ToolAgent({ ...OPTS, tools: TOOLS, toolExecutor: async () => 1, disableParallelToolUse: true });
		mock.queue(chatResponse('done'));
		await off.chat('hi');
		expect(mock.lastRequest().parallel_tool_calls).toBe(false);

		const on = new ToolAgent({ ...OPTS, tools: TOOLS, toolExecutor: async () => 1 });
		mock.queue(chatResponse('done'));
		await on.chat('hi');
		expect(mock.lastRequest().parallel_tool_calls).toBeUndefined();
	});

	it('translates an Anthropic tool_choice', async () => {
		const agent = new ToolAgent({ ...OPTS, tools: TOOLS, toolExecutor: async () => 1, toolChoice: { type: 'any' } });
		mock.queue(chatResponse('done'));
		await agent.chat('hi');
		expect(mock.lastRequest().tool_choice).toBe('required');
	});

	it('refuses a tool with no parameter schema, naming it', () => {
		expect(() => new ToolAgent({ ...OPTS, tools: [{ name: 'broken' }], toolExecutor: async () => 1 }))
			.toThrow(/broken/);
	});

	it('requires tools and toolExecutor together', () => {
		expect(() => new ToolAgent({ ...OPTS, tools: TOOLS })).toThrow();
		expect(() => new ToolAgent({ ...OPTS, toolExecutor: async () => 1 })).toThrow();
	});
});

describe('RagAgent context injection', () => {
	it('seeds the documents as one multimodal user turn', async () => {
		const agent = new RagAgent({
			...OPTS,
			localData: [{ name: 'users', data: [{ id: 1 }] }]
		});
		mock.queue(chatResponse('answer'));
		const r = await agent.chat('who?');

		expect(r.text).toBe('answer');
		const req = mock.lastRequest();
		const first = req.messages.find(m => m.role === 'user');
		expect(Array.isArray(first.content)).toBe(true);
		expect(JSON.stringify(first.content)).toMatch(/--- Data: users ---/);
	});

	it('returns an empty citations array when enableCitations was requested', async () => {
		const agent = new RagAgent({ ...OPTS, enableCitations: true, localData: [{ name: 'd', data: 1 }] });
		mock.queue(chatResponse('answer'));
		const r = await agent.chat('q');
		expect(r.citations).toEqual([]);
		expect(agent.enableCitations).toBe(false);
	});

	it('omits citations entirely when it was not requested', async () => {
		const agent = new RagAgent({ ...OPTS, localData: [{ name: 'd', data: 1 }] });
		mock.queue(chatResponse('answer'));
		const r = await agent.chat('q');
		expect(r.citations).toBeUndefined();
	});
});

describe('Transformer', () => {
	it('sends the schema as response_format and returns parsed JSON', async () => {
		const t = new Transformer({ ...OPTS, responseSchema: { type: 'object', properties: { a: { type: 'number' } } } });
		mock.queue(chatResponse('{"a":1}'));
		const out = await t.send({ a: 0 });
		expect(out).toEqual({ a: 1 });
		expect(mock.lastRequest().response_format.type).toBe('json_schema');
	});

	it('seeds examples into history as prompt/answer pairs', async () => {
		const t = new Transformer({
			...OPTS,
			exampleData: [{ PROMPT: { in: 1 }, ANSWER: { out: 2 } }]
		});
		await t.seed();
		expect(t.exampleCount).toBe(2);
		expect(t.getHistory()[0].role).toBe('user');
		expect(t.getHistory()[1].role).toBe('assistant');
	});
});
