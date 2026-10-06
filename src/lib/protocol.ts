import { z } from "zod";

/**
 * The one contract between provider adapters (server) and render strategies (client).
 * Every provider is reduced to this small event stream, so a render mode never knows
 * which vendor produced the tokens. See docs/adr/0001.
 */

export const PROVIDER_IDS = [
  "mock",
  "anthropic",
  "openai-compatible",
  "gemini",
  "on-device",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const RunRequestSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  model: z.string().min(1).max(100),
  taskId: z.string().min(1).max(60),
  /** "text" = free prose, "json" = output constrained to the task schema (or a subset of its fields). */
  format: z.enum(["text", "json"]),
  /** For format "json": restrict to these top-level fields (used by the fan-out mode). */
  fields: z.array(z.string().max(60)).max(20).optional(),
  system: z.string().max(8_000),
  user: z.string().min(1).max(20_000),
  /** false = the provider is called without streaming, like a classic request/response API. */
  stream: z.boolean(),
  maxTokens: z.number().int().min(16).max(4_096).default(1_024),
  effort: z.enum(["low", "medium", "high"]).optional(),
  /** Only read by the mock provider. */
  mock: z
    .object({
      ttfbMs: z.number().min(0).max(15_000),
      tokensPerSecond: z.number().min(1).max(1_000),
    })
    .optional(),
});
export type RunRequest = z.infer<typeof RunRequestSchema>;

export type ServerEvent =
  | { type: "start"; provider: ProviderId; model: string }
  | { type: "delta"; text: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done"; finishReason: string }
  | { type: "error"; message: string };

export const RUN_MODES = [
  "blocking",
  "text-stream",
  "structured",
  "structured-stream",
  "fan-out",
] as const;
export type RunMode = (typeof RUN_MODES)[number];

export interface ModelOption {
  id: string;
  label: string;
  note?: string;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  configured: boolean;
  models: ModelOption[];
  /** true when the server wants an access token before it calls this provider */
  requiresToken: boolean;
  supportsEffort: boolean;
}
