#!/usr/bin/env node
/**
 * 07 — Current information, from any vendor, with one option.
 *
 * `enableWebSearch: true` (or ak-gemini's `enableGrounding: true`) works on all
 * three vendors. The wrapper picks the right shape and route:
 *
 *   claude-*   Anthropic `web_search_20250305` server tool  (chat completions)
 *   gemini-*   `{ googleSearch: {} }`                       (chat completions)
 *   gpt-*      `{ type: 'web_search' }`                     (/v1/responses)
 *
 * That last one matters: OpenAI web search does not exist on chat completions
 * at all, so the wrapper switches transport for you.
 *
 * Searches are billed BY THE PROVIDER, separately from tokens, and that charge
 * is NOT in `estimatedCost`. `usage.webSearchRequests` is your warning light.
 *
 * Run:  node 07-web-search.mjs       Cost: ~$0.10 (searches are not cheap)
 */
import { Chat, webSearchStyle } from 'ak-litellm';

const QUESTION = 'Who won the 2026 FIFA World Cup? One sentence.';

for (const modelName of ['claude-sonnet-5', 'gemini-3.8-flash', 'gpt-5.5']) {
	const chat = new Chat({
		modelName,
		enableWebSearch: true,
		// Give a grounded call room. It spends reasoning tokens before any text;
		// a low cap returns empty content. The wrapper raises anything under 1024.
		maxTokens: 1024,
		logLevel: 'error'
	});

	const { text, usage } = await chat.send(QUESTION);
	console.log(`\n${modelName}  (shape: ${webSearchStyle(modelName)})`);
	console.log(`  ${text.trim().replace(/\s+/g, ' ').slice(0, 120)}`);
	console.log(`  searches: ${usage.webSearchRequests ?? 0}   tokens: $${usage.estimatedCost?.toFixed(5)}`);
}

console.log('\nNote: Anthropic does not report a search count, so it shows 0.');
console.log('Search fees are extra and are not included in estimatedCost.\n');
