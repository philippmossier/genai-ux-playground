import type { RunSnapshot } from "./types";

/**
 * A JSON export of the runs, for reproducing or sharing a comparison. API tokens are never included, and
 * the system prompt and the input are reduced to their length: they may hold private text.
 */
export function buildExport(
  runs: RunSnapshot[],
  meta: { userAgent: string; exportedAt: string },
) {
  return {
    app: "genai-ux-playground",
    exportedAt: meta.exportedAt,
    userAgent: meta.userAgent,
    runs: runs.map((r) => ({
      id: r.id,
      status: r.status,
      mode: r.config.mode,
      provider: r.config.provider,
      model: r.config.model,
      taskId: r.config.taskId,
      effort: r.config.effort ?? null,
      concurrency: r.config.mode === "fan-out" ? r.config.concurrency : null,
      mock: r.config.provider === "mock" ? r.config.mock : null,
      inputChars: r.config.user.length,
      metrics: r.metrics,
      valid: r.valid,
      issues: r.issues,
      error: r.error ?? null,
      score: r.score
        ? {
            caseId: r.score.caseId,
            ambiguous: r.score.ambiguous,
            overall: r.score.overall,
            enumAccuracy: r.score.enumAccuracy,
            factRecall: r.score.factRecall,
            formatPass: r.score.formatPass,
            invented: r.score.hallucinations,
            failedChecks: r.score.checks
              .filter((c) => !c.passed)
              .map((c) => ({ label: c.label, detail: c.detail ?? null })),
          }
        : null,
    })),
  };
}
