# Learning map

A reading order through the code. About 4,700 lines of TypeScript
outside tests and generated files; this order covers the parts that matter in about two hours. Each
section names the files, the idea, and the questions you should be able to answer afterwards.

## 0. The one-paragraph version

One prompt, five ways of delivering the answer. The server reduces every provider (mock, Anthropic,
Gemini, OpenAI-compatible) to the same five SSE events. The browser runs a `RunController` that decides,
per mode, how to request (streamed or not, text or JSON, one call or one per field) and when something
becomes visible, and measures time to first content, total time and tokens. JSON answers are validated
with Zod and scored against labelled answers. An on-device model (WebGPU, in a Web Worker) produces the
same events without a server.

## 1. The contract (start here, 10 minutes)

- `src/lib/protocol.ts`: `RunRequestSchema` (what the browser may ask for, validated with Zod on the
  server) and `ServerEvent` (`start`, `delta`, `usage`, `done`, `error`). Everything else depends on these
  two types.
- `docs/adr/0001-one-event-protocol-for-all-providers.md`: why the vendor differences stop at the server.

You should be able to answer:

- Why is `finishReason` a string and not an enum? (Every vendor names it differently; `isTruncated` in
  `run-controller.ts` maps the ones that mean "cut off".)
- Why does `stream: false` still return SSE? (One code path in the client. The server collects all
  events first and sends them at the end, which is what a classic request/response API feels like.)

## 2. The server path (20 minutes)

Read in request order:

1. `src/routes/api/run.ts`: the TanStack Start route, a thin wrapper.
2. `src/lib/server/run-handler.ts`: validation, provider lookup, rate limit, access token, then the
   stream. Note the order: the rate limit runs before the token check, so a wrong token cannot be guessed
   at full speed.
3. `src/lib/server/sse.ts`: the whole SSE format is `data: <json>\n\n`. The `X-Accel-Buffering: no`
   header stops NGINX from buffering the stream into one blob.
4. `src/lib/server/env.ts`, `deps.ts`: real providers are off unless `ALLOW_REAL_PROVIDERS=1`; keys never
   leave the server (ADR 2).
5. `src/lib/server/rate-limit.ts`, `clientIp`: why the leftmost `X-Forwarded-For` entry is attacker-controlled
   and only the hop your own proxy appended counts.

You should be able to answer:

- Why are errors before streaming HTTP status codes, and errors after it `error` events? (Once the first
  byte is sent, the status line is gone.)
- What happens when the user presses Stop? (The fetch is aborted, `request.signal` fires, the handler's
  `AbortController` aborts, the provider SDK call is cancelled. `ReadableStream.cancel` covers the other
  direction.)

## 3. Providers (20 minutes)

- `src/lib/providers/types.ts`: the `Provider` interface. `run()` is an async generator of deltas, then
  usage, then done.
- `src/lib/providers/mock.ts`: the default. Simulates time to first byte and tokens per second, so every
  mode can be compared without a key (ADR 5).
- `src/lib/providers/anthropic.ts`, `gemini.ts`, `openai-compatible.ts`: the same job three times. Compare:

| Concept           | Anthropic                                  | OpenAI-compatible                    | Gemini                                |
| ----------------- | ------------------------------------------ | ------------------------------------ | ------------------------------------- |
| Structured output | `output_config.format` (from a Zod schema) | `response_format` json_schema strict | `responseJsonSchema`                  |
| Reasoning control | `output_config.effort`                     | `reasoning_effort`                   | `thinkingConfig.thinkingLevel`        |
| Truncation signal | `stop_reason: "max_tokens"`                | `finish_reason: "length"`            | `finishReason: MAX_TOKENS`            |
| Usage             | `message_start` + `message_delta` events   | `stream_options.include_usage`       | `usageMetadata`, incl. thought tokens |

You should be able to answer:

- What is constrained decoding, and why does it matter for the structured modes? (The provider only
  lets the model emit tokens that keep the output valid against the schema. Without it, as on-device, the
  schema is only a prompt instruction and the output is validated afterwards.)
- Why count thinking tokens in a latency comparison? (They cost time before the first visible token.)

## 4. The client: where the five modes live (30 minutes, the core)

- `src/lib/client/run-controller.ts`: read all of it. `runSingle` handles four modes with two booleans
  (`wantsJson`, `streamed`); `runFanOut` handles the fifth. Every metric is set here, so the modes are
  measured the same way (ADR 4 defines "first content" per mode).
- `src/lib/client/stream-run.ts` and `sse-parser.ts`: fetch plus a hand-written SSE decoder. It handles
  chunk boundaries anywhere, including in the middle of a multi-byte character (`TextDecoder` with
  `stream: true`).
- `src/lib/client/route-stream.ts`: sends `on-device` to the browser engine and everything else to the
  server. The controller cannot tell the difference.
- `src/lib/client/use-runner.ts`: the React side. `useSyncExternalStore` over the controller, plus the
  "Run all" sequence (modes one after another, never in parallel, so they do not compete for the same
  model).

You should be able to answer:

- Why is the controller a plain class and not a React hook? (Testable with a fake clock and a fake
  stream; see `run-controller.test.ts`. React only subscribes.)
- Why are the modes run sequentially in "Run all"? (Parallel runs would share rate limits and, on-device,
  the one GPU, and the numbers would measure contention.)

### Structured stream, in detail

The model streams one JSON document. After every chunk, `parsePartialJson` (`src/lib/partial-json.ts`)
turns the prefix received so far into the best value it can know: open objects and arrays are closed, a
string still being written is returned as its text so far, a key without a value is dropped, and a number
or `true`/`false`/`null` is only returned once it cannot change any more (`12` could still become `120`).
The UI renders that object into the cards, so the summary fills in while the reply is still being
written.

Two rules make it safe:

- The partial parse is **only for display**. Validation uses `parseCompleteJson` on the whole document
  plus a non-truncated finish reason (`validateWhole`). A cut-off document parsed leniently would pass the
  schema with half a sentence in a field; that bug existed and is tested against now.
- Every value the partial parser shows stays true: the last test in `partial-json.test.ts` checks every
  prefix of a document and asserts nothing shown is later contradicted (except a string growing).

Re-parsing the whole prefix on every chunk is O(n²) in theory and irrelevant in practice: the documents
are a few KB.

### Parallel fan-out, in detail

Not one prompt split into chunks: **one separate model call per field**. For support triage that is six
calls ("give me only `summary`", "only `category`", ...), each with the full input, each constrained to a
schema with that one field (`schemaFor(task, [field])`). A worker pool runs `concurrency` of them at a
time (default 3). Each call is not streamed; its card appears when its call returns. The longest fields
start first, because with a concurrency limit the slowest field otherwise starts last and decides the
total time (ADR 3 has the measured effect).

Costs: N times the input tokens, N requests against the rate limit, and the fields cannot see each
other (the reply cannot refer to the urgency the model chose in another call). Gains: short independent
calls, partial failure (one failed field shows as failed, the others render), and on a slow model the
total time can drop below a single big call. On-device it gets slower, because one GPU runs the calls one
after another.

## 5. Tasks, validation and scoring (20 minutes)

- `src/lib/tasks/support-triage.ts`: one task is a Zod schema, a list of fields for the UI, a default
  input and canned mock output. `tasks/index.ts`: `buildSystemPrompt`, `schemaFor`, `fanOutOrder`.
- `src/lib/eval/score.ts`: deterministic checks against labelled answers (enum labels, required facts,
  format, invented numbers). No LLM judge (ADR 6).
- `src/lib/client/aggregate.ts`: repeated runs become median and range per mode, provider, model and task.
- `docs/EVALUATION.md`: what the scores mean. The labels are unreviewed; do not quote accuracy as
  validated.

You should be able to answer:

- Why does an edited input get no score? (There is no labelled answer for it. `findCase` matches the
  unedited example only.)
- Why the median and not the mean? (One cold start or network hiccup should not move the result.)

## 6. On-device (20 minutes)

- `src/lib/on-device/models.ts`: two models (Qwen3 0.6B, Gemma 4 E2B), pinned by revision.
- `src/lib/on-device/worker.ts`: Transformers.js in a Web Worker on WebGPU. A warm-up generation compiles
  the shaders, so the first measured run is not billed for it.
- `src/lib/on-device/engine.ts`: the main-thread side. Requests are serialised (one GPU, one model).
- `src/lib/on-device/stream.ts`: bridges the engine's callbacks to the same async generator of
  `ServerEvent`s. No constrained decoding: the JSON schema goes into the prompt.
- `docs/adr/0007-the-on-device-model-is-a-provider-in-the-browser.md`.

You should be able to answer:

- Why a Web Worker? (Generation blocks for seconds; on the main thread the UI would freeze.)
- Why does the 3.1 GB model need the JSPI WebAssembly build? (The 32-bit build cannot parse single
  files over about 1 GB.)

## 7. UI (skim, 10 minutes)

- `src/routes/index.tsx`: the page. State lives in the URL search params (`mode`, `task`, `provider`,
  `model`), so a link reproduces a setup.
- `src/components/result-view.tsx`, `field-card.tsx`: how each mode is rendered.
- `src/components/mode-tabs.tsx`: per-mode progress during "Run all".
- `src/components/compare-table.tsx`: the comparison and the export.
- shadcn components only (ADR 8).

## 8. Tests and tooling

- `pnpm check` runs format, lint, types and tests. `run-controller.test.ts` and `run-handler.test.ts` are
  the two worth reading: they test behaviour (what the user sees, what the server allows) with fakes, no
  network.
- `scripts/bench.ts` drives the real client against a running server; `scripts/eval.ts` runs the labelled
  cases against a provider.

## Exercises

Doing one of these is the fastest way to own the code:

1. Make structured stream show only **finished** values: a string field appears once its closing quote
   arrives, an array item once it is complete. Compare first content against the current behaviour.
2. Add a sixth mode: fan-out with **streamed** calls, so each card fills in like structured stream.
3. Send a `: keep-alive` SSE comment every 15 seconds while a slow model thinks, and test that
   `sse-parser.ts` ignores it.
4. Generate `protocol.ts`'s request type from one source shared with the Python backend
   (`genai-ux-playground-py`), so the two cannot drift.
