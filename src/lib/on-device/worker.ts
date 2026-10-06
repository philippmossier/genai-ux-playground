/// <reference lib="webworker" />
import {
  AutoModelForCausalLM,
  AutoTokenizer,
  env,
  InterruptableStoppingCriteria,
  TextStreamer,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";
import type { WorkerRequest, WorkerResponse } from "./protocol";

env.allowLocalModels = false;
env.useBrowserCache = true;

// The 64-bit JSPI build can parse single files over ~1 GB; the 32-bit one fails with std::bad_alloc.
const FLAVOR = "Suspending" in WebAssembly ? "jspi" : "asyncify";
const suffix = `.${FLAVOR}`;
/** Runtime builds stored as two parts by scripts/copy-ort.mjs (see ensureRuntime). */
const SPLIT_WASM = new Set(["asyncify"]);
const wasm = env.backends.onnx.wasm;
if (wasm) {
  const base = `${self.location.origin}/ort/ort-wasm-simd-threaded${suffix}`;
  // A split binary must not have a `wasm` path: Transformers.js would fetch that URL itself and overwrite
  // the joined binary with whatever comes back (a static host answers a missing file with index.html).
  wasm.wasmPaths = SPLIT_WASM.has(FLAVOR)
    ? { mjs: `${base}.mjs` }
    : { mjs: `${base}.mjs`, wasm: `${base}.wasm` };
}

/**
 * Static hosts cap the size of one file (Cloudflare: 25 MiB) and the asyncify build is about 27 MB, so
 * scripts/copy-ort.mjs stores it as two parts. They are fetched from this origin like the rest of the runtime
 * and joined before the runtime starts.
 */
let runtimeReady: Promise<void> | null = null;
function ensureRuntime(): Promise<void> {
  runtimeReady ??= (async () => {
    if (!wasm || !SPLIT_WASM.has(FLAVOR)) return;
    const url = `${self.location.origin}/ort/ort-wasm-simd-threaded${suffix}.wasm`;
    const parts = await Promise.all(
      [0, 1].map(async (i) => {
        const res = await fetch(`${url}.part${i}`);
        if (!res.ok)
          throw new Error(`Could not load the WebAssembly runtime (${res.status}).`);
        return new Uint8Array(await res.arrayBuffer());
      }),
    );
    const joined = new Uint8Array(parts[0]!.length + parts[1]!.length);
    joined.set(parts[0]!, 0);
    joined.set(parts[1]!, parts[0]!.length);
    // A missing part comes back as index.html with status 200 on most static hosts.
    if (joined[0] !== 0 || joined[1] !== 0x61 || joined[2] !== 0x73 || joined[3] !== 0x6d)
      throw new Error("The WebAssembly runtime files are missing on this server.");
    wasm.wasmBinary = joined;
  })();
  runtimeReady.catch(() => (runtimeReady = null));
  return runtimeReady;
}

const SAMPLING = {
  qwen3: { temperature: 0.7, top_p: 0.8, top_k: 20 },
  gemma4: { temperature: 1.0, top_p: 0.95, top_k: 64 },
} as const;

const post = (message: WorkerResponse) => self.postMessage(message);
let tokenizer: PreTrainedTokenizer | null = null;
let model: PreTrainedModel | null = null;
let family: "qwen3" | "gemma4" = "gemma4";
const stopping = new InterruptableStoppingCriteria();

async function load(msg: Extract<WorkerRequest, { type: "load" }>) {
  const started = performance.now();
  await ensureRuntime();
  await model?.dispose();
  model = null;
  family = msg.family;
  post({ type: "phase", id: msg.id, phase: "loading" });

  const progress_callback = (info: {
    status: string;
    loaded?: number;
    total?: number;
  }) => {
    if (info.status === "progress_total") {
      post({
        type: "progress",
        id: msg.id,
        loaded: info.loaded ?? 0,
        total: info.total ?? 0,
      });
    }
  };
  tokenizer = await AutoTokenizer.from_pretrained(msg.repo, {
    revision: msg.revision,
    progress_callback,
  });
  // The CausalLM class makes Transformers.js skip Gemma 4's vision and audio encoders.
  model = await AutoModelForCausalLM.from_pretrained(msg.repo, {
    revision: msg.revision,
    dtype: msg.dtype,
    device: "webgpu",
    progress_callback,
  });

  // The first run compiles GPU shaders. Do it now so it is not billed to the first measured run.
  post({ type: "phase", id: msg.id, phase: "warming" });
  await model.generate({ ...tokenizer("Hello"), max_new_tokens: 2, do_sample: false });
  post({ type: "loaded", id: msg.id, loadMs: Math.round(performance.now() - started) });
}

async function generate(msg: Extract<WorkerRequest, { type: "generate" }>) {
  if (!model || !tokenizer) throw new Error("No on-device model is loaded.");
  const inputs = tokenizer.apply_chat_template(
    [
      { role: "system", content: msg.system },
      { role: "user", content: msg.user },
    ],
    {
      add_generation_prompt: true,
      return_dict: true,
      // Extra keys are passed to the chat template; not part of the typings.
      ...({ enable_thinking: false } as object),
    },
  ) as unknown as Record<string, unknown>;

  let tokens = 0;
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => post({ type: "token", id: msg.id, text }),
    token_callback_function: () => {
      tokens++;
    },
  });
  stopping.reset();
  await model.generate({
    ...inputs,
    max_new_tokens: msg.maxNewTokens,
    ...(msg.deterministic
      ? { do_sample: false }
      : { do_sample: true, ...SAMPLING[family] }),
    streamer,
    stopping_criteria: stopping,
  });
  post({ type: "generated", id: msg.id, tokens });
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === "load") await load(msg);
    else if (msg.type === "generate") await generate(msg);
    else stopping.interrupt();
  } catch (err) {
    post({
      type: "error",
      id: "id" in msg ? msg.id : -1,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
