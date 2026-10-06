import type { ServerEvent } from "../protocol";

/** Decodes a `text/event-stream` body into events. Handles chunk boundaries anywhere, including mid-character. */
export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const event = decodeBlock(block);
        if (event) yield event;
      }
      if (done) break;
    }
    const tail = decodeBlock(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function decodeBlock(block: string): ServerEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data) return null;
  return JSON.parse(data) as ServerEvent;
}
