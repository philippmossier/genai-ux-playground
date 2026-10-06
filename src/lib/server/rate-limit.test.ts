import { describe, expect, it } from "vitest";
import { clientIp, RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit, then reports when to retry, then resets", () => {
    let now = 1_000;
    const limiter = new RateLimiter(2, 10_000, () => now);
    expect(limiter.check("a")).toEqual({ ok: true });
    expect(limiter.check("a")).toEqual({ ok: true });
    now += 2_500;
    expect(limiter.check("a")).toEqual({ ok: false, retryAfterSeconds: 8 });
    expect(limiter.check("b")).toEqual({ ok: true });
    now += 8_000;
    expect(limiter.check("a")).toEqual({ ok: true });
  });
});

describe("clientIp", () => {
  const req = (xff?: string) =>
    new Request("http://x", { headers: xff ? { "x-forwarded-for": xff } : {} });

  it("ignores X-Forwarded-For unless a proxy is trusted", () => {
    expect(clientIp(req("1.1.1.1"), 0, "7.7.7.7")).toBe("7.7.7.7");
    expect(clientIp(req("1.1.1.1"), 0, undefined)).toBe("local");
  });

  it("takes the N-th address from the right", () => {
    expect(clientIp(req("spoof, 1.1.1.1"), 1, "proxy")).toBe("1.1.1.1");
    expect(clientIp(req("spoof, 1.1.1.1, 2.2.2.2"), 2, "proxy")).toBe("1.1.1.1");
  });

  it("falls back to the socket address when the header is shorter than the proxy chain", () => {
    expect(clientIp(req(), 1, "7.7.7.7")).toBe("7.7.7.7");
    expect(clientIp(req("1.1.1.1"), 2, "7.7.7.7")).toBe("7.7.7.7");
  });
});
