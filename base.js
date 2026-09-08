/**
 * @fileoverview BaseLiteLLM — shared foundation for every ak-litellm class.
 *
 * A port of `ak-claude/base.js` with three substitutions:
 *
 *   1. Transport is `POST /v1/chat/completions` through the `openai` SDK, so
 *      history, tools and content are the OpenAI chat shapes, not Anthropic
 *      content blocks.
 *   2. Cost comes from the gateway's own `x-litellm-response-cost` header when
 *      it is present, and from the `/model/info` pricing table when it is not
 *      (streaming). `usage.costSource` says which.
 *   3. Every provider-specific parameter is gated by model family before the
 *      request is built. `drop_params` is not enabled on this deployment.
 *
 * The usage accounting from the ak-claude 0.3.0 defect sweep is preserved
 * verbatim in spirit: `_resetUsage()` once per public call, `_accumulateUsage()`
 * after EVERY round-trip, and `attempts` meaning API round-trips.
 */

import 'dotenv/config';

import {
	buildWebSearchTool,
	effortToReasoningEffort,
	labelsToMetadata,
	normalizeOptions,
	normalizeToolChoice,
	normalizeToolDeclarations,
	samplingSupport
} from './compat.js';
import {
	createClient,
	healthCheck as gatewayHealthCheck,
	mapGatewayError,
	parseGatewayHeaders,
	resolveApiKey,
	resolveBaseURL
} from './client.js';
import {
	CHARS_PER_TOKEN,
	DEFAULT_MODEL,
	EFFORT_LEVELS,
	MODEL_ALIASES,
	MODEL_PRICING,
	MODEL_PRICING_AS_OF,
	budgetTokensToEffort,
	computeCost,
	getModelInfo,
	resolvePricing
} from './models.js';
import { isJSON } from './json-helpers.js';
import log from './logger.js';

const NODE_ENV = process.env.NODE_ENV || 'unknown';
const LOG_LEVEL = process.env.LOG_LEVEL;

/** Matches ak-claude. ak-gemini's 50000 arrives via the `maxOutputTokens` alias. */
const DEFAULT_MAX_TOKENS = 8192;

export {
	MODEL_PRICING,
	MODEL_PRICING_AS_OF,
	MODEL_ALIASES,
	DEFAULT_MAX_TOKENS,
	EFFORT_LEVELS,
	resolvePricing,
	computeCost,
	budgetTokensToEffort
};

/**
 * @typedef {import('./types').BaseLiteLLMOptions} BaseLiteLLMOptions
 * @typedef {import('./types').UsageData} UsageData
 * @typedef {import('./types').TransformationExample} TransformationExample
 */

/**
 * Base class for all ak-litellm wrappers.
 *
 * Not typically instantiated directly — use Transformer, Chat, Message,
 * ToolAgent, CodeAgent or RagAgent.
 */
class BaseLiteLLM {
	/**
	 * @param {BaseLiteLLMOptions} [options={}]
	 */
	constructor(options = {}) {
		// Subclasses may normalize first to read a canonical option before super();
		// normalizeOptions() is idempotent, so running it twice is harmless.
		const o = normalizeOptions(options, new.target?.name || this.constructor.name);

		// ── Model ──
		this.modelName = o.modelName || DEFAULT_MODEL;

		// ── System Prompt ──
		this.systemPrompt = o.systemPrompt !== undefined ? o.systemPrompt : null;

		// ── Auth / transport ──
		// resolveApiKey() throws here rather than at first send, matching
		// ak-claude's fail-at-construction behavior.
		this.apiKey = resolveApiKey(o.apiKey);
		this.baseURL = resolveBaseURL(o.baseURL);
		this.timeout = o.timeout;

		// ── Generation config ──
		// `undefined` means "use the default"; `null` means "never send this".
		// Model-family gating in _applySamplingParams() drops whatever the target
		// model rejects regardless of what is set here.
		this.maxTokens = o.maxTokens === null ? null : (o.maxTokens ?? DEFAULT_MAX_TOKENS);
		this.temperature = o.temperature === null ? undefined : (o.temperature ?? 0.7);
		this.topP = o.topP === null ? undefined : (o.topP ?? 0.95);
		this.topK = o.topK === null ? undefined : (o.topK ?? undefined);

		// ── Reasoning depth ──
		// Already validated against EFFORT_LEVELS by normalizeOptions().
		this.effort = o.effort ?? null;

		// ── Web search (Anthropic server tool; claude-* only) ──
		this.enableWebSearch = o.enableWebSearch ?? false;
		this.webSearchConfig = o.webSearchConfig ?? {};

		// ── Request metadata (ak-gemini `labels`) ──
		this.labels = o.labels ?? null;
		this.metadata = labelsToMetadata(this.labels);

		// ── Health check ──
		this.healthCheck = o.healthCheck ?? false;

		// ── Retry ──
		// SDK-level retry for 429/5xx, as in ak-claude. Subclasses (Transformer)
		// additionally read `maxRetries` as a validation-retry count — ak-claude
		// overloads the same name, so the port keeps the overload.
		this.maxRetries = o.maxRetries ?? 5;
		this.retryDelay = o.retryDelay ?? 1000;

		// ── Logging ──
		this._configureLogLevel(o.logLevel);
		this._silentCompat = o.logLevel === 'none';

		// ── Client ──
		// No ADC, no async import — the client is ready synchronously.
		this.client = createClient({
			apiKey: this.apiKey,
			baseURL: this.baseURL,
			maxRetries: this.maxRetries,
			timeout: this.timeout
		});
		this._clientReady = true;

		// ── Clients namespace ──
		// `anthropic`/`vertex` are always null: this is one OpenAI-protocol client
		// pointed at a gateway, and pretending otherwise would be a lie. Consumers
		// that only test for truthiness keep working; `raw` is never null.
		this.clients = {
			openai: this.client,
			anthropic: null,
			vertex: null,
			raw: this.client
		};

		// ── State ──
		/** @type {any[]} */
		this.history = [];
		this.lastResponseMetadata = null;
		this.exampleCount = 0;
		this._initialized = false;
		this._resetUsage();

		log.debug(`${this.constructor.name} created with model: ${this.modelName}`);
	}

	// ── Client bootstrap ─────────────────────────────────────────────────────

	/**
	 * Present for parity with ak-claude, where Vertex needs an async import.
	 * Here the client is built in the constructor, so this is a no-op.
	 * @returns {Promise<void>}
	 * @protected
	 */
	async _ensureClient() { /* client is ready in the constructor */ }

	// ── Initialization ───────────────────────────────────────────────────────

	/**
	 * Initializes the instance. Idempotent unless force=true.
	 * @param {boolean} [force=false]
	 * @returns {Promise<void>}
	 */
	async init(force = false) {
		if (this._initialized && !force) return;

		await this._ensureClient();
		log.debug(`Initializing ${this.constructor.name} with model: ${this.modelName}...`);

		await this._healthCheckPing();

		this._initialized = true;
		log.debug(`${this.constructor.name}: Initialized.`);
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
			await gatewayHealthCheck(this.client, this.modelName);
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
		if (!this.systemPrompt) return undefined;
		return { role: 'system', content: this.systemPrompt };
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
		const normalized = tools?.length
			? normalizeToolDeclarations(tools, this.constructor.name)
			: undefined;

		if (!this.enableWebSearch) return normalized;

		const webSearchTool = buildWebSearchTool(
			this.webSearchConfig, modelName, this.constructor.name, this._silentCompat
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
		// Runs AFTER _applyReasoningParams(), so `reasoning_effort` on `params` is
		// the real answer to "is thinking on for this request".
		const cap = samplingSupport(modelName, { reasoning: !!params?.reasoning_effort });
		/** @type {string[]} */
		const dropped = [];

		if (this.temperature !== undefined) {
			if (cap.temperature) params.temperature = this.temperature;
			else dropped.push('temperature');
		}

		if (this.topP !== undefined) {
			if (!cap.topP) dropped.push('top_p');
			else if (cap.exclusiveTempTopP && params.temperature !== undefined) {
				// Vertex-served Anthropic models reject temperature and top_p together.
				dropped.push('top_p (not allowed alongside temperature)');
			} else params.top_p = this.topP;
		}

		if (this.topK !== undefined) {
			if (cap.topK) params.top_k = this.topK;
			else dropped.push('top_k');
		}

		if (dropped.length) {
			log.debug(
				`ak-litellm: model "${modelName}" does not accept ${dropped.join(', ')} — ` +
				`dropping. Use \`effort\` to control reasoning depth instead.`
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
		const systemMessage = opts.systemPrompt !== undefined
			? (opts.systemPrompt ? { role: 'system', content: opts.systemPrompt } : undefined)
			: this._buildSystemMessage();
		const body = opts.messages ?? this.history;

		/** @type {any} */
		const params = {
			model,
			messages: systemMessage ? [systemMessage, ...body] : [...body]
		};

		const maxTokens = opts.maxTokens ?? this.maxTokens;
		if (maxTokens !== null && maxTokens !== undefined) params.max_tokens = maxTokens;

		const tools = this._buildTools(opts.tools, model);
		if (tools?.length) params.tools = tools;

		const toolChoice = normalizeToolChoice(opts.tool_choice);
		if (toolChoice !== undefined) params.tool_choice = toolChoice;

		if (opts.parallel_tool_calls === false) params.parallel_tool_calls = false;
		if (opts.response_format) params.response_format = opts.response_format;

		// ak-gemini accepts per-message `labels` on send()/stream() as well as on
		// the constructor. Per-call keys win over constructor keys.
		const metadata = opts.labels
			? labelsToMetadata({ ...(this.labels || {}), ...opts.labels })
			: this.metadata;
		if (metadata) params.metadata = metadata;

		if (opts.stream) {
			params.stream = true;
			// Without this the final chunk carries no usage and every stream would
			// report zeroes — the exact bug the 2026-08-24 defect sweep fixed.
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
		if (typeof userContent === 'string') {
			this.history.push({ role: 'user', content: userContent });
			return;
		}
		if (Array.isArray(userContent) && userContent.length && userContent.every(m => m && m.role)) {
			for (const m of userContent) this.history.push(m);
			return;
		}
		this.history.push({ role: 'user', content: userContent });
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
		/** @type {any} */
		const entry = { role: 'assistant', content: message?.content ?? null };
		if (message?.tool_calls?.length) {
			entry.tool_calls = message.tool_calls.map(tc => ({
				id: tc.id,
				type: tc.type || 'function',
				function: { name: tc.function?.name, arguments: tc.function?.arguments ?? '' }
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
			const { data, response: httpResponse } =
				await this.client.chat.completions.create(params).withResponse();
			const headers = parseGatewayHeaders(httpResponse);
			// Non-enumerable so JSON.stringify(response) stays clean.
			Object.defineProperty(data, '_gatewayHeaders', {
				value: headers, enumerable: false, configurable: true, writable: true
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
		let content = '';
		let finishReason = null;
		let usage = null;
		let responseModel = null;
		/** @type {any[]} */
		const toolCalls = [];

		for (const chunk of chunks) {
			if (chunk?.model) responseModel = chunk.model;
			if (chunk?.usage) usage = chunk.usage;
			const choice = chunk?.choices?.[0];
			if (!choice) continue;
			if (choice.finish_reason) finishReason = choice.finish_reason;

			const delta = choice.delta;
			if (!delta) continue;
			if (typeof delta.content === 'string') content += delta.content;

			for (const tc of delta.tool_calls || []) {
				const i = tc.index ?? toolCalls.length;
				if (!toolCalls[i]) toolCalls[i] = { id: '', type: 'function', function: { name: '', arguments: '' } };
				// Ids arrive whole, not chunked, but concatenating is safe either way
				// and preserves Gemini's embedded thought_signature verbatim.
				if (tc.id) toolCalls[i].id = tc.id;
				if (tc.type) toolCalls[i].type = tc.type;
				if (tc.function?.name) toolCalls[i].function.name += tc.function.name;
				if (tc.function?.arguments) toolCalls[i].function.arguments += tc.function.arguments;
			}
		}

		/** @type {any} */
		const message = { role: 'assistant', content: content || null };
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
		if (typeof content === 'string') return content;
		if (Array.isArray(content)) {
			return content.filter(p => p?.type === 'text' || typeof p?.text === 'string')
				.map(p => p.text || '').join('');
		}
		return '';
	}

	// ── History management ───────────────────────────────────────────────────

	/**
	 * @param {boolean} [curated=false] text-only simplified history
	 * @returns {Array<Object>}
	 */
	getHistory(curated = false) {
		if (curated) {
			return this.history.map(m => ({
				role: m.role,
				content: typeof m.content === 'string'
					? m.content
					: Array.isArray(m.content)
						? m.content.filter(p => p?.type === 'text').map(p => p.text).join('')
						: m.content == null ? '' : String(m.content)
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
		log.debug(`${this.constructor.name}: Conversation history cleared.`);
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
			log.debug('No examples provided. Skipping seeding.');
			return this.getHistory();
		}

		const promptKey = opts.promptKey || 'PROMPT';
		const answerKey = opts.answerKey || 'ANSWER';
		const contextKey = opts.contextKey || 'CONTEXT';
		const explanationKey = opts.explanationKey || 'EXPLANATION';
		const systemPromptKey = opts.systemPromptKey || 'SYSTEM';
		const format = opts.format || 'json';

		const instructionExample = examples.find(ex => ex[systemPromptKey]);
		if (instructionExample) {
			log.debug('Found system prompt in examples; updating.');
			this.systemPrompt = instructionExample[systemPromptKey];
		}

		log.debug(`Seeding conversation with ${examples.length} examples...`);
		const historyToAdd = [];

		for (const example of examples) {
			const contextValue = example[contextKey] || '';
			const promptValue = example[promptKey] || '';
			const answerValue = example[answerKey] || '';
			const explanationValue = example[explanationKey] || '';
			let userText = '';
			/** @type {any} */
			const modelResponse = {};

			if (contextValue) {
				const contextText = isJSON(contextValue) ? JSON.stringify(contextValue, null, 2) : contextValue;
				userText += `CONTEXT:\n${contextText}\n\n`;
			}

			if (promptValue) {
				userText += isJSON(promptValue) ? JSON.stringify(promptValue, null, 2) : promptValue;
			}

			let modelText;
			if (format === 'text') {
				modelText = isJSON(answerValue) ? JSON.stringify(answerValue, null, 2) : String(answerValue || '');
				if (explanationValue) log.warn('seed(): EXPLANATION has no representation in text format; ignored.');
			} else {
				if (answerValue) modelResponse.data = answerValue;
				if (explanationValue) modelResponse.explanation = explanationValue;
				modelText = JSON.stringify(modelResponse, null, 2);
			}

			if (userText.trim().length && modelText.trim().length > 0) {
				historyToAdd.push({ role: 'user', content: userText.trim() });
				historyToAdd.push({ role: 'assistant', content: modelText.trim() });
			}
		}

		log.debug(`Adding ${historyToAdd.length} items to history (${this.history.length} existing)...`);
		this.history = [...this.history, ...historyToAdd];
		this.exampleCount = this.history.length;

		log.debug(`History now has ${this.history.length} items.`);
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
			totalTokens: u.total_tokens ?? (promptTokens + responseTokens),
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

		// A turn's cost is gateway-authoritative only if EVERY round reported it.
		// A mixed turn (one streamed round, one not) falls back to the table for
		// the whole turn rather than adding two incomparable numbers.
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
		this._accumulateUsage(assembledResponse, /** @type {any} */ (null));
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

		const gatewayCost = useCumulative
			? (c.gatewayCostComplete ? c.gatewayCost : null)
			: meta.gatewayCost;

		const { estimatedCost, costSource } = this._resolveCost(
			gatewayCost, meta.modelVersion, promptTokens, responseTokens, thoughtsTokens
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
		if (gatewayCost !== null && gatewayCost !== undefined) {
			return { estimatedCost: gatewayCost, costSource: 'gateway' };
		}
		const usage = { promptTokens, responseTokens, thoughtsTokens };
		const estimated =
			computeCost(usage, modelVersion) ?? computeCost(usage, this.modelName);
		return estimated === null || estimated === undefined
			? { estimatedCost: null, costSource: null }
			: { estimatedCost: estimated, costSource: 'estimated' };
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
			h?.responseCost ?? null, modelVersion, t.promptTokens, t.responseTokens, t.thoughtsTokens
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

		const nextMessage = typeof nextPayload === 'string'
			? nextPayload
			: JSON.stringify(nextPayload, null, 2);

		/** @param {any} content */
		const lengthOf = (content) => {
			if (typeof content === 'string') return content.length;
			if (Array.isArray(content)) {
				return content.reduce((n, p) => n + (typeof p?.text === 'string' ? p.text.length : 0), 0);
			}
			return content == null ? 0 : JSON.stringify(content).length;
		};

		let chars = (this.systemPrompt || '').length + nextMessage.length;
		for (const m of this.history) {
			chars += lengthOf(m.content);
			for (const tc of m.tool_calls || []) chars += (tc.function?.arguments || '').length;
		}
		const tools = /** @type {any} */ (this).tools;
		if (tools?.length) chars += JSON.stringify(tools).length;

		const inputTokens = Math.ceil(chars / CHARS_PER_TOKEN);

		const limit = getModelInfo(this.modelName)?.maxInputTokens;
		if (limit && inputTokens > limit) {
			log.warn(
				`ak-litellm: estimated ${inputTokens} input tokens exceeds the ` +
				`${limit}-token context window of "${this.modelName}".`
			);
		}

		return { inputTokens, approximate: /** @type {true} */ (true) };
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
			estimatedInputCost: pricing ? (tokenInfo.inputTokens / 1_000_000) * pricing.input : null,
			note: pricing
				? 'Input tokens only, from a chars/4 heuristic; output cost depends on response length'
				: `No pricing known for model "${this.modelName}"; estimatedInputCost is null`
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
		try { page = await this.client.models.list(); }
		catch (err) { throw mapGatewayError(err, { model: this.modelName }); }

		for (const model of page?.data || []) {
			yield { ...model, display_name: model.id, ...(getModelInfo(model.id) || {}) };
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
		try { model = await this.client.models.retrieve(modelId); }
		catch (err) { throw mapGatewayError(err, { model: modelId }); }
		return {
			...model,
			display_name: model?.id || modelId,
			...(getModelInfo(modelId) || {}),
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
			log.level = logLevel === 'none' ? 'silent' : logLevel;
		} else if (LOG_LEVEL) {
			log.level = LOG_LEVEL;
		} else if (NODE_ENV === 'dev') {
			log.level = 'debug';
		} else if (NODE_ENV === 'test') {
			log.level = 'warn';
		} else if (NODE_ENV.startsWith('prod')) {
			log.level = 'error';
		} else {
			log.level = 'info';
		}
	}
}

export default BaseLiteLLM;
