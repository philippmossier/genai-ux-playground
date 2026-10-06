import type { ZodType } from "zod";
import type { ModelOption, ProviderId, RunRequest } from "../protocol";
import type { Task } from "../tasks";

export type ProviderEvent =
  | { type: "delta"; text: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done"; finishReason: string };

export interface ProviderRun {
  request: RunRequest;
  task: Task;
  /** Present for format "json": the schema the output must satisfy. */
  schema?: ZodType;
  signal: AbortSignal;
}

export interface Provider {
  id: ProviderId;
  label: string;
  /** Needs no key (mock) or has one. */
  configured(): boolean;
  /** Whether a request may reach a paid API. Used for the token and rate-limit policy. */
  paid: boolean;
  supportsEffort: boolean;
  models(): ModelOption[];
  /** Yields deltas, then usage, then done. Throws on provider errors. */
  run(run: ProviderRun): AsyncGenerator<ProviderEvent>;
}
