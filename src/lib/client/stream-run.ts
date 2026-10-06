import type { RunRequest, ServerEvent } from "../protocol";
import { parseSSE } from "./sse-parser";

export type RunPayload = Omit<RunRequest, "maxTokens"> & { maxTokens?: number };

export type StreamFn = (
  payload: RunPayload,
  options: { signal: AbortSignal; token?: string },
) => AsyncIterable<ServerEvent>;

/** POSTs a run to the server and yields its events. Throws with the server's message on HTTP errors. */
export const createStreamRun = (baseUrl = ""): StreamFn =>
  async function* (payload, { signal, token }) {
    const res = await fetch(`${baseUrl}/api/run`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-playground-token": token } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok || !res.body) {
      const detail = await res.json().catch(() => null);
      throw new Error(detail?.error ?? `Request failed (${res.status})`);
    }
    yield* parseSSE(res.body);
  };

export const streamRun = createStreamRun();
