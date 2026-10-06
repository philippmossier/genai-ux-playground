import { supportTriage } from "../tasks/support-triage";
import type { EvalCase, Fact, FieldGold } from "./types";

const gold = (o: {
  category: string[];
  urgency: string;
  sentiment: string;
  language?: "en" | "de";
  replyMentions?: Fact[];
}): Record<string, FieldGold> => ({
  category: { kind: "enum", accept: o.category },
  urgency: { kind: "enum", accept: [o.urgency] },
  sentiment: { kind: "enum", accept: [o.sentiment] },
  summary: { kind: "text", maxWords: 25 },
  tags: { kind: "list", count: [2, 4], lowercase: true },
  suggested_reply: {
    kind: "text",
    sentences: [3, 5],
    language: o.language ?? "en",
    mentions: o.replyMentions,
  },
});

const base = { taskId: "support-triage" } as const;

export const SUPPORT_CASES: EvalCase[] = [
  {
    ...base,
    id: "st-01",
    input: supportTriage.defaultInput,
    note: "The default example. Empty invoice PDF for the third time, VAT deadline tomorrow, angry long-term customer.",
    ambiguous:
      "A broken invoice download is a bug, but it sits in billing. Both labels are accepted.",
    gold: gold({
      category: ["bug", "billing"],
      urgency: "high",
      sentiment: "negative",
      replyMentions: [{ label: "the invoice number", anyOf: ["INV-2291", "2291"] }],
    }),
  },
  {
    ...base,
    id: "st-02",
    input: `Subject: CSV export delimiter

Hi, we love the new export! Could you add an option to choose the delimiter (semicolon)? Our accounting software in Germany needs it. No rush at all.

Thanks, Marta`,
    note: "Friendly feature request with no urgency.",
    gold: gold({
      category: ["feature_request"],
      urgency: "low",
      sentiment: "positive",
      replyMentions: [
        { label: "the delimiter option", anyOf: ["delimiter", "semicolon"] },
      ],
    }),
  },
  {
    ...base,
    id: "st-03",
    input: `Subject: Charged twice

I see two charges of 49 EUR on 3 October for the same subscription (order 88231). Please refund one of them. Card ending 4417.`,
    note: "Plain billing problem with exact figures. Tests that numbers are not invented.",
    gold: gold({
      category: ["billing"],
      urgency: "medium",
      sentiment: "negative",
      replyMentions: [{ label: "the refund", anyOf: ["refund"] }],
    }),
  },
  {
    ...base,
    id: "st-04",
    input: `Subject: Nobody can log in

Since 8am our whole team (about 40 people) gets "invalid_grant" when signing in through SSO. We have a customer demo at noon and cannot reach the product. Please escalate.`,
    note: "Outage-like login failure with a hard deadline.",
    ambiguous:
      "Could be filed as an account problem or as a bug. Both labels are accepted.",
    gold: gold({
      category: ["account", "bug"],
      urgency: "high",
      sentiment: "negative",
      replyMentions: [
        { label: "the login/SSO problem", anyOf: ["=sso", "log in", "login", "sign in"] },
      ],
    }),
  },
  {
    ...base,
    id: "st-05",
    input: `Subject: Change email address

Hello, how do I change the email address on my account? I switched jobs.`,
    note: "Simple how-to question. Neutral and not urgent.",
    gold: gold({
      category: ["account"],
      urgency: "low",
      sentiment: "neutral",
      replyMentions: [{ label: "the email address", anyOf: ["email", "e-mail"] }],
    }),
  },
  {
    ...base,
    id: "st-06",
    input: `Betreff: App stürzt ab

Hallo, seit dem Update gestern (Version 4.2.1, Android 14) stürzt die App beim Öffnen der Rechnungsliste sofort ab. Vorher lief alles. Können Sie das prüfen?

Danke, J. Berger`,
    note: "German bug report. The reply must be in German (the schema says: the customer's language).",
    gold: gold({
      category: ["bug"],
      urgency: "medium",
      sentiment: "negative",
      language: "de",
      replyMentions: [
        {
          label: "the crash or the update",
          anyOf: ["absturz", "abstürz", "update", "stürzt"],
        },
      ],
    }),
  },
  {
    ...base,
    id: "st-07",
    input: `Subject: Thank you

Just wanted to say thanks, the support last week fixed everything. Great service.`,
    note: "Pure thanks. Nothing to resolve.",
    gold: gold({
      category: ["other"],
      urgency: "low",
      sentiment: "positive",
      replyMentions: [
        {
          label: "gratitude",
          anyOf: ["thank", "glad", "happy", "pleased", "appreciate"],
        },
      ],
    }),
  },
  {
    ...base,
    id: "st-08",
    input: `Subject: Wrong totals AGAIN

The dashboard shows wrong totals again, third time this month. If this is not fixed by Friday we are moving to a competitor.`,
    note: "Churn threat with a deadline over a recurring bug.",
    gold: gold({
      category: ["bug"],
      urgency: "high",
      sentiment: "negative",
      replyMentions: [{ label: "the Friday deadline", anyOf: ["friday"] }],
    }),
  },
];
