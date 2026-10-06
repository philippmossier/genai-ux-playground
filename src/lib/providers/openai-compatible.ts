import OpenAI from "openai";
import { z } from "zod";
import type { ServerEnv } from "../server/env";
import type { Provider, ProviderEvent, ProviderRun } from "./types";

/** Reasoning models spend completion tokens on hidden thinking, so the visible answer needs headroom. */
const isReasoningModel = (model: string) => /^(gpt-5|o\d)/.test(model);
const REASONING_HEADROOM = 4_096;

export function createOpenAICompatibleProvider(env: ServerEnv): Provider {
  return {
    id: "openai-compatible",
    label: env.openaiBaseUrl
      ? `OpenAI-compatible (${new URL(env.openaiBaseUrl).host})`
      : "OpenAI",
    configured: () =>
      env.allowReal && Boolean(env.openaiKey) && env.openaiModels.length > 0,
    paid: Boolean(env.openaiKey) && !isLocalUrl(env.openaiBaseUrl),
    supportsEffort: true,
    models: () => env.openaiModels.map((id) => ({ id, label: id })),
    run: (run) =>
      runOpenAI(
        new OpenAI({ apiKey: env.openaiKey ?? "not-needed", baseURL: env.openaiBaseUrl }),
        run,
      ),
  };
}

function isLocalUrl(url?: string) {
  if (!url) return false;
  const host = new URL(url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function buildOpenAIParams({
  request,
  schema,
}: Pick<ProviderRun, "request" | "schema">) {
  const reasoning = isReasoningModel(request.model);
  return {
    model: request.model,
    messages: [
      { role: "system" as const, content: request.system },
      { role: "user" as const, content: request.user },
    ],
    max_completion_tokens: request.maxTokens + (reasoning ? REASONING_HEADROOM : 0),
    ...(reasoning && request.effort ? { reasoning_effort: request.effort } : {}),
    ...(request.format === "json" && schema
      ? {
          response_format: {
            type: "json_schema" as const,
            json_schema: { name: "result", strict: true, schema: toJsonSchema(schema) },
          },
        }
      : {}),
  };
}

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

async function* runOpenAI(
  client: OpenAI,
  run: ProviderRun,
): AsyncGenerator<ProviderEvent> {
  const params = buildOpenAIParams(run);
  const options = { signal: run.signal };

  if (!run.request.stream) {
    const completion = await client.chat.completions.create(
      { ...params, stream: false },
      options,
    );
    const choice = completion.choices[0];
    if (choice?.message.refusal)
      throw new Error(`The model declined: ${choice.message.refusal}`);
    yield { type: "delta", text: choice?.message.content ?? "" };
    yield {
      type: "usage",
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    };
    yield { type: "done", finishReason: choice?.finish_reason ?? "stop" };
    return;
  }

  const stream = await client.chat.completions.create(
    { ...params, stream: true, stream_options: { include_usage: true } },
    options,
  );
  let finishReason = "stop";
  let usage = { inputTokens: 0, outputTokens: 0 };
  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (choice?.delta.content) yield { type: "delta", text: choice.delta.content };
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (chunk.usage) {
      usage = {
        inputTokens: chunk.usage.prompt_tokens,
        outputTokens: chunk.usage.completion_tokens,
      };
    }
  }
  yield { type: "usage", ...usage };
  yield { type: "done", finishReason };
}
