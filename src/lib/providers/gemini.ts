import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import { z } from "zod";
import type { ModelOption } from "../protocol";
import type { ServerEnv } from "../server/env";
import type { Provider, ProviderEvent, ProviderRun } from "./types";

/** Explicit versions, not the "-latest" aliases: an alias would silently change what a benchmark measures. */
const MODELS: ModelOption[] = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", note: "Newest Flash" },
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite",
    note: "Newest Flash-Lite: cheapest and fastest",
  },
];

const LEVEL = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
} as const;

export function createGeminiProvider(env: ServerEnv): Provider {
  return {
    id: "gemini",
    label: "Google Gemini",
    configured: () => env.allowReal && Boolean(env.geminiKey),
    paid: true,
    supportsEffort: true,
    models: () => MODELS,
    run: (run) => runGemini(new GoogleGenAI({ apiKey: env.geminiKey }), run),
  };
}

export function buildGeminiConfig({
  request,
  schema,
  signal,
}: Pick<ProviderRun, "request" | "schema" | "signal">): GenerateContentConfig {
  const json = request.format === "json" && schema;
  return {
    systemInstruction: request.system,
    maxOutputTokens: request.maxTokens,
    abortSignal: signal,
    ...(request.effort
      ? { thinkingConfig: { thinkingLevel: LEVEL[request.effort] } }
      : {}),
    ...(json
      ? {
          responseMimeType: "application/json",
          responseJsonSchema: toJsonSchema(schema),
        }
      : {}),
  };
}

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

async function* runGemini(
  ai: GoogleGenAI,
  run: ProviderRun,
): AsyncGenerator<ProviderEvent> {
  const params = {
    model: run.request.model,
    contents: run.request.user,
    config: buildGeminiConfig(run),
  };

  if (!run.request.stream) {
    const res = await ai.models.generateContent(params);
    assertNotBlocked(res.promptFeedback?.blockReason, res.candidates?.[0]?.finishReason);
    yield { type: "delta", text: res.text ?? "" };
    yield {
      type: "usage",
      inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: outputTokens(res.usageMetadata),
    };
    yield {
      type: "done",
      finishReason: String(res.candidates?.[0]?.finishReason ?? "STOP"),
    };
    return;
  }

  let finishReason = "STOP";
  let usage = { inputTokens: 0, outputTokens: 0 };
  for await (const chunk of await ai.models.generateContentStream(params)) {
    assertNotBlocked(
      chunk.promptFeedback?.blockReason,
      chunk.candidates?.[0]?.finishReason,
    );
    if (chunk.text) yield { type: "delta", text: chunk.text };
    const reason = chunk.candidates?.[0]?.finishReason;
    if (reason) finishReason = String(reason);
    if (chunk.usageMetadata) {
      usage = {
        inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
        outputTokens: outputTokens(chunk.usageMetadata),
      };
    }
  }
  yield { type: "usage", ...usage };
  yield { type: "done", finishReason };
}

/** Billed output includes hidden thinking tokens, which is what a latency comparison should count. */
function outputTokens(u?: {
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
}) {
  return (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0);
}

function assertNotBlocked(blockReason?: unknown, finishReason?: unknown) {
  if (blockReason) throw new Error(`Gemini blocked the prompt (${String(blockReason)}).`);
  if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT") {
    throw new Error(`Gemini stopped the answer (${String(finishReason)}).`);
  }
}
