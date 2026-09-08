var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// index.js
var index_exports = {};
__export(index_exports, {
  AgentQuery: () => AgentQuery,
  BaseClaude: () => base_default,
  BaseGemini: () => base_default,
  BaseLiteLLM: () => base_default,
  Chat: () => chat_default,
  CodeAgent: () => code_agent_default,
  DEFAULT_MODEL: () => DEFAULT_MODEL,
  EFFORT_LEVELS: () => EFFORT_LEVELS,
  Embedding: () => Embedding,
  HarmBlockThreshold: () => HarmBlockThreshold,
  HarmCategory: () => HarmCategory,
  ImageGenerator: () => ImageGenerator,
  MODEL_ALIASES: () => MODEL_ALIASES,
  MODEL_INFO: () => MODEL_INFO,
  MODEL_PRICING: () => MODEL_PRICING,
  MODEL_PRICING_AS_OF: () => MODEL_PRICING_AS_OF,
  Message: () => message_default,
  RagAgent: () => rag_agent_default,
  ThinkingLevel: () => ThinkingLevel,
  ToolAgent: () => tool_agent_default,
  Transformer: () => transformer_default,
  attemptJSONRecovery: () => attemptJSONRecovery,
  budgetTokensToEffort: () => budgetTokensToEffort,
  computeCost: () => computeCost,
  default: () => index_default,
  extractJSON: () => extractJSON,
  getModelInfo: () => getModelInfo,
  isJSON: () => isJSON,
  isJSONStr: () => isJSONStr,
  listModels: () => listModels,
  log: () => logger_default,
  modelProvider: () => modelProvider,
  normalizeOptions: () => normalizeOptions,
  refreshModelInfo: () => refreshModelInfo,
  resolvePricing: () => resolvePricing,
  samplingSupport: () => samplingSupport,
  validateSchema: () => validateSchema
});
module.exports = __toCommonJS(index_exports);

// transformer.js
var import_promises = __toESM(require("fs/promises"), 1);
var import_path = __toESM(require("path"), 1);

// base.js
var import_config2 = require("dotenv/config");

// logger.js
var import_pino = __toESM(require("pino"), 1);
var isDev = process.env.NODE_ENV !== "production";
var logger = (0, import_pino.default)({
  level: process.env.LOG_LEVEL || "info",
  // Supports 'fatal', 'error', 'warn', 'info', 'debug', 'trace'
  messageKey: "message",
  // GCP expects 'message' instead of Pino's default 'msg'
  transport: isDev ? {
    target: "pino-pretty",
    // Prettified output for local dev
    options: { colorize: true, translateTime: true }
  } : void 0
  // In prod/cloud, keep as JSON for cloud logging
});
var logger_default = logger;

// models.js
var MODEL_PRICING_AS_OF = "2026-09-08";
var MODEL_PRICING = {
  "advisor": { "input": 10, "output": 50, "cachedInput": 0.25 },
  "executor": { "input": 2, "output": 10, "cachedInput": 0.2 },
  "claude-opus-5": { "input": 5, "output": 25, "cachedInput": 0.5 },
  "claude-sonnet-5": { "input": 2, "output": 10, "cachedInput": 0.2 },
  "claude-opus-4-7": { "input": 5, "output": 25, "cachedInput": 0.5 },
  "claude-haiku-4-5": { "input": 1, "output": 5, "cachedInput": 0.1 },
  "claude-fable-5-1": { "input": 10, "output": 50, "cachedInput": 0.25 },
  "claude-fable-5": { "input": 10, "output": 50, "cachedInput": 0.25 },
  "gemini-3.8-flash": { "input": 0.75, "output": 3.75, "cachedInput": 0.075 },
  "gpt-5.5": { "input": 5, "output": 30, "cachedInput": 0.5 },
  "gpt-5.6-sol": { "input": 4, "output": 20, "cachedInput": 0.4 },
  "gpt-5.6-terra": { "input": 2, "output": 12, "cachedInput": 0.2 },
  "gpt-5.6-luna": { "input": 0.2, "output": 1.2, "cachedInput": 0.02 },
  "gpt-6-astra": { "input": 10, "output": 50, "cachedInput": 1 },
  "glm-5.3": { "input": 1.4, "output": 4.4, "cachedInput": 0.26 },
  "glm-5.3-flash": { "input": 0.15, "output": 0.5, "cachedInput": 0.03 },
  "kimi-k3": { "input": 3, "output": 15, "cachedInput": 0.3 },
  "deepseek-v4-pro": { "input": 1.32, "output": 3.96, "cachedInput": 0.044 },
  "deepseek-v4-flash": { "input": 0.22, "output": 0.66, "cachedInput": 7e-3 },
  "qwen3.8-max": { "input": 2, "output": 6, "cachedInput": 0.25 },
  "glm-fast-latest": { "input": 2.1, "output": 6.6, "cachedInput": 0.21 }
};
var MODEL_INFO = {
  "advisor": { "maxInputTokens": 1e6, "maxOutputTokens": 128e3, "mode": "chat", "upstreamModel": "vertex_ai/claude-fable-5-1", "directAccess": false, "teamIds": ["sales"], "lifecycle": "integration", "traits": ["advisor"], "guidance": "Stable model name for the Pi Advisor integration; not intended for interactive selection.", "spotlight": false, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "executor": { "maxInputTokens": 1e6, "maxOutputTokens": 128e3, "mode": "chat", "upstreamModel": "vertex_ai/claude-sonnet-5", "directAccess": false, "teamIds": ["sales"], "lifecycle": "integration", "traits": ["executor"], "guidance": "Stable model name for the Pi Advisor executor; not intended for interactive selection.", "spotlight": false, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "claude-opus-5": { "maxInputTokens": 1e6, "maxOutputTokens": 128e3, "mode": "chat", "upstreamModel": "vertex_ai/claude-opus-5", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": ["advisor", "design"], "guidance": "Use for difficult architecture, design, and review work where quality matters more than cost.", "spotlight": false, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "claude-sonnet-5": { "maxInputTokens": 1e6, "maxOutputTokens": 128e3, "mode": "chat", "upstreamModel": "vertex_ai/claude-sonnet-5", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": ["daily-driver"], "guidance": "Recommended default for routine engineering work.", "spotlight": false, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "claude-opus-4-7": { "maxInputTokens": 1e6, "maxOutputTokens": 128e3, "mode": "chat", "upstreamModel": "vertex_ai/claude-opus-4-7", "directAccess": false, "teamIds": ["sales"], "lifecycle": "legacy", "traits": ["advisor", "design"], "guidance": "Previous-generation reasoning model; prefer Claude Opus 5 for new work.", "spotlight": false, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "claude-haiku-4-5": { "maxInputTokens": 2e5, "maxOutputTokens": 8192, "mode": "chat", "upstreamModel": "vertex_ai/claude-haiku-4-5", "directAccess": false, "teamIds": ["sales"], "lifecycle": "legacy", "traits": [], "guidance": "Previous-generation low-cost model; compare with current fast models before choosing it.", "spotlight": false, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "claude-fable-5-1": { "maxInputTokens": 1e6, "maxOutputTokens": 128e3, "mode": "chat", "upstreamModel": "vertex_ai/claude-fable-5-1", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": [], "guidance": "Highest-cost Claude route; use only when its additional capability is worth the price.", "spotlight": false, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "claude-fable-5": { "maxInputTokens": 1e6, "maxOutputTokens": 128e3, "mode": "chat", "upstreamModel": "vertex_ai/claude-fable-5-1", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": [], "guidance": "Compatibility alias for Claude Fable 5.1.", "spotlight": false, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "gemini-3.8-flash": { "maxInputTokens": 1048576, "maxOutputTokens": 65536, "mode": "chat", "upstreamModel": "vertex_ai/gemini-3.8-flash", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": [], "guidance": "Current low-cost option for quick iteration.", "spotlight": true, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "gpt-5.5": { "maxInputTokens": 105e4, "maxOutputTokens": 128e3, "mode": "chat", "upstreamModel": "openai/gpt-5.5", "directAccess": false, "teamIds": ["sales"], "lifecycle": "legacy", "traits": [], "guidance": "Previous generation; prefer a GPT 5.6 tier for new work.", "spotlight": false, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "gpt-5.6-sol": { "maxInputTokens": 922e3, "maxOutputTokens": 128e3, "mode": "chat", "upstreamModel": "openai/gpt-5.6-sol", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": ["advisor", "design"], "guidance": "Flagship GPT tier for difficult design and reasoning work.", "spotlight": false, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "gpt-5.6-terra": { "maxInputTokens": 922e3, "maxOutputTokens": 128e3, "mode": "chat", "upstreamModel": "openai/gpt-5.6-terra", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": ["daily-driver"], "guidance": "Balanced GPT tier for routine engineering work.", "spotlight": false, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "gpt-5.6-luna": { "maxInputTokens": 922e3, "maxOutputTokens": 128e3, "mode": "chat", "upstreamModel": "openai/gpt-5.6-luna", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": [], "guidance": "Lowest-cost GPT tier for quick iteration and lightweight tasks.", "spotlight": true, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "gpt-6-astra": { "maxInputTokens": 922e3, "maxOutputTokens": 128e3, "mode": "chat", "upstreamModel": "openai/responses/gpt-6-astra", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": ["advisor", "design"], "guidance": "Highest-cost GPT route for the hardest end-to-end reasoning, coding, and agentic work; prefer a GPT 5.6 tier when its capability is not needed.", "spotlight": false, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "glm-5.3": { "maxInputTokens": 1048576, "maxOutputTokens": 128e3, "mode": "chat", "upstreamModel": "fireworks_ai/accounts/fireworks/models/glm-5p3", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": [], "guidance": "Strong coding and long-horizon candidate with function calling and a million-token context window.", "spotlight": false, "supportsReasoning": true, "supportsVision": false, "supportsFunctionCalling": true },
  "glm-5.3-flash": { "maxInputTokens": 1048576, "maxOutputTokens": null, "mode": "chat", "upstreamModel": "fireworks_ai/accounts/fireworks/models/glm-5p3-flash", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": ["multimodal"], "guidance": "Fast, lower-cost GLM 5.3 variant for routine coding, subagents, and quick iteration.", "spotlight": false, "supportsReasoning": null, "supportsVision": true, "supportsFunctionCalling": true },
  "kimi-k3": { "maxInputTokens": 1048576, "maxOutputTokens": 131072, "mode": "chat", "upstreamModel": "fireworks_ai/accounts/fireworks/models/kimi-k3", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": ["multimodal"], "guidance": "Flagship multimodal reasoning candidate with function calling and a million-token context window.", "spotlight": false, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "deepseek-v4-pro": { "maxInputTokens": 1048576, "maxOutputTokens": 131072, "mode": "chat", "upstreamModel": "fireworks_ai/accounts/fireworks/models/deepseek-v4-pro-0813", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": [], "guidance": "Pro-tier candidate for difficult text-only coding and reasoning work.", "spotlight": false, "supportsReasoning": true, "supportsVision": false, "supportsFunctionCalling": true },
  "deepseek-v4-flash": { "maxInputTokens": 1048576, "maxOutputTokens": 131072, "mode": "chat", "upstreamModel": "fireworks_ai/accounts/fireworks/models/deepseek-v4-flash-0731", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": [], "guidance": "Fast, low-cost option for routine coding, subagents, and quick iteration.", "spotlight": false, "supportsReasoning": true, "supportsVision": false, "supportsFunctionCalling": true },
  "qwen3.8-max": { "maxInputTokens": 262144, "maxOutputTokens": null, "mode": "chat", "upstreamModel": "fireworks_ai/accounts/fireworks/models/qwen3p8-max", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": [], "guidance": "Large reasoning candidate for complex text-only work.", "spotlight": false, "supportsReasoning": true, "supportsVision": true, "supportsFunctionCalling": true },
  "glm-fast-latest": { "maxInputTokens": 1048576, "maxOutputTokens": 131072, "mode": "chat", "upstreamModel": "fireworks_ai/routers/glm-fast-latest", "directAccess": false, "teamIds": ["sales"], "lifecycle": "current", "traits": [], "guidance": "Rolling fast GLM route for text-only agent loops.", "spotlight": false, "supportsReasoning": true, "supportsVision": false, "supportsFunctionCalling": true }
};
var MODEL_ALIASES = {
  // ak-gemini defaults, current and historical
  "gemini-3.7-flash": "gemini-3.8-flash",
  "gemini-3.6-flash": "gemini-3.8-flash",
  "gemini-3-flash-preview": "gemini-3.8-flash",
  "gemini-flash-latest": "gemini-3.8-flash",
  // ak-claude defaults, current and historical
  "claude-sonnet-4-6": "claude-sonnet-5",
  "claude-opus-4-5": "claude-opus-5",
  "claude-haiku-3-5": "claude-haiku-4-5",
  // ak-gpt
  "gpt-5": "gpt-5.5"
};
var EFFORT_LEVELS = (
  /** @type {const} */
  ["minimal", "low", "medium", "high", "xhigh", "max"]
);
var DEFAULT_MODEL = "claude-sonnet-5";
var CHARS_PER_TOKEN = 4;
function canonicalModelId(modelId) {
  if (!modelId) return null;
  return MODEL_ALIASES[modelId] || modelId;
}
function _applyIntroPricing(entry, at) {
  if (!entry?.intro) return entry;
  const when = at ? new Date(at) : /* @__PURE__ */ new Date();
  const until = /* @__PURE__ */ new Date(`${entry.intro.until}T23:59:59.999Z`);
  if (Number.isNaN(when.getTime()) || when > until) return entry;
  const { until: _u, ...rates } = entry.intro;
  return { ...entry, ...rates, introUntil: entry.intro.until };
}
function resolvePricing(modelId, opts = {}) {
  const id = canonicalModelId(modelId);
  if (!id) return null;
  const entry = MODEL_PRICING[id];
  if (!entry) return null;
  return { ..._applyIntroPricing(entry, opts.at), asOf: MODEL_PRICING_AS_OF };
}
function computeCost(usageOrModelId, modelIdOrPromptTokens, optsOrResponseTokens, extraA, extraB, legacyOpts) {
  let modelId;
  let promptTokens = 0;
  let responseTokens = 0;
  let thoughtsTokens = 0;
  let opts = {};
  if (usageOrModelId && typeof usageOrModelId === "object") {
    const usage = usageOrModelId;
    modelId = /** @type {string} */
    modelIdOrPromptTokens ?? usage.requestedModel ?? null;
    promptTokens = usage.promptTokens || 0;
    responseTokens = usage.responseTokens || 0;
    thoughtsTokens = usage.thoughtsTokens || 0;
    opts = /** @type {any} */
    optsOrResponseTokens || {};
  } else {
    modelId = /** @type {string | null} */
    usageOrModelId ?? null;
    promptTokens = Number(modelIdOrPromptTokens) || 0;
    responseTokens = Number(optsOrResponseTokens) || 0;
    thoughtsTokens = Number(extraA) || 0;
    opts = legacyOpts || {};
  }
  const pricing = resolvePricing(modelId, opts);
  if (!pricing) return null;
  const inputCost = promptTokens / 1e6 * pricing.input;
  const outputCost = (responseTokens + thoughtsTokens) / 1e6 * pricing.output;
  return inputCost + outputCost;
}
function listModels(opts = {}) {
  const ids = Object.keys(MODEL_INFO);
  if (opts.includeIntegration) return ids;
  return ids.filter((id) => MODEL_INFO[id]?.lifecycle !== "integration");
}
function getModelInfo(modelId) {
  const id = canonicalModelId(modelId);
  if (!id) return null;
  return MODEL_INFO[id] ? { ...MODEL_INFO[id] } : null;
}
async function refreshModelInfo(opts = {}) {
  const apiKey = opts.apiKey ?? process.env.LITELLM_API_KEY;
  if (!apiKey) throw new Error("ak-litellm: refreshModelInfo needs an API key \u2014 pass `apiKey` or set LITELLM_API_KEY.");
  const root = (opts.baseURL ?? process.env.LITELLM_BASE_URL ?? "https://litellm.mixpanel.org").replace(/\/v1\/?$/, "").replace(/\/$/, "");
  const res = await fetch(`${root}/model/info`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`ak-litellm: GET /model/info failed \u2014 ${res.status} ${await res.text()}`);
  const body = (
    /** @type {any} */
    await res.json()
  );
  const { pricing, info } = buildTablesFromModelInfo(body);
  for (const k of Object.keys(MODEL_PRICING)) delete MODEL_PRICING[k];
  for (const k of Object.keys(MODEL_INFO)) delete MODEL_INFO[k];
  Object.assign(MODEL_PRICING, pricing);
  Object.assign(MODEL_INFO, info);
  logger_default.debug(`ak-litellm: refreshed model tables \u2014 ${Object.keys(info).length} models`);
  return { models: Object.keys(info), count: Object.keys(info).length };
}
function buildTablesFromModelInfo(body) {
  const pricing = {};
  const info = {};
  for (const entry of body?.data || []) {
    const id = entry?.model_name;
    if (!id) continue;
    const mi = entry.model_info || {};
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
      supportsFunctionCalling: mi.supports_function_calling ?? null
    };
  }
  return { pricing, info };
}
function perMillion(perToken) {
  if (typeof perToken !== "number" || !Number.isFinite(perToken)) return null;
  return Math.round(perToken * 1e6 * 1e6) / 1e6;
}
function budgetTokensToEffort(budgetTokens) {
  if (!Number.isFinite(budgetTokens) || budgetTokens <= 0) return null;
  if (budgetTokens <= 2048) return "low";
  if (budgetTokens <= 8192) return "medium";
  if (budgetTokens <= 24576) return "high";
  return "xhigh";
}

// compat.js
var WARNED = globalThis.__akLitellmCompatWarned ??= /* @__PURE__ */ new Set();
function warnOnce(key, message, silent = false) {
  if (WARNED.has(key)) return false;
  WARNED.add(key);
  if (silent || process.env.AK_LITELLM_SILENCE_COMPAT === "1") return false;
  if (logger_default.isLevelEnabled?.("warn")) logger_default.warn(message);
  else console.warn(message);
  return true;
}
var SYNONYMS = {
  maxOutputTokens: "maxTokens",
  reasoningEffort: "effort",
  enableGrounding: "enableWebSearch",
  groundingConfig: "webSearchConfig",
  resourceExhaustedRetries: "maxRetries",
  resourceExhaustedDelay: "retryDelay"
};
var IGNORED = {
  vertexai: "the Mixpanel LiteLLM gateway authenticates with a static bearer key only.",
  vertexProjectId: "the Mixpanel LiteLLM gateway authenticates with a static bearer key only.",
  vertexRegion: "the Mixpanel LiteLLM gateway authenticates with a static bearer key only.",
  project: "the Mixpanel LiteLLM gateway authenticates with a static bearer key only.",
  location: "the Mixpanel LiteLLM gateway authenticates with a static bearer key only.",
  googleAuthOptions: "the Mixpanel LiteLLM gateway authenticates with a static bearer key only.",
  safetySettings: "the gateway exposes no content-filter controls.",
  serviceTier: "the gateway does not expose provider service tiers.",
  cachedContent: "the gateway has no explicit-cache API.",
  adaptiveThinking: "reasoning depth is controlled by `effort` alone on this gateway.",
  includeServerSideToolInvocations: "the gateway does not return server-side tool invocation records.",
  vertexNativeStructuredOutput: "structured output always uses `response_format.json_schema` here.",
  enableCitations: "the gateway has no native citation feature \u2014 ask for sources in your prompt instead."
};
var INERT_CACHE_OPTIONS = ["cacheSystemPrompt", "cacheTtl"];
function modelProvider(modelId) {
  const upstream = getModelInfo(modelId || "")?.upstreamModel || "";
  const probe = `${modelId || ""} ${upstream}`.toLowerCase();
  if (probe.includes("claude") || probe.includes("anthropic")) return "anthropic";
  if (probe.includes("gemini")) return "google";
  if (probe.includes("gpt") || probe.includes("openai")) return "openai";
  if (probe.includes("qwen")) return "qwen";
  return "other";
}
var CLAUDE5_FAMILY_REGEX = /claude-(fable|mythos|opus-5|opus-4-8|opus-4-7|sonnet-5)/i;
function samplingSupport(modelId, opts = {}) {
  const provider = modelProvider(modelId);
  const upstream = getModelInfo(modelId || "")?.upstreamModel || "";
  const probe = `${modelId || ""} ${upstream}`;
  if (provider === "anthropic") {
    if (opts.reasoning || CLAUDE5_FAMILY_REGEX.test(probe)) {
      return { temperature: false, topP: false, topK: false, exclusiveTempTopP: false };
    }
    return { temperature: true, topP: true, topK: true, exclusiveTempTopP: true };
  }
  if (provider === "openai") {
    return { temperature: false, topP: false, topK: false, exclusiveTempTopP: false };
  }
  return { temperature: true, topP: true, topK: true, exclusiveTempTopP: false };
}
function supportsWebSearch(modelId) {
  return modelProvider(modelId) === "anthropic";
}
var EFFORT_TO_WIRE = {
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "high",
  max: "high"
};
function normalizeEffort(effort) {
  if (effort === null || effort === void 0) return effort;
  const value = String(effort).toLowerCase();
  if (!EFFORT_LEVELS.includes(
    /** @type {any} */
    value
  )) {
    throw new Error(
      `ak-litellm: invalid effort '${effort}'. Expected one of: ${EFFORT_LEVELS.join(", ")}.`
    );
  }
  return value;
}
function effortToReasoningEffort(effort) {
  if (effort === null || effort === void 0) return null;
  return EFFORT_TO_WIRE[String(effort).toLowerCase()] ?? null;
}
function resolveModelName(modelName, klass, silent = false) {
  const canonical = canonicalModelId(modelName);
  if (canonical !== modelName) {
    warnOnce(
      `model:${modelName}`,
      `[ak-litellm] ${klass}: model '${modelName}' is not served by the Mixpanel LiteLLM gateway \u2014 using '${canonical}' instead. Pass \`modelName\` explicitly to choose a different one.`,
      silent
    );
  }
  return canonical;
}
function normalizeToolDeclarations(tools, klass) {
  return (tools || []).map((t, i) => {
    if (t?.type === "function" && t.function) return t;
    if (t?.type && typeof t.type === "string" && t.type !== "function" && !t.input_schema) return t;
    const schema = t?.input_schema || t?.inputSchema || t?.parametersJsonSchema || t?.parameters;
    if (!schema) {
      throw new Error(
        `${klass}: tool ${t?.name ? `"${t.name}"` : `at index ${i}`} has no parameter schema. Provide one of: input_schema (Claude), inputSchema, parametersJsonSchema (Gemini), or parameters (OpenAI). For a no-argument tool use { type: 'object', properties: {} }.`
      );
    }
    return {
      type: "function",
      function: { name: t.name, description: t.description, parameters: schema }
    };
  });
}
function buildWebSearchTool(config, modelId, klass, silent = false) {
  if (!supportsWebSearch(modelId)) {
    warnOnce(
      "enableWebSearch:model",
      `[ak-litellm] ${klass}: \`enableWebSearch\` is ignored on '${modelId}' \u2014 web search on this gateway is the Anthropic server tool, which only claude-* models accept. Use a claude-* model to enable it.`,
      silent
    );
    return null;
  }
  const cfg = config || {};
  const blocked = cfg.blocked_domains ?? cfg.excludeDomains;
  for (const dropped of ["searchTypes", "timeRangeFilter"]) {
    if (cfg[dropped] !== void 0) {
      warnOnce(
        `groundingConfig.${dropped}`,
        `[ak-litellm] ${klass}: option \`groundingConfig.${dropped}\` is ignored \u2014 the Anthropic web_search tool has no equivalent. Remove it to silence this warning.`,
        silent
      );
    }
  }
  const tool = { type: "web_search_20250305", name: "web_search" };
  if (cfg.max_uses !== void 0) tool.max_uses = cfg.max_uses;
  if (cfg.allowed_domains !== void 0) tool.allowed_domains = cfg.allowed_domains;
  if (blocked !== void 0) tool.blocked_domains = blocked;
  return tool;
}
function normalizeToolChoice(toolChoice) {
  if (toolChoice === void 0 || toolChoice === null) return void 0;
  if (typeof toolChoice === "string") return toolChoice;
  if (toolChoice.type === "function" && toolChoice.function) return toolChoice;
  switch (toolChoice.type) {
    case "auto":
      return "auto";
    case "any":
      return "required";
    case "none":
      return "none";
    case "tool":
      return { type: "function", function: { name: toolChoice.name } };
    default:
      return void 0;
  }
}
function toolConfigToToolChoice(toolConfig) {
  const fc = toolConfig?.functionCallingConfig;
  if (!fc) return void 0;
  const mode = String(fc.mode || "").toUpperCase();
  const names = fc.allowedFunctionNames;
  if (mode === "NONE") return "none";
  if (mode === "ANY") {
    return names?.length === 1 ? { type: "function", function: { name: names[0] } } : "required";
  }
  if (mode === "AUTO") return "auto";
  return void 0;
}
function labelsToMetadata(labels) {
  if (!labels || typeof labels !== "object") return void 0;
  const tags = Object.entries(labels).map(([k, v]) => `${k}:${v}`);
  return tags.length ? { tags } : void 0;
}
var CHAT_CONFIG_KEYS = {
  systemInstruction: "systemPrompt",
  maxOutputTokens: "maxOutputTokens",
  // resolved by the synonym pass below
  temperature: "temperature",
  topP: "topP",
  topK: "topK",
  responseSchema: "responseSchema",
  responseMimeType: "responseMimeType",
  thinkingConfig: "thinkingConfig",
  safetySettings: "safetySettings",
  labels: "labels",
  tools: "tools",
  toolConfig: "toolConfig"
};
function normalizeOptions(raw = {}, klass = "ak-litellm") {
  const o = { ...raw || {} };
  const silent = o.logLevel === "none";
  if (o.chatConfig && typeof o.chatConfig === "object") {
    for (const [from, to] of Object.entries(CHAT_CONFIG_KEYS)) {
      if (o.chatConfig[from] !== void 0 && o[to] === void 0) o[to] = o.chatConfig[from];
    }
    delete o.chatConfig;
  }
  for (const [alias, canonical] of Object.entries(SYNONYMS)) {
    if (o[alias] === void 0) continue;
    if (o[canonical] === void 0) {
      o[canonical] = o[alias];
    } else {
      warnOnce(
        `synonym:${alias}`,
        `[ak-litellm] ${klass}: both \`${canonical}\` and \`${alias}\` were given. They are the same option \u2014 using \`${canonical}\`.`,
        silent
      );
    }
    delete o[alias];
  }
  if (o.thinking && typeof o.thinking === "object") {
    if (o.thinking.type === "enabled" && o.thinking.budget_tokens != null) {
      if (o.effort === void 0) o.effort = budgetTokensToEffort(o.thinking.budget_tokens);
    } else if (o.thinking.type === "adaptive") {
      if (o.effort === void 0) o.effort = "medium";
    }
    delete o.thinking;
  }
  if (o.thinkingConfig && typeof o.thinkingConfig === "object") {
    if (o.thinkingConfig.thinkingLevel != null) {
      if (o.effort === void 0) o.effort = String(o.thinkingConfig.thinkingLevel).toLowerCase();
    } else if (o.thinkingConfig.thinkingBudget != null) {
      if (o.effort === void 0) o.effort = budgetTokensToEffort(o.thinkingConfig.thinkingBudget);
    }
    delete o.thinkingConfig;
  }
  if (o.responseMimeType !== void 0) {
    if (o.responseMimeType === "application/json" && o.responseFormat === void 0) {
      o.responseFormat = "json";
    }
    delete o.responseMimeType;
  }
  if (o.toolConfig !== void 0) {
    const fromConfig = toolConfigToToolChoice(o.toolConfig);
    if (fromConfig !== void 0 && o.toolChoice === void 0) o.toolChoice = fromConfig;
    delete o.toolConfig;
  }
  if (o.toolChoice !== void 0) o.toolChoice = normalizeToolChoice(o.toolChoice);
  for (const opt of Object.keys(IGNORED)) {
    if (o[opt] === void 0) continue;
    warnOnce(
      opt,
      `[ak-litellm] ${klass}: option \`${opt}\` is ignored \u2014 ${IGNORED[opt]} Remove it to silence this warning.`,
      silent
    );
    delete o[opt];
  }
  for (const opt of INERT_CACHE_OPTIONS) {
    if (o[opt] === void 0) continue;
    warnOnce(
      opt,
      `[ak-litellm] ${klass}: \`${opt}\` is accepted but inert \u2014 prompt caching does not engage through the Mixpanel gateway (verified 2026-09-08). You will be billed full input price on every call.`,
      silent
    );
    delete o[opt];
  }
  if (o.modelName !== void 0 && o.modelName !== null) {
    o.modelName = resolveModelName(String(o.modelName), klass, silent);
  }
  if (o.effort !== void 0) o.effort = normalizeEffort(o.effort);
  return o;
}

// client.js
var import_config = require("dotenv/config");
var import_openai = __toESM(require("openai"), 1);
var DEFAULT_BASE_URL = "https://litellm.mixpanel.org";
var DEFAULT_TIMEOUT_MS = 6e5;
var DEFAULT_MAX_RETRIES = 5;
function resolveApiKey(opt) {
  const key = opt ?? process.env.LITELLM_API_KEY;
  if (!key) throw new Error(
    "ak-litellm: no API key. Pass `apiKey` or set LITELLM_API_KEY in your environment or .env file."
  );
  return key;
}
function resolveBaseURL(opt) {
  const raw = opt ?? process.env.LITELLM_BASE_URL ?? DEFAULT_BASE_URL;
  const trimmed = raw.replace(/\/+$/, "");
  return /\/v1$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}
function createClient(opts = {}) {
  const baseURL = resolveBaseURL(opts.baseURL);
  logger_default.debug(`ak-litellm: client -> ${baseURL}`);
  return new import_openai.default({
    apiKey: resolveApiKey(opts.apiKey),
    baseURL,
    maxRetries: opts.maxRetries ?? DEFAULT_MAX_RETRIES,
    timeout: opts.timeout ?? DEFAULT_TIMEOUT_MS
  });
}
function parseGatewayHeaders(response) {
  const get = (name) => {
    try {
      return response?.headers?.get(name) ?? null;
    } catch {
      return null;
    }
  };
  const num = (name) => {
    const raw = get(name);
    if (raw === null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const headers = {
    responseCost: num("x-litellm-response-cost"),
    callId: get("x-litellm-call-id"),
    upstreamModel: get("x-litellm-model-name"),
    modelGroup: get("x-litellm-model-group"),
    keySpend: num("x-litellm-key-spend"),
    durationMs: num("x-litellm-response-duration-ms"),
    attemptedRetries: num("x-litellm-attempted-retries"),
    attemptedFallbacks: num("x-litellm-attempted-fallbacks"),
    version: get("x-litellm-version")
  };
  if (headers.attemptedRetries || headers.attemptedFallbacks) {
    logger_default.debug(
      `ak-litellm: gateway retried ${headers.attemptedRetries} time(s), fell back ${headers.attemptedFallbacks} time(s) [call ${headers.callId}]`
    );
  }
  return headers;
}
function mapGatewayError(err, ctx = {}) {
  const status = err?.status ?? err?.response?.status ?? null;
  const raw = err?.error?.message ?? err?.message ?? String(err);
  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  if (status === 401 || /token_not_found_in_db|Invalid proxy server token/i.test(text)) {
    const e = new Error(
      `ak-litellm: the gateway rejected the API key (401). LITELLM_API_KEY is missing, wrong, or revoked. Gateway said: ${text}`
    );
    e.cause = err;
    return e;
  }
  if (/Invalid model name/i.test(text)) {
    const e = new Error(
      `ak-litellm: the gateway does not serve model '${ctx.model ?? "unknown"}'. Gateway said: ${text}`
    );
    e.cause = err;
    return e;
  }
  if (/thinking\.budget_tokens/i.test(text)) {
    const e = new Error(
      `ak-litellm: \`maxTokens\` is too small for the reasoning budget the gateway derived from \`effort\` on model '${ctx.model ?? "unknown"}'. Raise \`maxTokens\` (the gateway reserves the reasoning budget out of it) or drop \`effort\`. Gateway said: ${text}`
    );
    e.cause = err;
    return e;
  }
  if (/UnsupportedParamsError/i.test(text)) {
    const e = new Error(
      `ak-litellm: the gateway rejected a request parameter it does not support for model '${ctx.model ?? "unknown"}'. This is an ak-litellm bug \u2014 the compatibility layer should have gated this parameter out. Please report it. Gateway said: ${text}`
    );
    e.cause = err;
    return e;
  }
  return err instanceof Error ? err : new Error(text);
}
async function healthCheck(client, modelName) {
  let ids;
  try {
    const list = await client.models.list();
    ids = (list?.data || []).map((m) => m.id);
  } catch (err) {
    throw mapGatewayError(err, { model: modelName });
  }
  if (modelName && !ids.includes(modelName)) {
    throw new Error(
      `ak-litellm: health check failed \u2014 the gateway does not serve model '${modelName}'. Available: ${ids.sort().join(", ")}`
    );
  }
  logger_default.debug(`ak-litellm: health check ok \u2014 ${ids.length} models, '${modelName}' present`);
  return ids;
}

// json-helpers.js
function isJSON(data) {
  try {
    const attempt = JSON.stringify(data);
    if (attempt?.startsWith("{") || attempt?.startsWith("[")) {
      if (attempt?.endsWith("}") || attempt?.endsWith("]")) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}
function isJSONStr(string) {
  if (typeof string !== "string") return false;
  try {
    const result = JSON.parse(string);
    const type = Object.prototype.toString.call(result);
    return type === "[object Object]" || type === "[object Array]";
  } catch (err) {
    return false;
  }
}
function attemptJSONRecovery(text, maxAttempts = 100) {
  if (!text || typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch (e) {
  }
  let workingText = text.trim();
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escapeNext = false;
  for (let j = 0; j < workingText.length; j++) {
    const char = workingText[j];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") braces++;
      else if (char === "}") braces--;
      else if (char === "[") brackets++;
      else if (char === "]") brackets--;
    }
  }
  if ((braces > 0 || brackets > 0 || inString) && workingText.length > 2) {
    let fixedText = workingText;
    if (inString) {
      fixedText += '"';
    }
    while (braces > 0) {
      fixedText += "}";
      braces--;
    }
    while (brackets > 0) {
      fixedText += "]";
      brackets--;
    }
    try {
      const result = JSON.parse(fixedText);
      if (logger_default.level !== "silent") {
        logger_default.warn(`JSON response appears truncated (possibly hit maxTokens limit). Recovered by adding closing characters.`);
      }
      return result;
    } catch (e) {
    }
  }
  for (let i = 0; i < maxAttempts && workingText.length > 2; i++) {
    workingText = workingText.slice(0, -1);
    let braces2 = 0;
    let brackets2 = 0;
    let inString2 = false;
    let escapeNext2 = false;
    for (let j = 0; j < workingText.length; j++) {
      const char = workingText[j];
      if (escapeNext2) {
        escapeNext2 = false;
        continue;
      }
      if (char === "\\") {
        escapeNext2 = true;
        continue;
      }
      if (char === '"') {
        inString2 = !inString2;
        continue;
      }
      if (!inString2) {
        if (char === "{") braces2++;
        else if (char === "}") braces2--;
        else if (char === "[") brackets2++;
        else if (char === "]") brackets2--;
      }
    }
    if (braces2 === 0 && brackets2 === 0 && !inString2) {
      try {
        const result = JSON.parse(workingText);
        if (logger_default.level !== "silent") {
          logger_default.warn(`JSON response appears truncated (possibly hit maxTokens limit). Recovered by removing ${i + 1} characters from the end.`);
        }
        return result;
      } catch (e) {
      }
    }
    if (i > 5) {
      let fixedText = workingText;
      if (inString2) {
        fixedText += '"';
      }
      while (braces2 > 0) {
        fixedText += "}";
        braces2--;
      }
      while (brackets2 > 0) {
        fixedText += "]";
        brackets2--;
      }
      try {
        const result = JSON.parse(fixedText);
        if (logger_default.level !== "silent") {
          logger_default.warn(`JSON response appears truncated (possibly hit maxTokens limit). Recovered by adding closing characters.`);
        }
        return result;
      } catch (e) {
      }
    }
  }
  return null;
}
function extractCompleteStructure(text, startPos) {
  const startChar = text[startPos];
  const endChar = startChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startPos; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (char === '"' && !escaped) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === startChar) {
        depth++;
      } else if (char === endChar) {
        depth--;
        if (depth === 0) {
          return text.substring(startPos, i + 1);
        }
      }
    }
  }
  return null;
}
function findCompleteJSONStructures(text) {
  const results = [];
  const startChars = ["{", "["];
  for (let i = 0; i < text.length; i++) {
    if (startChars.includes(text[i])) {
      const extracted = extractCompleteStructure(text, i);
      if (extracted) {
        results.push(extracted);
      }
    }
  }
  return results;
}
function validateSchema(data, schema, path2 = "$") {
  const errors = [];
  if (!schema || typeof schema !== "object") return errors;
  if (data === null && schema.nullable === true) return errors;
  if (Array.isArray(schema.enum)) {
    const target = JSON.stringify(data);
    const ok = schema.enum.some((v) => v === data || JSON.stringify(v) === target);
    if (!ok) errors.push(`${path2}: value ${JSON.stringify(data)} is not one of allowed enum values ${JSON.stringify(schema.enum)}`);
  }
  if (schema.type !== void 0) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (schema.nullable === true) types.push("null");
    if (!types.some((t) => matchesType(data, t))) {
      errors.push(`${path2}: expected type ${types.join("|")} but got ${describeType(data)}`);
      return errors;
    }
  }
  const isObject = data !== null && typeof data === "object" && !Array.isArray(data);
  if (isObject && (schema.properties || schema.required || schema.additionalProperties === false)) {
    const props = schema.properties || {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.hasOwn(data, key)) errors.push(`${path2}: missing required property "${key}"`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(data)) {
        if (!Object.hasOwn(props, key)) errors.push(`${path2}: unexpected property "${key}" (additionalProperties is false)`);
      }
    }
    for (const [key, subSchema] of Object.entries(props)) {
      if (Object.hasOwn(data, key)) {
        errors.push(...validateSchema(
          data[key],
          /** @type {any} */
          subSchema,
          `${path2}.${key}`
        ));
      }
    }
  }
  if (Array.isArray(data) && schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
    data.forEach((item, i) => {
      errors.push(...validateSchema(item, schema.items, `${path2}[${i}]`));
    });
  }
  return errors;
}
function matchesType(value, type) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && !Number.isNaN(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}
function describeType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
function extractJSON(text) {
  if (!text || typeof text !== "string") {
    throw new Error("No text provided for JSON extraction");
  }
  if (isJSONStr(text.trim())) {
    return JSON.parse(text.trim());
  }
  const codeBlockPatterns = [
    /```json\s*\n?([\s\S]*?)\n?\s*```/gi,
    /```\s*\n?([\s\S]*?)\n?\s*```/gi
  ];
  for (const pattern of codeBlockPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        const jsonContent = match.replace(/```json\s*\n?/gi, "").replace(/```\s*\n?/gi, "").trim();
        if (isJSONStr(jsonContent)) {
          return JSON.parse(jsonContent);
        }
      }
    }
  }
  const jsonPatterns = [
    /\{[\s\S]*\}/g,
    /\[[\s\S]*\]/g
  ];
  for (const pattern of jsonPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        const candidate = match.trim();
        if (isJSONStr(candidate)) {
          return JSON.parse(candidate);
        }
      }
    }
  }
  const advancedExtract = findCompleteJSONStructures(text);
  if (advancedExtract.length > 0) {
    for (const candidate of advancedExtract) {
      if (isJSONStr(candidate)) {
        return JSON.parse(candidate);
      }
    }
  }
  const cleanedText = text.replace(/^\s*Sure,?\s*here\s+is\s+your?\s+.*?[:\n]/gi, "").replace(/^\s*Here\s+is\s+the\s+.*?[:\n]/gi, "").replace(/^\s*The\s+.*?is\s*[:\n]/gi, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").trim();
  if (isJSONStr(cleanedText)) {
    return JSON.parse(cleanedText);
  }
  const recoveredJSON = attemptJSONRecovery(text);
  if (recoveredJSON !== null) {
    return recoveredJSON;
  }
  throw new Error(`Could not extract valid JSON from model response. Response preview: ${text.substring(0, 200)}...`);
}

// base.js
var NODE_ENV = process.env.NODE_ENV || "unknown";
var LOG_LEVEL = process.env.LOG_LEVEL;
var DEFAULT_MAX_TOKENS = 8192;
var BaseLiteLLM = class {
  /**
   * @param {BaseLiteLLMOptions} [options={}]
   */
  constructor(options = {}) {
    const o = normalizeOptions(options, new.target?.name || this.constructor.name);
    this.modelName = o.modelName || DEFAULT_MODEL;
    this.systemPrompt = o.systemPrompt !== void 0 ? o.systemPrompt : null;
    this.apiKey = resolveApiKey(o.apiKey);
    this.baseURL = resolveBaseURL(o.baseURL);
    this.timeout = o.timeout;
    this.maxTokens = o.maxTokens === null ? null : o.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.temperature = o.temperature === null ? void 0 : o.temperature ?? 0.7;
    this.topP = o.topP === null ? void 0 : o.topP ?? 0.95;
    this.topK = o.topK === null ? void 0 : o.topK ?? void 0;
    this.effort = o.effort ?? null;
    this.enableWebSearch = o.enableWebSearch ?? false;
    this.webSearchConfig = o.webSearchConfig ?? {};
    this.labels = o.labels ?? null;
    this.metadata = labelsToMetadata(this.labels);
    this.healthCheck = o.healthCheck ?? false;
    this.maxRetries = o.maxRetries ?? 5;
    this.retryDelay = o.retryDelay ?? 1e3;
    this._configureLogLevel(o.logLevel);
    this._silentCompat = o.logLevel === "none";
    this.client = createClient({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      maxRetries: this.maxRetries,
      timeout: this.timeout
    });
    this._clientReady = true;
    this.clients = {
      openai: this.client,
      anthropic: null,
      vertex: null,
      raw: this.client
    };
    this.history = [];
    this.lastResponseMetadata = null;
    this.exampleCount = 0;
    this._initialized = false;
    this._resetUsage();
    logger_default.debug(`${this.constructor.name} created with model: ${this.modelName}`);
  }
  // ── Client bootstrap ─────────────────────────────────────────────────────
  /**
   * Present for parity with ak-claude, where Vertex needs an async import.
   * Here the client is built in the constructor, so this is a no-op.
   * @returns {Promise<void>}
   * @protected
   */
  async _ensureClient() {
  }
  // ── Initialization ───────────────────────────────────────────────────────
  /**
   * Initializes the instance. Idempotent unless force=true.
   * @param {boolean} [force=false]
   * @returns {Promise<void>}
   */
  async init(force = false) {
    if (this._initialized && !force) return;
    await this._ensureClient();
    logger_default.debug(`Initializing ${this.constructor.name} with model: ${this.modelName}...`);
    await this._healthCheckPing();
    this._initialized = true;
    logger_default.debug(`${this.constructor.name}: Initialized.`);
  }
  /**
   * Opt-in connectivity check. Uses `GET /v1/models`, which is free — unlike
   * ak-claude's one-token `messages.create()` ping.
   * @returns {Promise<void>}
   * @protected
   */
  async _healthCheckPing() {
    if (!this.healthCheck) return;
    try {
      await healthCheck(this.client, this.modelName);
    } catch (e) {
      throw new Error(`${this.constructor.name} initialization failed: ${e.message}`);
    }
  }
  // ── Request building ─────────────────────────────────────────────────────
  /**
   * The system turn, as an OpenAI message. Returns undefined when there is no
   * system prompt.
   * @returns {any}
   * @protected
   */
  _buildSystemMessage() {
    if (!this.systemPrompt) return void 0;
    return { role: "system", content: this.systemPrompt };
  }
  /**
   * Builds the tools array: user tools normalized to the OpenAI function shape,
   * with the Anthropic web-search server tool prepended when enabled.
   * @param {any[]} [tools]
   * @param {string} [modelName]
   * @returns {any[]|undefined}
   * @protected
   */
  _buildTools(tools, modelName = this.modelName) {
    const normalized = tools?.length ? normalizeToolDeclarations(tools, this.constructor.name) : void 0;
    if (!this.enableWebSearch) return normalized;
    const webSearchTool = buildWebSearchTool(
      this.webSearchConfig,
      modelName,
      this.constructor.name,
      this._silentCompat
    );
    if (!webSearchTool) return normalized;
    return normalized?.length ? [webSearchTool, ...normalized] : [webSearchTool];
  }
  /**
   * Applies temperature / top_p / top_k, gated by what the target model
   * accepts. Unsupported parameters are dropped with a debug line, never sent —
   * `drop_params` is off on this gateway, so sending one is a 400.
   *
   * @param {any} params mutated in place
   * @param {string} [modelName]
   * @returns {any} the same params object
   * @protected
   */
  _applySamplingParams(params, modelName = this.modelName) {
    const cap = samplingSupport(modelName, { reasoning: !!params?.reasoning_effort });
    const dropped = [];
    if (this.temperature !== void 0) {
      if (cap.temperature) params.temperature = this.temperature;
      else dropped.push("temperature");
    }
    if (this.topP !== void 0) {
      if (!cap.topP) dropped.push("top_p");
      else if (cap.exclusiveTempTopP && params.temperature !== void 0) {
        dropped.push("top_p (not allowed alongside temperature)");
      } else params.top_p = this.topP;
    }
    if (this.topK !== void 0) {
      if (cap.topK) params.top_k = this.topK;
      else dropped.push("top_k");
    }
    if (dropped.length) {
      logger_default.debug(
        `ak-litellm: model "${modelName}" does not accept ${dropped.join(", ")} \u2014 dropping. Use \`effort\` to control reasoning depth instead.`
      );
    }
    return params;
  }
  /**
   * Applies `reasoning_effort`. The union vocabulary collapses to the gateway's
   * three levels in compat.js.
   * @param {any} params mutated in place
   * @param {string} [modelName]
   * @returns {any}
   * @protected
   */
  _applyReasoningParams(params, modelName = this.modelName) {
    const wire = effortToReasoningEffort(this.effort);
    if (wire) params.reasoning_effort = wire;
    return params;
  }
  /**
   * Assembles a complete `/v1/chat/completions` request body from the current
   * history plus per-call overrides. The single place a request is built.
   *
   * @param {Object} [opts={}]
   * @param {any[]} [opts.messages] override the message list
   * @param {string|null} [opts.systemPrompt] override the system turn ('' or null omits it)
   * @param {any[]} [opts.tools]
   * @param {any} [opts.tool_choice]
   * @param {boolean} [opts.parallel_tool_calls]
   * @param {any} [opts.response_format]
   * @param {number} [opts.maxTokens]
   * @param {string} [opts.model]
   * @param {boolean} [opts.stream]
   * @param {Record<string, string>} [opts.labels] ak-gemini per-message billing labels
   * @returns {any}
   * @protected
   */
  _buildRequestParams(opts = {}) {
    const model = opts.model || this.modelName;
    const systemMessage = opts.systemPrompt !== void 0 ? opts.systemPrompt ? { role: "system", content: opts.systemPrompt } : void 0 : this._buildSystemMessage();
    const body = opts.messages ?? this.history;
    const params = {
      model,
      messages: systemMessage ? [systemMessage, ...body] : [...body]
    };
    const maxTokens = opts.maxTokens ?? this.maxTokens;
    if (maxTokens !== null && maxTokens !== void 0) params.max_tokens = maxTokens;
    const tools = this._buildTools(opts.tools, model);
    if (tools?.length) params.tools = tools;
    const toolChoice = normalizeToolChoice(opts.tool_choice);
    if (toolChoice !== void 0) params.tool_choice = toolChoice;
    if (opts.parallel_tool_calls === false) params.parallel_tool_calls = false;
    if (opts.response_format) params.response_format = opts.response_format;
    const metadata = opts.labels ? labelsToMetadata({ ...this.labels || {}, ...opts.labels }) : this.metadata;
    if (metadata) params.metadata = metadata;
    if (opts.stream) {
      params.stream = true;
      params.stream_options = { include_usage: true };
    }
    this._applyReasoningParams(params, model);
    this._applySamplingParams(params, model);
    return params;
  }
  // ── Core message sending ─────────────────────────────────────────────────
  /**
   * Appends `userContent` to history in the OpenAI shape.
   *
   * Accepts three forms, mirroring the three ak-claude call patterns:
   *  - a string                        → one user message
   *  - an array of role-bearing objects → appended verbatim (tool results)
   *  - an array of content parts        → one multimodal user message
   *
   * @param {string|any[]} userContent
   * @protected
   */
  _pushUserContent(userContent) {
    if (typeof userContent === "string") {
      this.history.push({ role: "user", content: userContent });
      return;
    }
    if (Array.isArray(userContent) && userContent.length && userContent.every((m) => m && m.role)) {
      for (const m of userContent) this.history.push(m);
      return;
    }
    this.history.push({ role: "user", content: userContent });
  }
  /**
   * Normalizes an assistant message for history replay.
   *
   * Tool-call ids are echoed VERBATIM. Gemini smuggles a `thought_signature`
   * inside the id (`call_1902376__thought__AY89a…`); rewriting or regenerating
   * it breaks the next round.
   *
   * @param {any} message
   * @returns {any}
   * @protected
   */
  _assistantHistoryEntry(message) {
    const entry = { role: "assistant", content: message?.content ?? null };
    if (message?.tool_calls?.length) {
      entry.tool_calls = message.tool_calls.map((tc) => ({
        id: tc.id,
        type: tc.type || "function",
        function: { name: tc.function?.name, arguments: tc.function?.arguments ?? "" }
      }));
    }
    return entry;
  }
  /**
   * Core send. Pushes the user turn, calls the gateway, pushes the assistant
   * turn, captures metadata, and returns the response with its gateway headers
   * attached as `_gatewayHeaders`.
   *
   * @param {string|any[]} userContent
   * @param {Object} [opts={}] extra request params
   * @returns {Promise<any>} the API response
   * @protected
   */
  async _sendMessage(userContent, opts = {}) {
    if (!this._initialized) await this.init();
    this._pushUserContent(userContent);
    const params = this._buildRequestParams(opts);
    const response = await this._call(params);
    const message = response?.choices?.[0]?.message;
    if (message) this.history.push(this._assistantHistoryEntry(message));
    this._captureMetadata(response, response._gatewayHeaders);
    return response;
  }
  /**
   * Streaming variant. Pushes the user turn and returns the raw SSE stream —
   * the caller pushes the assistant turn once it has assembled the message.
   *
   * @param {string|any[]} userContent
   * @param {Object} [opts={}]
   * @returns {Promise<any>} an async-iterable of chunks
   * @protected
   */
  async _streamMessage(userContent, opts = {}) {
    if (!this._initialized) await this.init();
    this._pushUserContent(userContent);
    const params = this._buildRequestParams({ ...opts, stream: true });
    try {
      return await this.client.chat.completions.create(params);
    } catch (err) {
      throw mapGatewayError(err, { model: params.model });
    }
  }
  /**
   * One non-streaming round-trip. Captures the `x-litellm-*` headers, which are
   * where the authoritative cost lives.
   *
   * @param {any} params
   * @returns {Promise<any>} the response, with `_gatewayHeaders` attached
   * @protected
   */
  async _call(params) {
    try {
      const { data, response: httpResponse } = await this.client.chat.completions.create(params).withResponse();
      const headers = parseGatewayHeaders(httpResponse);
      Object.defineProperty(data, "_gatewayHeaders", {
        value: headers,
        enumerable: false,
        configurable: true,
        writable: true
      });
      return data;
    } catch (err) {
      throw mapGatewayError(err, { model: params?.model });
    }
  }
  /**
   * Folds a streamed run's chunks into one response-shaped object.
   *
   * @param {any[]} chunks
   * @param {string} model
   * @returns {any} `{ model, usage, choices: [{ message, finish_reason }] }`
   * @protected
   */
  _assembleStreamResponse(chunks, model = this.modelName) {
    let content = "";
    let finishReason = null;
    let usage = null;
    let responseModel = null;
    const toolCalls = [];
    for (const chunk of chunks) {
      if (chunk?.model) responseModel = chunk.model;
      if (chunk?.usage) usage = chunk.usage;
      const choice = chunk?.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const delta = choice.delta;
      if (!delta) continue;
      if (typeof delta.content === "string") content += delta.content;
      for (const tc of delta.tool_calls || []) {
        const i = tc.index ?? toolCalls.length;
        if (!toolCalls[i]) toolCalls[i] = { id: "", type: "function", function: { name: "", arguments: "" } };
        if (tc.id) toolCalls[i].id = tc.id;
        if (tc.type) toolCalls[i].type = tc.type;
        if (tc.function?.name) toolCalls[i].function.name += tc.function.name;
        if (tc.function?.arguments) toolCalls[i].function.arguments += tc.function.arguments;
      }
    }
    const message = { role: "assistant", content: content || null };
    const collected = toolCalls.filter(Boolean);
    if (collected.length) message.tool_calls = collected;
    return {
      model: responseModel || model,
      usage,
      choices: [{ message, finish_reason: finishReason }]
    };
  }
  // ── Text extraction ──────────────────────────────────────────────────────
  /**
   * Pulls the assistant text out of a chat-completions response.
   * `content` is normally a string; some providers return content parts.
   * @param {any} response
   * @returns {string}
   * @protected
   */
  _extractText(response) {
    const content = response?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.filter((p) => p?.type === "text" || typeof p?.text === "string").map((p) => p.text || "").join("");
    }
    return "";
  }
  // ── History management ───────────────────────────────────────────────────
  /**
   * @param {boolean} [curated=false] text-only simplified history
   * @returns {Array<Object>}
   */
  getHistory(curated = false) {
    if (curated) {
      return this.history.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.filter((p) => p?.type === "text").map((p) => p.text).join("") : m.content == null ? "" : String(m.content)
      }));
    }
    return [...this.history];
  }
  /**
   * Clears conversation history. Subclasses may override to preserve examples.
   * @returns {Promise<void>}
   */
  async clearHistory() {
    this.history = [];
    this.lastResponseMetadata = null;
    this._resetUsage();
    logger_default.debug(`${this.constructor.name}: Conversation history cleared.`);
  }
  // ── Few-shot seeding ─────────────────────────────────────────────────────
  /**
   * Seeds the conversation with example input/output pairs.
   *
   * @param {TransformationExample[]} examples
   * @param {Object} [opts={}]
   * @param {string} [opts.promptKey='PROMPT']
   * @param {string} [opts.answerKey='ANSWER']
   * @param {string} [opts.contextKey='CONTEXT']
   * @param {string} [opts.explanationKey='EXPLANATION']
   * @param {string} [opts.systemPromptKey='SYSTEM']
   * @param {'json'|'text'} [opts.format='json'] 'json' wraps answers in a {data}
   *   envelope (Transformer protocol); 'text' stores ANSWER verbatim (Chat)
   * @returns {Promise<Array>} the updated history
   */
  async seed(examples, opts = {}) {
    await this.init();
    if (!examples || !Array.isArray(examples) || examples.length === 0) {
      logger_default.debug("No examples provided. Skipping seeding.");
      return this.getHistory();
    }
    const promptKey = opts.promptKey || "PROMPT";
    const answerKey = opts.answerKey || "ANSWER";
    const contextKey = opts.contextKey || "CONTEXT";
    const explanationKey = opts.explanationKey || "EXPLANATION";
    const systemPromptKey = opts.systemPromptKey || "SYSTEM";
    const format = opts.format || "json";
    const instructionExample = examples.find((ex) => ex[systemPromptKey]);
    if (instructionExample) {
      logger_default.debug("Found system prompt in examples; updating.");
      this.systemPrompt = instructionExample[systemPromptKey];
    }
    logger_default.debug(`Seeding conversation with ${examples.length} examples...`);
    const historyToAdd = [];
    for (const example of examples) {
      const contextValue = example[contextKey] || "";
      const promptValue = example[promptKey] || "";
      const answerValue = example[answerKey] || "";
      const explanationValue = example[explanationKey] || "";
      let userText = "";
      const modelResponse = {};
      if (contextValue) {
        const contextText = isJSON(contextValue) ? JSON.stringify(contextValue, null, 2) : contextValue;
        userText += `CONTEXT:
${contextText}

`;
      }
      if (promptValue) {
        userText += isJSON(promptValue) ? JSON.stringify(promptValue, null, 2) : promptValue;
      }
      let modelText;
      if (format === "text") {
        modelText = isJSON(answerValue) ? JSON.stringify(answerValue, null, 2) : String(answerValue || "");
        if (explanationValue) logger_default.warn("seed(): EXPLANATION has no representation in text format; ignored.");
      } else {
        if (answerValue) modelResponse.data = answerValue;
        if (explanationValue) modelResponse.explanation = explanationValue;
        modelText = JSON.stringify(modelResponse, null, 2);
      }
      if (userText.trim().length && modelText.trim().length > 0) {
        historyToAdd.push({ role: "user", content: userText.trim() });
        historyToAdd.push({ role: "assistant", content: modelText.trim() });
      }
    }
    logger_default.debug(`Adding ${historyToAdd.length} items to history (${this.history.length} existing)...`);
    this.history = [...this.history, ...historyToAdd];
    this.exampleCount = this.history.length;
    logger_default.debug(`History now has ${this.history.length} items.`);
    return this.getHistory();
  }
  // ── Response metadata ────────────────────────────────────────────────────
  /**
   * Reads the token counts out of a chat-completions `usage` block.
   * @param {any} response
   * @returns {{promptTokens:number, responseTokens:number, totalTokens:number, thoughtsTokens:number, cacheCreationTokens:number, cacheReadTokens:number}}
   * @protected
   */
  _readUsage(response) {
    const u = response?.usage || {};
    const promptTokens = u.prompt_tokens || 0;
    const responseTokens = u.completion_tokens || 0;
    return {
      promptTokens,
      responseTokens,
      totalTokens: u.total_tokens ?? promptTokens + responseTokens,
      thoughtsTokens: u.completion_tokens_details?.reasoning_tokens || 0,
      // Both are always 0 on this gateway — prompt caching does not engage
      // (verified 2026-09-08). Read anyway, so the numbers become real the
      // day the gateway starts honoring cache_control.
      cacheCreationTokens: u.prompt_tokens_details?.cache_creation_tokens || 0,
      cacheReadTokens: u.prompt_tokens_details?.cached_tokens || 0
    };
  }
  /**
   * Captures metadata from one response.
   * @param {any} response
   * @param {import('./client.js').GatewayHeaders} [headers]
   * @protected
   */
  _captureMetadata(response, headers) {
    const h = headers || response?._gatewayHeaders || null;
    const tokens = this._readUsage(response);
    this.lastResponseMetadata = {
      ...tokens,
      modelVersion: response?.model || null,
      requestedModel: this.modelName,
      stopReason: response?.choices?.[0]?.finish_reason || null,
      timestamp: Date.now(),
      gatewayCost: h?.responseCost ?? null,
      upstreamModel: h?.upstreamModel ?? null,
      callId: h?.callId ?? null,
      keySpend: h?.keySpend ?? null
    };
  }
  /**
   * Zeroes the cumulative usage counters. Call once at the start of any method
   * that makes one or more API round-trips, before the first `_accumulateUsage()`.
   *
   * Streaming methods must call this too: `getLastUsage()` prefers
   * `_cumulativeUsage` whenever `attempts > 0`, so a `stream()` that only calls
   * `_captureMetadata()` reports the token counts of whatever `send()` or
   * `chat()` ran before it on the same instance.
   *
   * @protected
   */
  _resetUsage() {
    this._cumulativeUsage = {
      promptTokens: 0,
      responseTokens: 0,
      thoughtsTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      attempts: 0,
      /** Summed `x-litellm-response-cost`. Valid only while gatewayCostComplete. */
      gatewayCost: 0,
      /** False as soon as one round-trip came back without the cost header. */
      gatewayCostComplete: true
    };
  }
  /**
   * Captures metadata from `response` and ADDS its token counts to the running
   * cumulative total. Call once per API round-trip.
   *
   * Multi-round methods (agent tool loops) make several calls per turn;
   * assigning from the final response only reports the last round and
   * undercounts the turn several-fold, because `promptTokens` grows with the
   * accumulated history so the final round looks plausibly large on its own.
   *
   * `attempts` becomes the number of API round-trips in the turn.
   *
   * @param {any} response one chat-completions response (or an assembled stream)
   * @param {import('./client.js').GatewayHeaders} [headers]
   * @protected
   */
  _accumulateUsage(response, headers) {
    this._captureMetadata(response, headers);
    this._accumulateLastMetadata();
  }
  /**
   * Folds whatever `_captureMetadata()` last recorded into the cumulative
   * total. Split out of `_accumulateUsage()` for call sites that only have the
   * captured metadata to hand — `Transformer.send()` drives `rawSend()` and
   * `rebuild()`, which return a parsed payload rather than the raw response.
   * @protected
   */
  _accumulateLastMetadata() {
    if (!this.lastResponseMetadata) return;
    if (!this._cumulativeUsage) this._resetUsage();
    const meta = this.lastResponseMetadata;
    const c = this._cumulativeUsage;
    c.promptTokens += meta.promptTokens || 0;
    c.responseTokens += meta.responseTokens || 0;
    c.thoughtsTokens += meta.thoughtsTokens || 0;
    c.cacheCreationTokens += meta.cacheCreationTokens || 0;
    c.cacheReadTokens += meta.cacheReadTokens || 0;
    c.totalTokens += meta.totalTokens || 0;
    c.attempts += 1;
    if (meta.gatewayCost === null) c.gatewayCostComplete = false;
    else c.gatewayCost += meta.gatewayCost;
  }
  /**
   * Records usage for a streamed round. The gateway omits
   * `x-litellm-response-cost` on streams, so the cost falls back to the pricing
   * table and `costSource` becomes `'estimated'`.
   *
   * @param {any} assembledResponse output of `_assembleStreamResponse()`
   * @protected
   */
  _streamUsage(assembledResponse) {
    this._accumulateUsage(
      assembledResponse,
      /** @type {any} */
      null
    );
  }
  /**
   * Structured usage for the last turn, cumulative across all round-trips.
   * @returns {UsageData|null}
   */
  getLastUsage() {
    if (!this.lastResponseMetadata) return null;
    const meta = this.lastResponseMetadata;
    const c = this._cumulativeUsage;
    const useCumulative = !!c && c.attempts > 0;
    const promptTokens = useCumulative ? c.promptTokens : meta.promptTokens;
    const responseTokens = useCumulative ? c.responseTokens : meta.responseTokens;
    const totalTokens = useCumulative ? c.totalTokens : meta.totalTokens;
    const thoughtsTokens = useCumulative ? c.thoughtsTokens : meta.thoughtsTokens;
    const cacheCreationTokens = useCumulative ? c.cacheCreationTokens : meta.cacheCreationTokens;
    const cacheReadTokens = useCumulative ? c.cacheReadTokens : meta.cacheReadTokens;
    const gatewayCost = useCumulative ? c.gatewayCostComplete ? c.gatewayCost : null : meta.gatewayCost;
    const { estimatedCost, costSource } = this._resolveCost(
      gatewayCost,
      meta.modelVersion,
      promptTokens,
      responseTokens,
      thoughtsTokens
    );
    return {
      promptTokens,
      responseTokens,
      totalTokens,
      thoughtsTokens,
      cacheCreationTokens,
      cacheReadTokens,
      cachedTokens: cacheReadTokens,
      attempts: useCumulative ? c.attempts : 1,
      modelVersion: meta.modelVersion,
      requestedModel: meta.requestedModel,
      stopReason: meta.stopReason,
      timestamp: meta.timestamp,
      estimatedCost,
      costSource,
      upstreamModel: meta.upstreamModel,
      callId: meta.callId,
      keySpend: meta.keySpend
    };
  }
  /**
   * Picks the cost number and says where it came from.
   *
   * The gateway's own billing figure wins whenever it is available — it is
   * exact, it includes server-tool cost, and it never drifts from the pricing
   * table. `null` means UNKNOWN, never free.
   *
   * @param {number|null} gatewayCost
   * @param {string|null|undefined} modelVersion
   * @param {number} promptTokens
   * @param {number} responseTokens
   * @param {number} [thoughtsTokens=0]
   * @returns {{ estimatedCost: number|null, costSource: 'gateway'|'estimated'|null }}
   * @protected
   */
  _resolveCost(gatewayCost, modelVersion, promptTokens, responseTokens, thoughtsTokens = 0) {
    if (gatewayCost !== null && gatewayCost !== void 0) {
      return { estimatedCost: gatewayCost, costSource: "gateway" };
    }
    const usage = { promptTokens, responseTokens, thoughtsTokens };
    const estimated = computeCost(usage, modelVersion) ?? computeCost(usage, this.modelName);
    return estimated === null || estimated === void 0 ? { estimatedCost: null, costSource: null } : { estimatedCost: estimated, costSource: "estimated" };
  }
  /**
   * Builds usage from a single response WITHOUT reading mutable instance state.
   * Safe under concurrent `send()` calls on a shared instance — unlike
   * `getLastUsage()`, which reflects whichever call most recently mutated it.
   *
   * @param {any} response
   * @param {number} [attempts=1]
   * @returns {UsageData}
   * @protected
   */
  _usageFromResponse(response, attempts = 1) {
    const t = this._readUsage(response);
    const h = response?._gatewayHeaders || null;
    const modelVersion = response?.model || null;
    const { estimatedCost, costSource } = this._resolveCost(
      h?.responseCost ?? null,
      modelVersion,
      t.promptTokens,
      t.responseTokens,
      t.thoughtsTokens
    );
    return {
      ...t,
      cachedTokens: t.cacheReadTokens,
      attempts,
      modelVersion,
      requestedModel: this.modelName,
      stopReason: response?.choices?.[0]?.finish_reason || null,
      timestamp: Date.now(),
      estimatedCost,
      costSource,
      upstreamModel: h?.upstreamModel ?? null,
      callId: h?.callId ?? null,
      keySpend: h?.keySpend ?? null
    };
  }
  // ── Token estimation ─────────────────────────────────────────────────────
  /**
   * Estimates INPUT tokens for a payload before sending: system prompt + chat
   * history + the new message.
   *
   * **This is a heuristic, not a token count.** The gateway exposes no
   * `countTokens` endpoint, so it divides characters by
   * {@link CHARS_PER_TOKEN}. ak-claude's `estimate()` calls Anthropic's real
   * counter and is exact; this is typically within ~20%, and further off for
   * non-Latin scripts and code. Budget accordingly.
   *
   * @param {Object|string} nextPayload
   * @returns {Promise<{ inputTokens: number, approximate: true }>}
   */
  async estimate(nextPayload) {
    if (!this._initialized) await this.init();
    const nextMessage = typeof nextPayload === "string" ? nextPayload : JSON.stringify(nextPayload, null, 2);
    const lengthOf = (content) => {
      if (typeof content === "string") return content.length;
      if (Array.isArray(content)) {
        return content.reduce((n, p) => n + (typeof p?.text === "string" ? p.text.length : 0), 0);
      }
      return content == null ? 0 : JSON.stringify(content).length;
    };
    let chars = (this.systemPrompt || "").length + nextMessage.length;
    for (const m of this.history) {
      chars += lengthOf(m.content);
      for (const tc of m.tool_calls || []) chars += (tc.function?.arguments || "").length;
    }
    const tools = (
      /** @type {any} */
      this.tools
    );
    if (tools?.length) chars += JSON.stringify(tools).length;
    const inputTokens = Math.ceil(chars / CHARS_PER_TOKEN);
    const limit = getModelInfo(this.modelName)?.maxInputTokens;
    if (limit && inputTokens > limit) {
      logger_default.warn(
        `ak-litellm: estimated ${inputTokens} input tokens exceeds the ${limit}-token context window of "${this.modelName}".`
      );
    }
    return { inputTokens, approximate: (
      /** @type {true} */
      true
    ) };
  }
  /**
   * Estimates the INPUT cost of sending a payload.
   * @param {Object|string} nextPayload
   * @returns {Promise<{ inputTokens: number, model: string, pricing: any, estimatedInputCost: number|null, note: string }>}
   */
  async estimateCost(nextPayload) {
    const tokenInfo = await this.estimate(nextPayload);
    const pricing = resolvePricing(this.modelName);
    return {
      inputTokens: tokenInfo.inputTokens,
      model: this.modelName,
      pricing,
      estimatedInputCost: pricing ? tokenInfo.inputTokens / 1e6 * pricing.input : null,
      note: pricing ? "Input tokens only, from a chars/4 heuristic; output cost depends on response length" : `No pricing known for model "${this.modelName}"; estimatedInputCost is null`
    };
  }
  // ── Model discovery ──────────────────────────────────────────────────────
  /**
   * Lists the models the gateway serves, via `GET /v1/models`.
   * Async-iterable, matching ak-claude's `listModels()`.
   * @returns {AsyncIterable<any>}
   */
  async *listModels() {
    await this._ensureClient();
    let page;
    try {
      page = await this.client.models.list();
    } catch (err) {
      throw mapGatewayError(err, { model: this.modelName });
    }
    for (const model of page?.data || []) {
      yield { ...model, display_name: model.id, ...getModelInfo(model.id) || {} };
    }
  }
  /**
   * Details for one model: the gateway's `/v1/models` entry merged with the
   * `/model/info` capability and pricing snapshot.
   * @param {string} modelId
   * @returns {Promise<any>}
   */
  async getModel(modelId) {
    await this._ensureClient();
    let model;
    try {
      model = await this.client.models.retrieve(modelId);
    } catch (err) {
      throw mapGatewayError(err, { model: modelId });
    }
    return {
      ...model,
      display_name: model?.id || modelId,
      ...getModelInfo(modelId) || {},
      pricing: resolvePricing(modelId)
    };
  }
  // ── Application-level retry ──────────────────────────────────────────────
  /**
   * Pass-through. The `openai` SDK handles 429/5xx retry natively via
   * `maxRetries`; this hook exists for subclasses (Transformer self-healing).
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   * @template T
   * @protected
   */
  async _withRetry(fn) {
    return await fn();
  }
  // ── Private helpers ──────────────────────────────────────────────────────
  /**
   * @param {string} [logLevel]
   * @private
   */
  _configureLogLevel(logLevel) {
    if (logLevel) {
      logger_default.level = logLevel === "none" ? "silent" : logLevel;
    } else if (LOG_LEVEL) {
      logger_default.level = LOG_LEVEL;
    } else if (NODE_ENV === "dev") {
      logger_default.level = "debug";
    } else if (NODE_ENV === "test") {
      logger_default.level = "warn";
    } else if (NODE_ENV.startsWith("prod")) {
      logger_default.level = "error";
    } else {
      logger_default.level = "info";
    }
  }
};
var base_default = BaseLiteLLM;

// transformer.js
var DEFAULT_SYSTEM_INSTRUCTIONS = `
You are an expert JSON transformation engine. Your task is to accurately convert data payloads from one format to another.

You will be provided with example transformations (Source JSON -> Target JSON).

Learn the mapping rules from these examples.

When presented with new Source JSON, apply the learned transformation rules to produce a new Target JSON payload.

Always respond ONLY with a valid JSON object that strictly adheres to the expected output format.

Do not include any additional text, explanations, or formatting before or after the JSON object.

Do not wrap your response in markdown code blocks.
`;
var EXTRACTION_RETRY_NUDGE = `Your previous response could not be parsed as JSON. Respond with a single valid JSON object and NOTHING else \u2014 no prose, no explanations, no markdown code fences.`;
var Transformer = class extends base_default {
  /**
   * @param {TransformerOptions} [options={}]
   */
  constructor(options = {}) {
    const o = normalizeOptions(options, "Transformer");
    if (o.systemPrompt === void 0) o.systemPrompt = DEFAULT_SYSTEM_INSTRUCTIONS;
    super(o);
    this.onlyJSON = o.onlyJSON !== void 0 ? o.onlyJSON : true;
    this.responseSchema = o.responseSchema || null;
    this.promptKey = o.promptKey || o.sourceKey || "PROMPT";
    this.answerKey = o.answerKey || o.targetKey || "ANSWER";
    this.contextKey = o.contextKey || "CONTEXT";
    this.explanationKey = o.explanationKey || "EXPLANATION";
    this.systemPromptKey = o.systemPromptKey || "SYSTEM";
    if (this.promptKey === this.answerKey) {
      throw new Error("Source and target keys cannot be the same. Please provide distinct keys.");
    }
    this.examplesFile = o.examplesFile || null;
    this.exampleData = o.exampleData || null;
    this.asyncValidator = o.asyncValidator || null;
    this.validationRetries = o.maxRetries || 3;
    this.retryDelay = o.retryDelay || 1e3;
    logger_default.debug(`Transformer keys \u2014 Source: "${this.promptKey}", Target: "${this.answerKey}", Context: "${this.contextKey}"`);
  }
  /**
   * `response_format` for a declared output schema, or undefined.
   * @returns {any}
   * @private
   */
  _responseFormat() {
    if (!this.responseSchema) return void 0;
    return { type: "json_schema", json_schema: { name: "transformed", schema: this.responseSchema } };
  }
  // ── Seeding ──────────────────────────────────────────────────────────────
  /**
   * Seeds the conversation with transformation examples using the configured
   * key mapping. Falls back to `examplesFile` / `exampleData`.
   *
   * @param {TransformationExample[]} [examples]
   * @returns {Promise<Array>} the updated history
   */
  async seed(examples) {
    await this.init();
    if (!examples || !Array.isArray(examples) || examples.length === 0) {
      if (this.examplesFile) {
        logger_default.debug(`No examples provided, loading from file: ${this.examplesFile}`);
        try {
          const filePath = import_path.default.resolve(this.examplesFile);
          const raw = await import_promises.default.readFile(filePath, "utf-8");
          examples = JSON.parse(raw);
        } catch (err) {
          throw new Error(`Could not load examples from file: ${this.examplesFile}. ${err.message}`);
        }
      } else if (this.exampleData) {
        logger_default.debug("Using example data provided in options.");
        if (Array.isArray(this.exampleData)) {
          examples = this.exampleData;
        } else {
          throw new Error("Invalid example data provided. Expected an array of examples.");
        }
      } else {
        logger_default.debug("No examples provided and no examples file specified. Skipping seeding.");
        return this.getHistory();
      }
    }
    return await super.seed(examples, {
      promptKey: this.promptKey,
      answerKey: this.answerKey,
      contextKey: this.contextKey,
      explanationKey: this.explanationKey,
      systemPromptKey: this.systemPromptKey,
      format: "json"
    });
  }
  // ── Primary send ─────────────────────────────────────────────────────────
  /**
   * Transforms a payload, validating and self-healing on failure.
   *
   * @param {Object|string} payload
   * @param {Object} [opts={}]
   * @param {AsyncValidatorFunction|null} [validatorFn] overrides the constructor validator
   * @returns {Promise<Object>} the transformed payload
   */
  async send(payload, opts = {}, validatorFn = null) {
    if (!this._initialized) await this.init();
    const validator = validatorFn || this.asyncValidator;
    if (opts.stateless) {
      return await this._statelessSend(payload, opts, validator);
    }
    const maxRetries = opts.maxRetries ?? this.validationRetries;
    const retryDelay = opts.retryDelay ?? this.retryDelay;
    const originalPayload = this._preparePayload(payload);
    this._resetUsage();
    let lastError = null;
    let lastModelOutput = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const metadataBefore = this.lastResponseMetadata;
      let accumulated = false;
      try {
        let transformedPayload;
        if (attempt === 0) {
          transformedPayload = await this.rawSend(originalPayload);
        } else if (lastModelOutput !== null) {
          transformedPayload = await this.rebuild(lastModelOutput, lastError.message);
        } else {
          transformedPayload = await this.rawSend(`${originalPayload}

${EXTRACTION_RETRY_NUDGE}`);
        }
        this._accumulateLastMetadata();
        accumulated = true;
        if (validator) {
          try {
            await validator(transformedPayload);
          } catch (validationError) {
            validationError._akValidationPayload = transformedPayload;
            throw validationError;
          }
        }
        logger_default.debug(`Transformation succeeded on attempt ${attempt + 1}`);
        return transformedPayload;
      } catch (error) {
        if (!accumulated && this.lastResponseMetadata !== metadataBefore) {
          this._accumulateLastMetadata();
        }
        lastError = error;
        lastModelOutput = "_akValidationPayload" in error ? error._akValidationPayload : null;
        logger_default.warn(`Attempt ${attempt + 1} failed: ${error.message}`);
        if (attempt >= maxRetries) {
          logger_default.error(`All ${maxRetries + 1} attempts failed.`);
          throw new Error(`Transformation failed after ${maxRetries + 1} attempts. Last error: ${error.message}`);
        }
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  // ── Raw send ─────────────────────────────────────────────────────────────
  /**
   * Sends a single prompt and parses the JSON response. No validation, no retry.
   *
   * @param {Object|string} payload
   * @returns {Promise<Object>} the transformed payload
   */
  async rawSend(payload) {
    if (!this._initialized) await this.init();
    const actualPayload = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    try {
      const response = await this._sendMessage(actualPayload, {
        response_format: this._responseFormat()
      });
      const modelResponse = this._extractText(response);
      if (response.usage && logger_default.level !== "silent") {
        logger_default.debug(`API response: model=${response.model || "unknown"}, tokens=${(response.usage.prompt_tokens || 0) + (response.usage.completion_tokens || 0)}`);
      }
      return this._parseModelResponse(modelResponse);
    } catch (error) {
      if (this.onlyJSON && error.message.includes("Could not extract valid JSON")) {
        throw new Error(`Invalid JSON response from the model: ${error.message}`);
      }
      throw new Error(`Transformation failed: ${error.message}`);
    }
  }
  // ── Response parsing ─────────────────────────────────────────────────────
  /**
   * Turns raw model text into the transformed payload.
   *
   * Shared by `rawSend()`, `rebuild()` and `_statelessSend()` so all three apply
   * the SAME two steps: `extractJSON()` and the `{data: …}` unwrap that seeded
   * Transformers need — `seed()` always uses `format: 'json'`, which trains the
   * model to answer in that envelope.
   *
   * @param {string} modelResponse
   * @returns {Object}
   * @protected
   */
  _parseModelResponse(modelResponse) {
    const extracted = extractJSON(modelResponse);
    return extracted?.data ? extracted.data : extracted;
  }
  // ── Rebuild ──────────────────────────────────────────────────────────────
  /**
   * Asks the model to fix a payload that failed validation.
   *
   * @param {Object} lastPayload the payload that failed
   * @param {string} serverError
   * @returns {Promise<Object>} corrected payload
   */
  async rebuild(lastPayload, serverError) {
    await this.init();
    const prompt = `
The previous JSON payload (below) failed validation.
The server's error message is quoted afterward.

---------------- BAD PAYLOAD ----------------
${JSON.stringify(lastPayload, null, 2)}


---------------- SERVER ERROR ----------------
${serverError}

Please return a NEW JSON payload that corrects the issue.
Respond with JSON only \u2013 no comments or explanations.
`;
    let response;
    try {
      response = await this._sendMessage(prompt, { response_format: this._responseFormat() });
    } catch (err) {
      throw new Error(`Model call failed while repairing payload: ${err.message}`);
    }
    try {
      return this._parseModelResponse(this._extractText(response));
    } catch (parseErr) {
      throw new Error(`Model returned non-JSON while repairing payload: ${parseErr.message}`);
    }
  }
  // ── Stateless send ───────────────────────────────────────────────────────
  /**
   * One-off transform that does NOT touch conversation history. Seeded examples
   * are still included.
   *
   * @param {Object|string} payload
   * @param {Object} [opts={}]
   * @param {AsyncValidatorFunction|null} [validatorFn]
   * @returns {Promise<Object>}
   * @private
   */
  async _statelessSend(payload, opts = {}, validatorFn = null) {
    const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    const messages = [];
    if (this.exampleCount > 0) messages.push(...this.history.slice(0, this.exampleCount));
    messages.push({ role: "user", content: payloadStr });
    const params = this._buildRequestParams({
      messages,
      maxTokens: opts.maxTokens,
      response_format: this._responseFormat()
    });
    const response = await this._call(params);
    this._resetUsage();
    this._accumulateUsage(response, response._gatewayHeaders);
    const transformedPayload = this._parseModelResponse(this._extractText(response));
    if (validatorFn) await validatorFn(transformedPayload);
    return transformedPayload;
  }
  // ── History management ───────────────────────────────────────────────────
  /**
   * Clears conversation history while preserving seeded examples.
   * @returns {Promise<void>}
   */
  async clearHistory() {
    const exampleHistory = this.history.slice(0, this.exampleCount || 0);
    this.history = exampleHistory;
    this.lastResponseMetadata = null;
    this._resetUsage();
    logger_default.debug(`Conversation cleared. Preserved ${exampleHistory.length} example items.`);
  }
  /**
   * Fully resets the conversation, examples included.
   * @returns {Promise<void>}
   */
  async reset() {
    this.history = [];
    this.exampleCount = 0;
    this.lastResponseMetadata = null;
    this._resetUsage();
    logger_default.debug("Conversation fully reset.");
  }
  /**
   * @param {string} newPrompt
   * @returns {Promise<void>}
   */
  async updateSystemPrompt(newPrompt) {
    if (!newPrompt || typeof newPrompt !== "string") {
      throw new Error("System prompt must be a non-empty string");
    }
    this.systemPrompt = newPrompt.trim();
    logger_default.debug("System prompt updated.");
  }
  // ── Private helpers ──────────────────────────────────────────────────────
  /**
   * @param {*} payload
   * @returns {string}
   * @private
   */
  _preparePayload(payload) {
    if (payload && isJSON(payload)) {
      return JSON.stringify(payload, null, 2);
    } else if (typeof payload === "string") {
      return payload;
    } else if (typeof payload === "boolean" || typeof payload === "number") {
      return payload.toString();
    } else if (payload === null || payload === void 0) {
      return JSON.stringify({});
    } else {
      throw new Error("Invalid source payload. Must be a JSON object or string.");
    }
  }
};
var transformer_default = Transformer;

// chat.js
var Chat = class extends base_default {
  /**
   * @param {ChatOptions} [options={}]
   */
  constructor(options = {}) {
    const o = normalizeOptions(options, "Chat");
    if (o.systemPrompt === void 0) o.systemPrompt = "You are a helpful AI assistant.";
    super(o);
    logger_default.debug("Chat created");
  }
  /**
   * Seeds few-shot examples. Chat is a prose agent, so answers are stored
   * verbatim rather than wrapped in the Transformer `{data}` envelope.
   * @param {any[]} examples
   * @param {Object} [opts={}]
   * @returns {Promise<Array>}
   */
  async seed(examples, opts = {}) {
    return super.seed(examples, { format: "text", ...opts });
  }
  /**
   * Send a message and get the complete response.
   * @param {string} message
   * @param {Object} [opts={}] per-message options
   * @returns {Promise<ChatResponse>}
   */
  async send(message, opts = {}) {
    if (!this._initialized) await this.init();
    this._resetUsage();
    const response = await this._sendMessage(message, opts);
    this._accumulateUsage(response, response._gatewayHeaders);
    return { text: this._extractText(response), usage: this.getLastUsage() };
  }
  /**
   * Send a message and stream the response.
   *
   * Yields `{ type: 'text', text }` per delta, then a single
   * `{ type: 'done', fullText, usage }`.
   *
   * @param {string} message
   * @param {Object} [opts={}]
   * @yields {ChatStreamEvent}
   */
  async *stream(message, opts = {}) {
    if (!this._initialized) await this.init();
    this._resetUsage();
    const stream = await this._streamMessage(message, opts);
    const chunks = [];
    let fullText = "";
    for await (const chunk of stream) {
      chunks.push(chunk);
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length) {
        fullText += delta;
        yield { type: "text", text: delta };
      }
    }
    const assembled = this._assembleStreamResponse(chunks, this.modelName);
    this.history.push(this._assistantHistoryEntry(assembled.choices[0].message));
    this._streamUsage(assembled);
    yield { type: "done", fullText, usage: this.getLastUsage() };
  }
};
var chat_default = Chat;

// message.js
var Message = class extends base_default {
  /**
   * @param {MessageOptions} [options={}]
   */
  constructor(options = {}) {
    const o = normalizeOptions(options, "Message");
    super(o);
    this._responseSchema = o.responseSchema || null;
    this._isStructured = !!(this._responseSchema || o.responseFormat === "json");
    this.validationRetries = o.validationRetries ?? 2;
    this.validationMode = o.validationMode === "warn" ? "warn" : "strict";
    logger_default.debug(`Message created (structured=${this._isStructured}, nativeSchema=${!!this._responseSchema})`);
  }
  /**
   * Initialize. Stateless — no history to build.
   * @param {boolean} [force=false]
   * @returns {Promise<void>}
   */
  async init(force = false) {
    if (this._initialized && !force) return;
    await this._ensureClient();
    logger_default.debug(`Initializing ${this.constructor.name} with model: ${this.modelName}...`);
    await this._healthCheckPing();
    this._initialized = true;
    logger_default.debug(`${this.constructor.name}: Initialized (stateless mode).`);
  }
  /**
   * Send a stateless message. Each call is independent.
   *
   * @param {Object|string} payload
   * @param {Object} [opts={}] per-message options
   * @returns {Promise<MessageResponse>}
   */
  async send(payload, opts = {}) {
    if (!this._initialized) await this.init();
    const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    let systemPrompt = this.systemPrompt;
    if (this._isStructured && !this._responseSchema) {
      const jsonInstruction = "Always respond ONLY with valid JSON. No markdown code blocks, no preamble text.";
      systemPrompt = systemPrompt ? `${systemPrompt}

${jsonInstruction}` : jsonInstruction;
    }
    let responseFormat;
    if (this._responseSchema) {
      responseFormat = {
        type: "json_schema",
        json_schema: { name: "response", schema: this._responseSchema }
      };
    } else if (this._isStructured) {
      responseFormat = { type: "json_object" };
    }
    const retries = Math.max(0, Number(this.validationRetries) || 0);
    const maxAttempts = this._responseSchema ? 1 + retries : 1;
    let userContent = payloadStr;
    let text = "";
    let data;
    let validationErrors = null;
    let lastResponse = null;
    let cumPrompt = 0, cumResponse = 0, cumThoughts = 0, attempts = 0;
    let gatewayCost = 0, gatewayCostComplete = true;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const params = this._buildRequestParams({
        messages: [{ role: "user", content: userContent }],
        systemPrompt: systemPrompt || null,
        maxTokens: opts.maxTokens,
        response_format: responseFormat
      });
      const response = await this._call(params);
      lastResponse = response;
      attempts = attempt;
      const t = this._readUsage(response);
      cumPrompt += t.promptTokens;
      cumResponse += t.responseTokens;
      cumThoughts += t.thoughtsTokens;
      const cost = response?._gatewayHeaders?.responseCost ?? null;
      if (cost === null) gatewayCostComplete = false;
      else gatewayCost += cost;
      text = this._extractText(response);
      if (!this._isStructured) {
        data = void 0;
        break;
      }
      try {
        data = extractJSON(text);
      } catch (e) {
        logger_default.warn(`Could not parse structured response: ${e.message}`);
        data = null;
      }
      if (!this._responseSchema) break;
      if (data === null || data === void 0) {
        validationErrors = ["$: could not parse any JSON from the model response"];
      } else {
        const errs = validateSchema(data, this._responseSchema);
        validationErrors = errs.length ? errs : null;
      }
      if (!validationErrors) break;
      if (attempt < maxAttempts) {
        logger_default.warn(`Structured output failed schema validation (attempt ${attempt}/${maxAttempts}): ${validationErrors.join("; ")}. Retrying with error feedback.`);
        userContent = `${payloadStr}

Your previous response did not satisfy the required JSON schema:
${validationErrors.map((e) => `- ${e}`).join("\n")}

Respond ONLY with corrected JSON that matches the schema. No markdown, no preamble.`;
      } else if (this.validationMode === "strict") {
        logger_default.warn(`Structured output still invalid after ${attempt} attempt(s). Returning data: null with validationErrors.`);
        data = null;
      } else {
        logger_default.warn(`Structured output still invalid after ${attempt} attempt(s). validationMode='warn' \u2014 returning parsed data with validationErrors.`);
      }
    }
    if (lastResponse) this._captureMetadata(lastResponse, lastResponse._gatewayHeaders);
    this._cumulativeUsage = {
      promptTokens: cumPrompt,
      responseTokens: cumResponse,
      thoughtsTokens: cumThoughts,
      totalTokens: cumPrompt + cumResponse,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      attempts,
      gatewayCost,
      gatewayCostComplete
    };
    const { estimatedCost, costSource } = this._resolveCost(
      gatewayCostComplete ? gatewayCost : null,
      lastResponse?.model,
      cumPrompt,
      cumResponse,
      cumThoughts
    );
    const usage = {
      ...this._usageFromResponse(lastResponse, attempts),
      promptTokens: cumPrompt,
      responseTokens: cumResponse,
      thoughtsTokens: cumThoughts,
      totalTokens: cumPrompt + cumResponse,
      estimatedCost,
      costSource
    };
    const result = { text, usage };
    if (this._isStructured) result.data = data;
    if (validationErrors) result.validationErrors = validationErrors;
    return result;
  }
  // ── No-ops for a stateless class ──
  /** @returns {Array} always empty (stateless). */
  getHistory() {
    return [];
  }
  /** No-op (stateless). */
  async clearHistory() {
  }
  /** Not supported on Message (stateless). */
  async seed() {
    logger_default.warn("Message is stateless \u2014 seed() has no effect. Use Transformer or Chat for few-shot learning.");
    return [];
  }
};
var message_default = Message;

// tool-agent.js
async function runWithConcurrency(tasks, concurrency) {
  if (concurrency === Infinity) return Promise.all(tasks.map((t) => t()));
  if (concurrency === 1) {
    const results2 = [];
    for (const t of tasks) results2.push(await t());
    return results2;
  }
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}
function parseToolArgs(toolCall) {
  const raw = toolCall?.function?.arguments;
  if (raw === void 0 || raw === null || raw === "") return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    logger_default.warn(`Tool "${toolCall?.function?.name}" returned unparseable arguments; passing {}.`);
    return { _raw: raw };
  }
}
var ToolAgent = class extends base_default {
  /**
   * @param {ToolAgentOptions} [options={}]
   */
  constructor(options = {}) {
    const o = normalizeOptions(options, "ToolAgent");
    if (o.systemPrompt === void 0) o.systemPrompt = "You are a helpful AI assistant.";
    super(o);
    this.tools = (o.tools || []).map((t, i) => {
      const schema = t.input_schema || t.inputSchema || t.parametersJsonSchema || t.function?.parameters || t.parameters;
      if (!schema) {
        throw new Error(`ToolAgent: tool ${t?.name ? `"${t.name}"` : `at index ${i}`} has no parameter schema. Provide one of: input_schema (Claude), inputSchema, parametersJsonSchema (Gemini), or parameters (OpenAI). For a no-argument tool use { type: 'object', properties: {} }.`);
      }
      return t;
    });
    this.toolExecutor = o.toolExecutor || null;
    if (this.tools.length > 0 && !this.toolExecutor) {
      throw new Error("ToolAgent: tools provided without a toolExecutor. Provide a toolExecutor function to handle tool calls.");
    }
    if (this.toolExecutor && this.tools.length === 0) {
      throw new Error("ToolAgent: toolExecutor provided without tools. Provide tool declarations so the model knows what tools are available.");
    }
    this.toolChoice = o.toolChoice ?? void 0;
    this.disableParallelToolUse = o.disableParallelToolUse ?? false;
    this.parallelToolCalls = o.parallelToolCalls ?? true;
    this._concurrency = this.parallelToolCalls === true ? Infinity : this.parallelToolCalls === false ? 1 : this.parallelToolCalls;
    this.maxToolRounds = o.maxToolRounds || 10;
    this.onToolCall = o.onToolCall || null;
    this.onBeforeExecution = o.onBeforeExecution || null;
    this._stopped = false;
    logger_default.debug(`ToolAgent created with ${this.tools.length} tools`);
  }
  /**
   * The per-request options that carry the tool configuration.
   * @returns {Object}
   * @private
   */
  _toolParams() {
    const params = { tools: this.tools };
    if (this.toolChoice !== void 0) params.tool_choice = this.toolChoice;
    if (this.disableParallelToolUse) params.parallel_tool_calls = false;
    return params;
  }
  /**
   * Pulls the function tool calls out of an assistant message.
   * Server-side tools (web search) are executed by the gateway and never appear
   * here, so anything left is for `toolExecutor`.
   * @param {any} response
   * @returns {any[]}
   * @private
   */
  _toolCallsFrom(response) {
    return response?.choices?.[0]?.message?.tool_calls || [];
  }
  /**
   * Runs one tool call, honoring `onToolCall` and the `onBeforeExecution` gate.
   * Never throws: an executor failure becomes `{ error }`, which the model can
   * see and react to.
   * @param {any} call
   * @returns {Promise<{toolCall: any, toolResult: any}>}
   * @private
   */
  async _runToolCall(call) {
    const name = call.function?.name;
    const args = parseToolArgs(call);
    if (this.onToolCall) {
      try {
        this.onToolCall(name, args);
      } catch (e) {
        logger_default.warn(`onToolCall callback error: ${e.message}`);
      }
    }
    let denied = false;
    if (this.onBeforeExecution) {
      try {
        const allowed = await this.onBeforeExecution(name, args);
        if (allowed === false) denied = true;
      } catch (e) {
        logger_default.warn(`onBeforeExecution callback error: ${e.message}`);
      }
    }
    let result;
    if (denied) {
      result = { error: "Execution denied by onBeforeExecution callback" };
    } else {
      try {
        result = await this.toolExecutor(name, args);
      } catch (err) {
        logger_default.warn(`Tool ${name} failed: ${err.message}`);
        result = { error: err.message };
      }
    }
    return {
      toolCall: { name, args, result },
      toolResult: {
        role: "tool",
        // Echoed VERBATIM — Gemini hides a thought_signature in this id.
        tool_call_id: call.id,
        content: typeof result === "string" ? result : JSON.stringify(result)
      }
    };
  }
  // ── Non-Streaming Chat ───────────────────────────────────────────────────
  /**
   * Send a message and get a complete response (non-streaming).
   * Automatically handles the tool-use loop.
   *
   * @param {string} message
   * @param {Object} [opts={}] per-message options
   * @returns {Promise<AgentResponse>} `{ text, toolCalls, usage }`
   */
  async chat(message, opts = {}) {
    if (!this._initialized) await this.init();
    this._stopped = false;
    const allToolCalls = [];
    const toolParams = this._toolParams();
    this._resetUsage();
    let response = await this._sendMessage(message, { ...toolParams, ...opts });
    this._accumulateUsage(response, response._gatewayHeaders);
    for (let round = 0; round < this.maxToolRounds; round++) {
      if (this._stopped) break;
      const calls = this._toolCallsFrom(response);
      if (calls.length === 0) break;
      const results = await runWithConcurrency(
        calls.map((call) => () => this._runToolCall(call)),
        this._concurrency
      );
      for (const r of results) allToolCalls.push(r.toolCall);
      response = await this._sendMessage(results.map((r) => r.toolResult), { ...toolParams, ...opts });
      this._accumulateUsage(response, response._gatewayHeaders);
    }
    return {
      text: this._extractText(response),
      toolCalls: allToolCalls,
      usage: this.getLastUsage()
    };
  }
  // ── Streaming ────────────────────────────────────────────────────────────
  /**
   * Send a message and stream the response as events.
   * Automatically handles the tool-use loop between streamed rounds.
   *
   * Event types:
   * - `text` — a chunk of the agent's text response
   * - `tool_call` — the agent is about to call a tool
   * - `tool_result` — a tool finished executing
   * - `done` — the agent finished
   *
   * @param {string} message
   * @param {Object} [opts={}]
   * @yields {AgentStreamEvent}
   */
  async *stream(message, opts = {}) {
    if (!this._initialized) await this.init();
    this._stopped = false;
    const allToolCalls = [];
    let fullText = "";
    const toolParams = this._toolParams();
    this._resetUsage();
    let stream = await this._streamMessage(message, { ...toolParams, ...opts });
    for (let round = 0; round < this.maxToolRounds; round++) {
      if (this._stopped) break;
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length) {
          fullText += delta;
          yield { type: "text", text: delta };
        }
      }
      const assembled = this._assembleStreamResponse(chunks, this.modelName);
      this.history.push(this._assistantHistoryEntry(assembled.choices[0].message));
      this._streamUsage(assembled);
      const calls = this._toolCallsFrom(assembled);
      if (calls.length === 0) {
        yield { type: "done", fullText, usage: this.getLastUsage() };
        return;
      }
      const toolResults = [];
      if (this._concurrency === 1) {
        for (const call of calls) {
          if (this._stopped) break;
          yield { type: "tool_call", toolName: call.function?.name, args: parseToolArgs(call) };
          const r = await this._runToolCall(call);
          allToolCalls.push(r.toolCall);
          yield { type: "tool_result", toolName: r.toolCall.name, result: r.toolCall.result };
          toolResults.push(r.toolResult);
        }
      } else {
        for (const call of calls) {
          yield { type: "tool_call", toolName: call.function?.name, args: parseToolArgs(call) };
        }
        const results = await runWithConcurrency(
          calls.map((call) => () => this._runToolCall(call)),
          this._concurrency
        );
        for (const r of results) {
          allToolCalls.push(r.toolCall);
          yield { type: "tool_result", toolName: r.toolCall.name, result: r.toolCall.result };
          toolResults.push(r.toolResult);
        }
      }
      if (this._stopped) break;
      stream = await this._streamMessage(toolResults, { ...toolParams, ...opts });
    }
    yield {
      type: "done",
      fullText,
      usage: this.getLastUsage(),
      warning: this._stopped ? "Agent was stopped" : "Max tool rounds reached"
    };
  }
  // ── Stop ────────────────────────────────────────────────────────────────
  /**
   * Stop the agent before the next tool execution round.
   */
  stop() {
    this._stopped = true;
    logger_default.info("ToolAgent stopped");
  }
};
var tool_agent_default = ToolAgent;

// code-agent.js
var import_node_child_process = require("node:child_process");
var import_promises2 = require("node:fs/promises");
var import_node_path = require("node:path");
var import_node_crypto = require("node:crypto");
var MAX_OUTPUT_CHARS = 5e4;
var MAX_FILE_TREE_LINES = 500;
var IGNORE_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "coverage", ".next", "build", "__pycache__", ".venv"]);
var LANG_CONFIG = {
  javascript: {
    toolDescExecute: "Execute a given piece of JavaScript code in a Node.js child process. Use this when you already have code to run \u2014 e.g., running code from a previous write_code call, re-running a snippet, or executing code the user provided. Use console.log() for output.",
    toolDescWriteAndRun: "Write a fresh solution from scratch and execute it in one step. Use this when you need to figure out the code AND run it \u2014 the autonomous, end-to-end tool for solving problems with code.",
    codeParamDesc: "JavaScript code to execute. Use console.log() for output. Use import syntax (ES modules).",
    codeRules: `- Your code runs in a Node.js child process with access to all built-in modules
- IMPORTANT: Your code runs as an ES module (.mjs). Use import syntax, NOT require():
  - import fs from 'fs';
  - import path from 'path';
  - import { execSync } from 'child_process';
- Use console.log() to produce output \u2014 that's how results are returned to you
- Write efficient scripts that do multiple things per execution when possible
- For parallel async operations, use Promise.all()
- Handle errors in your scripts with try/catch so you get useful error messages
- Top-level await is supported`,
    commentsEnabled: `- Add a JSDoc @fileoverview comment at the top of each script explaining what it does
- Add brief JSDoc @param comments for any functions you define`,
    commentsDisabled: `- Do NOT write any comments in your code \u2014 save tokens. The code should be self-explanatory.`,
    packageLabel: "Available Packages",
    packageIntro: "These npm packages are installed and can be imported",
    bashExamples: "ls, grep, curl, git, npm, cat",
    codeBlockLang: "javascript",
    execToolSummary: "Run a given piece of JavaScript code. Use when you already have code to run \u2014 e.g., from a previous write_code call, re-running a snippet, or executing user-provided code.",
    writeRunToolSummary: "Write a fresh solution from scratch and execute it in one step. The autonomous, end-to-end tool for solving problems with code."
  },
  python: {
    toolDescExecute: "Execute a given piece of Python code in a child process. Use this when you already have code to run \u2014 e.g., running code from a previous write_code call, re-running a snippet, or executing code the user provided. Use print() for output.",
    toolDescWriteAndRun: "Write a fresh Python solution from scratch and execute it in one step. Use this when you need to figure out the code AND run it \u2014 the autonomous, end-to-end tool for solving problems with code.",
    codeParamDesc: "Python code to execute. Use print() for output.",
    codeRules: `- Your code runs in a Python 3 child process
- Use print() to produce output \u2014 that's how results are returned to you
- Use standard Python imports (import os, import json, from pathlib import Path, etc.)
- Write efficient scripts; prefer list comprehensions and built-in functions
- For async operations, use asyncio
- Handle errors with try/except so you get useful error messages
- A virtual environment is active \u2014 you can install packages using run_bash with: pip install <package>
- Installed packages persist across executions in this session`,
    commentsEnabled: `- Add a module-level docstring at the top of each script explaining what it does
- Add brief docstrings for any functions you define`,
    commentsDisabled: `- Do NOT write any comments in your code \u2014 save tokens. The code should be self-explanatory.`,
    packageLabel: "Available Packages",
    packageIntro: "These Python packages are available for import",
    bashExamples: "ls, grep, curl, git, pip, cat",
    codeBlockLang: "python",
    execToolSummary: "Run a given piece of Python code. Use when you already have code to run \u2014 e.g., from a previous write_code call, re-running a snippet, or executing user-provided code.",
    writeRunToolSummary: "Write a fresh Python solution from scratch and execute it in one step. The autonomous, end-to-end tool for solving problems with code."
  }
};
var EXECUTING_TOOLS = /* @__PURE__ */ new Set(["execute_code", "write_and_run_code", "run_bash"]);
function parseToolArgs2(toolCall) {
  const raw = toolCall?.function?.arguments;
  if (raw === void 0 || raw === null || raw === "") return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    logger_default.warn(`CodeAgent: tool "${toolCall?.function?.name}" returned unparseable arguments.`);
    return {};
  }
}
var CodeAgent = class extends base_default {
  /**
   * @param {CodeAgentOptions} [options={}]
   */
  constructor(options = {}) {
    const o = normalizeOptions(options, "CodeAgent");
    if (o.systemPrompt === void 0) o.systemPrompt = "";
    super({ ...o, timeout: o.requestTimeout });
    this.workingDirectory = o.workingDirectory || process.cwd();
    this.language = o.language || "javascript";
    this.pythonPath = o.pythonPath || null;
    this.maxRounds = o.maxRounds || 10;
    this.timeout = o.timeout || 3e4;
    this.onBeforeExecution = o.onBeforeExecution || null;
    this.onCodeExecution = o.onCodeExecution || null;
    this.importantFiles = o.importantFiles || [];
    this.writeDir = o.writeDir || (0, import_node_path.join)(this.workingDirectory, "tmp");
    this.keepArtifacts = o.keepArtifacts ?? false;
    this.comments = o.comments ?? false;
    this.codeMaxRetries = o.maxRetries ?? 3;
    this.skills = o.skills || [];
    this.envOverview = o.envOverview || "";
    this._pythonBinary = null;
    this._venvPath = null;
    this._venvEnv = null;
    this.customTools = (o.tools || []).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema || t.inputSchema || t.parametersJsonSchema || t.function?.parameters || t.parameters
    }));
    this.toolExecutor = o.toolExecutor || null;
    if (this.customTools.length > 0 && !this.toolExecutor) {
      throw new Error("CodeAgent: tools provided without a toolExecutor.");
    }
    this._codebaseContext = null;
    this._contextGathered = false;
    this._stopped = false;
    this._activeProcess = null;
    this._userSystemPrompt = o.systemPrompt || "";
    this._allExecutions = [];
    this._skillRegistry = /* @__PURE__ */ new Map();
    this._tools = this._buildToolDefinitions();
    logger_default.debug(`CodeAgent created for directory: ${this.workingDirectory}`);
  }
  // ── Tool Definitions ─────────────────────────────────────────────────────
  /**
   * Build tool definitions. Kept in the Claude `input_schema` shape;
   * `_buildTools()` converts them for the wire.
   * use_skill is only included when skills are registered.
   * @private
   * @returns {Array<{name: string, description: string, input_schema: Object}>}
   */
  _buildToolDefinitions() {
    const lang = LANG_CONFIG[this.language] || LANG_CONFIG.javascript;
    const tools = [
      {
        name: "write_code",
        description: "Output code without executing it. Use this when you want to show, propose, or present code to the user without running it.",
        input_schema: {
          type: "object",
          properties: {
            code: { type: "string", description: "The code to output." },
            purpose: { type: "string", description: 'A short 2-4 word slug describing the code (e.g., "api-client", "data-parser").' },
            language: { type: "string", description: 'Programming language of the code (default: "javascript").' }
          },
          required: ["code"]
        }
      },
      {
        name: "execute_code",
        description: lang.toolDescExecute,
        input_schema: {
          type: "object",
          properties: {
            code: { type: "string", description: lang.codeParamDesc },
            purpose: { type: "string", description: 'A short 2-4 word slug describing what this script does (e.g., "read-config", "parse-logs").' }
          },
          required: ["code"]
        }
      },
      {
        name: "write_and_run_code",
        description: lang.toolDescWriteAndRun,
        input_schema: {
          type: "object",
          properties: {
            code: { type: "string", description: lang.codeParamDesc },
            purpose: { type: "string", description: 'A short 2-4 word slug describing what this script does (e.g., "fetch-api-data", "generate-report").' }
          },
          required: ["code"]
        }
      },
      {
        name: "fix_code",
        description: "Fix broken code. Provide the original and fixed versions with an explanation. Optionally execute the fix to verify it works.",
        input_schema: {
          type: "object",
          properties: {
            original_code: { type: "string", description: "The original broken code." },
            fixed_code: { type: "string", description: "The corrected code." },
            explanation: { type: "string", description: "Brief explanation of what was wrong and how it was fixed." },
            execute: { type: "boolean", description: "If true, execute the fixed code to verify it works (default: false)." }
          },
          required: ["original_code", "fixed_code"]
        }
      },
      {
        name: "run_bash",
        description: `Execute a shell command in the working directory. Use this for file operations, git commands, installing packages, or any shell task (e.g., ${lang.bashExamples}). Prefer this over execute_code for simple shell operations.`,
        input_schema: {
          type: "object",
          properties: {
            command: { type: "string", description: "The shell command to execute." },
            purpose: { type: "string", description: 'A short 2-4 word slug describing the command (e.g., "list-files", "install-deps").' }
          },
          required: ["command"]
        }
      }
    ];
    if (this._skillRegistry && this._skillRegistry.size > 0) {
      tools.push({
        name: "use_skill",
        description: `Load a skill by name to get instructions, templates, or patterns. Available skills: ${[...this._skillRegistry.keys()].join(", ")}`,
        input_schema: {
          type: "object",
          properties: {
            skill_name: { type: "string", description: "The name of the skill to load." }
          },
          required: ["skill_name"]
        }
      });
    }
    for (const t of this.customTools) {
      tools.push({ name: t.name, description: t.description, input_schema: t.input_schema });
    }
    return tools;
  }
  // ── Init ─────────────────────────────────────────────────────────────────
  /**
   * Initialize the agent: load skills, gather codebase context, and build the
   * system prompt.
   * @param {boolean} [force=false]
   */
  async init(force = false) {
    if (this._initialized && !force) return;
    await this._ensureClient();
    if (this.skills.length > 0 && (this._skillRegistry.size === 0 || force)) {
      await this._loadSkills();
    }
    if (this.language === "python" && (!this._pythonBinary || force)) {
      await this._resolvePython();
      await this._setupVenv();
    }
    this._tools = this._buildToolDefinitions();
    if (!this._contextGathered || force) {
      await this._gatherCodebaseContext();
    }
    this.systemPrompt = this._buildSystemPrompt();
    await super.init(force);
  }
  // ── Skill Loading ────────────────────────────────────────────────────────
  /**
   * Load skill files into the skill registry.
   * @private
   */
  async _loadSkills() {
    this._skillRegistry.clear();
    for (const filePath of this.skills) {
      try {
        const content = await (0, import_promises2.readFile)(filePath, "utf-8");
        let name = (0, import_node_path.basename)(filePath).replace(/\.md$/i, "");
        const fmMatch = content.match(/^---\s*\n[\s\S]*?^name:\s*(.+)$/m);
        if (fmMatch) name = fmMatch[1].trim();
        this._skillRegistry.set(name, { name, content, path: filePath });
        logger_default.debug(`Loaded skill: ${name} from ${filePath}`);
      } catch (e) {
        logger_default.warn(`skills: could not load "${filePath}": ${e.message}`);
      }
    }
  }
  // ── Python Resolution ───────────────────────────────────────────────────
  /**
   * Resolve the Python 3 binary path.
   * @private
   */
  async _resolvePython() {
    const tryBinary = (bin) => new Promise((resolve2) => {
      (0, import_node_child_process.execFile)(bin, ["--version"], { timeout: 5e3 }, (err, stdout, stderr) => {
        if (err) return resolve2(null);
        const output = (stdout || "") + (stderr || "");
        if (output.includes("Python 3.")) return resolve2(bin);
        resolve2(null);
      });
    });
    if (this.pythonPath) {
      const result = await tryBinary(this.pythonPath);
      if (result) {
        this._pythonBinary = result;
        return;
      }
      throw new Error(`CodeAgent: pythonPath "${this.pythonPath}" is not a valid Python 3 binary.`);
    }
    const python3 = await tryBinary("python3");
    if (python3) {
      this._pythonBinary = python3;
      return;
    }
    const python = await tryBinary("python");
    if (python) {
      this._pythonBinary = python;
      return;
    }
    throw new Error('CodeAgent: language is "python" but python3 was not found on PATH. Install Python 3 or provide the pythonPath option.');
  }
  /**
   * Create a virtual environment for Python execution.
   * @private
   */
  async _setupVenv() {
    await (0, import_promises2.mkdir)(this.writeDir, { recursive: true });
    this._venvPath = (0, import_node_path.join)(this.writeDir, ".venv");
    const isWin = process.platform === "win32";
    const venvBin = isWin ? (0, import_node_path.join)(this._venvPath, "Scripts") : (0, import_node_path.join)(this._venvPath, "bin");
    const venvPython = (0, import_node_path.join)(venvBin, isWin ? "python.exe" : "python");
    try {
      await (0, import_promises2.readFile)(venvPython);
    } catch {
      logger_default.debug(`Creating Python venv at ${this._venvPath}`);
      await new Promise((resolve2, reject) => {
        (0, import_node_child_process.execFile)(this._pythonBinary, ["-m", "venv", this._venvPath], {
          timeout: 3e4
        }, (err) => {
          if (err) return reject(new Error(`CodeAgent: failed to create venv: ${err.message}`));
          resolve2(void 0);
        });
      });
    }
    const env = Object.assign({}, process.env);
    env.VIRTUAL_ENV = this._venvPath;
    env.PATH = venvBin + (isWin ? ";" : ":") + (process.env.PATH || "");
    this._venvEnv = env;
    this._pythonBinary = venvPython;
    logger_default.debug(`Python venv ready at ${this._venvPath}`);
  }
  // ── Context Gathering ────────────────────────────────────────────────────
  /**
   * @private
   */
  async _gatherCodebaseContext() {
    let fileTree = "";
    try {
      fileTree = await this._getFileTreeGit();
    } catch {
      logger_default.debug("git ls-files failed, falling back to readdir");
      fileTree = await this._getFileTreeReaddir(this.workingDirectory, 0, 3);
    }
    const lines = fileTree.split("\n");
    if (lines.length > MAX_FILE_TREE_LINES) {
      const truncated = lines.slice(0, MAX_FILE_TREE_LINES).join("\n");
      fileTree = `${truncated}
... (${lines.length - MAX_FILE_TREE_LINES} more files)`;
    }
    let packages = [];
    if (this.language === "python") {
      try {
        const reqPath = (0, import_node_path.join)(this.workingDirectory, "requirements.txt");
        const content = await (0, import_promises2.readFile)(reqPath, "utf-8");
        packages = content.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("-")).map((l) => l.split(/[>=<!\[;\s]/)[0]);
      } catch {
      }
      if (packages.length === 0) {
        try {
          const ppPath = (0, import_node_path.join)(this.workingDirectory, "pyproject.toml");
          const content = await (0, import_promises2.readFile)(ppPath, "utf-8");
          const depMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
          if (depMatch) {
            packages = (depMatch[1].match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, "").split(/[>=<!\[;\s]/)[0]);
          }
        } catch {
        }
      }
    } else {
      try {
        const pkgPath = (0, import_node_path.join)(this.workingDirectory, "package.json");
        const pkg = JSON.parse(await (0, import_promises2.readFile)(pkgPath, "utf-8"));
        packages = [
          ...Object.keys(pkg.dependencies || {}),
          ...Object.keys(pkg.devDependencies || {})
        ];
      } catch {
      }
    }
    const importantFileContents = [];
    if (this.importantFiles.length > 0) {
      const fileTreeLines = fileTree.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const requested of this.importantFiles) {
        const resolved = this._resolveImportantFile(requested, fileTreeLines);
        if (!resolved) {
          logger_default.warn(`importantFiles: could not locate "${requested}"`);
          continue;
        }
        try {
          const fullPath = (0, import_node_path.isAbsolute)(resolved) ? resolved : (0, import_node_path.join)(this.workingDirectory, resolved);
          const content = await (0, import_promises2.readFile)(fullPath, "utf-8");
          importantFileContents.push({ path: resolved, content });
        } catch (e) {
          logger_default.warn(`importantFiles: could not read "${resolved}": ${e.message}`);
        }
      }
    }
    this._codebaseContext = { fileTree, npmPackages: packages, packages, importantFileContents };
    this._contextGathered = true;
  }
  /**
   * @private
   * @param {string} filename
   * @param {string[]} fileTreeLines
   */
  _resolveImportantFile(filename, fileTreeLines) {
    if ((0, import_node_path.isAbsolute)(filename)) return filename;
    const exact = fileTreeLines.find((line) => line === filename);
    if (exact) return exact;
    const partial = fileTreeLines.find(
      (line) => line.endsWith("/" + filename) || line.endsWith(import_node_path.sep + filename)
    );
    return partial || null;
  }
  /**
   * @private
   * @returns {Promise<string>}
   */
  async _getFileTreeGit() {
    return new Promise((resolve2, reject) => {
      (0, import_node_child_process.execFile)("git", ["ls-files"], {
        cwd: this.workingDirectory,
        timeout: 5e3,
        maxBuffer: 5 * 1024 * 1024
      }, (err, stdout) => {
        if (err) return reject(err);
        resolve2(stdout.trim());
      });
    });
  }
  /**
   * @private
   * @param {string} dir
   * @param {number} depth
   * @param {number} maxDepth
   * @returns {Promise<string>}
   */
  async _getFileTreeReaddir(dir, depth, maxDepth) {
    if (depth >= maxDepth) return "";
    const entries = [];
    try {
      const items = await (0, import_promises2.readdir)(dir, { withFileTypes: true });
      for (const item of items) {
        if (IGNORE_DIRS.has(item.name)) continue;
        if (item.name.startsWith(".") && depth === 0 && item.isDirectory()) continue;
        const relativePath = (0, import_node_path.join)(dir, item.name).replace(this.workingDirectory + "/", "");
        if (item.isFile()) {
          entries.push(relativePath);
        } else if (item.isDirectory()) {
          entries.push(relativePath + "/");
          const subEntries = await this._getFileTreeReaddir((0, import_node_path.join)(dir, item.name), depth + 1, maxDepth);
          if (subEntries) entries.push(subEntries);
        }
      }
    } catch {
    }
    return entries.join("\n");
  }
  /**
   * @private
   */
  _buildSystemPrompt() {
    const { fileTree, packages, importantFileContents } = this._codebaseContext || { fileTree: "", packages: [], importantFileContents: [] };
    const lang = LANG_CONFIG[this.language] || LANG_CONFIG.javascript;
    let prompt = `You are a coding agent working in ${this.workingDirectory}.

## Available Tools

### write_code
Output code without executing it. Use when showing, proposing, or presenting code to the user.

### execute_code
${lang.execToolSummary}

### write_and_run_code
${lang.writeRunToolSummary}

### fix_code
Fix broken code by providing original and fixed versions. Set execute=true to verify the fix works.

### run_bash
Run shell commands directly (e.g., ${lang.bashExamples}). Prefer this over execute_code for simple shell operations.`;
    if (this._skillRegistry.size > 0) {
      prompt += `

### use_skill
Load a skill by name to get detailed instructions and templates. Available skills: ${[...this._skillRegistry.keys()].join(", ")}`;
    }
    prompt += `

## Code Execution Rules
These rules apply when using execute_code, write_and_run_code, or fix_code (with execute=true):
- Always provide a short descriptive \`purpose\` parameter (2-4 word slug like "read-config")
${lang.codeRules}
- The working directory is: ${this.workingDirectory}`;
    if (this.comments) {
      prompt += `
${lang.commentsEnabled}`;
    } else {
      prompt += `
${lang.commentsDisabled}`;
    }
    if (fileTree) {
      prompt += `

## File Tree
\`\`\`
${fileTree}
\`\`\``;
    }
    if (packages && packages.length > 0) {
      prompt += `

## ${lang.packageLabel}
${lang.packageIntro}: ${packages.join(", ")}`;
    }
    if (importantFileContents && importantFileContents.length > 0) {
      prompt += `

## Key Files`;
      for (const { path: filePath, content } of importantFileContents) {
        prompt += `

### ${filePath}
\`\`\`${lang.codeBlockLang}
${content}
\`\`\``;
      }
    }
    if (this._userSystemPrompt) {
      prompt += `

## Additional Instructions
${this._userSystemPrompt}`;
    }
    if (this.envOverview) {
      prompt += `

## Environment Overview
${this.envOverview}`;
    }
    return prompt;
  }
  // ── Code Execution ───────────────────────────────────────────────────────
  /**
   * @private
   * @param {string} [purpose]
   */
  _slugify(purpose) {
    if (!purpose) return (0, import_node_crypto.randomUUID)().slice(0, 8);
    return purpose.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }
  /**
   * @private
   * @param {string} code
   * @param {string} [purpose]
   * @param {string} [toolName]
   * @returns {Promise<any>}
   */
  async _executeCode(code, purpose, toolName) {
    if (this._stopped) {
      return { stdout: "", stderr: "Agent was stopped", exitCode: -1 };
    }
    if (this.onBeforeExecution) {
      try {
        const allowed = await this.onBeforeExecution(code, toolName || "execute_code");
        if (allowed === false) {
          return { stdout: "", stderr: "Execution denied by onBeforeExecution callback", exitCode: -1, denied: true };
        }
      } catch (e) {
        logger_default.warn(`onBeforeExecution callback error: ${e.message}`);
      }
    }
    await (0, import_promises2.mkdir)(this.writeDir, { recursive: true });
    const slug = this._slugify(purpose);
    const ext = this.language === "python" ? ".py" : ".mjs";
    const tempFile = (0, import_node_path.join)(this.writeDir, `agent-${slug}-${Date.now()}${ext}`);
    try {
      await (0, import_promises2.writeFile)(tempFile, code, "utf-8");
      const binary = this.language === "python" ? this._pythonBinary : "node";
      const execEnv = this.language === "python" && this._venvEnv ? this._venvEnv : process.env;
      const result = await new Promise((resolve2) => {
        const child = (0, import_node_child_process.execFile)(binary, [tempFile], {
          cwd: this.workingDirectory,
          timeout: this.timeout,
          env: execEnv,
          maxBuffer: 10 * 1024 * 1024
        }, (err, stdout, stderr) => {
          this._activeProcess = null;
          if (err) {
            resolve2({
              stdout: (
                /** @type {any} */
                err.stdout || stdout || ""
              ),
              stderr: (
                /** @type {any} */
                (err.stderr || stderr || "") + /** @type {any} */
                (err.killed ? "\n[EXECUTION TIMED OUT]" : "")
              ),
              exitCode: (
                /** @type {any} */
                err.code || 1
              )
            });
          } else {
            resolve2({ stdout: stdout || "", stderr: stderr || "", exitCode: 0 });
          }
        });
        this._activeProcess = child;
      });
      const totalLen = result.stdout.length + result.stderr.length;
      if (totalLen > MAX_OUTPUT_CHARS) {
        const half = Math.floor(MAX_OUTPUT_CHARS / 2);
        if (result.stdout.length > half) {
          result.stdout = result.stdout.slice(0, half) + "\n...[OUTPUT TRUNCATED]";
        }
        if (result.stderr.length > half) {
          result.stderr = result.stderr.slice(0, half) + "\n...[STDERR TRUNCATED]";
        }
      }
      this._allExecutions.push({
        code,
        purpose: purpose || null,
        output: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        filePath: this.keepArtifacts ? tempFile : null,
        tool: toolName || "execute_code"
      });
      if (this.onCodeExecution) {
        try {
          this.onCodeExecution(code, result);
        } catch (e) {
          logger_default.warn(`onCodeExecution callback error: ${e.message}`);
        }
      }
      return result;
    } finally {
      if (!this.keepArtifacts) {
        try {
          await (0, import_promises2.unlink)(tempFile);
        } catch {
        }
      }
    }
  }
  // ── Bash Execution ───────────────────────────────────────────────────────
  /**
   * Execute a bash command in the working directory.
   * @private
   * @param {string} command
   * @param {string} [purpose]
   * @returns {Promise<any>}
   */
  async _executeBash(command, purpose) {
    if (this._stopped) {
      return { stdout: "", stderr: "Agent was stopped", exitCode: -1 };
    }
    if (this.onBeforeExecution) {
      try {
        const allowed = await this.onBeforeExecution(command, "run_bash");
        if (allowed === false) {
          return { stdout: "", stderr: "Execution denied by onBeforeExecution callback", exitCode: -1, denied: true };
        }
      } catch (e) {
        logger_default.warn(`onBeforeExecution callback error: ${e.message}`);
      }
    }
    const execEnv = this.language === "python" && this._venvEnv ? this._venvEnv : process.env;
    const result = await new Promise((resolve2) => {
      const child = (0, import_node_child_process.execFile)("bash", ["-c", command], {
        cwd: this.workingDirectory,
        timeout: this.timeout,
        env: execEnv,
        maxBuffer: 10 * 1024 * 1024
      }, (err, stdout, stderr) => {
        this._activeProcess = null;
        if (err) {
          resolve2({
            stdout: (
              /** @type {any} */
              err.stdout || stdout || ""
            ),
            stderr: (
              /** @type {any} */
              (err.stderr || stderr || "") + /** @type {any} */
              (err.killed ? "\n[EXECUTION TIMED OUT]" : "")
            ),
            exitCode: (
              /** @type {any} */
              err.code || 1
            )
          });
        } else {
          resolve2({ stdout: stdout || "", stderr: stderr || "", exitCode: 0 });
        }
      });
      this._activeProcess = child;
    });
    const totalLen = result.stdout.length + result.stderr.length;
    if (totalLen > MAX_OUTPUT_CHARS) {
      const half = Math.floor(MAX_OUTPUT_CHARS / 2);
      if (result.stdout.length > half) {
        result.stdout = result.stdout.slice(0, half) + "\n...[OUTPUT TRUNCATED]";
      }
      if (result.stderr.length > half) {
        result.stderr = result.stderr.slice(0, half) + "\n...[STDERR TRUNCATED]";
      }
    }
    this._allExecutions.push({
      code: command,
      purpose: purpose || null,
      output: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      filePath: null,
      tool: "run_bash"
    });
    if (this.onCodeExecution) {
      try {
        this.onCodeExecution(command, result);
      } catch (e) {
        logger_default.warn(`onCodeExecution callback error: ${e.message}`);
      }
    }
    return result;
  }
  /**
   * @private
   * @param {any} result
   */
  _formatOutput(result) {
    let output = "";
    if (result.stdout) output += result.stdout;
    if (result.stderr) output += (output ? "\n" : "") + `[STDERR]: ${result.stderr}`;
    if (result.exitCode !== 0) output += (output ? "\n" : "") + `[EXIT CODE]: ${result.exitCode}`;
    return output || "(no output)";
  }
  // ── Tool Call Dispatch ───────────────────────────────────────────────────
  /**
   * Handle a tool call by name, dispatching to the appropriate handler.
   * @private
   * @param {string} name Tool name
   * @param {any} input Tool arguments
   * @returns {Promise<{output: string, type: string, data: any}>}
   */
  async _handleToolCall(name, input) {
    switch (name) {
      case "execute_code":
      case "write_and_run_code": {
        const result = await this._executeCode(input.code || "", input.purpose, name);
        return {
          output: this._formatOutput(result),
          type: "code_execution",
          data: {
            tool: name,
            code: input.code || "",
            purpose: input.purpose,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            denied: result.denied
          }
        };
      }
      case "write_code": {
        return {
          output: "Code written successfully.",
          type: "write",
          data: {
            tool: "write_code",
            code: input.code || "",
            purpose: input.purpose,
            language: input.language || "javascript"
          }
        };
      }
      case "fix_code": {
        let execResult = null;
        if (input.execute) {
          execResult = await this._executeCode(input.fixed_code || "", "fix", "fix_code");
        }
        return {
          output: input.execute ? this._formatOutput(execResult) : "Fix recorded.",
          type: "fix",
          data: {
            tool: "fix_code",
            originalCode: input.original_code || "",
            fixedCode: input.fixed_code || "",
            explanation: input.explanation,
            executed: !!input.execute,
            stdout: execResult?.stdout,
            stderr: execResult?.stderr,
            exitCode: execResult?.exitCode,
            denied: execResult?.denied
          }
        };
      }
      case "run_bash": {
        const result = await this._executeBash(input.command || "", input.purpose);
        return {
          output: this._formatOutput(result),
          type: "bash",
          data: {
            tool: "run_bash",
            command: input.command || "",
            purpose: input.purpose,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            denied: result.denied
          }
        };
      }
      case "use_skill": {
        const skillName = input.skill_name || "";
        const skill = this._skillRegistry.get(skillName);
        if (!skill) {
          const available = [...this._skillRegistry.keys()].join(", ");
          return {
            output: `Skill "${skillName}" not found. Available skills: ${available || "(none)"}`,
            type: "skill",
            data: { tool: "use_skill", skillName, found: false }
          };
        }
        return {
          output: skill.content,
          type: "skill",
          data: { tool: "use_skill", skillName: skill.name, content: skill.content, found: true }
        };
      }
      default: {
        if (this.toolExecutor) {
          try {
            const result = await this.toolExecutor(name, input);
            const resultStr = typeof result === "string" ? result : JSON.stringify(result);
            return {
              output: resultStr,
              type: "tool",
              data: { tool: name, args: input, result }
            };
          } catch (err) {
            return {
              output: `Tool "${name}" failed: ${err.message}`,
              type: "tool",
              data: { tool: name, args: input, error: err.message }
            };
          }
        }
        return {
          output: `Unknown tool: ${name}`,
          type: "unknown",
          data: { tool: name }
        };
      }
    }
  }
  /**
   * Backward-compatible `codeExecutions` view of the toolCalls list.
   * @private
   * @param {any[]} toolCalls
   */
  _codeExecutionsFrom(toolCalls) {
    return toolCalls.filter((tc) => tc.tool === "execute_code" || tc.tool === "write_and_run_code" || tc.tool === "fix_code" && tc.executed).map((tc) => ({
      code: tc.code || tc.fixedCode,
      purpose: this._slugify(tc.purpose),
      output: tc.stdout || "",
      stderr: tc.stderr || "",
      exitCode: tc.exitCode ?? 0
    }));
  }
  // ── Non-Streaming Chat ───────────────────────────────────────────────────
  /**
   * Send a message and get a complete response (non-streaming).
   * Automatically handles the multi-tool execution loop.
   *
   * @param {string} message
   * @param {Object} [opts={}] per-message options
   * @returns {Promise<CodeAgentResponse>}
   */
  async chat(message, opts = {}) {
    if (!this._initialized) await this.init();
    this._stopped = false;
    const toolCalls = [];
    let consecutiveFailures = 0;
    this._resetUsage();
    let response = await this._sendMessage(message, { tools: this._tools, ...opts });
    this._accumulateUsage(response, response._gatewayHeaders);
    for (let round = 0; round < this.maxRounds; round++) {
      if (this._stopped) break;
      const calls = response?.choices?.[0]?.message?.tool_calls || [];
      if (calls.length === 0) break;
      const toolResults = [];
      for (const call of calls) {
        if (this._stopped) break;
        const toolName = call.function?.name;
        const toolInput = parseToolArgs2(call);
        const { output, data } = await this._handleToolCall(toolName, toolInput);
        toolCalls.push(data);
        const isExecutingTool = EXECUTING_TOOLS.has(toolName) || toolName === "fix_code" && toolInput.execute;
        if (isExecutingTool) {
          if (data.exitCode !== 0 && !data.denied) consecutiveFailures++;
          else consecutiveFailures = 0;
        }
        let toolOutput = output;
        if (consecutiveFailures >= this.codeMaxRetries) {
          toolOutput += `

[RETRY LIMIT REACHED] You have failed ${this.codeMaxRetries} consecutive attempts. STOP trying to execute code. Instead, respond with: 1) What you were trying to do, 2) The errors you encountered, 3) Questions for the user about how to resolve it.`;
        }
        toolResults.push({ role: "tool", tool_call_id: call.id, content: toolOutput });
      }
      if (this._stopped) break;
      response = await this._sendMessage(toolResults, { tools: this._tools, ...opts });
      this._accumulateUsage(response, response._gatewayHeaders);
      if (consecutiveFailures >= this.codeMaxRetries) break;
    }
    return {
      text: this._extractText(response),
      codeExecutions: this._codeExecutionsFrom(toolCalls),
      toolCalls,
      usage: this.getLastUsage()
    };
  }
  // ── Streaming ────────────────────────────────────────────────────────────
  /**
   * Send a message and stream the response as events.
   *
   * Event types:
   * - `text` — a chunk of the agent's text response
   * - `code` — the agent is about to execute code (execute_code / write_and_run_code)
   * - `output` — code/bash finished executing
   * - `write` — the agent wrote code without executing (write_code)
   * - `fix` — the agent fixed code (fix_code)
   * - `bash` — the agent is about to run a bash command
   * - `skill` — the agent loaded a skill
   * - `tool` — a custom tool ran
   * - `done` — the agent finished
   *
   * @param {string} message
   * @param {Object} [opts={}]
   * @yields {CodeAgentStreamEvent}
   */
  async *stream(message, opts = {}) {
    if (!this._initialized) await this.init();
    this._stopped = false;
    const toolCalls = [];
    let fullText = "";
    let consecutiveFailures = 0;
    this._resetUsage();
    let stream = await this._streamMessage(message, { tools: this._tools, ...opts });
    for (let round = 0; round < this.maxRounds; round++) {
      if (this._stopped) break;
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length) {
          fullText += delta;
          yield { type: "text", text: delta };
        }
      }
      const assembled = this._assembleStreamResponse(chunks, this.modelName);
      this.history.push(this._assistantHistoryEntry(assembled.choices[0].message));
      this._streamUsage(assembled);
      const calls = assembled.choices[0].message.tool_calls || [];
      if (calls.length === 0) {
        yield {
          type: "done",
          fullText,
          codeExecutions: this._codeExecutionsFrom(toolCalls),
          toolCalls,
          usage: this.getLastUsage()
        };
        return;
      }
      const toolResults = [];
      for (const call of calls) {
        if (this._stopped) break;
        const toolName = call.function?.name;
        const toolInput = parseToolArgs2(call);
        if (toolName === "write_code") {
          yield { type: "write", code: toolInput.code, purpose: toolInput.purpose, language: toolInput.language || "javascript" };
        } else if (toolName === "fix_code") {
          yield { type: "fix", originalCode: toolInput.original_code, fixedCode: toolInput.fixed_code, explanation: toolInput.explanation };
        } else if (toolName === "run_bash") {
          yield { type: "bash", command: toolInput.command };
        } else if (toolName === "execute_code" || toolName === "write_and_run_code") {
          yield { type: "code", code: toolInput.code };
        }
        const { output, type, data } = await this._handleToolCall(toolName, toolInput);
        toolCalls.push(data);
        if (data.stdout !== void 0 || data.stderr !== void 0) {
          yield {
            type: "output",
            code: data.code || data.command || data.fixedCode,
            stdout: data.stdout || "",
            stderr: data.stderr || "",
            exitCode: data.exitCode ?? 0
          };
        }
        if (toolName === "use_skill") {
          yield { type: "skill", skillName: data.skillName, content: data.content, found: data.found };
        }
        if (type === "tool") {
          yield { type: "tool", toolName, args: data.args, result: data.result, error: data.error };
        }
        const isExecutingTool = EXECUTING_TOOLS.has(toolName) || toolName === "fix_code" && toolInput.execute;
        if (isExecutingTool) {
          if (data.exitCode !== 0 && !data.denied) consecutiveFailures++;
          else consecutiveFailures = 0;
        }
        let toolOutput = output;
        if (consecutiveFailures >= this.codeMaxRetries) {
          toolOutput += `

[RETRY LIMIT REACHED] You have failed ${this.codeMaxRetries} consecutive attempts. STOP trying to execute code. Instead, respond with: 1) What you were trying to do, 2) The errors you encountered, 3) Questions for the user about how to resolve it.`;
        }
        toolResults.push({ role: "tool", tool_call_id: call.id, content: toolOutput });
      }
      if (this._stopped) break;
      stream = await this._streamMessage(toolResults, { tools: this._tools, ...opts });
      if (consecutiveFailures >= this.codeMaxRetries) break;
    }
    let warning = "Max tool rounds reached";
    if (this._stopped) warning = "Agent was stopped";
    else if (consecutiveFailures >= this.codeMaxRetries) warning = "Retry limit reached";
    yield {
      type: "done",
      fullText,
      codeExecutions: this._codeExecutionsFrom(toolCalls),
      toolCalls,
      usage: this.getLastUsage(),
      warning
    };
  }
  // ── Dump ─────────────────────────────────────────────────────────────────
  /**
   * Returns all code scripts and bash commands the agent has executed.
   * @returns {Array<{fileName: string, purpose: string|null, script: string, filePath: string|null, tool: string}>}
   */
  dump() {
    const ext = this.language === "python" ? ".py" : ".mjs";
    return this._allExecutions.map((exec, i) => ({
      fileName: exec.purpose ? `agent-${exec.purpose}${ext}` : `script-${i + 1}${ext}`,
      purpose: exec.purpose || null,
      script: exec.code,
      filePath: exec.filePath || null,
      tool: exec.tool || "execute_code"
    }));
  }
  // ── Stop ─────────────────────────────────────────────────────────────────
  /**
   * Stop the agent. Kills any running child process.
   */
  stop() {
    this._stopped = true;
    if (this._activeProcess) {
      try {
        this._activeProcess.kill("SIGTERM");
      } catch {
      }
    }
    logger_default.info("CodeAgent stopped");
  }
};
var code_agent_default = CodeAgent;

// rag-agent.js
var import_node_path2 = require("node:path");
var import_promises3 = require("node:fs/promises");
var MIME_TYPES = {
  // Text (read as UTF-8, injected as text)
  ".txt": "text/plain",
  ".md": "text/plain",
  ".csv": "text/csv",
  ".html": "text/html",
  ".htm": "text/html",
  ".xml": "text/xml",
  ".json": "application/json",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".ts": "text/plain",
  ".css": "text/css",
  ".yaml": "text/plain",
  ".yml": "text/plain",
  ".py": "text/x-python",
  ".rb": "text/plain",
  ".sh": "text/plain",
  // Images (base64 encoded for vision)
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  // Documents (base64 encoded)
  ".pdf": "application/pdf"
};
var DEFAULT_SYSTEM_PROMPT = "You are a helpful AI assistant. Answer questions based on the provided documents and data. When referencing information, mention which document or data source it comes from.";
var RagAgent = class extends base_default {
  /**
   * @param {RagAgentOptions} [options={}]
   */
  constructor(options = {}) {
    const citationsRequested = options.enableCitations === true;
    const o = normalizeOptions(options, "RagAgent");
    if (o.systemPrompt === void 0) o.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    super(o);
    this.localFiles = o.localFiles || [];
    this.localData = o.localData || [];
    this.mediaFiles = o.mediaFiles || [];
    if (o.remoteFiles?.length) {
      warnOnce(
        "remoteFiles",
        "ak-litellm: `remoteFiles` is accepted but the Google Files API does not exist behind this gateway. The paths are read from disk and inlined as base64, the same as `mediaFiles`. Images and PDFs work; audio and video are skipped.",
        this._silentCompat
      );
      this.mediaFiles = [...this.mediaFiles, ...o.remoteFiles];
    }
    this.enableCitations = false;
    this._citationsRequested = citationsRequested;
    this._localFileContents = [];
    this._mediaContentBlocks = [];
    const total = this.localFiles.length + this.localData.length + this.mediaFiles.length;
    logger_default.debug(`RagAgent created with ${total} context sources`);
  }
  // ── Initialization ───────────────────────────────────────────────────────
  /**
   * Reads local files, encodes media, and seeds all context into conversation.
   * @param {boolean} [force=false]
   * @returns {Promise<void>}
   */
  async init(force = false) {
    if (this._initialized && !force) return;
    await this._ensureClient();
    this._localFileContents = [];
    for (const filePath of this.localFiles) {
      const resolvedPath = (0, import_node_path2.resolve)(filePath);
      logger_default.debug(`Reading local file: ${resolvedPath}`);
      const content = await (0, import_promises3.readFile)(resolvedPath, "utf-8");
      this._localFileContents.push({
        name: (0, import_node_path2.basename)(resolvedPath),
        content,
        path: resolvedPath
      });
      logger_default.debug(`Local file read: ${(0, import_node_path2.basename)(resolvedPath)} (${content.length} chars)`);
    }
    this._mediaContentBlocks = [];
    for (const filePath of this.mediaFiles) {
      const resolvedPath = (0, import_node_path2.resolve)(filePath);
      const ext = (0, import_node_path2.extname)(resolvedPath).toLowerCase();
      const mimeType = MIME_TYPES[ext] || "application/octet-stream";
      logger_default.debug(`Encoding media file: ${resolvedPath} (${mimeType})`);
      const buffer = await (0, import_promises3.readFile)(resolvedPath);
      const base64 = buffer.toString("base64");
      if (mimeType.startsWith("image/")) {
        this._mediaContentBlocks.push({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64}` }
        });
      } else if (mimeType === "application/pdf") {
        this._mediaContentBlocks.push({
          type: "file",
          file: {
            filename: (0, import_node_path2.basename)(resolvedPath),
            file_data: `data:${mimeType};base64,${base64}`
          }
        });
      } else {
        logger_default.warn(`RagAgent: "${(0, import_node_path2.basename)(resolvedPath)}" (${mimeType}) is not an image or PDF \u2014 skipped. /v1/chat/completions carries images and PDFs only.`);
      }
    }
    const contentParts = [];
    for (const block of this._mediaContentBlocks) contentParts.push(block);
    for (const lf of this._localFileContents) {
      contentParts.push({ type: "text", text: `--- File: ${lf.name} ---
${lf.content}` });
    }
    for (const ld of this.localData) {
      const serialized = typeof ld.data === "string" ? ld.data : JSON.stringify(ld.data, null, 2);
      contentParts.push({ type: "text", text: `--- Data: ${ld.name} ---
${serialized}` });
    }
    if (contentParts.length > 0) {
      contentParts.push({ type: "text", text: "Here are the documents and data to analyze." });
      this.history = [
        { role: "user", content: contentParts },
        { role: "assistant", content: "I have reviewed all the provided documents and data. I am ready to answer your questions about them." }
      ];
    }
    this._initialized = true;
    logger_default.debug(`RagAgent initialized with ${this._localFileContents.length} local files, ${this.localData.length} data entries, ${this._mediaContentBlocks.length} media files`);
  }
  // ── Non-Streaming Chat ───────────────────────────────────────────────────
  /**
   * Send a message and get a response grounded in the loaded context.
   *
   * @param {string} message the user's question
   * @param {Object} [opts={}]
   * @returns {Promise<RagResponse>}
   */
  async chat(message, opts = {}) {
    if (!this._initialized) await this.init();
    this._resetUsage();
    const response = await this._sendMessage(message, opts);
    this._accumulateUsage(response, response._gatewayHeaders);
    const result = {
      text: this._extractText(response),
      usage: this.getLastUsage()
    };
    if (this._citationsRequested) result.citations = [];
    return result;
  }
  // ── Streaming ────────────────────────────────────────────────────────────
  /**
   * Send a message and stream the response as events.
   *
   * @param {string} message the user's question
   * @param {Object} [opts={}]
   * @yields {RagStreamEvent}
   */
  async *stream(message, opts = {}) {
    if (!this._initialized) await this.init();
    this._resetUsage();
    const stream = await this._streamMessage(message, opts);
    const chunks = [];
    let fullText = "";
    for await (const chunk of stream) {
      chunks.push(chunk);
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length) {
        fullText += delta;
        yield { type: "text", text: delta };
      }
    }
    const assembled = this._assembleStreamResponse(chunks, this.modelName);
    this.history.push(this._assistantHistoryEntry(assembled.choices[0].message));
    this._streamUsage(assembled);
    yield { type: "done", fullText, usage: this.getLastUsage() };
  }
  // ── Context Management ──────────────────────────────────────────────────
  /**
   * Add local text files (read from disk). Triggers reinitialize.
   * @param {string[]} paths
   * @returns {Promise<void>}
   */
  async addLocalFiles(paths) {
    this.localFiles.push(...paths);
    await this.init(true);
  }
  /**
   * Add in-memory data entries. Triggers reinitialize.
   * @param {LocalDataEntry[]} entries
   * @returns {Promise<void>}
   */
  async addLocalData(entries) {
    this.localData.push(...entries);
    await this.init(true);
  }
  /**
   * Add media files (images, PDFs). Triggers reinitialize.
   * @param {string[]} paths
   * @returns {Promise<void>}
   */
  async addMediaFiles(paths) {
    this.mediaFiles.push(...paths);
    await this.init(true);
  }
  /**
   * ak-gemini parity. There is no Files API here, so the paths are inlined as
   * base64 exactly like `addMediaFiles()`.
   * @param {string[]} paths
   * @returns {Promise<void>}
   */
  async addRemoteFiles(paths) {
    warnOnce(
      "remoteFiles",
      "ak-litellm: `remoteFiles` is accepted but the Google Files API does not exist behind this gateway. The paths are read from disk and inlined as base64, the same as `mediaFiles`. Images and PDFs work; audio and video are skipped.",
      this._silentCompat
    );
    return await this.addMediaFiles(paths);
  }
  /**
   * Returns metadata about all context sources.
   * @returns {{ localFiles: Array<Object>, localData: Array<Object>, mediaFiles: Array<Object> }}
   */
  getContext() {
    return {
      localFiles: this._localFileContents.map((lf) => ({
        name: lf.name,
        path: lf.path,
        size: lf.content.length
      })),
      localData: this.localData.map((ld) => ({
        name: ld.name,
        type: typeof ld.data === "object" && ld.data !== null ? Array.isArray(ld.data) ? "array" : "object" : typeof ld.data
      })),
      mediaFiles: this.mediaFiles.map((f) => ({
        path: (0, import_node_path2.resolve)(f),
        name: (0, import_node_path2.basename)(f),
        ext: (0, import_node_path2.extname)(f).toLowerCase()
      }))
    };
  }
};
var rag_agent_default = RagAgent;

// unsupported.js
var Embedding = class {
  constructor() {
    throw new Error(
      "ak-litellm: Embedding is not available. The Mixpanel LiteLLM gateway serves no embedding models (GET /v1/embeddings returns 400, verified 2026-09-08). Use ak-gemini for embeddings, or ask the gateway owners to add an embedding model."
    );
  }
};
var ImageGenerator = class {
  constructor() {
    throw new Error(
      "ak-litellm: ImageGenerator is not available. The Mixpanel LiteLLM gateway serves no image-generation models \u2014 none appear in GET /v1/models (verified 2026-09-08). Use ak-gemini for image generation, or ask the gateway owners to add an image model."
    );
  }
};
var AgentQuery = class {
  constructor() {
    throw new Error(
      "ak-litellm: AgentQuery is not available. It wraps @anthropic-ai/claude-agent-sdk, which authenticates against the Anthropic API directly and cannot be pointed at the Mixpanel LiteLLM gateway. Use ak-claude for AgentQuery, or use CodeAgent/ToolAgent here."
    );
  }
};

// index.js
var ThinkingLevel = Object.freeze({
  THINKING_LEVEL_UNSPECIFIED: "THINKING_LEVEL_UNSPECIFIED",
  MINIMAL: "MINIMAL",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH"
});
var HarmCategory = Object.freeze({
  HARM_CATEGORY_UNSPECIFIED: "HARM_CATEGORY_UNSPECIFIED",
  HARM_CATEGORY_HARASSMENT: "HARM_CATEGORY_HARASSMENT",
  HARM_CATEGORY_HATE_SPEECH: "HARM_CATEGORY_HATE_SPEECH",
  HARM_CATEGORY_SEXUALLY_EXPLICIT: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  HARM_CATEGORY_DANGEROUS_CONTENT: "HARM_CATEGORY_DANGEROUS_CONTENT",
  HARM_CATEGORY_CIVIC_INTEGRITY: "HARM_CATEGORY_CIVIC_INTEGRITY",
  HARM_CATEGORY_JAILBREAK: "HARM_CATEGORY_JAILBREAK",
  HARM_CATEGORY_IMAGE_HATE: "HARM_CATEGORY_IMAGE_HATE",
  HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT: "HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT",
  HARM_CATEGORY_IMAGE_HARASSMENT: "HARM_CATEGORY_IMAGE_HARASSMENT",
  HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT: "HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT"
});
var HarmBlockThreshold = Object.freeze({
  HARM_BLOCK_THRESHOLD_UNSPECIFIED: "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
  BLOCK_LOW_AND_ABOVE: "BLOCK_LOW_AND_ABOVE",
  BLOCK_MEDIUM_AND_ABOVE: "BLOCK_MEDIUM_AND_ABOVE",
  BLOCK_ONLY_HIGH: "BLOCK_ONLY_HIGH",
  BLOCK_NONE: "BLOCK_NONE",
  OFF: "OFF"
});
var index_default = { Transformer: transformer_default, Chat: chat_default, Message: message_default, ToolAgent: tool_agent_default, CodeAgent: code_agent_default, RagAgent: rag_agent_default };
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AgentQuery,
  BaseClaude,
  BaseGemini,
  BaseLiteLLM,
  Chat,
  CodeAgent,
  DEFAULT_MODEL,
  EFFORT_LEVELS,
  Embedding,
  HarmBlockThreshold,
  HarmCategory,
  ImageGenerator,
  MODEL_ALIASES,
  MODEL_INFO,
  MODEL_PRICING,
  MODEL_PRICING_AS_OF,
  Message,
  RagAgent,
  ThinkingLevel,
  ToolAgent,
  Transformer,
  attemptJSONRecovery,
  budgetTokensToEffort,
  computeCost,
  extractJSON,
  getModelInfo,
  isJSON,
  isJSONStr,
  listModels,
  log,
  modelProvider,
  normalizeOptions,
  refreshModelInfo,
  resolvePricing,
  samplingSupport,
  validateSchema
});
