# 7. The on-device model is a provider that runs in the browser

Date: 2026-10-05

## Status

Accepted

## Context

A local model (Gemma 4 E2B) is a useful contrast: no network, no constrained decoding, one GPU. It needs to
appear next to hosted models in the same comparison, with the same five modes and the same metrics.

## Decision

It is another source of the same five events, produced by a `StreamFn` that runs in the browser
(`src/lib/on-device/stream.ts`) instead of going through `/api/run`. `routeStream` picks the path from
`payload.provider`. The controller, the modes, the metrics and the scorer are unchanged. The model is loaded
by an explicit button before any run, so download and shader compilation are not billed to a measurement.

Because there is no constrained decoding, the schema is appended to the system prompt and JSON requests use
greedy decoding. Generations are serialised in the engine: one GPU.

## Consequences

- The protocol did its job: adding a provider that does not exist on the server needed no change to the modes.
- On-device results show effects hosted models hide: first byte is about 0, and fan-out is the worst strategy
  because the six prompts queue behind one another.
- Validity is a real measurement for this provider (nothing enforces the schema), and the first benchmark's
  three structured runs all validated.
- The engine, worker and event adapter are not covered by automated tests. They were verified by running them
  in a browser, and the abort and crash paths are reasoned about, not tested.
- The provider only works in browsers with WebGPU, and the option is disabled elsewhere.
