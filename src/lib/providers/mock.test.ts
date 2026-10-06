import { describe, expect, it } from "vitest";
import { RunRequestSchema } from "../protocol";
import { getTask } from "../tasks";
import { mockOutput, mockTokens, runMock } from "./mock";

const task = getTask("support-triage")!;
const request = (over: object = {}) =>
  RunRequestSchema.parse({
    provider: "mock",
    model: "mock-1",
    taskId: task.id,
    format: "json",
    system: "s",
    user: "u",
    stream: true,
    mock: { ttfbMs: 20, tokensPerSecond: 500 },
    ...over,
  });

async function collect(req: ReturnType<typeof request>) {
  const times: number[] = [];
  const t0 = performance.now();
  let text = "";
  const types: string[] = [];
  for await (const e of runMock({
    request: req,
    task,
    signal: new AbortController().signal,
  })) {
    types.push(e.type);
    if (e.type === "delta") {
      text += e.text;
      times.push(performance.now() - t0);
    }
  }
  return { text, times, types, total: performance.now() - t0 };
}

describe("mock provider", () => {
  it("tokenizes without losing or adding characters", () => {
    const text = mockOutput({ request: request(), task });
    expect(mockTokens(text).join("")).toBe(text);
  });

  it("streams: waits for ttfb, then emits many deltas that join to the full output", async () => {
    const { text, times, types } = await collect(request());
    expect(text).toBe(mockOutput({ request: request(), task }));
    expect(times[0]).toBeGreaterThanOrEqual(15);
    expect(times.length).toBeGreaterThan(5);
    expect(types.slice(-2)).toEqual(["usage", "done"]);
  });

  it("non-streaming: one delta, arriving only after the whole generation time", async () => {
    const req = request({ stream: false, mock: { ttfbMs: 20, tokensPerSecond: 500 } });
    const { times, total } = await collect(req);
    const tokens = mockTokens(mockOutput({ request: req, task })).length;
    expect(times).toHaveLength(1);
    expect(times[0]).toBeGreaterThanOrEqual(20 + (tokens / 500) * 1000 - 10);
    expect(total).toBeGreaterThanOrEqual(times[0]!);
  });

  it("stops promptly when aborted", async () => {
    const abort = new AbortController();
    const req = request({ mock: { ttfbMs: 5_000, tokensPerSecond: 10 } });
    setTimeout(() => abort.abort(new Error("stop")), 30);
    const t0 = performance.now();
    await expect(
      (async () => {
        for await (const _ of runMock({ request: req, task, signal: abort.signal }))
          void _;
      })(),
    ).rejects.toThrow("stop");
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
