#!/usr/bin/env node
/**
 * DROP-IN PROOF — ak-gemini → ak-litellm.
 *
 * Everything below this header is ordinary ak-gemini application code: option
 * names (`maxOutputTokens`, `thinkingConfig`, `enableGrounding`, `labels`,
 * `parametersJsonSchema`, `toolConfig`), per-message `{ labels }`, and result
 * fields are exactly what an ak-gemini app uses. The ONLY edit needed to move it
 * onto the Mixpanel LiteLLM gateway is the one import line marked below.
 *
 *   Original:  import { Chat, ToolAgent, Transformer } from 'ak-gemini';
 *   Swapped:   import { Chat, ToolAgent, Transformer } from 'ak-litellm';
 *
 * Run it:  node ak-litellm/scratch-dropin-gemini.mjs
 * Costs a few cents — one web search dominates the bill.
 */

// ── THE ONLY LINE THAT CHANGED ───────────────────────────────────────────────
// import { Chat, ToolAgent, Transformer } from 'ak-gemini';
import { Chat, ToolAgent, Transformer } from 'ak-litellm';
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5';

/** @param {string} label */
function ok(label, detail) {
	console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

console.log('\nak-gemini → ak-litellm drop-in proof\n');

// ── Chat: ak-gemini option names, ak-gemini result shape ─────────────────────
console.log('Chat');
{
	const chat = new Chat({
		modelName: MODEL,
		systemPrompt: 'You are terse. Answer in one short sentence.',
		maxOutputTokens: 256,           // ak-gemini's name for maxTokens
		temperature: 0.2,
		topP: 0.9,
		topK: 40,
		chatConfig: { temperature: 0.9 },  // shorthand above wins over chatConfig
		labels: { team: 'gtm', env: 'dev' },
		resourceExhaustedRetries: 3,
		resourceExhaustedDelay: 500,
		// ak-gemini-only options. Accepted, warned about once, ignored.
		vertexai: true,
		project: 'my-gcp-project',
		location: 'us-central1',
		safetySettings: [{ category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' }],
		logLevel: 'error'
	});

	const first = await chat.send('What is the capital of France?');
	if (!first.text) throw new Error('Chat.send returned no text');
	ok('send()', JSON.stringify(first.text.slice(0, 60)));

	// ak-gemini allows per-message billing labels.
	const second = await chat.send('And of Japan?', { labels: { feature: 'geo-quiz' } });
	if (!second.text) throw new Error('Chat.send returned no text on turn 2');
	ok('send() with per-message labels', `${chat.getHistory().length} messages`);

	const usage = chat.getLastUsage();
	if (!(usage.promptTokens > 0)) throw new Error('usage.promptTokens is not populated');
	if (!usage.requestedModel) throw new Error('usage.requestedModel is missing');
	ok('getLastUsage()', `${usage.totalTokens} tokens, $${usage.estimatedCost} (${usage.costSource})`);

	let streamed = '';
	for await (const event of chat.stream('And of Brazil?')) {
		if (event.type === 'text') streamed += event.text;
		if (event.type === 'done') {
			if (!event.usage) throw new Error('stream done event carried no usage');
			if (event.fullText !== streamed) throw new Error('done.fullText does not match the text events');
		}
	}
	if (!streamed) throw new Error('stream produced no text');
	ok('stream()', JSON.stringify(streamed.slice(0, 60)));

	const estimate = await chat.estimate('a payload to size up');
	if (!(estimate.inputTokens > 0)) throw new Error('estimate() returned nothing');
	ok('estimate()', `${estimate.inputTokens} tokens`);

	const costed = await chat.estimateCost('a payload to size up');
	if (costed.estimatedInputCost === null) throw new Error('estimateCost() found no pricing');
	ok('estimateCost()', `$${costed.estimatedInputCost.toFixed(8)} on ${costed.model}`);

	await chat.clearHistory();
	ok('clearHistory()', `${chat.getHistory().length} messages`);
}

// ── Chat with thinkingConfig: ak-gemini's reasoning shape ────────────────────
console.log('\nChat (thinkingConfig)');
{
	const chat = new Chat({
		modelName: MODEL,
		maxOutputTokens: 2048,
		thinkingConfig: { thinkingBudget: 1024 },   // ak-gemini reasoning shape
		temperature: 0.2,                            // suppressed automatically under reasoning
		logLevel: 'error'
	});

	const r = await chat.send('A shop sells pens at 3 for $2. What do 12 pens cost? Answer with the number.');
	if (!r.text.includes('8')) throw new Error(`unexpected reasoning answer: ${r.text}`);
	ok('thinkingConfig → reasoning_effort', JSON.stringify(r.text.slice(0, 60)));
	ok('usage', `${r.usage.totalTokens} tokens, ${r.usage.thoughtsTokens} thought tokens`);
}

// ── Chat with enableGrounding: ak-gemini's web-search shape ──────────────────
console.log('\nChat (enableGrounding)');
{
	const chat = new Chat({
		modelName: MODEL,
		maxOutputTokens: 1024,
		enableGrounding: true,                        // ak-gemini's name for enableWebSearch
		groundingConfig: {
			max_uses: 1,
			searchTypes: ['web']                      // no Anthropic equivalent — warns, then ignored
		},
		logLevel: 'error'
	});

	const r = await chat.send('Search the web: who won the most recent FIFA World Cup? One sentence.');
	if (!r.text) throw new Error('grounded Chat.send returned no text');
	ok('enableGrounding → web_search tool', JSON.stringify(r.text.slice(0, 70)));
}

// ── ToolAgent: ak-gemini parametersJsonSchema + toolConfig shapes ────────────
console.log('\nToolAgent');
{
	const called = [];

	const agent = new ToolAgent({
		modelName: MODEL,
		maxOutputTokens: 512,
		systemPrompt: 'Use the tools you are given.',
		logLevel: 'error',
		maxToolRounds: 5,                             // ak-gemini's name
		parallelToolCalls: true,
		writeDir: '/tmp',
		toolConfig: { functionCallingConfig: { mode: 'AUTO' } },   // ak-gemini tool_choice
		onToolCall: (name) => called.push(name),
		onBeforeExecution: async () => true,
		tools: [
			{
				name: 'get_stock_price',
				description: 'Get the current share price for a ticker symbol.',
				parametersJsonSchema: {                 // ak-gemini schema key
					type: 'object',
					properties: { ticker: { type: 'string', description: 'e.g. MXP' } },
					required: ['ticker']
				}
			},
			{
				name: 'get_headcount',
				description: 'Get the employee headcount for a company.',
				parametersJsonSchema: {
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
	if (!called.includes('get_stock_price')) throw new Error('onToolCall never fired');
	ok('chat()', `${result.toolCalls.length} tool call(s), ${result.usage.attempts} round-trips`);
	ok('result.toolCalls[0]', JSON.stringify(result.toolCalls[0]));

	const events = [];
	let streamDone = null;
	for await (const event of agent.stream('Now get the headcount for Mixpanel. Use the tool.', { labels: { feature: 'hr' } })) {
		events.push(event.type);
		if (event.type === 'done') streamDone = event;
	}
	if (!events.includes('tool_call')) throw new Error('stream emitted no tool_call event');
	if (!events.includes('tool_result')) throw new Error('stream emitted no tool_result event');
	if (!streamDone.usage) throw new Error('stream done event carried no usage');
	ok('stream()', `events: ${[...new Set(events)].join(', ')}`);
}

// ── Transformer: ak-gemini key aliases + responseSchema ──────────────────────
console.log('\nTransformer');
{
	const transformer = new Transformer({
		modelName: MODEL,
		maxOutputTokens: 512,
		logLevel: 'error',
		maxRetries: 2,
		retryDelay: 250,
		onlyJSON: true,
		promptKey: 'INPUT',                 // ak-gemini alias for sourceKey
		answerKey: 'OUTPUT',                // ak-gemini alias for targetKey
		systemPrompt: 'Convert a person record into the target shape. Return JSON only.',
		responseSchema: {
			type: 'object',
			required: ['full_name', 'birth_year', 'century'],
			additionalProperties: false,
			properties: {
				full_name: { type: 'string' },
				birth_year: { type: 'number' },
				century: { type: 'number' }
			}
		},
		exampleData: [
			{
				INPUT: { name: 'Ada Lovelace', born: 1815 },
				OUTPUT: { full_name: 'ADA LOVELACE', birth_year: 1815, century: 19 }
			},
			{
				INPUT: { name: 'Alan Turing', born: 1912 },
				OUTPUT: { full_name: 'ALAN TURING', birth_year: 1912, century: 20 }
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

	const raw = await transformer.rawSend({ name: 'Katherine Johnson', born: 1918 }, { labels: { feature: 'etl' } });
	if (!raw.full_name) throw new Error('rawSend returned no full_name');
	ok('rawSend()', JSON.stringify(raw));

	const usage = transformer.getLastUsage();
	ok('usage', `${usage.totalTokens} tokens across ${usage.attempts} round-trip(s)`);

	await transformer.reset();
	ok('reset()', `${transformer.getHistory().length} messages`);
}

console.log('\nAll ak-gemini-shaped code ran unmodified on ak-litellm.\n');
