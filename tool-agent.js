/**
 * @fileoverview ToolAgent class — AI agent with user-provided tools.
 * Extends BaseLiteLLM with automatic tool-use loops for both streaming and
 * non-streaming conversations.
 *
 * The OpenAI-protocol tool flow the gateway speaks:
 * 1. Send messages with a `tools[]` array of `{type:'function', function:{…}}`.
 * 2. The response has `finish_reason: 'tool_calls'` and
 *    `message.tool_calls[] = {id, function:{name, arguments}}` — `arguments` is a
 *    JSON *string*, not an object.
 * 3. Send one `{role:'tool', tool_call_id, content}` message back per call.
 * 4. Repeat until `finish_reason` is anything else.
 */

import BaseLiteLLM from './base.js';
import { normalizeOptions } from './compat.js';
import log from './logger.js';

/**
 * @typedef {import('./types').ToolAgentOptions} ToolAgentOptions
 * @typedef {import('./types').AgentResponse} AgentResponse
 * @typedef {import('./types').AgentStreamEvent} AgentStreamEvent
 */

/**
 * Execute async task factories with a concurrency limit.
 * @param {Array<() => Promise<any>>} tasks
 * @param {number} concurrency - Infinity for unlimited, 1 for sequential
 * @returns {Promise<any[]>} Results in same order as tasks
 */
async function runWithConcurrency(tasks, concurrency) {
	if (concurrency === Infinity) return Promise.all(tasks.map(t => t()));
	if (concurrency === 1) {
		const results = [];
		for (const t of tasks) results.push(await t());
		return results;
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

/**
 * Parses a tool call's `arguments` JSON string.
 * A malformed string is handed to the executor as `{}` with the raw text under
 * `_raw`, rather than throwing — the model, not the caller, produced it.
 * @param {any} toolCall
 * @returns {any}
 */
function parseToolArgs(toolCall) {
	const raw = toolCall?.function?.arguments;
	if (raw === undefined || raw === null || raw === '') return {};
	if (typeof raw === 'object') return raw;
	try {
		return JSON.parse(raw);
	} catch {
		log.warn(`Tool "${toolCall?.function?.name}" returned unparseable arguments; passing {}.`);
		return { _raw: raw };
	}
}

/**
 * AI agent that uses user-provided tools to accomplish tasks.
 * Automatically manages the tool-use loop: when the model decides to call a
 * tool, the agent executes it via your toolExecutor, sends the result back, and
 * continues until the model produces a final text response.
 *
 * Ships with zero built-in tools — you provide everything via the constructor.
 *
 * @example
 * ```javascript
 * import { ToolAgent } from 'ak-litellm';
 *
 * const agent = new ToolAgent({
 *   systemPrompt: 'You are a research assistant.',
 *   tools: [
 *     {
 *       name: 'http_get',
 *       description: 'Fetch a URL and return its contents',
 *       input_schema: {
 *         type: 'object',
 *         properties: { url: { type: 'string', description: 'The URL to fetch' } },
 *         required: ['url']
 *       }
 *     }
 *   ],
 *   toolExecutor: async (toolName, args) => {
 *     if (toolName === 'http_get') {
 *       const res = await fetch(args.url);
 *       return { status: res.status, body: await res.text() };
 *     }
 *     throw new Error(`Unknown tool: ${toolName}`);
 *   }
 * });
 *
 * const result = await agent.chat('Fetch https://api.example.com/data and summarize it');
 * console.log(result.text);      // Agent's summary
 * console.log(result.toolCalls); // [{ name: 'http_get', args: {...}, result: {...} }]
 * ```
 */
class ToolAgent extends BaseLiteLLM {
	/**
	 * @param {ToolAgentOptions} [options={}]
	 */
	constructor(options = {}) {
		const o = normalizeOptions(options, 'ToolAgent');
		if (o.systemPrompt === undefined) o.systemPrompt = 'You are a helpful AI assistant.';

		super(o);

		// ── Tools ──
		// Declarations are stored in whatever shape the caller supplied and
		// converted to the OpenAI function shape by `_buildTools()` at send time,
		// so `agent.tools` still reads back the way ak-claude/ak-gemini users wrote
		// it. Validate the schema here so a missing one fails at construction
		// rather than as an opaque 400.
		/** @type {any[]} */
		this.tools = (o.tools || []).map((t, i) => {
			const schema = t.input_schema || t.inputSchema || t.parametersJsonSchema || t.function?.parameters || t.parameters;
			if (!schema) {
				throw new Error(`ToolAgent: tool ${t?.name ? `"${t.name}"` : `at index ${i}`} has no parameter schema. Provide one of: input_schema (Claude), inputSchema, parametersJsonSchema (Gemini), or parameters (OpenAI). For a no-argument tool use { type: 'object', properties: {} }.`);
			}
			return t;
		});
		this.toolExecutor = o.toolExecutor || null;

		if (this.tools.length > 0 && !this.toolExecutor) {
			throw new Error('ToolAgent: tools provided without a toolExecutor. Provide a toolExecutor function to handle tool calls.');
		}
		if (this.toolExecutor && this.tools.length === 0) {
			throw new Error('ToolAgent: toolExecutor provided without tools. Provide tool declarations so the model knows what tools are available.');
		}

		// ── Tool choice ──
		// normalizeOptions() has already folded ak-gemini's `toolConfig` into
		// `toolChoice`; the Anthropic object shapes are converted on the wire by
		// `normalizeToolChoice()` inside `_buildRequestParams()`.
		this.toolChoice = o.toolChoice ?? undefined;
		this.disableParallelToolUse = o.disableParallelToolUse ?? false;

		// ── Parallel execution ──
		this.parallelToolCalls = o.parallelToolCalls ?? true;
		/** @private */
		this._concurrency = this.parallelToolCalls === true ? Infinity
			: this.parallelToolCalls === false ? 1
				: this.parallelToolCalls;

		// ── Tool loop config ──
		this.maxToolRounds = o.maxToolRounds || 10;
		this.onToolCall = o.onToolCall || null;
		this.onBeforeExecution = o.onBeforeExecution || null;
		this._stopped = false;

		log.debug(`ToolAgent created with ${this.tools.length} tools`);
	}

	/**
	 * The per-request options that carry the tool configuration.
	 * @returns {Object}
	 * @private
	 */
	_toolParams() {
		/** @type {any} */
		const params = { tools: this.tools };
		if (this.toolChoice !== undefined) params.tool_choice = this.toolChoice;
		// `disable_parallel_tool_use` has no OpenAI equivalent; the gateway's is
		// `parallel_tool_calls: false`.
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
			try { this.onToolCall(name, args); }
			catch (e) { log.warn(`onToolCall callback error: ${e.message}`); }
		}

		let denied = false;
		if (this.onBeforeExecution) {
			try {
				const allowed = await this.onBeforeExecution(name, args);
				if (allowed === false) denied = true;
			} catch (e) {
				log.warn(`onBeforeExecution callback error: ${e.message}`);
			}
		}

		let result;
		if (denied) {
			result = { error: 'Execution denied by onBeforeExecution callback' };
		} else {
			try {
				result = await this.toolExecutor(name, args);
			} catch (err) {
				log.warn(`Tool ${name} failed: ${err.message}`);
				result = { error: err.message };
			}
		}

		return {
			toolCall: { name, args, result },
			toolResult: {
				role: 'tool',
				// Echoed VERBATIM — Gemini hides a thought_signature in this id.
				tool_call_id: call.id,
				content: typeof result === 'string' ? result : JSON.stringify(result)
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
				calls.map(call => () => this._runToolCall(call)),
				this._concurrency
			);
			for (const r of results) allToolCalls.push(r.toolCall);

			response = await this._sendMessage(results.map(r => r.toolResult), { ...toolParams, ...opts });
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
		let fullText = '';
		const toolParams = this._toolParams();

		this._resetUsage();
		let stream = await this._streamMessage(message, { ...toolParams, ...opts });

		for (let round = 0; round < this.maxToolRounds; round++) {
			if (this._stopped) break;

			/** @type {any[]} */
			const chunks = [];
			for await (const chunk of stream) {
				chunks.push(chunk);
				const delta = chunk?.choices?.[0]?.delta?.content;
				if (typeof delta === 'string' && delta.length) {
					fullText += delta;
					yield { type: 'text', text: delta };
				}
			}

			const assembled = this._assembleStreamResponse(chunks, this.modelName);

			// _streamMessage() pushed the user turn but not the assistant turn.
			this.history.push(this._assistantHistoryEntry(assembled.choices[0].message));
			this._streamUsage(assembled);

			const calls = this._toolCallsFrom(assembled);
			if (calls.length === 0) {
				yield { type: 'done', fullText, usage: this.getLastUsage() };
				return;
			}

			/** @type {any[]} */
			const toolResults = [];
			if (this._concurrency === 1) {
				for (const call of calls) {
					if (this._stopped) break;
					yield { type: 'tool_call', toolName: call.function?.name, args: parseToolArgs(call) };
					const r = await this._runToolCall(call);
					allToolCalls.push(r.toolCall);
					yield { type: 'tool_result', toolName: r.toolCall.name, result: r.toolCall.result };
					toolResults.push(r.toolResult);
				}
			} else {
				for (const call of calls) {
					yield { type: 'tool_call', toolName: call.function?.name, args: parseToolArgs(call) };
				}
				const results = await runWithConcurrency(
					calls.map(call => () => this._runToolCall(call)),
					this._concurrency
				);
				for (const r of results) {
					allToolCalls.push(r.toolCall);
					yield { type: 'tool_result', toolName: r.toolCall.name, result: r.toolCall.result };
					toolResults.push(r.toolResult);
				}
			}

			// The API requires exactly one tool message per tool_call in the
			// preceding assistant turn. A stop() partway through the sequential
			// branch leaves toolResults short, and sending a partial set is a 400.
			// Bail out before the send.
			if (this._stopped) break;

			stream = await this._streamMessage(toolResults, { ...toolParams, ...opts });
		}

		yield {
			type: 'done',
			fullText,
			usage: this.getLastUsage(),
			warning: this._stopped ? 'Agent was stopped' : 'Max tool rounds reached'
		};
	}

	// ── Stop ────────────────────────────────────────────────────────────────

	/**
	 * Stop the agent before the next tool execution round.
	 */
	stop() {
		this._stopped = true;
		log.info('ToolAgent stopped');
	}
}

export default ToolAgent;
