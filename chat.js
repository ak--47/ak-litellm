/**
 * @fileoverview Chat class — multi-turn text conversation with history.
 */

import BaseLiteLLM from './base.js';
import { normalizeOptions } from './compat.js';
import log from './logger.js';

/**
 * @typedef {import('./types').ChatOptions} ChatOptions
 * @typedef {import('./types').ChatResponse} ChatResponse
 * @typedef {import('./types').ChatStreamEvent} ChatStreamEvent
 */

/**
 * Multi-turn text conversation. History is maintained automatically and sent
 * with every request.
 *
 * @example
 * ```javascript
 * import { Chat } from 'ak-litellm';
 *
 * const chat = new Chat({ systemPrompt: 'You are a pirate.' });
 * const r = await chat.send('What is your name?');
 * console.log(r.text, r.usage.estimatedCost);
 *
 * for await (const ev of chat.stream('Tell me a story')) {
 *   if (ev.type === 'text') process.stdout.write(ev.text);
 * }
 * ```
 */
class Chat extends BaseLiteLLM {
	/**
	 * @param {ChatOptions} [options={}]
	 */
	constructor(options = {}) {
		const o = normalizeOptions(options, 'Chat');
		if (o.systemPrompt === undefined) o.systemPrompt = 'You are a helpful AI assistant.';
		super(o);
		log.debug('Chat created');
	}

	/**
	 * Seeds few-shot examples. Chat is a prose agent, so answers are stored
	 * verbatim rather than wrapped in the Transformer `{data}` envelope.
	 * @param {any[]} examples
	 * @param {Object} [opts={}]
	 * @returns {Promise<Array>}
	 */
	async seed(examples, opts = {}) {
		return super.seed(examples, { format: 'text', ...opts });
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

		/** @type {any[]} */
		const chunks = [];
		let fullText = '';

		for await (const chunk of stream) {
			chunks.push(chunk);
			const delta = chunk?.choices?.[0]?.delta?.content;
			if (typeof delta === 'string' && delta.length) {
				fullText += delta;
				yield { type: 'text', text: delta };
			}
		}

		const assembled = this._assembleStreamResponse(chunks, this.modelName);
		this.history.push(this._assistantHistoryEntry(assembled.choices[0].message));
		// The gateway omits x-litellm-response-cost on streams, so this turn's
		// cost comes from the pricing table and usage.costSource is 'estimated'.
		this._streamUsage(assembled);

		yield { type: 'done', fullText, usage: this.getLastUsage() };
	}
}

export default Chat;
