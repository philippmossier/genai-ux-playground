import { describe, expect, it } from "vitest";
import type { CaseScore } from "../eval";
import { summarizeScores } from "../eval/summary";
import { aggregateRuns, stat } from "./aggregate";
import { buildExport } from "./export";
import { emptyMetrics, type RunSnapshot } from "./types";

function run(over: {
  id?: string;
  mode?: RunSnapshot["config"]["mode"];
  model?: string;
  first?: number;
  total?: number;
  status?: RunSnapshot["status"];
  valid?: boolean | null;
  overall?: number | null;
  invented?: string[];
}): RunSnapshot {
  return {
    id: over.id ?? "r",
    status: over.status ?? "done",
    config: {
      mode: over.mode ?? "structured-stream",
      provider: "mock",
      model: over.model ?? "m",
      taskId: "support-triage",
      system: "SECRET SYSTEM",
      user: "SECRET INPUT",
      maxTokens: 100,
      concurrency: 3,
      token: "TOKEN",
    },
    text: "",
    value: undefined,
    sections: null,
    metrics: {
      ...emptyMetrics(),
      firstContentMs: over.first ?? 100,
      totalMs: over.total ?? 500,
      outputTokens: 50,
    },
    valid: over.valid ?? true,
    issues: [],
    score:
      over.overall === undefined || over.overall === null
        ? null
        : {
            caseId: "st-01",
            ambiguous: false,
            checks: [
              {
                kind: "enum",
                field: "urgency",
                label: "urgency is high",
                passed: false,
                detail: "expected high, got low",
              },
            ],
            enumAccuracy: over.overall,
            factRecall: null,
            formatPass: null,
            hallucinations: over.invented ?? [],
            overall: over.overall,
          },
  };
}

describe("stat", () => {
  it("returns median and range", () => {
    expect(stat([3, 1, 2])).toEqual({ median: 2, min: 1, max: 3 });
    expect(stat([4, 1, 2, 3])).toEqual({ median: 2.5, min: 1, max: 4 });
    expect(stat([])).toBeNull();
  });
});

describe("aggregateRuns", () => {
  it("groups repetitions of one experiment and reports median, range and mean accuracy", () => {
    const groups = aggregateRuns([
      run({ first: 300, total: 900, overall: 1 }),
      run({ first: 100, total: 700, overall: 0.5 }),
      run({ first: 200, total: 800, overall: 0.75, invented: ["59"] }),
    ]);
    expect(groups).toHaveLength(1);
    const g = groups[0]!;
    expect(g.n).toBe(3);
    expect(g.firstContent).toEqual({ median: 200, min: 100, max: 300 });
    expect(g.complete).toEqual({ median: 800, min: 700, max: 900 });
    expect(g.accuracy).toEqual({ mean: 0.75, scored: 3 });
    expect(g.inventedPerRun).toBeCloseTo(1 / 3);
  });

  it("keeps different modes and models apart, in the order of first appearance", () => {
    const groups = aggregateRuns([
      run({ mode: "fan-out" }),
      run({ mode: "structured" }),
      run({ mode: "fan-out" }),
      run({ model: "other" }),
    ]);
    expect(groups.map((g) => [g.mode, g.model, g.n])).toEqual([
      ["fan-out", "m", 2],
      ["structured", "m", 1],
      ["structured-stream", "other", 1],
    ]);
  });

  it("counts failures and invalid outputs without letting them skew the timings", () => {
    const g = aggregateRuns([
      run({ first: 100 }),
      run({ status: "error", first: 9999 }),
      run({ valid: false, first: 300 }),
    ])[0]!;
    expect(g.n).toBe(2);
    expect(g.failed).toBe(1);
    expect(g.invalid).toBe(1);
    expect(g.firstContent).toEqual({ median: 200, min: 100, max: 300 });
  });

  it("has no accuracy when nothing was scored", () => {
    expect(aggregateRuns([run({})])[0]!.accuracy).toBeNull();
  });
});

describe("summarizeScores", () => {
  const score = (
    caseId: string,
    overall: number,
    over: Partial<CaseScore> = {},
  ): CaseScore => ({
    caseId,
    ambiguous: false,
    checks: [
      {
        kind: "enum",
        field: "urgency",
        label: "urgency is high",
        passed: overall === 1,
        detail: "expected high, got low",
      },
    ],
    enumAccuracy: overall,
    factRecall: null,
    formatPass: null,
    hallucinations: [],
    overall,
    ...over,
  });

  it("averages, separates ambiguous cases and ranks the checks that fail most", () => {
    const s = summarizeScores([
      score("a", 1),
      score("a", 0),
      score("b", 0, { ambiguous: true }),
      score("c", 1, { hallucinations: ["59", "7"] }),
    ]);
    expect(s.n).toBe(4);
    expect(s.overall).toBe(0.5);
    expect(s.overallClearCases).toBeCloseTo(2 / 3);
    expect(s.inventedPerRun).toBe(0.5);
    expect(s.topFailures[0]).toMatchObject({
      label: "b: urgency is high",
      failed: 1,
      of: 1,
      example: "expected high, got low",
    });
    expect(s.topFailures.some((f) => f.label.startsWith("c:"))).toBe(false);
  });

  it("copes with no scores", () => {
    expect(summarizeScores([])).toMatchObject({ n: 0, overall: null, topFailures: [] });
  });
});

describe("buildExport", () => {
  it("never includes tokens, system prompts or input text", () => {
    const json = JSON.stringify(
      buildExport([run({ overall: 0.5 })], { userAgent: "UA", exportedAt: "now" }),
    );
    expect(json).not.toContain("TOKEN");
    expect(json).not.toContain("SECRET");
    expect(json).toContain('"inputChars":12');
    expect(json).toContain("expected high, got low");
  });
});
