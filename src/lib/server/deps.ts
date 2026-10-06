import { createProviders } from "../providers";
import { readServerEnv } from "./env";
import { RateLimiter } from "./rate-limit";
import type { RunHandlerDeps } from "./run-handler";

let cached: RunHandlerDeps | undefined;

/** Built lazily so env is read at request time on the server, never at module load in the client bundle. */
export function getRunDeps(): RunHandlerDeps {
  if (!cached) {
    const env = readServerEnv();
    cached = {
      env,
      providers: createProviders(env),
      paidLimiter: new RateLimiter(env.paidRatePerMinute, 60_000),
      mockLimiter: new RateLimiter(120, 60_000),
    };
  }
  return cached;
}
