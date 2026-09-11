/**
 * @fileoverview Transformer class — AI-powered JSON transformation via few-shot
 * learning, with validation, retry and self-healing.
 */

import fs from 'fs/promises';
import path from 'path';

import BaseLiteLLM from './base.js';
import { normalizeOptions } from './compat.js';
import { extractJSON, isJSON } from './json-helpers.js';
import log from './logger.js';

const DEFAULT_SYSTEM_INSTRUCTIONS = `
You are an expert JSON transformation engine. Your task is to accurately convert data payloads from one format to another.

You will be provided with example transformations (Source JSON -> Target JSON).

Learn the mapping rules from these examples.

When presented with new Source JSON, apply the learned transformation rules to produce a new Target JSON payload.

Always respond ONLY with a valid JSON object that strictly adheres to the expected output format.

Do not include any additional text, explanations, or formatting before or after the JSON object.

Do not wrap your response in markdown code blocks.
`;

/**
 * Appended to the original task when a previous attempt returned output that
 * could not be parsed as JSON. The failed response is already in the message
 * history, so this only needs to correct the format — not restate the task.
 */
const EXTRACTION_RETRY_NUDGE = `Your previous response could not be parsed as JSON. Respond with a single valid JSON object and NOTHING else — no prose, no explanations, no markdown code fences.`;

/**
 * @typedef {import('./types').TransformerOptions} TransformerOptions
 * @typedef {import('./types').AsyncValidatorFunction} AsyncValidatorFunction
 * @typedef {import('./types').TransformationExample} TransformationExample
 */

/**
 * AI-powered JSON transformation using few-shot learning.
 *
 * @example
 * ```javascript
 * import { Transformer } from 'ak-litellm';
 *
 * const t = new Transformer({ promptKey: 'INPUT', answerKey: 'OUTPUT' });
 *
 * await t.seed([
 *   { INPUT: { name: 'Alice' }, OUTPUT: { greeting: 'Hello, Alice!' } },
 *   { INPUT: { name: 'Bob' },   OUTPUT: { greeting: 'Hello, Bob!' } }
 * ]);
 *
 * const result = await t.send({ name: 'Charlie' });
 * // => { greeting: 'Hello, Charlie!' }
 * ```
 */
class Transformer extends BaseLiteLLM {
	/**
	 * @param {TransformerOptions} [options={}]
	 */
	constructor(options = {}) {
		const o = normalizeOptions(options, 'Transformer');
		if (o.systemPrompt === undefined) o.systemPrompt = DEFAULT_SYSTEM_INSTRUCTIONS;

		super(o);

		// ── JSON-specific config ──
		this.onlyJSON = o.onlyJSON !== undefined ? o.onlyJSON : true;
		this.responseSchema = o.responseSchema || null;

		// ── Example key mapping ──
		this.promptKey = o.promptKey || o.sourceKey || 'PROMPT';
		this.answerKey = o.answerKey || o.targetKey || 'ANSWER';
		this.contextKey = o.contextKey || 'CONTEXT';
		this.explanationKey = o.explanationKey || 'EXPLANATION';
		this.systemPromptKey = o.systemPromptKey || 'SYSTEM';

		if (this.promptKey === this.answerKey) {
			throw new Error('Source and target keys cannot be the same. Please provide distinct keys.');
		}

		// ── Examples source ──
		this.examplesFile = o.examplesFile || null;
		this.exampleData = o.exampleData || null;

		// ── Validation & retry ──
		// `maxRetries` is overloaded exactly as in ak-claude: BaseLiteLLM reads it
		// for SDK-level 429 retry, Transformer additionally for validation retries.
		this.asyncValidator = o.asyncValidator || null;
		this.validationRetries = o.maxRetries || 3;
		this.retryDelay = o.retryDelay || 1000;

		log.debug(`Transformer keys — Source: "${this.promptKey}", Target: "${this.answerKey}", Context: "${this.contextKey}"`);
	}

	/**
	 * `response_format` for a declared output schema, or undefined.
	 * @returns {any}
	 * @private
	 */
	_responseFormat() {
		if (!this.responseSchema) return undefined;
		return { type: 'json_schema', json_schema: { name: 'transformed', schema: this.responseSchema } };
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
				log.debug(`No examples provided, loading from file: ${this.examplesFile}`);
				try {
					const filePath = path.resolve(this.examplesFile);
					const raw = await fs.readFile(filePath, 'utf-8');
					examples = JSON.parse(raw);
				} catch (err) {
					throw new Error(`Could not load examples from file: ${this.examplesFile}. ${err.message}`);
				}
			} else if (this.exampleData) {
				log.debug('Using example data provided in options.');
				if (Array.isArray(this.exampleData)) {
					examples = this.exampleData;
				} else {
					throw new Error('Invalid example data provided. Expected an array of examples.');
				}
			} else {
				log.debug('No examples provided and no examples file specified. Skipping seeding.');
				return this.getHistory();
			}
		}

		return await super.seed(examples, {
			promptKey: this.promptKey,
			answerKey: this.answerKey,
			contextKey: this.contextKey,
			explanationKey: this.explanationKey,
			systemPromptKey: this.systemPromptKey,
			format: 'json'
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
		// The payload the MODEL produced, when it produced a parseable one. Stays
		// null after an extraction failure — there is nothing to repair.
		let lastModelOutput = null;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			// `_captureMetadata()` builds a fresh object per round-trip, so identity
			// tells us whether THIS attempt reached the gateway. An attempt that
			// reached it and came back unparseable still cost money and still counts.
			const metadataBefore = this.lastResponseMetadata;
			let accumulated = false;

			try {
				let transformedPayload;
				if (attempt === 0) {
					transformedPayload = await this.rawSend(originalPayload);
				} else if (lastModelOutput !== null) {
					// Validation failure: the model produced parseable output that the
					// validator rejected. Repair the payload it actually returned.
					transformedPayload = await this.rebuild(lastModelOutput, lastError.message);
				} else {
					// Extraction failure: the model returned something unparseable, so
					// there is no bad payload to repair. rebuild() would hand it the
					// ORIGINAL INPUT labelled "BAD PAYLOAD" (double-encoded, since
					// _preparePayload already stringified it) — re-send the task with a
					// format nudge instead.
					transformedPayload = await this.rawSend(`${originalPayload}\n\n${EXTRACTION_RETRY_NUDGE}`);
				}

				// `attempts` is API round-trips: rawSend()/rebuild() each made one.
				this._accumulateLastMetadata();
				accumulated = true;

				if (validator) {
					try {
						await validator(transformedPayload);
					} catch (validationError) {
						// Tag it so the next attempt repairs this payload rather than
						// treating the failure as an extraction problem.
						validationError._akValidationPayload = transformedPayload;
						throw validationError;
					}
				}

				log.debug(`Transformation succeeded on attempt ${attempt + 1}`);
				return transformedPayload;

			} catch (error) {
				// An extraction failure throws before the accumulate above. Count the
				// round-trip anyway — the caller was billed for it.
				if (!accumulated && this.lastResponseMetadata !== metadataBefore) {
					this._accumulateLastMetadata();
				}

				lastError = error;
				lastModelOutput = '_akValidationPayload' in error ? error._akValidationPayload : null;
				log.warn(`Attempt ${attempt + 1} failed: ${error.message}`);

				if (attempt >= maxRetries) {
					log.error(`All ${maxRetries + 1} attempts failed.`);
					throw new Error(`Transformation failed after ${maxRetries + 1} attempts. Last error: ${error.message}`);
				}

				const delay = retryDelay * Math.pow(2, attempt);
				await new Promise(res => setTimeout(res, delay));
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

		const actualPayload = typeof payload === 'string'
			? payload
			: JSON.stringify(payload, null, 2);

		try {
			const response = await this._sendMessage(actualPayload, {
				response_format: this._responseFormat()
			});

			const modelResponse = this._extractText(response);

			if (response.usage && log.level !== 'silent') {
				log.debug(`API response: model=${response.model || 'unknown'}, tokens=${(response.usage.prompt_tokens || 0) + (response.usage.completion_tokens || 0)}`);
			}

			return this._parseModelResponse(modelResponse);

		} catch (error) {
			if (this.onlyJSON && error.message.includes('Could not extract valid JSON')) {
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
Respond with JSON only – no comments or explanations.
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
	/**
	 * Marks the seeded few-shot block for caching.
	 *
	 * The examples are identical on every `send()`, so on a caching model they
	 * are the cheapest thing in the package to cache. `cache_control` goes on the
	 * last example — Anthropic caches the prefix up to and including it.
	 *
	 * Returns the messages untouched when caching is off, the model cannot cache,
	 * or the block is under the size floor.
	 *
	 * @param {any[]} examples seeded history entries
	 * @returns {any[]}
	 * @private
	 */
	_cacheableExamples(examples) {
		if (!examples.length) return examples;

		const text = examples
			.map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
			.join('');
		if (!this._shouldCache(this.cacheExamples, text)) return examples;

		const out = examples.slice();
		const last = out[out.length - 1];
		const content = typeof last.content === 'string'
			? [{ type: 'text', text: last.content }]
			: [...last.content];
		content[content.length - 1] = {
			...content[content.length - 1],
			cache_control: { type: 'ephemeral', ttl: this.cacheTtl }
		};
		out[out.length - 1] = { ...last, content };
		return out;
	}

	async _statelessSend(payload, opts = {}, validatorFn = null) {
		const payloadStr = typeof payload === 'string'
			? payload
			: JSON.stringify(payload, null, 2);

		const messages = [];
		if (this.exampleCount > 0) {
			messages.push(...this._cacheableExamples(this.history.slice(0, this.exampleCount)));
		}
		messages.push({ role: 'user', content: payloadStr });

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
		log.debug(`Conversation cleared. Preserved ${exampleHistory.length} example items.`);
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
		log.debug('Conversation fully reset.');
	}

	/**
	 * @param {string} newPrompt
	 * @returns {Promise<void>}
	 */
	async updateSystemPrompt(newPrompt) {
		if (!newPrompt || typeof newPrompt !== 'string') {
			throw new Error('System prompt must be a non-empty string');
		}
		this.systemPrompt = newPrompt.trim();
		log.debug('System prompt updated.');
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
		} else if (typeof payload === 'string') {
			return payload;
		} else if (typeof payload === 'boolean' || typeof payload === 'number') {
			return payload.toString();
		} else if (payload === null || payload === undefined) {
			return JSON.stringify({});
		} else {
			throw new Error('Invalid source payload. Must be a JSON object or string.');
		}
	}
}

export default Transformer;
