// Copies the ONNX Runtime WebAssembly files into public/ort so the browser loads them from this
// origin instead of the library's default public CDN. Used by the on-device provider.
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const transformers = require.resolve("@huggingface/transformers");
const from = path.dirname(createRequire(transformers).resolve("onnxruntime-web"));
const to = path.resolve("public/ort");

mkdirSync(to, { recursive: true });
const wanted = /^ort-wasm-simd-threaded(\.asyncify|\.jspi)?\.(mjs|wasm)$/;
const files = readdirSync(from).filter((f) => wanted.test(f));
for (const f of files) cpSync(path.join(from, f), path.join(to, f));

// Static hosts cap the size of one file (Cloudflare: 25 MiB). The asyncify build is about 27 MB, so it is
// stored as two parts that the worker fetches and joins (see SPLIT_WASM in the worker).
const MAX_FILE = 24 * 1024 * 1024;
for (const f of files.filter((f) => f.endsWith(".wasm"))) {
  const file = path.join(to, f);
  const size = statSync(file).size;
  if (size <= MAX_FILE) continue;
  const bytes = readFileSync(file);
  const half = Math.ceil(size / 2);
  if (half > MAX_FILE)
    throw new Error(`${f} needs more than two parts; update the worker`);
  writeFileSync(`${file}.part0`, bytes.subarray(0, half));
  writeFileSync(`${file}.part1`, bytes.subarray(half));
  rmSync(file);
  console.log(`split ${f} into two parts`);
}
console.log(`copied ${files.length} ONNX Runtime files to public/ort`);
