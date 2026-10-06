import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import { getRunDeps } from "~/lib/server/deps";
import { handleRun } from "~/lib/server/run-handler";

export const Route = createFileRoute("/api/run")({
  server: {
    handlers: {
      POST: ({ request }) => handleRun(request, getRunDeps(), getRequestIP()),
    },
  },
});
