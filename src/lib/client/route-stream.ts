import { onDeviceStream } from "../on-device/stream";
import { streamRun, type StreamFn } from "./stream-run";

/** Hosted providers go through the server; the on-device provider runs in this browser. */
export const routeStream: StreamFn = (payload, options) =>
  payload.provider === "on-device"
    ? onDeviceStream(payload, options)
    : streamRun(payload, options);
