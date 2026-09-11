#!/usr/bin/env node
/**
 * 01 — Summarize some text.
 *
 * The smallest useful call in the package. `Message` is stateless: no history,
 * safe to call concurrently, one object per request.
 *
 * Run:  node 01-summarize.mjs        Cost: ~$0.0002
 */
import { Message } from 'ak-litellm';

const ARTICLE = `
Product analytics tools let teams see how people actually use a product.
They track events, group them into funnels, and show where users drop off.
Teams use that to decide what to build next, and to check whether a change
they shipped moved the numbers they cared about.
`;

const summarizer = new Message({
	// Omit modelName and you get claude-sonnet-5.
	systemPrompt: 'You summarize text in exactly one sentence. No preamble.',
	maxTokens: 200
});

const { text, usage } = await summarizer.send(ARTICLE);

console.log('\nSummary:', text.trim());
console.log(`\ncost $${usage.estimatedCost?.toFixed(6)} (${usage.costSource}), ${usage.totalTokens} tokens\n`);
