/**
 * Gold labels for the correctness checks. See docs/EVALUATION.md for the method and its limits.
 *
 * Everything here is a deterministic check on purpose. A check either passes or fails, the scorer is
 * unit tested, and nothing depends on another model's opinion.
 */

/**
 * A fact the output must contain. It matches when ANY alternative matches (case-insensitive).
 * An alternative is a keyword, or a group of keywords that must all appear in the SAME list item (or the
 * same text), e.g. `["priya", "legal"]` for "Priya follows up with legal".
 */
export interface Fact {
  /** Human-readable name, shown in the results. */
  label: string;
  anyOf: (string | string[])[];
}

export type FieldGold =
  /** One of a fixed set of values. `accept` has several entries only for ambiguous cases. */
  | { kind: "enum"; accept: string[] }
  /** A list of strings (tags, decisions, action items...). */
  | {
      kind: "list";
      /** Facts that must appear somewhere in the list: scored as recall. */
      facts?: Fact[];
      /** Upper bound on the number of items (0 = the list must be empty). Catches invented items. */
      maxItems?: number;
      /** Item count range, inclusive. */
      count?: [number, number];
      /** Keywords that must NOT appear anywhere in the list (e.g. a decision that was reversed). */
      forbidden?: string[];
      /** Every item must be lowercase. */
      lowercase?: boolean;
    }
  /** Free text. Only structural checks and required facts; tone and usefulness are not judged. */
  | {
      kind: "text";
      mentions?: Fact[];
      maxWords?: number;
      /** Sentence count range, inclusive. */
      sentences?: [number, number];
      language?: "en" | "de";
    };

export interface EvalCase {
  id: string;
  taskId: string;
  /** What the user pastes in. Becomes the `user` prompt. */
  input: string;
  /** Short description for people reading the label file. */
  note: string;
  /** Present when reasonable people could label this differently. Reported separately. */
  ambiguous?: string;
  /** Gold per output field. Fields without gold are not scored. */
  gold: Record<string, FieldGold>;
}

export type CheckKind = "enum" | "fact" | "format";

export interface Check {
  kind: CheckKind;
  field: string;
  label: string;
  passed: boolean;
  /** Why it failed (expected vs got). */
  detail?: string;
}

export interface CaseScore {
  caseId: string;
  ambiguous: boolean;
  checks: Check[];
  /** Share of enum fields that match the label. null when the case has no enum gold. */
  enumAccuracy: number | null;
  /** Share of required facts present. null when the case has no facts. */
  factRecall: number | null;
  /** Share of structural checks passed (length, language, counts, forbidden words). */
  formatPass: number | null;
  /** Numbers, dates and ids in the output that appear nowhere in the input. */
  hallucinations: string[];
  /** Mean of the three rates that exist for this case. null when none exist. */
  overall: number | null;
}
