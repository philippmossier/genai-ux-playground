# 5. A mock provider with adjustable latency is the default

Date: 2026-10-05

## Status

Accepted

## Context

Real models have unpredictable latency and cost money, so they are a poor teaching tool and a poor
default for a public demo. The lesson, "what does this render strategy do when the model is slow",
needs a model whose speed you can set.

## Decision

The mock provider replays canned, schema-valid output for each task, with a configurable time to
first token and token rate, deterministic jitter and a token-like chunking. It supports all five modes
(including non-streamed responses and per-field requests for fan-out). It is the default provider and
needs no key.

## Consequences

The playground works offline, in CI and on a public URL at zero cost. Latency experiments are
repeatable: 3000 ms and 15 tok/s is a reasoning model on a bad day, and it makes blocking UX painful
to look at. The mock says nothing about answer quality, so it cannot be used to compare models.
