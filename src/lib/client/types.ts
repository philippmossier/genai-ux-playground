import type { CaseScore } from "../eval";
import type { ProviderId, RunMode } from "../protocol";

export interface RunConfig {
  mode: RunMode;
  provider: ProviderId;
  model: string;
  taskId: string;
  system: string;
  user: string;
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  mock?: { ttfbMs: number; tokensPerSecond: number };
  /** Parallel narrow requests in the fan-out mode. */
  concurrency: number;
  token?: string;
}

/** All times are milliseconds since the run started. null = does not apply or has not happened yet. */
export interface Metrics {
  /** First byte back from the server. */
  ttfbMs: number | null;
  /** First model token. */
  ttftMs: number | null;
  /** First moment the user can see any part of the result. This is the number that mode choice changes. */
  firstContentMs: number | null;
  totalMs: number | null;
  outputTokens: number | null;
  tokensPerSecond: number | null;
}

export type SectionStatus = "pending" | "running" | "done" | "error";
export interface SectionState {
  status: SectionStatus;
  value?: unknown;
  doneAtMs?: number;
  error?: string;
}

export type RunStatus = "running" | "done" | "error" | "cancelled";

export interface RunSnapshot {
  id: string;
  config: RunConfig;
  status: RunStatus;
  /** Raw text as received (prose, or raw JSON for the structured modes). */
  text: string;
  /** Best-known object for the structured modes (partial while streaming). */
  value: unknown;
  /** Fan-out only: state of each section. */
  sections: Record<string, SectionState> | null;
  metrics: Metrics;
  /** Structured modes: did the final object satisfy the task schema? null = not applicable / not finished. */
  valid: boolean | null;
  issues: string[];
  /** Correctness against a labelled answer. null for free text, edited inputs and unfinished runs. */
  score: CaseScore | null;
  error?: string;
}

export const emptyMetrics = (): Metrics => ({
  ttfbMs: null,
  ttftMs: null,
  firstContentMs: null,
  totalMs: null,
  outputTokens: null,
  tokensPerSecond: null,
});
