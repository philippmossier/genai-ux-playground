import { describe, expect, it } from "vitest";
import type { ServerEvent } from "../protocol";
import { fanOutOrder, getTask } from "../tasks";
import { RunController } from "./run-controller";
import type { RunPayload, StreamFn } from "./stream-run";
import type { RunConfig, RunSnapshot } from "./types";

const task = getTask("support-triage")!;
const fullJson = JSON.stringify(task.mock.data, null, 2);

function clock() {
  const c = { t: 0, now: () => c.t };
  return c;
}

type Step = { at: number; event: ServerEvent };
/** A stream that jumps the fake clock to each step's time before yielding it. */
function scripted(c: ReturnType<typeof clock>, steps: Step[]): StreamFn {
  return async function* () {
    for (const step of steps) {
      c.t = step.at;
      yield step.event;
    }
  };
}

const start: ServerEvent = { type: "start", provider: "mock", model: "mock-1" };
const delta = (text: string): ServerEvent => ({ type: "delta", text });
const usage = (n: number): ServerEvent => ({
  type: "usage",
  inputTokens: 10,
  outputTokens: n,
});
const done: ServerEvent = { type: "done", finishReason: "end_turn" };

const config = (over: Partial<RunConfig> = {}): RunConfig => ({
  mode: "text-stream",
  provider: "mock",
  model: "mock-1",
  taskId: task.id,
  system: "s",
  user: "u",
  maxTokens: 1024,
  concurrency: 3,
  ...over,
});

describe("RunController: single request modes", () => {
  it("text-stream: first content is the first token", async () => {
    const c = clock();
    const ctl = new RunController({
      now: c.now,
      stream: scripted(c, [
        { at: 50, event: start },
        { at: 300, event: delta("Hello") },
        { at: 900, event: delta(" world") },
        { at: 900, event: usage(60) },
        { at: 900, event: done },
      ]),
    });
    const run = await ctl.run(config());
    expect(run.status).toBe("done");
    expect(run.text).toBe("Hello world");
    expect(run.metrics).toEqual({
      ttfbMs: 50,
      ttftMs: 300,
      firstContentMs: 300,
      totalMs: 900,
      outputTokens: 60,
      tokensPerSecond: 100, // 60 tokens over (900 - 300) ms
    });
    expect(run.valid).toBeNull();
  });

  it("blocking: nothing before the end, no tokens/s", async () => {
    const c = clock();
    const ctl = new RunController({
      now: c.now,
      stream: scripted(c, [
        { at: 2000, event: start },
        { at: 2000, event: delta("All at once") },
        { at: 2000, event: usage(80) },
        { at: 2000, event: done },
      ]),
    });
    const run = await ctl.run(config({ mode: "blocking" }));
    expect(run.metrics.firstContentMs).toBe(2000);
    expect(run.metrics.totalMs).toBe(2000);
    expect(run.metrics.tokensPerSecond).toBeNull();
  });

  it("structured: the object is withheld until the end, then validated", async () => {
    const c = clock();
    const seen: unknown[] = [];
    const ctl = new RunController({
      now: c.now,
      stream: scripted(c, [
        { at: 1500, event: start },
        { at: 1500, event: delta(fullJson) },
        { at: 1500, event: usage(120) },
        { at: 1500, event: done },
      ]),
    });
    ctl.subscribe((s) => seen.push(s.value));
    const run = await ctl.run(config({ mode: "structured" }));
    expect(run.valid).toBe(true);
    expect(run.value).toEqual(task.mock.data);
    expect(run.metrics.firstContentMs).toBe(1500);
    // value only appears in the final update, never as a partial
    expect(
      seen
        .filter((v) => v !== undefined)
        .every((v) => JSON.stringify(v) === JSON.stringify(task.mock.data)),
    ).toBe(true);
  });

  it("structured: schema violations are reported, not hidden", async () => {
    const c = clock();
    const bad = JSON.stringify({ ...task.mock.data, urgency: "urgent!!" });
    const ctl = new RunController({
      now: c.now,
      stream: scripted(c, [
        { at: 10, event: start },
        { at: 10, event: delta(bad) },
        { at: 10, event: done },
      ]),
    });
    const run = await ctl.run(config({ mode: "structured" }));
    expect(run.valid).toBe(false);
    expect(run.issues.join()).toContain("urgency");
  });

  it("structured-stream: first content is the first parsed field, value grows progressively", async () => {
    const c = clock();
    const values: unknown[] = [];
    const ctl = new RunController({
      now: c.now,
      stream: scripted(c, [
        { at: 100, event: start },
        { at: 400, event: delta('{\n  "summary": "Long-st') },
        { at: 700, event: delta(fullJson.slice('{\n  "summary": "Long-st'.length)) },
        { at: 700, event: usage(120) },
        { at: 700, event: done },
      ]),
    });
    ctl.subscribe((s) => values.push(s.value));
    const run = await ctl.run(config({ mode: "structured-stream" }));
    expect(run.metrics.firstContentMs).toBe(400);
    expect(run.metrics.totalMs).toBe(700);
    expect(values).toContainEqual({ summary: "Long-st" });
    expect(run.valid).toBe(true);
  });

  it("surfaces an error event as a failed run and keeps the partial text", async () => {
    const c = clock();
    const ctl = new RunController({
      now: c.now,
      stream: scripted(c, [
        { at: 10, event: start },
        { at: 20, event: delta("partial") },
        { at: 30, event: { type: "error", message: "rate limited upstream" } },
      ]),
    });
    const run = await ctl.run(config());
    expect(run.status).toBe("error");
    expect(run.error).toBe("rate limited upstream");
    expect(run.text).toBe("partial");
  });

  it("turns a thrown HTTP error into a failed run", async () => {
    const ctl = new RunController({
      now: () => 0,
      // eslint-disable-next-line require-yield
      stream: async function* () {
        throw new Error("Too many runs. Slow down.");
      },
    });
    const run = await ctl.run(config());
    expect(run.status).toBe("error");
    expect(run.error).toBe("Too many runs. Slow down.");
  });

  it("cancel() stops the run and marks it cancelled", async () => {
    const c = clock();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const ctl = new RunController({
      now: c.now,
      stream: async function* (_p, { signal }) {
        yield start;
        yield delta("abc");
        await gate;
        if (signal.aborted) throw signal.reason ?? new Error("aborted");
        yield done;
      },
    });
    const pending = ctl.run(config());
    await Promise.resolve();
    ctl.cancel();
    release();
    const run = await pending;
    expect(run.status).toBe("cancelled");
    expect(run.text).toBe("abc");
  });
});

describe("RunController: fan-out", () => {
  const fields = fanOutOrder(task);

  /** Each section request blocks until the test releases it, so concurrency can be observed. */
  function gated(c: ReturnType<typeof clock>) {
    const gates = new Map<string, () => void>();
    const waiting: string[] = [];
    let active = 0;
    let maxActive = 0;
    const stream: StreamFn = async function* (payload: RunPayload) {
      const field = payload.fields![0]!;
      active++;
      maxActive = Math.max(maxActive, active);
      waiting.push(field);
      await new Promise<void>((resolve) => gates.set(field, resolve));
      active--;
      yield start;
      yield delta(JSON.stringify({ [field]: task.mock.data[field] }));
      yield usage(10);
      yield done;
      void c;
    };
    return {
      stream,
      waiting,
      release: (field: string, at: number) => {
        c.t = at;
        gates.get(field)!();
      },
      get maxActive() {
        return maxActive;
      },
    };
  }

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("respects the concurrency limit and fills sections as they resolve", async () => {
    const c = clock();
    const g = gated(c);
    const ctl = new RunController({ now: c.now, stream: g.stream });
    const snapshots: RunSnapshot[] = [];
    ctl.subscribe((s) => snapshots.push(s));
    const pending = ctl.run(config({ mode: "fan-out", concurrency: 3 }));

    await flush();
    expect(g.waiting).toEqual(fields.slice(0, 3)); // only 3 in flight
    g.release(fields[2]!, 700); // the third finishes first
    await flush();
    expect(g.waiting).toHaveLength(4); // its slot was taken by the next section
    expect(snapshots.at(-1)!.sections![fields[2]!]).toMatchObject({
      status: "done",
      doneAtMs: 700,
    });
    expect(snapshots.at(-1)!.sections![fields[5]!]!.status).toBe("pending");

    g.release(fields[0]!, 900);
    await flush();
    g.release(fields[1]!, 1100);
    await flush();
    for (const [i, f] of fields.slice(3).entries()) {
      g.release(f, 1300 + i * 100);
      await flush();
    }
    const run = await pending;

    expect(g.maxActive).toBe(3);
    expect(run.status).toBe("done");
    expect(run.valid).toBe(true);
    expect(run.metrics.firstContentMs).toBe(700);
    expect(run.metrics.totalMs).toBe(1500);
    expect(run.metrics.outputTokens).toBe(60);
    expect(run.value).toEqual(task.mock.data);
  });

  it("marks the run failed when one section fails but keeps the others", async () => {
    const c = clock();
    const stream: StreamFn = async function* (payload) {
      const field = payload.fields![0]!;
      c.t += 10;
      if (field === "urgency") {
        yield { type: "error", message: "model said no" };
        return;
      }
      yield start;
      yield delta(JSON.stringify({ [field]: task.mock.data[field] }));
      yield done;
    };
    const run = await new RunController({ now: c.now, stream }).run(
      config({ mode: "fan-out", concurrency: 6 }),
    );
    expect(run.status).toBe("error");
    expect(run.error).toBe("model said no");
    expect(run.sections!.urgency!.status).toBe("error");
    expect(run.sections!.summary!.status).toBe("done");
  });
});

describe("RunController: correctness scoring", () => {
  const input = task.defaultInput;
  const once = (c: ReturnType<typeof clock>): StreamFn =>
    scripted(c, [
      { at: 10, event: start },
      { at: 10, event: delta(fullJson) },
      { at: 10, event: usage(100) },
      { at: 10, event: done },
    ]);

  it("scores a structured run against the labelled answer for the unedited example", async () => {
    const c = clock();
    const run = await new RunController({ now: c.now, stream: once(c) }).run(
      config({ mode: "structured", user: input }),
    );
    expect(run.score?.caseId).toBe("st-01");
    // the mock's canned answer is, by construction, a correct answer for this case
    expect(run.score?.overall).toBe(1);
    expect(run.score?.hallucinations).toEqual([]);
  });

  it("does not score an edited input, because there is no labelled answer for it", async () => {
    const c = clock();
    const run = await new RunController({ now: c.now, stream: once(c) }).run(
      config({ mode: "structured", user: input + " (edited)" }),
    );
    expect(run.score).toBeNull();
    expect(run.valid).toBe(true);
  });

  it("does not score free text", async () => {
    const c = clock();
    const run = await new RunController({ now: c.now, stream: once(c) }).run(
      config({ mode: "text-stream", user: input }),
    );
    expect(run.score).toBeNull();
  });

  it("reports wrong enums as failed checks", async () => {
    const c = clock();
    const wrong = JSON.stringify({
      ...task.mock.data,
      urgency: "low",
      sentiment: "positive",
    });
    const stream = scripted(c, [
      { at: 10, event: start },
      { at: 10, event: delta(wrong) },
      { at: 10, event: done },
    ]);
    const run = await new RunController({ now: c.now, stream }).run(
      config({ mode: "structured", user: input }),
    );
    expect(run.valid).toBe(true); // schema-valid, but wrong: exactly why validity is not correctness
    expect(run.score?.enumAccuracy).toBeCloseTo(1 / 3);
  });

  it("scores the assembled object in fan-out mode", async () => {
    const c = clock();
    const stream: StreamFn = async function* (payload) {
      const field = payload.fields![0]!;
      c.t += 5;
      yield start;
      yield delta(JSON.stringify({ [field]: task.mock.data[field] }));
      yield done;
    };
    const run = await new RunController({ now: c.now, stream }).run(
      config({ mode: "fan-out", user: input, concurrency: 6 }),
    );
    expect(run.score?.overall).toBe(1);
  });
});

describe("RunController: incomplete responses are never valid", () => {
  const cut = fullJson.slice(0, fullJson.lastIndexOf('"') - 5); // inside the last string value

  it("a document cut off at the token limit fails validation", async () => {
    const c = clock();
    const ctl = new RunController({
      now: c.now,
      stream: scripted(c, [
        { at: 10, event: start },
        { at: 20, event: delta(cut) },
        { at: 30, event: { type: "done", finishReason: "max_tokens" } },
      ]),
    });
    const run = await ctl.run(config({ mode: "structured" }));
    expect(run.valid).toBe(false);
    expect(run.issues.join()).toContain("token limit");
    expect(run.score).toBeNull();
  });

  it("an unterminated document fails validation even without a finish reason", async () => {
    const c = clock();
    const ctl = new RunController({
      now: c.now,
      stream: scripted(c, [
        { at: 10, event: delta(cut) },
        { at: 30, event: done },
      ]),
    });
    const run = await ctl.run(config({ mode: "structured-stream" }));
    expect(run.valid).toBe(false);
    expect(run.issues.join()).toContain("not complete JSON");
  });

  it("a stream that ends without done is an error, not a finished run", async () => {
    const c = clock();
    const ctl = new RunController({
      now: c.now,
      stream: scripted(c, [{ at: 10, event: delta(fullJson) }]),
    });
    const run = await ctl.run(config({ mode: "structured" }));
    expect(run.status).toBe("error");
    expect(run.valid).toBeNull();
  });

  it("a complete document in a code fence is still valid", async () => {
    const c = clock();
    const ctl = new RunController({
      now: c.now,
      stream: scripted(c, [
        { at: 10, event: delta("```json\n" + fullJson + "\n```") },
        { at: 30, event: done },
      ]),
    });
    expect((await ctl.run(config({ mode: "structured" }))).valid).toBe(true);
  });

  it("fan-out: a truncated section is an error", async () => {
    const c = clock();
    const ctl = new RunController({
      now: c.now,
      stream: async function* () {
        yield delta('{"summary": "Invoice PDF');
        yield { type: "done", finishReason: "length" } as ServerEvent;
      },
    });
    const run = await ctl.run(config({ mode: "fan-out" }));
    expect(run.status).toBe("error");
    expect(run.error).toContain("token limit");
  });
});
