import type { z } from "zod";

export type FieldKind = "text" | "longtext" | "badge" | "list";

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  /** badge value -> tone, anything else renders neutral */
  tones?: Record<string, "good" | "warn" | "bad">;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  system: string;
  defaultInput: string;
  schema: z.ZodObject<z.ZodRawShape>;
  fields: FieldSpec[];
  /** Canned output for the mock provider: prose for text mode, data for JSON modes. */
  mock: { prose: string; data: Record<string, unknown> };
}
