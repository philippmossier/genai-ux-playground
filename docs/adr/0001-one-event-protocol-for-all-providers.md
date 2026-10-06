# 1. One small event protocol between providers and render modes

Date: 2026-10-05

## Status

Accepted

## Context

Anthropic, OpenAI-compatible servers and the mock all stream differently (typed events with
`content_block_delta`, chunks with `choices[0].delta`, ...). The five render modes should not
care. A render mode that knows about a vendor cannot be compared fairly with another one.

## Decision

Adapters on the server translate each vendor into five events: `start`, `delta`, `usage`, `done`,
`error`. They are sent to the browser as server-sent events (`data: {json}\n\n`). Everything the
UI does is a function of this stream. SSE over `fetch` rather than WebSocket: one direction, plain
HTTP, works behind NGINX and serverless platforms, and abort is just `AbortController`.

## Consequences

Adding a provider means writing one `run()` generator (about 60 lines). Vendor-specific features
(thinking blocks, tool calls) are invisible to the UI until the protocol grows an event for them.
The browser must parse SSE itself because `EventSource` cannot POST; that parser is small and
tested against arbitrary chunk boundaries.
