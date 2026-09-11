# ak-litellm

[![npm](https://img.shields.io/npm/v/ak-litellm.svg)](https://www.npmjs.com/package/ak-litellm)
[![license](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

A drop-in replacement for [`ak-claude`](https://github.com/ak--47/ak-claude) and [`ak-gemini`](https://github.com/ak--47/ak-gemini) that routes every call through a [LiteLLM](https://github.com/BerriAI/litellm) gateway.

One bearer key. 19 models across Anthropic, Google, OpenAI, DeepSeek, Zhipu, Moonshot and Alibaba. Gateway-authoritative cost on every non-streaming call.

**Drop-in means drop-in.** Change the import line. Change nothing else.

```diff
- import { Chat, ToolAgent, Transformer } from 'ak-claude';
+ import { Chat, ToolAgent, Transformer } from 'ak-litellm';
```

ak-claude and ak-gemini option names both work — `maxTokens` and `maxOutputTokens`, `enableWebSearch` and `enableGrounding`, `thinking` and `thinkingConfig`, `input_schema` and `parametersJsonSchema`. Options this gateway cannot honor are accepted, warned about once, and ignored. Nothing is silently dropped and nothing new throws.

Two proof scripts live in the repo: [`scratch-dropin-claude.mjs`](scratch-dropin-claude.mjs) and [`scratch-dropin-gemini.mjs`](scratch-dropin-gemini.mjs). Each is ordinary sibling-package application code with a single changed import.

> **Who this is for.** The defaults target Mixpanel's internal gateway at `https://litellm.mixpanel.org`, and you need a key issued by that gateway's operators to use it. Point `LITELLM_BASE_URL` at any other LiteLLM deployment and everything here still works — but the model list, the pricing table and the capability notes below are all specific to the Mixpanel deployment as of 2026-09-11. Regenerate them for your own gateway with `npm run refresh-pricing` and `npm run probe-capabilities`.

---

## Quick Start

```bash
npm install ak-litellm
```

```bash
# .env
LITELLM_API_KEY=sk-...
LITELLM_BASE_URL=https://litellm.mixpanel.org   # optional — this is the default
```

```javascript
import { Chat } from 'ak-litellm';

const chat = new Chat({ modelName: 'claude-sonnet-5' });
const { text, usage } = await chat.send('What is the capital of France?');

console.log(text);                 // "Paris."
console.log(usage.estimatedCost);  // 0.000062
console.log(usage.costSource);     // 'gateway'
```

There is a CLI for quick checks:

```bash
npx ak-litellm --models         # list every model, its rate, and its capability flags
MODEL=gpt-5.5 npx ak-litellm    # interactive streamed chat
EFFORT=high npx ak-litellm      # same, with reasoning turned up
```

---

## Recipes

Seven runnable files in [`examples/`](examples/), each under 40 lines and each
printing what it cost. Run from the package root: `node examples/01-summarize.mjs`.

| | |
|---|---|
| [Summarize text](examples/01-summarize.mjs) | the smallest useful call |
| [Extract to a typed object](examples/02-extract-json.mjs) | schema + validation + retry |
| [Converse](examples/03-chat.mjs) | history and streaming |
| [Answer over your documents](examples/04-answer-over-docs.mjs) | no vector store needed |
| [Let the model call your code](examples/05-call-my-functions.mjs) | tools and the agent loop |
| [Make repeated prompts cheap](examples/06-cheap-repeated-prompts.mjs) | prompt caching, 10x |
| [Get current information](examples/07-web-search.mjs) | web search on all three vendors |

```javascript
import { Message, Chat, RagAgent, ToolAgent } from 'ak-litellm';

const { text } = await new Message().send('Summarize: ' + article);
const { data } = await new Message({ responseSchema: SCHEMA }).send(email);

const chat = new Chat({ systemPrompt: 'Be terse.' });
await chat.send('Capital of France?');
await chat.send('And Japan?');                       // remembers

await new RagAgent({ localFiles: ['./docs/api.md'] }).chat('How do I authenticate?');
await new ToolAgent({ tools, toolExecutor }).chat('Where is order A-1001?');
```

---

## Classes

Six classes, identical in signature to their ak-claude and ak-gemini counterparts.

### Transformer — JSON transformation

Few-shot JSON in, validated JSON out, with retry.

```javascript
import { Transformer } from 'ak-litellm';

const t = new Transformer({
	modelName: 'claude-haiku-4-5',
	systemPrompt: 'Convert a person record into the target shape. Return JSON only.',
	exampleData: [
		{ PROMPT: { name: 'Ada Lovelace', born: 1815 }, ANSWER: { full_name: 'ADA LOVELACE', birth_year: 1815 } }
	],
	asyncValidator: async (p) => {
		if (p.full_name !== p.full_name.toUpperCase()) throw new Error('full_name must be UPPERCASE');
	}
});

await t.seed();
const out = await t.send({ name: 'Grace Hopper', born: 1906 });
// { full_name: 'GRACE HOPPER', birth_year: 1906 }
```

`send()` validates and retries. `rawSend()` returns the first parse with no validation. `rebuild()` repairs a payload against a server error. `reset()` drops the conversation but keeps the seeded examples.

### Chat — multi-turn conversation

```javascript
const chat = new Chat({ modelName: 'gemini-3.8-flash', systemPrompt: 'Be terse.' });

await chat.send('Capital of France?');
await chat.send('And of Japan?');       // history is retained

for await (const ev of chat.stream('And of Brazil?')) {
	if (ev.type === 'text') process.stdout.write(ev.text);
	if (ev.type === 'done') console.log(ev.usage.totalTokens);
}
```

### Message — stateless one-off

No history. Safe to call concurrently — each call carries its own usage.

```javascript
const msg = new Message({
	modelName: 'claude-sonnet-5',
	responseSchema: {
		type: 'object',
		required: ['city', 'country'],
		additionalProperties: false,
		properties: { city: { type: 'string' }, country: { type: 'string' } }
	}
});

const r = await msg.send('The Eiffel Tower. Return its city and country.');
r.data;              // { city: 'Paris', country: 'France' }
r.validationErrors;  // undefined when the payload validated
```

### ToolAgent — agent with your tools

```javascript
const agent = new ToolAgent({
	modelName: 'claude-sonnet-5',
	tools: [{
		name: 'get_weather',
		description: 'Get the current temperature for a city.',
		input_schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] }
	}],
	toolExecutor: async (name, args) => ({ temperatureC: 21 })
});

const r = await agent.chat('Temperature in Paris? Use the tool.');
r.toolCalls;      // [{ name, args, result }]
r.usage.attempts; // 2 — API round-trips, not retries
```

`stream()` emits `text`, `tool_call`, `tool_result` and `done` events. `stop()` halts the loop before the next round.

### CodeAgent — writes and runs code

Six built-in tools: `write_code`, `execute_code`, `write_and_run_code`, `fix_code`, `run_bash`, `use_skill`.

```javascript
const agent = new CodeAgent({ workingDirectory: './sandbox', maxRounds: 8 });
const r = await agent.chat('Compute the 40th Fibonacci number and print it.');
agent.dump();   // every artifact the agent wrote
```

### RagAgent — document Q&A

```javascript
const agent = new RagAgent({
	localFiles: ['./docs/api.md'],
	localData: [{ name: 'inventory', data: { widgets: 42 } }],
	mediaFiles: ['./chart.png', './report.pdf']
});

const r = await agent.chat('How many widgets are in the inventory?');
```

`remoteFiles` (ak-gemini's Files API input) is accepted as an alias for `mediaFiles`, with a warning. Images become data-URI `image_url` parts; PDFs become `file` parts; anything else is skipped with a warning.

---

## What this gateway can and cannot do

Every row **verified live on 2026-09-11**, not inferred. The live suite
re-asserts each one, and `npm run probe-capabilities` re-derives the whole table
against your gateway.

### Works

| Capability | Detail |
|---|---|
| **Prompt caching** | On `claude-sonnet-5`, `claude-opus-5`, `claude-opus-4-7`, `claude-fable-5-1`. **10x to 29x cheaper** on a repeated prefix. On by default. |
| **Web search** | All three vendors, one option. Anthropic server tool, Gemini `googleSearch`, OpenAI via `/v1/responses`. |
| **Assistant prefill** | Put words in the model's mouth. Three distinct behaviours across models; the wrapper handles all three. |
| **1M-token context** | Every model except `claude-haiku-4-5` (200k). |
| **Reasoning** | `effort` from `minimal` to `max` on 18 of 19 models. |
| **Structured output** | `response_format.json_schema`, plus local validation and retry. |
| **Vision and PDF input** | Gated per model — a PDF is skipped with a warning rather than 400'ing. |

### Does not work

| Capability | Why |
|---|---|
| Prompt caching on `claude-haiku-4-5`, `gemini-*`, `gpt-*` | Accepted and ignored upstream. **The gateway's own `supports_prompt_caching` flag says `true` for all of them and is wrong** — this package uses a measured list instead. |
| Cost header on streams | `x-litellm-response-cost` is absent on streaming responses, so streamed calls report `costSource: 'estimated'`. |
| **Batch API** | `/v1/batches` works, but `POST /v1/files` returns `files_settings is not set`. No input file, no job. One line of gateway config away; `BatchTransformer` throws with the exact remedy. |
| Embeddings, image generation | All 19 gateway models are `mode: chat`. No deployment of either kind exists. |
| `AgentQuery` | Needs the Claude Agent SDK against Anthropic directly. |
| Explicit context caching, safety settings, service tiers | No gateway equivalent. Accepted, warned once, ignored. |
| Spend introspection | `/key/info` and `/spend/logs` return 403; the key is scoped to `llm_api_routes`. |

`drop_params` is **off** on this deployment, so an unsupported provider
parameter is a 400 rather than a no-op. The wrapper gates them by model family
for you.

---

## Prompt caching

On by default. You do not opt in.

```javascript
const chat = new Chat({
  modelName: 'claude-sonnet-5',
  systemPrompt: BIG_SYSTEM_PROMPT   // over ~1,024 tokens
});

await chat.send('first question');    // writes the cache
await chat.send('second question');   // ~10x cheaper
```

Measured on a 4,808-token prefix, 2026-09-11:

| Model | Write | Read | Saving |
|---|---|---|---|
| `claude-fable-5-1` | $0.0611 | $0.0021 | **29.2x** |
| `claude-sonnet-5` | $0.0122 | $0.0011 | **10.7x** |
| `claude-opus-5` | $0.0305 | $0.0028 | **10.7x** |
| `claude-opus-4-7` | $0.0306 | $0.0029 | **10.6x** |
| `claude-haiku-4-5` | — | — | 1.0x, does not cache |
| `gemini-*`, `gpt-*`, `glm-*`, `kimi-*`, `deepseek-*` | — | — | 1.0x, do not cache |

Three switches, each `true | false | 'auto'`, all defaulting to `'auto'`:

| Option | Caches |
|---|---|
| `cacheSystemPrompt` | the system prompt |
| `cacheContext` | `RagAgent`'s injected document block — usually the biggest win |
| `cacheExamples` | `Transformer`'s seeded few-shot prefix |

`'auto'` caches when the model supports it and the block clears ~1,024 tokens,
and is **silent** when it declines — a no-op is not a mistake you made. Passing
`true` explicitly warns when it cannot work. `cacheTtl: '1h'` costs 2x to write
instead of 1.25x, and pays off for a prefix reused for longer than five minutes.

---

## Web search

One option, three vendors, right shape chosen for you.

```javascript
new Chat({ modelName: 'claude-sonnet-5', enableWebSearch: true });
new Chat({ modelName: 'gemini-3.8-flash', enableGrounding: true });   // same thing
new Chat({ modelName: 'gpt-5.5', enableWebSearch: true });            // uses /v1/responses
```

| Provider | Shape | Route |
|---|---|---|
| Anthropic | `web_search_20250305` server tool | chat completions |
| Google | `{ googleSearch: {} }` | chat completions |
| OpenAI | `{ type: 'web_search' }` | **`/v1/responses`** — a hard 400 on chat completions |

`usage.webSearchRequests` counts the searches. Providers bill those **separately
from tokens**, and that charge is **not** in `estimatedCost`. Anthropic does not
report a count, so it reads 0 there.

A grounded reply spends reasoning tokens before emitting text, so `maxTokens`
below 1,024 is raised for you with one warning. Without that, a low cap returns
empty content that looks like a failure.

---

## Assistant prefill

The cheapest way to force a shape:

```javascript
const msg = new Message({ modelName: 'claude-haiku-4-5', prefill: '[' });
const { text } = await msg.send('List three colors as JSON.');
JSON.parse(text);   // works — text includes the '['
```

Models fall into three groups, measured 2026-09-11:

| Behaviour | Models | What the wrapper does |
|---|---|---|
| `continue` | `claude-haiku-4-5`, `gpt-6-astra`, `glm-*` | Prepends your prefix to the reply |
| `restart` | `gpt-5.5`, `gpt-5.6-*`, `kimi-k3`, `deepseek-v4.1-flash` | Sends the hint, does **not** prepend — the model re-emits it |
| `reject` | `claude-sonnet-5`, `claude-opus-*`, `claude-fable-*`, `gemini-3.8-flash` | Drops the prefill, warns once, call still succeeds |

Getting that distinction wrong produces corrupt output like
`["red",["red","blue"]`, which is why the modes are measured rather than assumed.
`result.continuation` always holds the raw model output.

---

## Knowing what a model can do

```javascript
import { getCapabilities } from 'ak-litellm';

getCapabilities('claude-sonnet-5');
// { id, known: true, maxInputTokens: 1000000, vision: true, pdf: true,
//   tools: true, reasoning: true, promptCaching: true, webSearch: 'anthropic', ... }
```

The wrapper uses this itself: `ToolAgent` refuses a model that cannot call
functions, `RagAgent` skips a PDF a model cannot read instead of letting the
provider 400, and `estimate()` reports `fits` and `headroom` against the context
window.

```javascript
const { inputTokens, contextWindow, fits, headroom } = await chat.estimate(payload);
```

`contextGuard: 'throw'` turns an over-limit request into a local error before
you spend anything. The default is `'warn'`, because the estimate is a
heuristic and a false positive must not block a valid call.

---

## Sampling parameters

`drop_params` is off, so sending `temperature` to a model that rejects it is a 400. ak-litellm gates by family, from a live probe on 2026-09-08:

| Family | `temperature` | `top_p` | `top_k` |
|---|---|---|---|
| `claude-sonnet-5`, `claude-opus-*`, `claude-fable-*` | dropped | dropped | dropped |
| `claude-haiku-4-5` | sent | dropped when `temperature` is also set | dropped |
| Any `claude-*` while `effort` is set | dropped | dropped | dropped |
| `gpt-*` | dropped | dropped | dropped |
| `gemini-*`, `glm-*`, `kimi-*`, `qwen*`, `deepseek-*` | sent | sent | sent |

`null` and `undefined` differ. `temperature: null` means *never send it*. `temperature: undefined` means *use the default*.

---

## Reasoning

`effort` is the cross-package knob. It takes the union of both siblings' vocabularies and maps onto the gateway's three levels:

| `effort` | wire `reasoning_effort` |
|---|---|
| `minimal`, `low` | `low` |
| `medium` | `medium` |
| `high`, `xhigh`, `max` | `high` |

ak-claude's `thinking: { type: 'enabled', budget_tokens: N }` and ak-gemini's `thinkingConfig: { thinkingBudget: N }` / `{ thinkingLevel }` are both translated to `effort`. An unrecognized level throws.

Anthropic reserves the reasoning budget out of `max_tokens`. If `maxTokens` is too small, ak-litellm explains that instead of leaking the raw 400.

---

## Usage and cost

```javascript
const usage = chat.getLastUsage();
```

| Field | Meaning |
|---|---|
| `promptTokens`, `responseTokens`, `totalTokens` | Cumulative across every round-trip in the turn. |
| `thoughtsTokens` | Reasoning tokens. Billed at the output rate, included in `totalTokens`. |
| `cachedTokens`, `cacheReadTokens`, `cacheCreationTokens` | Always `0` on this gateway. |
| `attempts` | API round-trips, not retries. A three-round tool turn reports `3`. |
| `estimatedCost` | USD. `null` means unknown — never `0`. |
| `costSource` | `'gateway'` (exact, from `x-litellm-response-cost`) or `'estimated'` (from the pricing table). |
| `upstreamModel` | What the gateway actually called, e.g. `vertex_ai/claude-haiku-4-5`. |
| `callId` | The gateway's `x-litellm-call-id`, for correlating with LiteLLM logs. |
| `keySpend` | Cumulative USD on your key. |
| `requestedModel`, `modelVersion` | What you asked for, and what answered. |

A turn that mixes streamed and non-streamed rounds falls back to the pricing table wholesale, so the number is never half-exact.

`estimate()` returns an approximate input-token count without an API call. `estimateCost()` prices it.

---

## Pricing table

`MODEL_PRICING` is generated from the gateway's own `GET /model/info`. It is never hand-written.

```bash
npm run refresh-pricing    # regenerates models.js and re-stamps MODEL_PRICING_AS_OF
```

Current stamp: **2026-09-08**.

```javascript
import { resolvePricing, computeCost, MODEL_PRICING_AS_OF } from 'ak-litellm';

resolvePricing('claude-sonnet-5');                    // { input, output, cachedInput, asOf }
resolvePricing('claude-sonnet-5', { at: '2026-12-01' }); // honors date-windowed intro rates
computeCost({ promptTokens: 1000, responseTokens: 500 }, 'claude-sonnet-5');
```

Retired sibling-package model ids resolve to their live successors: `gemini-3.7-flash` → `gemini-3.8-flash`, `claude-sonnet-4-6` → `claude-sonnet-5`, `gpt-5` → `gpt-5.5`, and five more. Aliasing warns once.

---

## Models

```javascript
import { listModels, getModelInfo } from 'ak-litellm';

listModels();                               // 19 general-purpose ids
listModels({ includeIntegration: true });   // 21, including team-scoped `advisor` and `executor`
getModelInfo('claude-sonnet-5');            // context window, upstream model, capability flags
```

Default model: `claude-sonnet-5`.

---

## Constructor options

Shared by every class:

`modelName`, `systemPrompt`, `apiKey`, `baseURL`, `logLevel`, `healthCheck`, `temperature`, `topP`, `topK`, `effort`, `maxTokens`, `maxRetries`, `retryDelay`, `enableWebSearch`, `webSearchConfig`, `labels`, `responseSchema`.

Accepted under their ak-gemini or ak-gpt names too: `maxOutputTokens`, `reasoningEffort`, `enableGrounding`, `groundingConfig`, `resourceExhaustedRetries`, `resourceExhaustedDelay`, `thinkingConfig`, `responseMimeType`, `toolConfig`, `chatConfig`.

Accepted, warned once, ignored: `vertexai`, `project`, `location`, `vertexProjectId`, `vertexRegion`, `googleAuthOptions`, `safetySettings`, `serviceTier`, `cachedContent`, `cacheSystemPrompt`, `cacheTtl`, `enableCitations`.

Per class: `exampleData` / `examplesFile` / `promptKey` / `answerKey` / `asyncValidator` (Transformer); `tools` / `toolExecutor` / `maxToolRounds` / `parallelToolCalls` / `toolChoice` (ToolAgent); `workingDirectory` / `maxRounds` / `timeout` / `skills` (CodeAgent); `localFiles` / `localData` / `mediaFiles` (RagAgent).

Full types are in [`types.d.ts`](types.d.ts). Long-form usage is in [`GUIDE.md`](GUIDE.md).

---

## Exports

```javascript
import {
	Transformer, Chat, Message, ToolAgent, CodeAgent, RagAgent,
	BaseLiteLLM, BaseClaude, BaseGemini,           // BaseClaude and BaseGemini are aliases
	Embedding, ImageGenerator, AgentQuery,          // constructors throw with an explanation
	MODEL_PRICING, MODEL_PRICING_AS_OF, MODEL_ALIASES, MODEL_INFO,
	EFFORT_LEVELS, DEFAULT_MODEL,
	resolvePricing, computeCost, budgetTokensToEffort, listModels, getModelInfo, refreshModelInfo,
	normalizeOptions, samplingSupport, modelProvider,
	extractJSON, attemptJSONRecovery, validateSchema, isJSON, isJSONStr,
	ThinkingLevel, HarmCategory, HarmBlockThreshold,
	log
} from 'ak-litellm';
```

`clients.openai` and `clients.raw` expose the underlying SDK client. `clients.anthropic` and `clients.vertex` are `null` — nothing here talks to a provider directly.

---

## Requirements

Node 22 or newer. The `openai` SDK v7 sets that floor.

---

## Contributing

```bash
git clone https://github.com/ak--47/ak-litellm.git
cd ak-litellm
npm install
cp .env.example .env    # then add your gateway key

npm test                # unit suite — fully offline, mocks the openai SDK, no spend
npm run typecheck       # tsc --noEmit
npm run build:cjs       # esbuild → index.cjs
npm run test:live       # live suite — needs LITELLM_LIVE=1, costs under a cent
npm run refresh-pricing # regenerate the models.js table from your gateway
```

The unit suite mocks the `openai` module and cannot reach the network, so it is safe to run at any time. The live suite is gated behind `LITELLM_LIVE=1`, uses `claude-haiku-4-5` with low token caps, and asserts its own total spend stays under $0.50.

After changing `compat.js`, `base.js` or any class constructor, run both drop-in proof scripts. They throw on the first missing field.

```bash
node scratch-dropin-claude.mjs
node scratch-dropin-gemini.mjs
```

Jest needs the ESM flags. `npm test` already has them. To run a single file:

```bash
node --no-warnings --experimental-vm-modules node_modules/jest/bin/jest.js tests/unit/compat.test.js
```

[GUIDE.md](GUIDE.md) explains the design decisions. [CLAUDE.md](CLAUDE.md) is the working brief for AI coding agents.

**Never commit `.env`.** It holds a live gateway key with a real budget. It is gitignored, and the unit harness sets its own fake key.

---

## License

[ISC](LICENSE).
