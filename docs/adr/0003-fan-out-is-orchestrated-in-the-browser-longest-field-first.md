# 3. Fan-out is orchestrated in the browser, longest field first

Date: 2026-10-05

## Status

Accepted

## Context

The fan-out mode asks one narrow question per field instead of one big question. Something has to
issue the requests, bound the parallelism and assemble the result. Options: a server endpoint that
does the whole fan-out and streams the sections back, or the browser issuing N requests.

## Decision

The browser does it, through a small worker pool (default 3 in flight). Each section is an ordinary
`/api/run` request, so the server stays stateless and each section's timing is observable.
Sections are started **longest first** (long text, then text, lists, badges).

This is a simplification. The prompt split is a backend design decision as much as a rendering one, and
a product would more likely split on the server and stream the sections. The playground keeps it in the
browser so each section's timing is visible and the server stays stateless.

## Consequences

With a concurrency limit, the slowest field decides the total time, so it must start first. With the
mock profile (800 ms to first token, 40 tok/s, three in flight) this changed the complete time of the
support-triage task from 5.13 s to 3.49 s. The price is visible: the first section to finish is no
longer one of the quick badges, so first content moved from 0.99 s to 1.35 s. Total time and first
content pull in opposite directions here, which is the kind of thing this playground exists to show.

Because the browser orchestrates, a server-side rate limit sees N requests per fan-out. Partial
failure is natural: a failed section shows as failed while the others render.
