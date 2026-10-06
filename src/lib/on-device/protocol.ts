export type WorkerRequest =
  | {
      type: "load";
      id: number;
      repo: string;
      revision: string;
      family: "qwen3" | "gemma4";
      dtype: "q4f16" | "q4";
    }
  | {
      type: "generate";
      id: number;
      system: string;
      user: string;
      maxNewTokens: number;
      /** Greedy decoding: used for JSON, where a random token can break the syntax. */
      deterministic: boolean;
    }
  | { type: "interrupt" };

export type WorkerResponse =
  | { type: "progress"; id: number; loaded: number; total: number }
  | { type: "phase"; id: number; phase: "loading" | "warming" }
  | { type: "loaded"; id: number; loadMs: number }
  | { type: "token"; id: number; text: string }
  | { type: "generated"; id: number; tokens: number }
  | { type: "error"; id: number; message: string };
