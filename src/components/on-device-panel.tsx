import { useSyncExternalStore } from "react";
import { onDeviceEngine, type EngineStatus } from "~/lib/on-device/engine";
import { getOnDeviceModel } from "~/lib/on-device/models";
import { Button } from "./ui/button";
import { FieldDescription, FieldLegend, FieldSet } from "./ui/field";
import { Progress } from "./ui/progress";

const IDLE: EngineStatus = { state: "idle" };

export function useOnDeviceStatus(): EngineStatus {
  return useSyncExternalStore(
    onDeviceEngine.subscribe,
    onDeviceEngine.getStatus,
    () => IDLE,
  );
}

export function isOnDeviceReady(status: EngineStatus, modelId: string) {
  return status.state === "ready" && status.modelId === modelId;
}

export function OnDevicePanel({ modelId }: { modelId: string }) {
  const status = useOnDeviceStatus();
  const model = getOnDeviceModel(modelId);
  if (!model) return null;
  const ready = isOnDeviceReady(status, modelId);
  const loading = status.state === "loading";
  const pct =
    status.state === "loading"
      ? status.phase === "warming"
        ? 100
        : Math.min(
            99,
            Math.round((status.loaded / (model.downloadMB * 1024 * 1024)) * 100),
          )
      : 0;

  return (
    <FieldSet className="rounded-lg border p-3">
      <FieldLegend variant="label">On-device model</FieldLegend>
      {ready ? (
        <p className="text-sm text-primary">
          Ready. Runs in this browser, nothing is sent anywhere.
        </p>
      ) : loading ? (
        <>
          <Progress value={pct} />
          <FieldDescription>
            {status.phase === "warming" ? "Preparing the GPU..." : `Downloading ${pct}%`}
          </FieldDescription>
        </>
      ) : (
        <Button
          className="h-auto whitespace-normal"
          onClick={() => onDeviceEngine.load(model).catch(() => undefined)}
        >
          Load model ({(model.downloadMB / 1000).toFixed(1)} GB, cached after the first
          time)
        </Button>
      )}
      {status.state === "error" && (
        <p className="text-xs text-destructive">{status.message}</p>
      )}
      <FieldDescription>
        No server call, no constrained decoding (the schema goes into the prompt), one
        GPU: fan-out requests run one after another.
      </FieldDescription>
    </FieldSet>
  );
}
