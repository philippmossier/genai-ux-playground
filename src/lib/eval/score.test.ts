import { describe, expect, it } from "vitest";
import { casesForTask, EVAL_CASES, findCase, scoreCase, type EvalCase } from ".";
import { getTask, TASKS } from "../tasks";
import {
  countSentences,
  countWords,
  detectLanguage,
  findInventedNumbers,
  keywordMatches,
} from "./score";

const byId = (id: string) => EVAL_CASES.find((c) => c.id === id)!;

describe("scoreCase: enums", () => {
  const c = byId("st-03"); // billing / medium / negative

  it("passes on exact matches, ignoring case and spaces", () => {
    const s = scoreCase(c, {
      category: " Billing ",
      urgency: "MEDIUM",
      sentiment: "negative",
    });
    expect(s.enumAccuracy).toBe(1);
  });

  it("fails on a wrong or missing value and says what was expected", () => {
    const s = scoreCase(c, { category: "bug", urgency: "medium" });
    expect(s.enumAccuracy).toBeCloseTo(1 / 3);
    const failed = s.checks.filter((k) => k.kind === "enum" && !k.passed);
    expect(failed.map((k) => k.field).sort()).toEqual(["category", "sentiment"]);
    expect(failed.find((k) => k.field === "category")?.detail).toBe(
      "expected billing, got bug",
    );
    expect(failed.find((k) => k.field === "sentiment")?.detail).toBe(
      "expected negative, got nothing",
    );
  });

  it("accepts every label of an ambiguous case", () => {
    const amb = byId("st-01");
    for (const category of ["bug", "billing"]) {
      expect(
        scoreCase(amb, { category, urgency: "high", sentiment: "negative" }).enumAccuracy,
      ).toBe(1);
    }
    expect(
      scoreCase(amb, { category: "account", urgency: "high", sentiment: "negative" })
        .enumAccuracy,
    ).toBeCloseTo(2 / 3);
    expect(scoreCase(amb, {}).ambiguous).toBe(true);
  });
});

describe("scoreCase: facts and lists", () => {
  const c = byId("mn-01");
  const good = {
    summary: "One. Two.",
    decisions: [
      "Keep the free tier at 3 projects",
      "Launch on the 14th if legal signs off",
    ],
    action_items: [
      "Priya: chase legal today",
      "Jonas: pull conversion numbers by end of month",
    ],
    open_questions: ["Who drafts the migration email?"],
    next_meeting: "Thursday the 9th",
  };

  it("scores a complete answer as fully correct", () => {
    const s = scoreCase(c, good);
    expect(s.factRecall).toBe(1);
    expect(s.formatPass).toBe(1);
    expect(s.overall).toBe(1);
    expect(s.hallucinations).toEqual([]);
  });

  it("requires keywords of a grouped fact to appear in the SAME item", () => {
    const split = {
      ...good,
      action_items: [
        "Priya: send the invoice",
        "Jonas: ask legal about conversion numbers",
      ],
    };
    const s = scoreCase(c, split);
    const failed = s.checks.filter((k) => !k.passed).map((k) => k.label);
    expect(failed).toContain("action_items mentions Priya follows up with legal");
    // "jonas" + "conversion" do co-occur in the second item
    expect(failed).not.toContain(
      "action_items mentions Jonas pulls the conversion numbers",
    );
  });

  it("measures recall over the required facts", () => {
    const s = scoreCase(c, {
      ...good,
      decisions: ["Launch on the 14th"],
      open_questions: [],
    });
    // facts: 2 decisions + 2 actions + 1 open question + 1 next meeting = 6; missing: free tier, migration
    expect(s.factRecall).toBeCloseTo(4 / 6);
  });

  it("flags invented items in a list that must stay empty", () => {
    const quiet = byId("mn-03");
    const s = scoreCase(quiet, {
      summary: "A. B.",
      decisions: ["Ship it"],
      action_items: [],
      open_questions: [],
      next_meeting: "same time next week",
    });
    expect(s.checks.find((k) => k.label === "decisions: at most 0 items")?.passed).toBe(
      false,
    );
    expect(
      s.checks.find((k) => k.label === "action_items: at most 0 items")?.passed,
    ).toBe(true);
  });

  it("catches an owner nobody agreed on", () => {
    const c5 = byId("mn-05");
    const bad = scoreCase(c5, {
      summary: "A. B.",
      action_items: ["Ben: email the vendor"],
      open_questions: ["Contract?"],
      next_meeting: "2 Nov",
    });
    const ok = scoreCase(c5, {
      summary: "A. B.",
      action_items: ["Email the vendor (no owner)"],
      open_questions: ["Contract?"],
      next_meeting: "2 Nov",
    });
    expect(bad.checks.find((k) => k.label.includes("does not mention"))?.passed).toBe(
      false,
    );
    expect(ok.checks.find((k) => k.label.includes("does not mention"))?.passed).toBe(
      true,
    );
  });

  it("checks list size and casing for tags", () => {
    const c1 = byId("st-03");
    const tags = (t: unknown) =>
      scoreCase(c1, { tags: t }).checks.filter((k) => k.field === "tags");
    expect(tags(["billing", "refund"]).every((k) => k.passed)).toBe(true);
    expect(tags(["billing"]).find((k) => k.label.includes("items"))?.passed).toBe(false);
    expect(
      tags(["Billing", "refund"]).find((k) => k.label.includes("lowercase"))?.passed,
    ).toBe(false);
    expect(tags("billing, refund").every((k) => !k.passed)).toBe(true); // wrong type
  });
});

describe("scoreCase: text", () => {
  const c = byId("st-06"); // German bug report

  it("checks language, sentence count and word limit", () => {
    const de =
      "Vielen Dank für Ihre Nachricht. Wir prüfen den Absturz nach dem Update. Wir melden uns mit einer Lösung.";
    const ok = scoreCase(c, {
      summary: "Die App stürzt nach dem Update ab.",
      suggested_reply: de,
    });
    expect(
      ok.checks
        .filter(
          (k) =>
            k.kind === "format" &&
            (k.field === "summary" || k.field === "suggested_reply"),
        )
        .every((k) => k.passed),
    ).toBe(true);

    const en = scoreCase(c, {
      suggested_reply:
        "Thank you for your message. We are looking into the crash. We will get back to you.",
    });
    expect(en.checks.find((k) => k.label.includes("written in de"))?.passed).toBe(false);

    const long = scoreCase(c, { summary: Array(30).fill("word").join(" ") });
    expect(long.checks.find((k) => k.label.includes("at most 25 words"))?.passed).toBe(
      false,
    );
  });

  it("fails every check of a field that is missing or the wrong type", () => {
    const s = scoreCase(c, { summary: 42, suggested_reply: null });
    expect(
      s.checks
        .filter((k) => k.field === "summary" || k.field === "suggested_reply")
        .every((k) => !k.passed),
    ).toBe(true);
  });
});

describe("invented numbers", () => {
  it("flags figures that are not in the input", () => {
    expect(
      findInventedNumbers("Invoice 2291 is due 3 October", {
        a: "Invoice 2291 due 3 October",
      }),
    ).toEqual([]);
    expect(
      findInventedNumbers("Invoice 2291", {
        a: "Invoice 2292 is overdue by 14 days",
      }).sort(),
    ).toEqual(["14", "2292"]);
  });
  it("ignores small counts and walks nested values", () => {
    expect(
      findInventedNumbers("nothing", { a: ["three tips", "3 tips", "5 steps"] }),
    ).toEqual([]);
    expect(
      findInventedNumbers("nothing", { a: { b: ["call 0151 now"] } }).sort(),
    ).toEqual(["0151"]);
  });
  it("is reported by scoreCase", () => {
    const s = scoreCase(byId("st-03"), { suggested_reply: "We refunded 59 EUR." });
    expect(s.hallucinations).toEqual(["59"]);
  });
});

describe("helpers", () => {
  it("counts words and sentences", () => {
    expect(countWords("  one  two\nthree ")).toBe(3);
    expect(countSentences("One. Two! Three? Four")).toBe(3);
    expect(countSentences("Version 4.2.1 is out. Done.")).toBe(2);
  });
  it("detects English and German, and gives up when unsure", () => {
    expect(detectLanguage("We have your invoice and the file is ready for you")).toBe(
      "en",
    );
    expect(
      detectLanguage("Wir haben Ihre Rechnung und die Datei ist für Sie bereit"),
    ).toBe("de");
    expect(detectLanguage("12345")).toBeNull();
  });
});

describe("the scorer discriminates", () => {
  it("scores an empty answer 0 on every case", () => {
    for (const c of EVAL_CASES) expect(scoreCase(c, {}).overall, c.id).toBe(0);
    for (const c of EVAL_CASES) expect(scoreCase(c, null).overall, c.id).toBe(0);
  });

  it("does not reward a constant answer", () => {
    const cases = casesForTask("support-triage");
    const constant = { category: "bug", urgency: "high", sentiment: "negative" };
    const mean =
      cases.reduce((a, c) => a + (scoreCase(c, constant).enumAccuracy ?? 0), 0) /
      cases.length;
    expect(mean).toBeLessThan(0.6);
  });

  it("has no case where a lazy 'verdict: mixed' is perfect on all review cases", () => {
    const cases = casesForTask("review-analysis");
    const hits = cases.filter(
      (c) => scoreCase(c, { verdict: "mixed" }).enumAccuracy === 1,
    ).length;
    expect(hits).toBeLessThan(cases.length);
  });
});

describe("the labels themselves", () => {
  it("has 8 cases per task and unique ids", () => {
    for (const t of TASKS) expect(casesForTask(t.id), t.id).toHaveLength(8);
    expect(new Set(EVAL_CASES.map((c) => c.id)).size).toBe(EVAL_CASES.length);
  });

  it("uses the task's default input as its first case, so the UI can score the default run", () => {
    for (const t of TASKS) expect(casesForTask(t.id)[0]!.input).toBe(t.defaultInput);
    expect(findCase("support-triage", TASKS[0]!.defaultInput)?.id).toBe("st-01");
    expect(findCase("support-triage", "edited input")).toBeUndefined();
  });

  it.each(EVAL_CASES.map((c) => [c.id, c] as const))(
    "%s is consistent with its task schema",
    (_id, c: EvalCase) => {
      const task = getTask(c.taskId)!;
      const shape = task.schema.shape as unknown as Record<
        string,
        { def: { type: string; entries?: Record<string, string> } }
      >;
      for (const [field, gold] of Object.entries(c.gold)) {
        const def = shape[field]?.def;
        expect(def, `${field} exists in the schema`).toBeDefined();
        if (gold.kind === "enum") {
          expect(def!.type).toBe("enum");
          const options = Object.values(def!.entries ?? {});
          for (const a of gold.accept) expect(options, `${field}=${a}`).toContain(a);
        } else if (gold.kind === "list") {
          expect(def!.type).toBe("array");
          const checks =
            (gold.facts?.length ?? 0) +
            Number(gold.maxItems !== undefined) +
            Number(!!gold.count) +
            Number(!!gold.forbidden?.length) +
            Number(!!gold.lowercase);
          expect(checks, `${field} has at least one check`).toBeGreaterThan(0);
        } else {
          expect(def!.type).toBe("string");
        }
        const facts =
          gold.kind === "list"
            ? gold.facts
            : gold.kind === "text"
              ? gold.mentions
              : undefined;
        for (const f of facts ?? []) expect(f.anyOf.length, f.label).toBeGreaterThan(0);
      }
      expect(c.note.length).toBeGreaterThan(10);
      if (c.ambiguous) expect(c.ambiguous.length).toBeGreaterThan(10);
    },
  );

  it("marks a case ambiguous whenever an enum accepts more than one label", () => {
    for (const c of EVAL_CASES) {
      const multi = Object.values(c.gold).some(
        (g) => g.kind === "enum" && g.accept.length > 1,
      );
      if (multi) expect(c.ambiguous, c.id).toBeTruthy();
    }
  });
});

describe("keyword matching", () => {
  it("matches plain keywords as substrings, so stems work", () => {
    expect(keywordMatches("the jar leaked on first use", "leak")).toBe(true);
    expect(keywordMatches("ideal for hiking", "hik")).toBe(true);
    expect(keywordMatches("nothing here", "leak")).toBe(false);
  });

  it("matches '=' keywords as whole words only", () => {
    expect(keywordMatches("li updates the docs", "=li")).toBe(true);
    expect(keywordMatches("will update the docs", "=li")).toBe(false);
    expect(keywordMatches("release on 12 november", "=2")).toBe(false);
    expect(keywordMatches("release on 2 november", "=2")).toBe(true);
    expect(keywordMatches("li: docs.", "=li")).toBe(true); // punctuation counts as a boundary
    expect(keywordMatches("the 14th", "=14th")).toBe(true);
    expect(keywordMatches("tim kündigt", "=tim")).toBe(true);
    expect(keywordMatches("zeitpunkt, estimate", "=tim")).toBe(false);
  });

  it("treats regex characters in a keyword literally", () => {
    expect(keywordMatches("version 1.1 is out", "=1.1")).toBe(true);
    expect(keywordMatches("version 1x1 is out", "=1.1")).toBe(false);
  });

  it("stops a wrong answer from passing on a short name or number", () => {
    const owner = scoreCase(byId("mn-02"), {
      summary: "A. B.",
      action_items: ["Will update docs before launch", "Ana: write the migration script"],
    });
    const failed = owner.checks.filter((k) => !k.passed).map((k) => k.label);
    expect(failed).toContain("action_items mentions Li updates the docs");

    const date = scoreCase(byId("mn-05"), {
      summary: "A. B.",
      action_items: [],
      open_questions: ["Contract?"],
      next_meeting: "12 Nov",
    });
    expect(
      date.checks.find((k) => k.label === "next_meeting mentions 2 November")?.passed,
    ).toBe(false);
  });

  it("does not flag 'benefits' as the forbidden owner Ben", () => {
    const s = scoreCase(byId("mn-05"), {
      summary: "A. B.",
      action_items: ["Check the contract benefits with the vendor"],
      open_questions: ["Contract?"],
      next_meeting: "2 Nov",
    });
    expect(s.checks.find((k) => k.label.includes("does not mention"))?.passed).toBe(true);
  });
});
