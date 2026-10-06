import { createServerFn } from "@tanstack/react-start";
import type { ProviderInfo } from "../protocol";

/** Which providers this server offers, and which need a token. Never returns keys. */
export const getProviders = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProviderInfo[]> => {
    const [{ describeProviders }, { getRunDeps }] = await Promise.all([
      import("../providers"),
      import("./deps"),
    ]);
    const deps = getRunDeps();
    return describeProviders(deps.providers, deps.env);
  },
);
