#!/usr/bin/env node
/**
 * Regenerates the MODEL_PRICING_AS_OF / MODEL_PRICING / MODEL_INFO block in
 * models.js from a live `GET /model/info` on the LiteLLM gateway.
 *
 *   npm run refresh-pricing
 *
 * The table is NEVER hand-written. Run this, eyeball the diff, commit it.
 */

import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildTablesFromModelInfo } from '../models.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODELS_JS = join(HERE, '..', 'models.js');

const BEGIN = '// BEGIN GENERATED — scripts/refresh-pricing.mjs';
const END = '// END GENERATED';

const apiKey = process.env.LITELLM_API_KEY;
const baseURL = (process.env.LITELLM_BASE_URL || 'https://litellm.mixpanel.org')
	.replace(/\/v1\/?$/, '')
	.replace(/\/$/, '');

if (!apiKey) {
	console.error('refresh-pricing: LITELLM_API_KEY is not set. Put it in .env.');
	process.exit(1);
}

const res = await fetch(`${baseURL}/model/info`, { headers: { Authorization: `Bearer ${apiKey}` } });
if (!res.ok) {
	console.error(`refresh-pricing: GET ${baseURL}/model/info -> ${res.status}`);
	console.error(await res.text());
	process.exit(1);
}

const body = await res.json();
const { pricing, info } = buildTablesFromModelInfo(body);
const asOf = new Date().toISOString().slice(0, 10);

const count = Object.keys(info).length;
if (count === 0) {
	console.error('refresh-pricing: /model/info returned no models — refusing to write an empty table.');
	process.exit(1);
}

/** Emits an object literal with one model per line, tab-indented to match the file. */
function emitTable(name, jsdoc, table) {
	const lines = Object.entries(table).map(([id, value]) => `\t'${id}': ${JSON.stringify(value)}`);
	return `${jsdoc}\nexport const ${name} = {\n${lines.join(',\n')}\n};`;
}

const generated = [
	`/** ISO date the tables below were generated from \`GET /model/info\` on ${baseURL}. */`,
	`export const MODEL_PRICING_AS_OF = '${asOf}';`,
	'',
	emitTable(
		'MODEL_PRICING',
		'/** @type {Record<string, ModelPricing>} Per-MILLION-token USD rates, read from the gateway. */',
		pricing
	),
	'',
	emitTable(
		'MODEL_INFO',
		'/** @type {Record<string, ModelInfo>} Capability + Mixpanel lifecycle metadata, read from the gateway. */',
		info
	)
].join('\n');

const src = await readFile(MODELS_JS, 'utf-8');
const beginAt = src.indexOf(BEGIN);
const endAt = src.indexOf(END);
if (beginAt === -1 || endAt === -1) {
	console.error('refresh-pricing: could not find the generated-block markers in models.js');
	process.exit(1);
}

// Keep the marker lines and the rule lines that bracket them.
const head = src.slice(0, beginAt + BEGIN.length);
const tailFrom = src.lastIndexOf('// ───', endAt);
const tail = src.slice(tailFrom);

const next = `${head}\n// ─────────────────────────────────────────────────────────────────────────────\n\n${generated}\n\n${tail}`;

await writeFile(MODELS_JS, next, 'utf-8');

console.log(`refresh-pricing: wrote ${count} models to models.js`);
console.log(`  MODEL_PRICING_AS_OF = ${asOf}`);
console.log(`  priced: ${Object.keys(pricing).length}/${count}`);
for (const [id, p] of Object.entries(pricing)) {
	console.log(`  ${id.padEnd(20)} $${p.input}/$${p.output} per M` + (p.cachedInput != null ? ` (cached $${p.cachedInput})` : ''));
}
