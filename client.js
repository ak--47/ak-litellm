/**
 * @fileoverview Transport layer for the Mixpanel LiteLLM gateway.
 *
 * One endpoint, `POST /v1/chat/completions`, for all 21 models (design D1).
 * The `openai` npm SDK is the HTTP client (D2) — it brings SSE parsing, retry
 * with backoff, timeouts, and `.withResponse()`, which is how we read the
 * `x-litellm-response-cost` header the whole cost model depends on.
 */

import 'dotenv/config';
import OpenAI from 'openai';
import log from './logger.js';

/** Public gateway root. Override with the `baseURL` option or LITELLM_BASE_URL. */
export const DEFAULT_BASE_URL = 'https://litellm.mixpanel.org';

/** Reasoning models on this gateway are slow — a web-search call took ~40 s. */
export const DEFAULT_TIMEOUT_MS = 600_000;

/** Matches ak-claude's SDK-level retry count. */
export const DEFAULT_MAX_RETRIES = 5;

/**
 * @param {string} [opt] explicit `apiKey` option
 * @returns {string}
 * @throws when no key is configured
 */
export function resolveApiKey(opt) {
	const key = opt ?? process.env.LITELLM_API_KEY;
	if (!key) throw new Error(
		'ak-litellm: no API key. Pass `apiKey` or set LITELLM_API_KEY in your ' +
		'environment or .env file.'
	);
	return key;
}

/**
 * Normalizes a gateway root to the `/v1` base the OpenAI SDK expects.
 * Accepts a URL that already ends in `/v1`, with or without a trailing slash.
 *
 * @param {string} [opt] explicit `baseURL` option
 * @returns {string}
 */
export function resolveBaseURL(opt) {
	const raw = opt ?? process.env.LITELLM_BASE_URL ?? DEFAULT_BASE_URL;
	const trimmed = raw.replace(/\/+$/, '');
	return /\/v1$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

/**
 * The gateway root without `/v1`, for the admin routes (`/model/info`).
 *
 * @param {string} [opt]
 * @returns {string}
 */
export function resolveAdminURL(opt) {
	return resolveBaseURL(opt).replace(/\/v1$/, '');
}

/**
 * Builds the OpenAI SDK client pointed at the gateway.
 *
 * @param {{ apiKey?: string, baseURL?: string, maxRetries?: number, timeout?: number }} [opts]
 * @returns {OpenAI}
 */
export function createClient(opts = {}) {
	const baseURL = resolveBaseURL(opts.baseURL);
	log.debug(`ak-litellm: client -> ${baseURL}`);

	return new OpenAI({
		apiKey: resolveApiKey(opts.apiKey),
		baseURL,
		maxRetries: opts.maxRetries ?? DEFAULT_MAX_RETRIES,
		timeout: opts.timeout ?? DEFAULT_TIMEOUT_MS
	});
}

/**
 * Headers the gateway attaches to a NON-streaming response. On a stream they
 * flush before token counts exist: `x-litellm-response-cost` is absent and the
 * `-input`/`-output` variants read `0.0` (verified 2026-09-08). That asymmetry
 * is why `costSource` exists.
 *
 * @typedef {Object} GatewayHeaders
 * @property {number | null} responseCost  exact USD for the call, gateway-authoritative
 * @property {string | null} callId
 * @property {string | null} upstreamModel e.g. 'vertex_ai/claude-haiku-4-5'
 * @property {string | null} modelGroup
 * @property {number | null} keySpend      cumulative USD on this key
 * @property {number | null} durationMs
 * @property {number | null} attemptedRetries   gateway-side retries the client cannot see
 * @property {number | null} attemptedFallbacks
 * @property {string | null} version
 */

/**
 * Reads the `x-litellm-*` headers off a fetch Response.
 *
 * @param {{ headers?: { get(name: string): string | null } } | null | undefined} response
 * @returns {GatewayHeaders}
 */
export function parseGatewayHeaders(response) {
	/** @param {string} name */
	const get = (name) => {
		try { return response?.headers?.get(name) ?? null; }
		catch { return null; }
	};
	/** @param {string} name */
	const num = (name) => {
		const raw = get(name);
		if (raw === null || raw === '') return null;
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	};

	const headers = {
		responseCost: num('x-litellm-response-cost'),
		callId: get('x-litellm-call-id'),
		upstreamModel: get('x-litellm-model-name'),
		modelGroup: get('x-litellm-model-group'),
		keySpend: num('x-litellm-key-spend'),
		durationMs: num('x-litellm-response-duration-ms'),
		attemptedRetries: num('x-litellm-attempted-retries'),
		attemptedFallbacks: num('x-litellm-attempted-fallbacks'),
		version: get('x-litellm-version')
	};

	if (headers.attemptedRetries || headers.attemptedFallbacks) {
		log.debug(
			`ak-litellm: gateway retried ${headers.attemptedRetries} time(s), ` +
			`fell back ${headers.attemptedFallbacks} time(s) [call ${headers.callId}]`
		);
	}

	return headers;
}

/**
 * Translates a gateway error into a message the caller can act on.
 *
 * The spec's mapping (§10.1): a bad key and a bad model name are permanent and
 * must surface immediately; an `UnsupportedParamsError` is a bug in THIS
 * wrapper's parameter gating (compat.js §6.5 exists to prevent it) and must say
 * so. 429 and 5xx are already retried by the SDK before they reach here.
 *
 * Never swallows. Never falls back to another model.
 *
 * @param {any} err
 * @param {{ model?: string }} [ctx]
 * @returns {Error}
 */
export function mapGatewayError(err, ctx = {}) {
	const status = err?.status ?? err?.response?.status ?? null;
	const raw = err?.error?.message ?? err?.message ?? String(err);
	const text = typeof raw === 'string' ? raw : JSON.stringify(raw);

	if (status === 401 || /token_not_found_in_db|Invalid proxy server token/i.test(text)) {
		const e = new Error(
			'ak-litellm: the gateway rejected the API key (401). LITELLM_API_KEY is ' +
			`missing, wrong, or revoked. Gateway said: ${text}`
		);
		// @ts-ignore - preserve the original for callers that inspect it
		e.cause = err;
		return e;
	}

	if (/Invalid model name/i.test(text)) {
		const e = new Error(
			`ak-litellm: the gateway does not serve model '${ctx.model ?? 'unknown'}'. ` +
			`Gateway said: ${text}`
		);
		// @ts-ignore
		e.cause = err;
		return e;
	}

	if (/thinking\.budget_tokens/i.test(text)) {
		const e = new Error(
			'ak-litellm: `maxTokens` is too small for the reasoning budget the gateway ' +
			`derived from \`effort\` on model '${ctx.model ?? 'unknown'}'. Raise \`maxTokens\` ` +
			'(the gateway reserves the reasoning budget out of it) or drop `effort`. ' +
			`Gateway said: ${text}`
		);
		// @ts-ignore
		e.cause = err;
		return e;
	}

	if (/UnsupportedParamsError/i.test(text)) {
		const e = new Error(
			'ak-litellm: the gateway rejected a request parameter it does not support ' +
			`for model '${ctx.model ?? 'unknown'}'. This is an ak-litellm bug — the ` +
			'compatibility layer should have gated this parameter out. Please report it. ' +
			`Gateway said: ${text}`
		);
		// @ts-ignore
		e.cause = err;
		return e;
	}

	return err instanceof Error ? err : new Error(text);
}

/**
 * `GET /v1/models` connectivity + model-existence check. Used by `init()` when
 * `healthCheck: true`.
 *
 * @param {OpenAI} client
 * @param {string} modelName post-alias model id
 * @returns {Promise<string[]>} the ids the gateway reports
 */
export async function healthCheck(client, modelName) {
	let ids;
	try {
		const list = await client.models.list();
		ids = (list?.data || []).map(m => m.id);
	}
	catch (err) {
		throw mapGatewayError(err, { model: modelName });
	}

	if (modelName && !ids.includes(modelName)) {
		throw new Error(
			`ak-litellm: health check failed — the gateway does not serve model ` +
			`'${modelName}'. Available: ${ids.sort().join(', ')}`
		);
	}

	log.debug(`ak-litellm: health check ok — ${ids.length} models, '${modelName}' present`);
	return ids;
}
