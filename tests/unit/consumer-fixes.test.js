/**
 * @fileoverview Port of `ak-claude/tests/consumer-fixes.test.js` and
 * `ak-gemini/tests/consumer-fixes.test.js` — the regressions from the 2026-07
 * consumer-review round and the 2026-08-24 defect sweep, re-expressed against
 * the gateway.
 *
 * These are the behaviours the two sibling packages shipped bugs for. They are
 * honoured here from day one, so the tests exist from day one.
 *
 * Fully offline: the `openai` SDK is mocked in `_harness.js`.
 */

import { jest } from '@jest/globals';
import {
	setup, mock, chatResponse, toolCall, streamChunks, streamToolCallChunks
} from './_harness.js';
import { _resetWarnings } from '../../compat.js';
import log from '../../logger.js';

const { Chat, Message, ToolAgent, Transformer, validateSchema } = await setup();

const OPTS = { logLevel: 'none' };

beforeEach(() => {
	mock.reset();
	_resetWarnings();
	jest.spyOn(log, 'warn').mockImplementation(() => {});
	jest.spyOn(log, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// #4 — concurrency-safe per-call usage
// ─────────────────────────────────────────────────────────────────────────────

describe('#4 concurrent sends carry their own usage', () => {
	it('does not cross-talk usage between concurrent Message sends', async () => {
		const msg = new Message(OPTS);
		mock.queue(chatResponse('a', { promptTokens: 10, completionTokens: 20 }));
		mock.queue(chatResponse('b', { promptTokens: 20, completionTokens: 40 }));
		mock.queue(chatResponse('c', { promptTokens: 30, completionTokens: 60 }));

		const [ra, rb, rc] = await Promise.all([msg.send('A'), msg.send('B'), msg.send('C')]);
		const totals = [ra, rb, rc].map(r => r.usage.totalTokens).sort((x, y) => x - y);
		expect(totals).toEqual([30, 60, 90]);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// #5 — estimatedCost, plus the gateway's own cost header
// ─────────────────────────────────────────────────────────────────────────────

describe('#5 cost in usage', () => {
	it('prefers the gateway header over the pricing table', async () => {
		const msg = new Message(OPTS);
		mock.queue(chatResponse('r', { promptTokens: 1_000_000, completionTokens: 1_000_000 }), {
			'x-litellm-response-cost': '0.4242',
			'x-litellm-call-id': 'abc-123',
			'x-litellm-model-name': 'vertex_ai/claude-sonnet-5',
			'x-litellm-key-spend': '17.5'
		});

		const r = await msg.send('hi');
		expect(r.usage.estimatedCost).toBeCloseTo(0.4242, 6);
		expect(r.usage.costSource).toBe('gateway');
		expect(r.usage.callId).toBe('abc-123');
		expect(r.usage.upstreamModel).toBe('vertex_ai/claude-sonnet-5');
		expect(r.usage.keySpend).toBeCloseTo(17.5, 6);
	});

	it('falls back to the pricing table when the header is absent', async () => {
		const msg = new Message(OPTS);
		mock.queue(chatResponse('r', { promptTokens: 1_000_000, completionTokens: 1_000_000 }));

		const r = await msg.send('hi');
		// claude-sonnet-5: $2 in / $10 out per 1M
		expect(r.usage.estimatedCost).toBeCloseTo(12, 6);
		expect(r.usage.costSource).toBe('estimated');
	});

	it('reports null cost — not zero — when the model is unpriced', async () => {
		const msg = new Message({ ...OPTS, modelName: 'claude-sonnet-5' });
		mock.queue(chatResponse('r', { promptTokens: 10, completionTokens: 10, model: 'mystery-model' }));
		// modelVersion is unknown, but requestedModel is priced, so this resolves.
		const priced = await msg.send('hi');
		expect(priced.usage.estimatedCost).not.toBeNull();

		const orphan = new Message({ ...OPTS });
		orphan.modelName = 'mystery-model';
		mock.queue(chatResponse('r', { promptTokens: 10, completionTokens: 10, model: 'mystery-model' }));
		const r = await orphan.send('hi');
		expect(r.usage.estimatedCost).toBeNull();
		expect(r.usage.costSource).toBeNull();
	});

	it('a mixed turn falls back to the table wholesale rather than adding two incomparable numbers', async () => {
		const agent = new ToolAgent({
			...OPTS,
			tools: [{ name: 't', input_schema: { type: 'object', properties: {} } }],
			toolExecutor: async () => 'ok'
		});
		// Round 1 reports a cost; round 2 does not.
		mock.queue(chatResponse(null, { toolCalls: [toolCall('t', {})] }), { 'x-litellm-response-cost': '0.01' });
		mock.queue(chatResponse('done', { promptTokens: 1_000_000, completionTokens: 0 }));

		const r = await agent.chat('hi');
		expect(r.usage.costSource).toBe('estimated');
		expect(r.usage.estimatedCost).not.toBeCloseTo(0.01, 6);
	});

	it('bills reasoning tokens at the output rate', async () => {
		const msg = new Message(OPTS);
		mock.queue(chatResponse('r', { promptTokens: 0, completionTokens: 0, reasoningTokens: 1_000_000 }));
		const r = await msg.send('hi');
		expect(r.usage.thoughtsTokens).toBe(1_000_000);
		expect(r.usage.estimatedCost).toBeCloseTo(10, 6);
	});

	it('always reports zero cache tokens — prompt caching does not engage here', async () => {
		const msg = new Message({ ...OPTS, cacheSystemPrompt: true });
		mock.queue(chatResponse('r'));
		const r = await msg.send('hi');
		expect(r.usage.cacheCreationTokens).toBe(0);
		expect(r.usage.cacheReadTokens).toBe(0);
		expect(r.usage.cachedTokens).toBe(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// validateSchema()
// ─────────────────────────────────────────────────────────────────────────────

describe('validateSchema()', () => {
	const SCHEMA = {
		type: 'object',
		required: ['source', 'n'],
		additionalProperties: false,
		properties: {
			source: { type: 'string', enum: ['web', 'db'] },
			n: { type: 'number' },
			tags: { type: 'array', items: { type: 'string' } }
		}
	};

	it('passes valid data', () => {
		expect(validateSchema({ source: 'web', n: 1, tags: ['a'] }, SCHEMA)).toEqual([]);
	});

	it('flags enum, required, extra, type and array-item violations', () => {
		expect(validateSchema({ source: 'ftp', n: 1 }, SCHEMA).join()).toMatch(/enum/i);
		expect(validateSchema({ n: 1 }, SCHEMA).join()).toMatch(/source/);
		expect(validateSchema({ source: 'web', n: 1, extra: true }, SCHEMA).join()).toMatch(/extra/);
		expect(validateSchema({ source: 'web', n: 'x' }, SCHEMA).join()).toMatch(/number/);
		expect(validateSchema({ source: 'web', n: 1, tags: [1] }, SCHEMA).join()).toMatch(/string/);
	});

	it('does not trip over prototype keys', () => {
		expect(validateSchema({ source: 'web', n: 1 }, { type: 'object', properties: { toString: { type: 'string' } } }))
			.toEqual([]);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 0.3.0 defect sweep — usage accounting
// ─────────────────────────────────────────────────────────────────────────────

describe('0.3.0 defect sweep: usage accounting', () => {
	it('Chat.stream reports this call\'s usage, not the previous send\'s', async () => {
		const chat = new Chat(OPTS);

		mock.queue(chatResponse('first', { promptTokens: 999, completionTokens: 999 }));
		await chat.send('one');

		mock.queueStream(streamChunks(['a', 'b'], { promptTokens: 11, completionTokens: 3 }));
		let done = null;
		for await (const ev of chat.stream('two')) if (ev.type === 'done') done = ev;

		expect(done.fullText).toBe('ab');
		expect(done.usage.promptTokens).toBe(11);
		expect(done.usage.responseTokens).toBe(3);
		expect(done.usage.attempts).toBe(1);
	});

	it('a stream reports estimated cost — the gateway omits the header on streams', async () => {
		const chat = new Chat(OPTS);
		mock.queueStream(streamChunks(['x'], { promptTokens: 1_000_000, completionTokens: 0 }));
		let done = null;
		for await (const ev of chat.stream('hi')) if (ev.type === 'done') done = ev;

		expect(done.usage.costSource).toBe('estimated');
		expect(done.usage.estimatedCost).toBeCloseTo(2, 6);
	});

	it('ToolAgent.chat sums tokens across every round; attempts means round-trips', async () => {
		const agent = new ToolAgent({
			...OPTS,
			tools: [{ name: 't', input_schema: { type: 'object', properties: {} } }],
			toolExecutor: async () => 'ok'
		});
		mock.queue(chatResponse(null, { promptTokens: 10, completionTokens: 5, toolCalls: [toolCall('t', {})] }));
		mock.queue(chatResponse(null, { promptTokens: 20, completionTokens: 5, toolCalls: [toolCall('t', {}, 'toolu_2')] }));
		mock.queue(chatResponse('finished', { promptTokens: 30, completionTokens: 7 }));

		const r = await agent.chat('hi');
		expect(r.text).toBe('finished');
		expect(r.usage.promptTokens).toBe(60);
		expect(r.usage.responseTokens).toBe(17);
		expect(r.usage.attempts).toBe(3);
		expect(r.toolCalls).toHaveLength(2);
	});

	it('ToolAgent.stream sums tokens across every round too', async () => {
		const agent = new ToolAgent({
			...OPTS,
			tools: [{ name: 't', input_schema: { type: 'object', properties: {} } }],
			toolExecutor: async () => 'ok'
		});
		mock.queueStream(streamToolCallChunks('t', { q: 1 }, { promptTokens: 10, completionTokens: 5 }));
		mock.queueStream(streamChunks(['done'], { promptTokens: 20, completionTokens: 4 }));

		let done = null;
		const events = [];
		for await (const ev of agent.stream('hi')) {
			events.push(ev.type);
			if (ev.type === 'done') done = ev;
		}

		expect(events).toContain('tool_call');
		expect(events).toContain('tool_result');
		expect(done.usage.promptTokens).toBe(30);
		expect(done.usage.attempts).toBe(2);
	});

	it('a streamed tool call reassembles its name and split arguments', async () => {
		const seen = [];
		const agent = new ToolAgent({
			...OPTS,
			tools: [{ name: 'lookup', input_schema: { type: 'object', properties: { q: { type: 'string' } } } }],
			toolExecutor: async (name, args) => { seen.push([name, args]); return 'ok'; }
		});
		mock.queueStream(streamToolCallChunks('lookup', { q: 'a longer argument value' }));
		mock.queueStream(streamChunks(['done']));

		// eslint-disable-next-line no-empty
		for await (const _ of agent.stream('hi')) { }
		expect(seen).toEqual([['lookup', { q: 'a longer argument value' }]]);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 0.3.0 defect sweep — Transformer retry-class discrimination
// ─────────────────────────────────────────────────────────────────────────────

describe('0.3.0 defect sweep: Transformer', () => {
	const FAST = { ...OPTS, retryDelay: 1 };

	it('retries an unparseable response with a format nudge, not rebuild()', async () => {
		const t = new Transformer({ ...FAST, maxRetries: 1 });
		mock.queue(chatResponse('I am afraid I cannot do that.'));
		mock.queue(chatResponse('{"ok":true}'));

		const out = await t.send({ a: 1 });
		expect(out).toEqual({ ok: true });

		const retryPrompt = mock.requests[1].messages.at(-1).content;
		expect(retryPrompt).toMatch(/could not be parsed as JSON/);
		expect(retryPrompt).not.toMatch(/BAD PAYLOAD/);
	});

	it('still rebuilds the model output on a validation failure', async () => {
		let calls = 0;
		const t = new Transformer({
			...FAST, maxRetries: 1,
			asyncValidator: async (p) => { calls++; if (p.n !== 2) throw new Error('n must be 2'); }
		});
		mock.queue(chatResponse('{"n":1}'));
		mock.queue(chatResponse('{"n":2}'));

		const out = await t.send({ n: 0 });
		expect(out).toEqual({ n: 2 });
		expect(calls).toBe(2);

		const retryPrompt = mock.requests[1].messages.at(-1).content;
		expect(retryPrompt).toMatch(/BAD PAYLOAD/);
		// It repairs the MODEL's output, not the caller's input.
		expect(retryPrompt).toMatch(/"n": 1/);
		expect(retryPrompt).toMatch(/n must be 2/);
	});

	it('rebuild() unwraps the data envelope exactly like rawSend()', async () => {
		const t = new Transformer(FAST);
		mock.queue(chatResponse('{"data":{"n":7}}'));
		expect(await t.rawSend({ n: 0 })).toEqual({ n: 7 });

		mock.queue(chatResponse('{"data":{"n":8}}'));
		expect(await t.rebuild({ n: 7 }, 'wrong')).toEqual({ n: 8 });
	});

	it('accumulates usage across every retry round-trip', async () => {
		const t = new Transformer({ ...FAST, maxRetries: 1 });
		mock.queue(chatResponse('not json', { promptTokens: 5, completionTokens: 5 }));
		mock.queue(chatResponse('{"ok":true}', { promptTokens: 7, completionTokens: 3 }));

		await t.send({ a: 1 });
		const usage = t.getLastUsage();
		expect(usage.promptTokens).toBe(12);
		expect(usage.responseTokens).toBe(8);
		expect(usage.attempts).toBe(2);
	});

	it('throws after the last attempt rather than returning bad data', async () => {
		const t = new Transformer({ ...FAST, maxRetries: 1 });
		mock.queue(chatResponse('nope'));
		mock.queue(chatResponse('still nope'));
		await expect(t.send({ a: 1 })).rejects.toThrow(/Transformation failed after 2 attempts/);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 0.3.0 defect sweep — stop() must not send a partial tool-result set
// ─────────────────────────────────────────────────────────────────────────────

describe('0.3.0 defect sweep: stop() mid-round', () => {
	it('ToolAgent.stream stops before sending an incomplete tool-response set', async () => {
		const agent = new ToolAgent({
			...OPTS,
			tools: [{ name: 't', input_schema: { type: 'object', properties: {} } }],
			toolExecutor: async () => 'ok',
			parallelToolCalls: false
		});
		mock.queueStream(streamToolCallChunks('t', {}));
		// No second stream is queued: if the agent sends another round, the mock
		// throws and this test fails loudly.

		let done = null;
		for await (const ev of agent.stream('hi')) {
			if (ev.type === 'tool_result') agent.stop();
			if (ev.type === 'done') done = ev;
		}

		expect(done.warning).toBe('Agent was stopped');
		expect(mock.requests).toHaveLength(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Drop-in surface
// ─────────────────────────────────────────────────────────────────────────────

describe('drop-in surface', () => {
	it('exports the ak-claude and ak-gemini base-class names', async () => {
		const pkg = await setup();
		expect(pkg.BaseLiteLLM).toBeDefined();
		expect(pkg.BaseClaude).toBe(pkg.BaseLiteLLM);
		expect(pkg.BaseGemini).toBe(pkg.BaseLiteLLM);
	});

	it('imports the unsupported classes but throws on construction, naming the alternative', async () => {
		const pkg = await setup();
		for (const name of ['Embedding', 'ImageGenerator', 'AgentQuery']) {
			expect(pkg[name]).toBeDefined();
			expect(() => new pkg[name]({})).toThrow(new RegExp(name));
		}
	});

	it('reproduces ak-gemini\'s re-exported enums', async () => {
		const pkg = await setup();
		expect(pkg.ThinkingLevel.HIGH).toBe('HIGH');
		expect(pkg.HarmCategory.HARM_CATEGORY_HARASSMENT).toBe('HARM_CATEGORY_HARASSMENT');
		expect(pkg.HarmBlockThreshold.BLOCK_NONE).toBe('BLOCK_NONE');
	});

	it('getHistory / clearHistory / seed behave as the siblings do', async () => {
		const chat = new Chat(OPTS);
		mock.queue(chatResponse('hello'));
		await chat.send('hi');
		expect(chat.getHistory()).toHaveLength(2);

		await chat.clearHistory();
		expect(chat.getHistory()).toHaveLength(0);
	});

	it('estimate() is explicit about being a heuristic', async () => {
		const chat = new Chat(OPTS);
		const e = await chat.estimate('x'.repeat(400));
		expect(e.approximate).toBe(true);
		expect(e.inputTokens).toBeGreaterThan(0);
	});
});
