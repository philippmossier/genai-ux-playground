import tailwindcss from "@tailwindcss/vite";
import { nitroV2Plugin } from "@tanstack/nitro-v2-vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  // Never put secrets in `define`: it inlines into the client bundle. Provider keys
  // are read from process.env on the server only (see src/lib/server/env.ts).
  plugins: [
    tanstackStart(),
    nitroV2Plugin({ compatibilityDate: "2025-11-24" }),
    viteReact(),
    tailwindcss(),
  ],
});
