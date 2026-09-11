/**
 * @fileoverview What each model can actually do, and how to ask it.
 *
 * Two sources of truth live here, and they disagree on purpose.
 *
 * 1. **The gateway's own `/model/info` flags**, snapshotted into `MODEL_INFO` by
 *    `scripts/refresh-pricing.mjs`. Good for context windows, vision, PDF input
 *    and function calling.
 *
 * 2. **Measured lists in this file.** Two of the gateway's flags are wrong, and
 *    trusting them costs money or breaks calls:
 *
 *    - `supports_prompt_caching` reports `true` for `claude-haiku-4-5`,
 *      `gemini-3.8-flash` and every `gpt-*`. **None of them cache.** Verified
 *      2026-09-11 with a 4,808-token block sent twice: cache token counts stayed
 *      at `0` and the cost header did not move.
 *    - `supports_web_search` reports `true` for `gemini-*` and `gpt-*` but
 *      `false` for `claude-*`, which is backwards for the tool shape this
 *      gateway accepts on `/v1/chat/completions`.
 *
 * When the two disagree, the measured list wins. Re-derive both with
 * `npm run probe-capabilities`.
 */

import { getModelInfo, canonicalModelId } from './models.js';

// ─────────────────────────────────────────────────────────────────────────────
// Prompt caching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Models where `cache_control` actually engages, measured 2026-09-11.
 *
 * Read cost versus write cost on a 4,808-token block:
 *
 * | model              | write     | read      | saving |
 * |--------------------|-----------|-----------|--------|
 * | claude-fable-5-1   | $0.0611   | $0.0021   | 29.2x  |
 * | claude-opus-5      | $0.0305   | $0.0028   | 10.7x  |
 * | claude-opus-4-7    | $0.0306   | $0.0029   | 10.6x  |
 * | claude-sonnet-5    | $0.0122   | $0.0011   | 10.7x  |
 *
 * `claude-haiku-4-5` is the notable absence: it is a `claude-*` model that does
 * NOT cache, which is why you cannot gate on the family prefix.
 *
 * @type {readonly string[]}
 */
export const CACHE_CAPABLE_MODELS = Object.freeze([
	'claude-opus-5',
	'claude-opus-4-7',
	'claude-sonnet-5',
	'claude-fable-5-1',
	'claude-fable-5',
	// Team-scoped integration endpoints; both route to a caching Claude model.
	'advisor',
	'executor'
]);

/**
 * Smallest block Anthropic will cache. Below this, `cache_control` is accepted
 * and silently does nothing.
 *
 * Measured 2026-09-11: a 735-token block did not cache, a 4,808-token block did.
 * Anthropic documents 1,024 tokens for Sonnet and Opus.
 */
export const CACHE_MIN_TOKENS = 1024;

// The two cache-rate constants live in models.js, next to the pricing table
// they modify, so that models.js does not have to import this file.
export { CACHE_WRITE_MULTIPLIER, CACHE_READ_MULTIPLIER } from './models.js';

/**
 * Whether `cache_control` engages on this model.
 *
 * Deliberately ignores `model_info.supports_prompt_caching`, which is wrong for
 * six of the nineteen models on this gateway.
 *
 * @param {string} [modelId]
 * @returns {boolean}
 */
export function supportsPromptCaching(modelId) {
	if (!modelId) return false;
	const id = canonicalModelId(modelId) || modelId;
	return CACHE_CAPABLE_MODELS.includes(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Web search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which web-search tool shape a provider accepts, and over which transport.
 *
 * All three verified 2026-09-11:
 *
 * - `anthropic` — `{ type: 'web_search_20250305', name: 'web_search' }` on
 *   `/v1/chat/completions`.
 * - `google` — `{ googleSearch: {} }` on `/v1/chat/completions`. Returns real
 *   grounded results and reports `prompt_tokens_details.web_search_requests`.
 * - `openai` — `{ type: 'web_search' }`, and **only** over `/v1/responses`.
 *   On `/v1/chat/completions` it is a hard 400:
 *   `Invalid value: 'web_search'. Supported values are: 'function' and 'custom'`.
 *
 * @typedef {'anthropic' | 'google' | 'openai' | null} WebSearchStyle
 */

/**
 * The web-search style for a model, or `null` when it cannot search.
 *
 * @param {string} [modelId]
 * @returns {WebSearchStyle}
 */
export function webSearchStyle(modelId) {
	if (!modelId) return null;
	const id = canonicalModelId(modelId) || modelId;
	const upstream = getModelInfo(id)?.upstreamModel || '';
	const probe = `${id} ${upstream}`;
	if (/claude|anthropic/i.test(probe)) return 'anthropic';
	if (/gemini|vertex_ai\/gemini/i.test(probe)) return 'google';
	if (/^gpt|openai\//i.test(probe)) return 'openai';
	// Fireworks-hosted open models (glm, kimi, deepseek) have no search tool.
	return null;
}

/**
 * Minimum `max_tokens` for a grounded call.
 *
 * A grounded Gemini answer spent 128 reasoning tokens before emitting any text.
 * At `max_tokens: 64` the response came back with `content: null`, which reads
 * as a failure but is really a truncation.
 */
export const WEB_SEARCH_MIN_MAX_TOKENS = 1024;

// ─────────────────────────────────────────────────────────────────────────────
// General capability lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything known about what a model accepts.
 *
 * Flags come from the committed `/model/info` snapshot, except `promptCaching`
 * and `webSearch`, which come from the measured lists above.
 *
 * @typedef {Object} ModelCapabilities
 * @property {string}  id                  resolved model id (aliases followed)
 * @property {boolean} known               false when the id is not on this gateway
 * @property {number|null} maxInputTokens  context window, tokens
 * @property {number|null} maxOutputTokens
 * @property {boolean} vision              accepts images
 * @property {boolean} pdf                 accepts PDF parts
 * @property {boolean} audio               accepts audio parts
 * @property {boolean} tools               function calling
 * @property {boolean} toolChoice          `tool_choice` honored
 * @property {boolean} parallelTools       may emit several tool calls per turn
 * @property {boolean} reasoning           `reasoning_effort` honored
 * @property {boolean} thinkingAlwaysOn    reasoning cannot be turned off
 * @property {boolean} responseSchema      `response_format.json_schema` honored
 * @property {boolean} promptCaching       measured, not the gateway's flag
 * @property {WebSearchStyle} webSearch    tool shape, or null
 * @property {boolean} computerUse
 * @property {boolean} urlContext
 * @property {string|null} upstreamModel   what the gateway actually calls
 */

/**
 * Looks up everything this package knows about a model's capabilities.
 *
 * An unknown id returns a permissive object with `known: false`. Guards treat
 * that as "assume it works" — a model the snapshot has not seen yet must not be
 * blocked locally.
 *
 * @param {string} [modelId]
 * @returns {ModelCapabilities}
 *
 * @example
 * const cap = getCapabilities('claude-sonnet-5');
 * if (cap.promptCaching) console.log('cache the system prompt');
 * if (!cap.pdf) console.warn('this model cannot read PDFs');
 */
export function getCapabilities(modelId) {
	const id = (modelId && (canonicalModelId(modelId) || modelId)) || '';
	const info = getModelInfo(id);
	const yes = (v) => v === true;

	if (!info) {
		return {
			id, known: false,
			maxInputTokens: null, maxOutputTokens: null,
			vision: true, pdf: true, audio: false,
			tools: true, toolChoice: true, parallelTools: true,
			reasoning: true, thinkingAlwaysOn: false, responseSchema: true,
			promptCaching: supportsPromptCaching(id),
			webSearch: webSearchStyle(id),
			computerUse: false, urlContext: false,
			upstreamModel: null
		};
	}

	return {
		id, known: true,
		maxInputTokens: info.maxInputTokens ?? null,
		maxOutputTokens: info.maxOutputTokens ?? null,
		vision: yes(info.supportsVision),
		pdf: yes(info.supportsPdfInput),
		audio: yes(info.supportsAudioInput),
		tools: yes(info.supportsFunctionCalling),
		toolChoice: yes(info.supportsToolChoice),
		parallelTools: yes(info.supportsParallelFunctionCalling),
		reasoning: yes(info.supportsReasoning),
		thinkingAlwaysOn: yes(info.thinkingAlwaysOn),
		responseSchema: yes(info.supportsResponseSchema),
		promptCaching: supportsPromptCaching(id),
		webSearch: webSearchStyle(id),
		computerUse: yes(info.supportsComputerUse),
		urlContext: yes(info.supportsUrlContext),
		upstreamModel: info.upstreamModel ?? null
	};
}

/** @param {string} [m] @returns {boolean} */
export function supportsVision(m) { return getCapabilities(m).vision; }
/** @param {string} [m] @returns {boolean} */
export function supportsPdf(m) { return getCapabilities(m).pdf; }
/** @param {string} [m] @returns {boolean} */
export function supportsTools(m) { return getCapabilities(m).tools; }
/** @param {string} [m] @returns {boolean} */
export function supportsReasoning(m) { return getCapabilities(m).reasoning; }

/**
 * Context window in tokens, or `null` when the model is not in the snapshot.
 *
 * @param {string} [modelId]
 * @returns {number | null}
 */
export function contextWindow(modelId) {
	return getCapabilities(modelId).maxInputTokens;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assistant prefill
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How a model reacts to a trailing `{ role: 'assistant' }` message.
 *
 * There are **three** behaviors, not two, and telling them apart matters: on a
 * `restart` model, concatenating your prefix onto the reply produces corrupt
 * output like `["red",["red","blue"]`.
 *
 * - `continue` — the model resumes from your prefix. Concatenate.
 * - `restart`  — 200, but the model re-emits the whole answer including your
 *                prefix. Send it (it still steers the format), return the reply
 *                unchanged.
 * - `reject`   — 400 `This model does not support...`. Do not send it.
 *
 * Measured 2026-09-11, every model on the gateway, prefix `["red",`:
 *
 * | behavior | models |
 * |----------|--------|
 * | continue | claude-haiku-4-5, gpt-6-astra, glm-5.3, glm-5.3-flash, glm-fast-latest |
 * | restart  | gpt-5.5, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, kimi-k3, deepseek-v4.1-flash |
 * | reject   | claude-sonnet-5, claude-opus-5, claude-opus-4-7, claude-fable-5-1, claude-fable-5, gemini-3.8-flash, advisor, executor |
 *
 * Note the shape of that table: `model_info.supports_assistant_prefill` names
 * `claude-haiku-4-5` and nothing else, and for the Anthropic family it is
 * exactly right. Setting `reasoning_effort: 'none'` or `thinking: disabled`
 * does not make Sonnet or Opus accept a prefill — it is a model limit, not a
 * reasoning interaction.
 *
 * @typedef {'continue' | 'restart' | 'reject'} PrefillMode
 */

/** @type {Readonly<Record<string, PrefillMode>>} */
export const PREFILL_MODES = Object.freeze({
	'claude-haiku-4-5': 'continue',
	'gpt-6-astra': 'continue',
	'glm-5.3': 'continue',
	'glm-5.3-flash': 'continue',
	'glm-fast-latest': 'continue',
	'gpt-5.5': 'restart',
	'gpt-5.6-sol': 'restart',
	'gpt-5.6-terra': 'restart',
	'gpt-5.6-luna': 'restart',
	'kimi-k3': 'restart',
	'deepseek-v4.1-flash': 'restart',
	'claude-sonnet-5': 'reject',
	'claude-opus-5': 'reject',
	'claude-opus-4-7': 'reject',
	'claude-fable-5-1': 'reject',
	'claude-fable-5': 'reject',
	'gemini-3.8-flash': 'reject',
	'advisor': 'reject',
	'executor': 'reject'
});

/**
 * How this model handles a prefill. Unknown models are assumed `restart`, the
 * safe middle: the prefix is sent but never concatenated, so the worst case is
 * a wasted hint rather than corrupt output.
 *
 * @param {string} [modelId]
 * @returns {PrefillMode}
 */
export function prefillMode(modelId) {
	if (!modelId) return 'restart';
	const id = canonicalModelId(modelId) || modelId;
	return PREFILL_MODES[id] ?? 'restart';
}

/**
 * Whether a prefill is worth sending at all — true for `continue` and
 * `restart`, false for `reject`.
 *
 * @param {string} [modelId]
 * @returns {boolean}
 */
export function supportsPrefill(modelId) {
	return prefillMode(modelId) !== 'reject';
}
