# CLAUDE.md

Guidance for Claude Code when working in `ak-litellm`.

## Module Overview

`ak-litellm` wraps a LiteLLM gateway and presents the same public API as [`ak-claude`](https://github.com/ak--47/ak-claude) and [`ak-gemini`](https://github.com/ak--47/ak-gemini). It defaults to Mixpanel's deployment at `https://litellm.mixpanel.org`; `LITELLM_BASE_URL` points it elsewhere.

**The one design constraint: it is a drop-in.** An app that imports `ak-claude` or `ak-gemini` must run unchanged after swapping only the import line. Every decision in this package follows from that. Before changing anything, ask whether the change breaks a sibling-package caller.

This package is developed inside the private `ak-ai-wrappers` workspace alongside its three sibling packages. If you are working there, read the workspace root `CLAUDE.md` and the design spec at `docs/superpowers/specs/2026-09-08-ak-litellm-design.md` first — the spec holds the raw live-probe results this package is built on. Neither file ships in this repo. Everything you need to work on the package standalone is here.

If a gateway behavior surprises you, check the "Things that will bite you" section below before changing code. Most surprises are upstream facts with a test already asserting them.

---

## Architecture

### File structure

| File | Lines | Role |
|---|---|---|
| `base.js` | 1064 | `BaseLiteLLM`. Request building, sampling/reasoning gating, usage accounting, cost resolution, history, streaming plumbing. |
| `compat.js` | 564 | The drop-in alias layer. `normalizeOptions()` plus the helpers it uses. |
| `models.js` | 382 | Generated pricing table, model info, aliases, `resolvePricing`, `computeCost`. |
| `client.js` | 231 | Transport. Client construction, header parsing, error mapping, health check. |
| `unsupported.js` | 62 | `Embedding`, `ImageGenerator`, `AgentQuery` — constructors throw. |
| `transformer.js` | 443 | JSON transformation with few-shot, validation, retry. |
| `chat.js` | 109 | Multi-turn text. |
| `message.js` | 244 | Stateless one-off, structured output, validation retry. |
| `tool-agent.js` | 392 | Agent over caller-supplied tools. |
| `code-agent.js` | 1146 | Six-tool coding agent. |
| `rag-agent.js` | 343 | Context-injection Q&A. |
| `json-helpers.js` | 453 | `extractJSON`, `attemptJSONRecovery`, `validateSchema`. |
| `index.js` | 98 | Public surface. |
| `cli.js` | 64 | Interactive chat, `--models`. |
| `types.d.ts` | 843 | The full typed surface. |
| `scripts/refresh-pricing.mjs` | 95 | Regenerates the `models.js` table from `GET /model/info`. |

Tests: `tests/unit/` (offline, 117 tests) and `tests/live/` (gated, 16 tests).

### Class hierarchy

```
BaseLiteLLM  (also exported as BaseClaude and BaseGemini)
├── Transformer
├── Chat
├── Message
├── ToolAgent
├── CodeAgent
└── RagAgent
```

`BaseClaude` and `BaseGemini` are the *same object* as `BaseLiteLLM`, not subclasses. Sibling code that does `class Foo extends BaseClaude` keeps working. `tests/unit/consumer-fixes.test.js` asserts the identity.

### Key design decisions

1. **One transport: `POST /v1/chat/completions`.** No `/v1/messages`, no `/v1/responses`. Every model, one protocol.
2. **The `openai` npm SDK is the HTTP client**, pointed at the gateway. Not raw `fetch`. It brings SSE parsing, retry with backoff, timeouts, and `.withResponse()` — which is the only way to read the cost header.
3. **`compat.js` is idempotent.** `normalizeOptions()` runs in subclass constructors *and* in the base constructor. Running it twice must not double-warn or double-translate.
4. **Warnings, never throws, never silence.** An option the gateway cannot honor warns once per process and is ignored. The only two suppressors are `logLevel: 'none'` and `AK_LITELLM_SILENCE_COMPAT=1`.
5. **Cost comes from the gateway when it can.** The `x-litellm-response-cost` header is authoritative. The pricing table is the fallback, flagged as such.
6. **Never hand-write the pricing table.** Regenerate it.

---

## Things that will bite you

These are verified live, not guesses. Do not "fix" the code that handles them.

### `drop_params` is OFF on this deployment

Most LiteLLM deployments strip parameters the upstream provider rejects. This one forwards them and you get a 400. `compat.samplingSupport()` gates by model family from a live probe. If you add a model, probe it.

The probe results (2026-09-08):

| Family | `temperature` | `top_p` | `top_k` |
|---|---|---|---|
| `claude-sonnet-5`, `claude-opus-*`, `claude-fable-*` | reject | reject | reject |
| `claude-haiku-4-5` | accept alone | reject with `temperature` | reject |
| any `claude-*` while `reasoning_effort` is set | reject | reject | reject |
| `gpt-*` | reject | reject | reject |
| `gemini-*`, `glm-*`, `kimi-*`, `qwen*`, `deepseek-*` | accept | accept | accept |

The reasoning row is why `_applySamplingParams()` runs **after** `_applyReasoningParams()` and passes `{ reasoning: !!params.reasoning_effort }` to `samplingSupport()`. Do not reorder them.

### Prompt caching does not work

`cache_control` is accepted and ignored upstream. Cache token counts are always zero. `cacheSystemPrompt` and `cacheTtl` warn. Do not add a cache implementation — it is blocked upstream, not missing here.

### No cost header on streams

`x-litellm-response-cost` is absent on streaming responses, and the `-input`/`-output` variants read `0.0`. This is the entire reason `costSource` exists. A turn mixing streamed and non-streamed rounds falls back to the table **wholesale** — half-exact is worse than consistently estimated.

### Anthropic reserves the reasoning budget out of `max_tokens`

`maxTokens: 64` with `effort: 'high'` is a 400. `client.mapGatewayError()` catches `thinking.budget_tokens` and explains it. It deliberately does **not** raise `maxTokens` — that would override an explicit caller setting and guess at LiteLLM's effort-to-budget mapping.

### Google tool-call ids carry a `thought_signature`

Ids look like `call_1902376__thought__AY89aQxx`. Echo them back verbatim. Never regenerate a tool-call id.

### Exactly one tool response per tool call

A partial set is a 400 on both Anthropic and Google. This is why `stop()` guards *before the next send*, not mid-round.

---

## Key APIs

### BaseLiteLLM (`base.js`)

Public: `init()`, `seed()`, `getHistory()`, `clearHistory()`, `getLastUsage()`, `estimate()`, `estimateCost()`, `listModels()`, `clients`.

Protected, and the ones you will touch:

| Method | Role |
|---|---|
| `_buildRequestParams(opts)` | The single place a request body is assembled. |
| `_buildTools(tools, model)` | Normalizes declarations and prepends the web-search server tool. |
| `_applyReasoningParams(params)` | `effort` → `reasoning_effort`. Runs first. |
| `_applySamplingParams(params, model)` | Gates `temperature`/`top_p`/`top_k`. Runs second. |
| `_call(params)` | The round-trip. Captures headers via `.withResponse()`. |
| `_resetUsage()` | Start of a turn. |
| `_accumulateUsage(response, headers)` | One round-trip's tokens and cost, added to the turn. |
| `_accumulateLastMetadata()` | Same, from `lastResponseMetadata`, for callers that already made the call. |
| `_streamUsage(chunk)` | The final usage chunk of a stream. |
| `_resolveCost()` | Header cost if every round had one, table estimate otherwise. |
| `_captureMetadata(response, headers)` | Builds a fresh `lastResponseMetadata` per round-trip. Identity matters — `transformer.js` compares it. |

`clients` is `{ openai, raw, anthropic: null, vertex: null }`. The two nulls are deliberate: nothing here talks to a provider directly.

### compat.js

`normalizeOptions(raw, className)` is the entry point. Also exported: `warnOnce`, `samplingSupport`, `modelProvider`, `supportsTopK`, `supportsWebSearch`, `normalizeToolDeclarations`, `normalizeToolChoice`, `buildWebSearchTool`, `labelsToMetadata`, `normalizeEffort`, `effortToReasoningEffort`, `_resetWarnings` (test seam).

`warnOnce` writes through pino when the level allows it and falls back to `console.warn` when it does not. That is intentional: `logLevel: 'error'` must not hide a compat warning.

### models.js

`MODEL_PRICING`, `MODEL_PRICING_AS_OF`, `MODEL_INFO`, `MODEL_ALIASES`, `EFFORT_LEVELS`, `DEFAULT_MODEL`, `resolvePricing`, `computeCost`, `budgetTokensToEffort`, `listModels`, `getModelInfo`, `refreshModelInfo`.

Alias resolution here is **silent**. The single warning lives in `compat.resolveModelName()`, to avoid a circular import.

`computeCost` takes two shapes: `computeCost(usageWithRequestedModel)` and `computeCost(usage, modelId)`. Both honor `{ at }` for date-windowed intro rates.

---

## Development commands

Run from this directory, or with `npm --prefix`.

```bash
npm run typecheck        # tsc --noEmit — fast, free, the default check
npm run build:cjs        # esbuild → index.cjs
npm test                 # unit suite, offline, no spend
npm run test:live        # LITELLM_LIVE=1, real spend, under a cent
npm run refresh-pricing  # regenerate the models.js table from GET /model/info
node cli.js --models     # list every model with rates and capability flags
```

**Do not run the sibling packages' test suites.** They make real, paid API calls.

Jest needs the ESM flags. `npm test` already has them. To run one file:

```bash
node --no-warnings --experimental-vm-modules node_modules/jest/bin/jest.js tests/unit/compat.test.js
```

Plain `npx jest` fails on ESM.

---

## Environment

| Variable | Purpose |
|---|---|
| `LITELLM_API_KEY` | Required. The gateway bearer key. |
| `LITELLM_BASE_URL` | Optional. Defaults to `https://litellm.mixpanel.org`. |
| `LITELLM_LIVE` | Set to `1` to un-skip the live suite. |
| `AK_LITELLM_SILENCE_COMPAT` | Set to `1` to suppress every compat warning. |
| `NODE_ENV` | Drives the default log level. |

`.env` is gitignored and holds a **live production key with a real budget**. Never commit it, never log it, never put it in a test fixture. The unit harness sets its own fake key before `dotenv` loads.

---

## Testing strategy

**Unit (`tests/unit/`, 117 tests, default `npm test`).** Fully offline. `_harness.js` mocks the `openai` module with `jest.unstable_mockModule`, so no code path can reach the network. Import the harness statically, then `await setup()` to dynamic-import `index.js`.

- `compat.test.js` — the alias layer, warn-once semantics, gating tables
- `pricing.test.js` — table completeness, aliases, intro windows, `computeCost`
- `request-shape.test.js` — what actually goes on the wire
- `consumer-fixes.test.js` — the regression suites ported from `ak-claude` and `ak-gemini`

**Live (`tests/live/`, 16 tests).** Gated on `LITELLM_LIVE=1`. Uses `claude-haiku-4-5` with low caps, tracks its own spend, prints the total, and asserts it stayed under $0.50. Every gateway limitation in this file has a test there, so gateway drift breaks a test rather than a consumer's app.

**Drop-in proofs.** `scratch-dropin-claude.mjs` and `scratch-dropin-gemini.mjs` are sibling-package application code with one changed import each. Run them after any change to `compat.js`, `base.js` or a class constructor. They throw on the first missing field rather than logging a soft warning.

---

## When adding a feature

1. Check whether `ak-claude` or `ak-gemini` already has it, and match their names and result shapes.
2. If the gateway cannot support it, add it to the accepted-and-ignored table in `compat.js` with a reason. Do not throw.
3. If it needs a provider-specific parameter, probe the model families live before shipping. `drop_params` is off.
4. Add a unit test. Add a live test if it depends on gateway behavior.
5. Run `npm run typecheck`, `npm test`, and both drop-in scripts.
