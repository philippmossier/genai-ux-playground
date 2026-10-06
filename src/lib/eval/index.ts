import { MEETING_CASES } from "./cases-meetings";
import { REVIEW_CASES } from "./cases-reviews";
import { SUPPORT_CASES } from "./cases-support";
import type { EvalCase } from "./types";

export { scoreCase } from "./score";
export * from "./types";

export const EVAL_CASES: EvalCase[] = [
  ...SUPPORT_CASES,
  ...MEETING_CASES,
  ...REVIEW_CASES,
];

export const casesForTask = (taskId: string) =>
  EVAL_CASES.filter((c) => c.taskId === taskId);

/** The labelled case whose input equals this text exactly, if any. Edited inputs have no gold. */
export function findCase(taskId: string, input: string): EvalCase | undefined {
  return EVAL_CASES.find((c) => c.taskId === taskId && c.input === input);
}
