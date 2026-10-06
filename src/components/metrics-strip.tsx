import type { RunSnapshot } from "~/lib/client/types";
import { cn, formatMs } from "~/lib/utils";
import { Card } from "./ui/card";

export function MetricsStrip({ run }: { run: RunSnapshot | null }) {
  const m = run?.metrics;
  const tiles = [
    { label: "First byte", value: formatMs(m?.ttfbMs), hint: "server answered" },
    { label: "First token", value: formatMs(m?.ttftMs), hint: "model started" },
    {
      label: "First content",
      value: formatMs(m?.firstContentMs),
      hint: "user sees something",
      key: true,
    },
    { label: "Complete", value: formatMs(m?.totalMs), hint: "all done" },
    {
      label: "Output tokens",
      value: m?.outputTokens != null ? String(m.outputTokens) : "-",
      hint: m?.tokensPerSecond != null ? `${m.tokensPerSecond} tok/s` : "",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {tiles.map((t) => (
        <Card
          key={t.label}
          size="sm"
          className={cn("gap-0 px-3", t.key && "ring-2 ring-primary")}
        >
          <div className="text-[11px] tracking-wide text-muted-foreground uppercase">
            {t.label}
          </div>
          <div className={cn("font-mono text-lg", t.key && "text-primary")}>
            {t.value}
          </div>
          <div className="h-4 text-[11px] text-muted-foreground">{t.hint}</div>
        </Card>
      ))}
    </div>
  );
}
