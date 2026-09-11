#!/usr/bin/env node
/**
 * 04 — Answer questions about your own documents and data.
 *
 * `RagAgent` injects context directly rather than doing vector retrieval. With
 * a 1M-token window that covers most app-sized corpora, and there is no index
 * to build or keep in sync.
 *
 * Inputs: `localFiles` (text from disk), `localData` (in-memory objects),
 * `mediaFiles` (images and PDFs, base64).
 *
 * The document block is cached automatically ONCE it is big enough — over
 * ~1,024 tokens, on a caching model. The toy corpus below is far under that, so
 * `cacheReadTokens` prints 0 here. Point `localFiles` at real documents and it
 * engages on its own. See 06 for the effect.
 *
 * Run:  node 04-answer-over-docs.mjs    Cost: ~$0.0015
 */
import { RagAgent } from 'ak-litellm';

const agent = new RagAgent({
	maxTokens: 400,
	localData: [
		{ name: 'inventory', data: { widgets: 42, gadgets: 7, sprockets: 0 } },
		{
			name: 'restock-policy',
			data: 'Reorder any item below 10 units. Items at 0 are urgent and page the on-call.'
		}
	]
});

for (const q of [
	'How many widgets are in stock?',
	'Which items need reordering, and which are urgent?'
]) {
	const { text, usage } = await agent.chat(q);
	console.log(`\nQ: ${q}\nA: ${text.trim()}`);
	// 0 here: this corpus is too small to cache. Real documents are not.
	console.log(`   ($${usage.estimatedCost?.toFixed(6)}, cache read ${usage.cacheReadTokens} tokens)`);
}
console.log();
