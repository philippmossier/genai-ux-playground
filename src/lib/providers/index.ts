import type { ProviderInfo } from "../protocol";
import type { ServerEnv } from "../server/env";
import { createAnthropicProvider } from "./anthropic";
import { createGeminiProvider } from "./gemini";
import { mockProvider } from "./mock";
import { createOpenAICompatibleProvider } from "./openai-compatible";
import type { Provider } from "./types";

export function createProviders(env: ServerEnv): Provider[] {
  return [
    mockProvider,
    createGeminiProvider(env),
    createAnthropicProvider(env),
    createOpenAICompatibleProvider(env),
  ];
}

export function describeProviders(providers: Provider[], env: ServerEnv): ProviderInfo[] {
  return providers.map((p) => ({
    id: p.id,
    label: p.label,
    configured: p.configured(),
    models: p.configured() ? p.models() : [],
    requiresToken: p.paid && Boolean(env.accessToken),
    supportsEffort: p.supportsEffort,
  }));
}
