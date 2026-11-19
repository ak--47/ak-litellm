// ── ak-litellm type definitions ──────────────────────────────────────────────
//
// The option interfaces below are deliberately a UNION of ak-claude's and
// ak-gemini's, so that TypeScript code written against either package still
// compiles after the import line is swapped. Options this gateway cannot back
// are typed, accepted, and warned about once at runtime — see `compat.js`.

// ── Shared Types ─────────────────────────────────────────────────────────────

/**
 * Reasoning depth. The union of both packages' vocabularies: ak-claude accepts
 * low|medium|high|xhigh|max, ak-gemini adds 'minimal'. All six are accepted
 * here and collapse to the gateway's `reasoning_effort: low|medium|high`.
 */
export type EffortLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Anthropic prompt-cache lifetime. These are the only two windows
 * `cache_control` accepts. `'1h'` costs 2x the base input rate to write,
 * `'5m'` costs 1.25x; reads cost the same either way.
 */
export type CacheTtl = '5m' | '1h';

/**
 * Tri-state cache switch. `'auto'` — the default — caches when the model
 * supports it and the block clears `CACHE_MIN_TOKENS`, and is silent when it
 * declines. `true` forces it on and warns when that cannot work. `false` never
 * caches.
 */
export type CacheSetting = boolean | 'auto';

/** How a model reacts to a trailing `{ role: 'assistant' }` prefill message. */
export type PrefillMode = 'continue' | 'restart' | 'reject';

/** Which web-search tool shape a model accepts, or `null` when it cannot search. */
export type WebSearchStyle = 'anthropic' | 'google' | 'openai' | null;

/** ak-gemini's `thinkingConfig.thinkingLevel` values. */
export type ThinkingLevelValue = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'THINKING_LEVEL_UNSPECIFIED';

/** How thinking blocks are surfaced. Accepted and ignored — the gateway never returns them. */
export type ThinkingDisplay = 'omitted' | 'summarized';

export interface AdaptiveThinkingConfig {
  type: 'adaptive';
  display?: ThinkingDisplay;
}

/** Legacy budget-based thinking. Translated to an `effort` level. */
export interface BudgetThinkingConfig {
  type: 'enabled';
  budget_tokens: number;
  display?: ThinkingDisplay;
}

export type ThinkingConfig = AdaptiveThinkingConfig | BudgetThinkingConfig;

/** ak-gemini's thinking config. `thinkingLevel` wins; `thinkingBudget` is mapped. */
export interface GeminiThinkingConfig {
  thinkingLevel?: ThinkingLevelValue | string;
  thinkingBudget?: number;
  includeThoughts?: boolean;
}

/**
 * Prompt-cache TTL. Accepted for source compatibility only — prompt caching
 * does not engage through this gateway (verified 2026-09-08).
 */
export type CacheTtl = '5m' | '1h';

/** Per-million-token pricing entry. An `intro` block models a promotional window. */
export interface ModelPricing {
  input: number;
  output: number;
  cachedInput?: number;
  intro?: { input: number; output: number; cachedInput?: number; until: string };
  /** Set when the returned rate is promotional; the date the promo ends. */
  introUntil?: string;
}

/** Pricing resolved for a point in time. */
export interface ResolvedPricing extends ModelPricing {
  /** Last date the pricing table was generated from `GET /model/info` (YYYY-MM-DD). */
  asOf: string;
}

/** The token counts `computeCost()` reads. A full `UsageData` satisfies it. */
export interface UsageLike {
  promptTokens?: number;
  responseTokens?: number;
  thoughtsTokens?: number;
  cachedTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  /** Used as the model id when `computeCost()` is called without one. */
  requestedModel?: string | null;
}

/** Where a cost figure came from. `null` = unknown, never free. */
export type CostSource = 'gateway' | 'estimated' | null;

export interface ResponseMetadata {
  modelVersion: string | null;
  requestedModel: string;
  promptTokens: number;
  responseTokens: number;
  totalTokens: number;
  thoughtsTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  stopReason: string | null;
  timestamp: number;
  /** `x-litellm-response-cost` for this round-trip. null on streamed rounds. */
  gatewayCost: number | null;
  /** The upstream deployment the gateway routed to, from `x-litellm-model-id`. */
  upstreamModel: string | null;
  /** `x-litellm-call-id`, for correlating with the gateway's own logs. */
  callId: string | null;
  /** Running spend on this API key, from `x-litellm-key-spend`. */
  keySpend: number | null;
}

export interface UsageData {
  /**
   * How many web searches the provider ran for this turn, from
   * `prompt_tokens_details.web_search_requests`.
   *
   * Providers bill searches SEPARATELY from tokens (Anthropic charges roughly
   * $10 per thousand), and that charge is **not** included in `estimatedCost`.
   * A non-zero value here means the real cost is above the token math.
   */
  webSearchRequests?: number;
  /** CUMULATIVE input tokens across every API round-trip in the turn */
  promptTokens: number;
  /** CUMULATIVE output tokens across every API round-trip in the turn */
  responseTokens: number;
  /** CUMULATIVE total tokens across every API round-trip in the turn */
  totalTokens: number;
  /** Reasoning tokens, from `completion_tokens_details.reasoning_tokens` */
  thoughtsTokens: number;
  /** Always 0 — prompt caching does not engage through this gateway */
  cacheCreationTokens: number;
  /** Always 0 — prompt caching does not engage through this gateway */
  cacheReadTokens: number;
  /** ak-gemini spelling of `cacheReadTokens` */
  cachedTokens: number;
  /** Number of API ROUND-TRIPS in the turn (not retries) */
  attempts: number;
  /** Actual model that responded */
  modelVersion: string | null;
  /** Model you requested */
  requestedModel: string;
  /** Finish reason (e.g. 'stop', 'tool_calls', 'length') */
  stopReason: string | null;
  timestamp: number;
  /**
   * USD cost. `null` means UNKNOWN — NOT that the call was free.
   * @see costSource for whether this is the gateway's own figure or a table estimate.
   */
  estimatedCost?: number | null;
  /** 'gateway' = the gateway's exact billing figure; 'estimated' = pricing table. */
  costSource?: CostSource;
  upstreamModel?: string | null;
  callId?: string | null;
  keySpend?: number | null;
}

export interface TransformationExample {
  CONTEXT?: Record<string, unknown> | string;
  PROMPT?: Record<string, unknown>;
  ANSWER?: Record<string, unknown>;
  INPUT?: Record<string, unknown>;
  OUTPUT?: Record<string, unknown>;
  SYSTEM?: string;
  EXPLANATION?: string;
  [key: string]: any;
}

export type AsyncValidatorFunction = (payload: Record<string, unknown>) => Promise<unknown>;
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'none';

// ── Constructor Options ──────────────────────────────────────────────────────

export interface BaseLiteLLMOptions {
  /**
   * Cache the system prompt so repeat calls reuse it.
   *
   * `'auto'` (default) caches when the model supports it AND the block clears
   * {@link CACHE_MIN_TOKENS}, and stays silent when it declines. `true` forces
   * it and warns when that cannot work. `false` never caches.
   *
   * Measured 2026-09-11: caching works on `claude-sonnet-5`, `claude-opus-5`,
   * `claude-opus-4-7` and `claude-fable-5-1` — 10x to 29x cheaper on a repeat
   * prefix. It does NOT work on `claude-haiku-4-5`, `gemini-*` or `gpt-*`,
   * whatever the gateway's own `supports_prompt_caching` flag claims.
   *
   * @default 'auto'
   * @example
   * // 9.5x cheaper from the second call onward, no other code change
   * new Chat({ modelName: 'claude-sonnet-5', systemPrompt: BIG_PROMPT });
   */
  cacheSystemPrompt?: CacheSetting;

  /**
   * Cache lifetime. `'1h'` costs 2x the input rate to write, `'5m'` costs
   * 1.25x; reads cost the same. Use `'1h'` when the same prefix is reused for
   * longer than five minutes.
   * @default '5m'
   */
  cacheTtl?: CacheTtl;

  /**
   * `RagAgent` only — cache the injected document block. That block is usually
   * far larger than the system prompt and is resent with every question, so
   * this is where RagAgent saves the most.
   * @default 'auto'
   */
  cacheContext?: CacheSetting;

  /**
   * `Transformer` only — cache the seeded few-shot examples, which are byte
   * identical on every `send()`.
   * @default 'auto'
   */
  cacheExamples?: CacheSetting;

  /**
   * Text to put in the model's mouth. Sent as a trailing
   * `{ role: 'assistant' }` turn that the model continues from.
   *
   * The cheapest way to force a shape: `prefill: '['` makes the reply start as
   * a JSON array, with no schema round-trip.
   *
   * Behaviour differs by model, and this package handles all three cases —
   * see {@link PrefillMode}. On a `continue` model the returned `text` is
   * `prefill + continuation`; on `restart` it is the model's own full reply; on
   * `reject` the prefill is dropped with one warning and the call still works.
   */
  prefill?: string | null;

  /**
   * Which HTTP route to use.
   *
   * `'auto'` (default) uses `/v1/chat/completions` for everything except OpenAI
   * web search, which only exists on `/v1/responses`. `'chat'` and `'responses'`
   * force one route. Function calling and structured output are chat-only.
   * @default 'auto'
   */
  transport?: 'chat' | 'responses' | 'auto';

  /**
   * What to do when the estimated input exceeds the model's context window.
   *
   * `'warn'` (default) logs once and sends anyway, because the estimate is a
   * 4-chars-per-token heuristic and a false positive must not block a valid
   * call. `'throw'` fails locally before spending. `'off'` disables the check.
   * @default 'warn'
   */
  contextGuard?: 'throw' | 'warn' | 'off';

  /** Model id as the gateway names it (default: 'claude-sonnet-5') */
  modelName?: string;
  /** System prompt (null or false to disable) */
  systemPrompt?: string | null | false;
  /** Log level (default: based on NODE_ENV). 'none' also silences compat warnings. */
  logLevel?: LogLevel;

  // ── Transport ──
  /** Gateway API key. Falls back to LITELLM_API_KEY. */
  apiKey?: string;
  /** Gateway base URL. Falls back to LITELLM_BASE_URL, then the Mixpanel default. */
  baseURL?: string;
  /** Per-request HTTP timeout in ms (default: 600000) */
  timeout?: number;

  // ── Generation config ──
  /** Maximum output tokens (default: 8192) */
  maxTokens?: number | null;
  /** ak-gemini alias for `maxTokens` */
  maxOutputTokens?: number | null;
  /**
   * Temperature (default: 0.7). `null` means never send it.
   * Dropped automatically on models that reject it (the Claude 5 family and
   * every `gpt-*` model on this gateway).
   */
  temperature?: number | null;
  /** Top-P (default: 0.95). `null` means never send it. Same gating as `temperature`. */
  topP?: number | null;
  /** Top-K. `null` means never send it. Only Google/DeepSeek/Zhipu models accept it. */
  topK?: number | null;

  /**
   * Reasoning depth, sent as `reasoning_effort`. Accepts both packages'
   * vocabularies. Throws on an unrecognized value.
   */
  effort?: EffortLevel | null;
  /** ak-gpt alias for `effort` */
  reasoningEffort?: EffortLevel | null;
  /** ak-claude thinking config. Translated to `effort`. */
  thinking?: ThinkingConfig | null;
  /** ak-gemini thinking config. Translated to `effort`. */
  thinkingConfig?: GeminiThinkingConfig | null;
  /** Accepted and ignored — there is no adaptive-thinking translation to do here. */
  adaptiveThinking?: boolean;

  // ── Retry ──
  /** SDK-level retry attempts for 429/5xx (default: 5) */
  maxRetries?: number;
  /** Base retry delay in ms (default: 1000) */
  retryDelay?: number;
  /** ak-gemini alias for `maxRetries` */
  resourceExhaustedRetries?: number;
  /** ak-gemini alias for `retryDelay` */
  resourceExhaustedDelay?: number;

  /** Run a (free) `GET /v1/models` connectivity check during init() (default: false) */
  healthCheck?: boolean;

  // ── Web search ──
  /** Anthropic server-side web search. Works on `claude-*` models only. */
  enableWebSearch?: boolean;
  webSearchConfig?: {
    max_uses?: number;
    allowed_domains?: string[];
    blocked_domains?: string[];
    /** ak-gemini spelling, mapped to `blocked_domains` */
    excludeDomains?: string[];
    [key: string]: any;
  };
  /** ak-gemini alias for `enableWebSearch` */
  enableGrounding?: boolean;
  /** ak-gemini alias for `webSearchConfig` */
  groundingConfig?: Record<string, any>;

  // ── Request metadata ──
  /** ak-gemini billing labels. Sent as `metadata.tags: ['key:value', …]`. */
  labels?: Record<string, string>;

  // ── Accepted and ignored (warned once) ──
  /** No effect: prompt caching does not engage through this gateway. */
  cacheSystemPrompt?: boolean;
  /** No effect: prompt caching does not engage through this gateway. */
  cacheTtl?: CacheTtl;
  /** No effect: the gateway holds the upstream credentials. */
  vertexai?: boolean;
  /** No effect. @see vertexai */
  vertexProjectId?: string;
  /** No effect. @see vertexai */
  vertexRegion?: string;
  /** No effect. @see vertexai */
  project?: string;
  /** No effect. @see vertexai */
  location?: string;
  /** No effect. @see vertexai */
  googleAuthOptions?: Record<string, any>;
  /** No effect: the gateway exposes no safety-setting controls. */
  safetySettings?: Array<{ category: string; threshold: string }>;
  /** No effect. */
  serviceTier?: string;
  /** No effect: there is no cache CRUD behind this gateway. */
  cachedContent?: string;

  [key: string]: any;
}

/** Alias so ak-claude source compiles unchanged. */
export type BaseClaudeOptions = BaseLiteLLMOptions;
/** Alias so ak-gemini source compiles unchanged. */
export type BaseGeminiOptions = BaseLiteLLMOptions;

export interface ToolChoiceAuto { type: 'auto'; disable_parallel_tool_use?: boolean }
export interface ToolChoiceAny { type: 'any'; disable_parallel_tool_use?: boolean }
export interface ToolChoiceTool { type: 'tool'; name: string; disable_parallel_tool_use?: boolean }
export interface ToolChoiceNone { type: 'none' }

/** Anthropic object shapes, OpenAI strings, and OpenAI's function selector all work. */
export type ToolChoice =
  | ToolChoiceAuto | ToolChoiceAny | ToolChoiceTool | ToolChoiceNone
  | 'auto' | 'none' | 'required'
  | { type: 'function'; function: { name: string } };

/** ak-gemini's tool-choice equivalent. Translated to `tool_choice`. */
export interface GeminiToolConfig {
  functionCallingConfig?: {
    mode?: 'AUTO' | 'ANY' | 'NONE' | string;
    allowedFunctionNames?: string[];
  };
}

export interface TransformerOptions extends BaseLiteLLMOptions {
  examplesFile?: string;
  exampleData?: TransformationExample[];
  /** Key for source/input data in examples (default: 'PROMPT') */
  sourceKey?: string;
  /** Alias for sourceKey */
  promptKey?: string;
  /** Key for target/output data in examples (default: 'ANSWER') */
  targetKey?: string;
  /** Alias for targetKey */
  answerKey?: string;
  contextKey?: string;
  explanationKey?: string;
  systemPromptKey?: string;
  /** Validation retry attempts (default: 3). Overloaded with the base 429-retry count, as in ak-claude. */
  maxRetries?: number;
  retryDelay?: number;
  onlyJSON?: boolean;
  asyncValidator?: AsyncValidatorFunction;
  /** JSON Schema sent as `response_format.json_schema` on every transform. */
  responseSchema?: Record<string, any>;
}

export interface ChatOptions extends BaseLiteLLMOptions {
  // Chat uses base options only
}

export interface MessageOptions extends BaseLiteLLMOptions {
  /** Lightweight JSON mode via `response_format: { type: 'json_object' }`. */
  responseFormat?: 'json';
  /** JSON Schema sent as `response_format.json_schema`. */
  responseSchema?: Record<string, any>;
  /** ak-gemini's JSON switch: 'application/json' turns on `responseFormat: 'json'`. */
  responseMimeType?: string;
  /** Extra re-sends when a schema response fails validation. 0 disables. Default 2. */
  validationRetries?: number;
  /** 'strict' (default) returns data:null + validationErrors; 'warn' returns the parsed data too. */
  validationMode?: 'strict' | 'warn';
  /** Accepted and ignored — there is no Vertex path here. */
  vertexNativeStructuredOutput?: boolean;
}

/** Tool declaration. Any of the four schema spellings is accepted. */
export interface ToolDeclaration {
  name?: string;
  description?: string;
  /** Claude spelling */
  input_schema?: Record<string, any>;
  /** Claude camelCase alias */
  inputSchema?: Record<string, any>;
  /** Gemini spelling */
  parametersJsonSchema?: Record<string, any>;
  /** OpenAI spelling (bare) */
  parameters?: Record<string, any>;
  /** OpenAI spelling (wrapped) — passed through unchanged */
  type?: string;
  function?: { name: string; description?: string; parameters?: Record<string, any> };
  [key: string]: any;
}

export interface ToolAgentOptions extends BaseLiteLLMOptions {
  tools?: ToolDeclaration[];
  toolExecutor?: (toolName: string, args: Record<string, any>) => Promise<any>;
  maxToolRounds?: number;
  onToolCall?: (toolName: string, args: Record<string, any>) => void;
  /** Return false to deny the call. */
  onBeforeExecution?: (toolName: string, args: Record<string, any>) => Promise<boolean> | boolean;
  toolChoice?: ToolChoice;
  /** ak-gemini's tool-choice shape. Translated to `toolChoice`. */
  toolConfig?: GeminiToolConfig;
  /** Sends `parallel_tool_calls: false` (default: false) */
  disableParallelToolUse?: boolean;
  /** Local execution concurrency: false = sequential, true = unlimited, number = limit (default: true) */
  parallelToolCalls?: boolean | number;
}

export interface LocalDataEntry {
  /** Label shown to the model (e.g. "users", "config") */
  name: string;
  /** Any JSON-serializable value */
  data: any;
}

export interface RagAgentOptions extends BaseLiteLLMOptions {
  /** Paths to local text files read from disk (md, json, csv, yaml, txt) */
  localFiles?: string[];
  /** In-memory data objects to include as context */
  localData?: LocalDataEntry[];
  /** Paths to images/PDFs, inlined as base64 */
  mediaFiles?: string[];
  /**
   * ak-gemini's Files API input. There is no Files API here — the paths are read
   * from disk and inlined exactly like `mediaFiles`. Audio and video are skipped.
   */
  remoteFiles?: string[];
  /** Accepted and ignored — the gateway has no citation feature. `chat()` still returns an empty `citations` array. */
  enableCitations?: boolean;
}

export interface CodeAgentOptions extends BaseLiteLLMOptions {
  workingDirectory?: string;
  language?: 'javascript' | 'python';
  pythonPath?: string;
  maxRounds?: number;
  /** Per-EXECUTION timeout in ms (default: 30000). For the HTTP timeout use `requestTimeout`. */
  timeout?: number;
  /** HTTP timeout in ms for gateway calls (default: 600000). */
  requestTimeout?: number;
  /** Return false to deny. Receives (content, toolName). */
  onBeforeExecution?: (content: string, toolName: string) => Promise<boolean> | boolean;
  onCodeExecution?: (code: string, output: { stdout: string; stderr: string; exitCode: number }) => void;
  importantFiles?: string[];
  writeDir?: string;
  keepArtifacts?: boolean;
  comments?: boolean;
  /** Max consecutive failed executions before stopping (default: 3) */
  maxRetries?: number;
  skills?: string[];
  envOverview?: string;
  tools?: ToolDeclaration[];
  toolExecutor?: (toolName: string, args: Record<string, any>) => Promise<any>;
}

export interface CodeExecution {
  code: string;
  purpose?: string;
  output: string;
  stderr: string;
  exitCode: number;
}

export interface ToolCallResult {
  tool: 'write_code' | 'execute_code' | 'write_and_run_code' | 'fix_code' | 'run_bash' | 'use_skill' | string;
  code?: string;
  purpose?: string;
  language?: string;
  originalCode?: string;
  fixedCode?: string;
  explanation?: string;
  executed?: boolean;
  command?: string;
  skillName?: string;
  content?: string;
  found?: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  denied?: boolean;
  args?: Record<string, any>;
  result?: any;
  error?: string;
}

export interface CodeAgentResponse {
  text: string;
  /** Backward-compatible: code executions only */
  codeExecutions: CodeExecution[];
  /** Every tool call made during this turn */
  toolCalls: ToolCallResult[];
  usage: UsageData | null;
}

export interface CodeAgentStreamEvent {
  type: 'text' | 'code' | 'output' | 'write' | 'fix' | 'bash' | 'skill' | 'tool' | 'done';
  text?: string;
  code?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  fullText?: string;
  codeExecutions?: CodeExecution[];
  toolCalls?: ToolCallResult[];
  usage?: UsageData | null;
  warning?: string;
  purpose?: string;
  language?: string;
  originalCode?: string;
  fixedCode?: string;
  explanation?: string;
  command?: string;
  skillName?: string;
  content?: string;
  found?: boolean;
  toolName?: string;
  args?: Record<string, any>;
  result?: any;
  error?: string;
}

// ── Per-Message Options ──────────────────────────────────────────────────────

export interface SendOptions {
  /** Send without affecting chat history (Transformer only) */
  stateless?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  maxTokens?: number;
  [key: string]: any;
}

// ── Response Types ───────────────────────────────────────────────────────────

export interface ChatResponse {
  /**
   * Raw model output, present only when `prefill` was used. On a `continue`
   * model `text` is `prefill + continuation`; on a `restart` model the model
   * re-emits the prefix itself, so `text` and `continuation` are equal.
   */
  continuation?: string;
  text: string;
  usage: UsageData | null;
}

export interface ChatStreamEvent {
  type: 'text' | 'done';
  text?: string;
  fullText?: string;
  usage?: UsageData | null;
}

export interface MessageResponse {
  /**
   * Raw model output, present only when `prefill` was used. On a `continue`
   * model `text` is `prefill + continuation`; on a `restart` model the model
   * re-emits the prefix itself, so `text` and `continuation` are equal.
   */
  continuation?: string;
  text: string;
  data?: any;
  usage: UsageData | null;
  /** Present when a structured response never satisfied the schema. */
  validationErrors?: string[];
}

export interface RagCitation {
  type: string;
  cited_text?: string;
  start?: number;
  end?: number;
  document_index?: number;
  document_title?: string;
  [key: string]: any;
}

export interface RagResponse {
  text: string;
  /** Always empty — present only when `enableCitations` was requested. */
  citations?: RagCitation[];
  usage: UsageData | null;
}

export interface RagStreamEvent {
  type: 'text' | 'done';
  text?: string;
  fullText?: string;
  usage?: UsageData | null;
}

export interface AgentResponse {
  text: string;
  toolCalls: Array<{ name: string; args: Record<string, any>; result: any }>;
  usage: UsageData | null;
}

export interface AgentStreamEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'done';
  text?: string;
  toolName?: string;
  args?: Record<string, any>;
  result?: any;
  fullText?: string;
  usage?: UsageData | null;
  warning?: string;
}

// ── Seed Options ─────────────────────────────────────────────────────────────

export interface SeedOptions {
  promptKey?: string;
  answerKey?: string;
  contextKey?: string;
  explanationKey?: string;
  systemPromptKey?: string;
  /** 'json' wraps answers in a {data} envelope (Transformer); 'text' stores ANSWER verbatim (Chat). Default 'json'. */
  format?: 'json' | 'text';
}

// ── Model info ───────────────────────────────────────────────────────────────

export interface ModelInfo {
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  mode: string | null;
  /** The upstream deployment string the gateway routes to. */
  upstreamModel: string | null;
  directAccess: boolean;
  teamIds: string[];
  /** 'general' | 'integration' | … — the real team-scope discriminator. */
  lifecycle: string | null;
  traits: string[];
  guidance: string | null;
  spotlight: boolean;
  supportsReasoning: boolean;
  supportsVision: boolean;
  supportsFunctionCalling: boolean;
  /**
   * `model_info.supported_openai_params` from the gateway. `null` means the
   * gateway did not publish a list, never "supports nothing".
   */
  supportedParams: string[] | null;
  [key: string]: any;
}

/** What the sampling gate decided for a model. */
export interface SamplingSupport {
  temperature: boolean;
  topP: boolean;
  topK: boolean;
  /** True when the provider rejects `temperature` and `top_p` in the same request. */
  exclusiveTempTopP: boolean;
}

// ── Class Declarations ───────────────────────────────────────────────────────

export declare class BaseLiteLLM {
  constructor(options?: BaseLiteLLMOptions);

  modelName: string;
  systemPrompt: string | null | false;
  apiKey: string;
  baseURL: string;
  client: any;
  /**
   * Raw SDK clients. `anthropic` and `vertex` are always null: this is one
   * OpenAI-protocol client pointed at a gateway.
   */
  clients: {
    openai: any;
    anthropic: null;
    vertex: null;
    raw: any;
  };
  history: any[];
  lastResponseMetadata: ResponseMetadata | null;
  exampleCount: number;
  maxTokens: number | null;
  temperature: number | undefined;
  topP: number | undefined;
  topK: number | undefined;
  effort: EffortLevel | null;
  enableWebSearch: boolean;
  webSearchConfig: Record<string, any>;
  labels: Record<string, string> | null;
  metadata: { tags: string[] } | null;
  maxRetries: number;
  retryDelay: number;

  init(force?: boolean): Promise<void>;
  seed(examples?: TransformationExample[], opts?: SeedOptions): Promise<any[]>;
  getHistory(curated?: boolean): any[];
  clearHistory(): Promise<void>;
  getLastUsage(): UsageData | null;
  /** Heuristic (chars / 4) — the gateway exposes no token counter. */
  /**
   * Approximate input size for the next call, plus how it sits against the
   * model's context window. No API call — the gateway has no token-count route,
   * so this is a 4-chars-per-token heuristic.
   */
  estimate(nextPayload: Record<string, unknown> | string): Promise<{
    inputTokens: number;
    approximate: true;
    /** Model context window in tokens, or null when the model is not in the snapshot. */
    contextWindow: number | null;
    /** False when the estimate exceeds the window. */
    fits: boolean;
    /** Tokens left before the window is full; Infinity when unknown. */
    headroom: number;
  }>;
  estimateCost(nextPayload: Record<string, unknown> | string): Promise<{
    inputTokens: number;
    model: string;
    pricing: ResolvedPricing | null;
    estimatedInputCost: number | null;
    note: string;
  }>;
  listModels(): AsyncGenerator<any, void, unknown>;
  getModel(modelId: string): Promise<any>;
}

/** Alias so ak-claude source compiles unchanged. */
export { BaseLiteLLM as BaseClaude };
/** Alias so ak-gemini source compiles unchanged. */
export { BaseLiteLLM as BaseGemini };

export declare class Transformer extends BaseLiteLLM {
  constructor(options?: TransformerOptions);

  promptKey: string;
  answerKey: string;
  contextKey: string;
  explanationKey: string;
  systemPromptKey: string;
  onlyJSON: boolean;
  responseSchema: Record<string, any> | null;
  asyncValidator: AsyncValidatorFunction | null;
  validationRetries: number;
  retryDelay: number;

  seed(examples?: TransformationExample[]): Promise<any[]>;
  send(payload: Record<string, unknown> | string, opts?: SendOptions, validatorFn?: AsyncValidatorFunction | null): Promise<Record<string, unknown>>;
  rawSend(payload: Record<string, unknown> | string): Promise<Record<string, unknown>>;
  rebuild(lastPayload: Record<string, unknown>, serverError: string): Promise<Record<string, unknown>>;
  reset(): Promise<void>;
  updateSystemPrompt(newPrompt: string): Promise<void>;
}

export declare class Chat extends BaseLiteLLM {
  constructor(options?: ChatOptions);

  send(message: string, opts?: Record<string, any>): Promise<ChatResponse>;
  stream(message: string, opts?: Record<string, any>): AsyncGenerator<ChatStreamEvent, void, unknown>;
}

export declare class Message extends BaseLiteLLM {
  constructor(options?: MessageOptions);

  validationRetries: number;
  validationMode: 'strict' | 'warn';

  init(force?: boolean): Promise<void>;
  send(payload: Record<string, unknown> | string, opts?: Record<string, any>): Promise<MessageResponse>;
}

export declare class ToolAgent extends BaseLiteLLM {
  constructor(options?: ToolAgentOptions);

  tools: ToolDeclaration[];
  toolExecutor: ((toolName: string, args: Record<string, any>) => Promise<any>) | null;
  maxToolRounds: number;
  onToolCall: ((toolName: string, args: Record<string, any>) => void) | null;
  onBeforeExecution: ((toolName: string, args: Record<string, any>) => Promise<boolean> | boolean) | null;
  toolChoice: ToolChoice | undefined;
  disableParallelToolUse: boolean;
  parallelToolCalls: boolean | number;

  chat(message: string, opts?: Record<string, any>): Promise<AgentResponse>;
  stream(message: string, opts?: Record<string, any>): AsyncGenerator<AgentStreamEvent, void, unknown>;
  stop(): void;
}

export declare class RagAgent extends BaseLiteLLM {
  constructor(options?: RagAgentOptions);

  localFiles: string[];
  localData: LocalDataEntry[];
  mediaFiles: string[];
  /** Always false — the gateway has no citation feature. */
  enableCitations: boolean;

  init(force?: boolean): Promise<void>;
  chat(message: string, opts?: Record<string, any>): Promise<RagResponse>;
  stream(message: string, opts?: Record<string, any>): AsyncGenerator<RagStreamEvent, void, unknown>;
  addLocalFiles(paths: string[]): Promise<void>;
  addLocalData(entries: LocalDataEntry[]): Promise<void>;
  addMediaFiles(paths: string[]): Promise<void>;
  addRemoteFiles(paths: string[]): Promise<void>;
  getContext(): {
    localFiles: Array<{ name: string; path: string; size: number }>;
    localData: Array<{ name: string; type: string }>;
    mediaFiles: Array<{ path: string; name: string; ext: string }>;
  };
}

export declare class CodeAgent extends BaseLiteLLM {
  constructor(options?: CodeAgentOptions);

  workingDirectory: string;
  language: 'javascript' | 'python';
  pythonPath: string | null;
  maxRounds: number;
  timeout: number;
  onBeforeExecution: ((content: string, toolName: string) => Promise<boolean> | boolean) | null;
  onCodeExecution: ((code: string, output: { stdout: string; stderr: string; exitCode: number }) => void) | null;
  importantFiles: string[];
  writeDir: string;
  keepArtifacts: boolean;
  comments: boolean;
  codeMaxRetries: number;
  skills: string[];
  envOverview: string;
  customTools: Array<{ name: string; description: string; input_schema: any }>;
  toolExecutor: ((toolName: string, args: Record<string, any>) => Promise<any>) | null;

  init(force?: boolean): Promise<void>;
  chat(message: string, opts?: Record<string, any>): Promise<CodeAgentResponse>;
  stream(message: string, opts?: Record<string, any>): AsyncGenerator<CodeAgentStreamEvent, void, unknown>;
  dump(): Array<{ fileName: string; purpose: string | null; script: string; filePath: string | null; tool: string }>;
  stop(): void;
}

// ── Classes this gateway cannot back ─────────────────────────────────────────
// These construct-throw with an explanation and a pointer to the package that
// does support them. The import itself always succeeds.

export declare class Embedding {
  constructor(options?: Record<string, any>);
}
export declare class ImageGenerator {
  constructor(options?: Record<string, any>);
}
export declare class AgentQuery {
  constructor(options?: Record<string, any>);
}

// ── Module Exports ───────────────────────────────────────────────────────────

export declare function extractJSON(text: string): any;
export declare function attemptJSONRecovery(text: string, maxAttempts?: number): any | null;
export declare function isJSON(data: any): boolean;
export declare function isJSONStr(string: string): boolean;
/** Validates a parsed value against a subset of JSON Schema. Returns error strings ([] means valid). */
export declare function validateSchema(data: any, schema: Record<string, any>, path?: string): string[];

/** Per-million-token pricing keyed by model id. GENERATED from `GET /model/info`. */
export declare const MODEL_PRICING: Record<string, ModelPricing>;
/** Date the pricing table was generated (YYYY-MM-DD). */
export declare const MODEL_PRICING_AS_OF: string;
/** Capability snapshot keyed by model id. GENERATED from `GET /model/info`. */
export declare const MODEL_INFO: Record<string, ModelInfo>;
/** Sibling-package model ids mapped onto ids this gateway actually serves. */
export declare const MODEL_ALIASES: Record<string, string>;
/** Accepted `effort` levels, ordered minimal → max. */
export declare const EFFORT_LEVELS: readonly EffortLevel[];
/** Default model id. */
export declare const DEFAULT_MODEL: string;

/** Resolves pricing for a model id. `null` means UNKNOWN — not free. */
export declare function resolvePricing(
  modelId: string | null | undefined,
  opts?: { at?: Date | string | number }
): ResolvedPricing | null;

/**
 * Estimated USD cost from token counts. `null` means UNKNOWN — not free.
 * Accepts the ak-litellm shape `computeCost(usage, modelId, opts)` and the
 * ak-claude/ak-gemini positional shape.
 */
export declare function computeCost(
  usageOrModelId: UsageLike | string | null | undefined,
  modelIdOrPromptTokens?: string | number | null,
  optsOrResponseTokens?: { at?: Date | string | number; cacheTtl?: CacheTtl } | number,
  extraA?: number,
  extraB?: number,
  legacyOpts?: { at?: Date | string | number; cacheTtl?: CacheTtl }
): number | null;

/** Maps a legacy `thinking.budget_tokens` value to an effort level. null = no thinking. */
export declare function budgetTokensToEffort(budgetTokens: number): EffortLevel | null;

/** The model ids in the generated table. */
export declare function listModels(opts?: { includeIntegration?: boolean }): string[];
/** Capability record for a model id, following aliases. */
export declare function getModelInfo(modelId: string): ModelInfo | null;
/** Re-reads `GET /model/info` from the live gateway. */
export declare function refreshModelInfo(opts?: { apiKey?: string; baseURL?: string }): Promise<any>;

/** Canonicalizes and validates constructor options. Exported for tests. */
export declare function normalizeOptions(raw?: Record<string, any>, klass?: string): Record<string, any>;
/**
 * What sampling parameters a model accepts. Probe-derived.
 * Pass `{ reasoning: true }` when the request carries `reasoning_effort` —
 * Anthropic rejects all three while extended thinking is on.
 */
export declare function samplingSupport(modelId: string, opts?: { reasoning?: boolean }): SamplingSupport;
/** Which upstream provider serves a model id. */
export declare function modelProvider(modelId: string): 'anthropic' | 'google' | 'openai' | 'qwen' | 'other';

export declare const ThinkingLevel: Readonly<Record<string, string>>;
export declare const HarmCategory: Readonly<Record<string, string>>;
export declare const HarmBlockThreshold: Readonly<Record<string, string>>;

declare const _default: {
  Transformer: typeof Transformer;
  Chat: typeof Chat;
  Message: typeof Message;
  ToolAgent: typeof ToolAgent;
  CodeAgent: typeof CodeAgent;
  RagAgent: typeof RagAgent;
};

export default _default;


// ── Capability layer ─────────────────────────────────────────────────────────

/** Everything this package knows about what a model accepts. */
export interface ModelCapabilities {
  /** Resolved model id, aliases followed. */
  id: string;
  /** False when the id is not in the committed gateway snapshot. */
  known: boolean;
  /** Context window in tokens. */
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  vision: boolean;
  pdf: boolean;
  audio: boolean;
  tools: boolean;
  toolChoice: boolean;
  parallelTools: boolean;
  reasoning: boolean;
  thinkingAlwaysOn: boolean;
  responseSchema: boolean;
  /** MEASURED, not the gateway's `supports_prompt_caching` flag, which is wrong. */
  promptCaching: boolean;
  /** Which web-search tool shape this model takes, or null. */
  webSearch: WebSearchStyle;
  computerUse: boolean;
  urlContext: boolean;
  /** What the gateway actually calls upstream, e.g. `vertex_ai/claude-sonnet-5`. */
  upstreamModel: string | null;
}

/**
 * Looks up what a model can do. An unknown id returns a permissive record with
 * `known: false`, so a newly added model is never blocked locally.
 */
export declare function getCapabilities(modelId?: string): ModelCapabilities;

/** Context window in tokens, or null when the model is not in the snapshot. */
export declare function contextWindow(modelId?: string): number | null;

export declare function supportsVision(modelId?: string): boolean;
export declare function supportsPdf(modelId?: string): boolean;
export declare function supportsTools(modelId?: string): boolean;
export declare function supportsReasoning(modelId?: string): boolean;

/** Whether `cache_control` actually engages. Measured, not reported. */
export declare function supportsPromptCaching(modelId?: string): boolean;

/** Whether a prefill is worth sending — true for `continue` and `restart`. */
export declare function supportsPrefill(modelId?: string): boolean;

/** How this model reacts to a trailing assistant message. */
export declare function prefillMode(modelId?: string): PrefillMode;

/** Which web-search tool shape this model takes, or null. */
export declare function webSearchStyle(modelId?: string): WebSearchStyle;

/** Models measured to actually cache. */
export declare const CACHE_CAPABLE_MODELS: readonly string[];
/** Smallest block Anthropic will cache; below this `cache_control` is a no-op. */
export declare const CACHE_MIN_TOKENS: number;
/** Cache-write multiplier over the input rate, by TTL: 1.25x at 5m, 2x at 1h. */
export declare const CACHE_WRITE_MULTIPLIER: Readonly<Record<string, number>>;
/** Cache-read discount against the input rate. */
export declare const CACHE_READ_MULTIPLIER: number;
/** Measured prefill behaviour per model. */
export declare const PREFILL_MODES: Readonly<Record<string, PrefillMode>>;
/** Minimum `max_tokens` for a grounded call; a low cap returns empty content. */
export declare const WEB_SEARCH_MIN_MAX_TOKENS: number;

// ── /v1/responses transport ──────────────────────────────────────────────────

/** Chat-completions request body to a `/v1/responses` body. */
export declare function toResponsesRequest(params: any): any;
/** `/v1/responses` reply to a chat-completions-shaped reply. */
export declare function fromResponsesReply(resp: any): any;
/** Whether a request has to go over `/v1/responses`. Only OpenAI web search does. */
export declare function needsResponsesTransport(
  transport: 'chat' | 'responses' | 'auto',
  searchStyle: WebSearchStyle,
  webSearchEnabled: boolean
): boolean;

// ── Unavailable on this gateway ──────────────────────────────────────────────

/**
 * Bulk transformation over the Batch API. Constructor THROWS.
 *
 * `/v1/batches` works, but `POST /v1/files` returns `files_settings is not
 * set`, so there is no way to submit a job. Fixable with one line of gateway
 * config; check with `npm run probe-capabilities`.
 */
export declare class BatchTransformer {
  constructor(options?: Record<string, any>);
}
