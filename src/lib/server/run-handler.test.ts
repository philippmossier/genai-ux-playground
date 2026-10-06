import { describe, expect, it } from "vitest";
import type { ServerEvent } from "../protocol";
import { mockProvider } from "../providers/mock";
import type { Provider } from "../providers/types";
import type { ServerEnv } from "./env";
import { RateLimiter } from "./rate-limit";
import { handleRun, type RunHandlerDeps } from "./run-handler";

const env: ServerEnv = {
  allowReal: true,
  openaiModels: [],
  paidRatePerMinute: 30,
  trustedProxyHops: 0,
};

const paidProvider: Provider = {
  id: "anthropic",
  label: "Fake paid",
  configured: () => true,
  paid: true,
  supportsEffort: false,
  models: () => [{ id: "fake-1", label: "fake" }],
  async *run({ request }) {
    yield {
      type: "delta",
      text: `echo:${request.format}:${request.fields?.join(",") ?? "-"}`,
    };
    yield { type: "usage", inputTokens: 1, outputTokens: 2 };
    yield { type: "done", finishReason: "end_turn" };
  },
};

function deps(overrides: Partial<RunHandlerDeps> = {}): RunHandlerDeps {
  return {
    env,
    providers: [mockProvider, paidProvider],
    paidLimiter: new RateLimiter(2, 60_000),
    mockLimiter: new RateLimiter(100, 60_000),
    ...overrides,
  };
}

const base = {
  provider: "mock",
  model: "mock-1",
  taskId: "support-triage",
  format: "json",
  system: "sys",
  user: "hello",
  stream: true,
  mock: { ttfbMs: 0, tokensPerSecond: 1000 },
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api/run", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function events(res: Response): Promise<ServerEvent[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((chunk) => JSON.parse(chunk.replace(/^data: /, "")) as ServerEvent);
}

describe("handleRun", () => {
  it("streams start, deltas, usage, done for the mock provider", async () => {
    const res = await handleRun(post(base), deps());
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    const evs = await events(res);
    expect(evs[0]).toEqual({ type: "start", provider: "mock", model: "mock-1" });
    expect(evs.at(-1)).toEqual({ type: "done", finishReason: "end_turn" });
    const text = evs.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("");
    expect(JSON.parse(text)).toHaveProperty("urgency", "high");
  });

  it("restricts mock output to the requested fields", async () => {
    const res = await handleRun(post({ ...base, fields: ["urgency"] }), deps());
    const text = (await events(res))
      .flatMap((e) => (e.type === "delta" ? [e.text] : []))
      .join("");
    expect(JSON.parse(text)).toEqual({ urgency: "high" });
  });

  it("holds back everything until the end when stream is false", async () => {
    const res = await handleRun(post({ ...base, stream: false }), deps());
    const evs = await events(res);
    expect(evs.filter((e) => e.type === "delta")).toHaveLength(1);
    expect(evs[0]?.type).toBe("start");
  });

  it.each([
    ["not json", "{oops", 400],
    ["missing user", { ...base, user: "" }, 400],
    ["unknown task", { ...base, taskId: "nope" }, 400],
    ["unknown field", { ...base, fields: ["nope"] }, 400],
    ["unknown model", { ...base, model: "mock-9" }, 400],
  ])("rejects %s with %i", async (_name, body, status) => {
    const res = await handleRun(post(body), deps());
    expect(res.status).toBe(status);
  });

  it("hides real providers unless the operator opted in", async () => {
    const res = await handleRun(
      post({ ...base, provider: "anthropic", model: "fake-1" }),
      deps({ providers: [mockProvider, { ...paidProvider, configured: () => false }] }),
    );
    expect(res.status).toBe(403);
  });

  it("requires the access token for paid providers when one is configured", async () => {
    const d = deps({
      env: { ...env, accessToken: "s3cret" },
      paidLimiter: new RateLimiter(10, 60_000),
    });
    const body = { ...base, provider: "anthropic", model: "fake-1" };
    expect((await handleRun(post(body), d)).status).toBe(401);
    expect(
      (await handleRun(post(body, { "x-playground-token": "wrong" }), d)).status,
    ).toBe(401);
    const ok = await handleRun(post(body, { "x-playground-token": "s3cret" }), d);
    expect(ok.status).toBe(200);
    expect((await events(ok)).some((e) => e.type === "delta")).toBe(true);
  });

  it("does not require the token for the mock provider", async () => {
    const res = await handleRun(
      post(base),
      deps({ env: { ...env, accessToken: "s3cret" } }),
    );
    expect(res.status).toBe(200);
    await res.text();
  });

  it("rate limits paid providers per client", async () => {
    const d = deps({ env: { ...env, trustedProxyHops: 1 } });
    const body = { ...base, provider: "anthropic", model: "fake-1" };
    const headers = { "x-forwarded-for": "1.2.3.4" };
    for (let i = 0; i < 2; i++) await (await handleRun(post(body, headers), d)).text();
    const limited = await handleRun(post(body, headers), d);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // another client is unaffected
    const other = await handleRun(post(body, { "x-forwarded-for": "5.6.7.8" }), d);
    expect(other.status).toBe(200);
    await other.text();
  });

  it("ignores a spoofed X-Forwarded-For when no proxy is trusted", async () => {
    const d = deps();
    const body = { ...base, provider: "anthropic", model: "fake-1" };
    for (let i = 0; i < 2; i++)
      await (
        await handleRun(post(body, { "x-forwarded-for": `9.9.9.${i}` }), d, "7.7.7.7")
      ).text();
    const spoofed = await handleRun(
      post(body, { "x-forwarded-for": "9.9.9.99" }),
      d,
      "7.7.7.7",
    );
    expect(spoofed.status).toBe(429);
  });

  it("behind one proxy, only the hop the proxy appended counts", async () => {
    const d = deps({ env: { ...env, trustedProxyHops: 1 } });
    const body = { ...base, provider: "anthropic", model: "fake-1" };
    // The client prepends random addresses; the proxy appends the real one.
    for (let i = 0; i < 2; i++)
      await (
        await handleRun(post(body, { "x-forwarded-for": `10.0.0.${i}, 1.2.3.4` }), d)
      ).text();
    const spoofed = await handleRun(
      post(body, { "x-forwarded-for": "10.0.0.99, 1.2.3.4" }),
      d,
    );
    expect(spoofed.status).toBe(429);
  });

  it("wrong access tokens count against the rate limit", async () => {
    const d = deps({ env: { ...env, accessToken: "s3cret" } });
    const body = { ...base, provider: "anthropic", model: "fake-1" };
    for (let i = 0; i < 2; i++) {
      const res = await handleRun(post(body, { "x-playground-token": `guess${i}` }), d);
      expect(res.status).toBe(401);
    }
    expect(
      (await handleRun(post(body, { "x-playground-token": "guess" }), d)).status,
    ).toBe(429);
  });

  it("reports provider failures as an error event once streaming has begun", async () => {
    const broken: Provider = {
      ...paidProvider,
      // eslint-disable-next-line require-yield
      async *run() {
        throw new Error("upstream exploded");
      },
    };
    const res = await handleRun(
      post({ ...base, provider: "anthropic", model: "fake-1" }),
      deps({ providers: [mockProvider, broken] }),
    );
    expect(res.status).toBe(200);
    const evs = await events(res);
    expect(evs.at(-1)).toEqual({ type: "error", message: "upstream exploded" });
  });
});
