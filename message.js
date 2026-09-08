/**
 * @fileoverview Message class — stateless one-off messages.
 * Each send() is independent; no conversation history is maintained.
 */

import BaseLiteLLM from './base.js';
import { normalizeOptions } from './compat.js';
import { extractJSON, validateSchema } from './json-helpers.js';
import log from './logger.js';

/**
 * @typedef {import('./types').MessageOptions} MessageOptions
 * @typedef {import('./types').MessageResponse} MessageResponse
 */

/**
 * Stateless one-off messages.
 *
 * Optionally returns structured data via `response_format.json_schema`
 * (`responseSchema`) or a lightweight JSON mode (`responseFormat: 'json'`).
 *
 * @example
 * ```javascript
 * import { Message } from 'ak-litellm';
 *
 * const msg = new Message({ systemPrompt: 'You are a helpful assistant.' });
 * const r = await msg.send('What is the capital of France?');
 * console.log(r.text);
 *
 * const schemaMsg = new Message({
 *   systemPrompt: 'Extract entities from text.',
 *   responseSchema: {
 *     type: 'object',
 *     properties: { entities: { type: 'array', items: { type: 'string' } } },
 *     required: ['entities']
 *   }
 * });
 * const r2 = await schemaMsg.send('Alice works at Acme Corp in New York.');
 * console.log(r2.data); // { entities: [...] }
 * ```
 */
class Message extends BaseLiteLLM {
	/**
	 * @param {MessageOptions} [options={}]
	 */
	constructor(options = {}) {
		const o = normalizeOptions(options, 'Message');
		super(o);

		this._responseSchema = o.responseSchema || null;
		this._isStructured = !!(this._responseSchema || o.responseFormat === 'json');

		// Extra re-sends when a structured response fails schema validation.
		// 0 disables retry. Default 2.
		// NB: distinct from Transformer's `maxRetries` (validation self-heal) and
		// BaseLiteLLM's `maxRetries` (SDK-level 429 retry) — different knobs.
		this.validationRetries = o.validationRetries ?? 2;

		// How a response that never satisfies the schema is reported:
		//  'strict' (default) — data: null + validationErrors (never invalid data)
		//  'warn'             — the parsed data anyway, PLUS validationErrors
		this.validationMode = o.validationMode === 'warn' ? 'warn' : 'strict';

		log.debug(`Message created (structured=${this._isStructured}, nativeSchema=${!!this._responseSchema})`);
	}

	/**
	 * Initialize. Stateless — no history to build.
	 * @param {boolean} [force=false]
	 * @returns {Promise<void>}
	 */
	async init(force = false) {
		if (this._initialized && !force) return;

		await this._ensureClient();
		log.debug(`Initializing ${this.constructor.name} with model: ${this.modelName}...`);

		await this._healthCheckPing();

		this._initialized = true;
		log.debug(`${this.constructor.name}: Initialized (stateless mode).`);
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

		const payloadStr = typeof payload === 'string'
			? payload
			: JSON.stringify(payload, null, 2);

		// Build the system turn, augmenting with a JSON instruction in the
		// schema-less JSON mode. `response_format: json_object` additionally
		// requires the word "JSON" to appear in the conversation.
		let systemPrompt = this.systemPrompt;
		if (this._isStructured && !this._responseSchema) {
			const jsonInstruction = 'Always respond ONLY with valid JSON. No markdown code blocks, no preamble text.';
			systemPrompt = systemPrompt ? `${systemPrompt}\n\n${jsonInstruction}` : jsonInstruction;
		}

		/** @type {any} */
		let responseFormat;
		if (this._responseSchema) {
			// `strict` is deliberately omitted. OpenAI's strict mode requires
			// additionalProperties:false and every property in `required`; forcing it
			// onto an arbitrary user schema turns a working call into a 400.
			responseFormat = {
				type: 'json_schema',
				json_schema: { name: 'response', schema: this._responseSchema }
			};
		} else if (this._isStructured) {
			responseFormat = { type: 'json_object' };
		}

		// Validation retries apply whenever a schema is set: json_schema is
		// enforced upstream by some providers on this gateway and not others.
		const retries = Math.max(0, Number(this.validationRetries) || 0);
		const maxAttempts = this._responseSchema ? 1 + retries : 1;

		let userContent = payloadStr;
		let text = '';
		let data;
		/** @type {string[]|null} */
		let validationErrors = null;
		/** @type {any} */
		let lastResponse = null;
		let cumPrompt = 0, cumResponse = 0, cumThoughts = 0, attempts = 0;
		let gatewayCost = 0, gatewayCostComplete = true;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			const params = this._buildRequestParams({
				messages: [{ role: 'user', content: userContent }],
				systemPrompt: systemPrompt || null,
				maxTokens: opts.maxTokens,
				response_format: responseFormat
			});

			const response = await this._call(params);
			lastResponse = response;
			attempts = attempt;

			// Accumulate straight off THIS response — never through mutable instance
			// state after an await, so concurrent send()s cannot cross-talk.
			const t = this._readUsage(response);
			cumPrompt += t.promptTokens;
			cumResponse += t.responseTokens;
			cumThoughts += t.thoughtsTokens;
			const cost = response?._gatewayHeaders?.responseCost ?? null;
			if (cost === null) gatewayCostComplete = false; else gatewayCost += cost;

			text = this._extractText(response);

			if (!this._isStructured) { data = undefined; break; }

			try {
				data = extractJSON(text);
			} catch (e) {
				log.warn(`Could not parse structured response: ${e.message}`);
				data = null;
			}

			// Only a declared schema can be validated.
			if (!this._responseSchema) break;

			if (data === null || data === undefined) {
				validationErrors = ['$: could not parse any JSON from the model response'];
			} else {
				const errs = validateSchema(data, this._responseSchema);
				validationErrors = errs.length ? errs : null;
			}

			if (!validationErrors) break;

			if (attempt < maxAttempts) {
				log.warn(`Structured output failed schema validation (attempt ${attempt}/${maxAttempts}): ${validationErrors.join('; ')}. Retrying with error feedback.`);
				userContent = `${payloadStr}\n\nYour previous response did not satisfy the required JSON schema:\n${validationErrors.map(e => `- ${e}`).join('\n')}\n\nRespond ONLY with corrected JSON that matches the schema. No markdown, no preamble.`;
			} else if (this.validationMode === 'strict') {
				log.warn(`Structured output still invalid after ${attempt} attempt(s). Returning data: null with validationErrors.`);
				data = null;
			} else {
				log.warn(`Structured output still invalid after ${attempt} attempt(s). validationMode='warn' — returning parsed data with validationErrors.`);
			}
		}

		// Capture instance metadata ONCE, after the loop (last-write-wins; unsafe
		// under concurrency — callers should prefer result.usage).
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
			lastResponse?.model, cumPrompt, cumResponse, cumThoughts
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

		/** @type {any} */
		const result = { text, usage };
		if (this._isStructured) result.data = data;
		if (validationErrors) result.validationErrors = validationErrors;

		return result;
	}

	// ── No-ops for a stateless class ──

	/** @returns {Array} always empty (stateless). */
	getHistory() { return []; }

	/** No-op (stateless). */
	async clearHistory() { }

	/** Not supported on Message (stateless). */
	async seed() {
		log.warn('Message is stateless — seed() has no effect. Use Transformer or Chat for few-shot learning.');
		return [];
	}
}

export default Message;
