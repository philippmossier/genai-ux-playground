import { describe, expect, it } from "vitest";
import { parsePartialJson } from "./partial-json";

describe("parsePartialJson", () => {
  it("returns undefined until something is parseable", () => {
    expect(parsePartialJson("")).toBeUndefined();
    expect(parsePartialJson("   ")).toBeUndefined();
    expect(parsePartialJson("tr")).toBeUndefined();
  });

  it("closes open containers", () => {
    expect(parsePartialJson("{")).toEqual({});
    expect(parsePartialJson('{"a": [1, 2')).toEqual({ a: [1] }); // 2 might still grow
    expect(parsePartialJson('{"a": [1, 2, ')).toEqual({ a: [1, 2] });
    expect(parsePartialJson('{"a": {"b": {')).toEqual({ a: { b: {} } });
  });

  it("returns a string value as the text so far", () => {
    expect(parsePartialJson('{"summary": "Custom')).toEqual({ summary: "Custom" });
    expect(parsePartialJson('{"summary": "line one\\nline')).toEqual({
      summary: "line one\nline",
    });
  });

  it("drops a key that has no value yet", () => {
    expect(parsePartialJson('{"a": 1, "b"')).toEqual({ a: 1 });
    expect(parsePartialJson('{"a": "x", "b"')).toEqual({ a: "x" });
    expect(parsePartialJson('{"a": "x", "b":')).toEqual({ a: "x" });
    expect(parsePartialJson('{"a": "x", "b": ')).toEqual({ a: "x" });
    expect(parsePartialJson('{"a": "x", "bb')).toEqual({ a: "x" });
  });

  it("does not return numbers or literals that may still change", () => {
    expect(parsePartialJson('{"n": 12')).toEqual({});
    expect(parsePartialJson('{"n": 12,')).toEqual({ n: 12 });
    expect(parsePartialJson('{"ok": tru')).toEqual({});
    expect(parsePartialJson('{"ok": true')).toEqual({ ok: true });
    expect(parsePartialJson('{"x": nul')).toEqual({});
    expect(parsePartialJson('{"x": -')).toEqual({});
  });

  it("drops dangling escapes and half-written unicode escapes", () => {
    expect(parsePartialJson('{"a": "ab\\')).toEqual({ a: "ab" });
    expect(parsePartialJson('{"a": "ab\\u00')).toEqual({ a: "ab" });
    expect(parsePartialJson('{"a": "\\u00e4')).toEqual({ a: "ä" });
  });

  it("tolerates a markdown fence some servers add", () => {
    expect(parsePartialJson('```json\n{"a": "x"')).toEqual({ a: "x" });
    expect(parsePartialJson("```json")).toBeUndefined();
  });

  it("matches JSON.parse for complete documents", () => {
    const doc = {
      summary: 'He said "hi"\nand left',
      tags: ["a", "b"],
      nested: { n: -1.5e2, ok: false, none: null, list: [{ x: 1 }, []] },
      umlaut: "grüßen ✓",
    };
    for (const text of [JSON.stringify(doc), JSON.stringify(doc, null, 2)]) {
      expect(parsePartialJson(text)).toEqual(doc);
    }
  });

  it("never throws on any prefix and only ever shows values that stay true", () => {
    const doc = {
      summary: "Customer cannot download the March invoice",
      urgency: "high",
      tags: ["billing", "invoice", "pdf"],
      count: 42,
      flags: { vip: true, escalated: false },
      reply: 'Hi Sam,\n"Sorry" for the trouble, fixed.',
    };
    const text = JSON.stringify(doc, null, 2);
    let previousSize = 0;
    for (let n = 0; n <= text.length; n++) {
      const partial = parsePartialJson(text.slice(0, n));
      if (partial === undefined) continue;
      expect(isPrefixCompatible(partial, doc)).toBe(true);
      const size = JSON.stringify(partial).length;
      // the visible result only ever grows
      expect(size).toBeGreaterThanOrEqual(previousSize);
      previousSize = size;
    }
    expect(parsePartialJson(text)).toEqual(doc);
  });
});

/** every key/element in `partial` exists in `full` with an equal value, or a string prefix of it */
function isPrefixCompatible(partial: unknown, full: unknown): boolean {
  if (typeof partial === "string")
    return typeof full === "string" && full.startsWith(partial);
  if (Array.isArray(partial)) {
    return (
      Array.isArray(full) &&
      partial.length <= full.length &&
      partial.every((v, i) => isPrefixCompatible(v, full[i]))
    );
  }
  if (partial && typeof partial === "object") {
    if (!full || typeof full !== "object" || Array.isArray(full)) return false;
    return Object.entries(partial).every(([k, v]) =>
      isPrefixCompatible(v, (full as Record<string, unknown>)[k]),
    );
  }
  return partial === full;
}
