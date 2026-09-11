/**
 * @fileoverview The `/v1/responses` transport.
 *
 * `POST /v1/chat/completions` handles everything in this package except one
 * thing: **OpenAI native web search**. On chat completions, `{ type:
 * 'web_search' }` is a hard 400 —
 * `Invalid value: 'web_search'. Supported values are: 'function' and 'custom'`.
 * It exists only on `/v1/responses`. Verified 2026-09-11.
 *
 * Rather than teach the whole package a second protocol, this module adapts at
 * the two edges:
 *
 *   chat-completions request  --toResponsesRequest-->  /v1/responses
 *   /v1/responses reply       --fromResponsesReply-->  chat-completions reply
 *
 * Everything between those two points — `_extractText`, `_readUsage`,
 * `_captureMetadata`, cost resolution — runs unchanged on the adapted object.
 *
 * Scope is deliberately narrow (spec §4.4): text in, text out, with web search.
 * Tool calling and structured output stay on chat completions, because
 * duplicating those paths would double the surface for one provider's feature.
 */

/**
 * Chat-completions request body → Responses request body.
 *
 * Differences that matter:
 * - `messages` becomes `input`, same role/content shape.
 * - `max_tokens` becomes `max_output_tokens`.
 * - a system message becomes `instructions`, not an input item.
 * - `reasoning_effort` becomes `reasoning: { effort }`.
 * - function tools keep their shape; `web_search` is passed straight through.
 *
 * @param {any} params a body built by `BaseLiteLLM._buildRequestParams()`
 * @returns {any} a `/v1/responses` body
 */
export function toResponsesRequest(params) {
	const messages = Array.isArray(params.messages) ? [...params.messages] : [];

	// The Responses API carries the system turn out-of-band.
	let instructions;
	if (messages[0]?.role === 'system') {
		const sys = messages.shift();
		instructions = typeof sys.content === 'string'
			? sys.content
			: (sys.content || []).map((/** @type {any} */ p) => p?.text || '').join('');
	}

	/** @type {any} */
	const body = { model: params.model, input: messages };
	if (instructions) body.instructions = instructions;
	if (params.max_tokens != null) body.max_output_tokens = params.max_tokens;
	if (params.reasoning_effort) body.reasoning = { effort: params.reasoning_effort };
	if (params.temperature != null) body.temperature = params.temperature;
	if (params.top_p != null) body.top_p = params.top_p;
	if (params.metadata) body.metadata = params.metadata;
	if (params.tools?.length) body.tools = params.tools;
	if (params.stream) body.stream = true;

	return body;
}

/**
 * Responses reply → chat-completions-shaped reply.
 *
 * The text lives at `output[].content[].text` on the item whose `type` is
 * `message`; LiteLLM leaves the SDK's `output_text` convenience field empty, so
 * do not read it. `web_search_call` and `reasoning` items are counted, not
 * rendered.
 *
 * @param {any} resp a `/v1/responses` reply
 * @returns {any} an object shaped like a chat-completions reply
 */
export function fromResponsesReply(resp) {
	const output = Array.isArray(resp?.output) ? resp.output : [];

	const text = output
		.filter((/** @type {any} */ o) => o?.type === 'message')
		.flatMap((/** @type {any} */ o) => o.content || [])
		.filter((/** @type {any} */ c) => c?.type === 'output_text' || typeof c?.text === 'string')
		.map((/** @type {any} */ c) => c.text || '')
		.join('');

	const webSearchRequests = output.filter((/** @type {any} */ o) => o?.type === 'web_search_call').length;
	const u = resp?.usage || {};

	return {
		id: resp?.id ?? null,
		model: resp?.model ?? null,
		object: 'chat.completion',
		choices: [{
			index: 0,
			message: { role: 'assistant', content: text },
			// `incomplete` means the output cap was hit mid-answer.
			finish_reason: resp?.status === 'completed' ? 'stop' : (resp?.status || 'stop')
		}],
		usage: {
			prompt_tokens: u.input_tokens || 0,
			completion_tokens: u.output_tokens || 0,
			total_tokens: u.total_tokens || 0,
			prompt_tokens_details: {
				cached_tokens: u.input_tokens_details?.cached_tokens || 0,
				cache_creation_tokens: u.input_tokens_details?.cache_write_tokens || 0,
				web_search_requests: webSearchRequests
			},
			completion_tokens_details: {
				reasoning_tokens: u.output_tokens_details?.reasoning_tokens || 0
			}
		},
		/** Kept so callers can inspect reasoning and search items if they want them. */
		_responsesOutput: output
	};
}

/**
 * Whether this request has to go over `/v1/responses`.
 *
 * Exactly one condition today: OpenAI web search. Everything else works on chat
 * completions, and chat completions is the better-tested path.
 *
 * @param {'chat' | 'responses' | 'auto'} transport the caller's `transport` option
 * @param {import('./capabilities.js').WebSearchStyle} searchStyle
 * @param {boolean} webSearchEnabled
 * @returns {boolean}
 */
export function needsResponsesTransport(transport, searchStyle, webSearchEnabled) {
	if (transport === 'responses') return true;
	if (transport === 'chat') return false;
	return webSearchEnabled && searchStyle === 'openai';
}
