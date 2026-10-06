import { useRef, useState, useSyncExternalStore } from "react";
import { RUN_MODES, type RunMode } from "../protocol";
import { routeStream } from "./route-stream";
import { RunController } from "./run-controller";
import type { RunConfig, RunSnapshot } from "./types";

/** Where one mode stands in the current "run" or "run all": shown on its tab. */
export interface ModeProgress {
  state: "queued" | "running" | "done" | "error";
  finished: number;
  total: number;
}
export type ModeProgressMap = Partial<Record<RunMode, ModeProgress>>;

export function useRunner() {
  const [controller] = useState(
    () => new RunController({ stream: routeStream, now: () => performance.now() }),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    () => null,
  );
  const [history, setHistory] = useState<RunSnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [modeStatus, setModeStatus] = useState<ModeProgressMap>({});
  const patchMode = (mode: RunMode, fn: (p: ModeProgress) => ModeProgress) =>
    setModeStatus((s) => (s[mode] ? { ...s, [mode]: fn(s[mode]!) } : s));
  const stopped = useRef(false);

  const record = (run: RunSnapshot) => {
    if (run.status !== "cancelled") setHistory((h) => [run, ...h]);
    return run;
  };

  /** Runs each config `repeat` times, one after another, so runs do not compete for the same API or GPU. */
  async function runSequence(configs: RunConfig[], repeat: number) {
    stopped.current = false;
    setBusy(true);
    const total = configs.length * repeat;
    let done = 0;
    setProgress({ done, total });
    setModeStatus(
      Object.fromEntries(
        configs.map((c) => [c.mode, { state: "queued", finished: 0, total: repeat }]),
      ),
    );
    try {
      for (let i = 0; i < repeat; i++) {
        for (const config of configs) {
          if (stopped.current) return;
          patchMode(config.mode, (p) => ({ ...p, state: "running" }));
          const run = record(await controller.run(config));
          patchMode(config.mode, (p) => {
            const finished = p.finished + 1;
            if (run.status === "error" || p.state === "error")
              return { ...p, finished, state: "error" };
            return { ...p, finished, state: finished >= p.total ? "done" : "queued" };
          });
          setProgress({ done: ++done, total });
        }
      }
    } finally {
      setBusy(false);
      setProgress(null);
      // After a stop: forget modes that never ran, mark partly repeated ones as done.
      setModeStatus((s) => {
        const next: ModeProgressMap = {};
        for (const [m, p] of Object.entries(s) as [RunMode, ModeProgress | undefined][]) {
          if (!p || (p.state !== "done" && p.state !== "error" && p.finished === 0))
            continue;
          next[m] = p.state === "error" ? p : { ...p, state: "done" };
        }
        return next;
      });
    }
  }

  return {
    snapshot,
    history,
    busy,
    progress,
    modeStatus,
    run: (config: RunConfig, repeat = 1) => runSequence([config], repeat),
    /** Every render strategy, in turn, `repeat` times each. */
    runAll: (config: RunConfig, repeat = 1) =>
      runSequence(
        RUN_MODES.map((mode) => ({ ...config, mode })),
        repeat,
      ),
    cancel() {
      stopped.current = true;
      controller.cancel();
    },
    clearHistory: () => setHistory([]),
  };
}
