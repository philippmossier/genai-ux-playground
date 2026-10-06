import type { CaseScore } from "./types";

export interface ScoreSummary {
  n: number;
  /** Mean `overall` over all scored runs, and over runs of unambiguous cases only. */
  overall: number | null;
  overallClearCases: number | null;
  enumAccuracy: number | null;
  factRecall: number | null;
  formatPass: number | null;
  /** Mean number of invented figures per run. */
  inventedPerRun: number;
  /** The checks that failed most often, across runs. */
  topFailures: {
    label: string;
    field: string;
    failed: number;
    of: number;
    example?: string;
  }[];
}

const mean = (xs: number[]) =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
const defined = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);

/** Condenses many scored runs into the numbers a README table needs. */
export function summarizeScores(scores: CaseScore[], topN = 5): ScoreSummary {
  const failures = new Map<
    string,
    { label: string; field: string; failed: number; of: number; example?: string }
  >();
  for (const s of scores) {
    for (const c of s.checks) {
      const key = `${s.caseId}|${c.label}`;
      const f = failures.get(key) ?? {
        label: `${s.caseId}: ${c.label}`,
        field: c.field,
        failed: 0,
        of: 0,
      };
      f.of++;
      if (!c.passed) {
        f.failed++;
        f.example ??= c.detail;
      }
      failures.set(key, f);
    }
  }
  return {
    n: scores.length,
    overall: mean(defined(scores.map((s) => s.overall))),
    overallClearCases: mean(
      defined(scores.filter((s) => !s.ambiguous).map((s) => s.overall)),
    ),
    enumAccuracy: mean(defined(scores.map((s) => s.enumAccuracy))),
    factRecall: mean(defined(scores.map((s) => s.factRecall))),
    formatPass: mean(defined(scores.map((s) => s.formatPass))),
    inventedPerRun: mean(scores.map((s) => s.hallucinations.length)) ?? 0,
    topFailures: [...failures.values()]
      .filter((f) => f.failed > 0)
      .sort((a, b) => b.failed / b.of - a.failed / a.of || b.failed - a.failed)
      .slice(0, topN),
  };
}
