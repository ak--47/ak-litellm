/**
 * @fileoverview Model registry, pricing table, and cost helpers for the
 * Mixpanel LiteLLM gateway.
 *
 * The two generated blocks below (`MODEL_PRICING_AS_OF`, `MODEL_PRICING`,
 * `MODEL_INFO`) are produced by `scripts/refresh-pricing.mjs` from a live
 * `GET /model/info` call. DO NOT HAND-EDIT THEM. Re-run:
 *
 *     npm run refresh-pricing
 *
 * Hand-writing rates is how the workspace accumulated four wrong prices in a
 * single audit round. Read the gateway, commit the output, stamp the date.
 */

import log from './logger.js';

/**
 * @typedef {import('./types').ModelPricing} ModelPricing
 * @typedef {import('./types').ResolvedPricing} ResolvedPricing
 * @typedef {import('./types').ModelInfo} ModelInfo
 * @typedef {import('./types').EffortLevel} EffortLevel
 * @typedef {import('./types').UsageData} UsageData
 * @typedef {import('./types').UsageLike} UsageLike
 * @typedef {import('./types').CacheTtl} CacheTtl
 */

// ─────────────────────────────────────────────────────────────────────────────
// BEGIN GENERATED — scripts/refresh-pricing.mjs
// ─────────────────────────────────────────────────────────────────────────────

/** ISO date the tables below were generated from `GET /model/info` on https://litellm.mixpanel.org. */
export const MODEL_PRICING_AS_OF = '2026-09-11';

/** @type {Record<string, ModelPricing>} Per-MILLION-token USD rates, read from the gateway. */
export const MODEL_PRICING = {
	'advisor': {"input":10,"output":50,"cachedInput":0.25},
	'executor': {"input":2,"output":10,"cachedInput":0.2},
	'claude-opus-5': {"input":5,"output":25,"cachedInput":0.5},
	'claude-sonnet-5': {"input":2,"output":10,"cachedInput":0.2},
	'claude-opus-4-7': {"input":5,"output":25,"cachedInput":0.5},
	'claude-haiku-4-5': {"input":1,"output":5,"cachedInput":0.1},
	'claude-fable-5-1': {"input":10,"output":50,"cachedInput":0.25},
	'claude-fable-5': {"input":10,"output":50,"cachedInput":0.25},
	'gemini-3.8-flash': {"input":0.75,"output":3.75,"cachedInput":0.075},
	'gpt-5.5': {"input":5,"output":30,"cachedInput":0.5},
	'gpt-5.6-sol': {"input":4,"output":20,"cachedInput":0.4},
	'gpt-5.6-terra': {"input":2,"output":12,"cachedInput":0.2},
	'gpt-5.6-luna': {"input":0.2,"output":1.2,"cachedInput":0.02},
	'gpt-6-astra': {"input":10,"output":50,"cachedInput":1},
	'glm-5.3': {"input":1.4,"output":4.4,"cachedInput":0.26},
	'glm-5.3-flash': {"input":0.15,"output":0.5,"cachedInput":0.03},
	'kimi-k3': {"input":3,"output":15,"cachedInput":0.3},
	'deepseek-v4.1-flash': {"input":0.22,"output":0.66,"cachedInput":0.007},
	'glm-fast-latest': {"input":2.1,"output":6.6,"cachedInput":0.21}
};

/** @type {Record<string, ModelInfo>} Capability + Mixpanel lifecycle metadata, read from the gateway. */
export const MODEL_INFO = {
	'advisor': {"maxInputTokens":1000000,"maxOutputTokens":128000,"mode":"chat","upstreamModel":"vertex_ai/claude-fable-5-1","directAccess":true,"teamIds":["sales"],"lifecycle":"integration","traits":["advisor"],"guidance":"Stable model name for the Pi Advisor integration; not intended for interactive selection.","spotlight":false,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":true,"supportsToolChoice":true,"supportsParallelFunctionCalling":null,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":true,"supportsAssistantPrefill":false,"thinkingAlwaysOn":true,"gatewaySaysSupportsWebSearch":null,"gatewaySaysSupportsPromptCaching":true},
	'executor': {"maxInputTokens":1000000,"maxOutputTokens":128000,"mode":"chat","upstreamModel":"vertex_ai/claude-sonnet-5","directAccess":true,"teamIds":["sales"],"lifecycle":"integration","traits":["executor"],"guidance":"Stable model name for the Pi Advisor executor; not intended for interactive selection.","spotlight":false,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":true,"supportsToolChoice":true,"supportsParallelFunctionCalling":null,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":true,"supportsAssistantPrefill":false,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":null,"gatewaySaysSupportsPromptCaching":true},
	'claude-opus-5': {"maxInputTokens":1000000,"maxOutputTokens":128000,"mode":"chat","upstreamModel":"vertex_ai/claude-opus-5","directAccess":true,"teamIds":["sales"],"lifecycle":"current","traits":["advisor","design"],"guidance":"Use for difficult architecture, design, and review work where quality matters more than cost.","spotlight":false,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":true,"supportsToolChoice":true,"supportsParallelFunctionCalling":null,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":true,"supportsAssistantPrefill":false,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":null,"gatewaySaysSupportsPromptCaching":true},
	'claude-sonnet-5': {"maxInputTokens":1000000,"maxOutputTokens":128000,"mode":"chat","upstreamModel":"vertex_ai/claude-sonnet-5","directAccess":true,"teamIds":["sales"],"lifecycle":"current","traits":["daily-driver"],"guidance":"Recommended default for routine engineering work.","spotlight":false,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":true,"supportsToolChoice":true,"supportsParallelFunctionCalling":null,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":true,"supportsAssistantPrefill":false,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":null,"gatewaySaysSupportsPromptCaching":true},
	'claude-opus-4-7': {"maxInputTokens":1000000,"maxOutputTokens":128000,"mode":"chat","upstreamModel":"vertex_ai/claude-opus-4-7","directAccess":true,"teamIds":["sales"],"lifecycle":"legacy","traits":["advisor","design"],"guidance":"Previous-generation reasoning model; prefer Claude Opus 5 for new work.","spotlight":false,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":true,"supportsToolChoice":true,"supportsParallelFunctionCalling":null,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":true,"supportsAssistantPrefill":false,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":null,"gatewaySaysSupportsPromptCaching":true},
	'claude-haiku-4-5': {"maxInputTokens":200000,"maxOutputTokens":64000,"mode":"chat","upstreamModel":"vertex_ai/claude-haiku-4-5","directAccess":true,"teamIds":["sales"],"lifecycle":"legacy","traits":[],"guidance":"Previous-generation low-cost model; compare with current fast models before choosing it.","spotlight":false,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":true,"supportsToolChoice":true,"supportsParallelFunctionCalling":null,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":null,"supportsAssistantPrefill":true,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":null,"gatewaySaysSupportsPromptCaching":true},
	'claude-fable-5-1': {"maxInputTokens":1000000,"maxOutputTokens":128000,"mode":"chat","upstreamModel":"vertex_ai/claude-fable-5-1","directAccess":true,"teamIds":["sales"],"lifecycle":"current","traits":[],"guidance":"Highest-cost Claude route; use only when its additional capability is worth the price.","spotlight":false,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":true,"supportsToolChoice":true,"supportsParallelFunctionCalling":null,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":true,"supportsAssistantPrefill":false,"thinkingAlwaysOn":true,"gatewaySaysSupportsWebSearch":null,"gatewaySaysSupportsPromptCaching":true},
	'claude-fable-5': {"maxInputTokens":1000000,"maxOutputTokens":128000,"mode":"chat","upstreamModel":"vertex_ai/claude-fable-5-1","directAccess":true,"teamIds":["sales"],"lifecycle":"current","traits":[],"guidance":"Compatibility alias for Claude Fable 5.1.","spotlight":false,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":true,"supportsToolChoice":true,"supportsParallelFunctionCalling":null,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":true,"supportsAssistantPrefill":false,"thinkingAlwaysOn":true,"gatewaySaysSupportsWebSearch":null,"gatewaySaysSupportsPromptCaching":true},
	'gemini-3.8-flash': {"maxInputTokens":1048576,"maxOutputTokens":65536,"mode":"chat","upstreamModel":"vertex_ai/gemini-3.8-flash","directAccess":true,"teamIds":["sales"],"lifecycle":"current","traits":[],"guidance":"Current low-cost option for quick iteration.","spotlight":true,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":true,"supportsToolChoice":true,"supportsParallelFunctionCalling":true,"supportsResponseSchema":true,"supportsAudioInput":true,"supportsUrlContext":true,"supportsComputerUse":null,"supportsAssistantPrefill":null,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":true,"gatewaySaysSupportsPromptCaching":true},
	'gpt-5.5': {"maxInputTokens":1050000,"maxOutputTokens":128000,"mode":"chat","upstreamModel":"openai/gpt-5.5","directAccess":true,"teamIds":["sales"],"lifecycle":"legacy","traits":[],"guidance":"Previous generation; prefer a GPT 5.6 tier for new work.","spotlight":false,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":true,"supportsToolChoice":true,"supportsParallelFunctionCalling":true,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":null,"supportsAssistantPrefill":null,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":true,"gatewaySaysSupportsPromptCaching":true},
	'gpt-5.6-sol': {"maxInputTokens":922000,"maxOutputTokens":128000,"mode":"chat","upstreamModel":"openai/gpt-5.6-sol","directAccess":true,"teamIds":["sales"],"lifecycle":"current","traits":["advisor","design"],"guidance":"Flagship GPT tier for difficult design and reasoning work.","spotlight":false,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":true,"supportsToolChoice":true,"supportsParallelFunctionCalling":true,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":true,"supportsAssistantPrefill":null,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":true,"gatewaySaysSupportsPromptCaching":true},
	'gpt-5.6-terra': {"maxInputTokens":922000,"maxOutputTokens":128000,"mode":"chat","upstreamModel":"openai/gpt-5.6-terra","directAccess":true,"teamIds":["sales"],"lifecycle":"current","traits":["daily-driver"],"guidance":"Balanced GPT tier for routine engineering work.","spotlight":false,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":true,"supportsToolChoice":true,"supportsParallelFunctionCalling":true,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":null,"supportsAssistantPrefill":null,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":true,"gatewaySaysSupportsPromptCaching":true},
	'gpt-5.6-luna': {"maxInputTokens":922000,"maxOutputTokens":128000,"mode":"chat","upstreamModel":"openai/gpt-5.6-luna","directAccess":true,"teamIds":["sales"],"lifecycle":"current","traits":[],"guidance":"Lowest-cost GPT tier for quick iteration and lightweight tasks.","spotlight":true,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":true,"supportsToolChoice":true,"supportsParallelFunctionCalling":true,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":null,"supportsAssistantPrefill":null,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":true,"gatewaySaysSupportsPromptCaching":true},
	'gpt-6-astra': {"maxInputTokens":922000,"maxOutputTokens":128000,"mode":"chat","upstreamModel":"openai/gpt-6-astra","directAccess":true,"teamIds":["sales"],"lifecycle":"current","traits":["advisor","design"],"guidance":"Highest-cost GPT route for the hardest end-to-end reasoning, coding, and agentic work; prefer a GPT 5.6 tier when its capability is not needed.","spotlight":false,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":true,"supportsToolChoice":true,"supportsParallelFunctionCalling":true,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":true,"supportsAssistantPrefill":null,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":true,"gatewaySaysSupportsPromptCaching":true},
	'glm-5.3': {"maxInputTokens":1048576,"maxOutputTokens":128000,"mode":"chat","upstreamModel":"fireworks_ai/accounts/fireworks/models/glm-5p3","directAccess":true,"teamIds":["sales"],"lifecycle":"current","traits":[],"guidance":"Strong coding and long-horizon candidate with function calling and a million-token context window.","spotlight":false,"supportsReasoning":true,"supportsVision":false,"supportsFunctionCalling":true,"supportsPdfInput":null,"supportsToolChoice":true,"supportsParallelFunctionCalling":null,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":null,"supportsAssistantPrefill":null,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":null,"gatewaySaysSupportsPromptCaching":null},
	'glm-5.3-flash': {"maxInputTokens":1048576,"maxOutputTokens":null,"mode":"chat","upstreamModel":"fireworks_ai/accounts/fireworks/models/glm-5p3-flash","directAccess":true,"teamIds":["sales"],"lifecycle":"current","traits":["multimodal"],"guidance":"Fast, lower-cost GLM 5.3 variant for routine coding, subagents, and quick iteration.","spotlight":false,"supportsReasoning":null,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":null,"supportsToolChoice":true,"supportsParallelFunctionCalling":null,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":null,"supportsAssistantPrefill":null,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":null,"gatewaySaysSupportsPromptCaching":null},
	'kimi-k3': {"maxInputTokens":1048576,"maxOutputTokens":131072,"mode":"chat","upstreamModel":"fireworks_ai/accounts/fireworks/models/kimi-k3","directAccess":true,"teamIds":["sales"],"lifecycle":"current","traits":["multimodal"],"guidance":"Flagship multimodal reasoning candidate with function calling and a million-token context window.","spotlight":false,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":null,"supportsToolChoice":true,"supportsParallelFunctionCalling":null,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":null,"supportsAssistantPrefill":null,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":null,"gatewaySaysSupportsPromptCaching":null},
	'deepseek-v4.1-flash': {"maxInputTokens":1048576,"maxOutputTokens":131072,"mode":"chat","upstreamModel":"fireworks_ai/accounts/fireworks/models/deepseek-v4p1-flash","directAccess":true,"teamIds":["sales"],"lifecycle":"current","traits":[],"guidance":"Fast, low-cost option for routine coding, subagents, and quick iteration.","spotlight":false,"supportsReasoning":true,"supportsVision":true,"supportsFunctionCalling":true,"supportsPdfInput":null,"supportsToolChoice":true,"supportsParallelFunctionCalling":null,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":null,"supportsAssistantPrefill":null,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":null,"gatewaySaysSupportsPromptCaching":null},
	'glm-fast-latest': {"maxInputTokens":1048576,"maxOutputTokens":128000,"mode":"chat","upstreamModel":"fireworks_ai/routers/glm-fast-latest","directAccess":true,"teamIds":["sales"],"lifecycle":"current","traits":[],"guidance":"Rolling fast GLM route for text-only agent loops.","spotlight":false,"supportsReasoning":true,"supportsVision":false,"supportsFunctionCalling":true,"supportsPdfInput":null,"supportsToolChoice":true,"supportsParallelFunctionCalling":null,"supportsResponseSchema":true,"supportsAudioInput":null,"supportsUrlContext":null,"supportsComputerUse":null,"supportsAssistantPrefill":null,"thinkingAlwaysOn":null,"gatewaySaysSupportsWebSearch":null,"gatewaySaysSupportsPromptCaching":null}
};

// ─────────────────────────────────────────────────────────────────────────────
// END GENERATED
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sibling-package model ids → the nearest model this gateway actually serves.
 *
 * Exists so a drop-in app that hardcodes `modelName: 'gemini-3.7-flash'` keeps
 * running. An id that is not in this map passes through unchanged, so new
 * gateway models work without a package release; if it is genuinely wrong the
 * gateway returns a 400 that lists the valid names.
 *
 * @type {Record<string, string>}
 */
export const MODEL_ALIASES = {
	// ak-gemini defaults, current and historical
	'gemini-3.7-flash': 'gemini-3.8-flash',
	'gemini-3.6-flash': 'gemini-3.8-flash',
	'gemini-3-flash-preview': 'gemini-3.8-flash',
	'gemini-flash-latest': 'gemini-3.8-flash',
	// ak-claude defaults, current and historical
	'claude-sonnet-4-6': 'claude-sonnet-5',
	'claude-opus-4-5': 'claude-opus-5',
	'claude-haiku-3-5': 'claude-haiku-4-5',
	// ak-gpt
	'gpt-5': 'gpt-5.5',
	// Gateway roster drift, observed 2026-09-11. `deepseek-v4-pro` and
	// `qwen3.8-max` were withdrawn with no successor, so they are deliberately
	// absent — they raise "the gateway does not serve model" instead of routing
	// somewhere the caller did not ask for.
	'deepseek-v4-flash': 'deepseek-v4.1-flash'
};

/**
 * Accepted values for the `effort` option — the union of ak-claude's
 * (`low|medium|high|xhigh|max`) and ak-gemini's (`minimal|low|medium|high`)
 * vocabularies. The gateway's wire field `reasoning_effort` only understands
 * `low|medium|high`; the mapping lives in `compat.js`.
 *
 * @type {readonly EffortLevel[]}
 */
export const EFFORT_LEVELS = /** @type {const} */ (['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

/** Default model. Matches ak-claude's default so a swap changes no behavior. */
export const DEFAULT_MODEL = 'claude-sonnet-5';

/** Characters-per-token heuristic used by `estimate()`. The gateway has no token-count endpoint. */
export const CHARS_PER_TOKEN = 4;

/**
 * Cache-write cost multiplier over the base input rate, by TTL.
 *
 * Verified 2026-09-11 on `claude-sonnet-5` with a 4,808-token block. Both cells
 * reproduce the gateway's own `x-litellm-response-cost` to the cent:
 *
 *   5m: 4808 * ($2/M) * 1.25 + 7 * $2/M + 16 * $10/M = $0.012194  (header $0.012219)
 *   1h: 4808 * ($2/M) * 2.00 + 7 * $2/M + 16 * $10/M = $0.019406  (header $0.019406)
 *
 * @type {Readonly<Record<string, number>>}
 */
export const CACHE_WRITE_MULTIPLIER = Object.freeze({ '5m': 1.25, '1h': 2 });

/**
 * Cache-read discount against the base input rate, used only when a model has
 * no published `cachedInput` rate. Every model on this gateway publishes one,
 * and each equals exactly `input * 0.1`.
 */
export const CACHE_READ_MULTIPLIER = 0.1;

// ── Alias + lookup ───────────────────────────────────────────────────────────

/**
 * Follows `MODEL_ALIASES` one hop. Silent — the user-facing warning fires once
 * at construction time in `compat.resolveModelName()`, not on every lookup.
 *
 * @param {string | null | undefined} modelId
 * @returns {string | null}
 */
export function canonicalModelId(modelId) {
	if (!modelId) return null;
	return MODEL_ALIASES[modelId] || modelId;
}

/**
 * Applies a date-windowed introductory rate, if the entry carries one and the
 * date falls inside the window. No gateway model uses this today; the mechanism
 * is retained because both sibling packages have it and providers do run promos.
 *
 * @param {ModelPricing} entry
 * @param {Date | string | number} [at]
 * @returns {ModelPricing}
 * @private
 */
function _applyIntroPricing(entry, at) {
	if (!entry?.intro) return entry;
	const when = at ? new Date(at) : new Date();
	// `until` is inclusive of the whole day
	const until = new Date(`${entry.intro.until}T23:59:59.999Z`);
	if (Number.isNaN(when.getTime()) || when > until) return entry;

	const { until: _u, ...rates } = entry.intro;
	return { ...entry, ...rates, introUntil: entry.intro.until };
}

/**
 * Resolves per-million-token pricing for a model id.
 *
 * `null` means the model's pricing is UNKNOWN. It does NOT mean the call was
 * free. Callers must not coerce it to `0`.
 *
 * @param {string | null | undefined} modelId
 * @param {{ at?: Date | string | number }} [opts]
 * @returns {ResolvedPricing | null}
 */
export function resolvePricing(modelId, opts = {}) {
	const id = canonicalModelId(modelId);
	if (!id) return null;

	const entry = MODEL_PRICING[id];
	if (!entry) return null;

	return { ...(_applyIntroPricing(entry, opts.at)), asOf: MODEL_PRICING_AS_OF };
}

/**
 * Estimated USD cost for a call.
 *
 * Two call shapes are accepted so that code written against either sibling
 * package keeps working:
 *
 * 1. `computeCost(usage, modelId, { at, cacheTtl })`  — the ak-litellm shape
 * 2. `computeCost(modelId, promptTokens, responseTokens, thoughtsTokens,
 *    cacheReadTokens, opts)` — the ak-claude / ak-gemini positional shape.
 *
 * **Cache accounting follows GOOGLE's convention, not Anthropic's.** This
 * gateway INCLUDES cache tokens inside `prompt_tokens`: a call measured
 * 2026-09-11 reported `prompt_tokens: 4815` = `text_tokens: 7` +
 * `cached_tokens: 4808`. So cache buckets are subtracted from `promptTokens`
 * and re-billed:
 *
 * - reads  at `pricing.cachedInput` (every model on this gateway publishes one,
 *   and each is exactly `input * 0.1`),
 * - writes at `input * CACHE_WRITE_MULTIPLIER[cacheTtl]` — 1.25x at `5m`, 2x at `1h`.
 *
 * ak-claude does the opposite (Anthropic EXCLUDES cache tokens and adds them on
 * top). Do not unify the two implementations.
 *
 * @param {UsageLike | string | null | undefined} usageOrModelId
 * @param {string | number | null} [modelIdOrPromptTokens]
 * @param {{ at?: Date|string|number, cacheTtl?: CacheTtl } | number} [optsOrResponseTokens]
 * @param {number} [extraA] positional shape: `thoughtsTokens`
 * @param {number} [extraB] positional shape: `cacheReadTokens`
 * @param {{ at?: Date|string|number, cacheTtl?: CacheTtl }} [legacyOpts]
 * @returns {number | null} USD, or `null` when pricing is unknown.
 */
export function computeCost(usageOrModelId, modelIdOrPromptTokens, optsOrResponseTokens, extraA, extraB, legacyOpts) {
	/** @type {string | null} */
	let modelId;
	let promptTokens = 0;
	let responseTokens = 0;
	let thoughtsTokens = 0;
	/** @type {{ at?: Date|string|number, cacheTtl?: CacheTtl }} */
	let opts = {};

	let cacheReadTokens = 0;
	let cacheCreationTokens = 0;
	/** @type {CacheTtl} */
	let cacheTtl = '5m';

	if (usageOrModelId && typeof usageOrModelId === 'object') {
		// Shape 1 — computeCost(usage, modelId, opts)
		const usage = usageOrModelId;
		modelId = /** @type {string} */ (modelIdOrPromptTokens) ?? usage.requestedModel ?? null;
		promptTokens = usage.promptTokens || 0;
		responseTokens = usage.responseTokens || 0;
		thoughtsTokens = usage.thoughtsTokens || 0;
		// `cachedTokens` is ak-gemini's name for the same number.
		cacheReadTokens = usage.cacheReadTokens || usage.cachedTokens || 0;
		cacheCreationTokens = usage.cacheCreationTokens || 0;
		opts = /** @type {any} */ (optsOrResponseTokens) || {};
		if (opts.cacheTtl) cacheTtl = opts.cacheTtl;
	}
	else {
		// Shape 2 — computeCost(modelId, in, out, thoughts, cacheRead, opts)
		modelId = /** @type {string | null} */ (usageOrModelId) ?? null;
		promptTokens = Number(modelIdOrPromptTokens) || 0;
		responseTokens = Number(optsOrResponseTokens) || 0;
		thoughtsTokens = Number(extraA) || 0;
		cacheReadTokens = Number(extraB) || 0;
		opts = legacyOpts || {};
		if (opts.cacheTtl) cacheTtl = opts.cacheTtl;
	}

	const pricing = resolvePricing(modelId, opts);
	if (!pricing) return null;

	// THIS GATEWAY INCLUDES CACHE TOKENS IN `prompt_tokens`.
	//
	// Verified 2026-09-11 on claude-sonnet-5: a cached call reported
	// prompt_tokens 4815 = text_tokens 7 + cached_tokens 4808. That is Google's
	// convention. ak-claude does the opposite (Anthropic EXCLUDES cache tokens
	// and adds them on top) — do not copy its math here.
	//
	// So: subtract the cache tokens out, then re-bill each bucket at its own rate.
	const billableInput = Math.max(0, promptTokens - cacheReadTokens - cacheCreationTokens);
	const readRate = pricing.cachedInput ?? pricing.input * CACHE_READ_MULTIPLIER;
	const writeRate = pricing.input * (CACHE_WRITE_MULTIPLIER[cacheTtl] ?? CACHE_WRITE_MULTIPLIER['5m']);

	const inputCost = (billableInput / 1e6) * pricing.input;
	const readCost = (cacheReadTokens / 1e6) * readRate;
	const writeCost = (cacheCreationTokens / 1e6) * writeRate;
	const outputCost = ((responseTokens + thoughtsTokens) / 1e6) * pricing.output;

	return inputCost + readCost + writeCost + outputCost;
}

/**
 * Model ids the gateway served when the snapshot was generated. Call
 * `refreshModelInfo()` for the live list.
 *
 * `advisor` and `executor` are excluded by default. They are stable aliases for
 * the Pi Advisor integration, marked `lifecycle: 'integration'` with the
 * guidance "not intended for interactive selection". Both are callable.
 *
 * NOTE: do not filter on `direct_access` / `access_via_team_ids` — the gateway
 * reports `direct_access: false` and `["sales"]` for EVERY model on this key
 * (verified 2026-09-08), so they discriminate nothing. `lifecycle` does.
 *
 * @param {{ includeIntegration?: boolean }} [opts] include `advisor` / `executor`
 * @returns {string[]}
 */
export function listModels(opts = {}) {
	const ids = Object.keys(MODEL_INFO);
	if (opts.includeIntegration) return ids;
	return ids.filter(id => MODEL_INFO[id]?.lifecycle !== 'integration');
}

/**
 * Capability and lifecycle metadata for a model id. Follows `MODEL_ALIASES`.
 * Returns `null` for an unknown id — unknown means unknown, not unsupported.
 *
 * @param {string | null | undefined} modelId
 * @returns {ModelInfo | null}
 */
export function getModelInfo(modelId) {
	const id = canonicalModelId(modelId);
	if (!id) return null;
	return MODEL_INFO[id] ? { ...MODEL_INFO[id] } : null;
}

/**
 * Re-fetches `GET /model/info` and replaces the in-memory `MODEL_PRICING` and
 * `MODEL_INFO` tables. Use when the gateway adds a model between package
 * releases. Mutates the exported objects in place so live bindings stay valid.
 *
 * @param {{ apiKey?: string, baseURL?: string }} [opts]
 * @returns {Promise<{ models: string[], count: number }>}
 */
export async function refreshModelInfo(opts = {}) {
	const apiKey = opts.apiKey ?? process.env.LITELLM_API_KEY;
	if (!apiKey) throw new Error('ak-litellm: refreshModelInfo needs an API key — pass `apiKey` or set LITELLM_API_KEY.');

	const root = (opts.baseURL ?? process.env.LITELLM_BASE_URL ?? 'https://litellm.mixpanel.org').replace(/\/v1\/?$/, '').replace(/\/$/, '');

	const res = await fetch(`${root}/model/info`, { headers: { Authorization: `Bearer ${apiKey}` } });
	if (!res.ok) throw new Error(`ak-litellm: GET /model/info failed — ${res.status} ${await res.text()}`);

	const body = /** @type {any} */ (await res.json());
	const { pricing, info } = buildTablesFromModelInfo(body);

	for (const k of Object.keys(MODEL_PRICING)) delete MODEL_PRICING[k];
	for (const k of Object.keys(MODEL_INFO)) delete MODEL_INFO[k];
	Object.assign(MODEL_PRICING, pricing);
	Object.assign(MODEL_INFO, info);

	log.debug(`ak-litellm: refreshed model tables — ${Object.keys(info).length} models`);
	return { models: Object.keys(info), count: Object.keys(info).length };
}

/**
 * Converts a raw `/model/info` body into the two generated tables. Shared by
 * `refreshModelInfo()` and `scripts/refresh-pricing.mjs` so the runtime path and
 * the codegen path can never drift.
 *
 * @param {{ data?: any[] }} body
 * @returns {{ pricing: Record<string, ModelPricing>, info: Record<string, ModelInfo> }}
 */
export function buildTablesFromModelInfo(body) {
	/** @type {Record<string, ModelPricing>} */
	const pricing = {};
	/** @type {Record<string, ModelInfo>} */
	const info = {};

	for (const entry of body?.data || []) {
		const id = entry?.model_name;
		if (!id) continue;
		const mi = entry.model_info || {};

		/** @type {ModelPricing} */
		const rates = {
			input: perMillion(mi.input_cost_per_token),
			output: perMillion(mi.output_cost_per_token)
		};
		const cached = perMillion(mi.cache_read_input_token_cost);
		if (cached !== null) rates.cachedInput = cached;
		if (rates.input !== null && rates.output !== null) pricing[id] = rates;

		info[id] = {
			maxInputTokens: mi.max_input_tokens ?? null,
			maxOutputTokens: mi.max_output_tokens ?? null,
			mode: mi.mode ?? null,
			upstreamModel: entry.litellm_params?.model ?? null,
			directAccess: mi.direct_access ?? null,
			teamIds: mi.access_via_team_ids ?? [],
			lifecycle: mi.mixpanel?.lifecycle ?? null,
			traits: mi.mixpanel?.traits ?? [],
			guidance: mi.mixpanel?.guidance ?? null,
			spotlight: mi.mixpanel?.spotlight ?? false,
			supportsReasoning: mi.supports_reasoning ?? null,
			supportsVision: mi.supports_vision ?? null,
			supportsFunctionCalling: mi.supports_function_calling ?? null,
			supportsPdfInput: mi.supports_pdf_input ?? null,
			supportsToolChoice: mi.supports_tool_choice ?? null,
			supportsParallelFunctionCalling: mi.supports_parallel_function_calling ?? null,
			supportsResponseSchema: mi.supports_response_schema ?? null,
			supportsAudioInput: mi.supports_audio_input ?? null,
			supportsUrlContext: mi.supports_url_context ?? null,
			supportsComputerUse: mi.supports_computer_use ?? null,
			supportsAssistantPrefill: mi.supports_assistant_prefill ?? null,
			thinkingAlwaysOn: mi.thinking_always_on ?? null,
			// NOTE: `supports_web_search` and `supports_prompt_caching` are also
			// present on the wire and are deliberately NOT copied here. Both are
			// wrong on this gateway — see WEB_SEARCH_STYLE and CACHE_CAPABLE_MODELS.
			gatewaySaysSupportsWebSearch: mi.supports_web_search ?? null,
			gatewaySaysSupportsPromptCaching: mi.supports_prompt_caching ?? null
		};
	}

	return { pricing, info };
}

/**
 * Per-token USD → per-million-token USD, rounded to kill float noise
 * (`0.000002 * 1e6` is `2.0000000000000004` in IEEE 754).
 *
 * @param {number | null | undefined} perToken
 * @returns {number | null}
 */
export function perMillion(perToken) {
	if (typeof perToken !== 'number' || !Number.isFinite(perToken)) return null;
	return Math.round(perToken * 1e6 * 1e6) / 1e6;
}

/**
 * Maps ak-claude's legacy `thinking.budget_tokens` onto an effort level.
 * Ported verbatim from ak-claude/base.js so the two agree.
 *
 * @param {number} budgetTokens
 * @returns {EffortLevel | null} `null` means thinking disabled
 */
export function budgetTokensToEffort(budgetTokens) {
	if (!Number.isFinite(budgetTokens) || budgetTokens <= 0) return null;
	if (budgetTokens <= 2048) return 'low';
	if (budgetTokens <= 8192) return 'medium';
	if (budgetTokens <= 24576) return 'high';
	return 'xhigh';
}
