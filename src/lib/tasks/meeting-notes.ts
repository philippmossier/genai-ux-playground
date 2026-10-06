import { z } from "zod";
import type { Task } from "./types";

const schema = z.object({
  summary: z.string().describe("Two sentences"),
  decisions: z.array(z.string()),
  action_items: z
    .array(z.string())
    .describe("Each item names the owner, e.g. 'Priya: ...'"),
  open_questions: z.array(z.string()),
  next_meeting: z.string().describe("Date or 'not scheduled'"),
});

export const meetingNotes: Task = {
  id: "meeting-notes",
  title: "Meeting notes to actions",
  description: "Turn a messy transcript into decisions, owners and open questions.",
  system:
    "You turn rough meeting transcripts into precise notes. Only use facts that are in the transcript. If an owner or date is missing, say so instead of guessing.",
  defaultInput: `Priya: ok so the pricing page. we said launch is the 14th right
Tomás: the 14th works if legal signs off the new terms, I haven't heard back
Priya: I'll chase legal today. Also should we keep the free tier at 3 projects or go down to 2?
Jonas: data says 80% of free users never create a third project, so dropping to 2 costs us little
Tomás: but support will get tickets. I'd say keep 3 until after launch and revisit in Q2
Priya: fine, keep 3. Jonas can you pull the numbers on conversion for the Q2 review?
Jonas: yes, by end of month. One more thing, nobody owns the migration email for existing customers
Tomás: not me, I'm on the billing rewrite
Priya: let's park that, someone should draft it. Next sync is Thursday the 9th?
Jonas: works for me`,
  schema,
  fields: [
    { key: "summary", label: "Summary", kind: "text" },
    { key: "decisions", label: "Decisions", kind: "list" },
    { key: "action_items", label: "Action items", kind: "list" },
    { key: "open_questions", label: "Open questions", kind: "list" },
    { key: "next_meeting", label: "Next meeting", kind: "badge" },
  ],
  mock: {
    prose: `**Meeting notes**

The team aligned on a pricing page launch on the 14th, conditional on legal approving the new terms. They kept the free tier at 3 projects until after launch and will revisit the limit in Q2.

**Actions:** Priya chases legal today. Jonas pulls conversion numbers for the Q2 review by the end of the month.

**Open:** nobody owns the migration email for existing customers; it was parked. The next sync is Thursday the 9th.`,
    data: {
      summary:
        "The team plans to launch the pricing page on the 14th if legal approves the new terms. The free tier stays at 3 projects until after launch.",
      decisions: [
        "Keep the free tier at 3 projects until after launch; revisit in Q2",
        "Target launch date is the 14th, conditional on legal sign-off",
      ],
      action_items: [
        "Priya: chase legal for the new terms today",
        "Jonas: pull conversion numbers for the Q2 review by end of month",
      ],
      open_questions: [
        "Who drafts the migration email for existing customers? (no owner)",
      ],
      next_meeting: "Thursday the 9th",
    },
  },
};
