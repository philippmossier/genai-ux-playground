import type { RunMode } from "./protocol";

export interface ModeInfo {
  id: RunMode;
  label: string;
  /** One line: what the user waits for. */
  summary: string;
  /** What it costs you. */
  tradeoff: string;
  /** How the request is made: the part that lives in the backend / API call. */
  request: string;
  /** What the browser does with the answer. */
  render: string;
}

export const MODES: ModeInfo[] = [
  {
    id: "blocking",
    label: "Blocking text",
    summary:
      "One request, one response. The screen stays empty until the model is completely done.",
    tradeoff: "Simplest code. Worst perceived latency.",
    request: "1 call, not streamed, free text",
    render: "Show everything when the response arrives",
  },
  {
    id: "text-stream",
    label: "Streamed text",
    summary: "Tokens appear as they are generated.",
    tradeoff: "Fast first content, but you get prose, not UI you can bind to.",
    request: "1 call, streamed, free text",
    render: "Append tokens as they arrive",
  },
  {
    id: "structured",
    label: "Structured",
    summary:
      "The model returns JSON that is validated against a schema, then rendered as widgets.",
    tradeoff: "Typed, reliable data. Nothing is visible until the whole object is done.",
    request: "1 call, not streamed, output constrained to a JSON schema",
    render: "Validate, then render widgets at the end",
  },
  {
    id: "structured-stream",
    label: "Structured stream",
    summary:
      "Structured output, but the partial JSON is parsed on every chunk so widgets fill in field by field.",
    tradeoff:
      "Typed and fast to first content. Needs a partial-JSON parser and skeleton states.",
    request: "1 call, streamed, output constrained to a JSON schema",
    render: "Parse the partial JSON on every chunk, fill widgets and skeletons",
  },
  {
    id: "fan-out",
    label: "Parallel fan-out",
    summary:
      "One narrow prompt per field, run in parallel. Each widget appears when its own prompt returns.",
    tradeoff:
      "Short, independent calls and partial failure for free. More requests, more input tokens.",
    request: "One call per field, each not streamed, several in flight",
    render: "Render each widget when its own call returns",
  },
];

export const modeInfo = (id: RunMode) => MODES.find((m) => m.id === id)!;
