import { meetingNotes } from "../tasks/meeting-notes";
import type { EvalCase, FieldGold } from "./types";

const base = { taskId: "meeting-notes" } as const;
const summary: FieldGold = { kind: "text", sentences: [2, 2] };

export const MEETING_CASES: EvalCase[] = [
  {
    ...base,
    id: "mn-01",
    input: meetingNotes.defaultInput,
    note: "The default example: pricing page launch, free tier size, an action with an owner, one unowned task.",
    gold: {
      summary,
      decisions: {
        kind: "list",
        facts: [
          {
            label: "keep the free tier at 3 projects",
            anyOf: ["3 projects", "three projects", "free tier"],
          },
          { label: "launch on the 14th", anyOf: ["=14th", "=14"] },
        ],
      },
      action_items: {
        kind: "list",
        facts: [
          { label: "Priya follows up with legal", anyOf: [["=priya", "legal"]] },
          {
            label: "Jonas pulls the conversion numbers",
            anyOf: [["=jonas", "conversion"]],
          },
        ],
      },
      open_questions: {
        kind: "list",
        facts: [{ label: "nobody owns the migration email", anyOf: ["migration"] }],
      },
      next_meeting: {
        kind: "text",
        mentions: [
          {
            label: "Thursday the 9th",
            anyOf: [
              ["thursday", "=9"],
              ["thursday", "=9th"],
            ],
          },
        ],
      },
    },
  },
  {
    ...base,
    id: "mn-02",
    input: `Ana: search v2 is ready, ship it behind a flag next week?
Li: yes, flag it, 10% of users first.
Ana: ok. I'll write the migration script by Wednesday.
Li: and I update the docs before launch. Budget for the extra index servers is still unclear, finance hasn't answered.
Ana: right. Next sync is 21 October.`,
    note: "Two decisions, two owned actions, one open budget question.",
    gold: {
      summary,
      decisions: {
        kind: "list",
        facts: [
          { label: "ship behind a flag", anyOf: ["flag"] },
          { label: "start with 10% of users", anyOf: ["10%", "10 %", "10 percent"] },
        ],
      },
      action_items: {
        kind: "list",
        facts: [
          { label: "Ana writes the migration script", anyOf: [["=ana", "migration"]] },
          {
            label: "Li updates the docs",
            anyOf: [
              ["=li", "docs"],
              ["=li", "documentation"],
            ],
          },
        ],
      },
      open_questions: {
        kind: "list",
        facts: [
          {
            label: "the budget for index servers",
            anyOf: ["budget", "index server", "finance"],
          },
        ],
      },
      next_meeting: {
        kind: "text",
        mentions: [{ label: "21 October", anyOf: ["=21", "=21st"] }],
      },
    },
  },
  {
    ...base,
    id: "mn-03",
    input: `Tomás: backend is at 70%, no blockers.
Priya: design review went fine, nothing to decide.
Jonas: I'm out on Friday.
Tomás: ok, same time next week.`,
    note: "A pure status update. Nothing was decided and nobody was assigned anything: lists must stay empty.",
    gold: {
      summary,
      decisions: { kind: "list", maxItems: 0 },
      action_items: { kind: "list", maxItems: 0 },
      open_questions: { kind: "list", maxItems: 0 },
      next_meeting: {
        kind: "text",
        mentions: [{ label: "same time next week", anyOf: ["next week", "same time"] }],
      },
    },
  },
  {
    ...base,
    id: "mn-04",
    input: `Klara: Wir nehmen das neue Angebot von Lieferant B, es ist 12 Prozent günstiger.
Tim: Einverstanden. Ich kündige den alten Vertrag bis Ende November.
Klara: Wer informiert die Buchhaltung?
Tim: Das hat noch niemand übernommen.
Klara: Nächster Termin ist der 4. Dezember.`,
    note: "German transcript. Keywords are German.",
    gold: {
      summary,
      decisions: {
        kind: "list",
        facts: [
          {
            label: "take the offer of supplier B",
            anyOf: ["lieferant b", "supplier b", "angebot"],
          },
        ],
      },
      action_items: {
        kind: "list",
        facts: [
          {
            label: "Tim cancels the old contract",
            anyOf: [
              ["=tim", "vertrag"],
              ["=tim", "kündig"],
              ["=tim", "contract"],
            ],
          },
        ],
      },
      open_questions: {
        kind: "list",
        facts: [
          { label: "who informs accounting", anyOf: ["buchhaltung", "accounting"] },
        ],
      },
      next_meeting: {
        kind: "text",
        mentions: [
          {
            label: "4 December",
            anyOf: [
              ["=4", "dezember"],
              ["=4", "december"],
            ],
          },
        ],
      },
    },
  },
  {
    ...base,
    id: "mn-05",
    input: `Ben: the vendor still hasn't sent the contract.
Sara: someone should email them.
Ben: yeah. Let's see.
Sara: next call is 2 Nov.`,
    note: "A task nobody takes. The notes must not assign it to Ben or Sara.",
    ambiguous:
      "Models may list the email as an unassigned action or as an open question. Only naming Ben or Sara as the owner is counted as wrong.",
    gold: {
      summary,
      action_items: { kind: "list", forbidden: ["=ben", "=sara"] },
      open_questions: {
        kind: "list",
        facts: [{ label: "the missing vendor contract", anyOf: ["vendor", "contract"] }],
      },
      next_meeting: {
        kind: "text",
        mentions: [
          {
            label: "2 November",
            anyOf: [
              ["=2", "nov"],
              ["=2nd", "nov"],
            ],
          },
        ],
      },
    },
  },
  {
    ...base,
    id: "mn-06",
    input: `Omar: Release candidate is 12 November, final release 3 December.
Nina: Freeze the API on 5 November then.
Omar: Agreed. Nina, please send the freeze notice to partners.
Nina: Will do, by Monday.
Omar: Next meeting 19 November.`,
    note: "Several dates. Tests that dates are copied exactly and not invented.",
    gold: {
      summary,
      decisions: {
        kind: "list",
        facts: [
          {
            label: "release candidate on 12 November",
            anyOf: [
              ["=12", "nov"],
              ["=12th", "nov"],
            ],
          },
          {
            label: "API freeze on 5 November",
            anyOf: [
              ["=5", "nov"],
              ["=5th", "nov"],
            ],
          },
        ],
      },
      action_items: {
        kind: "list",
        facts: [
          {
            label: "Nina sends the freeze notice",
            anyOf: [
              ["=nina", "freeze"],
              ["=nina", "notice"],
            ],
          },
        ],
      },
      next_meeting: {
        kind: "text",
        mentions: [
          {
            label: "19 November",
            anyOf: [
              ["=19", "nov"],
              ["=19th", "nov"],
            ],
          },
        ],
      },
    },
  },
  {
    ...base,
    id: "mn-07",
    input: `Dev: let's move the database to MongoDB.
Rui: that breaks our reporting queries.
Dev: fair point, then we stay on Postgres and just add an index.
Rui: agreed. I'll add the index this week.`,
    note: "A proposal that is withdrawn. The decision is to stay on Postgres.",
    gold: {
      summary,
      decisions: {
        kind: "list",
        facts: [{ label: "stay on Postgres", anyOf: ["postgres"] }],
        forbidden: [
          "move to mongodb",
          "migrate to mongodb",
          "move the database to mongodb",
          "switch to mongodb",
        ],
      },
      action_items: {
        kind: "list",
        facts: [{ label: "Rui adds the index", anyOf: [["=rui", "index"]] }],
      },
    },
  },
  {
    ...base,
    id: "mn-08",
    input: `Lea: morning! how was the weekend?
Max: good, went hiking.
Lea: nice. ok talk later.`,
    note: "Small talk. No content to extract at all.",
    gold: {
      summary,
      decisions: { kind: "list", maxItems: 0 },
      action_items: { kind: "list", maxItems: 0 },
      open_questions: { kind: "list", maxItems: 0 },
      next_meeting: {
        kind: "text",
        mentions: [
          {
            label: "no meeting scheduled",
            anyOf: ["not scheduled", "=none", "no meeting", "n/a"],
          },
        ],
      },
    },
  },
];
