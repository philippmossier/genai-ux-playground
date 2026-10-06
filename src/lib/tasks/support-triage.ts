import { z } from "zod";
import type { Task } from "./types";

const schema = z.object({
  summary: z.string().describe("One sentence, max 25 words"),
  category: z.enum(["billing", "bug", "feature_request", "account", "other"]),
  urgency: z.enum(["low", "medium", "high"]),
  sentiment: z.enum(["negative", "neutral", "positive"]),
  tags: z.array(z.string()).describe("2 to 4 short lowercase tags"),
  suggested_reply: z
    .string()
    .describe("A reply of 3 to 5 sentences in the customer's language"),
});

export const supportTriage: Task = {
  id: "support-triage",
  title: "Support ticket triage",
  description: "Classify an incoming customer email and draft a reply.",
  system:
    "You are a support triage assistant for a B2B invoicing product. Read the customer email and triage it. Be concrete and do not invent account details.",
  defaultInput: `Subject: Invoice PDF broken again - need it today!!

Hi team,

for the third time this quarter the PDF download for our March invoice (INV-2291) returns an empty file. Our accountant needs it before the VAT filing closes tomorrow at noon, otherwise we pay a late fee. We have been customers for four years and this is honestly getting frustrating.

I tried Chrome and Firefox, same result. Can you send the PDF by email in the meantime and tell us what is going on?

Thanks,
Sam Keller
Keller & Sons Logistics`,
  schema,
  fields: [
    { key: "summary", label: "Summary", kind: "text" },
    {
      key: "category",
      label: "Category",
      kind: "badge",
    },
    {
      key: "urgency",
      label: "Urgency",
      kind: "badge",
      tones: { high: "bad", medium: "warn", low: "good" },
    },
    {
      key: "sentiment",
      label: "Sentiment",
      kind: "badge",
      tones: { negative: "bad", neutral: "warn", positive: "good" },
    },
    { key: "tags", label: "Tags", kind: "list" },
    { key: "suggested_reply", label: "Suggested reply", kind: "longtext" },
  ],
  mock: {
    prose: `**Triage report**

This is a repeat invoice-PDF failure for a long-standing customer. The March invoice (INV-2291) downloads as an empty file, it is the third occurrence this quarter, and the customer has a hard deadline: the VAT filing closes tomorrow at noon.

**Category:** bug (billing-adjacent). **Urgency:** high, because of the deadline and a possible late fee. **Sentiment:** negative, with clear frustration after four years as a customer.

**Recommended next steps:** generate the PDF manually and email it today, open an incident for the recurring empty-PDF bug, and follow up once the root cause is known.

**Draft reply:** Hi Sam, I am sorry about the trouble with INV-2291. I have generated the PDF manually and attached it to this email so you have it well before tomorrow's filing. We are also investigating why the download fails repeatedly and will update you once it is fixed.`,
    data: {
      summary:
        "Long-standing customer gets an empty PDF for invoice INV-2291 again and needs it before tomorrow noon.",
      category: "bug",
      urgency: "high",
      sentiment: "negative",
      tags: ["invoice-pdf", "repeat-issue", "deadline", "retention-risk"],
      suggested_reply:
        "Hi Sam, I am sorry about the trouble with INV-2291. I have generated the PDF manually and attached it to this email, so you have it well before tomorrow's VAT filing. The empty download is a known failure we have now seen more than once, so I opened an incident with our engineering team to fix the root cause. I will write to you personally as soon as it is resolved.",
    },
  },
};
