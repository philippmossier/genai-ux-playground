import { CheckIcon, XIcon } from "lucide-react";
import type { ModeProgress, ModeProgressMap } from "~/lib/client/use-runner";
import { modeInfo, MODES } from "~/lib/modes";
import type { RunMode } from "~/lib/protocol";
import { Button } from "./ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Spinner } from "./ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

/**
 * The mode tabs. During "run all" each tab shows its own state, and the view stays on the tab the user
 * picked: following the running mode made the result area jump between five different renderings.
 */
export function ModeTabs(p: {
  value: RunMode;
  status: ModeProgressMap;
  onChange: (mode: RunMode) => void;
}) {
  return (
    <Tabs value={p.value} onValueChange={(m) => p.onChange(m as RunMode)}>
      <TabsList className="h-auto flex-wrap">
        {MODES.map((m) => (
          <TabsTrigger key={m.id} value={m.id}>
            {m.label}
            <StatusIcon progress={p.status[m.id]} />
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function StatusIcon({ progress }: { progress?: ModeProgress }) {
  if (progress?.state === "running")
    return <Spinner data-icon="inline-end" aria-label="Running" />;
  if (progress?.state === "done")
    return (
      <CheckIcon data-icon="inline-end" aria-label="Done" className="text-primary" />
    );
  if (progress?.state === "error")
    return (
      <XIcon data-icon="inline-end" aria-label="Failed" className="text-destructive" />
    );
  return null;
}

/** Which mode is running now, so the user knows where to look. */
export function runningMode(status: ModeProgressMap): RunMode | undefined {
  return MODES.find((m) => status[m.id]?.state === "running")?.id;
}

/** Shown on a tab whose mode has not had its turn yet. */
export function QueuedNotice(p: { running?: RunMode; onWatch: (mode: RunMode) => void }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyTitle>Queued</EmptyTitle>
        <EmptyDescription>
          The modes run one after another, so they do not compete for the same model.
          {p.running && (
            <>
              {" "}
              Now running:{" "}
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={() => p.onWatch(p.running!)}
              >
                {modeInfo(p.running).label}
              </Button>
              .
            </>
          )}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
