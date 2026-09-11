#!/usr/bin/env node
/**
 * 02 — Turn free text into a typed object.
 *
 * `responseSchema` does three things: it goes on the wire as
 * `response_format.json_schema`, it is validated locally when the reply comes
 * back, and a failed validation is retried automatically.
 *
 * Run:  node 02-extract-json.mjs     Cost: ~$0.0004
 */
import { Message } from 'ak-litellm';

/** @type {import('ak-litellm').JSONSchema} */
const SCHEMA = {
	type: 'object',
	required: ['name', 'email', 'company', 'intent'],
	additionalProperties: false,
	properties: {
		name: { type: 'string' },
		email: { type: 'string' },
		company: { type: 'string' },
		intent: { type: 'string', enum: ['demo', 'support', 'pricing', 'other'] },
		urgency: { type: 'integer', minimum: 1, maximum: 5 }
	}
};

const extractor = new Message({
	systemPrompt: 'Extract the contact details from the email. Return JSON only.',
	responseSchema: SCHEMA,
	validationRetries: 2       // re-ask when the payload fails the schema
});

const EMAIL = `
From: dana.li@acme.io
Hi — Dana Li here from Acme. Our renewal is in three days and we still cannot
get SSO working. We need someone on this today.
`;

const { data, usage, validationErrors } = await extractor.send(EMAIL);

console.log('\nExtracted:', JSON.stringify(data, null, 2));
if (validationErrors) console.log('Validation notes:', validationErrors);
console.log(`\ncost $${usage.estimatedCost?.toFixed(6)}, ${usage.attempts} round-trip(s)\n`);
