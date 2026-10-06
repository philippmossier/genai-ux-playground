import type { FieldSpec } from "~/lib/tasks";
import { cn } from "~/lib/utils";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Skeleton as SkeletonBar } from "./ui/skeleton";

export type FieldState = "pending" | "running" | "done" | "error";

const TONES = {
  good: "default",
  warn: "secondary",
  bad: "destructive",
  neutral: "outline",
} as const;

export function FieldCard({
  spec,
  value,
  state,
  streaming,
  note,
}: {
  spec: FieldSpec;
  value: unknown;
  state: FieldState;
  /** The value may still grow: show a caret on text. */
  streaming?: boolean;
  note?: string;
}) {
  const empty = value === undefined || value === null || value === "";
  return (
    <Card size="sm" className={cn(state === "error" && "ring-destructive/40")}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-xs font-normal tracking-wide text-muted-foreground uppercase">
          <span>{spec.label}</span>
          <span className="tracking-normal normal-case">
            {state === "running" && <span className="text-primary">working...</span>}
            {state === "error" && <span className="text-destructive">failed</span>}
            {state === "done" && note}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <Skeleton kind={spec.kind} failed={state === "error"} />
        ) : (
          <Content spec={spec} value={value} streaming={streaming} />
        )}
      </CardContent>
    </Card>
  );
}

function Skeleton({ kind, failed }: { kind: FieldSpec["kind"]; failed: boolean }) {
  if (failed) return <p className="text-sm text-destructive">No result.</p>;
  if (kind === "badge") return <SkeletonBar className="h-6 w-24 rounded-full" />;
  if (kind === "list" || kind === "longtext")
    return (
      <div className="flex flex-col gap-2">
        <SkeletonBar className="h-3 w-full" />
        <SkeletonBar className="h-3 w-11/12" />
        <SkeletonBar className="h-3 w-2/3" />
      </div>
    );
  return <SkeletonBar className="h-3 w-3/4" />;
}

function Content({
  spec,
  value,
  streaming,
}: {
  spec: FieldSpec;
  value: unknown;
  streaming?: boolean;
}) {
  if (spec.kind === "badge") {
    const text = String(value);
    const tone = spec.tones?.[text] ?? "neutral";
    return (
      <Badge variant={TONES[tone]} className="h-auto px-3 py-1 text-sm">
        {text.replace(/_/g, " ")}
      </Badge>
    );
  }
  if (spec.kind === "list") {
    const items = Array.isArray(value) ? value : [value];
    return (
      <ul className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <li key={i} className="max-w-full">
            <Badge
              variant="secondary"
              className={cn(
                "h-auto rounded-md px-2 py-1 text-left text-sm whitespace-normal",
                streaming && i === items.length - 1 && "caret",
              )}
            >
              {String(item)}
            </Badge>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p
      className={cn("text-sm leading-relaxed whitespace-pre-wrap", streaming && "caret")}
    >
      {String(value)}
    </p>
  );
}
