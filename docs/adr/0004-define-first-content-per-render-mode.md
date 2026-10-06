# 4. Define "first content" per render mode

Date: 2026-10-05

## Status

Accepted

## Context

"Latency" hides what a user feels. Time to first token is the same for streamed prose and for a
structured response that is only rendered at the end, yet the experiences are opposite. Comparing
modes needs one metric that means "the user can see something".

## Decision

All times are milliseconds since the run started, measured in the browser (so they include the
network and the server hop).

| Metric        | Definition                                                |
| ------------- | --------------------------------------------------------- |
| First byte    | First event of any kind from the server                   |
| First token   | First `delta` event                                       |
| First content | The first moment part of the result is visible, see below |
| Complete      | The `done` event, or the last section in fan-out          |

First content by mode: streamed text, the first delta. Structured stream, the first time the partially
parsed object has a non-empty field. Fan-out, the first finished section. Blocking and structured,
the end of the run, because nothing is rendered before.

## Consequences

The metric is a property of the UI, not of the model, which is the point. It is also a simplification:
it does not say whether the first visible field is a useful one. Tokens per second is only reported
for streamed single requests, where it is meaningful.
