/** Fixed-window limiter, in memory. Good enough for a single-instance demo; swap for Redis if you scale out. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const now = this.now();
    if (this.hits.size > 5_000) this.sweep(now);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return { ok: true };
    }
    if (entry.count >= this.limit) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    }
    entry.count++;
    return { ok: true };
  }

  private sweep(now: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}

/**
 * The address to rate limit by. Each proxy appends the address it saw to X-Forwarded-For, so with N
 * trusted proxies in front of the server the client is the N-th entry from the right. Everything left of it
 * was sent by the client and can be anything. With no trusted proxy the header is ignored entirely and the
 * socket address is used.
 */
export function clientIp(
  request: Request,
  trustedProxyHops: number,
  peerIp: string | undefined,
): string {
  if (trustedProxyHops > 0) {
    const hops = (request.headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    const client = hops[hops.length - trustedProxyHops];
    if (client) return client;
  }
  return peerIp || "local";
}
