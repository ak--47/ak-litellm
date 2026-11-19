# Changelog

## 0.2.1 — 2026-11-19

Bug fix. No API change.

### Fixed

- **`gemini-3.8-flash` failed on every call with default options.** From about
  06:34 UTC on 2026-11-19 the gateway rejects `temperature` and `top_p` for
  this model with `UnsupportedParamsError`. 0.2.0 sent both by default (0.7 /
  0.95), because `samplingSupport()` allowed all three sampling params for
  every model that was not Anthropic or OpenAI.
- **`claude-haiku-4-5` failed on every call with default options.** It now
  routes to `claude-haiku-5-5`, which rejects all three sampling params.
  `CLAUDE5_FAMILY_REGEX` now matches `haiku-5`.

### Changed

- `samplingSupport()` reads the gateway's own list first. Each `MODEL_INFO`
  entry carries `supportedParams` (`model_info.supported_openai_params`, or
  `null` when the gateway publishes none). The measured family rules still
  apply, combined by AND, so either source can remove a parameter and neither
  can add one back.
- **Runtime recovery.** If the gateway rejects only `temperature`, `top_p` or
  `top_k`, and the request carried one of them, ak-litellm strips them,
  retries (once per newly rejected parameter, at most three times), and stops
  sending them to that model for the rest of the process. It warns once per
  model and tells you to run `npm run refresh-pricing`. Any other rejected
  parameter throws as before.
- The model snapshot is regenerated from the gateway (`MODEL_PRICING_AS_OF`
  2026-11-19). The roster grew from 19 to 50 ids, several existing ids now
  route to newer upstream models, and some rates changed. `claude-haiku-4-5`
  now reads $0.10 / $0.50 per M and a 1M-token window.

### Known gateway drift not fixed here

The live suite has three failures that 0.2.0 also has. All three come from
`claude-haiku-4-5` now routing to `claude-haiku-5-5`:

- It now caches, but `CACHE_CAPABLE_MODELS` excludes it.
- It now rejects assistant prefill, but `PREFILL_MODES` says `continue`, so
  `prefill` on `claude-haiku-4-5` is a 400.
- `maxTokens: 64` with `effort: 'high'` no longer fails.

## 0.2.0 — 2026-09-11

The batteries-included pass. Prompt caching became real when the gateway key was
upgraded, and a capability audit found four more live features 0.1.0 never used.

**Minor** bump: everything is additive, both drop-in proof scripts still pass
unmodified, and no signature changed. But `estimatedCost` moves — downward, and
by a lot — on any workload with a repeated prefix.

### The headline: prompt caching works

0.1.0 documented prompt caching as blocked upstream. That was true on
2026-09-08 and is false now. Measured on a 4,808-token prefix:

| Model | Write | Read | Saving |
|---|---|---|---|
| `claude-fable-5-1` | $0.0611 | $0.0021 | **29.2x** |
| `claude-opus-5` | $0.0305 | $0.0028 | **10.7x** |
| `claude-opus-4-7` | $0.0306 | $0.0029 | **10.6x** |
| `claude-sonnet-5` | $0.0122 | $0.0011 | **10.7x** |

**It is on by default.** `cacheSystemPrompt`, `cacheContext` (RagAgent's
document block) and `cacheExamples` (Transformer's few-shot prefix) all default
to `'auto'`: cache when the model supports it and the block clears ~1,024
tokens, silently decline otherwise. `cacheTtl: '5m' | '1h'` works; `1h` writes
at 2x the input rate instead of 1.25x.

Two things this release gets right that are easy to get wrong:

- **`model_info.supports_prompt_caching` is wrong** — it claims `true` for
  `claude-haiku-4-5`, `gemini-3.8-flash` and every `gpt-*`, none of which cache.
  `capabilities.CACHE_CAPABLE_MODELS` is a measured list and overrides it.
- **This gateway INCLUDES cache tokens in `prompt_tokens`** (Google's
  convention, not Anthropic's). `computeCost()` subtracts them out and re-bills
  each bucket at its own rate. All three cases reproduce the gateway's own
  `x-litellm-response-cost` header to the cent.

### Added

- **Web search on all three vendors.** One `enableWebSearch` option now covers
  the Anthropic server tool, Gemini `{ googleSearch: {} }`, and OpenAI
  `{ type: 'web_search' }`. 0.1.0 claimed search was Anthropic-only; wrong.
  `usage.webSearchRequests` counts searches, which providers bill separately
  from tokens and which are **not** in `estimatedCost`. A grounded call with
  `maxTokens` under 1,024 is raised, because a low cap returns empty content.
- **`/v1/responses` transport.** OpenAI web search is a hard 400 on chat
  completions, so `transport: 'auto'` switches route for that one case.
  `responses.js` adapts at both edges; callers see the same response shape.
  New `transport: 'chat' | 'responses' | 'auto'` option.
- **Assistant prefill.** `prefill: '['` makes the reply start as JSON with no
  schema round-trip. Three measured behaviours — `continue`, `restart`,
  `reject` — handled separately, because concatenating on a `restart` model
  produces corrupt output. `result.continuation` holds the raw output.
- **Capability layer.** `getCapabilities()`, `contextWindow()`,
  `supportsVision/Pdf/Tools/Reasoning()`, `supportsPromptCaching()`,
  `prefillMode()`, `webSearchStyle()`. `ToolAgent` now throws at construction on
  a model with no function calling; `RagAgent` skips a PDF or image the model
  cannot read instead of letting the provider 400 after the upload.
- **Context-window awareness.** `estimate()` returns `contextWindow`, `fits`
  and `headroom`. New `contextGuard: 'throw' | 'warn' | 'off'` (default
  `'warn'`, because the estimate is a heuristic and a false positive must not
  block a valid call).
- **`npm run probe-capabilities`.** Re-derives the whole capability matrix
  against the live gateway and diffs it against the committed snapshot. Free by
  default; `-- --paid` also re-measures caching and prefill. This is how the
  next drift gets caught.
- **`examples/`** — seven runnable recipes, each under 40 lines, each printing
  what it cost. All seven verified end to end.

### Changed

- **Model roster refreshed.** `deepseek-v4-pro` and `qwen3.8-max` were withdrawn
  from the gateway and returned 400; `deepseek-v4-flash` became
  `deepseek-v4.1-flash`. `listModels()` was offering three dead ids.
  `deepseek-v4-flash` now aliases to its successor. `MODEL_PRICING_AS_OF` is
  `2026-09-11`.
- **`MODEL_INFO` carries ten more capability fields**, plus the two flags this
  package deliberately distrusts, named `gatewaySaysSupportsWebSearch` and
  `gatewaySaysSupportsPromptCaching` so nobody reads them by accident.
- **`apiKey` is now non-enumerable** on every instance. Still readable as
  `this.apiKey`, but no longer appears in `Object.keys()` or a `JSON.stringify`
  of the instance.
- **`cacheTtl` throws on a value other than `'5m'` or `'1h'`.** Silently
  coercing would either overcharge 2x or disable the cache.

### Fixed

- `computeCost()` ignored cache tokens entirely, which was harmless when they
  were always zero and is a 10x error now.

### Docs

README, GUIDE and AGENTS.md rewritten wherever they described caching or web
search — both were documented as impossible. New GUIDE sections for the two
transports, prefill modes, and capability gating.

### Testing

- Unit: **153 tests**, still fully offline. New `capabilities.test.js` pins the
  caching gate, the exact cost arithmetic, all three prefill modes, and the
  Responses adapters.
- Live: **24 tests**, `$0.14` a run against a `$0.50` ceiling. New assertions
  that a cache read costs materially less than a write, that `claude-haiku-4-5`
  does **not** cache, that Gemini grounding reports `web_search_requests > 0`,
  and that OpenAI web search completes over `/v1/responses`.
- Both drop-in proof scripts pass unmodified — the 0.1.0 contract is intact.

### Still unavailable

`BatchTransformer` is exported and throws. `/v1/batches` works, but
`POST /v1/files` returns `files_settings is not set`, so a job has no input
file. That is one line of gateway config, not a wrapper change. Embeddings,
image generation and `AgentQuery` remain impossible: all 19 gateway models are
`mode: chat`. Spend introspection is 403 — the key is scoped to
`llm_api_routes`.

## 0.1.0 — 2026-09-08

Initial release.

A drop-in replacement for `ak-claude` and `ak-gemini` that routes every call through Mixpanel's LiteLLM gateway at `https://litellm.mixpanel.org`. An app written against either sibling runs unchanged after swapping the import line.

### Classes

All six shared workspace classes, with matching signatures and result shapes:

- `Transformer` — `send()`, `rawSend()`, `rebuild()`, `seed()`, `reset()`, `updateSystemPrompt()`
- `Chat` — `send()`, `stream()`
- `Message` — `send()`, stateless and concurrency-safe
- `ToolAgent` — `chat()`, `stream()`, `stop()`
- `CodeAgent` — `chat()`, `stream()`, `stop()`, `dump()`; six built-in tools
- `RagAgent` — `chat()`, `stream()`

`BaseLiteLLM` is exported, and also as `BaseClaude` and `BaseGemini`, so sibling code that subclasses a base class keeps working.

### Transport

- `POST /v1/chat/completions` for every model, via the `openai` SDK pointed at the gateway.
- `GET /v1/models` health check behind `healthCheck: true`.
- `GET /model/info` for pricing generation.
- SDK-level retry with backoff on 429 and 5xx; `maxRetries` defaults to 5.
- Errors mapped to actionable messages for a bad key, an unserved model, a `maxTokens`/reasoning-budget clash, and `UnsupportedParamsError`. The original is preserved on `.cause`.

### Compatibility layer

- Synonyms accepted for `maxOutputTokens`, `reasoningEffort`, `enableGrounding`, `groundingConfig`, `resourceExhaustedRetries`, `resourceExhaustedDelay`.
- Shape translations for `thinking`, `thinkingConfig`, `responseMimeType`, `toolConfig`, Anthropic `tool_choice`, and all four tool-schema spellings (`input_schema`, `inputSchema`, `parametersJsonSchema`, `function.parameters`).
- Options with no gateway equivalent are accepted, warned about once per process, and ignored — never thrown, never silent. Suppress with `logLevel: 'none'` or `AK_LITELLM_SILENCE_COMPAT=1`.
- Sampling parameters gated by model family. This deployment has `drop_params` off, so an unsupported parameter is a 400 rather than a no-op.
- `null` and `undefined` differ on `temperature`, `topP` and `topK`: `null` means never send, `undefined` means use the default.

### Reasoning

- `effort` accepts `minimal | low | medium | high | xhigh | max` and maps onto the gateway's three levels. An unrecognized level throws.
- ak-claude's `thinking.budget_tokens` and ak-gemini's `thinkingConfig.thinkingBudget` convert via `budgetTokensToEffort()`.
- Anthropic models drop all sampling parameters while reasoning is on, matching the provider's own rule.

### Usage and cost

- `_resetUsage()` / `_accumulateUsage()` / `_streamUsage()` from the day-one base class. `stream()` reports real usage; multi-round agent turns sum every round.
- `usage.attempts` counts API round-trips, not retries. A round-trip that came back unparseable still counts — it was billed.
- `usage.estimatedCost` from the gateway's own `x-litellm-response-cost` header when present (`costSource: 'gateway'`), from the pricing table otherwise (`costSource: 'estimated'`). A turn mixing both falls back to the table wholesale.
- `null` cost means unknown, never free.
- `usage.upstreamModel`, `usage.callId` and `usage.keySpend` surface the gateway's response headers.

### Pricing

- `MODEL_PRICING` generated from `GET /model/info` by `scripts/refresh-pricing.mjs`, never hand-written. `MODEL_PRICING_AS_OF` = `2026-09-08`.
- `resolvePricing(id, { at })` and `computeCost(usage, id, { at })` honor date-windowed intro rates.
- `MODEL_ALIASES` maps eight retired sibling-package model ids onto live ones, warning once.
- 19 general-purpose models; `listModels({ includeIntegration: true })` adds the two team-scoped endpoints.
- Default model: `claude-sonnet-5`.

### Known gateway limitations

Verified live on 2026-09-08 and re-asserted by the live suite:

- **Prompt caching does not work.** `cache_control` is accepted and ignored upstream. `cacheSystemPrompt` and `cacheTtl` warn; all cache token counts are `0`.
- **No cost header on streams.** `x-litellm-response-cost` is absent on streaming responses.
- **`drop_params` is off.** Provider-specific parameters are gated by ak-litellm, by model family.
- **Web search** is the Anthropic server tool only, on `claude-*` models only.
- **Google tool-call ids** carry a hidden `thought_signature`; ids are echoed back verbatim.
- `Embedding`, `ImageGenerator` and `AgentQuery` are exported but throw from the constructor, naming the sibling package to use instead.

### Testing

- Unit suite: 117 tests, fully offline, mocks the `openai` module. This is the default `npm test`.
- Live suite: 16 tests behind `LITELLM_LIVE=1`, `claude-haiku-4-5` with low caps, asserts total spend under $0.50. A full run costs under a cent.
- Drop-in proofs: `scratch-dropin-claude.mjs` and `scratch-dropin-gemini.mjs`, each sibling-package application code with one changed import.
