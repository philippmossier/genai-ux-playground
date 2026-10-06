import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { ModelOption } from "../protocol";
import type { ServerEnv } from "../server/env";
import type { Provider, ProviderEvent, ProviderRun } from "./types";

interface ModelSpec extends ModelOption {
  /** Accepts output_config.effort. */
  effort: boolean;
  /** Safe to opt into server-side refusal fallbacks. */
  fallbacks: boolean;
}

const MODELS: ModelSpec[] = [
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    note: "Best price-performance for most tasks",
    effort: true,
    fallbacks: true,
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    note: "Fastest and cheapest, no effort control",
    effort: false,
    fallbacks: false,
  },
];

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function createAnthropicProvider(env: ServerEnv): Provider {
  return {
    id: "anthropic",
    label: "Anthropic",
    configured: () => env.allowReal && Boolean(env.anthropicKey),
    paid: true,
    supportsEffort: true,
    models: () => MODELS.map(({ id, label, note }) => ({ id, label, note })),
    run: (run) => runAnthropic(new Anthropic({ apiKey: env.anthropicKey }), run),
  };
}

export function buildAnthropicParams({
  request,
  schema,
}: Pick<ProviderRun, "request" | "schema">) {
  const spec = MODELS.find((m) => m.id === request.model);
  if (!spec) throw new Error(`Unknown Anthropic model "${request.model}"`);

  const outputConfig = {
    ...(spec.effort && request.effort ? { effort: request.effort } : {}),
    ...(request.format === "json" && schema
      ? { format: betaZodOutputFormat(schema) }
      : {}),
  };

  return {
    model: spec.id,
    max_tokens: request.maxTokens,
    system: request.system,
    messages: [{ role: "user" as const, content: request.user }],
    ...(Object.keys(outputConfig).length > 0 ? { output_config: outputConfig } : {}),
    // A safety classifier may decline a request; this lets the API retry it on another model
    // instead of surfacing a refusal in the middle of a demo.
    ...(spec.fallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
  };
}

async function* runAnthropic(
  client: Anthropic,
  run: ProviderRun,
): AsyncGenerator<ProviderEvent> {
  const params = buildAnthropicParams(run);
  const options = { signal: run.signal };

  if (!run.request.stream) {
    const message = await client.beta.messages.create(params, options);
    if (message.stop_reason === "refusal")
      throw new Error("The model declined to answer (refusal).");
    const text = message.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("");
    yield { type: "delta", text };
    yield {
      type: "usage",
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
    yield { type: "done", finishReason: message.stop_reason ?? "end_turn" };
    return;
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let finishReason = "end_turn";
  const stream = client.beta.messages.stream(params, options);
  for await (const event of stream) {
    if (event.type === "message_start") {
      inputTokens = event.message.usage.input_tokens;
    } else if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield { type: "delta", text: event.delta.text };
    } else if (event.type === "message_delta") {
      outputTokens = event.usage.output_tokens ?? outputTokens;
      finishReason = event.delta.stop_reason ?? finishReason;
    }
  }
  if (finishReason === "refusal")
    throw new Error("The model declined to answer (refusal).");
  yield { type: "usage", inputTokens, outputTokens };
  yield { type: "done", finishReason };
}
