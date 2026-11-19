/**
 * @fileoverview Unit tests for the drop-in compatibility layer.
 *
 * Pure — `compat.js` and `models.js` import no transport, so nothing here can
 * reach the network. Every claim about what the gateway accepts traces back to
 * the live probe run of 2026-09-08 recorded in compat.js.
 */

import { jest } from '@jest/globals';
import log from '../../logger.js';
import {
	_resetWarnings,
	warnOnce,
	normalizeOptions,
	normalizeEffort,
	effortToReasoningEffort,
	normalizeToolDeclarations,
	normalizeToolChoice,
	buildWebSearchTool,
	labelsToMetadata,
	samplingSupport,
	supportsTopK,
	supportsWebSearch,
	modelProvider,
	unsupportedSamplingParams,
	recordSamplingRejection,
	_resetSamplingRejections
} from '../../compat.js';
import { EFFORT_LEVELS, budgetTokensToEffort, MODEL_INFO } from '../../models.js';

/** @type {any} */
let warnSpy;

beforeEach(() => {
	_resetWarnings();
	warnSpy = jest.spyOn(log, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	warnSpy.mockRestore();
});

describe('warn-once registry (§6.3)', () => {
	it('emits a key once per process, never throws', () => {
		expect(warnOnce('k', 'first')).toBe(true);
		expect(warnOnce('k', 'second')).toBe(false);
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	it('registers the key but stays quiet when silent', () => {
		expect(warnOnce('k', 'msg', true)).toBe(false);
		expect(warnSpy).not.toHaveBeenCalled();
		// Still recorded, so a later non-silent instance does not re-warn.
		expect(warnOnce('k', 'msg', false)).toBe(false);
	});

	it('AK_LITELLM_SILENCE_COMPAT=1 suppresses the output', () => {
		const prev = process.env.AK_LITELLM_SILENCE_COMPAT;
		process.env.AK_LITELLM_SILENCE_COMPAT = '1';
		expect(warnOnce('k', 'msg')).toBe(false);
		expect(warnSpy).not.toHaveBeenCalled();
		process.env.AK_LITELLM_SILENCE_COMPAT = prev ?? '';
	});

	it('still reaches the user when the logger level is above warn', () => {
		// `logLevel: 'error'` is not one of the two documented suppressors, so a
		// compat warning must not disappear behind pino's level filter.
		const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
		const prevLevel = log.level;
		log.level = 'error';
		try {
			expect(warnOnce('k', 'msg')).toBe(true);
			expect(warnSpy).not.toHaveBeenCalled();
			expect(consoleSpy).toHaveBeenCalledWith('msg');
		} finally {
			log.level = prevLevel;
			consoleSpy.mockRestore();
		}
	});
});

describe('§6.1 synonyms — ak-gemini and ak-gpt names', () => {
	it('maps every alias onto its canonical option', () => {
		const o = normalizeOptions({
			maxOutputTokens: 4096,
			reasoningEffort: 'high',
			enableGrounding: true,
			groundingConfig: { max_uses: 3 },
			resourceExhaustedRetries: 7,
			resourceExhaustedDelay: 250
		});
		expect(o).toMatchObject({
			maxTokens: 4096,
			effort: 'high',
			enableWebSearch: true,
			webSearchConfig: { max_uses: 3 },
			maxRetries: 7,
			retryDelay: 250
		});
		for (const alias of ['maxOutputTokens', 'reasoningEffort', 'enableGrounding', 'groundingConfig', 'resourceExhaustedRetries', 'resourceExhaustedDelay']) {
			expect(o[alias]).toBeUndefined();
		}
	});

	it('canonical wins when both are given, and says so once', () => {
		const o = normalizeOptions({ maxTokens: 100, maxOutputTokens: 999 });
		expect(o.maxTokens).toBe(100);
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});
});

describe('§6.3 accepted-and-ignored options', () => {
	it('drops each one with a warning and never throws', () => {
		const o = normalizeOptions({
			vertexai: true,
			vertexProjectId: 'p',
			project: 'p',
			location: 'us',
			safetySettings: [{ category: 'X', threshold: 'BLOCK_NONE' }],
			cachedContent: 'caches/1',
			adaptiveThinking: true,
			enableCitations: true,
			modelName: 'claude-haiku-4-5'
		});
		for (const k of ['vertexai', 'vertexProjectId', 'project', 'location', 'safetySettings', 'cachedContent', 'adaptiveThinking', 'enableCitations']) {
			expect(o[k]).toBeUndefined();
		}
		expect(warnSpy.mock.calls.length).toBeGreaterThanOrEqual(8);
	});

	it('logLevel: none suppresses every compat warning', () => {
		normalizeOptions({ vertexai: true, safetySettings: [], logLevel: 'none' });
		expect(warnSpy).not.toHaveBeenCalled();
	});
});

describe('prompt caching options', () => {
	// Caching became real on 2026-09-11 when the gateway key was upgraded.
	// Before that these two options were accepted-and-warned. They are now live,
	// so passing them must NOT warn.
	it('defaults every cache switch to auto and the ttl to 5m', () => {
		const o = normalizeOptions({});
		expect(o.cacheSystemPrompt).toBe('auto');
		expect(o.cacheContext).toBe('auto');
		expect(o.cacheExamples).toBe('auto');
		expect(o.cacheTtl).toBe('5m');
	});

	it('keeps cacheSystemPrompt and cacheTtl instead of dropping them', () => {
		const o = normalizeOptions({ cacheSystemPrompt: true, cacheTtl: '1h' });
		expect(o.cacheSystemPrompt).toBe(true);
		expect(o.cacheTtl).toBe('1h');
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it('coerces a truthy cacheSystemPrompt to a real boolean', () => {
		expect(normalizeOptions({ cacheSystemPrompt: 1 }).cacheSystemPrompt).toBe(true);
		expect(normalizeOptions({ cacheSystemPrompt: 0 }).cacheSystemPrompt).toBe(false);
	});

	it('throws on a ttl Anthropic does not accept', () => {
		// Only '5m' and '1h' exist. Silently coercing would overcharge 2x or
		// silently disable the cache, so this is one of the few hard throws.
		expect(() => normalizeOptions({ cacheTtl: '10m' })).toThrow(/must be '5m' or '1h'/);
	});
});

describe('effort — the union vocabulary', () => {
	it('accepts both packages\' levels', () => {
		expect([...EFFORT_LEVELS]).toEqual(['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
		for (const level of EFFORT_LEVELS) expect(normalizeEffort(level)).toBe(level);
	});

	it('throws on an unknown level, like both siblings', () => {
		expect(() => normalizeEffort('turbo')).toThrow(/invalid effort 'turbo'/);
		expect(() => normalizeOptions({ effort: 'turbo' })).toThrow(/invalid effort/);
	});

	it('collapses six levels onto the gateway\'s three', () => {
		expect(effortToReasoningEffort('minimal')).toBe('low');
		expect(effortToReasoningEffort('low')).toBe('low');
		expect(effortToReasoningEffort('medium')).toBe('medium');
		expect(effortToReasoningEffort('high')).toBe('high');
		expect(effortToReasoningEffort('xhigh')).toBe('high');
		expect(effortToReasoningEffort('max')).toBe('high');
		expect(effortToReasoningEffort(null)).toBeNull();
		expect(effortToReasoningEffort(undefined)).toBeNull();
	});

	it('translates ak-claude thinking shapes', () => {
		expect(normalizeOptions({ thinking: { type: 'adaptive' } }).effort).toBe('medium');
		expect(normalizeOptions({ thinking: { type: 'enabled', budget_tokens: 32000 } }).effort)
			.toBe(budgetTokensToEffort(32000));
		expect(normalizeOptions({ thinking: { type: 'adaptive' } }).thinking).toBeUndefined();
	});

	it('translates ak-gemini thinkingConfig shapes', () => {
		expect(normalizeOptions({ thinkingConfig: { thinkingLevel: 'HIGH' } }).effort).toBe('high');
		expect(normalizeOptions({ thinkingConfig: { thinkingBudget: 1024 } }).effort)
			.toBe(budgetTokensToEffort(1024));
		expect(normalizeOptions({ thinkingConfig: { thinkingLevel: 'LOW' } }).thinkingConfig).toBeUndefined();
	});

	it('an explicit effort beats a translated thinking shape', () => {
		expect(normalizeOptions({ effort: 'low', thinking: { type: 'adaptive' } }).effort).toBe('low');
	});
});

describe('§6.5 sampling-parameter gating (gateway list AND measured rules, 2026-11-19)', () => {
	const NONE = { temperature: false, topP: false, topK: false, exclusiveTempTopP: false };
	const ALL = { temperature: true, topP: true, topK: true, exclusiveTempTopP: false };

	afterEach(() => _resetSamplingRejections());

	it('the Claude 5 family accepts none of the three', () => {
		for (const id of ['claude-sonnet-5', 'claude-opus-5', 'claude-opus-4-7', 'claude-fable-5-1', 'advisor', 'executor']) {
			expect(samplingSupport(id)).toEqual(NONE);
		}
	});

	it('claude-haiku-4-5 accepts none: it routes to claude-haiku-5-5 (probed 2026-11-19)', () => {
		// The gateway list for anthropic/claude-haiku-5-5 wrongly includes
		// temperature and top_p; the measured Claude 5 rule removes them.
		expect(MODEL_INFO['claude-haiku-4-5'].supportedParams).toContain('temperature');
		for (const id of ['claude-haiku-4-5', 'claude-haiku-5-5', 'claude-haiku-4-5-vertex']) {
			expect(samplingSupport(id)).toEqual(NONE);
		}
	});

	it('an Anthropic model outside the Claude 5 family keeps the Vertex xor rule', () => {
		expect(samplingSupport('claude-unlisted-4')).toEqual({
			temperature: true, topP: true, topK: true, exclusiveTempTopP: true
		});
	});

	it('Anthropic rejects all three while thinking is on', () => {
		// Live 400: "`temperature` may only be set to 1 when thinking is enabled".
		expect(samplingSupport('claude-unlisted-4', { reasoning: true })).toEqual(NONE);
		// Not a blanket rule — Google keeps its sampling params under reasoning.
		expect(samplingSupport('gemini-4-argon', { reasoning: true }).temperature).toBe(true);
	});

	it('every gpt-* model rejects all three', () => {
		for (const id of ['gpt-5.5', 'gpt-5.6-luna', 'gpt-6-astra', 'gpt-6-luna', 'observer']) {
			expect(samplingSupport(id)).toEqual(NONE);
			expect(supportsTopK(id)).toBe(false);
		}
	});

	it('gemini-3.8-flash accepts none: its gateway list omits all three', () => {
		expect(MODEL_INFO['gemini-3.8-flash'].supportedParams).not.toContain('temperature');
		expect(samplingSupport('gemini-3.8-flash')).toEqual(NONE);
		expect(samplingSupport('gemini-3.8-flash', { reasoning: true })).toEqual(NONE);
	});

	it('models whose gateway list includes all three keep them', () => {
		for (const id of ['gemini-4-argon', 'gemini-4-neon', 'kimi-k3', 'kimi-k3.1', 'glm-5.3', 'deepseek-v4.1-flash']) {
			expect(samplingSupport(id)).toEqual(ALL);
		}
	});

	it('a list that omits one parameter removes only that one', () => {
		const saved = MODEL_INFO['kimi-k3'].supportedParams;
		try {
			MODEL_INFO['kimi-k3'].supportedParams = ['max_tokens', 'top_p', 'top_k'];
			expect(samplingSupport('kimi-k3')).toEqual({ ...ALL, temperature: false });
		} finally {
			MODEL_INFO['kimi-k3'].supportedParams = saved;
		}
	});

	it('supportedParams: null means "the gateway did not say", not "supports nothing"', () => {
		const saved = MODEL_INFO['kimi-k3'].supportedParams;
		try {
			MODEL_INFO['kimi-k3'].supportedParams = null;
			expect(samplingSupport('kimi-k3')).toEqual(ALL);
		} finally {
			MODEL_INFO['kimi-k3'].supportedParams = saved;
		}
		// An id missing from the snapshot falls back the same way.
		expect(samplingSupport('brand-new-model')).toEqual(ALL);
	});

	it('a runtime rejection removes the parameter for that model only', () => {
		recordSamplingRejection('kimi-k3', ['temperature'], true);
		expect(samplingSupport('kimi-k3')).toEqual({ ...ALL, temperature: false });
		expect(samplingSupport('glm-5.3')).toEqual(ALL);
	});

	it('classifies a provider from the upstream deployment, not just the id', () => {
		expect(modelProvider('advisor')).toBe('anthropic');   // vertex_ai/claude-fable-5-1
		expect(modelProvider('executor')).toBe('anthropic');  // vertex_ai/claude-sonnet-5
		expect(modelProvider('gemini-3.8-flash')).toBe('google');
		expect(modelProvider('gpt-5.6-luna')).toBe('openai');
		expect(modelProvider('qwen3.8-max')).toBe('qwen');
		expect(modelProvider('deepseek-v4-pro')).toBe('other');
	});
});

describe('unsupportedSamplingParams — parsing the gateway error (shapes seen 2026-11-19)', () => {
	const err = (/** @type {string} */ m) => Object.assign(new Error(m), { status: 400 });

	it('reads the bracketed list', () => {
		expect(unsupportedSamplingParams(err(
			"litellm.UnsupportedParamsError: vertex_ai does not support parameters: ['temperature', 'top_p'], for model=gemini-3.8-flash."
		))).toEqual(['temperature', 'top_p']);
	});

	it('reads the single-parameter shapes', () => {
		expect(unsupportedSamplingParams(err(
			'litellm.UnsupportedParamsError: claude-haiku-5-5 does not support top_k=20. To drop unsupported params'
		))).toEqual(['top_k']);
		expect(unsupportedSamplingParams(err(
			"litellm.UnsupportedParamsError: gpt-6-luna doesn't support temperature=0.7 while reasoning"
		))).toEqual(['temperature']);
	});

	it('returns null when any listed parameter is not a sampling parameter', () => {
		expect(unsupportedSamplingParams(err(
			"litellm.UnsupportedParamsError: vertex_ai does not support parameters: ['temperature', 'tools'], for model=x."
		))).toBeNull();
	});

	it('returns null for any other error', () => {
		expect(unsupportedSamplingParams(err('litellm.BadRequestError: Invalid model name'))).toBeNull();
		expect(unsupportedSamplingParams(err("Unknown parameter: 'top_k'"))).toBeNull();
	});

	it('reads through a mapped error to its cause', () => {
		const mapped = Object.assign(new Error('ak-litellm: wrapped'), {
			cause: { error: { message: "litellm.UnsupportedParamsError: x does not support parameters: ['top_p'], for model=y" } }
		});
		expect(unsupportedSamplingParams(mapped)).toEqual(['top_p']);
	});

	it('reads through a doubly mapped error (the /v1/responses path) to the gateway text', () => {
		const raw = err("litellm.UnsupportedParamsError: gpt-6-luna doesn't support temperature=0.7 while reasoning");
		const once = Object.assign(new Error('ak-litellm: the gateway rejected a request parameter it does not support for model x.'), { cause: raw });
		const twice = Object.assign(new Error('ak-litellm: wrapped again'), { cause: once });
		expect(unsupportedSamplingParams(twice)).toEqual(['temperature']);
	});
});

describe('§6.4 web search', () => {
	// Verified 2026-09-11: all three vendors can search, in three different
	// shapes. Only the Fireworks-hosted open models cannot.
	it('covers Anthropic, Google and OpenAI but not the open models', () => {
		expect(supportsWebSearch('claude-sonnet-5')).toBe(true);
		expect(supportsWebSearch('gemini-3.8-flash')).toBe(true);
		expect(supportsWebSearch('gpt-5.5')).toBe(true);
		expect(supportsWebSearch('kimi-k3')).toBe(false);
		expect(supportsWebSearch('deepseek-v4.1-flash')).toBe(false);
	});

	it('emits the googleSearch shape for Gemini', () => {
		expect(buildWebSearchTool({}, 'gemini-3.8-flash', 'Chat')).toEqual({ googleSearch: {} });
	});

	it('warns that Gemini ignores every webSearchConfig knob', () => {
		buildWebSearchTool({ max_uses: 3 }, 'gemini-3.8-flash', 'Chat');
		expect(warnSpy.mock.calls.map(c => c[0]).join('\n')).toMatch(/googleSearch tool takes no configuration/);
	});

	it('emits no chat-completions tool for OpenAI, which needs /v1/responses', () => {
		// `{ type: 'web_search' }` is a hard 400 on /v1/chat/completions.
		expect(buildWebSearchTool({}, 'gpt-5.5', 'Chat')).toBeNull();
	});

	it('builds the Anthropic server tool and maps ak-gemini vocabulary', () => {
		const tool = buildWebSearchTool(
			{ max_uses: 2, allowed_domains: ['a.com'], excludeDomains: ['b.com'] },
			'claude-sonnet-5', 'Chat'
		);
		expect(tool).toEqual({
			type: 'web_search_20250305',
			name: 'web_search',
			max_uses: 2,
			allowed_domains: ['a.com'],
			blocked_domains: ['b.com']
		});
	});

	it('returns null and warns on a model with no search tool at all', () => {
		expect(buildWebSearchTool({}, 'kimi-k3', 'Chat')).toBeNull();
		expect(warnSpy.mock.calls[0][0]).toMatch(/no\s+web-search tool exists/);
	});

	it('warns about groundingConfig keys with no equivalent', () => {
		buildWebSearchTool({ searchTypes: ['news'], timeRangeFilter: {} }, 'claude-sonnet-5', 'Chat');
		const messages = warnSpy.mock.calls.map(c => c[0]).join('\n');
		expect(messages).toMatch(/groundingConfig\.searchTypes/);
		expect(messages).toMatch(/groundingConfig\.timeRangeFilter/);
	});
});

describe('§6.2 tool shapes', () => {
	const SCHEMA = { type: 'object', properties: { q: { type: 'string' } } };

	it('accepts all four schema spellings', () => {
		const spellings = [
			{ name: 't', description: 'd', input_schema: SCHEMA },
			{ name: 't', description: 'd', inputSchema: SCHEMA },
			{ name: 't', description: 'd', parametersJsonSchema: SCHEMA },
			{ name: 't', description: 'd', parameters: SCHEMA }
		];
		for (const tool of spellings) {
			expect(normalizeToolDeclarations([tool], 'ToolAgent')).toEqual([
				{ type: 'function', function: { name: 't', description: 'd', parameters: SCHEMA } }
			]);
		}
	});

	it('passes an already-OpenAI tool through unchanged', () => {
		const t = { type: 'function', function: { name: 't', parameters: SCHEMA } };
		expect(normalizeToolDeclarations([t], 'ToolAgent')[0]).toBe(t);
	});

	it('throws naming the tool with no schema', () => {
		expect(() => normalizeToolDeclarations([{ name: 'broken' }], 'ToolAgent'))
			.toThrow(/ToolAgent: tool "broken" has no parameter schema/);
	});

	it('translates every Anthropic tool_choice form', () => {
		expect(normalizeToolChoice({ type: 'auto' })).toBe('auto');
		expect(normalizeToolChoice({ type: 'any' })).toBe('required');
		expect(normalizeToolChoice({ type: 'none' })).toBe('none');
		expect(normalizeToolChoice({ type: 'tool', name: 'lookup' }))
			.toEqual({ type: 'function', function: { name: 'lookup' } });
		expect(normalizeToolChoice(undefined)).toBeUndefined();
		expect(normalizeToolChoice('required')).toBe('required');
	});

	it('translates ak-gemini toolConfig', () => {
		expect(normalizeOptions({ toolConfig: { functionCallingConfig: { mode: 'AUTO' } } }).toolChoice).toBe('auto');
		expect(normalizeOptions({ toolConfig: { functionCallingConfig: { mode: 'NONE' } } }).toolChoice).toBe('none');
		expect(normalizeOptions({ toolConfig: { functionCallingConfig: { mode: 'ANY' } } }).toolChoice).toBe('required');
		expect(normalizeOptions({ toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['x'] } } }).toolChoice)
			.toEqual({ type: 'function', function: { name: 'x' } });
	});
});

describe('§6.2 labels → request metadata', () => {
	it('flattens ak-gemini labels into gateway tags', () => {
		expect(labelsToMetadata({ team: 'eng', env: 'prod' })).toEqual({ tags: ['team:eng', 'env:prod'] });
		expect(labelsToMetadata({})).toBeUndefined();
		expect(labelsToMetadata(null)).toBeUndefined();
	});
});

describe('ak-gemini chatConfig merges at the lowest precedence', () => {
	it('fills gaps without overriding a top-level option', () => {
		const o = normalizeOptions({
			temperature: 0.1,
			chatConfig: {
				systemInstruction: 'be brief',
				temperature: 0.9,
				maxOutputTokens: 512,
				thinkingConfig: { thinkingLevel: 'LOW' }
			}
		});
		expect(o.systemPrompt).toBe('be brief');
		expect(o.temperature).toBe(0.1);
		expect(o.maxTokens).toBe(512);
		expect(o.effort).toBe('low');
		expect(o.chatConfig).toBeUndefined();
	});
});

describe('model aliasing', () => {
	it('redirects sibling-package model ids and warns once', () => {
		expect(normalizeOptions({ modelName: 'claude-sonnet-4-6' }).modelName).toBe('claude-sonnet-5');
		expect(normalizeOptions({ modelName: 'gemini-3-flash-preview' }).modelName).toBe('gemini-3.8-flash');
		expect(normalizeOptions({ modelName: 'gpt-5' }).modelName).toBe('gpt-5.5');
		expect(warnSpy).toHaveBeenCalledTimes(3);
	});

	it('leaves a served id alone and stays quiet', () => {
		expect(normalizeOptions({ modelName: 'claude-haiku-4-5' }).modelName).toBe('claude-haiku-4-5');
		expect(warnSpy).not.toHaveBeenCalled();
	});
});

describe('normalizeOptions is idempotent', () => {
	it('running it twice changes nothing (base.js re-runs it after subclasses)', () => {
		const raw = { maxOutputTokens: 42, thinkingConfig: { thinkingLevel: 'HIGH' }, modelName: 'claude-sonnet-4-6', logLevel: 'none' };
		const once = normalizeOptions(raw, 'Chat');
		const twice = normalizeOptions(once, 'Chat');
		expect(twice).toEqual(once);
	});
});
