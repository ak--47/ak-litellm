# Gateway-driven sampling parameters

Status: proposed, 2026-11-19. Owner: AK.

## Problem

On 2026-11-19, from about 06:34 UTC, the gateway answers every
`gemini-3.8-flash` request that carries `temperature` or `top_p` with:

```
litellm.UnsupportedParamsError: vertex_ai does not support parameters:
['temperature', 'top_p'], for model=gemini-3.8-flash.
```

`drop_params` is off and `gemini-3.8-flash` has no fallback group, so the
call fails. Before this date the same requests succeeded. Nothing in
ak-litellm changed; the gateway did (most likely a LiteLLM upgrade that
changed its model map).

ak-litellm 0.2.0 sends both parameters by default:

- `base.js:134-135` defaults `temperature` to 0.7 and `topP` to 0.95.
- `_applySamplingParams` (`base.js:370`) gates them through
  `samplingSupport` (`compat.js:169`).
- `samplingSupport` is a fixed table. It special-cases Anthropic and OpenAI
  and returns `{ temperature: true, topP: true, topK: true }` for every
  other model, so it sends both to `gemini-3.8-flash`.

`client.js:189` then classifies the 400 as "an ak-litellm bug". That is
accurate: the compatibility layer is the thing that should gate it.

Impact: DM4's default model failed for every conversation and build in
production until DM4 shipped an app-side workaround (it passes
`temperature: null, topP: null` for `gemini-3.8-flash`). Any other consumer
on the default settings and `gemini-3.8-flash` is still broken.

## Evidence (measured 2026-11-19, gateway on localhost:4000)

| request to `gemini-3.8-flash` | result |
|---|---|
| no sampling params | 200 |
| `temperature: 0.7` | 400 UnsupportedParamsError `['temperature']` |
| `top_p: 0.95` | 400 UnsupportedParamsError `['top_p']` |
| both | 400 UnsupportedParamsError `['temperature', 'top_p']` |

The same request with both params returned 200 on `gemini-4-argon`,
`gemini-4-neon`, `deepseek-v4.1-flash`, `kimi-k3.1` and `glm-5.3`.

`GET /model/info` for `gemini-3.8-flash` now reports
`model_info.supported_openai_params` as:

```
max_tokens, max_completion_tokens, stream, tools, functions, tool_choice,
response_format, n, stop, extra_headers, seed, logprobs, top_logprobs,
modalities, audio, parallel_tool_calls, web_search_options,
include_server_side_tool_invocations, service_tier, reasoning_effort, thinking
```

`temperature` and `top_p` are absent. The gateway already publishes the
answer; the package does not read it.

## Goal

ak-litellm never sends a sampling parameter the gateway has said it rejects
for that model, and a future gateway change of the same kind costs one
retry and a warning, not a failed call and a package release.

## Non-goals

- No change to `effort`, reasoning, web search, or caching gating.
- No change to the default values (0.7 / 0.95) for models that accept them.
- No gateway configuration change. `drop_params` stays off; this package
  owns gating, as `AGENTS.md` says.

## Design

Three changes, in order of priority. 1 and 2 ship together; 3 is optional.

### 1. Snapshot `supported_openai_params`

`buildTablesFromModelInfo` (`models.js`, run by
`scripts/refresh-pricing.mjs`) adds one field per model to `MODEL_INFO`:

```js
supportedParams: [...]   // model_info.supported_openai_params, or null if absent
```

`null` means "the gateway did not say", never "supports nothing".

Then refresh the snapshot so `gemini-3.8-flash` carries the list above.

### 2. `samplingSupport` reads the snapshot first, then the measured rules

```js
const listed = getModelInfo(modelId)?.supportedParams;
const gateway = Array.isArray(listed)
  ? { temperature: listed.includes('temperature'),
      topP: listed.includes('top_p'),
      topK: listed.includes('top_k') }
  : { temperature: true, topP: true, topK: true };
```

Combine with the existing measured rules by AND, never OR:

- The Anthropic rules (Claude 5 family and reasoning reject all three;
  Vertex Claude rejects temperature with top_p) stay as they are and can
  only remove a parameter.
- The OpenAI rule stays.
- `exclusiveTempTopP` is unchanged.

Before shipping, check `top_k` per family: LiteLLM's OpenAI-shaped list may
omit `top_k` for models that accept it through provider passthrough. Probe
each family live (`npm run probe-capabilities`). If a family accepts
`top_k` that the list omits, keep a measured exception in `compat.js` with
the probe date, in the same style as `capabilities.js`.

Update the doc table above `samplingSupport` to say the gateway list is the
first source.

### 3. Runtime recovery for a gateway that changes after a release (optional)

The snapshot is committed, so a gateway change after publish breaks callers
again until the next refresh. To close that gap:

- In the request path, when the gateway returns `UnsupportedParamsError`,
  parse the bracketed list.
- If every listed name is in `{temperature, top_p, top_k}`, record those
  names in a process-level `Map<modelId, Set<param>>`, strip them, and retry
  the request ONCE. `_applySamplingParams` consults the map on every later
  request, so the retry happens once per model per process.
- Log one `warn` per model: model, dropped params, and "run
  refresh-pricing". Do not log at debug; this is a drift signal.
- If the list contains any other parameter, or the retry also fails, throw
  the existing `client.js` error unchanged.

This handles a declared, recoverable incompatibility; it does not hide an
error. Anything outside the three sampling params still fails loudly.

Rejected alternative: fetch `/model/info` live at `init()`. It adds a round
trip to every agent start, and not every gateway key can read admin routes.
The snapshot plus runtime recovery covers the same cases without either cost.

## Tests

Use the existing test style (no mocks of package internals; a local fake
gateway where a gateway is needed).

- `samplingSupport('gemini-3.8-flash')` returns temperature, topP and topK
  false with the refreshed snapshot.
- A model whose snapshot lists `temperature` and `top_p` keeps both.
- A model with `supportedParams: null` falls back to today's behaviour.
- Anthropic and OpenAI results do not change (pin the current outputs
  before the edit).
- `_applySamplingParams({})` on a `Chat` for `gemini-3.8-flash` with default
  options returns `{}`.
- (If 3 ships) Fake gateway returns `UnsupportedParamsError ['temperature']`
  on the first call and 200 on the second: one retry, no `temperature` on
  the retry, one warn, and the next request sends no `temperature` with no
  retry.
- (If 3 ships) Fake gateway rejects `['tools']`: no retry, the existing
  error surfaces.
- Live check against the gateway: a default `Chat` and `Transformer` on
  `gemini-3.8-flash` complete a call.

## Release

- Publish as 0.2.1 (bug fix; no API change). Note it in `CHANGELOG.md`.
- DM4: pin 0.2.1 (lockfile, `--min-release-age=0` per DM4's policy), then
  delete `rejectsSampling` and `samplingOptions` in
  `server/v5/ai-settings.js` and restore plain `temperature` in
  `server/v5/agents/build.js` and `server/v5/agents/converse.js`. Keep the
  DM4 test in `tests/v5-agents.test.js` that asserts no sampling params reach
  `gemini-3.8-flash`; it then pins the package fix.

## Acceptance

- `gemini-3.8-flash` calls with default options succeed against the live
  gateway.
- No sampling parameter is sent that the snapshot excludes.
- Every model that accepted sampling params on 2026-11-19 still receives
  them.
- Unit tests pass.
