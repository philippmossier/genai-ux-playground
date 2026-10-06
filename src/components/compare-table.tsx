import { aggregateRuns, type RunGroup, type Stat } from "~/lib/client/aggregate";
import { buildExport } from "~/lib/client/export";
import type { RunSnapshot } from "~/lib/client/types";
import { modeInfo } from "~/lib/modes";
import { cn, formatMs } from "~/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

const range = (s: Stat | null) =>
  s && s.min !== s.max ? `${formatMs(s.min)} to ${formatMs(s.max)}` : null;

export function CompareTable({
  runs,
  onClear,
}: {
  runs: RunSnapshot[];
  onClear: () => void;
}) {
  if (runs.length === 0) return null;
  const groups = aggregateRuns(runs);
  const scale = Math.max(...groups.map((g) => g.complete?.median ?? 0), 1);
  const best = Math.min(...groups.map((g) => g.firstContent?.median ?? Infinity));
  const anyScored = groups.some((g) => g.accuracy);

  function exportJson() {
    const data = buildExport(runs, {
      userAgent: navigator.userAgent,
      exportedAt: new Date().toISOString(),
    });
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `genai-ux-playground-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Runs <span className="font-normal text-muted-foreground">({runs.length})</span>
        </h2>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={exportJson}>
            Export JSON
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>
      <div className="rounded-xl border">
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead>Mode</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Runs</TableHead>
              <TableHead>First content</TableHead>
              <TableHead>Complete</TableHead>
              <TableHead>Tokens</TableHead>
              {anyScored && <TableHead>Correct</TableHead>}
              <TableHead className="w-1/4">Timeline (median)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <Row key={g.key} g={g} scale={scale} best={best} anyScored={anyScored} />
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Legend color="bg-muted-foreground/40" label="user sees nothing" />
        <Legend color="bg-primary" label="usable" />
        <span>
          Several runs of the same mode and model are grouped: median, with the range
          below.
          {anyScored &&
            " Correct = share of checks passed against the labelled answer (free text is not scored)."}
        </span>
      </p>
    </section>
  );
}

function Row({
  g,
  scale,
  best,
  anyScored,
}: {
  g: RunGroup;
  scale: number;
  best: number;
  anyScored: boolean;
}) {
  const isBest = g.firstContent?.median === best;
  return (
    <TableRow className="align-top">
      <TableCell>
        {modeInfo(g.mode).label}
        {g.failed > 0 && (
          <Badge variant="destructive" className="ml-2">
            {g.failed} failed
          </Badge>
        )}
        {g.invalid > 0 && (
          <Badge variant="secondary" className="ml-2">
            {g.invalid} invalid
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{g.model}</TableCell>
      <TableCell className="font-mono text-muted-foreground">{g.n}</TableCell>
      <Cell stat={g.firstContent} highlight={isBest} />
      <Cell stat={g.complete} />
      <TableCell className="font-mono text-muted-foreground">
        {g.outputTokens ?? "-"}
      </TableCell>
      {anyScored && (
        <TableCell className="font-mono">
          {g.accuracy ? (
            <>
              <span
                className={
                  g.accuracy.mean >= 0.9
                    ? "text-primary"
                    : g.accuracy.mean >= 0.6
                      ? "text-warning"
                      : "text-destructive"
                }
              >
                {Math.round(g.accuracy.mean * 100)}%
              </span>
              {g.inventedPerRun ? (
                <div className="text-[11px] text-destructive">
                  {g.inventedPerRun.toFixed(1)} invented figures
                </div>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
      )}
      <TableCell>
        <Timeline
          first={g.firstContent?.median}
          total={g.complete?.median}
          scale={scale}
        />
      </TableCell>
    </TableRow>
  );
}

function Cell({ stat, highlight }: { stat: Stat | null; highlight?: boolean }) {
  return (
    <TableCell className={cn("font-mono", highlight && "text-primary")}>
      {formatMs(stat?.median)}
      {stat && range(stat) && (
        <div className="text-[11px] font-normal text-muted-foreground">{range(stat)}</div>
      )}
    </TableCell>
  );
}

function Timeline({
  first,
  total,
  scale,
}: {
  first?: number;
  total?: number;
  scale: number;
}) {
  const t = total ?? 0;
  const f = Math.min(first ?? t, t);
  const pct = (ms: number) => `${(ms / scale) * 100}%`;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
      <div className="bg-muted-foreground/40" style={{ width: pct(f) }} />
      <div className="bg-primary" style={{ width: pct(t - f) }} />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", color)} />
      {label}
    </span>
  );
}
