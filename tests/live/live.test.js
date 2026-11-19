/**
 * @fileoverview Live suite — hits the real Mixpanel LiteLLM gateway.
 *
 * Gated behind LITELLM_LIVE=1. Without it every test is skipped, so a plain
 * `npm test` never spends money.
 *
 *   npm run test:live
 *
 * Budget: `claude-haiku-4-5` ($1 in / $5 out per 1M) with `maxTokens` capped at
 * 64–256 and prompts of a few dozen tokens. A full run is a few thousand tokens
 * total — well under one cent, against a $0.50 ceiling.
 *
 * The suite asserts the five gateway facts the design depends on, so a change
 * on the gateway side surfaces here rather than in a consumer's app.
 */

import { jest } from '@jest/globals';
import { Chat, Message, ToolAgent, Transformer, RagAgent, listModels } from '../../index.js';
import { CACHE_CAPABLE_MODELS, supportsPromptCaching, prefillMode } from '../../capabilities.js';

const LIVE = process.env.LITELLM_LIVE === '1';
const d = LIVE ? describe : describe.skip;

/** Cheap model, low caps. Do not raise these. */
const MODEL = 'claude-haiku-4-5';
const BASE = { modelName: MODEL, maxTokens: 128, logLevel: 'none' };

/** Total USD across the run, summed from the gateway's own cost header. */
let spend = 0;

/** @param {any} usage */
function bill(usage) {
	if (usage?.estimatedCost) spend += usage.estimatedCost;
}

afterAll(() => {
	if (LIVE) console.log(`\nlive suite spend: $${spend.toFixed(6)}\n`);
});

jest.setTimeout(120_000);

d('live: transport', () => {
	it('sends and receives a message', async () => {
		const msg = new Message(BASE);
		const r = await msg.send('Reply with the single word: pong');
		bill(r.usage);

		expect(r.text.toLowerCase()).toContain('pong');
		expect(r.usage.promptTokens).toBeGreaterThan(0);
		expect(r.usage.responseTokens).toBeGreaterThan(0);
		expect(r.usage.attempts).toBe(1);
	});

	it('health check finds the model', async () => {
		const chat = new Chat({ ...BASE, healthCheck: true });
		await expect(chat.init()).resolves.toBeUndefined();
	});

	it('rejects an unserved model with a clear message', async () => {
		const msg = new Message({ ...BASE, modelName: 'definitely-not-a-model' });
		await expect(msg.send('hi')).rejects.toThrow(/does not serve model|Invalid model/i);
	});
});

d('live: prompt caching (works since the 2026-09-11 key upgrade)', () => {
	// ~4.8k tokens: clears Anthropic's 1024-token minimum with room to spare.
	const BIG = 'Mixpanel is a product analytics platform used by engineering and product teams. '.repeat(200);

	it('a caching model writes then reads, and the read is far cheaper', async () => {
		const tag = ` [live-${Date.now()}]`;
		const mk = () => new Chat({
			modelName: 'claude-sonnet-5', maxTokens: 32, logLevel: 'none',
			systemPrompt: BIG + tag
		});

		const write = await mk().send('ok?');
		bill(write.usage);
		expect(write.usage.cacheCreationTokens).toBeGreaterThan(1000);

		await new Promise(r => setTimeout(r, 3000));
		const read = await mk().send('ok?');
		bill(read.usage);

		expect(read.usage.cacheReadTokens).toBeGreaterThan(1000);
		// Measured ~10x on 2026-09-11. Assert a conservative floor so a partial
		// regression still trips this.
		expect(read.usage.estimatedCost).toBeLessThan(write.usage.estimatedCost / 3);
	});

	it('claude-haiku-4-5 does NOT cache, whatever the gateway flag says', async () => {
		// This is why capabilities.js keeps a measured list instead of reading
		// `supports_prompt_caching`, which reports true here.
		expect(supportsPromptCaching('claude-haiku-4-5')).toBe(false);

		const tag = ` [live-haiku-${Date.now()}]`;
		const mk = () => new Chat({
			modelName: 'claude-haiku-4-5', maxTokens: 32, logLevel: 'none',
			systemPrompt: BIG + tag, cacheSystemPrompt: true
		});
		const a = await mk().send('ok?'); bill(a.usage);
		await new Promise(r => setTimeout(r, 2000));
		const b = await mk().send('ok?'); bill(b.usage);

		expect(a.usage.cacheCreationTokens).toBe(0);
		expect(b.usage.cacheReadTokens).toBe(0);
	});

	it('every model on the measured cache list is still served', async () => {
		const chat = new Chat(BASE);
		const served = new Set();
		for await (const m of chat.listModels()) served.add(m.id);
		expect(CACHE_CAPABLE_MODELS.filter(id => !served.has(id))).toEqual([]);
	});
});

d('live: web search — three providers, one option', () => {
	const Q = 'Who won the 2026 FIFA World Cup? One sentence.';

	it('Anthropic searches via the server tool', async () => {
		const chat = new Chat({ modelName: 'claude-sonnet-5', maxTokens: 1024, logLevel: 'none', enableWebSearch: true });
		const r = await chat.send(Q);
		bill(r.usage);
		expect(r.text.length).toBeGreaterThan(20);
	});

	it('Gemini searches via googleSearch and reports the search count', async () => {
		const chat = new Chat({ modelName: 'gemini-3.8-flash', maxTokens: 1024, logLevel: 'none', enableGrounding: true });
		const r = await chat.send(Q);
		bill(r.usage);
		expect(r.usage.webSearchRequests).toBeGreaterThan(0);
	});

	it('OpenAI searches over the /v1/responses transport', async () => {
		// `{ type: 'web_search' }` is a hard 400 on /v1/chat/completions, so this
		// only passes if the transport switch fired.
		const chat = new Chat({ modelName: 'gpt-5.5', maxTokens: 1024, logLevel: 'none', enableWebSearch: true });
		const r = await chat.send(Q);
		bill(r.usage);
		expect(r.text.length).toBeGreaterThan(20);
		expect(r.usage.promptTokens).toBeGreaterThan(0);
	});
});

d('live: assistant prefill', () => {
	const ASK = 'List exactly two primary colors as a JSON array of strings. JSON only.';

	it('a continue model resumes from the prefix and the result parses', async () => {
		expect(prefillMode('claude-haiku-4-5')).toBe('continue');
		const msg = new Message({ modelName: 'claude-haiku-4-5', maxTokens: 2048, logLevel: 'none', prefill: '["red",' });
		const r = await msg.send(ASK);
		bill(r.usage);
		expect(() => JSON.parse(r.text)).not.toThrow();
		expect(JSON.parse(r.text)[0]).toBe('red');
	});

	it('a reject model drops the prefill and still answers', async () => {
		expect(prefillMode('claude-sonnet-5')).toBe('reject');
		const msg = new Message({ modelName: 'claude-sonnet-5', maxTokens: 2048, logLevel: 'none', prefill: '["red",' });
		const r = await msg.send(ASK);
		bill(r.usage);
		expect(r.text.length).toBeGreaterThan(0);
	});
});

d('live: the cost header', () => {
	it('a non-streaming call reports gateway-authoritative cost', async () => {
		const msg = new Message(BASE);
		const r = await msg.send('Say: ok');
		bill(r.usage);

		expect(r.usage.costSource).toBe('gateway');
		expect(r.usage.estimatedCost).toBeGreaterThan(0);
		expect(r.usage.callId).toBeTruthy();
	});

	it('a streamed call falls back to the pricing table', async () => {
		const chat = new Chat(BASE);
		let done = null;
		for await (const ev of chat.stream('Count to three.')) if (ev.type === 'done') done = ev;
		bill(done.usage);

		// Fact 2: the gateway omits x-litellm-response-cost on streams.
		expect(done.usage.costSource).toBe('estimated');
		expect(done.usage.promptTokens).toBeGreaterThan(0);
		expect(done.usage.responseTokens).toBeGreaterThan(0);
		expect(done.fullText.length).toBeGreaterThan(0);
	});
});

d('live: gateway fact 3 — parameter gating', () => {
	it('the Claude 5 family accepts a request with no sampling params', async () => {
		// Would 400 with litellm.UnsupportedParamsError if the gate regressed.
		const msg = new Message({ modelName: 'claude-sonnet-5', maxTokens: 32, logLevel: 'none', temperature: 0.7, topP: 0.9, topK: 10 });
		const r = await msg.send('Say: ok');
		bill(r.usage);
		expect(r.text.length).toBeGreaterThan(0);
	});

	it('claude-haiku-4-5 completes with explicit sampling params (gated out since 2026-11-19)', async () => {
		// claude-haiku-4-5 now routes to claude-haiku-5-5, which rejects all three.
		const msg = new Message({ ...BASE, temperature: 0.2, topP: 0.9 });
		const r = await msg.send('Say: ok');
		bill(r.usage);
		expect(r.text.length).toBeGreaterThan(0);
	});

	it('gemini-3.8-flash completes a default Chat and Transformer call (0.2.1)', async () => {
		// Since 2026-11-19 the gateway 400s temperature / top_p on this model.
		const opts = { modelName: 'gemini-3.8-flash', maxTokens: 256, logLevel: 'none' };
		const chat = new Chat(opts);
		const c = await chat.send('Say: ok');
		bill(c.usage);
		expect(c.text.length).toBeGreaterThan(0);

		const t = new Transformer(opts);
		const r = await t.send({ n: 2 });
		bill(t.getLastUsage());
		expect(r).toEqual(expect.any(Object));
	});

	it('reasoning_effort is accepted', async () => {
		// max_tokens must exceed the reasoning budget the gateway derives from
		// `effort` — Anthropic reserves the budget out of max_tokens.
		const msg = new Message({ ...BASE, maxTokens: 2048, effort: 'low' });
		const r = await msg.send('Say: ok');
		bill(r.usage);
		expect(r.text.length).toBeGreaterThan(0);
	});

	it('explains a max_tokens / reasoning-budget clash instead of leaking a raw 400', async () => {
		const msg = new Message({ ...BASE, maxTokens: 64, effort: 'high' });
		await expect(msg.send('Say: ok')).rejects.toThrow(/`maxTokens` is too small for the reasoning budget/);
	});
});

d('live: gateway fact 5 — tool-call ids round-trip', () => {
	const TOOLS = [{
		name: 'get_weather',
		description: 'Get the current temperature for a city.',
		input_schema: {
			type: 'object',
			properties: { city: { type: 'string' } },
			required: ['city']
		}
	}];

	it('completes a tool round-trip', async () => {
		const agent = new ToolAgent({
			...BASE, maxTokens: 256, tools: TOOLS,
			toolExecutor: async (name, args) => {
				expect(name).toBe('get_weather');
				expect(typeof args.city).toBe('string');
				return { temperatureC: 21 };
			}
		});

		const r = await agent.chat('What is the temperature in Paris? Use the tool.');
		bill(r.usage);

		expect(r.toolCalls.length).toBeGreaterThanOrEqual(1);
		expect(r.text).toMatch(/21/);
		// attempts means round-trips: at least one call round plus the answer.
		expect(r.usage.attempts).toBeGreaterThanOrEqual(2);
	});

	it('streams a tool round-trip', async () => {
		const agent = new ToolAgent({
			...BASE, maxTokens: 256, tools: TOOLS,
			toolExecutor: async () => ({ temperatureC: 30 })
		});

		const types = [];
		let done = null;
		for await (const ev of agent.stream('Temperature in Cairo? Use the tool.')) {
			types.push(ev.type);
			if (ev.type === 'done') done = ev;
		}
		bill(done.usage);

		expect(types).toContain('tool_call');
		expect(types).toContain('tool_result');
		expect(done.usage.attempts).toBeGreaterThanOrEqual(2);
	});
});

d('live: structured output', () => {
	const SCHEMA = {
		type: 'object',
		required: ['city', 'country'],
		additionalProperties: false,
		properties: { city: { type: 'string' }, country: { type: 'string' } }
	};

	it('Message honours response_format.json_schema', async () => {
		const msg = new Message({ ...BASE, responseSchema: SCHEMA });
		const r = await msg.send('The Eiffel Tower. Return its city and country.');
		bill(r.usage);

		expect(r.validationErrors).toBeUndefined();
		expect(r.data.city.toLowerCase()).toContain('paris');
	});

	it('Transformer round-trips a JSON payload', async () => {
		const t = new Transformer({
			...BASE,
			systemPrompt: 'Convert the input to uppercase. Return the same JSON shape.',
			exampleData: [{ PROMPT: { text: 'hello' }, ANSWER: { text: 'HELLO' } }]
		});
		const out = await t.send({ text: 'goodbye' });
		bill(t.getLastUsage());

		expect(out.text).toBe('GOODBYE');
	});
});

d('live: RagAgent', () => {
	it('answers from injected data', async () => {
		const agent = new RagAgent({
			...BASE,
			localData: [{ name: 'inventory', data: { widgets: 42, gadgets: 7 } }]
		});
		const r = await agent.chat('How many widgets are in the inventory? Answer with the number only.');
		bill(r.usage);

		expect(r.text).toMatch(/42/);
	});
});

d('live: model table', () => {
	it('every model in the generated table is still served', async () => {
		const chat = new Chat(BASE);
		const served = new Set();
		for await (const m of chat.listModels()) served.add(m.id);

		const missing = listModels({ includeIntegration: true }).filter(id => !served.has(id));
		// A miss means the gateway changed — regenerate with `npm run refresh-pricing`.
		expect(missing).toEqual([]);
	});

	it('stays under the $0.50 budget', () => {
		expect(spend).toBeLessThan(0.5);
	});
});
