import { ChevronRightIcon } from "lucide-react";
import { casesForTask, findCase } from "~/lib/eval";
import type { ProviderInfo } from "~/lib/protocol";
import { TASKS } from "~/lib/tasks";
import { OnDevicePanel } from "./on-device-panel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "./ui/field";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Slider } from "./ui/slider";
import { Textarea } from "./ui/textarea";

export interface Settings {
  maxTokens: number;
  effort: "low" | "medium" | "high";
  ttfbMs: number;
  tokensPerSecond: number;
  concurrency: number;
  /** How many times each mode runs per click. More runs give a median and a range instead of one lucky number. */
  repeat: number;
  token: string;
}

interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

/** One labelled Select. `items` lets Base UI render the label (not the raw value) in the trigger. */
function Pick(p: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  hint?: string;
  id: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={p.id}>{p.label}</FieldLabel>
      <Select
        items={p.options}
        value={p.value}
        onValueChange={(v) => v !== null && p.onChange(v)}
      >
        <SelectTrigger id={p.id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {p.options.map((o) => (
              <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {p.hint && <FieldDescription>{p.hint}</FieldDescription>}
    </Field>
  );
}

export function SettingsPanel(props: {
  providers: ProviderInfo[];
  providerId: string;
  model: string;
  taskId: string;
  system: string;
  user: string;
  settings: Settings;
  onProvider: (id: string) => void;
  onModel: (id: string) => void;
  onTask: (id: string) => void;
  onSystem: (text: string) => void;
  onUser: (text: string) => void;
  onSettings: (patch: Partial<Settings>) => void;
}) {
  const provider = props.providers.find((p) => p.id === props.providerId);
  const model = provider?.models.find((m) => m.id === props.model);
  const isMock = props.providerId === "mock";
  const cases = casesForTask(props.taskId);
  const currentCase = findCase(props.taskId, props.user)?.id ?? "custom";

  return (
    <aside>
      <FieldGroup>
        <Pick
          id="task"
          label="Task"
          value={props.taskId}
          options={TASKS.map((t) => ({ value: t.id, label: t.title }))}
          onChange={props.onTask}
          hint={TASKS.find((t) => t.id === props.taskId)?.description}
        />

        <Pick
          id="provider"
          label="Provider"
          value={props.providerId}
          options={props.providers.map((p) => ({
            value: p.id,
            label: p.configured ? p.label : `${p.label} (not configured on this server)`,
            disabled: !p.configured,
          }))}
          onChange={props.onProvider}
        />

        <Pick
          id="model"
          label="Model"
          value={props.model}
          options={(provider?.models ?? []).map((m) => ({ value: m.id, label: m.label }))}
          onChange={props.onModel}
          hint={model?.note}
        />

        {provider?.supportsEffort && (
          <Pick
            id="effort"
            label="Reasoning effort"
            value={props.settings.effort}
            options={[
              { value: "low", label: "low (fastest)" },
              { value: "medium", label: "medium" },
              { value: "high", label: "high" },
            ]}
            onChange={(v) => props.onSettings({ effort: v as Settings["effort"] })}
            hint="Ignored by models without the setting."
          />
        )}

        {props.providerId === "on-device" && <OnDevicePanel modelId={props.model} />}

        {isMock && (
          <FieldSet className="rounded-lg border p-3">
            <FieldLegend variant="label">Simulated latency</FieldLegend>
            <SliderField
              label="Time to first token"
              unit="ms"
              min={0}
              max={8000}
              step={100}
              value={props.settings.ttfbMs}
              onChange={(v) => props.onSettings({ ttfbMs: v })}
            />
            <SliderField
              label="Speed"
              unit="tok/s"
              min={5}
              max={300}
              step={5}
              value={props.settings.tokensPerSecond}
              onChange={(v) => props.onSettings({ tokensPerSecond: v })}
            />
            <FieldDescription>
              Try 3000 ms and 15 tok/s: that is a reasoning model on a bad day.
            </FieldDescription>
          </FieldSet>
        )}

        <SliderField
          label="Parallel requests (fan-out)"
          min={1}
          max={6}
          step={1}
          value={props.settings.concurrency}
          onChange={(v) => props.onSettings({ concurrency: v })}
        />

        <SliderField
          label="Runs per mode"
          min={1}
          max={10}
          step={1}
          value={props.settings.repeat}
          onChange={(v) => props.onSettings({ repeat: v })}
        />

        {provider?.requiresToken && (
          <Field>
            <FieldLabel htmlFor="token">Access token</FieldLabel>
            <Input
              id="token"
              type="password"
              value={props.settings.token}
              onChange={(e) => props.onSettings({ token: e.target.value })}
              placeholder="required by this server"
            />
          </Field>
        )}

        <Collapsible className="group/prompts">
          <CollapsibleTrigger className="flex w-full items-center gap-1 text-sm font-medium">
            <ChevronRightIcon className="size-4 transition-transform group-data-[open]/prompts:rotate-90" />
            Prompts
          </CollapsibleTrigger>
          <CollapsibleContent>
            <FieldGroup className="pt-3">
              <Field>
                <FieldLabel htmlFor="system">System</FieldLabel>
                <Textarea
                  id="system"
                  className="h-28 font-mono text-xs"
                  value={props.system}
                  onChange={(e) => props.onSystem(e.target.value)}
                />
                <FieldDescription>
                  The output format instruction is added automatically per mode.
                </FieldDescription>
              </Field>
              <Pick
                id="case"
                label="Labelled case"
                value={currentCase}
                options={[
                  { value: "custom", label: "Custom input (not scored)", disabled: true },
                  ...cases.map((c) => ({
                    value: c.id,
                    label: `${c.id}: ${c.note.slice(0, 48)}${c.ambiguous ? " (ambiguous)" : ""}`,
                  })),
                ]}
                onChange={(id) => {
                  const picked = cases.find((c) => c.id === id);
                  if (picked) props.onUser(picked.input);
                }}
                hint="Labelled cases have a known right answer, so structured runs get a correctness score."
              />
              <Field>
                <FieldLabel htmlFor="input">Input</FieldLabel>
                <Textarea
                  id="input"
                  className="h-48 font-mono text-xs"
                  value={props.user}
                  onChange={(e) => props.onUser(e.target.value)}
                />
              </Field>
            </FieldGroup>
          </CollapsibleContent>
        </Collapsible>
      </FieldGroup>
    </aside>
  );
}

function SliderField(p: {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field>
      <div className="flex justify-between text-sm">
        <FieldLabel>{p.label}</FieldLabel>
        <span className="font-mono">
          {p.value} {p.unit}
        </span>
      </div>
      <Slider
        aria-label={p.label}
        min={p.min}
        max={p.max}
        step={p.step}
        value={[p.value]}
        onValueChange={(v) => p.onChange(Array.isArray(v) ? (v[0] ?? p.min) : v)}
      />
    </Field>
  );
}
