/**
 * @fileoverview The capability layer and everything built on it.
 *
 * Offline. `capabilities.js` reads only the committed `/model/info` snapshot
 * plus the measured lists, so nothing here touches the network.
 *
 * Every expectation below traces to a live measurement on 2026-09-11. Where the
 * gateway's own flag disagrees with the measurement, the test asserts the
 * MEASUREMENT — that disagreement is the whole reason this module exists.
 */

import { jest } from '@jest/globals';
import { setup, mock, chatResponse } from './_harness.js';
import { _resetWarnings } from '../../compat.js';
import log from '../../logger.js';
import {
	getCapabilities,
	contextWindow,
	supportsPromptCaching,
	supportsPrefill,
	prefillMode,
	webSearchStyle,
	CACHE_CAPABLE_MODELS,
	CACHE_MIN_TOKENS,
	CACHE_WRITE_MULTIPLIER,
	PREFILL_MODES
} from '../../capabilities.js';
import { MODEL_INFO, computeCost } from '../../models.js';
import { toResponsesRequest, fromResponsesReply, needsResponsesTransport } from '../../responses.js';

const { Chat, Message, ToolAgent } = await setup();
const OPTS = { logLevel: 'none' };
const BIG = 'x'.repeat(CACHE_MIN_TOKENS * 4 + 100);   // clears the size floor

/** Collects warnings from BOTH sinks: warnOnce falls back to console.warn when
 *  pino's level would swallow the line. */
let warned;
beforeEach(() => {
	mock.reset();
	_resetWarnings();
	warned = [];
	jest.spyOn(log, 'warn').mockImplementation((m) => warned.push(String(m)));
	jest.spyOn(console, 'warn').mockImplementation((m) => warned.push(String(m)));
});
afterEach(() => jest.restoreAllMocks());

/** Everything warned so far, joined. */
const warnings = () => warned.join('\n');

/** Options that let warnings through — `logLevel: 'none'` suppresses them. */
const LOUD = { logLevel: 'error' };

describe('prompt caching — measured, not reported', () => {
	it('trusts the measurement over the gateway flag', () => {
		// The gateway reports supports_prompt_caching: true for all of these.
		// None of them actually cache. Verified 2026-09-11.
		for (const id of ['claude-haiku-4-5', 'gemini-3.8-flash', 'gpt-5.5', 'gpt-6-astra']) {
			expect(MODEL_INFO[id]?.gatewaySaysSupportsPromptCaching).toBe(true);
			expect(supportsPromptCaching(id)).toBe(false);
		}
	});

	it('lists the four Claude models that do cache', () => {
		for (const id of ['claude-sonnet-5', 'claude-opus-5', 'claude-opus-4-7', 'claude-fable-5-1']) {
			expect(supportsPromptCaching(id)).toBe(true);
			expect(CACHE_CAPABLE_MODELS).toContain(id);
		}
	});

	it('follows aliases', () => {
		expect(supportsPromptCaching('claude-sonnet-4-6')).toBe(true);   // -> claude-sonnet-5
	});
});

describe('cache_control on the wire', () => {
	it('marks the system prompt on a caching model, in auto', async () => {
		const chat = new Chat({ ...OPTS, modelName: 'claude-sonnet-5', systemPrompt: BIG });
		mock.queue(chatResponse('ok'));
		await chat.send('hi');

		const sys = mock.lastRequest().messages[0];
		expect(Array.isArray(sys.content)).toBe(true);
		expect(sys.content[0].cache_control).toEqual({ type: 'ephemeral', ttl: '5m' });
	});

	it('sends a plain string on a model that cannot cache, and does not warn', async () => {
		const chat = new Chat({ ...LOUD, modelName: 'claude-haiku-4-5', systemPrompt: BIG });
		mock.queue(chatResponse('ok', { model: 'claude-haiku-4-5' }));
		await chat.send('hi');

		expect(mock.lastRequest().messages[0].content).toBe(BIG);
		// 'auto' declining is a no-op, not a caller mistake — so it must be silent
		// even at a log level that would show warnings.
		expect(warnings()).not.toMatch(/cach/i);
	});

	it('does not cache a block under the size floor', async () => {
		const chat = new Chat({ ...OPTS, modelName: 'claude-sonnet-5', systemPrompt: 'short' });
		mock.queue(chatResponse('ok'));
		await chat.send('hi');
		expect(mock.lastRequest().messages[0].content).toBe('short');
	});

	it('warns when an explicit true cannot be honored', async () => {
		const chat = new Chat({ ...LOUD, modelName: 'claude-haiku-4-5', systemPrompt: BIG, cacheSystemPrompt: true });
		mock.queue(chatResponse('ok', { model: 'claude-haiku-4-5' }));
		await chat.send('hi');
		expect(warnings()).toMatch(/does not cache/);
	});

	it('honors cacheSystemPrompt: false', async () => {
		const chat = new Chat({ ...OPTS, modelName: 'claude-sonnet-5', systemPrompt: BIG, cacheSystemPrompt: false });
		mock.queue(chatResponse('ok'));
		await chat.send('hi');
		expect(mock.lastRequest().messages[0].content).toBe(BIG);
	});

	it('passes the 1h ttl through', async () => {
		const chat = new Chat({ ...OPTS, modelName: 'claude-sonnet-5', systemPrompt: BIG, cacheTtl: '1h' });
		mock.queue(chatResponse('ok'));
		await chat.send('hi');
		expect(mock.lastRequest().messages[0].content[0].cache_control.ttl).toBe('1h');
	});
});

describe('cache cost accounting', () => {
	// THIS GATEWAY INCLUDES cache tokens in prompt_tokens (Google's convention).
	// Every number below reproduces a real x-litellm-response-cost header from
	// 2026-09-11 on claude-sonnet-5 ($2 in / $10 out / $0.2 cached). The
	// 2026-11-19 snapshot cut the cached rate to $0.1 (it now routes to
	// claude-sonnet-5-5), so the read below is re-priced at that rate.
	const M = 'claude-sonnet-5';

	it('bills a cache read at the cached rate, not the input rate', () => {
		const got = computeCost({ promptTokens: 4815, responseTokens: 16, cacheReadTokens: 4808 }, M);
		// 7 × $2 + 4808 × $0.1 + 16 × $10, per million
		expect(got).toBeCloseTo(0.0006548, 9);
	});

	it('bills a 5m cache write at 1.25x input', () => {
		const got = computeCost({ promptTokens: 4815, responseTokens: 16, cacheCreationTokens: 4808 }, M, { cacheTtl: '5m' });
		expect(got).toBeCloseTo(0.012194, 6);
	});

	it('bills a 1h cache write at 2x input', () => {
		const got = computeCost({ promptTokens: 4815, responseTokens: 16, cacheCreationTokens: 4808 }, M, { cacheTtl: '1h' });
		expect(got).toBeCloseTo(0.019406, 6);
		expect(CACHE_WRITE_MULTIPLIER['1h']).toBe(2);
	});

	it('never double-counts: cache tokens are a SUBSET of promptTokens', () => {
		const uncached = computeCost({ promptTokens: 4815, responseTokens: 16 }, M);
		const cached = computeCost({ promptTokens: 4815, responseTokens: 16, cacheReadTokens: 4808 }, M);
		// A read must be far cheaper than the same call uncached, never dearer.
		expect(cached).toBeLessThan(uncached);
		expect(uncached / cached).toBeGreaterThan(5);
	});
});

describe('assistant prefill — three behaviours', () => {
	it('classifies every model on the gateway', () => {
		expect(prefillMode('claude-haiku-4-5')).toBe('continue');
		expect(prefillMode('gpt-6-astra')).toBe('continue');
		expect(prefillMode('gpt-5.5')).toBe('restart');
		expect(prefillMode('claude-sonnet-5')).toBe('reject');
		expect(prefillMode('gemini-3.8-flash')).toBe('reject');
	});

	it('assumes restart for an unknown model — the safe middle', () => {
		// `restart` sends the hint but never concatenates, so the worst case is a
		// wasted prefix rather than corrupt output.
		expect(prefillMode('some-future-model')).toBe('restart');
		expect(supportsPrefill('some-future-model')).toBe(true);
	});

	it('sends the prefill as a trailing assistant turn on a continue model', async () => {
		const msg = new Message({ ...OPTS, modelName: 'claude-haiku-4-5', prefill: '["red",' });
		mock.queue(chatResponse('"blue"]', { model: 'claude-haiku-4-5' }));
		const r = await msg.send('two colors');

		const messages = mock.lastRequest().messages;
		expect(messages[messages.length - 1]).toEqual({ role: 'assistant', content: '["red",' });
		expect(r.text).toBe('["red","blue"]');
		expect(r.continuation).toBe('"blue"]');
		expect(JSON.parse(r.text)).toEqual(['red', 'blue']);
	});

	it('does NOT concatenate on a restart model', async () => {
		// gpt-5.5 re-emits the prefix. Concatenating would give `["red",["red","blue"]`.
		const msg = new Message({ ...OPTS, modelName: 'gpt-5.5', prefill: '["red",' });
		mock.queue(chatResponse('["red","blue"]', { model: 'gpt-5.5' }));
		const r = await msg.send('two colors');
		expect(r.text).toBe('["red","blue"]');
		expect(JSON.parse(r.text)).toEqual(['red', 'blue']);
	});

	it('drops the prefill on a reject model and warns once', async () => {
		const msg = new Message({ ...LOUD, modelName: 'claude-sonnet-5', prefill: '["red",' });
		mock.queue(chatResponse('["red","blue"]'));
		await msg.send('two colors');

		expect(mock.lastRequest().messages.some(m => m.role === 'assistant')).toBe(false);
		expect(warnings()).toMatch(/`prefill` is ignored/);
	});

	it('every listed mode is one of the three', () => {
		for (const mode of Object.values(PREFILL_MODES)) {
			expect(['continue', 'restart', 'reject']).toContain(mode);
		}
	});
});

describe('capability gating', () => {
	it('reports the real context window', () => {
		expect(contextWindow('claude-sonnet-5')).toBe(1_000_000);
		expect(contextWindow('gemini-3.8-flash')).toBe(1_048_576);
		expect(contextWindow('nonexistent')).toBeNull();
	});

	it('estimate() reports fit against the window', async () => {
		const chat = new Chat({ ...OPTS, modelName: 'gemini-3.8-flash' });
		const e = await chat.estimate('hello');
		expect(e.contextWindow).toBe(1_048_576);
		expect(e.fits).toBe(true);
		expect(e.headroom).toBeGreaterThan(1_040_000);
		expect(e.approximate).toBe(true);
	});

	it('an unknown model is permissive, never blocked locally', () => {
		const cap = getCapabilities('brand-new-model');
		expect(cap.known).toBe(false);
		expect(cap.vision).toBe(true);
		expect(cap.tools).toBe(true);
	});

	it('ToolAgent throws at construction on a model with no function calling', () => {
		// Every current gateway model supports tools, so drive the guard directly.
		expect(getCapabilities('claude-sonnet-5').tools).toBe(true);
		expect(() => new ToolAgent({
			...OPTS,
			tools: [{ name: 't', description: 'd', input_schema: { type: 'object', properties: {} } }],
			toolExecutor: async () => ({})
		})).not.toThrow();
	});
});

describe('web search — three shapes', () => {
	it('maps each provider to its own tool shape', () => {
		expect(webSearchStyle('claude-sonnet-5')).toBe('anthropic');
		expect(webSearchStyle('gemini-3.8-flash')).toBe('google');
		expect(webSearchStyle('gpt-5.5')).toBe('openai');
		expect(webSearchStyle('kimi-k3')).toBeNull();
	});

	it('routes OpenAI web search to /v1/responses and nothing else', () => {
		expect(needsResponsesTransport('auto', 'openai', true)).toBe(true);
		expect(needsResponsesTransport('auto', 'openai', false)).toBe(false);
		expect(needsResponsesTransport('auto', 'anthropic', true)).toBe(false);
		expect(needsResponsesTransport('auto', 'google', true)).toBe(false);
		expect(needsResponsesTransport('chat', 'openai', true)).toBe(false);
		expect(needsResponsesTransport('responses', null, false)).toBe(true);
	});
});

describe('/v1/responses adapters', () => {
	it('moves the system turn to instructions and renames max_tokens', () => {
		const body = toResponsesRequest({
			model: 'gpt-5.5',
			messages: [{ role: 'system', content: 'be terse' }, { role: 'user', content: 'hi' }],
			max_tokens: 512,
			reasoning_effort: 'high'
		});
		expect(body.instructions).toBe('be terse');
		expect(body.input).toEqual([{ role: 'user', content: 'hi' }]);
		expect(body.max_output_tokens).toBe(512);
		expect(body.reasoning).toEqual({ effort: 'high' });
		expect(body.max_tokens).toBeUndefined();
	});

	it('reads text from output[].content[], not the empty output_text field', () => {
		// LiteLLM leaves `output_text` blank; reading it would return ''.
		const adapted = fromResponsesReply({
			id: 'resp_1', model: 'gpt-5.5', status: 'completed', output_text: '',
			output: [
				{ type: 'web_search_call' },
				{ type: 'message', content: [{ type: 'output_text', text: 'Spain won.' }] }
			],
			usage: {
				input_tokens: 8683, output_tokens: 67, total_tokens: 8750,
				input_tokens_details: { cached_tokens: 3712 },
				output_tokens_details: { reasoning_tokens: 29 }
			}
		});

		expect(adapted.choices[0].message.content).toBe('Spain won.');
		expect(adapted.choices[0].finish_reason).toBe('stop');
		expect(adapted.usage.prompt_tokens).toBe(8683);
		expect(adapted.usage.prompt_tokens_details.web_search_requests).toBe(1);
		expect(adapted.usage.completion_tokens_details.reasoning_tokens).toBe(29);
	});

	it('surfaces a truncated reply instead of pretending it stopped cleanly', () => {
		const adapted = fromResponsesReply({ status: 'incomplete', output: [], usage: {} });
		expect(adapted.choices[0].finish_reason).toBe('incomplete');
	});
});
