// Copies the ONNX Runtime WebAssembly files into public/ort so the browser loads them from this
// origin instead of the library's default public CDN. Used by the on-device provider.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
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
console.log(`copied ${files.length} ONNX Runtime files to public/ort`);
