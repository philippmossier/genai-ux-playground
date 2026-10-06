import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { nitroV2Plugin } from "@tanstack/nitro-v2-vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * ONNX Runtime references its WebAssembly files with `new URL(..., import.meta.url)`, so Vite copies them into
 * assets/ (one is 27 MB, over Cloudflare's 25 MiB file limit). They are never loaded: the worker always points
 * the runtime at /ort/ (scripts/copy-ort.mjs). Dropping them keeps the deploy small and makes a wrong path fail.
 */
function dropBundledOrtWasm(): Plugin {
  return {
    name: "drop-bundled-ort-wasm",
    apply: "build",
    generateBundle(_, bundle) {
      for (const name of Object.keys(bundle)) {
        if (/ort-wasm-simd-threaded.*\.wasm$/.test(name)) delete bundle[name];
      }
    },
  };
}

/**
 * `CLOUDFLARE=1 pnpm build` targets Cloudflare Workers (wrangler.jsonc) through the Cloudflare plugin, the path
 * TanStack Start documents. Nitro's Cloudflare preset failed at run time ("Illegal invocation" when sending a
 * response). Without the variable the build is the Node server used by `pnpm start` and the container.
 */
const onCloudflare = process.env.CLOUDFLARE === "1";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  // Never put secrets in `define`: it inlines into the client bundle. Provider keys
  // are read from process.env on the server only (see src/lib/server/env.ts).
  plugins: [
    onCloudflare
      ? cloudflare({ viteEnvironment: { name: "ssr" } })
      : nitroV2Plugin({ compatibilityDate: "2025-11-24" }),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
    dropBundledOrtWasm(),
  ],
});
