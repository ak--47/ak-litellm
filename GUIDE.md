# ak-litellm — Guide

The long-form companion to [`README.md`](README.md). Read the README first for the shape of the API. Read this when you need to know *why* something behaves the way it does, or what to do when it does not behave the way you expect.

---

## 1. What this package is

`ak-litellm` is the fourth wrapper in a family. The other three each wrap one vendor SDK:

| Package | Wraps | Talks to |
|---|---|---|
| [`ak-claude`](https://github.com/ak--47/ak-claude) | `@anthropic-ai/sdk` | Anthropic direct, or Vertex AI |
| [`ak-gemini`](https://github.com/ak--47/ak-gemini) | `@google/genai` | Gemini API, or Vertex AI |
| `ak-gpt` | `openai` | OpenAI |
| **`ak-litellm`** | `openai`, pointed elsewhere | **a LiteLLM gateway** |

The gateway is a single HTTP endpoint that fans out to Anthropic, Google, OpenAI, DeepSeek, Zhipu, Moonshot and Alibaba behind one bearer key. You get one key, one bill, one place to see spend, and models from every vendor in one namespace.

The cost of that is uniformity: the gateway speaks the OpenAI chat-completions protocol to everything, so provider-specific features that do not fit that protocol are unavailable. Section 5 lists every one of them.

### The drop-in contract

An application written against `ak-claude` or `ak-gemini` runs on `ak-litellm` after changing only the import line. That is the whole design constraint, and everything else in the package follows from it.

Concretely, the contract is:

1. **Every option name from either sibling is accepted.** `maxTokens` and `maxOutputTokens` are the same option. So are `enableWebSearch`/`enableGrounding`, `reasoningEffort`/`effort`, `input_schema`/`parametersJsonSchema`.
2. **No option that worked before now throws.** Options the gateway cannot honor are accepted and ignored.
3. **No option is silently dropped.** Every ignored option warns exactly once per process, naming the option and the reason.
4. **Every result field keeps its shape.** `usage`, `toolCalls`, `text`, `data`, `citations`, stream event types — all identical.

Two scripts in the repo prove it. [`scratch-dropin-claude.mjs`](scratch-dropin-claude.mjs) is ak-claude application code. [`scratch-dropin-gemini.mjs`](scratch-dropin-gemini.mjs) is ak-gemini application code. Each has one changed line, marked in its header, and each runs to completion against the live gateway.

---

## 2. Setup

### Credentials

```bash
# .env, at your project root or beside the package
LITELLM_API_KEY=sk-...
LITELLM_BASE_URL=https://litellm.mixpanel.org
```

`LITELLM_BASE_URL` is optional — `https://litellm.mixpanel.org` is the default. Both can be overridden per instance:

```javascript
new Chat({ apiKey: '...', baseURL: 'https://litellm.mixpanel.org' });
```

The base URL is normalized to end in `/v1`. Pass it with or without.

If no key resolves, the constructor throws immediately with a message naming the environment variable. It never falls back to an unauthenticated call.

### Verifying the connection

```javascript
const chat = new Chat({ modelName: 'claude-sonnet-5', healthCheck: true });
await chat.init();
```

`healthCheck: true` makes `init()` call `GET /v1/models` and assert your model is in the list. Without it, `init()` does no network I/O and the first error you see is on your first `send()`. Turn it on in a startup path, leave it off in a hot path.

---

## 3. Choosing a model

```javascript
import { listModels, getModelInfo } from 'ak-litellm';

listModels();
// claude-opus-5, claude-sonnet-5, claude-opus-4-7, claude-haiku-4-5,
// claude-fable-5-1, claude-fable-5, gemini-3.8-flash, gpt-5.5, gpt-5.6-sol,
// gpt-5.6-terra, gpt-5.6-luna, gpt-6-astra, glm-5.3, glm-5.3-flash, kimi-k3,
// deepseek-v4.1-flash, glm-fast-latest
```

The roster moves. `deepseek-v4-pro` and `qwen3.8-max` were withdrawn on
2026-09-11 and `deepseek-v4-flash` was renamed `deepseek-v4.1-flash`. Run
`npm run probe-capabilities` to find out before your users do.

Two more ids exist — `advisor` and `executor` — but they are team-scoped integration endpoints, not general-purpose models. `listModels()` hides them. `listModels({ includeIntegration: true })` shows them.

`getModelInfo(id)` returns the gateway's raw record. `getCapabilities(id)` is
usually what you want instead — same data, plus the two flags this package
measures itself because the gateway gets them wrong:

```javascript
getCapabilities('claude-sonnet-5');
// { maxInputTokens: 1000000, vision: true, pdf: true, tools: true,
//   reasoning: true, promptCaching: true, webSearch: 'anthropic', ... }
```

### Aliases

Model ids retire. Sibling-package code that names a retired id still works:

| You write | You get |
|---|---|
| `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3-flash-preview`, `gemini-flash-latest` | `gemini-3.8-flash` |
| `claude-sonnet-4-6` | `claude-sonnet-5` |
| `claude-opus-4-5` | `claude-opus-5` |
| `claude-haiku-3-5` | `claude-haiku-4-5` |
| `gpt-5` | `gpt-5.5` |
| `deepseek-v4-flash` | `deepseek-v4.1-flash` |

Aliasing warns once, naming both ids. Pin the real id when you are ready.

---

## 4. Sampling parameters, and why they are gated

Most LiteLLM deployments enable `drop_params`, which silently strips parameters the upstream provider will not take. **This deployment does not.** An unsupported parameter is forwarded and the provider returns a 400.

So ak-litellm gates them itself. The table below comes from a live probe on 2026-09-08, one request per model per parameter:

| Model family | `temperature` | `top_p` | `top_k` |
|---|---|---|---|
| `claude-sonnet-5`, `claude-opus-5`, `claude-opus-4-7`, `claude-fable-*` | rejected | rejected | rejected |
| `claude-haiku-4-5` | accepted alone | rejected **when `temperature` is also set** | rejected |
| any `claude-*` with `effort` set | rejected | rejected | rejected |
| `gpt-*` | rejected | rejected | rejected |
| `gemini-3.8-flash`, `kimi-k3`, `glm-5.3`, `deepseek-v4.1-flash` | accepted | accepted | accepted |

You do not need to know this table. Set `temperature` and ak-litellm sends it where it works and drops it where it does not, logging a debug line each time it drops one.

The Anthropic-with-reasoning row is the subtle one. Anthropic returns `` `temperature` may only be set to 1 when thinking is enabled `` for *any* Anthropic model once `reasoning_effort` is on, including ones that accept `temperature` otherwise. The gate is applied after the reasoning parameter is resolved, so it sees the real answer.

### `null` versus `undefined`

```javascript
new Chat({ temperature: undefined })  // use the model's default
new Chat({ temperature: null })       // never send temperature, on any model
```

This distinction is inherited from ak-claude 0.2.0. It matters when you want a provider default rather than a value.

---

## 5. What the gateway can and cannot do

Every item here was verified against the live gateway on **2026-09-11**. The
live suite re-asserts each one, so gateway drift breaks a test rather than your
app. `npm run probe-capabilities` re-derives the whole section on demand.

Two entries changed direction since 0.1.0: prompt caching now works (5.1) and
web search is not Anthropic-only (5.3).

### 5.1 Prompt caching — works, on four models

**This changed on 2026-09-11.** Before a gateway key upgrade, `cache_control`
was accepted and ignored on every model. It now engages, and it is the single
largest cost lever in the package.

Measured with a 4,808-token prefix sent twice:

| Model | Write | Read | Saving |
|---|---|---|---|
| `claude-fable-5-1` | $0.0611 | $0.0021 | **29.2x** |
| `claude-opus-5` | $0.0305 | $0.0028 | **10.7x** |
| `claude-opus-4-7` | $0.0306 | $0.0029 | **10.6x** |
| `claude-sonnet-5` | $0.0122 | $0.0011 | **10.7x** |
| `claude-haiku-4-5` | — | — | **does not cache** |
| `gemini-3.8-flash`, all `gpt-*` | — | — | **do not cache** |
| `glm-*`, `kimi-k3`, `deepseek-*` | — | — | no `cache_control` at all |

Four things follow from that table, and the code depends on each one.

**One. You cannot gate on the model family.** `claude-haiku-4-5` is a Claude
model that does not cache. A `/^claude-/` test would silently mark blocks that
never pay off.

**Two. You cannot gate on the gateway's flag either.**
`model_info.supports_prompt_caching` reports `true` for `claude-haiku-4-5`,
`gemini-3.8-flash` and every `gpt-*`. All six are wrong. `capabilities.js`
carries `CACHE_CAPABLE_MODELS`, a measured list, and `npm run
probe-capabilities -- --paid` re-derives it.

**Three. There is a size floor.** A 735-token block did not cache; a
4,808-token block did. Anthropic documents 1,024 tokens. Below it,
`cache_control` is accepted and does nothing, so `'auto'` declines.

**Four. TTL changes the write price, not the read price.** `5m` writes at 1.25x
the input rate, `1h` at 2x. Reads cost the same either way. Use `'1h'` only when
the prefix outlives five minutes.

#### The three switches

```javascript
new Chat({ cacheSystemPrompt: 'auto' })   // default
new RagAgent({ cacheContext: 'auto' })    // the injected document block
new Transformer({ cacheExamples: 'auto' })// the seeded few-shot prefix
```

Each takes `true | false | 'auto'`.

`'auto'` is the default and it is **silent when it declines**. Caching a block
on a model that cannot cache is not a mistake the caller made, so it produces
no warning. An explicit `true` that cannot be honored IS a caller mistake, and
warns once.

`RagAgent`'s `cacheContext` is usually the biggest win: the document block is
larger than the system prompt and is resent with every question.

#### Cost accounting, and the trap in it

**This gateway INCLUDES cache tokens inside `prompt_tokens`.** A cached call
reports `prompt_tokens: 4815` = `text_tokens: 7` + `cached_tokens: 4808`.

That is Google's convention. `ak-claude` does the opposite: Anthropic EXCLUDES
cache tokens from `input_tokens` and adds them on top. Copying ak-claude's math
here would double-count every cached token. `computeCost()` subtracts the two
cache buckets out of `promptTokens` and re-bills each at its own rate:

```
billable = promptTokens - cacheRead - cacheWrite
cost     = billable*input + cacheRead*cachedInput + cacheWrite*input*ttlMultiplier + output*outputRate
```

All three rows of that formula reproduce the gateway's own
`x-litellm-response-cost` header to the cent. `tests/unit/capabilities.test.js`
pins the exact numbers.

### 5.2 Streamed calls have no cost header

Non-streaming responses carry `x-litellm-response-cost` — the gateway's own
exact figure. Streaming responses do not: the headers flush before token counts
exist, and the `-input`/`-output` variants read `0.0`.

This is why `usage.costSource` exists. See section 6.

### 5.3 Web search — three shapes, three vendors

0.1.0 documented web search as Anthropic-only. **That was wrong.** All three
vendors can search; they simply disagree on the shape, and one of them is not
on the chat-completions route at all.

| Provider | Tool | Route |
|---|---|---|
| Anthropic | `{ type: 'web_search_20250305', name: 'web_search' }` | `/v1/chat/completions` |
| Google | `{ googleSearch: {} }` | `/v1/chat/completions` |
| OpenAI | `{ type: 'web_search' }` | **`/v1/responses` only** |

On chat completions, OpenAI's tool is a hard 400:
`Invalid value: 'web_search'. Supported values are: 'function' and 'custom'`.
So `enableWebSearch` on a `gpt-*` model switches the whole request to
`/v1/responses`. See section 5.8.

`enableWebSearch` and ak-gemini's `enableGrounding` mean the same thing.
`webSearchConfig.max_uses`, `.allowed_domains` and `.blocked_domains` map onto
the Anthropic tool; Google and OpenAI take no configuration and warn once if you
pass any. On `glm-*`, `kimi-*` and `deepseek-*` there is no search tool at all —
the option warns and the call proceeds ungrounded.

Two practical notes:

- **`usage.webSearchRequests`** counts searches. Providers bill them separately
  from tokens (Anthropic around $10 per thousand), and that charge is **not** in
  `estimatedCost`. Anthropic does not report a count, so it reads 0 there.
- **Give a grounded call room.** It spends reasoning tokens before emitting
  text. At `maxTokens: 64` a grounded Gemini reply came back with
  `content: null` — a truncation that reads like a failure. Anything under 1,024
  is raised for you, with one warning.

### 5.4 Google tool-call ids carry a hidden payload

Gemini models on this gateway return tool-call ids like `call_1902376__thought__AY89aQxx`. The suffix is a `thought_signature` the model needs back. ak-litellm echoes tool-call ids verbatim and never regenerates them, so this works. If you build tool responses by hand against the raw client, copy the id exactly.

### 5.5 Exactly one tool response per tool call

The OpenAI protocol requires one `{ role: 'tool', tool_call_id }` message for every entry in `tool_calls`. A partial set is a 400 on both Anthropic and Google.

This shapes `stop()`. Calling `stop()` mid-round does **not** send a partial response set — the agent finishes executing the tools it already started, then halts before the next request.

### 5.6 Classes that cannot exist here

`Embedding`, `ImageGenerator` and `AgentQuery` are exported, and their constructors throw:

```javascript
import { Embedding } from 'ak-litellm';
new Embedding();
// Error: ak-litellm: Embedding is not available. The Mixpanel LiteLLM gateway
// routes chat completions only ... use ak-gemini for embeddings.
```

They throw rather than being absent so that `import { Embedding } from 'ak-litellm'` does not fail at module load, and so the error names the alternative.

### 5.7 Options with no gateway equivalent

Accepted, warned once, ignored:

| Option | Reason given |
|---|---|
| `vertexai`, `project`, `location`, `vertexProjectId`, `vertexRegion`, `googleAuthOptions` | the gateway authenticates with a static bearer key only |
| `safetySettings` | the gateway exposes no content-filter controls |
| `serviceTier` | the gateway does not expose provider service tiers |
| `cachedContent` | the gateway has no explicit-cache API |
| `cacheSystemPrompt`, `cacheTtl` | prompt caching does not work upstream (§5.1) |
| `enableCitations` | no native citation feature; `citations: []` is still returned so destructuring holds |

---

### 5.8 Two transports

`POST /v1/chat/completions` handles everything except OpenAI web search, which
does not exist on that route (5.3). `transport` controls the choice:

| Value | Behaviour |
|---|---|
| `'auto'` (default) | chat completions, except OpenAI web search |
| `'chat'` | always chat completions |
| `'responses'` | always `/v1/responses` |

`responses.js` adapts at both edges — request in, reply out — so `_extractText`,
usage accounting and cost resolution all run unchanged. Callers see the same
`ChatResponse` either way.

The scope is deliberately narrow: text in, text out, with search. Combining
`transport: 'responses'` with function tools throws a clear error rather than
half-supporting it.

### 5.9 Batch is one config line away

`POST /v1/batches` works. `POST /v1/files` returns
`500 files_settings is not set, set it on your config.yaml file`. A batch job
takes its work from an uploaded JSONL file, so batch is unusable end to end.

`BatchTransformer` exists and throws with that exact remedy. Nothing in this
package needs to change — ask the gateway operator to set `files_settings`, then
re-run `npm run probe-capabilities`.

---

## 5A. Assistant prefill

Put words in the model's mouth. The cheapest way to force a shape, with no
schema round-trip:

```javascript
const msg = new Message({ modelName: 'claude-haiku-4-5', prefill: '[' });
const { text, continuation } = await msg.send('List three colors as JSON.');
JSON.parse(text);        // works — `text` includes your '['
continuation;            // the raw model output, without it
```

Behaviour splits three ways, measured across every model on 2026-09-11:

| Mode | Models | What happens |
|---|---|---|
| `continue` | `claude-haiku-4-5`, `gpt-6-astra`, `glm-5.3`, `glm-5.3-flash`, `glm-fast-latest` | The model resumes from your prefix. The wrapper prepends it. |
| `restart` | `gpt-5.5`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `kimi-k3`, `deepseek-v4.1-flash` | 200, but the model re-emits your prefix itself. The wrapper does **not** prepend. |
| `reject` | `claude-sonnet-5`, `claude-opus-5`, `claude-opus-4-7`, `claude-fable-*`, `gemini-3.8-flash`, `advisor`, `executor` | 400 `This model does not support...`. The wrapper drops it and warns once. |

The `restart` row is why this is three modes and not two. Blindly concatenating
there produces `["red",["red","blue"]` — valid-looking, unparseable.

An unknown model is assumed `restart`: the prefix is sent but never prepended,
so the worst case is a wasted hint rather than corrupt output.

Setting `reasoning_effort: 'none'` or `thinking: disabled` does **not** make
Sonnet or Opus accept a prefill. It is a model limit, not a reasoning
interaction.

---

## 5B. Capability gating

The wrapper refuses what it knows will fail, before you spend anything.

```javascript
import { getCapabilities, contextWindow } from 'ak-litellm';

const cap = getCapabilities('claude-haiku-4-5');
// { maxInputTokens: 200000, vision: true, pdf: true, tools: true,
//   promptCaching: false, webSearch: 'anthropic', ... }
```

Where it is applied:

- **`ToolAgent`** throws at construction on a model with no function calling.
  The provider's own error does not say that is the problem.
- **`RagAgent`** skips a PDF on a model with no `supports_pdf_input`, and an
  image on a model with no vision, each with a warning naming the file. 0.1.0
  sent them and let the provider 400 after the upload.
- **`estimate()`** returns `contextWindow`, `fits` and `headroom` alongside
  `inputTokens`.

```javascript
const { inputTokens, contextWindow, fits, headroom } = await chat.estimate(payload);
```

`contextGuard` decides what an over-limit request does: `'warn'` (default) logs
once and sends anyway, `'throw'` fails locally, `'off'` disables the check. The
default is not `'throw'` because the estimate is a 4-chars-per-token heuristic,
and a false positive must never block a valid call.

An unknown model id returns a permissive record with `known: false`. A model the
snapshot has not seen yet is never blocked locally.

---

## 6. Usage and cost accounting

### 6.1 The fields

```javascript
const usage = chat.getLastUsage();
```

| Field | Meaning |
|---|---|
| `promptTokens` | Cumulative input tokens across every round-trip in this turn |
| `responseTokens` | Cumulative output tokens |
| `thoughtsTokens` | Reasoning tokens. Billed at the output rate. Included in `totalTokens` |
| `totalTokens` | Sum of the above |
| `cachedTokens`, `cacheReadTokens`, `cacheCreationTokens` | Always `0` here (§5.1) |
| `attempts` | **API round-trips**, not retries |
| `modelVersion` | What actually answered |
| `requestedModel` | What you asked for |
| `estimatedCost` | USD, or `null` |
| `costSource` | `'gateway'` or `'estimated'` |
| `upstreamModel` | e.g. `vertex_ai/claude-haiku-4-5` |
| `callId` | `x-litellm-call-id`, for correlating with LiteLLM's logs |
| `keySpend` | Cumulative USD on your key, as of this call |

### 6.2 `attempts` means round-trips

In ak-claude and ak-gemini before their 0.3.0 / 2.7.0 defect sweep, `attempts` meant "retries needed" and a multi-round tool turn reported `1`. That was wrong: three tool rounds are three billable API calls.

Here, `attempts` counts API round-trips from the first request of the turn:

- A plain `Chat.send()` → `1`
- A tool turn with one tool round → `2`
- A `Transformer.send()` that failed validation twice then succeeded → `3`
- A `Transformer` attempt whose output could not be parsed → **still counted**, because the gateway was called and you were billed

### 6.3 Where `estimatedCost` comes from

Two sources, and the field tells you which:

**`costSource: 'gateway'`** — the `x-litellm-response-cost` header. This is LiteLLM's own figure, computed from the upstream provider's response. Treat it as exact.

**`costSource: 'estimated'`** — computed from `MODEL_PRICING` and the token counts. Used on streamed calls, where the header does not exist (§5.2).

A turn that mixes both — say a tool loop where one round streamed — falls back to the table **for the whole turn**. Half-exact is worse than consistently estimated, because you cannot tell which half.

`estimatedCost: null` means unknown. It never means free. A model missing from the pricing table produces `null`, not `0`.

### 6.4 Streaming reports real usage

`stream()` requests `stream_options: { include_usage: true }`, reads the final usage chunk, and reports it on the `done` event. It is not stale, and it is not the previous call's numbers.

### 6.5 Stateless classes are concurrency-safe

`Message` builds its usage from its own response object rather than from shared instance state. Ten concurrent `msg.send()` calls each return their own correct usage.

`Chat`, `Transformer` and the agents are stateful by design — they keep history. `getLastUsage()` on those reflects the last completed turn.

---

## 7. Pricing

### 7.1 Never hand-written

`MODEL_PRICING` is generated:

```bash
npm run refresh-pricing
```

The script calls `GET /model/info` on the gateway, rewrites the table in `models.js`, and re-stamps `MODEL_PRICING_AS_OF`. Commit the result.

This is not a style preference. The workspace CLAUDE.md records four wrong rates found in a single audit round of hand-maintained tables, including one that would have overcharged 50% on a default model.

### 7.2 Date-windowed intro rates

Providers ship promotional rates with an end date. `resolvePricing` honors them:

```javascript
resolvePricing('some-model');                      // rate as of now
resolvePricing('some-model', { at: '2026-12-01' }); // rate on that date
computeCost(usage, 'some-model', { at: '2026-12-01' });
```

An entry with an `intro` block uses the intro rate up to and including `until`, then the standard rate.

### 7.3 `computeCost` takes two shapes

```javascript
computeCost({ promptTokens, responseTokens, requestedModel: 'claude-sonnet-5' });
computeCost({ promptTokens, responseTokens }, 'claude-sonnet-5');
```

Reasoning tokens are billed at the output rate. Cache fields are accepted and priced at `0` here.

---

## 8. Reasoning

### 8.1 One knob, three sibling spellings

```javascript
new Chat({ effort: 'high' });                                  // canonical
new Chat({ reasoningEffort: 'high' });                         // ak-gpt name
new Chat({ thinking: { type: 'enabled', budget_tokens: 8192 }}); // ak-claude legacy
new Chat({ thinkingConfig: { thinkingLevel: 'high' } });       // ak-gemini
new Chat({ thinkingConfig: { thinkingBudget: 8192 } });        // ak-gemini legacy
```

All five resolve to `effort`. Budgets convert:

| `budget_tokens` | `effort` |
|---|---|
| `<= 0` | off |
| `<= 2048` | `low` |
| `<= 8192` | `medium` |
| `<= 24576` | `high` |
| above | `xhigh` |

`budgetTokensToEffort(n)` is exported if you need the mapping yourself.

### 8.2 The vocabulary is the union of both siblings

`minimal | low | medium | high | xhigh | max`. The gateway takes three levels, so `minimal` folds into `low` and `xhigh`/`max` fold into `high`. An unrecognized string throws — a typo in a reasoning level should not quietly become the default.

### 8.3 `maxTokens` must exceed the reasoning budget

Anthropic reserves the reasoning budget *out of* `max_tokens`. `maxTokens: 64` with `effort: 'high'` is a 400. ak-litellm catches it and says so:

```
ak-litellm: `maxTokens` is too small for the reasoning budget the gateway
derived from `effort` on model 'claude-haiku-4-5'. Raise `maxTokens` (the
gateway reserves the reasoning budget out of it) or drop `effort`.
```

It does not raise `maxTokens` for you. Guessing at LiteLLM's effort-to-budget mapping and overriding an explicit caller setting would be worse than an error message.

---

## 9. The compatibility layer

`compat.js` is one function, `normalizeOptions(raw, className)`, plus the helpers it uses. It is idempotent, so it can run in both a subclass constructor and the base constructor without double-warning.

Four kinds of work:

**Synonyms.** `maxOutputTokens` → `maxTokens`, `reasoningEffort` → `effort`, `enableGrounding` → `enableWebSearch`, `groundingConfig` → `webSearchConfig`, `resourceExhaustedRetries` → `maxRetries`, `resourceExhaustedDelay` → `retryDelay`. If both names are given, the canonical one wins.

**Shape translations.** `thinking`/`thinkingConfig` → `effort`. `responseMimeType: 'application/json'` → a JSON response format. `toolConfig.functionCallingConfig` → `tool_choice`. Anthropic `tool_choice` object forms → OpenAI's. Tool declarations from any of four spellings — `input_schema`, `inputSchema`, `parametersJsonSchema`, `function.parameters` — into the OpenAI function shape.

**Accepted-and-ignored.** §5.7.

**Parameter gating.** §4.

### 9.1 Warn-once semantics

Warnings are keyed by option name in a process-global registry (`globalThis.__akLitellmCompatWarned`). Ten instances constructed with `vertexai: true` produce one warning.

Suppress them two ways, and only two ways:

```javascript
new Chat({ vertexai: true, logLevel: 'none' });   // per instance
```
```bash
AK_LITELLM_SILENCE_COMPAT=1 node app.js           # process-wide
```

`logLevel: 'error'` does **not** suppress them. A compat warning says an option you wrote will not take effect — that is not something an error-level log setting should hide.

An instance constructed with `logLevel: 'none'` still *registers* the key, so a later noisy instance does not re-warn for the same option. This keeps "once per process" honest.

---

## 10. Errors

`client.js` maps four gateway failures onto messages you can act on. Everything else surfaces unchanged.

| Condition | What you get |
|---|---|
| 401, or `token_not_found_in_db` | "the gateway rejected the API key (401) … missing, wrong, or revoked" |
| `Invalid model name` | "the gateway does not serve model '<id>'" |
| `thinking.budget_tokens` in the message | The `maxTokens` explanation from §8.3 |
| `UnsupportedParamsError` | "This is an ak-litellm bug — the compatibility layer should have gated this parameter out. Please report it." |

The original error is preserved on `.cause` in every case.

429 and 5xx are retried by the OpenAI SDK with backoff before they ever reach this code — `maxRetries` defaults to 5. `resourceExhaustedRetries` is the same setting under ak-gemini's name.

Nothing is swallowed and nothing falls back to another model. If your model is down, you get an error, not a silent substitution on a different bill.

---

## 11. Testing

```bash
npm test           # unit — offline
npm run test:live  # live — LITELLM_LIVE=1, real spend
```

### Unit suite

Fully offline. `tests/unit/_harness.js` mocks the `openai` module with `jest.unstable_mockModule`, so nothing can reach the network even if a code path tried. It sets a fake key and an unroutable base URL before `dotenv` loads.

The harness gives you a request log and a response queue:

```javascript
mock.queue(chatResponse('hello', { promptTokens: 10, responseTokens: 5 }));
await chat.send('hi');
expect(mock.lastRequest().max_tokens).toBe(8192);
```

Four files: `compat.test.js` (the alias layer), `pricing.test.js` (the table), `request-shape.test.js` (what goes on the wire), `consumer-fixes.test.js` (the regression suites ported from both siblings).

### Live suite

Gated behind `LITELLM_LIVE=1`; without it every test skips, so a plain `npm test` never spends. It uses `claude-haiku-4-5` with `maxTokens` capped low, tracks its own spend, prints the total, and asserts it stayed under $0.50. A full run is well under a cent.

It exists to catch gateway drift. Every claim in section 5 has a test.

### Do not run the siblings' suites

This only applies inside the private `ak-ai-wrappers` workspace. `ak-claude`, `ak-gemini` and `ak-gpt` make real, paid API calls in their tests. Verify workspace-wide changes with `npm run typecheck:litellm` and `npm run build:litellm` instead.

### Jest and ESM

This workspace needs the flags:

```bash
node --no-warnings --experimental-vm-modules node_modules/jest/bin/jest.js tests/unit
```

Plain `npx jest` fails on ESM.

---

## 12. Migrating

### From ak-claude

Change the import. That is it.

Then check three things:

1. **Prompt caching.** If you set `cacheSystemPrompt`, your cost goes up (§5.1). You will see one warning.
2. **`AgentQuery`.** Not available (§5.6). Keep `ak-claude` for that path.
3. **Vertex options.** `vertexai`, `vertexProjectId`, `vertexRegion` warn and do nothing. The gateway handles routing.

### From ak-gemini

Change the import. Then check:

1. **`Embedding` and `ImageGenerator`.** Not available (§5.6). Keep `ak-gemini` for those.
2. **Cache CRUD.** `createCache`, `useCache`, `deleteCache` and friends have no gateway equivalent.
3. **`remoteFiles`.** Aliased to `mediaFiles`, which means base64 inline rather than a Files API upload. Images and PDFs work; audio and video do not.
4. **`safetySettings`.** Warns and does nothing.
5. **`labels`.** These do work — they become LiteLLM `metadata.tags` for cost segmentation, both on the constructor and per message.

### Running both

Nothing stops you importing `ak-claude` and `ak-litellm` in the same process. The classes share no state.

---

## 13. Reference

- [`types.d.ts`](types.d.ts) — the full typed surface
- [`README.md`](README.md) — API overview
- [`CHANGELOG.md`](CHANGELOG.md) — version history
- [`ak-claude`](https://github.com/ak--47/ak-claude) and [`ak-gemini`](https://github.com/ak--47/ak-gemini) — the sibling packages this one is a drop-in for
- `docs/superpowers/specs/2026-09-08-ak-litellm-design.md` — the design spec, including the raw live-probe results this package is built on. It lives in the private `ak-ai-wrappers` workspace and does not ship here.
