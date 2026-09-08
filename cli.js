#!/usr/bin/env node
/**
 * CLI for ak-litellm — streams a gateway response to stdout.
 *
 * Usage: node ak-litellm/cli.js "your prompt here"
 *        MODEL=gemini-3.8-flash node ak-litellm/cli.js "prompt"
 *        node ak-litellm/cli.js --models
 */

import Chat from './chat.js';
import { listModels, getModelInfo, resolvePricing, MODEL_PRICING_AS_OF, DEFAULT_MODEL } from './models.js';

// Silence SDK console.debug noise
console.debug = () => {};

const argv = process.argv.slice(2);

if (argv[0] === '--models' || argv[0] === '-m') {
	const ids = listModels({ includeIntegration: true });
	console.log(`${ids.length} models (pricing as of ${MODEL_PRICING_AS_OF}):\n`);
	for (const id of ids) {
		const info = getModelInfo(id);
		const price = resolvePricing(id);
		const rate = price ? `$${price.input}/$${price.output} per 1M` : 'pricing unknown';
		const flags = [
			info?.supportsReasoning ? 'reasoning' : null,
			info?.supportsVision ? 'vision' : null,
			info?.supportsFunctionCalling ? 'tools' : null
		].filter(Boolean).join(', ');
		console.log(`  ${id.padEnd(26)} ${rate.padEnd(24)} ${flags}`);
	}
	process.exit(0);
}

const prompt = argv.join(' ');

if (!prompt || prompt === '-h' || prompt === '--help') {
	console.log('Usage: node ak-litellm/cli.js "your prompt"');
	console.log('  --models          list the models this gateway serves');
	console.log(`  MODEL             override the default model (${DEFAULT_MODEL})`);
	console.log('  EFFORT            reasoning depth: minimal|low|medium|high|xhigh|max');
	console.log('  WEB_SEARCH=1      enable web search (claude-* models only)');
	console.log('  LITELLM_API_KEY   gateway key (required)');
	console.log('  LITELLM_BASE_URL  gateway URL');
	process.exit(prompt ? 0 : 1);
}

try {
	const chat = new Chat({
		modelName: process.env.MODEL || DEFAULT_MODEL,
		...(process.env.EFFORT && { effort: /** @type {any} */ (process.env.EFFORT) }),
		...(process.env.WEB_SEARCH === '1' && { enableWebSearch: true }),
		systemPrompt: 'Respond in plain text only. Do not use markdown formatting (no bold, italic, headers, bullet points, code fences, etc.).',
		logLevel: 'none'
	});

	for await (const event of chat.stream(prompt)) {
		if (event.type === 'text' && event.text) process.stdout.write(event.text);
	}
	process.stdout.write('\n');
} catch (err) {
	console.error(`❌ ${err.message}`);
	process.exit(1);
}
