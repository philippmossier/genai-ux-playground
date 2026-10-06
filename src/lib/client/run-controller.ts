import { findCase, scoreCase } from "../eval";
import { parseCompleteJson, parsePartialJson } from "../partial-json";
import type { ServerEvent } from "../protocol";
import { fanOutOrder, getTask } from "../tasks";
import type { StreamFn } from "./stream-run";
import {
  emptyMetrics,
  type Metrics,
  type RunConfig,
  type RunSnapshot,
  type SectionState,
} from "./types";

export interface ControllerDeps {
  stream: StreamFn;
  /** Milliseconds, monotonic. performance.now in the browser, a fake clock in tests. */
  now: () => number;
  newId?: () => string;
}

type Listener = (snapshot: RunSnapshot) => void;

/**
 * Runs one config and keeps a live snapshot of it.
 *
 * The five render strategies differ only in (a) how the request is made (streamed or not, text or
 * JSON, one request or one per field) and (b) when something becomes visible. Both are decided here,
 * in one place, so the metrics are defined once and are comparable across modes. See docs/adr/0005.
 */
export class RunController {
  private snapshot: RunSnapshot | null = null;
  private listeners = new Set<Listener>();
  private abort: AbortController | null = null;
  private counter = 0;

  constructor(private readonly deps: ControllerDeps) {}

  getSnapshot = () => this.snapshot;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  cancel() {
    this.abort?.abort();
  }

  async run(config: RunConfig): Promise<RunSnapshot> {
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const t0 = this.deps.now();
    const elapsed = () => Math.round(this.deps.now() - t0);

    const task = getTask(config.taskId);
    const fields = task?.fields.map((f) => f.key) ?? [];
    this.snapshot = {
      id: this.deps.newId?.() ?? `run-${++this.counter}`,
      config,
      status: "running",
      text: "",
      value: undefined,
      sections: config.mode === "fan-out" ? initialSections(fields) : null,
      metrics: emptyMetrics(),
      valid: null,
      issues: [],
      score: null,
    };
    this.emit();

    try {
      if (config.mode === "fan-out")
        await this.runFanOut(
          config,
          task ? fanOutOrder(task) : fields,
          abort.signal,
          elapsed,
        );
      else await this.runSingle(config, abort.signal, elapsed);
      if (abort.signal.aborted)
        throw abort.signal.reason ?? new DOMException("Aborted", "AbortError");
      this.update((s) => ({ ...s, status: s.status === "running" ? "done" : s.status }));
    } catch (err) {
      if (abort.signal.aborted) {
        this.update((s) => ({ ...s, status: "cancelled" }));
      } else {
        const message = err instanceof Error ? err.message : "Run failed.";
        this.update((s) => ({ ...s, status: "error", error: message }));
      }
    }
    this.finalize(elapsed());
    return this.snapshot!;
  }

  // ---- single request modes -------------------------------------------------------------

  private async runSingle(
    config: RunConfig,
    signal: AbortSignal,
    elapsed: () => number,
  ): Promise<void> {
    const wantsJson = config.mode === "structured" || config.mode === "structured-stream";
    const streamed = config.mode === "text-stream" || config.mode === "structured-stream";

    const events = this.deps.stream(
      {
        provider: config.provider,
        model: config.model,
        taskId: config.taskId,
        format: wantsJson ? "json" : "text",
        system: config.system,
        user: config.user,
        stream: streamed,
        maxTokens: config.maxTokens,
        effort: config.effort,
        mock: config.provider === "mock" ? config.mock : undefined,
      },
      { signal, token: config.token },
    );

    let sawFirstByte = false;
    let sawFirstToken = false;
    let text = "";
    let finishReason: string | null = null;
    for await (const event of events) {
      const t = elapsed();
      if (!sawFirstByte) {
        sawFirstByte = true;
        this.setMetrics({ ttfbMs: t });
      }
      if (event.type === "error") throw new Error(event.message);
      if (event.type === "delta") {
        text += event.text;
        if (!sawFirstToken) {
          sawFirstToken = true;
          this.setMetrics({ ttftMs: t });
          if (config.mode === "text-stream") this.setMetrics({ firstContentMs: t });
        }
        const value = wantsJson ? parsePartialJson(text) : undefined;
        if (config.mode === "structured-stream" && hasVisibleContent(value)) {
          this.setMetrics((m) => ({ firstContentMs: m.firstContentMs ?? t }));
        }
        // "structured" shows nothing until the end, even though the value is known earlier.
        this.update((s) => ({
          ...s,
          text,
          value: config.mode === "structured" ? s.value : value,
        }));
      } else if (event.type === "usage") {
        this.setMetrics({ outputTokens: event.outputTokens });
      } else if (event.type === "done") {
        finishReason = event.finishReason;
        const t = elapsed();
        this.setMetrics((m) => ({
          totalMs: t,
          // For modes that reveal everything at once, the first visible content is the end of the run.
          firstContentMs: m.firstContentMs ?? t,
          tokensPerSecond:
            streamed && m.ttftMs !== null && m.outputTokens && t > m.ttftMs
              ? round1(m.outputTokens / ((t - m.ttftMs) / 1000))
              : null,
        }));
      }
    }

    if (finishReason === null)
      throw new Error("The stream ended before the model finished.");
    if (wantsJson) this.validateWhole(config, text, finishReason);
  }

  // ---- fan-out ---------------------------------------------------------------------------

  private async runFanOut(
    config: RunConfig,
    fields: string[],
    signal: AbortSignal,
    elapsed: () => number,
  ): Promise<void> {
    let nextIndex = 0;
    let firstByte = false;
    const collected: Record<string, unknown> = {};
    let tokens = 0;
    let failure: Error | null = null;

    const runSection = async (field: string) => {
      this.setSection(field, { status: "running" });
      try {
        let text = "";
        let finishReason: string | null = null;
        const events = this.deps.stream(
          {
            provider: config.provider,
            model: config.model,
            taskId: config.taskId,
            format: "json",
            fields: [field],
            system: config.system,
            user: config.user,
            // Each narrow prompt is a classic request: the section appears when it is complete.
            stream: false,
            maxTokens: config.maxTokens,
            effort: config.effort,
            mock: config.provider === "mock" ? config.mock : undefined,
          },
          { signal, token: config.token },
        );
        for await (const event of events) {
          const t = elapsed();
          if (!firstByte) {
            firstByte = true;
            this.setMetrics({ ttfbMs: t, ttftMs: t });
          }
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "delta") text += event.text;
          if (event.type === "usage") tokens += event.outputTokens;
          if (event.type === "done") finishReason = event.finishReason;
        }
        if (finishReason === null)
          throw new Error(`The response for "${field}" ended before the model finished.`);
        if (isTruncated(finishReason))
          throw new Error(`The response for "${field}" was cut off at the token limit.`);
        const parsed = parseCompleteJson(text);
        if (!parsed || typeof parsed !== "object" || !(field in parsed))
          throw new Error(`No complete "${field}" in the response.`);
        const fieldValue = (parsed as Record<string, unknown>)[field];
        collected[field] = fieldValue;
        const t = elapsed();
        this.setSection(field, { status: "done", value: fieldValue, doneAtMs: t });
        this.setMetrics((m) => ({ firstContentMs: m.firstContentMs ?? t }));
        this.update((s) => ({ ...s, value: { ...collected } }));
      } catch (err) {
        if (signal.aborted) throw err;
        failure ??= err instanceof Error ? err : new Error(String(err));
        this.setSection(field, {
          status: "error",
          error: err instanceof Error ? err.message : "failed",
        });
      }
    };

    const worker = async () => {
      while (nextIndex < fields.length && !signal.aborted) {
        const field = fields[nextIndex++]!;
        await runSection(field);
      }
    };
    const limit = Math.max(1, Math.min(config.concurrency, fields.length));
    await Promise.all(Array.from({ length: limit }, worker));

    const t = elapsed();
    this.setMetrics({ totalMs: t, outputTokens: tokens || null });
    if (failure) {
      const message = (failure as Error).message;
      this.update((s) => ({ ...s, status: "error", error: message }));
    } else {
      this.validateWhole(config, JSON.stringify(collected));
    }
  }

  // ---- shared ------------------------------------------------------------------------------

  private validateWhole(config: RunConfig, text: string, finishReason?: string) {
    const task = getTask(config.taskId);
    // Strict on purpose: a partial parse of a cut-off document would pass the schema with a truncated field.
    const truncated = finishReason !== undefined && isTruncated(finishReason);
    const value = truncated ? undefined : parseCompleteJson(text);
    if (!task || value === undefined) {
      this.update((s) => ({
        ...s,
        valid: false,
        issues: [
          truncated
            ? "The response was cut off at the token limit."
            : "The response was not complete JSON.",
        ],
      }));
      return;
    }
    const result = task.schema.safeParse(value);
    // Correctness needs a labelled answer, which exists only for the unedited example inputs.
    const labelled = findCase(config.taskId, config.user);
    this.update((s) => ({
      ...s,
      value,
      score: labelled ? scoreCase(labelled, value) : null,
      valid: result.success,
      issues: result.success
        ? []
        : result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    }));
  }

  private finalize(totalMs: number) {
    this.setMetrics((m) => ({ totalMs: m.totalMs ?? totalMs }));
  }

  private setSection(field: string, patch: SectionState) {
    this.update((s) => ({
      ...s,
      sections: s.sections
        ? { ...s.sections, [field]: { ...s.sections[field], ...patch } }
        : s.sections,
    }));
  }

  private setMetrics(patch: Partial<Metrics> | ((m: Metrics) => Partial<Metrics>)) {
    this.update((s) => ({
      ...s,
      metrics: {
        ...s.metrics,
        ...(typeof patch === "function" ? patch(s.metrics) : patch),
      },
    }));
  }

  private update(fn: (s: RunSnapshot) => RunSnapshot) {
    if (!this.snapshot) return;
    this.snapshot = fn(this.snapshot);
    this.emit();
  }

  private emit() {
    if (!this.snapshot) return;
    for (const l of this.listeners) l(this.snapshot);
  }
}

function initialSections(fields: string[]): Record<string, SectionState> {
  return Object.fromEntries(
    fields.map((f) => [f, { status: "pending" } as SectionState]),
  );
}

function hasVisibleContent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((v) =>
    typeof v === "string" ? v.length > 0 : v != null,
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Finish reasons meaning "stopped at the token limit": Anthropic, OpenAI-compatible, Gemini. */
export const isTruncated = (finishReason: string) =>
  ["max_tokens", "length"].includes(finishReason.toLowerCase());

export type { ServerEvent };
