#!/usr/bin/env node
/**
 * DROP-IN PROOF — ak-claude → ak-litellm.
 *
 * Everything below this header is ordinary ak-claude application code: option
 * names, tool shapes, and result fields are exactly what an ak-claude app uses.
 * The ONLY edit needed to move it onto the Mixpanel LiteLLM gateway is the one
 * import line marked below.
 *
 *   Original:  import { Chat, ToolAgent, Transformer } from 'ak-claude';
 *   Swapped:   import { Chat, ToolAgent, Transformer } from 'ak-litellm';
 *
 * Run it:  node ak-litellm/scratch-dropin-claude.mjs
 * Costs a fraction of a cent — claude-haiku-4-5 with low token caps.
 */

// ── THE ONLY LINE THAT CHANGED ───────────────────────────────────────────────
// import { Chat, ToolAgent, Transformer } from 'ak-claude';
import { Chat, ToolAgent, Transformer } from 'ak-litellm';
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5';

/** @param {string} label */
function ok(label, detail) {
	console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

console.log('\nak-claude → ak-litellm drop-in proof\n');

// ── Chat: ak-claude option names, ak-claude result shape ─────────────────────
console.log('Chat');
{
	const chat = new Chat({
		modelName: MODEL,
		systemPrompt: 'You are terse. Answer in one short sentence.',
		maxTokens: 128,
		temperature: 0.2,
		maxRetries: 3,
		// ak-claude-only options. They are accepted, warned about once, and ignored.
		cacheSystemPrompt: true,
		vertexai: true,
		vertexProjectId: 'mixpanel-gtm-training',
		vertexRegion: 'global',
		logLevel: 'error'
	});

	const first = await chat.send('What is the capital of France?');
	if (!first.text) throw new Error('Chat.send returned no text');
	ok('send()', JSON.stringify(first.text.slice(0, 60)));

	const second = await chat.send('And of Japan?');
	if (!second.text) throw new Error('Chat.send returned no text on turn 2');
	ok('multi-turn history', `${chat.getHistory().length} messages`);

	const usage = chat.getLastUsage();
	if (usage.promptTokens <= 0) throw new Error('usage.promptTokens is not populated');
	ok('getLastUsage()', `${usage.totalTokens} tokens, $${usage.estimatedCost} (${usage.costSource})`);

	let streamed = '';
	for await (const event of chat.stream('And of Brazil?')) {
		if (event.type === 'text') streamed += event.text;
		if (event.type === 'done' && !event.usage) throw new Error('stream done event carried no usage');
	}
	if (!streamed) throw new Error('stream produced no text');
	ok('stream()', JSON.stringify(streamed.slice(0, 60)));

	const estimate = await chat.estimate('a payload to size up');
	if (!(estimate.inputTokens > 0)) throw new Error('estimate() returned nothing');
	ok('estimate()', `${estimate.inputTokens} tokens`);

	await chat.clearHistory();
	ok('clearHistory()', `${chat.getHistory().length} messages`);
}

// ── ToolAgent: ak-claude input_schema + tool_choice shapes ───────────────────
console.log('\nToolAgent');
{
	const agent = new ToolAgent({
		modelName: MODEL,
		maxTokens: 512,
		systemPrompt: 'Use the tools you are given.',
		logLevel: 'error',
		toolChoice: { type: 'auto' },          // ak-claude object form
		disableParallelToolUse: false,
		tools: [
			{
				name: 'get_stock_price',
				description: 'Get the current share price for a ticker symbol.',
				input_schema: {                      // ak-claude schema key
					type: 'object',
					properties: { ticker: { type: 'string', description: 'e.g. MXP' } },
					required: ['ticker']
				}
			},
			{
				name: 'get_headcount',
				description: 'Get the employee headcount for a company.',
				input_schema: {
					type: 'object',
					properties: { company: { type: 'string' } },
					required: ['company']
				}
			}
		],
		toolExecutor: async (name, args) => {
			if (name === 'get_stock_price') return { ticker: args.ticker, price: 123.45 };
			if (name === 'get_headcount') return { company: args.company, headcount: 900 };
			throw new Error(`unknown tool ${name}`);
		}
	});

	const result = await agent.chat('What is the share price of MXP? Use the tool, then state the number.');
	if (!result.toolCalls.length) throw new Error('ToolAgent made no tool calls');
	if (!result.text) throw new Error('ToolAgent returned no final text');
	ok('chat()', `${result.toolCalls.length} tool call(s), ${result.usage.attempts} round-trips`);
	ok('result.text', JSON.stringify(result.text.slice(0, 60)));

	const events = [];
	let streamDone = null;
	for await (const event of agent.stream('Now get the headcount for Mixpanel. Use the tool.')) {
		events.push(event.type);
		if (event.type === 'done') streamDone = event;
	}
	if (!events.includes('tool_call')) throw new Error('stream emitted no tool_call event');
	if (!events.includes('tool_result')) throw new Error('stream emitted no tool_result event');
	if (!streamDone.usage) throw new Error('stream done event carried no usage');
	ok('stream()', `events: ${[...new Set(events)].join(', ')}`);
}

// ── Transformer: few-shot JSON transformation with a validator ───────────────
console.log('\nTransformer');
{
	const transformer = new Transformer({
		modelName: MODEL,
		maxTokens: 512,
		logLevel: 'error',
		maxRetries: 2,
		retryDelay: 250,
		systemPrompt: 'Convert a person record into the target shape. Return JSON only.',
		exampleData: [
			{
				PROMPT: { name: 'Ada Lovelace', born: 1815 },
				ANSWER: { full_name: 'ADA LOVELACE', birth_year: 1815, century: 19 }
			},
			{
				PROMPT: { name: 'Alan Turing', born: 1912 },
				ANSWER: { full_name: 'ALAN TURING', birth_year: 1912, century: 20 }
			}
		],
		asyncValidator: async (payload) => {
			if (typeof payload.full_name !== 'string') throw new Error('full_name must be a string');
			if (payload.full_name !== payload.full_name.toUpperCase()) throw new Error('full_name must be UPPERCASE');
			if (typeof payload.century !== 'number') throw new Error('century must be a number');
		}
	});

	await transformer.seed();
	ok('seed()', `${transformer.exampleCount} seeded messages`);

	const out = await transformer.send({ name: 'Grace Hopper', born: 1906 });
	if (out.full_name !== 'GRACE HOPPER') throw new Error(`unexpected transform output: ${JSON.stringify(out)}`);
	ok('send()', JSON.stringify(out));

	const raw = await transformer.rawSend({ name: 'Katherine Johnson', born: 1918 });
	if (!raw.full_name) throw new Error('rawSend returned no full_name');
	ok('rawSend()', JSON.stringify(raw));

	const usage = transformer.getLastUsage();
	ok('usage', `${usage.totalTokens} tokens across ${usage.attempts} round-trip(s)`);

	await transformer.reset();
	ok('reset()', `${transformer.getHistory().length} messages`);
}

console.log('\nAll ak-claude-shaped code ran unmodified on ak-litellm.\n');
