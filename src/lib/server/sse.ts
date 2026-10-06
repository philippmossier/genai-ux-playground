import type { ServerEvent } from "../protocol";

const encoder = new TextEncoder();

export const sseEncode = (event: ServerEvent) =>
  encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Without this NGINX buffers the whole response and streaming silently turns into blocking.
  "X-Accel-Buffering": "no",
} as const;
