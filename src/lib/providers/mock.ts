import type { Provider, ProviderEvent, ProviderRun } from "./types";

/** Roughly how a BPE tokenizer chunks English: short pieces with their leading whitespace. */
export function mockTokens(text: string): string[] {
  return text.match(/\s*\S{1,4}|\s+/g) ?? [];
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mockOutput({
  request,
  task,
}: Pick<ProviderRun, "request" | "task">): string {
  if (request.format === "text") return task.mock.prose;
  const data = task.mock.data;
  const keys =
    request.fields && request.fields.length > 0 ? request.fields : Object.keys(data);
  const subset = Object.fromEntries(
    keys.filter((k) => k in data).map((k) => [k, data[k]]),
  );
  return JSON.stringify(subset, null, 2);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * A fake model with a controllable latency profile: time to first token and tokens per second.
 * Deterministic output and jitter, so the same settings give comparable runs. This is the default
 * provider: it makes the whole playground usable (and deployable) without an API key.
 */
export async function* runMock(run: ProviderRun): AsyncGenerator<ProviderEvent> {
  const { request, signal } = run;
  const { ttfbMs, tokensPerSecond } = request.mock ?? {
    ttfbMs: 600,
    tokensPerSecond: 40,
  };
  const tokens = mockTokens(mockOutput(run));
  const rand = mulberry32(tokens.length * 7919 + request.user.length);
  const input = Math.ceil((request.system.length + request.user.length) / 4);

  const started = performance.now();
  const msPerToken = 1000 / tokensPerSecond;

  if (!request.stream) {
    // Like a non-streaming API: nothing until the whole generation is finished.
    await sleep(ttfbMs + tokens.length * msPerToken, signal);
    yield { type: "delta", text: tokens.join("") };
  } else {
    await sleep(ttfbMs, signal);
    let elapsed = 0; // ideal generation time so far, jittered
    let batch = "";
    for (const token of tokens) {
      elapsed += msPerToken * (0.85 + rand() * 0.3);
      batch += token;
      const due = started + ttfbMs + elapsed;
      const wait = due - performance.now();
      // Timers are coarse below ~5 ms, so group tokens instead of pretending to be precise.
      if (wait >= 5) {
        await sleep(wait, signal);
        yield { type: "delta", text: batch };
        batch = "";
      }
    }
    if (batch) yield { type: "delta", text: batch };
  }
  yield { type: "usage", inputTokens: input, outputTokens: tokens.length };
  yield { type: "done", finishReason: "end_turn" };
}

export const mockProvider: Provider = {
  id: "mock",
  label: "Mock (no API key)",
  configured: () => true,
  paid: false,
  supportsEffort: false,
  models: () => [
    { id: "mock-1", label: "Mock model", note: "Latency is set with the sliders" },
  ],
  run: runMock,
};
