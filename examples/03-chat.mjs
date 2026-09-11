#!/usr/bin/env node
/**
 * 03 — A conversation that remembers, then the same thing streamed.
 *
 * `Chat` keeps history for you. Every send carries the whole thread, which is
 * exactly the case prompt caching pays for — see 06.
 *
 * Run:  node 03-chat.mjs             Cost: ~$0.0006
 */
import { Chat } from 'ak-litellm';

const chat = new Chat({
	systemPrompt: 'You are terse. One short sentence per answer.',
	maxTokens: 200
});

console.log('\nQ: What is the capital of France?');
console.log('A:', (await chat.send('What is the capital of France?')).text.trim());

console.log('\nQ: And Japan?           <- no repeated context needed');
console.log('A:', (await chat.send('And Japan?')).text.trim());

process.stdout.write('\nQ: And Brazil? (streamed)\nA: ');
for await (const ev of chat.stream('And Brazil?')) {
	if (ev.type === 'text') process.stdout.write(ev.text);
	if (ev.type === 'done') {
		// Streamed calls have no gateway cost header, so costSource is 'estimated'.
		console.log(`\n\n${chat.getHistory().length} messages in history`);
		console.log(`cost $${ev.usage.estimatedCost?.toFixed(6)} (${ev.usage.costSource})\n`);
	}
}
