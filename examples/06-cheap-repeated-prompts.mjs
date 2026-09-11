#!/usr/bin/env node
/**
 * 06 — The same big prompt, ten times cheaper.
 *
 * Prompt caching is ON by default. You do not opt in; you just need a system
 * prompt over ~1,024 tokens and one of the four models that support it.
 *
 * Measured 2026-09-11 on this gateway:
 *
 *   claude-fable-5-1   29.2x cheaper on a repeat
 *   claude-sonnet-5    10.7x
 *   claude-opus-5      10.7x
 *   claude-opus-4-7    10.6x
 *   claude-haiku-4-5   1.0x   <- does NOT cache, despite the gateway saying it does
 *   gemini-*, gpt-*    1.0x   <- do not cache
 *
 * On a non-caching model this is a silent no-op: no warning, no error, no
 * change in behaviour. Nothing to guard in your own code.
 *
 * Run:  node 06-cheap-repeated-prompts.mjs    Cost: ~$0.02
 */
import { Chat, supportsPromptCaching, CACHE_CAPABLE_MODELS } from 'ak-litellm';

// A realistic fixed prefix: the style guide / schema / policy your app resends
// on every single call. This one is ~4,800 tokens.
const SYSTEM = 'You are a support agent for Acme. Policy: be terse, never promise a refund without checking, escalate anything about billing. '.repeat(120);

console.log('\nmodels that actually cache:', CACHE_CAPABLE_MODELS.join(', '));

for (const modelName of ['claude-sonnet-5', 'claude-haiku-4-5']) {
	console.log(`\n${modelName}  (caches: ${supportsPromptCaching(modelName)})`);
	const tag = ` [run-${Date.now()}]`;   // unique, so each run starts cold
	const mk = () => new Chat({ modelName, systemPrompt: SYSTEM + tag, maxTokens: 64, logLevel: 'error' });

	const first = await mk().send('Say ok.');
	await new Promise(r => setTimeout(r, 3000));    // let the cache settle
	const second = await mk().send('Say ok.');

	const ratio = first.usage.estimatedCost / second.usage.estimatedCost;
	console.log(`  call 1  $${first.usage.estimatedCost?.toFixed(6)}  (wrote ${first.usage.cacheCreationTokens} cache tokens)`);
	console.log(`  call 2  $${second.usage.estimatedCost?.toFixed(6)}  (read  ${second.usage.cacheReadTokens} cache tokens)`);
	console.log(`  ${ratio.toFixed(1)}x cheaper`);
}

console.log('\nTo opt out:  new Chat({ cacheSystemPrompt: false })');
console.log('For a prefix reused over 5 minutes:  new Chat({ cacheTtl: \'1h\' })\n');
