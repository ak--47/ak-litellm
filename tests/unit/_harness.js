/**
 * @fileoverview Offline test harness. Mocks the `openai` npm SDK at the module
 * level, so nothing in the unit suite can reach the network even by accident.
 *
 * Import this BEFORE anything that pulls in `client.js` — `setup()` does the
 * dynamic import for you, which is the whole point.
 *
 * Usage:
 *   import { setup, mock, chatResponse } from './_harness.js';
 *   const { Chat } = await setup();
 */

import { jest } from '@jest/globals';

// A key must exist before client.js runs `resolveApiKey()`. Set here, not in
// .env — the real key must never appear in a test fixture. `dotenv` does not
// override an already-set variable, so this wins over a developer's .env.
process.env.LITELLM_API_KEY = 'sk-unit-test-not-a-real-key';
process.env.LITELLM_BASE_URL = 'https://litellm.invalid';
process.env.AK_LITELLM_SILENCE_COMPAT = '';

/** Every model id the fake `GET /v1/models` reports. */
const DEFAULT_MODEL_IDS = [
	'claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5',
	'gemini-3.8-flash', 'gpt-5.6-luna', 'kimi-k3'
];

/**
 * Shared mock state. Reset it in `beforeEach` with `mock.reset()`.
 */
export const mock = {
	/** Every params object handed to `chat.completions.create()`, in order. */
	/** @type {any[]} */
	requests: [],
	/** Every options object handed to `new OpenAI()`. */
	/** @type {any[]} */
	constructorArgs: [],
	/** FIFO queue of non-streaming replies: `{ body, headers }`. */
	/** @type {any[]} */
	responses: [],
	/** FIFO queue of streamed replies: `{ chunks }`. */
	/** @type {any[]} */
	streams: [],
	/** Ids reported by `client.models.list()`. */
	modelIds: [...DEFAULT_MODEL_IDS],
	/** Set to an Error to make the NEXT create() reject, or an array of Errors to reject that many in a row. */
	/** @type {any} */
	failNext: null,

	reset() {
		mock.requests = [];
		mock.constructorArgs = [];
		mock.responses = [];
		mock.streams = [];
		mock.modelIds = [...DEFAULT_MODEL_IDS];
		mock.failNext = null;
	},

	/** The most recent request body. */
	lastRequest() {
		return mock.requests[mock.requests.length - 1];
	},

	/**
	 * Queue one non-streaming reply.
	 * @param {any} body
	 * @param {Record<string, string|number>} [headers]
	 */
	queue(body, headers = {}) {
		mock.responses.push({ body, headers });
		return mock;
	},

	/**
	 * Queue one streamed reply.
	 * @param {any[]} chunks
	 */
	queueStream(chunks) {
		mock.streams.push({ chunks });
		return mock;
	}
};

/**
 * Builds a chat-completions response body.
 *
 * @param {string|null} text
 * @param {Object} [opts]
 * @param {number} [opts.promptTokens]
 * @param {number} [opts.completionTokens]
 * @param {number} [opts.reasoningTokens]
 * @param {string} [opts.model]
 * @param {string} [opts.finishReason]
 * @param {any[]} [opts.toolCalls]
 * @returns {any}
 */
export function chatResponse(text, opts = {}) {
	const {
		promptTokens = 10,
		completionTokens = 5,
		reasoningTokens = 0,
		model = 'claude-sonnet-5',
		finishReason = 'stop',
		toolCalls = null
	} = opts;

	/** @type {any} */
	const message = { role: 'assistant', content: text };
	if (toolCalls) message.tool_calls = toolCalls;

	return {
		id: 'chatcmpl-unit',
		object: 'chat.completion',
		model,
		choices: [{ index: 0, message, finish_reason: toolCalls ? 'tool_calls' : finishReason }],
		usage: {
			prompt_tokens: promptTokens,
			completion_tokens: completionTokens,
			total_tokens: promptTokens + completionTokens,
			completion_tokens_details: { reasoning_tokens: reasoningTokens }
		}
	};
}

/**
 * Builds an OpenAI tool_call object.
 * @param {string} name
 * @param {any} args
 * @param {string} [id]
 */
export function toolCall(name, args, id = 'toolu_unit_1') {
	return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

/**
 * Builds the SSE chunk list for a streamed text reply, ending with a
 * usage-only chunk (what `stream_options: { include_usage: true }` produces).
 *
 * @param {string[]} deltas
 * @param {Object} [opts]
 * @param {number} [opts.promptTokens]
 * @param {number} [opts.completionTokens]
 * @param {string} [opts.model]
 * @returns {any[]}
 */
export function streamChunks(deltas, opts = {}) {
	const { promptTokens = 10, completionTokens = 5, model = 'claude-sonnet-5' } = opts;
	const chunks = deltas.map(text => ({
		model,
		choices: [{ index: 0, delta: { content: text }, finish_reason: null }]
	}));
	chunks.push({ model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
	chunks.push({
		model,
		choices: [],
		usage: {
			prompt_tokens: promptTokens,
			completion_tokens: completionTokens,
			total_tokens: promptTokens + completionTokens
		}
	});
	return chunks;
}

/**
 * Builds the SSE chunk list for a streamed tool call — name and arguments
 * arrive split across chunks, which is what the real gateway does.
 *
 * @param {string} name
 * @param {any} args
 * @param {Object} [opts]
 * @param {string} [opts.id]
 * @param {string} [opts.model]
 * @param {number} [opts.promptTokens]
 * @param {number} [opts.completionTokens]
 * @returns {any[]}
 */
export function streamToolCallChunks(name, args, opts = {}) {
	const { id = 'toolu_unit_1', model = 'claude-sonnet-5', promptTokens = 10, completionTokens = 5 } = opts;
	const json = JSON.stringify(args);
	const half = Math.ceil(json.length / 2);
	return [
		{ model, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: '' } }] }, finish_reason: null }] },
		{ model, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: json.slice(0, half) } }] }, finish_reason: null }] },
		{ model, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: json.slice(half) } }] }, finish_reason: 'tool_calls' }] },
		{ model, choices: [], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens } }
	];
}

// ── The mock SDK ─────────────────────────────────────────────────────────────

/** @param {Record<string, any>} raw */
function fakeHttpResponse(raw) {
	const lower = new Map(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), String(v)]));
	return { headers: { get: (/** @type {string} */ name) => lower.get(name.toLowerCase()) ?? null } };
}

/** @param {any[]} chunks */
async function* asyncIterate(chunks) {
	for (const c of chunks) yield c;
}

/**
 * Mimics the SDK's `APIPromise`: awaitable, and carrying `.withResponse()`.
 * @param {Promise<any>} dataPromise
 * @param {Record<string, any>} headers
 */
function apiPromise(dataPromise, headers) {
	/** @type {any} */
	const p = dataPromise;
	p.withResponse = async () => ({ data: await dataPromise, response: fakeHttpResponse(headers) });
	return p;
}

class MockOpenAI {
	/** @param {any} opts */
	constructor(opts) {
		mock.constructorArgs.push(opts);
		this.apiKey = opts?.apiKey;
		this.baseURL = opts?.baseURL;
		this.chat = { completions: { create: (/** @type {any} */ params) => this._create(params) } };
		this.models = { list: async () => ({ data: mock.modelIds.map(id => ({ id })) }) };
	}

	/** @param {any} params */
	_create(params) {
		mock.requests.push(params);

		if (Array.isArray(mock.failNext) && mock.failNext.length) {
			// An array fails that many requests in a row, in order.
			const err = mock.failNext.shift();
			if (!mock.failNext.length) mock.failNext = null;
			return apiPromise(Promise.reject(err), {});
		}
		if (mock.failNext && !Array.isArray(mock.failNext)) {
			const err = mock.failNext;
			mock.failNext = null;
			return apiPromise(Promise.reject(err), {});
		}

		if (params?.stream) {
			const item = mock.streams.shift();
			if (!item) throw new Error('mock openai: stream queue is empty — call mock.queueStream(...)');
			return apiPromise(Promise.resolve(asyncIterate(item.chunks)), {});
		}

		const item = mock.responses.shift();
		if (!item) throw new Error('mock openai: response queue is empty — call mock.queue(...)');
		return apiPromise(Promise.resolve(item.body), item.headers);
	}
}

jest.unstable_mockModule('openai', () => ({ default: MockOpenAI, OpenAI: MockOpenAI }));

/**
 * Imports the package with the mock in place.
 * @returns {Promise<any>}
 */
export async function setup() {
	return await import('../../index.js');
}

export { MockOpenAI };
