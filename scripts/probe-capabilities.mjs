#!/usr/bin/env node
/**
 * Re-derives what the gateway can actually do, and diffs it against what this
 * package believes.
 *
 *   npm run probe-capabilities            # roster + routes, free
 *   npm run probe-capabilities -- --paid  # also re-measures caching and prefill
 *
 * Why this exists: the gateway's own `/model/info` flags are wrong about two
 * things that matter — `supports_prompt_caching` and `supports_web_search` —
 * so `capabilities.js` carries measured lists instead. Measured lists go stale.
 * This script is how you find out, instead of discovering it in production.
 *
 * The free pass costs nothing and catches the common case (models added or
 * withdrawn). The `--paid` pass sends a handful of small requests; a full run
 * is a few cents.
 */

import 'dotenv/config';
import {
	CACHE_CAPABLE_MODELS,
	PREFILL_MODES,
	webSearchStyle
} from '../capabilities.js';
import { MODEL_PRICING, MODEL_PRICING_AS_OF, listModels } from '../models.js';

const PAID = process.argv.includes('--paid');
const KEY = process.env.LITELLM_API_KEY;
const BASE = (process.env.LITELLM_BASE_URL || 'https://litellm.mixpanel.org')
	.replace(/\/v1\/?$/, '').replace(/\/$/, '');

if (!KEY) {
	console.error('probe-capabilities: LITELLM_API_KEY is not set. Put it in .env.');
	process.exit(1);
}

const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
let drift = 0;

/** @param {string} label @param {boolean} ok @param {string} [detail] */
function report(label, ok, detail = '') {
	if (!ok) drift++;
	console.log(`  ${ok ? '✓' : '✗ DRIFT'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

// ── 1. Roster ────────────────────────────────────────────────────────────────
console.log(`\nak-litellm capability probe — ${BASE}`);
console.log(`snapshot stamped ${MODEL_PRICING_AS_OF}\n`);
console.log('ROSTER');

const infoRes = await fetch(`${BASE}/model/info`, { headers: H });
if (!infoRes.ok) {
	console.error(`  GET /model/info -> ${infoRes.status}`);
	process.exit(1);
}
const live = (await infoRes.json()).data;
const liveIds = live.map((/** @type {any} */ m) => m.model_name);
const tableIds = Object.keys(MODEL_PRICING);

const gone = tableIds.filter(id => !liveIds.includes(id));
const added = liveIds.filter((/** @type {string} */ id) => !tableIds.includes(id));
report('every priced model is still served', gone.length === 0, gone.join(', '));
report('every served model is priced', added.length === 0, added.join(', '));
if (gone.length || added.length) console.log('     fix: npm run refresh-pricing');

// ── 2. Routes ────────────────────────────────────────────────────────────────
console.log('\nROUTES');

// Every one of these routes EXISTS on a stock LiteLLM deployment, so probing for
// 404 proves nothing. What matters is whether a real request can complete:
// embeddings and images need a model of that mode to be configured, and batch
// needs file upload to be switched on. Probe the useful thing, not the route.

const responses = await fetch(`${BASE}/v1/responses`, {
	method: 'POST', headers: H,
	body: JSON.stringify({ model: 'gpt-5.5', input: 'say ok', max_output_tokens: 16 })
});
report('/v1/responses completes a real call', responses.ok, `HTTP ${responses.status}`);

for (const [route, body] of [
	['/v1/embeddings', { model: liveIds[2], input: 'hello' }],
	['/v1/images/generations', { model: liveIds[2], prompt: 'a cat' }]
]) {
	const r = await fetch(`${BASE}${route}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
	const txt = (await r.text()).slice(0, 400);
	// A configured deployment would 200. "not found" / "no deployments" means no
	// model of that mode exists, which is the state we expect and document.
	const stillUnavailable = !r.ok && /not found|no deployments|NotFoundError/i.test(txt);
	report(`${route} still has no model configured`, stillUnavailable,
		stillUnavailable ? 'unchanged' : `HTTP ${r.status} — A MODEL MAY NOW EXIST`);
}

// The blocker is the UPLOAD, not the listing. GET /v1/files returns an empty
// list quite happily; only POST reveals `files_settings is not set`.
// Must be VALID batch JSONL. A malformed body is rejected on shape before the
// gateway ever reaches its files_settings check, which reads as a false all-clear.
const jsonl = JSON.stringify({
	custom_id: 'probe-1', method: 'POST', url: '/v1/chat/completions',
	body: { model: liveIds[3], max_tokens: 8, messages: [{ role: 'user', content: 'hi' }] }
});
const fd = new FormData();
fd.append('purpose', 'batch');
fd.append('file', new Blob([jsonl], { type: 'application/jsonl' }), 'probe.jsonl');
const upload = await fetch(`${BASE}/v1/files`, { method: 'POST', headers: { Authorization: H.Authorization }, body: fd });
const uploadTxt = (await upload.text()).slice(0, 300);
const batchBlocked = /files_settings/.test(uploadTxt);
report('batch still blocked (files_settings unset)', batchBlocked,
	batchBlocked ? 'unchanged — BatchTransformer stays a stub' : `HTTP ${upload.status} — FILES MAY NOW WORK, batch is buildable`);

// ── 3. Gateway flags we deliberately distrust ────────────────────────────────
console.log('\nFLAGS WE OVERRIDE');
const flagCaching = live
	.filter((/** @type {any} */ m) => m.model_info?.supports_prompt_caching)
	.map((/** @type {any} */ m) => m.model_name);
const overreported = flagCaching.filter((/** @type {string} */ id) => !CACHE_CAPABLE_MODELS.includes(id));
console.log(`  supports_prompt_caching claims ${flagCaching.length} models; we trust ${CACHE_CAPABLE_MODELS.length}`);
console.log(`  over-reported: ${overreported.join(', ') || '(none)'}`);
console.log('  (this is expected — the flag is wrong; --paid re-measures it)');

// ── 4. Paid measurements ─────────────────────────────────────────────────────
if (!PAID) {
	console.log('\nSkipping paid measurements. Re-run with --paid to re-measure caching and prefill.');
} else {
	console.log('\nPROMPT CACHING (paid)');
	const BIG = 'Mixpanel is a product analytics platform used by engineering and product teams. '.repeat(200);
	for (const id of liveIds) {
		if (webSearchStyle(id) !== 'anthropic') continue;   // only Anthropic has cache_control
		const body = (tag) => ({
			model: id, max_tokens: 16,
			messages: [
				{ role: 'system', content: [{ type: 'text', text: BIG + tag, cache_control: { type: 'ephemeral' } }] },
				{ role: 'user', content: 'ok?' }
			]
		});
		const tag = ` [probe-${Date.now()}]`;
		try {
			await fetch(`${BASE}/v1/chat/completions`, { method: 'POST', headers: H, body: JSON.stringify(body(tag)) });
			await new Promise(r => setTimeout(r, 2500));
			const r2 = await fetch(`${BASE}/v1/chat/completions`, { method: 'POST', headers: H, body: JSON.stringify(body(tag)) });
			const j2 = await r2.json();
			const cached = j2.usage?.prompt_tokens_details?.cached_tokens || 0;
			const measured = cached > 0;
			report(`${id} caching`, measured === CACHE_CAPABLE_MODELS.includes(id),
				`measured ${measured ? 'YES' : 'no'}, table says ${CACHE_CAPABLE_MODELS.includes(id) ? 'YES' : 'no'}`);
		} catch (e) {
			report(`${id} caching`, false, `probe failed: ${String(e.message).slice(0, 60)}`);
		}
	}

	console.log('\nASSISTANT PREFILL (paid)');
	for (const id of liveIds) {
		const expected = PREFILL_MODES[id] ?? '(unlisted)';
		try {
			const r = await fetch(`${BASE}/v1/chat/completions`, {
				method: 'POST', headers: H,
				body: JSON.stringify({
					model: id, max_tokens: 2048, messages: [
						{ role: 'user', content: 'List exactly two primary colors as a JSON array of strings. JSON only.' },
						{ role: 'assistant', content: '["red",' }
					]
				})
			});
			let actual;
			if (!r.ok) actual = 'reject';
			else {
				const c = String((await r.json()).choices?.[0]?.message?.content ?? '');
				actual = /red/i.test(c) ? 'restart' : 'continue';
			}
			report(`${id} prefill`, actual === expected, `measured ${actual}, table says ${expected}`);
		} catch (e) {
			report(`${id} prefill`, false, `probe failed: ${String(e.message).slice(0, 60)}`);
		}
		await new Promise(r => setTimeout(r, 1000));
	}
}

// ── 5. Verdict ───────────────────────────────────────────────────────────────
console.log(
	drift === 0
		? '\nNo drift. capabilities.js and models.js match the gateway.\n'
		: `\n${drift} item(s) drifted. Update capabilities.js / run refresh-pricing.\n`
);
process.exit(drift === 0 ? 0 : 1);
