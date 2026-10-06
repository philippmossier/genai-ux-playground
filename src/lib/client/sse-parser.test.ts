import { describe, expect, it } from "vitest";
import type { ServerEvent } from "../protocol";
import { parseSSE } from "./sse-parser";

const enc = new TextEncoder();
function bodyFrom(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((x) => c.enqueue(x));
      c.close();
    },
  });
}
async function all(body: ReadableStream<Uint8Array>) {
  const out: ServerEvent[] = [];
  for await (const e of parseSSE(body)) out.push(e);
  return out;
}

const a: ServerEvent = { type: "delta", text: "grüßen ✓" };
const b: ServerEvent = { type: "done", finishReason: "end_turn" };
const wire = `data: ${JSON.stringify(a)}\n\ndata: ${JSON.stringify(b)}\n\n`;

describe("parseSSE", () => {
  it("parses events delivered in one chunk", async () => {
    expect(await all(bodyFrom([enc.encode(wire)]))).toEqual([a, b]);
  });

  it("is independent of where chunk boundaries fall, even inside a multi-byte character", async () => {
    const bytes = enc.encode(wire);
    for (let cut = 1; cut < bytes.length; cut++) {
      const events = await all(bodyFrom([bytes.slice(0, cut), bytes.slice(cut)]));
      expect(events).toEqual([a, b]);
    }
  });

  it("handles CRLF separators and ignores comments", async () => {
    const crlf = `: ping\r\n\r\ndata: ${JSON.stringify(b)}\r\n\r\n`;
    expect(await all(bodyFrom([enc.encode(crlf)]))).toEqual([b]);
  });

  it("flushes a final event that has no trailing blank line", async () => {
    expect(await all(bodyFrom([enc.encode(`data: ${JSON.stringify(b)}`)]))).toEqual([b]);
  });
});
