import { reviewAnalysis } from "../tasks/review-analysis";
import type { EvalCase, FieldGold } from "./types";

const base = { taskId: "review-analysis" } as const;
const summary: FieldGold = { kind: "text", sentences: [2, 2] };

export const REVIEW_CASES: EvalCase[] = [
  {
    ...base,
    id: "ra-01",
    input: reviewAnalysis.defaultInput,
    note: "The default example: a comfortable, light backpack with durability complaints.",
    gold: {
      verdict: { kind: "enum", accept: ["mixed"] },
      summary,
      pros: {
        kind: "list",
        facts: [
          { label: "the hip belt or comfort", anyOf: ["hip belt", "comfort"] },
          { label: "low weight", anyOf: ["light", "1.1"] },
        ],
      },
      cons: {
        kind: "list",
        facts: [{ label: "zip or rain cover failures", anyOf: ["zip", "rain cover"] }],
      },
      recommended_for: {
        kind: "text",
        mentions: [{ label: "summer or hiking", anyOf: ["summer", "hik"] }],
      },
    },
  },
  {
    ...base,
    id: "ra-02",
    input: `Product: AirTone Pro headphones
Review 1 (5 stars): Noise cancelling is unreal on trains. Battery lasted my whole 12-hour flight.
Review 2 (5 stars): Best sound under 200 EUR, super comfy for long calls.
Review 3 (5 stars): Battery life is crazy, I charge once a week.`,
    note: "All glowing. Few or no cons.",
    gold: {
      verdict: { kind: "enum", accept: ["recommend"] },
      summary,
      pros: {
        kind: "list",
        facts: [
          { label: "noise cancelling", anyOf: ["noise"] },
          { label: "battery life", anyOf: ["battery"] },
        ],
      },
      cons: { kind: "list", maxItems: 1 },
    },
  },
  {
    ...base,
    id: "ra-03",
    input: `Product: Whirl 900 blender
Review 1 (1 star): The jar leaked on first use.
Review 2 (1 star): Motor died after two weeks.
Review 3 (2 stars): Loud, and the lid doesn't fit.`,
    note: "All negative. Almost no pros.",
    gold: {
      verdict: { kind: "enum", accept: ["avoid"] },
      summary,
      pros: { kind: "list", maxItems: 1 },
      cons: {
        kind: "list",
        facts: [
          { label: "the leaking jar", anyOf: ["leak"] },
          { label: "the motor failure", anyOf: ["motor", "died", "broke"] },
        ],
      },
    },
  },
  {
    ...base,
    id: "ra-04",
    input: `Product: PocketCam action camera
Review 1 (5 stars): Battery easily lasts a full day of filming.
Review 2 (2 stars): Battery dies after 40 minutes. Image quality is great though.
Review 3 (4 stars): Image quality is excellent for the price.`,
    note: "Reviewers contradict each other on battery life but agree on image quality.",
    ambiguous: "Mixed and recommend are both defensible with this split.",
    gold: {
      verdict: { kind: "enum", accept: ["mixed", "recommend"] },
      summary: {
        kind: "text",
        sentences: [2, 2],
        mentions: [{ label: "the battery disagreement", anyOf: ["battery"] }],
      },
      pros: { kind: "list", facts: [{ label: "image quality", anyOf: ["image"] }] },
      cons: { kind: "list", facts: [{ label: "battery life", anyOf: ["battery"] }] },
    },
  },
  {
    ...base,
    id: "ra-05",
    input: `Product: Lumo desk lamp
Review 1 (5 stars): Bright, easy to set up.`,
    note: "A single review. There is little evidence either way.",
    ambiguous: "One review is thin. Recommend and mixed are both accepted.",
    gold: {
      verdict: { kind: "enum", accept: ["recommend", "mixed"] },
      summary,
      pros: {
        kind: "list",
        facts: [
          { label: "brightness or easy setup", anyOf: ["bright", "set up", "setup"] },
        ],
      },
      cons: { kind: "list", maxItems: 1 },
    },
  },
  {
    ...base,
    id: "ra-06",
    input: `Product: Nordic wool socks
Review 1 (5 stars): Arrived in two days, nicely packed.
Review 2 (4 stars): Fast delivery, seller answered my question quickly.`,
    note: "The reviews are only about shipping and the seller. Nothing is said about the socks themselves.",
    ambiguous:
      "With no product feedback, any verdict is a guess. Recommend and mixed are accepted.",
    gold: {
      verdict: { kind: "enum", accept: ["recommend", "mixed"] },
      summary: {
        kind: "text",
        sentences: [2, 2],
        mentions: [
          {
            label: "delivery or packaging",
            anyOf: ["deliver", "shipping", "arrived", "packag"],
          },
        ],
      },
      // Product claims that nobody made. Listing "warm" or "=soft" as a pro is an invention.
      pros: {
        kind: "list",
        forbidden: ["warm", "=soft", "=itch", "durable", "comfortable", "cozy"],
      },
      cons: { kind: "list", maxItems: 1 },
    },
  },
  {
    ...base,
    id: "ra-07",
    input: `Produkt: Wasserkocher Kessel 1,7 L
Rezension 1 (5 Sterne): Kocht schnell und ist sehr leise.
Rezension 2 (4 Sterne): Gutes Design, der Deckel klemmt manchmal.
Rezension 3 (5 Sterne): Preis-Leistung top.`,
    note: "German reviews. Keywords are German.",
    gold: {
      verdict: { kind: "enum", accept: ["recommend"] },
      summary,
      pros: {
        kind: "list",
        facts: [
          { label: "fast or quiet", anyOf: ["schnell", "leise", "fast", "quiet"] },
          { label: "value for money", anyOf: ["preis", "price", "value"] },
        ],
      },
      cons: { kind: "list", facts: [{ label: "the lid", anyOf: ["deckel", "=lid"] }] },
    },
  },
  {
    ...base,
    id: "ra-08",
    input: `Product: Slate e-reader
Review 1 (3 stars): Screen is nice but 249 EUR is too much.
Review 2 (3 stars): Great battery, overpriced compared with other e-readers.
Review 3 (4 stars): Love it, wish it were cheaper.`,
    note: "Everyone likes the product and complains about the price.",
    gold: {
      verdict: { kind: "enum", accept: ["mixed"] },
      summary,
      pros: {
        kind: "list",
        facts: [{ label: "the screen or the battery", anyOf: ["screen", "battery"] }],
      },
      cons: {
        kind: "list",
        facts: [
          {
            label: "the price",
            anyOf: ["price", "expensive", "overpriced", "249", "cheaper", "cost"],
          },
        ],
      },
    },
  },
];
