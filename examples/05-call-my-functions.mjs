#!/usr/bin/env node
/**
 * 05 — Let the model call your code.
 *
 * You supply tool declarations and one executor. `ToolAgent` runs the loop:
 * model asks for a tool, your executor runs, the result goes back, repeat until
 * the model answers. `usage.attempts` counts the round-trips, so you can see
 * what the loop actually cost.
 *
 * Tool schemas are accepted in all four spellings — `input_schema` (ak-claude),
 * `parametersJsonSchema` (ak-gemini), `inputSchema`, or an OpenAI
 * `function.parameters` wrapper.
 *
 * Run:  node 05-call-my-functions.mjs    Cost: ~$0.0030
 */
import { ToolAgent } from 'ak-litellm';

const DB = {
	orders: { 'A-1001': { status: 'shipped', carrier: 'DHL', eta: '2026-09-14' } },
	refunds: []
};

const agent = new ToolAgent({
	maxTokens: 600,
	systemPrompt: 'You are a support agent. Use the tools before answering.',
	tools: [
		{
			name: 'lookup_order',
			description: 'Look up an order by its id.',
			input_schema: {
				type: 'object',
				properties: { orderId: { type: 'string', description: 'e.g. A-1001' } },
				required: ['orderId']
			}
		},
		{
			name: 'issue_refund',
			description: 'Issue a refund for an order. Only for delivered or lost orders.',
			input_schema: {
				type: 'object',
				properties: { orderId: { type: 'string' }, amountUsd: { type: 'number' } },
				required: ['orderId', 'amountUsd']
			}
		}
	],
	// Called for every tool the model invokes. Throwing here is fine — the error
	// goes back to the model, which can recover.
	toolExecutor: async (name, args) => {
		console.log(`   -> ${name}(${JSON.stringify(args)})`);
		if (name === 'lookup_order') return DB.orders[args.orderId] ?? { error: 'not found' };
		if (name === 'issue_refund') {
			DB.refunds.push(args);
			return { ok: true, refundId: 'R-' + DB.refunds.length };
		}
		throw new Error(`unknown tool ${name}`);
	},
	// Fires before each execution; return false to deny.
	onBeforeExecution: async (name) => name !== 'delete_everything'
});

const { text, toolCalls, usage } = await agent.chat('Where is order A-1001?');

console.log(`\nA: ${text.trim()}`);
console.log(`\n${toolCalls.length} tool call(s), ${usage.attempts} API round-trips, $${usage.estimatedCost?.toFixed(6)}\n`);
