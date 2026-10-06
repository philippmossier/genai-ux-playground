# Review guide

For a human or an AI reviewer who is seeing this repository for the first time. It lists what the project
claims, where the evidence for each claim is, how to check it, and where the author expects problems. The
last part is deliberately blunt: it is the list of things the author is least sure about.

Read first: [README](../README.md) (what it is), [ARCHITECTURE](ARCHITECTURE.md) (how it is built),
[EVALUATION](EVALUATION.md) (how correctness is measured). Decisions are in [`adr/`](adr).

## Five minutes to a running review

```bash
pnpm install
pnpm check                 # format, eslint, tsc, vitest (125 tests)
pnpm dev                   # http://localhost:3000, mock provider, no key needed
pnpm labels | head -60     # what a labelled case looks like
```

In the browser: choose "Labelled case" under Prompts, switch the mode tabs, press **Run all 5 modes** with
"Runs per mode" at 3, and read the table and the correctness panel. With a key in `.env` (copy
`.env.example`, set `ALLOW_REAL_PROVIDERS=1`) the same works on real models. The on-device provider needs a
Chromium browser with WebGPU and downloads 3.1 GB the first time.

## What the project claims, and the evidence

| Claim                                                                                                    | Where it is argued                                    | How to check it                                                                                         |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| The five modes differ in the **request** (streaming, constraint, number of calls), not only in rendering | README table, `src/lib/modes.ts`, `run-controller.ts` | Read `runSingle` and `runFanOut`: look at the `stream` and `format` fields of the payload each builds   |
| Every metric is defined once, in one place, and tested                                                   | ADR 4, `run-controller.ts`                            | `run-controller.test.ts` uses a fake clock; try changing a definition and watch a test fail             |
| Partial JSON parsing never shows a value that later changes                                              | `partial-json.ts`, its test                           | The property test walks every prefix of a document. Try to find a counterexample                        |
| Keys never reach the browser; real providers are off by default                                          | ADR 2, `run-handler.ts`, `env.ts`                     | `run-handler.test.ts`; grep the built client bundle for a key; read `describeProviders`                 |
| The scorer discriminates and is not fooled by short words                                                | EVALUATION                                            | `eval/score.test.ts` ("the scorer discriminates", "keyword matching")                                   |
| The labels are consistent with the schemas                                                               | EVALUATION                                            | The `it.each` over all cases at the end of `score.test.ts`                                              |
| The benchmark numbers in the README are real                                                             | README "What I measured"                              | Reproduce with `pnpm bench` (needs keys and a raised rate limit). Expect different decimals, same shape |
| The on-device provider works in all five modes                                                           | README, ARCHITECTURE                                  | Run it in Chromium. It is not covered by automated tests                                                |

## Known weak spots (where to look for bugs)

The author's own list, most to least worrying.

1. **The labels are unreviewed.** Written by an AI assistant, not checked by a human. Any accuracy number
   is provisional. Check `docs/eval/labels.md` before anything else. Two label bugs were already found only
   because tests made the matching stricter (whole-word matching, ordinal dates), so more are likely.
2. **"First content" for structured stream is generous.** `hasVisibleContent` in `run-controller.ts` counts
   any non-empty string field, so the first character of the summary already counts. A one-letter widget is
   not "usable". The metric flatters this mode against fan-out, which only counts a finished section.
   Consider a minimum, or "first complete field".
3. **The benchmark has order effects.** `scripts/bench.ts` runs the modes in the same order every round, so
   the first mode of the first round absorbs any cold start (connection set-up, a provider compiling a new
   schema). Medians of three runs soften this and do not remove it. The README numbers are n=3 and the
   on-device row is n=1.
4. **Prose and JSON are compared on "complete".** They are different outputs of different length. The README
   says not to compare those columns. The UI table does not stop you from doing it.
5. **Effort and thinking.** Benchmarks used effort `low`. Gemini `thinkingLevel` and OpenAI
   `reasoning_effort` were exercised only at `low`; `medium` and `high` are untested. Models that ignore the
   setting (Haiku 4.5, GPT-4.1 mini) silently run at their default. The README's hypothesis that Gemini 3.8
   Flash spends hidden thinking on the text path is inferred from token counts and not verified.
6. **Fan-out lives in the browser.** That makes each section's timing visible and the server stateless, and it
   also means the server rate limit sees N requests and a real product would not be built this way
   ([ADR 3](adr/0003-fan-out-is-orchestrated-in-the-browser-longest-field-first.md)). The longest-field-first
   scheduling optimises total time and moves first content later; it is a trade, not a free win.
7. **On-device engine concurrency.** `on-device/engine.ts` serialises generations through a promise chain and
   `stream.ts` bridges callbacks to an async generator with a `wake` function and a `finished` flag. The
   abort and error paths (interrupt while queued, worker crash mid-generation) are reasoned about, not tested.
8. **The rate limiter is in memory and per instance.** `X-Forwarded-For` is only used with
   `TRUSTED_PROXY_HOPS` set, and then only the entry the trusted proxy appended. A wrong hop count (for example
   a CDN in front of NGINX that you did not count) makes every client share one bucket or lets the CDN's
   client-side entry through. `maxTokens` is capped at 4096, and OpenAI reasoning models get
   4096 more completion tokens of headroom, so one call can cost up to about 8k tokens.
9. **Hydration.** `useWebGpu` in `routes/index.tsx` returns `false` on the server and `true` after hydration, so
   the on-device provider option flips from disabled to enabled once the page loads.
10. **The invented-figure check is narrow.** Digits only, numbers 1 to 5 ignored. An invented name passes.
11. **Exact-match labelled case lookup.** `findCase` compares the input string exactly. A trailing space
    removes the score without saying why (the panel says the input is edited).
12. **No test covers client disconnect.** The SSE stream's `cancel()` aborts the provider call, and nothing
    asserts it.
13. **Gaps in the checks for real providers.** The adapters are type-checked against the vendor SDKs and were
    smoke-tested live, not unit-tested. A vendor API change would show up at runtime.

## Suggested review passes

1. **Correctness bugs first.** Start with `run-controller.ts`, `partial-json.ts`, `eval/score.ts`,
   `run-handler.ts`. These are small and carry the claims.
2. **Claims against evidence.** Take each row of the table above and try to break it.
3. **The labels.** Read `docs/eval/labels.md` as a domain reviewer: is each "correct answer" really correct?
   Is anything marked clear that you would argue about?
4. **Design.** Is the event protocol the right abstraction? What breaks when a provider returns tool calls,
   multiple choices or reasoning summaries? ([ADR 1](adr/0001-one-event-protocol-for-all-providers.md))
5. **Docs.** Do the README and these docs say anything the code does not do?

A prompt that works for an AI reviewer: _"Review this repository for correctness bugs first, then for places
where the README or docs claim more than the code or the tests demonstrate. Use docs/REVIEW-GUIDE.md as a
map. For every finding give the file and line, a concrete failing scenario, and how you would verify it."_

## Open decisions for the owner

- Review and correct the labels, then run the evaluation on the real models and put dated numbers in the README.
- Decide whether "first content" should require a minimum amount of content (weak spot 2).
- Decide whether to randomise the mode order in the benchmark (weak spot 3).
- Decide whether a server-side fan-out variant belongs in the playground.

## Out of scope on purpose

Tool calling and agents, cost per run, a database, authentication, multi-user history, quality judging of
free text, more than three tasks.
