import { z } from "zod";
import type { Task } from "./types";

const schema = z.object({
  verdict: z.enum(["recommend", "mixed", "avoid"]),
  summary: z.string().describe("Two sentences"),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  recommended_for: z.string().describe("Who should buy this, one sentence"),
});

export const reviewAnalysis: Task = {
  id: "review-analysis",
  title: "Review digest",
  description: "Condense several product reviews into a verdict with pros and cons.",
  system:
    "You write honest product review digests. Weigh the reviews against each other, mention disagreements, and do not exaggerate.",
  defaultInput: `Product: TrailLite 40L hiking backpack

Review 1 (5 stars): Carried it for 9 days on the Alta Via. Hip belt is superb, never had sore shoulders. Zips feel solid.
Review 2 (2 stars): The rain cover tore on day two and the main zip jammed after a week. Comfortable, but I expect better at this price.
Review 3 (4 stars): Light (1.1 kg) and well ventilated back panel. Pockets are a bit small for a water bottle plus snacks.
Review 4 (3 stars): Good for summer. In winter the hip belt pockets are too tight for gloves. Customer service replaced my zip quickly though.
Review 5 (5 stars): Best pack I have owned under 1.2 kg. Fits carry-on limits when compressed.`,
  schema,
  fields: [
    {
      key: "verdict",
      label: "Verdict",
      kind: "badge",
      tones: { recommend: "good", mixed: "warn", avoid: "bad" },
    },
    { key: "summary", label: "Summary", kind: "text" },
    { key: "pros", label: "Pros", kind: "list" },
    { key: "cons", label: "Cons", kind: "list" },
    { key: "recommended_for", label: "Recommended for", kind: "text" },
  ],
  mock: {
    prose: `**Review digest: TrailLite 40L**

Reviewers agree the pack is light and comfortable, with a standout hip belt and a ventilated back panel. The complaints are about durability: a torn rain cover and a jammed main zip were reported, although customer service replaced a zip quickly.

**Verdict:** mixed to positive. Great for summer multi-day hikes and weight-conscious buyers; less convincing if you expect rugged build quality or carry a lot in side pockets.`,
    data: {
      verdict: "mixed",
      summary:
        "Reviewers praise the low weight, hip belt and ventilation. Durability is the weak point, with torn rain covers and jamming zips reported.",
      pros: [
        "Excellent hip belt, comfortable over many days",
        "Very light at about 1.1 kg",
        "Ventilated back panel",
        "Fits carry-on limits when compressed",
      ],
      cons: [
        "Rain cover and main zip failed for some owners",
        "Side pockets are small for a bottle plus snacks",
        "Hip belt pockets are too tight for gloves",
      ],
      recommended_for:
        "Weight-conscious summer hikers who value comfort over rugged durability.",
    },
  },
};
