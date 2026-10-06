export interface ServerEnv {
  /** Real providers stay hidden and unreachable unless this is explicitly "1". */
  allowReal: boolean;
  anthropicKey?: string;
  geminiKey?: string;
  openaiKey?: string;
  openaiBaseUrl?: string;
  openaiModels: string[];
  accessToken?: string;
  /** Proxies in front of the server that append to X-Forwarded-For. 0: ignore the header (it is client-controlled). */
  trustedProxyHops: number;
  /** Requests per minute per client for providers that cost money. One "run all" is 10 requests. */
  paidRatePerMinute: number;
}

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export function readServerEnv(
  env: Record<string, string | undefined> = process.env,
): ServerEnv {
  const baseUrl = clean(env.OPENAI_BASE_URL);
  const listed = (clean(env.OPENAI_COMPAT_MODELS) ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return {
    allowReal: env.ALLOW_REAL_PROVIDERS === "1",
    anthropicKey: clean(env.ANTHROPIC_API_KEY),
    geminiKey: clean(env.GEMINI_API_KEY),
    openaiKey: clean(env.OPENAI_API_KEY),
    openaiBaseUrl: baseUrl,
    // The default list is only valid for api.openai.com. A custom endpoint must say what it serves.
    openaiModels:
      listed.length > 0
        ? listed
        : baseUrl
          ? []
          : ["gpt-4.1-mini", "gpt-5-mini", "gpt-5-nano"],
    accessToken: clean(env.PLAYGROUND_ACCESS_TOKEN),
    trustedProxyHops: Math.max(0, Math.floor(Number(env.TRUSTED_PROXY_HOPS) || 0)),
    paidRatePerMinute:
      Number(env.PAID_RATE_LIMIT_PER_MIN) > 0 ? Number(env.PAID_RATE_LIMIT_PER_MIN) : 30,
  };
}
