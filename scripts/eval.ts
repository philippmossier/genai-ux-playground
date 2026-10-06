/**
 * Runs the labelled cases against a model and prints how correct and how fast each delivery mode was.
 * See docs/EVALUATION.md for what the numbers mean and what they cannot tell you.
 *
 *   pnpm start &                                      # the server must be running
 *   pnpm eval --provider anthropic --model claude-haiku-4-5 --repeat 3
 *   pnpm eval --provider mock --repeat 1              # plumbing check only: the mock ignores the input
 *
 * Real providers need ALLOW_REAL_PROVIDERS=1 and a key in .env, and a high PAID_RATE_LIMIT_PER_MIN
 * (one run of the full set is hundreds of requests).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { stat } from "../src/lib/client/aggregate";
import { RunController } from "../src/lib/client/run-controller";
import { createStreamRun } from "../src/lib/client/stream-run";
import type { RunConfig, RunSnapshot } from "../src/lib/client/types";
import { EVAL_CASES } from "../src/lib/eval";
import { summarizeScores } from "../src/lib/eval/summary";
import { RUN_MODES, type RunMode } from "../src/lib/protocol";
import { getTask } from "../src/lib/tasks";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3000" },
    provider: { type: "string", default: "mock" },
    model: { type: "string", default: "mock-1" },
    effort: { type: "string" },
    repeat: { type: "string", default: "3" },
    modes: { type: "string", default: "structured-stream" },
    tasks: { type: "string" },
    cases: { type: "string" },
    concurrency: { type: "string", default: "6" },
    ttfb: { type: "string", default: "50" },
    tps: { type: "string", default: "1000" },
    token: { type: "string" },
    out: { type: "string" },
  },
});

const modes = values.modes!.split(",") as RunMode[];
for (const m of modes)
  if (!RUN_MODES.includes(m))
    throw new Error(`Unknown mode "${m}". Use: ${RUN_MODES.join(", ")}`);
if (modes.some((m) => m === "blocking" || m === "text-stream")) {
  throw new Error(
    "Free-text modes cannot be scored. Use: structured, structured-stream, fan-out.",
  );
}
const wantedTasks = values.tasks?.split(",");
const wantedCases = values.cases?.split(",");
const cases = EVAL_CASES.filter(
  (c) =>
    (!wantedTasks || wantedTasks.includes(c.taskId)) &&
    (!wantedCases || wantedCases.includes(c.id)),
);
if (cases.length === 0) throw new Error("No cases selected.");
const repeat = Number(values.repeat);

const controller = new RunController({
  stream: createStreamRun(values.url),
  now: () => performance.now(),
});

interface EvalRecord {
  caseId: string;
  mode: RunMode;
  run: RunSnapshot;
}
const records: EvalRecord[] = [];
const total = cases.length * modes.length * repeat;
let done = 0;

for (let r = 0; r < repeat; r++) {
  for (const c of cases) {
    const task = getTask(c.taskId)!;
    for (const mode of modes) {
      const config: RunConfig = {
        mode,
        provider: values.provider as RunConfig["provider"],
        model: values.model!,
        taskId: c.taskId,
        system: task.system,
        user: c.input,
        maxTokens: 1024,
        effort: values.effort as RunConfig["effort"],
        mock: { ttfbMs: Number(values.ttfb), tokensPerSecond: Number(values.tps) },
        concurrency: Number(values.concurrency),
        token: values.token,
      };
      const run = await controller.run(config);
      records.push({ caseId: c.id, mode, run });
      process.stderr.write(
        `[${++done}/${total}] ${c.id} ${mode} #${r + 1}: ${run.status} ${run.score ? Math.round((run.score.overall ?? 0) * 100) + "%" : "-"}${run.error ? " " + run.error : ""}\n`,
      );
    }
  }
}

const pct = (x: number | null) => (x === null ? "-" : `${Math.round(x * 100)}%`);
const sec = (ms: number | undefined) =>
  ms === undefined ? "-" : `${(ms / 1000).toFixed(2)} s`;

console.log(
  `\nprovider=${values.provider} model=${values.model} effort=${values.effort ?? "default"} cases=${cases.length} runs per case=${repeat}`,
);
if (values.provider === "mock")
  console.log(
    "NOTE: the mock returns the same canned answer for every input. These numbers only test the plumbing.",
  );
console.log(
  "\n| Mode | Runs | Correct | Correct (clear cases) | Labels | Facts | Format | Invented figures/run | Invalid | Failed | First content | Complete |",
);
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const mode of modes) {
  const rs = records.filter((x) => x.mode === mode).map((x) => x.run);
  const ok = rs.filter((r) => r.status === "done");
  const scores = ok.flatMap((r) => (r.score ? [r.score] : []));
  const s = summarizeScores(scores);
  const first = stat(
    ok.map((r) => r.metrics.firstContentMs).filter((x): x is number => x !== null),
  );
  const total = stat(
    ok.map((r) => r.metrics.totalMs).filter((x): x is number => x !== null),
  );
  console.log(
    `| ${mode} | ${rs.length} | ${pct(s.overall)} | ${pct(s.overallClearCases)} | ${pct(s.enumAccuracy)} | ${pct(s.factRecall)} | ${pct(s.formatPass)} | ${s.inventedPerRun.toFixed(2)} | ${ok.filter((r) => r.valid === false).length} | ${rs.length - ok.length} | ${sec(first?.median)} | ${sec(total?.median)} |`,
  );
}

for (const mode of modes) {
  const scores = records
    .filter((x) => x.mode === mode && x.run.score)
    .map((x) => x.run.score!);
  const top = summarizeScores(scores, 8).topFailures;
  if (top.length === 0) continue;
  console.log(`\nChecks that failed most often (${mode}):`);
  for (const f of top)
    console.log(
      `- ${f.label}: failed ${f.failed} of ${f.of}${f.example ? ` (${f.example})` : ""}`,
    );
}

const out =
  values.out ?? `eval-results/${values.provider}-${values.model}-${Date.now()}.json`;
mkdirSync("eval-results", { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      provider: values.provider,
      model: values.model,
      effort: values.effort ?? null,
      repeat,
      at: new Date().toISOString(),
      runs: records.map(({ caseId, mode, run }) => ({
        caseId,
        mode,
        status: run.status,
        valid: run.valid,
        error: run.error ?? null,
        metrics: run.metrics,
        score: run.score,
        value: run.value,
      })),
    },
    null,
    2,
  ),
);
console.log(`\nRaw results: ${out}`);
