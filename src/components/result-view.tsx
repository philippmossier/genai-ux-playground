import type { RunSnapshot } from "~/lib/client/types";
import { getTask, type Task } from "~/lib/tasks";
import { formatMs } from "~/lib/utils";
import { Correctness } from "./correctness";
import { FieldCard, type FieldState } from "./field-card";
import { Prose } from "./prose";
import { Alert, AlertDescription } from "./ui/alert";
import { Empty, EmptyDescription, EmptyHeader } from "./ui/empty";
import { Waiting } from "./waiting";

export function ResultView({ run }: { run: RunSnapshot | null }) {
  if (!run) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyDescription>
            Pick a mode and press Run. Then run another mode on the same input and
            compare.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const running = run.status === "running";
  const { mode } = run.config;
  const task = getTask(run.config.taskId)!;

  return (
    <div className="flex flex-col gap-3">
      {run.error && (
        <Alert variant="destructive">
          <AlertDescription>{run.error}</AlertDescription>
        </Alert>
      )}

      {(mode === "blocking" || mode === "text-stream") &&
        (run.text ? (
          <Prose text={run.text} streaming={running && mode === "text-stream"} />
        ) : running ? (
          <Waiting label="Waiting for the first byte..." />
        ) : null)}

      {mode === "structured" &&
        (running ? (
          <>
            <Waiting label="Waiting for the complete object..." />
            <Cards run={run} task={task} streaming={false} hideValue />
          </>
        ) : (
          <Cards run={run} task={task} streaming={false} />
        ))}

      {mode === "structured-stream" && (
        <Cards run={run} task={task} streaming={running} />
      )}

      {mode === "fan-out" && <Cards run={run} task={task} streaming={false} />}

      <Correctness run={run} />

      {run.valid !== null && (
        <p className={run.valid ? "text-xs text-primary" : "text-xs text-destructive"}>
          {run.valid
            ? `Valid against the "${task.title}" schema.`
            : `Schema check failed: ${run.issues.join("; ")}`}
        </p>
      )}
    </div>
  );
}

function Cards({
  run,
  task,
  streaming,
  hideValue,
}: {
  run: RunSnapshot;
  task: Task;
  streaming: boolean;
  hideValue?: boolean;
}) {
  const value = (hideValue ? undefined : run.value) as
    Record<string, unknown> | undefined;
  const current = streaming
    ? lastPresentIndex(
        task.fields.map((f) => f.key),
        value,
      )
    : -1;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {task.fields.map((spec, index) => {
        const section = run.sections?.[spec.key];
        const state: FieldState = section
          ? section.status
          : value?.[spec.key] !== undefined
            ? "done"
            : "pending";
        return (
          <div
            key={spec.key}
            className={
              spec.kind === "longtext" || spec.kind === "text"
                ? "sm:col-span-2"
                : undefined
            }
          >
            <FieldCard
              spec={spec}
              value={section ? section.value : value?.[spec.key]}
              state={state}
              streaming={index === current}
              note={
                section?.doneAtMs !== undefined
                  ? `at ${formatMs(section.doneAtMs)}`
                  : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}

/** Index of the field being written right now: the last one present in the partial object. */
function lastPresentIndex(
  order: string[],
  value: Record<string, unknown> | undefined,
): number {
  if (!value) return -1;
  let last = -1;
  order.forEach((k, i) => {
    if (value[k] !== undefined) last = i;
  });
  return last;
}
