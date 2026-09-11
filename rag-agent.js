/**
 * @fileoverview RagAgent class — AI agent for document & data Q&A.
 *
 * NOTE: This is not true RAG (no vector embeddings, chunking, or similarity
 * search). It uses long-context injection — all content is placed directly into
 * the model's context window. Named "RagAgent" because it serves the same
 * purpose in spirit: grounding AI responses in user-provided data.
 *
 * Supports four input types:
 * - localFiles:  read from disk as text (md, json, csv, yaml, txt, …)
 * - localData:   in-memory objects serialized as JSON
 * - mediaFiles:  images/PDFs encoded as base64 content parts
 * - remoteFiles: ak-gemini's Files API input, accepted as a drop-in alias for
 *   `mediaFiles` — see the note on the option below
 */

import { resolve, basename, extname } from 'node:path';
import { readFile } from 'node:fs/promises';

import BaseLiteLLM from './base.js';
import { normalizeOptions, warnOnce } from './compat.js';
import { getCapabilities } from './capabilities.js';
import log from './logger.js';

/** @type {Record<string, string>} */
const MIME_TYPES = {
	// Text (read as UTF-8, injected as text)
	'.txt': 'text/plain', '.md': 'text/plain', '.csv': 'text/csv',
	'.html': 'text/html', '.htm': 'text/html', '.xml': 'text/xml',
	'.json': 'application/json', '.js': 'text/javascript', '.mjs': 'text/javascript',
	'.ts': 'text/plain', '.css': 'text/css', '.yaml': 'text/plain', '.yml': 'text/plain',
	'.py': 'text/x-python', '.rb': 'text/plain', '.sh': 'text/plain',
	// Images (base64 encoded for vision)
	'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
	'.gif': 'image/gif', '.webp': 'image/webp',
	// Documents (base64 encoded)
	'.pdf': 'application/pdf',
};

/**
 * @typedef {import('./types').RagAgentOptions} RagAgentOptions
 * @typedef {import('./types').RagResponse} RagResponse
 * @typedef {import('./types').RagStreamEvent} RagStreamEvent
 * @typedef {import('./types').LocalDataEntry} LocalDataEntry
 */

const DEFAULT_SYSTEM_PROMPT =
	'You are a helpful AI assistant. Answer questions based on the provided documents and data. ' +
	'When referencing information, mention which document or data source it comes from.';

/**
 * AI agent that answers questions grounded in user-provided documents and data.
 *
 * @example
 * ```javascript
 * import { RagAgent } from 'ak-litellm';
 *
 * const agent = new RagAgent({
 *   localFiles: ['./docs/api.md', './config.yaml'],
 *   localData: [
 *     { name: 'users', data: [{ id: 1, name: 'Alice' }] },
 *   ],
 *   mediaFiles: ['./diagram.png'],
 * });
 *
 * const result = await agent.chat('What does the API doc say about auth?');
 * console.log(result.text);
 * ```
 */
class RagAgent extends BaseLiteLLM {
	/**
	 * @param {RagAgentOptions} [options={}]
	 */
	constructor(options = {}) {
		// Read before normalizeOptions(), which deletes ignored options.
		const citationsRequested = options.enableCitations === true;

		const o = normalizeOptions(options, 'RagAgent');
		if (o.systemPrompt === undefined) o.systemPrompt = DEFAULT_SYSTEM_PROMPT;

		super(o);

		this.localFiles = o.localFiles || [];
		this.localData = o.localData || [];
		this.mediaFiles = o.mediaFiles || [];

		// ak-gemini uploads `remoteFiles` to the Google Files API and references
		// them by URI. There is no such endpoint here, so paths are read from disk
		// and inlined exactly like `mediaFiles`. Images and PDFs work; audio and
		// video do not travel over /v1/chat/completions and are skipped in init().
		if (o.remoteFiles?.length) {
			warnOnce(
				'remoteFiles',
				'ak-litellm: `remoteFiles` is accepted but the Google Files API does not ' +
				'exist behind this gateway. The paths are read from disk and inlined as ' +
				'base64, the same as `mediaFiles`. Images and PDFs work; audio and video ' +
				'are skipped.',
				this._silentCompat
			);
			this.mediaFiles = [...this.mediaFiles, ...o.remoteFiles];
		}

		// Always false: the gateway exposes no citation feature. Kept as a property
		// so `agent.enableCitations` still reads back, and so `chat()` can return an
		// empty `citations` array to code written against ak-claude.
		this.enableCitations = false;
		/** @private */
		this._citationsRequested = citationsRequested;

		/** @type {Array<{name:string, content:string, path:string}>} */
		this._localFileContents = [];
		/** @type {any[]} */
		this._mediaContentBlocks = [];

		const total = this.localFiles.length + this.localData.length + this.mediaFiles.length;
		log.debug(`RagAgent created with ${total} context sources`);
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

		// 1. Read local text files from disk
		this._localFileContents = [];
		for (const filePath of this.localFiles) {
			const resolvedPath = resolve(filePath);
			log.debug(`Reading local file: ${resolvedPath}`);

			const content = await readFile(resolvedPath, 'utf-8');
			this._localFileContents.push({
				name: basename(resolvedPath),
				content,
				path: resolvedPath
			});

			log.debug(`Local file read: ${basename(resolvedPath)} (${content.length} chars)`);
		}

		// 2. Encode media files as base64 content parts
		this._mediaContentBlocks = [];
		for (const filePath of this.mediaFiles) {
			const resolvedPath = resolve(filePath);
			const ext = extname(resolvedPath).toLowerCase();
			const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

			log.debug(`Encoding media file: ${resolvedPath} (${mimeType})`);

			const buffer = await readFile(resolvedPath);
			const base64 = buffer.toString('base64');

			// Gate on what the model can actually read. Sending a PDF to a model
			// without `supports_pdf_input` is a provider 400 after the upload
			// cost — cheaper and clearer to skip it here and say why.
			const cap = getCapabilities(this.modelName);
			if (mimeType.startsWith('image/') && !cap.vision) {
				log.warn(
					`RagAgent: "${basename(resolvedPath)}" skipped — '${this.modelName}' ` +
					`cannot read images. Use a vision model such as claude-sonnet-5 or gemini-3.8-flash.`
				);
			} else if (mimeType === 'application/pdf' && !cap.pdf) {
				log.warn(
					`RagAgent: "${basename(resolvedPath)}" skipped — '${this.modelName}' ` +
					`cannot read PDFs. Convert it to text, or use a model with PDF input.`
				);
			} else if (mimeType.startsWith('image/')) {
				this._mediaContentBlocks.push({
					type: 'image_url',
					image_url: { url: `data:${mimeType};base64,${base64}` }
				});
			} else if (mimeType === 'application/pdf') {
				this._mediaContentBlocks.push({
					type: 'file',
					file: {
						filename: basename(resolvedPath),
						file_data: `data:${mimeType};base64,${base64}`
					}
				});
			} else {
				log.warn(`RagAgent: "${basename(resolvedPath)}" (${mimeType}) is not an image or PDF — skipped. /v1/chat/completions carries images and PDFs only.`);
			}
		}

		// 3. Build unified context and seed into history
		/** @type {any[]} */
		const contentParts = [];

		for (const block of this._mediaContentBlocks) contentParts.push(block);

		for (const lf of this._localFileContents) {
			contentParts.push({ type: 'text', text: `--- File: ${lf.name} ---\n${lf.content}` });
		}

		for (const ld of this.localData) {
			const serialized = typeof ld.data === 'string' ? ld.data : JSON.stringify(ld.data, null, 2);
			contentParts.push({ type: 'text', text: `--- Data: ${ld.name} ---\n${serialized}` });
		}

		if (contentParts.length > 0) {
			contentParts.push({ type: 'text', text: 'Here are the documents and data to analyze.' });

			// The document block is the largest fixed prefix in the whole package
			// and it is resent on every question, so caching it is where RagAgent
			// saves the most. `cache_control` goes on the LAST part: Anthropic
			// caches everything up to and including the marked block.
			const cacheableText = contentParts
				.filter(p => p.type === 'text')
				.map(p => p.text).join('');
			if (this._shouldCache(this.cacheContext, cacheableText)) {
				contentParts[contentParts.length - 1] = {
					...contentParts[contentParts.length - 1],
					cache_control: { type: 'ephemeral', ttl: this.cacheTtl }
				};
			}

			this.history = [
				{ role: 'user', content: contentParts },
				{ role: 'assistant', content: 'I have reviewed all the provided documents and data. I am ready to answer your questions about them.' }
			];
		}

		this._initialized = true;
		log.debug(`RagAgent initialized with ${this._localFileContents.length} local files, ${this.localData.length} data entries, ${this._mediaContentBlocks.length} media files`);
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

		/** @type {any} */
		const result = {
			text: this._extractText(response),
			usage: this.getLastUsage()
		};

		// Empty, not absent: code ported from ak-claude iterates result.citations.
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
		this._streamUsage(assembled);

		yield { type: 'done', fullText, usage: this.getLastUsage() };
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
			'remoteFiles',
			'ak-litellm: `remoteFiles` is accepted but the Google Files API does not ' +
			'exist behind this gateway. The paths are read from disk and inlined as ' +
			'base64, the same as `mediaFiles`. Images and PDFs work; audio and video ' +
			'are skipped.',
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
			localFiles: this._localFileContents.map(lf => ({
				name: lf.name,
				path: lf.path,
				size: lf.content.length
			})),
			localData: this.localData.map(ld => ({
				name: ld.name,
				type: typeof ld.data === 'object' && ld.data !== null
					? (Array.isArray(ld.data) ? 'array' : 'object')
					: typeof ld.data
			})),
			mediaFiles: this.mediaFiles.map(f => ({
				path: resolve(f),
				name: basename(f),
				ext: extname(f).toLowerCase()
			}))
		};
	}
}

export default RagAgent;
