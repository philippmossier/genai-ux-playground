import { describe, expect, it } from "vitest";
import { buildSystemPrompt, fanOutOrder, schemaFor, TASKS } from ".";

describe("tasks", () => {
  it.each(TASKS.map((t) => [t.id, t] as const))(
    "%s mock data satisfies its own schema",
    (_id, task) => {
      expect(task.schema.safeParse(task.mock.data).success).toBe(true);
    },
  );

  it.each(TASKS.map((t) => [t.id, t] as const))(
    "%s field specs match the schema keys",
    (_id, task) => {
      expect(task.fields.map((f) => f.key).sort()).toEqual(
        Object.keys(task.schema.shape).sort(),
      );
    },
  );

  it("schemaFor picks a subset and rejects unknown fields", () => {
    const task = TASKS[0]!;
    expect(Object.keys(schemaFor(task, ["urgency"]).shape)).toEqual(["urgency"]);
    expect(() => schemaFor(task, ["nope"])).toThrow(/Unknown field/);
  });

  it("system prompt depends on the output format", () => {
    const task = TASKS[0]!;
    expect(buildSystemPrompt(task, "base", "text")).toContain("plain prose");
    expect(buildSystemPrompt(task, "base", "json", ["summary"])).toContain(
      "exactly these keys: summary",
    );
  });

  it("fan-out starts the longest fields first and keeps ties in declaration order", () => {
    const order = fanOutOrder(TASKS[0]!);
    expect(order[0]).toBe("suggested_reply");
    expect(order.slice(-3)).toEqual(["category", "urgency", "sentiment"]);
    expect(order).toHaveLength(6);
  });
});
