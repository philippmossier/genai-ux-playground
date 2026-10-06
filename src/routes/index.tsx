import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { CompareTable } from "~/components/compare-table";
import { MetricsStrip } from "~/components/metrics-strip";
import { ModeTabs, QueuedNotice, runningMode } from "~/components/mode-tabs";
import { isOnDeviceReady, useOnDeviceStatus } from "~/components/on-device-panel";
import { ResultView } from "~/components/result-view";
import { SettingsPanel, type Settings } from "~/components/settings-panel";
import { Button } from "~/components/ui/button";
import type { RunConfig } from "~/lib/client/types";
import { useRunner } from "~/lib/client/use-runner";
import { modeInfo } from "~/lib/modes";
import { ON_DEVICE_MODELS } from "~/lib/on-device/models";
import { RUN_MODES, type ProviderInfo, type RunMode } from "~/lib/protocol";
import { getProviders } from "~/lib/server/providers-fn";
import { getTask, TASKS } from "~/lib/tasks";

interface Search {
  mode: RunMode;
  task: string;
  provider: string;
  model: string;
}

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    mode: RUN_MODES.includes(s.mode as RunMode)
      ? (s.mode as RunMode)
      : "structured-stream",
    task: TASKS.some((t) => t.id === s.task) ? (s.task as string) : TASKS[0]!.id,
    provider: typeof s.provider === "string" ? s.provider : "mock",
    model: typeof s.model === "string" ? s.model : "mock-1",
  }),
  loader: () => getProviders(),
  component: Playground,
});

const noopSubscribe = () => () => {};
/** WebGPU exists only in the browser, so the server render and the first client render say "no". */
const useWebGpu = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => "gpu" in navigator,
    () => false,
  );

function Playground() {
  const hosted = Route.useLoaderData();
  const webgpu = useWebGpu();
  const onDeviceInfo: ProviderInfo = {
    id: "on-device",
    label: "On this device (WebGPU)",
    configured: webgpu,
    models: ON_DEVICE_MODELS.map(({ id, label, note }) => ({ id, label, note })),
    requiresToken: false,
    supportsEffort: false,
  };
  const providers = [...hosted, onDeviceInfo];
  const onDeviceStatus = useOnDeviceStatus();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const runner = useRunner();

  const [edits, setEdits] = useState<Record<string, { system?: string; user?: string }>>(
    {},
  );
  const [settings, setSettings] = useState<Settings>({
    maxTokens: 1024,
    effort: "low",
    ttfbMs: 800,
    tokensPerSecond: 40,
    concurrency: 3,
    repeat: 1,
    token: "",
  });

  const task = getTask(search.task)!;
  const system = edits[task.id]?.system ?? task.system;
  const user = edits[task.id]?.user ?? task.defaultInput;

  const provider = providers.find((p) => p.id === search.provider);
  const validProvider = provider?.configured ? provider : providers[0]!;
  const model = validProvider.models.some((m) => m.id === search.model)
    ? search.model
    : (validProvider.models[0]?.id ?? "");

  const set = (patch: Partial<Search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const config = (mode: RunMode): RunConfig => ({
    mode,
    provider: validProvider.id,
    model,
    taskId: task.id,
    system,
    user,
    maxTokens: settings.maxTokens,
    effort: validProvider.supportsEffort ? settings.effort : undefined,
    mock: { ttfbMs: settings.ttfbMs, tokensPerSecond: settings.tokensPerSecond },
    concurrency: settings.concurrency,
    token: settings.token || undefined,
  });

  const live = runner.snapshot;
  // The view stays on the tab the user picked, also during "Run all": following the running mode made the
  // result area jump between five renderings. Each tab shows its own progress instead (ModeTabs).
  const activeMode = search.mode;
  const running = runningMode(runner.modeStatus);
  const queued =
    runner.busy &&
    runner.modeStatus[activeMode]?.state === "queued" &&
    !runner.modeStatus[activeMode]?.finished;
  const info = modeInfo(activeMode);
  const blocked =
    validProvider.id === "on-device" && !isOnDeviceReady(onDeviceStatus, model);
  const shown =
    live && live.config.mode === activeMode
      ? live
      : (runner.history.find((r) => r.config.mode === activeMode) ?? null);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">GenAI UX Playground</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Benchmark how an LLM answer reaches the user. Run one prompt through five
          delivery strategies on Gemini, Claude, GPT or any OpenAI-compatible model, or on
          a model running in this browser (Qwen3 0.6B, Gemma 4 E2B), and compare time to
          first content, total time, tokens and correctness side by side, with repeated
          runs for a median. The model does not get faster: how the request is made and
          rendered decides when the user sees something usable.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
        <SettingsPanel
          providers={providers}
          providerId={validProvider.id}
          model={model}
          taskId={task.id}
          system={system}
          user={user}
          settings={settings}
          onProvider={(id) =>
            set({
              provider: id,
              model: providers.find((p) => p.id === id)?.models[0]?.id ?? "",
            })
          }
          onModel={(id) => set({ model: id })}
          onTask={(id) => set({ task: id })}
          onSystem={(text) =>
            setEdits((e) => ({ ...e, [task.id]: { ...e[task.id], system: text } }))
          }
          onUser={(text) =>
            setEdits((e) => ({ ...e, [task.id]: { ...e[task.id], user: text } }))
          }
          onSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
        />

        <div className="flex min-w-0 flex-col gap-6">
          <ModeTabs
            value={activeMode}
            status={runner.modeStatus}
            onChange={(m) => set({ mode: m })}
          />

          <div className="flex flex-col gap-1 text-sm">
            <p>{info.summary}</p>
            <p className="text-muted-foreground">{info.tradeoff}</p>
            <dl className="mt-2 grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">Request (backend)</dt>
              <dd>{info.request}</dd>
              <dt className="text-muted-foreground">Render (browser)</dt>
              <dd>{info.render}</dd>
            </dl>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {runner.busy ? (
              <>
                <Button variant="destructive" onClick={runner.cancel}>
                  Stop
                  {runner.progress
                    ? ` (${runner.progress.done}/${runner.progress.total} done)`
                    : ""}
                </Button>
                {running && running !== activeMode && (
                  <span className="text-sm text-muted-foreground">
                    Now running: {modeInfo(running).label}. Click its tab to watch.
                  </span>
                )}
              </>
            ) : (
              <>
                <Button
                  disabled={blocked}
                  onClick={() => runner.run(config(search.mode), settings.repeat)}
                >
                  Run {info.label.toLowerCase()}
                </Button>
                <Button
                  variant="outline"
                  disabled={blocked}
                  onClick={() => runner.runAll(config(search.mode), settings.repeat)}
                >
                  {settings.repeat > 1
                    ? `Run all 5 modes x ${settings.repeat}`
                    : "Run all 5 and compare"}
                </Button>
              </>
            )}
          </div>

          {queued ? (
            <QueuedNotice running={running} onWatch={(m) => set({ mode: m })} />
          ) : (
            <>
              <MetricsStrip run={shown} />
              <ResultView run={shown} />
            </>
          )}
          <CompareTable runs={runner.history} onClear={runner.clearHistory} />
        </div>
      </div>
    </main>
  );
}
