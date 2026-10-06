import type { OnDeviceModel } from "./models";
import type { WorkerRequest, WorkerResponse } from "./protocol";

export type EngineStatus =
  | { state: "idle" }
  | {
      state: "loading";
      modelId: string;
      loaded: number;
      total: number;
      phase: "loading" | "warming";
    }
  | { state: "ready"; modelId: string; loadMs: number }
  | { state: "error"; message: string };

type Pending = {
  resolve: (v: never) => void;
  reject: (e: Error) => void;
  onToken?: (text: string) => void;
};

/** Browser-side inference engine. One worker, one model, one generation at a time. */
class OnDeviceEngine {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private status: EngineStatus = { state: "idle" };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getStatus = () => this.status;

  private set(status: EngineStatus) {
    this.status = status;
    this.listeners.forEach((l) => l());
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handle(e.data);
      this.worker.onerror = (e) =>
        this.failAll(new Error(e.message || "The on-device engine crashed."));
    }
    return this.worker;
  }

  /** Half-precision shaders give the smaller q4f16 weights; without them the q4 files are used. */
  private async dtype(): Promise<"q4f16" | "q4"> {
    const gpu = (
      navigator as Navigator & {
        gpu?: {
          requestAdapter(): Promise<{ features: { has(n: string): boolean } } | null>;
        };
      }
    ).gpu;
    const adapter = await gpu?.requestAdapter();
    return adapter?.features.has("shader-f16") ? "q4f16" : "q4";
  }

  async load(model: OnDeviceModel): Promise<void> {
    if (this.status.state === "ready" && this.status.modelId === model.id) return;
    const dtype = await this.dtype();
    this.set({
      state: "loading",
      modelId: model.id,
      loaded: 0,
      total: 0,
      phase: "loading",
    });
    try {
      await this.request<{ loadMs: number }>((id) => ({
        type: "load",
        id,
        repo: model.repo,
        revision: model.revision,
        family: model.family,
        dtype,
      })).then(({ loadMs }) => this.set({ state: "ready", modelId: model.id, loadMs }));
    } catch (err) {
      this.set({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /** Generations are serialised: one GPU, one model. Parallel callers wait their turn. */
  generate(
    system: string,
    user: string,
    options: {
      maxNewTokens: number;
      deterministic: boolean;
      onToken: (t: string) => void;
      signal: AbortSignal;
    },
  ): Promise<number> {
    const run = async () => {
      if (options.signal.aborted) throw options.signal.reason;
      const onAbort = () =>
        this.worker?.postMessage({ type: "interrupt" } satisfies WorkerRequest);
      options.signal.addEventListener("abort", onAbort, { once: true });
      try {
        const { tokens } = await this.request<{ tokens: number }>(
          (id) => ({
            type: "generate",
            id,
            system,
            user,
            maxNewTokens: options.maxNewTokens,
            deterministic: options.deterministic,
          }),
          options.onToken,
        );
        return tokens;
      } finally {
        options.signal.removeEventListener("abort", onAbort);
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private request<T>(
    build: (id: number) => WorkerRequest,
    onToken?: (t: string) => void,
  ): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: never) => void, reject, onToken });
      this.ensureWorker().postMessage(build(id));
    });
  }

  private handle(msg: WorkerResponse) {
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    switch (msg.type) {
      case "progress":
        if (this.status.state === "loading")
          this.set({ ...this.status, loaded: msg.loaded, total: msg.total });
        break;
      case "phase":
        if (this.status.state === "loading")
          this.set({ ...this.status, phase: msg.phase });
        break;
      case "token":
        entry.onToken?.(msg.text);
        break;
      case "loaded":
        this.pending.delete(msg.id);
        entry.resolve({ loadMs: msg.loadMs } as never);
        break;
      case "generated":
        this.pending.delete(msg.id);
        entry.resolve({ tokens: msg.tokens } as never);
        break;
      case "error":
        this.pending.delete(msg.id);
        entry.reject(new Error(msg.message));
        break;
    }
  }

  private failAll(error: Error) {
    for (const [id, entry] of this.pending) {
      this.pending.delete(id);
      entry.reject(error);
    }
  }
}

export const onDeviceEngine = new OnDeviceEngine();
