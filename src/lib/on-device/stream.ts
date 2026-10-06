import { z } from "zod";
import type { StreamFn } from "../client/stream-run";
import type { ServerEvent } from "../protocol";
import { buildSystemPrompt, getTask, schemaFor } from "../tasks";
import { onDeviceEngine } from "./engine";

/**
 * The on-device provider as a StreamFn: the same five events a server provider would send, produced
 * in the browser. The render modes cannot tell the difference, which is the point of the protocol.
 *
 * Differences from the hosted providers, all deliberate and all visible in the numbers:
 *  - no network: "first byte" is about zero,
 *  - no constrained decoding: the schema goes into the prompt and the output is only validated afterwards,
 *  - one GPU: parallel requests (fan-out) queue up and run one after another.
 */
export const onDeviceStream: StreamFn = async function* (payload, { signal }) {
  const status = onDeviceEngine.getStatus();
  if (status.state !== "ready") {
    yield { type: "error", message: "Load the on-device model first (settings panel)." };
    return;
  }
  const task = getTask(payload.taskId);
  if (!task) {
    yield { type: "error", message: `Unknown task "${payload.taskId}".` };
    return;
  }

  let system = buildSystemPrompt(task, payload.system, payload.format, payload.fields);
  if (payload.format === "json") {
    const schema = z.toJSONSchema(schemaFor(task, payload.fields)) as Record<
      string,
      unknown
    >;
    delete schema.$schema;
    system += `\n\nThe JSON must match this JSON Schema exactly. Output the JSON object only, no code fences, no commentary.\n${JSON.stringify(schema)}`;
  }

  yield { type: "start", provider: "on-device", model: payload.model };

  // Bridge the engine's callback API to an async generator.
  const events: ServerEvent[] = [];
  let wake: (() => void) | null = null;
  const push = (e: ServerEvent) => {
    events.push(e);
    wake?.();
  };
  const buffered: string[] = [];
  let finished = false;

  const maxNewTokens = payload.maxTokens ?? 1024;
  const run = onDeviceEngine
    .generate(system, payload.user, {
      maxNewTokens,
      deterministic: payload.format === "json",
      signal,
      onToken: (text) => {
        if (payload.stream) push({ type: "delta", text });
        else buffered.push(text);
      },
    })
    .then((tokens) => {
      // A non-streamed request returns everything at once, like a hosted API without streaming.
      if (!payload.stream) push({ type: "delta", text: buffered.join("") });
      push({ type: "usage", inputTokens: 0, outputTokens: tokens });
      // No finish reason from the engine: reaching the limit means the output was cut off.
      push({ type: "done", finishReason: tokens >= maxNewTokens ? "length" : "stop" });
    })
    .catch((err: unknown) => {
      if (!signal.aborted)
        push({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
    })
    .finally(() => {
      finished = true;
      wake?.();
    });

  void run;
  for (;;) {
    while (events.length > 0) yield events.shift()!;
    if (finished) return;
    await new Promise<void>((resolve) => (wake = resolve));
    wake = null;
  }
};
