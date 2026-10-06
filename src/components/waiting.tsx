import { useEffect, useState } from "react";
import { formatMs } from "~/lib/utils";
import { Spinner } from "./ui/spinner";

/** The thing a user actually experiences in the blocking modes: an empty screen and a clock. */
export function Waiting({ label }: { label: string }) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setMs(performance.now() - start), 100);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
      <Spinner />
      {label} <span className="font-mono text-foreground">{formatMs(ms)}</span>
    </div>
  );
}
