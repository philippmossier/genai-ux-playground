import type { RunSnapshot } from "~/lib/client/types";
import { cn } from "~/lib/utils";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const pct = (r: number | null) => (r === null ? "n/a" : `${Math.round(r * 100)}%`);

/** Shows how the output compares with the labelled answer, or says why there is nothing to compare. */
export function Correctness({ run }: { run: RunSnapshot }) {
  const { mode } = run.config;
  if (run.status === "running") return null;

  if (mode === "blocking" || mode === "text-stream") {
    return (
      <Note>
        Free text is not scored: there is no field to compare. Use a structured mode for
        correctness.
      </Note>
    );
  }
  if (!run.score) {
    return run.valid === null ? null : (
      <Note>
        No correctness score: this input is edited, so there is no labelled answer for it.
        Pick a labelled case under Prompts to get one.
      </Note>
    );
  }

  const { score } = run;
  const failed = score.checks.filter((c) => !c.passed);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span>
            Correct:{" "}
            <span className={cn(score.overall === 1 ? "text-primary" : "text-warning")}>
              {pct(score.overall)}
            </span>
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            labels {pct(score.enumAccuracy)} · required facts {pct(score.factRecall)} ·
            format {pct(score.formatPass)}
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            case {score.caseId}
          </span>
          {score.ambiguous && <Badge variant="secondary">ambiguous case</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-xs">
        {run.config.provider === "mock" && (
          <p className="text-warning">
            The mock returns the same canned answer whatever the input, so this score only
            exercises the scorer.
          </p>
        )}
        {failed.length === 0 ? (
          <p className="text-primary">All {score.checks.length} checks passed.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {failed.map((c) => (
              <li key={c.label} className="text-destructive">
                ✗ {c.label}
                {c.detail && <span className="text-muted-foreground"> ({c.detail})</span>}
              </li>
            ))}
          </ul>
        )}
        {score.hallucinations.length > 0 && (
          <p className="text-destructive">
            Figures that are not in the input: {score.hallucinations.join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-muted-foreground">{children}</p>
);
