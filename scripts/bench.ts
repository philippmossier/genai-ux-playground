/**
 * Runs every render strategy against a running playground server and prints a markdown table.
 * It drives the same RunController the browser uses, so the numbers mean exactly what the UI shows.
 *
 *   pnpm dev                                  # or: pnpm build && pnpm start
 *   pnpm bench --provider mock --ttfb 800 --tps 40
 *   ALLOW_REAL_PROVIDERS=1 pnpm bench --provider anthropic --model claude-haiku-4-5 --repeat 3
 */
import { parseArgs } from "node:util";
import { RunController } from "../src/lib/client/run-controller";
import { createStreamRun } from "../src/lib/client/stream-run";
import type { RunConfig, RunSnapshot } from "../src/lib/client/types";
import { RUN_MODES, type RunMode } from "../src/lib/protocol";
import { getTask } from "../src/lib/tasks";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3000" },
    provider: { type: "string", default: "mock" },
    model: { type: "string", default: "mock-1" },
    task: { type: "string", default: "support-triage" },
    effort: { type: "string" },
    repeat: { type: "string", default: "3" },
    concurrency: { type: "string", default: "6" },
    ttfb: { type: "string", default: "800" },
    tps: { type: "string", default: "40" },
    modes: { type: "string" },
    token: { type: "string" },
  },
});

const task = getTask(values.task!);
if (!task) throw new Error(`Unknown task ${values.task}`);
const modes = (values.modes ? values.modes.split(",") : [...RUN_MODES]) as RunMode[];
const repeat = Number(values.repeat);

const controller = new RunController({
  stream: createStreamRun(values.url),
  now: () => performance.now(),
});

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
const sec = (ms: number | null) => (ms == null ? "-" : `${(ms / 1000).toFixed(2)} s`);

const results = new Map<RunMode, RunSnapshot[]>();
for (let i = 0; i < repeat; i++) {
  for (const mode of modes) {
    const config: RunConfig = {
      mode,
      provider: values.provider as RunConfig["provider"],
      model: values.model!,
      taskId: task.id,
      system: task.system,
      user: task.defaultInput,
      maxTokens: 1024,
      effort: values.effort as RunConfig["effort"],
      mock: { ttfbMs: Number(values.ttfb), tokensPerSecond: Number(values.tps) },
      concurrency: Number(values.concurrency),
      token: values.token,
    };
    const run = await controller.run(config);
    process.stderr.write(
      `${mode} #${i + 1}: ${run.status} ${sec(run.metrics.firstContentMs)} -> ${sec(run.metrics.totalMs)}${run.error ? " " + run.error : ""}\n`,
    );
    results.set(mode, [...(results.get(mode) ?? []), run]);
  }
}

console.log(
  `\nprovider=${values.provider} model=${values.model} task=${task.id} effort=${values.effort ?? "default"} runs=${repeat} (medians)\n`,
);
console.log("| Mode | First content | Complete | Output tokens | Valid |");
console.log("| --- | --- | --- | --- | --- |");
for (const mode of modes) {
  const runs = (results.get(mode) ?? []).filter((r) => r.status === "done");
  const num = (pick: (r: RunSnapshot) => number | null) =>
    median(runs.map(pick).filter((v): v is number => v !== null));
  const structured =
    mode === "structured" || mode === "structured-stream" || mode === "fan-out";
  const valid = structured
    ? `${runs.filter((r) => r.valid).length}/${runs.length}`
    : "n/a";
  console.log(
    `| ${mode} | ${sec(num((r) => r.metrics.firstContentMs))} | ${sec(num((r) => r.metrics.totalMs))} | ${num((r) => r.metrics.outputTokens) ?? "-"} | ${valid} |`,
  );
}
