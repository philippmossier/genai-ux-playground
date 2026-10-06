import { RunRequestSchema, type RunRequest, type ServerEvent } from "../protocol";
import type { Provider } from "../providers/types";
import { buildSystemPrompt, getTask, schemaFor } from "../tasks";
import type { ServerEnv } from "./env";
import { clientIp, type RateLimiter } from "./rate-limit";
import { SSE_HEADERS, sseEncode } from "./sse";

export interface RunHandlerDeps {
  env: ServerEnv;
  providers: Provider[];
  /** Applies to providers that cost money. */
  paidLimiter: RateLimiter;
  mockLimiter: RateLimiter;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

/**
 * POST /api/run. Pre-flight problems (bad input, no permission, rate limit) are plain HTTP errors.
 * Once streaming has begun, problems arrive as an `error` event, because the status line is gone.
 */
export async function handleRun(
  request: Request,
  deps: RunHandlerDeps,
  /** The socket address, when the platform exposes it. */
  peerIp?: string,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Body must be JSON." });
  }
  const parsed = RunRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(400, {
      error: "Invalid request.",
      issues: parsed.error.issues.map((i) => i.message),
    });
  }
  const req: RunRequest = parsed.data;

  const provider = deps.providers.find((p) => p.id === req.provider);
  if (!provider || !provider.configured()) {
    return json(403, {
      error: `Provider "${req.provider}" is not available on this server.`,
    });
  }
  if (!provider.models().some((m) => m.id === req.model)) {
    return json(400, {
      error: `Model "${req.model}" is not offered by ${provider.label}.`,
    });
  }
  // Rate limit before the token check, so wrong tokens cannot be guessed at full speed.
  const limiter = provider.paid ? deps.paidLimiter : deps.mockLimiter;
  const ip = clientIp(request, deps.env.trustedProxyHops, peerIp);
  const rate = limiter.check(`${provider.id}:${ip}`);
  if (!rate.ok) {
    return json(
      429,
      { error: "Too many runs. Slow down." },
      { "Retry-After": String(rate.retryAfterSeconds) },
    );
  }

  if (provider.paid && deps.env.accessToken) {
    if (request.headers.get("x-playground-token") !== deps.env.accessToken) {
      return json(401, {
        error: "This server requires an access token for real providers.",
      });
    }
  }

  const task = getTask(req.taskId);
  if (!task) return json(400, { error: `Unknown task "${req.taskId}".` });

  let schema;
  try {
    schema = req.format === "json" ? schemaFor(task, req.fields) : undefined;
  } catch (err) {
    return json(400, { error: err instanceof Error ? err.message : "Bad fields." });
  }

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(request.signal.reason), {
    once: true,
  });

  const providerRun = provider.run({
    request: {
      ...req,
      system: buildSystemPrompt(task, req.system, req.format, req.fields),
    },
    task,
    schema,
    signal: abort.signal,
  });

  const startEvent: ServerEvent = {
    type: "start",
    provider: provider.id,
    model: req.model,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (req.stream) {
          controller.enqueue(sseEncode(startEvent));
          for await (const event of providerRun) controller.enqueue(sseEncode(event));
        } else {
          // Classic request/response: the browser hears nothing until the generation is complete.
          const events = [];
          for await (const event of providerRun) events.push(event);
          controller.enqueue(sseEncode(startEvent));
          for (const event of events) controller.enqueue(sseEncode(event));
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          controller.enqueue(sseEncode({ type: "error", message: errorMessage(err) }));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 400);
  return "Unknown provider error.";
}
