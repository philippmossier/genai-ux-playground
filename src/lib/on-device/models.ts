/** Models the playground can run inside the browser. Sizes are text-only downloads (see local-ai-chat). */
export interface OnDeviceModel {
  id: string;
  label: string;
  note: string;
  repo: string;
  /** Pinned commit of the Hugging Face repo. */
  revision: string;
  family: "qwen3" | "gemma4";
  downloadMB: number;
}

export const ON_DEVICE_MODELS: OnDeviceModel[] = [
  {
    id: "gemma4-e2b",
    label: "Gemma 4 E2B (on this device)",
    note: "3.1 GB download, once. Needs a GPU with WebGPU.",
    repo: "onnx-community/gemma-4-E2B-it-ONNX",
    revision: "9f4bef82ea6e296bc69f8a2f5939f73af81b07a6",
    family: "gemma4",
    downloadMB: 3111,
  },
  {
    id: "qwen3-0.6b",
    label: "Qwen3 0.6B (on this device)",
    note: "570 MB download, once. Fast, but weak at structured output.",
    repo: "onnx-community/Qwen3-0.6B-ONNX",
    revision: "da1453100cf3ff33ef56d17983fc7a8648706db6",
    family: "qwen3",
    downloadMB: 570,
  },
];

export const getOnDeviceModel = (id: string) => ON_DEVICE_MODELS.find((m) => m.id === id);
