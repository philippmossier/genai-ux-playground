import type { RunSnapshot } from "./types";

export interface Stat {
  median: number;
  min: number;
  max: number;
}

export interface RunGroup {
  /** mode | provider | model | task: runs with the same key are repetitions of one experiment. */
  key: string;
  mode: RunSnapshot["config"]["mode"];
  provider: string;
  model: string;
  taskId: string;
  /** Finished runs counted in the statistics. */
  n: number;
  failed: number;
  invalid: number;
  firstContent: Stat | null;
  complete: Stat | null;
  outputTokens: number | null;
  /** Mean correctness (0 to 1) over the scored runs, and how many were scored. */
  accuracy: { mean: number; scored: number } | null;
  inventedPerRun: number | null;
  /** The latest run of the group: what the timeline shows. */
  latest: RunSnapshot;
}

export function stat(values: number[]): Stat | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return {
    median: s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2,
    min: s[0]!,
    max: s[s.length - 1]!,
  };
}

const nums = (xs: (number | null | undefined)[]) =>
  xs.filter((x): x is number => typeof x === "number");

/**
 * Groups repeated runs of the same experiment and reduces them to median and range. `runs` is
 * newest first (as kept by the UI); the groups keep that order.
 */
export function aggregateRuns(runs: RunSnapshot[]): RunGroup[] {
  const groups = new Map<string, RunSnapshot[]>();
  for (const r of runs) {
    const key = [r.config.mode, r.config.provider, r.config.model, r.config.taskId].join(
      "|",
    );
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()].map(([key, rs]) => {
    const done = rs.filter((r) => r.status === "done");
    const scored = done
      .map((r) => r.score?.overall)
      .filter((x): x is number => typeof x === "number");
    const invented = nums(
      done.map((r) => (r.score ? r.score.hallucinations.length : null)),
    );
    const tokens = stat(nums(done.map((r) => r.metrics.outputTokens)));
    const latest = rs[0]!;
    return {
      key,
      mode: latest.config.mode,
      provider: latest.config.provider,
      model: latest.config.model,
      taskId: latest.config.taskId,
      n: done.length,
      failed: rs.filter((r) => r.status === "error").length,
      invalid: done.filter((r) => r.valid === false).length,
      firstContent: stat(nums(done.map((r) => r.metrics.firstContentMs))),
      complete: stat(nums(done.map((r) => r.metrics.totalMs))),
      outputTokens: tokens ? tokens.median : null,
      accuracy: scored.length
        ? {
            mean: scored.reduce((a, b) => a + b, 0) / scored.length,
            scored: scored.length,
          }
        : null,
      inventedPerRun: invented.length
        ? invented.reduce((a, b) => a + b, 0) / invented.length
        : null,
      latest,
    };
  });
}
