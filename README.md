# ak-litellm

A drop-in replacement for [`ak-claude`](../ak-claude) and [`ak-gemini`](../ak-gemini) that routes every call through Mixpanel's LiteLLM gateway at `https://litellm.mixpanel.org`.

One bearer key. 19 models across Anthropic, Google, OpenAI, DeepSeek, Zhipu, Moonshot and Alibaba. Gateway-authoritative cost on every non-streaming call.

**Drop-in means drop-in.** Change the import line. Change nothing else.

```diff
- import { Chat, ToolAgent, Transformer } from 'ak-claude';
+ import { Chat, ToolAgent, Transformer } from 'ak-litellm';
```

ak-claude and ak-gemini option names both work — `maxTokens` and `maxOutputTokens`, `enableWebSearch` and `enableGrounding`, `thinking` and `thinkingConfig`, `input_schema` and `parametersJsonSchema`. Options this gateway cannot honor are accepted, warned about once, and ignored. Nothing is silently dropped and nothing new throws.

Two proof scripts live in the repo: [`scratch-dropin-claude.mjs`](scratch-dropin-claude.mjs) and [`scratch-dropin-gemini.mjs`](scratch-dropin-gemini.mjs). Each is ordinary sibling-package application code with a single changed import.

---

## Quick Start

```bash
npm install ak-litellm
```

```bash
# .env
LITELLM_API_KEY=sk-...
LITELLM_BASE_URL=https://litellm.mixpanel.org
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
node cli.js --models          # list every model, its rate, and its capability flags
MODEL=gpt-5.5 node cli.js     # interactive streamed chat
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

## What this gateway cannot do

These are **verified live**, not guesses. The live suite re-asserts each one so a gateway change surfaces here rather than in your app.

| Capability | Status |
|---|---|
| Prompt caching | **Does not work.** `cache_control` is accepted and ignored upstream. `cacheSystemPrompt` and `cacheTtl` warn once; `cacheReadTokens` and `cacheCreationTokens` are always `0`. |
| Cost header on streams | **Absent.** `x-litellm-response-cost` only appears on non-streaming responses. Streamed calls fall back to the pricing table and report `costSource: 'estimated'`. |
| `drop_params` | **Off.** The gateway forwards unsupported parameters and the provider 400s. ak-litellm gates them by model family instead. |
| Web search | Anthropic server-tool shape only, `claude-*` models only. On any other model `enableWebSearch` warns and is omitted. |
| Embeddings, image generation, `AgentQuery` | Not routable through `/v1/chat/completions`. The classes exist and throw a clear message from the constructor. |
| Explicit context caching, safety settings, service tiers, Vertex auth | No gateway equivalent. Accepted, warned once, ignored. |

Google models hide a `thought_signature` inside their tool-call ids. ak-litellm echoes tool-call ids back verbatim, so this works.

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

## Testing

```bash
npm test          # unit suite — fully offline, mocks the openai SDK, no spend
npm run test:live # live suite — needs LITELLM_LIVE=1, costs under a cent
npm run typecheck
npm run build:cjs
```

The unit suite runs with the network unavailable. The live suite uses `claude-haiku-4-5` with low token caps and asserts its own total spend stays under $0.50.

---

## License

ISC.
