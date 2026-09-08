/**
 * @fileoverview The drop-in compatibility layer.
 *
 * `ak-litellm` must accept every constructor option that `ak-claude` or
 * `ak-gemini` accepts, so an app can swap one import line and keep running.
 * The two packages disagree on names (`maxTokens` vs `maxOutputTokens`), on
 * shapes (`thinking` vs `thinkingConfig`), and on which options exist at all
 * (`vertexai`, `safetySettings`). This file reconciles all of it into one
 * canonical option set that `base.js` and the six classes consume.
 *
 * Three rules govern the behaviour, in order:
 *
 * 1. An option that has a real equivalent here is TRANSLATED.
 * 2. An option that has no equivalent is ACCEPTED, WARNED ABOUT ONCE, and
 *    DROPPED. It never throws, and it is never silent.
 * 3. A parameter the gateway would reject is GATED OUT before the request is
 *    built. `drop_params` is not enabled on this deployment — sending `top_k`
 *    to a `gpt-*` model is a 400, not a no-op.
 */

import { EFFORT_LEVELS, MODEL_ALIASES, budgetTokensToEffort, canonicalModelId, getModelInfo } from './models.js';
import log from './logger.js';

/**
 * Process-global warn-once registry, per spec §6.3. Hung off `globalThis` so a
 * mixed ESM/CJS load of the package does not double-warn.
 * @type {Set<string>}
 */
const WARNED = (globalThis.__akLitellmCompatWarned ??= new Set());

/** Test seam — clears the warn-once registry. */
export function _resetWarnings() {
	WARNED.clear();
}

/**
 * Emits `message` the first time `key` is seen in this process.
 *
 * @param {string} key    warn-once key — the option name, NOT the instance
 * @param {string} message
 * @param {boolean} [silent] set when `logLevel: 'none'` or AK_LITELLM_SILENCE_COMPAT=1
 * @returns {boolean} true if the warning was emitted
 */
export function warnOnce(key, message, silent = false) {
	if (WARNED.has(key)) return false;
	WARNED.add(key);
	if (silent || process.env.AK_LITELLM_SILENCE_COMPAT === '1') return false;

	// Spec §6.3: the only two suppressors are `logLevel: 'none'` (the `silent`
	// argument) and AK_LITELLM_SILENCE_COMPAT. A compat warning says an option the
	// caller wrote will not take effect, so `logLevel: 'error'` must not hide it.
	// Constructor-time warnings already escape pino's filter because they fire
	// before the logger level is configured; this keeps request-time ones equal.
	if (log.isLevelEnabled?.('warn')) log.warn(message);
	else console.warn(message);
	return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// §6.1 Synonyms — both names accepted, canonical wins when both are given
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Record<string, string>} alias -> canonical */
export const SYNONYMS = {
	maxOutputTokens: 'maxTokens',
	reasoningEffort: 'effort',
	enableGrounding: 'enableWebSearch',
	groundingConfig: 'webSearchConfig',
	resourceExhaustedRetries: 'maxRetries',
	resourceExhaustedDelay: 'retryDelay'
};

// ─────────────────────────────────────────────────────────────────────────────
// §6.3 Accepted-and-ignored
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Record<string, string>} option -> why it cannot work here */
const IGNORED = {
	vertexai: 'the Mixpanel LiteLLM gateway authenticates with a static bearer key only.',
	vertexProjectId: 'the Mixpanel LiteLLM gateway authenticates with a static bearer key only.',
	vertexRegion: 'the Mixpanel LiteLLM gateway authenticates with a static bearer key only.',
	project: 'the Mixpanel LiteLLM gateway authenticates with a static bearer key only.',
	location: 'the Mixpanel LiteLLM gateway authenticates with a static bearer key only.',
	googleAuthOptions: 'the Mixpanel LiteLLM gateway authenticates with a static bearer key only.',
	safetySettings: 'the gateway exposes no content-filter controls.',
	serviceTier: 'the gateway does not expose provider service tiers.',
	cachedContent: 'the gateway has no explicit-cache API.',
	adaptiveThinking: 'reasoning depth is controlled by `effort` alone on this gateway.',
	includeServerSideToolInvocations: 'the gateway does not return server-side tool invocation records.',
	vertexNativeStructuredOutput: 'structured output always uses `response_format.json_schema` here.',
	enableCitations: 'the gateway has no native citation feature — ask for sources in your prompt instead.'
};

/**
 * Prompt caching gets its own wording. The other ignored options can never work
 * through a gateway; this one is a gateway defect that may be fixed upstream,
 * and it costs the caller real money, so the warning says so.
 * @type {string[]}
 */
const INERT_CACHE_OPTIONS = ['cacheSystemPrompt', 'cacheTtl'];

// ─────────────────────────────────────────────────────────────────────────────
// Model families — §6.4 and §6.5 parameter gating
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which upstream provider actually serves a gateway model id.
 *
 * Reads `/model/info`'s `upstreamModel` when the id is known (so `advisor`,
 * which is `vertex_ai/claude-fable-5-1`, is correctly Anthropic) and falls back
 * to the id itself for models added to the gateway after this table was built.
 *
 * @param {string} [modelId]
 * @returns {'anthropic' | 'google' | 'openai' | 'qwen' | 'other'}
 */
export function modelProvider(modelId) {
	const upstream = getModelInfo(modelId || '')?.upstreamModel || '';
	const probe = `${modelId || ''} ${upstream}`.toLowerCase();
	if (probe.includes('claude') || probe.includes('anthropic')) return 'anthropic';
	if (probe.includes('gemini')) return 'google';
	if (probe.includes('gpt') || probe.includes('openai')) return 'openai';
	if (probe.includes('qwen')) return 'qwen';
	return 'other';
}

/**
 * Anthropic models that reject `temperature` != 1, `top_p` and `top_k` outright
 * — the Claude 5 family. Matched against the id AND the `/model/info`
 * `upstreamModel`, so the team aliases (`advisor` → `vertex_ai/claude-fable-5-1`,
 * `executor` → `vertex_ai/claude-sonnet-5`) are covered too.
 *
 * Probed 2026-09-08: `claude-sonnet-5` and `claude-opus-4-7` return
 * `litellm.UnsupportedParamsError` for all three. `claude-haiku-4-5` accepts
 * them. **When a new Claude id appears on the gateway, check this regex.**
 */
const CLAUDE5_FAMILY_REGEX = /claude-(fable|mythos|opus-5|opus-4-8|opus-4-7|sonnet-5)/i;

/**
 * @typedef {Object} SamplingSupport
 * @property {boolean} temperature
 * @property {boolean} topP
 * @property {boolean} topK
 * @property {boolean} exclusiveTempTopP true when the provider rejects both together
 */

/**
 * §6.5 — which sampling parameters a model actually accepts.
 *
 * `drop_params` is NOT enabled on this deployment, so an unsupported parameter
 * is a 400, not a no-op. All four rows below were probed live on 2026-09-08:
 *
 * | model                | temperature | top_p | top_k | note                          |
 * |----------------------|-------------|-------|-------|-------------------------------|
 * | claude-sonnet-5      | ✗ (only 1)  | ✗     | ✗     | whole Claude 5 family         |
 * | claude-haiku-4-5     | ✓           | ✓     | ✓     | but not temperature+top_p together |
 * | gpt-5.6-luna         | ✗ (only 1)  | ✗     | ✗     | reasoning models              |
 * | gemini-3.8-flash     | ✓           | ✓     | ✓     |                               |
 * | kimi/qwen/glm/deepseek| ✓          | ✓     | ✓     |                               |
 *
 * Anthropic additionally rejects all three whenever extended thinking is on:
 * "`temperature` may only be set to 1 when thinking is enabled" (400, observed
 * live on claude-haiku-4-5 + reasoning_effort). Pass `{ reasoning: true }` when
 * the request carries `reasoning_effort`.
 *
 * @param {string} [modelId]
 * @param {{ reasoning?: boolean }} [opts]
 * @returns {SamplingSupport}
 */
export function samplingSupport(modelId, opts = {}) {
	const provider = modelProvider(modelId);
	const upstream = getModelInfo(modelId || '')?.upstreamModel || '';
	const probe = `${modelId || ''} ${upstream}`;

	if (provider === 'anthropic') {
		if (opts.reasoning || CLAUDE5_FAMILY_REGEX.test(probe)) {
			return { temperature: false, topP: false, topK: false, exclusiveTempTopP: false };
		}
		// Served through Vertex, which rejects temperature and top_p together.
		return { temperature: true, topP: true, topK: true, exclusiveTempTopP: true };
	}

	// Every GPT model on this gateway is a reasoning model; they accept only the
	// default temperature and reject top_p / top_k entirely.
	if (provider === 'openai') {
		return { temperature: false, topP: false, topK: false, exclusiveTempTopP: false };
	}

	return { temperature: true, topP: true, topK: true, exclusiveTempTopP: false };
}

/**
 * §6.5 — `top_k` is not an OpenAI parameter. The gateway forwards it verbatim
 * and OpenAI rejects it with `UnsupportedParamsError`.
 *
 * @param {string} [modelId]
 * @returns {boolean}
 */
export function supportsTopK(modelId) {
	return samplingSupport(modelId).topK;
}

/**
 * §6.4 — web search is the Anthropic server-tool shape. It is the only shape
 * this gateway accepts (`web_search_options` 400s), so it only works on Claude.
 *
 * @param {string} [modelId]
 * @returns {boolean}
 */
export function supportsWebSearch(modelId) {
	return modelProvider(modelId) === 'anthropic';
}

// ─────────────────────────────────────────────────────────────────────────────
// Effort
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The union vocabulary → the gateway's three-valued `reasoning_effort`.
 * @type {Record<string, 'low' | 'medium' | 'high'>}
 */
const EFFORT_TO_WIRE = {
	minimal: 'low',
	low: 'low',
	medium: 'medium',
	high: 'high',
	xhigh: 'high',
	max: 'high'
};

/**
 * Validates an `effort` value against the union vocabulary.
 *
 * @param {string | null | undefined} effort
 * @returns {string | null | undefined} the value unchanged, or null/undefined
 * @throws on an unrecognized string — same behaviour as ak-claude and ak-gemini
 */
export function normalizeEffort(effort) {
	if (effort === null || effort === undefined) return effort;
	const value = String(effort).toLowerCase();
	if (!EFFORT_LEVELS.includes(/** @type {any} */(value))) {
		throw new Error(
			`ak-litellm: invalid effort '${effort}'. Expected one of: ${EFFORT_LEVELS.join(', ')}.`
		);
	}
	return value;
}

/**
 * Maps a validated effort level onto the wire field.
 *
 * @param {string | null | undefined} effort
 * @returns {'low' | 'medium' | 'high' | null} null means "do not send the field"
 */
export function effortToReasoningEffort(effort) {
	if (effort === null || effort === undefined) return null;
	return EFFORT_TO_WIRE[String(effort).toLowerCase()] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model name
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves a sibling-package model id to one this gateway serves.
 *
 * `models.canonicalModelId()` is deliberately silent (it runs on every pricing
 * lookup); the single user-facing warning belongs here, at construction.
 *
 * @param {string} modelName
 * @param {string} klass
 * @param {boolean} [silent]
 * @returns {string}
 */
export function resolveModelName(modelName, klass, silent = false) {
	const canonical = canonicalModelId(modelName);
	if (canonical !== modelName) {
		warnOnce(
			`model:${modelName}`,
			`[ak-litellm] ${klass}: model '${modelName}' is not served by the Mixpanel ` +
			`LiteLLM gateway — using '${canonical}' instead. Pass \`modelName\` explicitly ` +
			`to choose a different one.`,
			silent
		);
	}
	return canonical;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool shapes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Accepts a tool declaration in Claude (`input_schema`), Gemini
 * (`parametersJsonSchema`) or OpenAI (`function.parameters`) form and emits the
 * OpenAI form the gateway expects.
 *
 * @param {any[]} tools
 * @param {string} klass
 * @returns {any[]}
 */
export function normalizeToolDeclarations(tools, klass) {
	return (tools || []).map((t, i) => {
		// Already an OpenAI function tool — pass through.
		if (t?.type === 'function' && t.function) return t;
		// A server tool (web search) — pass through; §6.4 gates it by model.
		if (t?.type && typeof t.type === 'string' && t.type !== 'function' && !t.input_schema) return t;

		const schema = t?.input_schema || t?.inputSchema || t?.parametersJsonSchema || t?.parameters;
		if (!schema) {
			// Forwarding `undefined` produces an opaque API 400 — fail here instead.
			throw new Error(
				`${klass}: tool ${t?.name ? `"${t.name}"` : `at index ${i}`} has no parameter ` +
				`schema. Provide one of: input_schema (Claude), inputSchema, parametersJsonSchema ` +
				`(Gemini), or parameters (OpenAI). For a no-argument tool use ` +
				`{ type: 'object', properties: {} }.`
			);
		}
		return {
			type: 'function',
			function: { name: t.name, description: t.description, parameters: schema }
		};
	});
}

/**
 * §6.4 — builds the Anthropic server web-search tool, or null when the model
 * cannot accept it.
 *
 * @param {any} config `webSearchConfig` / `groundingConfig`
 * @param {string} modelId
 * @param {string} klass
 * @param {boolean} [silent]
 * @returns {any | null}
 */
export function buildWebSearchTool(config, modelId, klass, silent = false) {
	if (!supportsWebSearch(modelId)) {
		warnOnce(
			'enableWebSearch:model',
			`[ak-litellm] ${klass}: \`enableWebSearch\` is ignored on '${modelId}' — web ` +
			`search on this gateway is the Anthropic server tool, which only claude-* models ` +
			`accept. Use a claude-* model to enable it.`,
			silent
		);
		return null;
	}

	const cfg = config || {};
	// ak-gemini's groundingConfig vocabulary.
	const blocked = cfg.blocked_domains ?? cfg.excludeDomains;
	for (const dropped of ['searchTypes', 'timeRangeFilter']) {
		if (cfg[dropped] !== undefined) {
			warnOnce(
				`groundingConfig.${dropped}`,
				`[ak-litellm] ${klass}: option \`groundingConfig.${dropped}\` is ignored — the ` +
				`Anthropic web_search tool has no equivalent. Remove it to silence this warning.`,
				silent
			);
		}
	}

	/** @type {any} */
	const tool = { type: 'web_search_20250305', name: 'web_search' };
	if (cfg.max_uses !== undefined) tool.max_uses = cfg.max_uses;
	if (cfg.allowed_domains !== undefined) tool.allowed_domains = cfg.allowed_domains;
	if (blocked !== undefined) tool.blocked_domains = blocked;
	return tool;
}

/**
 * §6.2 — Anthropic `tool_choice` → OpenAI `tool_choice`.
 *
 * Accepts the Anthropic object form, the OpenAI string/object form, and
 * `undefined`. Returns the wire value or undefined.
 *
 * @param {any} toolChoice
 * @returns {any}
 */
export function normalizeToolChoice(toolChoice) {
	if (toolChoice === undefined || toolChoice === null) return undefined;
	if (typeof toolChoice === 'string') return toolChoice; // already OpenAI
	if (toolChoice.type === 'function' && toolChoice.function) return toolChoice; // already OpenAI

	switch (toolChoice.type) {
		case 'auto': return 'auto';
		case 'any': return 'required';
		case 'none': return 'none';
		case 'tool': return { type: 'function', function: { name: toolChoice.name } };
		default: return undefined;
	}
}

/**
 * §6.2 — ak-gemini `toolConfig.functionCallingConfig` → OpenAI `tool_choice`.
 *
 * @param {any} toolConfig
 * @returns {any}
 */
function toolConfigToToolChoice(toolConfig) {
	const fc = toolConfig?.functionCallingConfig;
	if (!fc) return undefined;
	const mode = String(fc.mode || '').toUpperCase();
	const names = fc.allowedFunctionNames;
	if (mode === 'NONE') return 'none';
	if (mode === 'ANY') {
		return names?.length === 1
			? { type: 'function', function: { name: names[0] } }
			: 'required';
	}
	if (mode === 'AUTO') return 'auto';
	return undefined;
}

/**
 * §6.2 — ak-gemini billing labels → the gateway's request metadata.
 *
 * @param {Record<string, any> | undefined | null} labels
 * @returns {{ tags: string[] } | undefined}
 */
export function labelsToMetadata(labels) {
	if (!labels || typeof labels !== 'object') return undefined;
	const tags = Object.entries(labels).map(([k, v]) => `${k}:${v}`);
	return tags.length ? { tags } : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// The entry point
// ─────────────────────────────────────────────────────────────────────────────

/** ak-gemini `chatConfig` key → canonical top-level option. */
const CHAT_CONFIG_KEYS = {
	systemInstruction: 'systemPrompt',
	maxOutputTokens: 'maxOutputTokens',   // resolved by the synonym pass below
	temperature: 'temperature',
	topP: 'topP',
	topK: 'topK',
	responseSchema: 'responseSchema',
	responseMimeType: 'responseMimeType',
	thinkingConfig: 'thinkingConfig',
	safetySettings: 'safetySettings',
	labels: 'labels',
	tools: 'tools',
	toolConfig: 'toolConfig'
};

/**
 * Turns any ak-claude / ak-gemini / ak-litellm option bag into the canonical
 * one the classes consume. Every class calls this first thing in its
 * constructor.
 *
 * Order matters:
 *   1. `chatConfig` merges in at the LOWEST precedence.
 *   2. Synonyms resolve, canonical name winning.
 *   3. Thinking shapes collapse into `effort`.
 *   4. Tool-choice shapes collapse into an OpenAI `tool_choice`.
 *   5. Ignored options warn and are deleted.
 *   6. The model id resolves through `MODEL_ALIASES`.
 *   7. `effort` is validated (the only step that can throw).
 *
 * @param {any} [raw] user-supplied constructor options
 * @param {string} [klass] class name, for warning messages
 * @returns {any} canonical options
 */
export function normalizeOptions(raw = {}, klass = 'ak-litellm') {
	/** @type {any} */
	const o = { ...(raw || {}) };
	const silent = o.logLevel === 'none';

	// ── 1. chatConfig merges at the lowest precedence ─────────────────────────
	if (o.chatConfig && typeof o.chatConfig === 'object') {
		for (const [from, to] of Object.entries(CHAT_CONFIG_KEYS)) {
			if (o.chatConfig[from] !== undefined && o[to] === undefined) o[to] = o.chatConfig[from];
		}
		delete o.chatConfig;
	}

	// ── 2. Synonyms ───────────────────────────────────────────────────────────
	for (const [alias, canonical] of Object.entries(SYNONYMS)) {
		if (o[alias] === undefined) continue;
		if (o[canonical] === undefined) {
			o[canonical] = o[alias];
		} else {
			warnOnce(
				`synonym:${alias}`,
				`[ak-litellm] ${klass}: both \`${canonical}\` and \`${alias}\` were given. ` +
				`They are the same option — using \`${canonical}\`.`,
				silent
			);
		}
		delete o[alias];
	}

	// ── 3. Thinking shapes → effort ───────────────────────────────────────────
	// ak-claude: thinking: { type: 'enabled', budget_tokens } | { type: 'adaptive' }
	if (o.thinking && typeof o.thinking === 'object') {
		if (o.thinking.type === 'enabled' && o.thinking.budget_tokens != null) {
			if (o.effort === undefined) o.effort = budgetTokensToEffort(o.thinking.budget_tokens);
		} else if (o.thinking.type === 'adaptive') {
			if (o.effort === undefined) o.effort = 'medium';
		}
		delete o.thinking;
	}
	// ak-gemini: thinkingConfig: { thinkingLevel } | { thinkingBudget }
	if (o.thinkingConfig && typeof o.thinkingConfig === 'object') {
		if (o.thinkingConfig.thinkingLevel != null) {
			if (o.effort === undefined) o.effort = String(o.thinkingConfig.thinkingLevel).toLowerCase();
		} else if (o.thinkingConfig.thinkingBudget != null) {
			if (o.effort === undefined) o.effort = budgetTokensToEffort(o.thinkingConfig.thinkingBudget);
		}
		delete o.thinkingConfig;
	}

	// ── 3b. responseMimeType → responseFormat ─────────────────────────────────
	// ak-gemini's lightweight JSON mode. A responseSchema, if present, is the
	// stronger signal and is handled by the classes themselves.
	if (o.responseMimeType !== undefined) {
		if (o.responseMimeType === 'application/json' && o.responseFormat === undefined) {
			o.responseFormat = 'json';
		}
		delete o.responseMimeType;
	}

	// ── 4. Tool choice ────────────────────────────────────────────────────────
	if (o.toolConfig !== undefined) {
		const fromConfig = toolConfigToToolChoice(o.toolConfig);
		if (fromConfig !== undefined && o.toolChoice === undefined) o.toolChoice = fromConfig;
		delete o.toolConfig;
	}
	if (o.toolChoice !== undefined) o.toolChoice = normalizeToolChoice(o.toolChoice);

	// ── 5. Accepted-and-ignored ───────────────────────────────────────────────
	for (const opt of Object.keys(IGNORED)) {
		if (o[opt] === undefined) continue;
		warnOnce(
			opt,
			`[ak-litellm] ${klass}: option \`${opt}\` is ignored — ${IGNORED[opt]} ` +
			`Remove it to silence this warning.`,
			silent
		);
		delete o[opt];
	}
	for (const opt of INERT_CACHE_OPTIONS) {
		if (o[opt] === undefined) continue;
		warnOnce(
			opt,
			`[ak-litellm] ${klass}: \`${opt}\` is accepted but inert — prompt caching does ` +
			`not engage through the Mixpanel gateway (verified 2026-09-08). You will be billed ` +
			`full input price on every call.`,
			silent
		);
		delete o[opt];
	}

	// ── 6. Model id ───────────────────────────────────────────────────────────
	if (o.modelName !== undefined && o.modelName !== null) {
		o.modelName = resolveModelName(String(o.modelName), klass, silent);
	}

	// ── 7. Effort validation — the only step that throws ──────────────────────
	if (o.effort !== undefined) o.effort = normalizeEffort(o.effort);

	return o;
}

export { EFFORT_LEVELS, MODEL_ALIASES };
