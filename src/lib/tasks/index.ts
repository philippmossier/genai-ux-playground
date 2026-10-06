import { meetingNotes } from "./meeting-notes";
import { reviewAnalysis } from "./review-analysis";
import { supportTriage } from "./support-triage";
import type { Task } from "./types";

export type { FieldKind, FieldSpec, Task } from "./types";

export const TASKS: Task[] = [supportTriage, meetingNotes, reviewAnalysis];

export function getTask(id: string): Task | undefined {
  return TASKS.find((t) => t.id === id);
}

/** The base system prompt plus the format instruction that depends on how the result is rendered. */
export function buildSystemPrompt(
  task: Task,
  baseSystem: string,
  format: "text" | "json",
  fields?: string[],
): string {
  if (format === "text") {
    return `${baseSystem}\n\nWrite a short, well structured report in plain prose with bold section labels. Maximum 160 words.`;
  }
  if (fields && fields.length > 0) {
    return `${baseSystem}\n\nRespond with JSON only. Return an object with exactly these keys: ${fields.join(", ")}.`;
  }
  return `${baseSystem}\n\nRespond with JSON only, matching the provided schema.`;
}

/** Schema for the whole task or a subset of its fields (the fan-out mode asks one field at a time). */
export function schemaFor(task: Task, fields?: string[]) {
  if (!fields || fields.length === 0) return task.schema;
  const pick: Record<string, true> = {};
  for (const f of fields) {
    if (!(f in task.schema.shape))
      throw new Error(`Unknown field "${f}" for task ${task.id}`);
    pick[f] = true;
  }
  return task.schema.pick(pick);
}

const KIND_WEIGHT: Record<string, number> = { longtext: 0, text: 1, list: 2, badge: 3 };

/**
 * Order in which the fan-out mode starts its requests: the fields that take longest to generate
 * first. With a concurrency limit the slowest field otherwise starts last and decides the total time.
 */
export function fanOutOrder(task: Task): string[] {
  return task.fields
    .map((f, index) => ({ key: f.key, index, weight: KIND_WEIGHT[f.kind] ?? 9 }))
    .sort((a, b) => a.weight - b.weight || a.index - b.index)
    .map((f) => f.key);
}
