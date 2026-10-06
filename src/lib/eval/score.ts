import type { CaseScore, Check, EvalCase, Fact, FieldGold } from "./types";

/**
 * Scores one model output against one labelled case.
 *
 * `output` is whatever the model produced after JSON parsing (possibly wrong or incomplete). A field
 * that is missing or has the wrong type fails every check that belongs to it.
 */
export function scoreCase(evalCase: EvalCase, output: unknown): CaseScore {
  const obj =
    output && typeof output === "object" ? (output as Record<string, unknown>) : {};
  const checks: Check[] = [];

  for (const [field, gold] of Object.entries(evalCase.gold)) {
    checks.push(...checkField(field, gold, obj[field]));
  }

  const rate = (kind: Check["kind"]) => {
    const subset = checks.filter((c) => c.kind === kind);
    return subset.length === 0
      ? null
      : subset.filter((c) => c.passed).length / subset.length;
  };
  const enumAccuracy = rate("enum");
  const factRecall = rate("fact");
  const formatPass = rate("format");
  const present = [enumAccuracy, factRecall, formatPass].filter(
    (r): r is number => r !== null,
  );

  return {
    caseId: evalCase.id,
    ambiguous: Boolean(evalCase.ambiguous),
    checks,
    enumAccuracy,
    factRecall,
    formatPass,
    hallucinations: findInventedNumbers(evalCase.input, obj),
    overall:
      present.length === 0 ? null : present.reduce((a, b) => a + b, 0) / present.length,
  };
}

function checkField(field: string, gold: FieldGold, value: unknown): Check[] {
  switch (gold.kind) {
    case "enum": {
      const got = typeof value === "string" ? value.trim().toLowerCase() : undefined;
      const accepted = gold.accept.map((a) => a.toLowerCase());
      const passed = got !== undefined && accepted.includes(got);
      return [
        {
          kind: "enum",
          field,
          label: `${field} is ${gold.accept.join(" or ")}`,
          passed,
          detail: passed
            ? undefined
            : `expected ${gold.accept.join(" or ")}, got ${got ?? "nothing"}`,
        },
      ];
    }
    case "list":
      return checkList(field, gold, value);
    case "text":
      return checkText(field, gold, value);
  }
}

function checkList(
  field: string,
  gold: Extract<FieldGold, { kind: "list" }>,
  value: unknown,
): Check[] {
  const items =
    Array.isArray(value) && value.every((v) => typeof v === "string")
      ? (value as string[])
      : null;
  const joined = (items ?? []).join("\n").toLowerCase();
  const checks: Check[] = [];

  for (const fact of gold.facts ?? []) {
    checks.push(factCheck(field, fact, items !== null && matchesAny(items, fact)));
  }
  const format = (label: string, passed: boolean, detail?: string): Check => ({
    kind: "format",
    field,
    label: `${field}: ${label}`,
    passed: items !== null && passed,
    detail: items === null ? "not a list of strings" : passed ? undefined : detail,
  });
  if (gold.maxItems !== undefined) {
    checks.push(
      format(
        `at most ${gold.maxItems} items`,
        (items?.length ?? 0) <= gold.maxItems,
        `got ${items?.length ?? 0} items`,
      ),
    );
  }
  if (gold.count) {
    const [min, max] = gold.count;
    const n = items?.length ?? 0;
    checks.push(format(`${min} to ${max} items`, n >= min && n <= max, `got ${n}`));
  }
  if (gold.forbidden && gold.forbidden.length > 0) {
    const hit = gold.forbidden.filter((k) => keywordMatches(joined, k));
    checks.push(
      format(
        `does not mention ${gold.forbidden.join(", ")}`,
        hit.length === 0,
        `mentions ${hit.join(", ")}`,
      ),
    );
  }
  if (gold.lowercase) {
    const bad = (items ?? []).filter((i) => i !== i.toLowerCase());
    checks.push(
      format("all lowercase", bad.length === 0, `not lowercase: ${bad.join(", ")}`),
    );
  }
  return checks;
}

function checkText(
  field: string,
  gold: Extract<FieldGold, { kind: "text" }>,
  value: unknown,
): Check[] {
  const text = typeof value === "string" ? value : null;
  const lower = (text ?? "").toLowerCase();
  const checks: Check[] = [];

  for (const fact of gold.mentions ?? [])
    checks.push(factCheck(field, fact, text !== null && matchesAny([lower], fact)));

  const format = (label: string, passed: boolean, detail?: string): Check => ({
    kind: "format",
    field,
    label: `${field}: ${label}`,
    passed: text !== null && passed,
    detail: text === null ? "not a string" : passed ? undefined : detail,
  });
  if (gold.maxWords !== undefined) {
    const words = countWords(text ?? "");
    checks.push(
      format(
        `at most ${gold.maxWords} words`,
        words <= gold.maxWords,
        `got ${words} words`,
      ),
    );
  }
  if (gold.sentences) {
    const [min, max] = gold.sentences;
    const n = countSentences(text ?? "");
    checks.push(format(`${min} to ${max} sentences`, n >= min && n <= max, `got ${n}`));
  }
  if (gold.language) {
    const detected = detectLanguage(text ?? "");
    checks.push(
      format(
        `written in ${gold.language}`,
        detected === gold.language,
        `looks like ${detected ?? "neither"}`,
      ),
    );
  }
  return checks;
}

const factCheck = (field: string, fact: Fact, passed: boolean): Check => ({
  kind: "fact",
  field,
  label: `${field} mentions ${fact.label}`,
  passed,
  detail: passed ? undefined : `none of: ${describeAlternatives(fact)}`,
});

/**
 * Does the keyword occur in the text (already lower-cased)?
 * Plain keywords match as substrings, so "leak" also finds "leaked" and "hik" finds "hiking".
 * A keyword that starts with "=" must match a whole word: "=li" does not match "will", "=2" does not
 * match "12". Use it for names, numbers and any short word that appears inside other words.
 */
export function keywordMatches(lower: string, keyword: string): boolean {
  const k = keyword.toLowerCase();
  if (!k.startsWith("=")) return lower.includes(k);
  const word = k.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`, "u").test(lower);
}

/** True when any alternative of the fact is found in one of the items. */
const matchesAny = (items: string[], fact: Fact) =>
  fact.anyOf.some((alt) => {
    const keywords = Array.isArray(alt) ? alt : [alt];
    return items.some((item) => {
      const lower = item.toLowerCase();
      return keywords.every((k) => keywordMatches(lower, k));
    });
  });

const describeAlternatives = (fact: Fact) =>
  fact.anyOf.map((a) => (Array.isArray(a) ? a.join(" + ") : a)).join(" | ");

export const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Sentence terminators followed by space or end. Good enough for 3 to 5 sentence replies, not for prose in general. */
export const countSentences = (s: string) =>
  (s.trim().match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? []).length;

const STOPWORDS = {
  en: [
    "the",
    "and",
    "is",
    "to",
    "of",
    "that",
    "for",
    "with",
    "you",
    "we",
    "your",
    "this",
    "have",
    "are",
  ],
  de: [
    "der",
    "die",
    "und",
    "das",
    "ist",
    "nicht",
    "mit",
    "ein",
    "eine",
    "für",
    "wir",
    "sie",
    "ihr",
    "den",
  ],
} as const;

/** Counts common function words. Returns null when neither language clearly wins. */
export function detectLanguage(text: string): "en" | "de" | null {
  const words = text.toLowerCase().match(/[a-zäöüß]+/g) ?? [];
  const score = (list: readonly string[]) => words.filter((w) => list.includes(w)).length;
  const en = score(STOPWORDS.en);
  const de = score(STOPWORDS.de);
  if (en === de) return null;
  return en > de ? "en" : "de";
}

/**
 * Digit sequences (numbers, dates, ids, versions) in the output that do not occur in the input.
 * Small numbers (1 to 5) are ignored, because "three bullet points" is not an invented fact.
 * Names and other words are NOT checked: this catches invented figures, not invented claims.
 */
export function findInventedNumbers(
  input: string,
  output: Record<string, unknown>,
): string[] {
  const digits = (s: string) => s.match(/\d+/g) ?? [];
  const known = new Set(digits(input));
  const invented = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      for (const d of digits(v)) {
        if (!known.has(d) && !(d.length === 1 && Number(d) <= 5)) invented.add(d);
      }
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(output);
  return [...invented];
}
