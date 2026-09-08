# Changelog

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
