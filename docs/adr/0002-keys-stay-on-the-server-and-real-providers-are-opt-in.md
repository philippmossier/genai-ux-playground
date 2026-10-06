# 2. Keys stay on the server, real providers are opt-in

Date: 2026-10-05

## Status

Accepted

## Context

An LLM playground is a demo that wants to be public, and a public endpoint that forwards to a paid
API is a free credit card for anyone who finds it. The tempting shortcut is a client-side key
(`VITE_*` variables are inlined into the bundle and readable by every visitor).

## Decision

- The browser never sees a provider key. It posts to `/api/run`; the server holds the key.
- Real providers are hidden and unreachable unless `ALLOW_REAL_PROVIDERS=1` **and** a key exists.
  The default deployment is mock-only.
- A paid provider can additionally require an access token (`PLAYGROUND_ACCESS_TOKEN`) and is
  rate limited per client (default 30 requests per minute; one "run all" is 10 requests).
- The model must be one the provider advertises. Request size and `maxTokens` are capped by schema.

## Consequences

A public demo is safe by default and a private one is one environment variable away. The rate
limiter is in memory, so it is per instance; run one instance or move it to Redis. The client IP
is the socket address, or behind `TRUSTED_PROXY_HOPS` proxies the `X-Forwarded-For` entry the outermost
trusted proxy appended. (Corrected 2026-10-06: the first version used the leftmost entry, which the
client controls even behind a proxy, so the limit could be bypassed with a made-up header.)
