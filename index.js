/**
 * @fileoverview ak-litellm — the ak-claude / ak-gemini public API, routed
 * through the Mixpanel LiteLLM gateway.
 *
 * Swapping `import … from 'ak-claude'` or `'ak-gemini'` to `'ak-litellm'` is
 * intended to be the only edit an app needs. The alias layer in `compat.js`
 * accepts both packages' option names; anything this gateway cannot back is
 * warned about once and ignored, never silently dropped and never thrown.
 */

// ── Classes ──
export { default as Transformer } from './transformer.js';
export { default as Chat } from './chat.js';
export { default as Message } from './message.js';
export { default as ToolAgent } from './tool-agent.js';
export { default as CodeAgent } from './code-agent.js';
export { default as RagAgent } from './rag-agent.js';

// ── Base class ──
// Aliased so `import { BaseClaude } from 'ak-litellm'` and
// `import { BaseGemini } from 'ak-litellm'` both resolve.
export { default as BaseLiteLLM } from './base.js';
export { default as BaseClaude, default as BaseGemini } from './base.js';

// ── Classes this gateway cannot back (constructor throws, import does not) ──
export { Embedding, ImageGenerator, AgentQuery } from './unsupported.js';

// ── Pricing / model helpers ──
export {
	MODEL_PRICING,
	MODEL_PRICING_AS_OF,
	MODEL_ALIASES,
	MODEL_INFO,
	EFFORT_LEVELS,
	DEFAULT_MODEL,
	resolvePricing,
	computeCost,
	budgetTokensToEffort,
	listModels,
	getModelInfo,
	refreshModelInfo
} from './models.js';

// ── Compat layer (exported for tests and for consumers inspecting behavior) ──
export { normalizeOptions, samplingSupport, modelProvider } from './compat.js';

// ── Capability layer ─────────────────────────────────────────────────────────
// What each model can actually do. Two of the gateway's own flags are wrong
// (prompt caching and web search), so these are measured, not reported.
export {
	getCapabilities,
	contextWindow,
	supportsVision,
	supportsPdf,
	supportsTools,
	supportsReasoning,
	supportsPromptCaching,
	supportsPrefill,
	prefillMode,
	webSearchStyle,
	CACHE_CAPABLE_MODELS,
	CACHE_MIN_TOKENS,
	CACHE_WRITE_MULTIPLIER,
	CACHE_READ_MULTIPLIER,
	PREFILL_MODES,
	WEB_SEARCH_MIN_MAX_TOKENS
} from './capabilities.js';

// ── Transports ───────────────────────────────────────────────────────────────
export { toResponsesRequest, fromResponsesReply, needsResponsesTransport } from './responses.js';

// ── Unavailable on this gateway (constructors throw with the remedy) ─────────
export { BatchTransformer } from './unsupported.js';

// ── Utilities ──
export { default as log } from './logger.js';
export { extractJSON, attemptJSONRecovery, validateSchema, isJSON, isJSONStr } from './json-helpers.js';

/**
 * ak-gemini re-exports these three from `@google/genai`. They are reproduced
 * here as plain frozen objects with identical string values so that code doing
 * `safetySettings: [{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, … }]`
 * still compiles and runs. `safetySettings` itself is an ignored option — the
 * gateway has no equivalent — so these values reach nothing on the wire.
 */
export const ThinkingLevel = Object.freeze({
	THINKING_LEVEL_UNSPECIFIED: 'THINKING_LEVEL_UNSPECIFIED',
	MINIMAL: 'MINIMAL',
	LOW: 'LOW',
	MEDIUM: 'MEDIUM',
	HIGH: 'HIGH'
});

/** @see ThinkingLevel */
export const HarmCategory = Object.freeze({
	HARM_CATEGORY_UNSPECIFIED: 'HARM_CATEGORY_UNSPECIFIED',
	HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
	HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
	HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
	HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
	HARM_CATEGORY_CIVIC_INTEGRITY: 'HARM_CATEGORY_CIVIC_INTEGRITY',
	HARM_CATEGORY_JAILBREAK: 'HARM_CATEGORY_JAILBREAK',
	HARM_CATEGORY_IMAGE_HATE: 'HARM_CATEGORY_IMAGE_HATE',
	HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT: 'HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT',
	HARM_CATEGORY_IMAGE_HARASSMENT: 'HARM_CATEGORY_IMAGE_HARASSMENT',
	HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT'
});

/** @see ThinkingLevel */
export const HarmBlockThreshold = Object.freeze({
	HARM_BLOCK_THRESHOLD_UNSPECIFIED: 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
	BLOCK_LOW_AND_ABOVE: 'BLOCK_LOW_AND_ABOVE',
	BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
	BLOCK_ONLY_HIGH: 'BLOCK_ONLY_HIGH',
	BLOCK_NONE: 'BLOCK_NONE',
	OFF: 'OFF'
});

import Transformer from './transformer.js';
import Chat from './chat.js';
import Message from './message.js';
import ToolAgent from './tool-agent.js';
import CodeAgent from './code-agent.js';
import RagAgent from './rag-agent.js';

export default { Transformer, Chat, Message, ToolAgent, CodeAgent, RagAgent };
