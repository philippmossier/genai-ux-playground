# Evaluation: how correctness is measured, and what it cannot tell you

The playground measures three different things. Do not mix them up.

| What            | Question it answers                   | How                                                                                                                           |
| --------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Speed**       | When does the user see something?     | Browser timings: first byte, first token, first content, complete ([ADR 4](adr/0004-define-first-content-per-render-mode.md)) |
| **Validity**    | Does the output have the right shape? | The task's Zod schema, applied to the final object                                                                            |
| **Correctness** | Is the content right?                 | Deterministic checks against a labelled answer (this document)                                                                |

Validity is not correctness. The schema says `category` is one of five words. It cannot say which one.
In the first benchmark every structured output was valid, and the models still disagreed about the same
ticket.

> **Status: the labels were written by an AI assistant and have not been reviewed by a human yet.** No
> real model has been scored against them. Review [`eval/labels.md`](eval/labels.md) first. Until then,
> treat every accuracy number this tool produces as provisional.

## Why deterministic checks and no LLM judge

An LLM judge is the usual way to score free text, and it is the wrong default here:

- It has biases (it prefers answers that sound like itself), and those biases are different per judge.
- It costs money on every run and its verdict changes with the judge model's version.
- You cannot unit test it. A deterministic scorer can be tested with hand-made outputs whose score is
  known, and this one is ([`src/lib/eval/score.test.ts`](../src/lib/eval/score.test.ts)).

The price is that the checks are narrow. They verify that facts are present and nothing is invented. They
do not judge whether a reply is well written. See "What it cannot tell you".

## The labelled set

24 cases, 8 per task (support ticket triage, meeting notes, review digest). Each case is an input text and
a gold description per output field, in [`src/lib/eval/cases-*.ts`](../src/lib/eval).
[`eval/labels.md`](eval/labels.md) renders them as readable Markdown (`pnpm labels > docs/eval/labels.md`).

The first case of each task is the task's default input, so the UI can score the very first run.

Cases are chosen to be clear unless marked **ambiguous**. Ambiguous cases accept several labels and are
reported separately ("correct on clear cases" next to "correct overall"). Some cases exist to catch a
specific failure:

| Case                      | Catches                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `mn-03`, `mn-08`          | Inventing decisions, actions or questions where there are none (lists must stay empty) |
| `mn-05`                   | Assigning a task to a person nobody named                                              |
| `mn-07`                   | Reporting a withdrawn proposal as a decision                                           |
| `ra-06`                   | Praising product features that nobody mentioned (the reviews are only about shipping)  |
| `st-03`, `mn-06`          | Inventing or altering numbers and dates                                                |
| `st-06`, `mn-04`, `ra-07` | Wrong output language (German input)                                                   |

## What gets checked

Each gold field is one of three kinds. Every individual check passes or fails.

| Gold kind                                                | Checks                                                                                                   | Counted as                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------- |
| **enum** (`urgency`, `category`, `sentiment`, `verdict`) | The value equals an accepted label (case and spaces ignored)                                             | label accuracy            |
| **list** (`tags`, `decisions`, `action_items`...)        | Each required **fact** appears. Optionally: item count, maximum items, forbidden keywords, all lowercase | facts (recall) and format |
| **text** (`summary`, `suggested_reply`...)               | Each required fact appears. Optionally: maximum words, sentence range, language                          | facts and format          |

A **fact** is a name plus alternatives. It passes when any alternative matches. An alternative is a keyword,
or a group of keywords that must all appear in the same list item:

```ts
{ label: "Priya follows up with legal", anyOf: [["=priya", "legal"]] }
```

Keywords are matched case-insensitively as substrings, so `leak` finds "leaked" and `hik` finds "hiking".
A keyword starting with `=` must match a **whole word**: `=li` does not match "will", `=2` does not match
"12". Names, numbers and short words need the `=`, otherwise a wrong answer can pass by accident. Dates
need ordinal alternatives (`=9` and `=9th`). This was found by testing the labels, not by thinking about
them: the first version of the label for "Thursday the 9th" rejected the correct answer.

A field that is missing or has the wrong type fails every check that belongs to it.

### Numbers per run

For one output, `scoreCase` returns:

- `enumAccuracy`: share of label checks passed,
- `factRecall`: share of required facts present,
- `formatPass`: share of structural checks passed (lengths, language, counts, forbidden words),
- `overall`: the mean of those three that exist for the case (cases without, say, facts skip that rate),
- `hallucinations`: **invented figures**, see below.

The invented-figures check collects digit sequences in the output (numbers, dates, ids, versions) that do
not occur in the input. Numbers 1 to 5 are ignored ("three tips" is not a fact). It catches changed figures
and made-up numbers. It does **not** catch an invented name or an invented claim.

### Several runs

Models are not deterministic. `Runs per mode` in the UI, and `--repeat` in the CLI, repeat each experiment.
Results are reduced to a **median and range** for timings and a **mean** for correctness
([`src/lib/client/aggregate.ts`](../src/lib/client/aggregate.ts),
[`src/lib/eval/summary.ts`](../src/lib/eval/summary.ts)). The summary also lists the checks that failed most
often, which is usually the most useful output: it tells you what to fix, not just a percentage.

## Using it

**In the UI.** Pick a labelled case under Prompts. Run a structured mode (free text is not scored). The
result shows a correctness panel with every failed check. With "Runs per mode" above 1, the table groups
repetitions and shows an accuracy column. "Export JSON" saves the runs (never the API token, system prompt or
input text).

**From the command line.**

```bash
pnpm build && pnpm start &          # server on :3000, real providers need ALLOW_REAL_PROVIDERS=1 in .env
pnpm eval --provider anthropic --model claude-haiku-4-5 --repeat 3 --modes structured-stream,fan-out
```

It prints one row per mode (correct overall and on clear cases, labels, facts, format, invented figures per
run, invalid, failed, median first content and complete time) and the most frequently failed checks. Raw
results go to `eval-results/` (git-ignored). Set `PAID_RATE_LIMIT_PER_MIN` high: 24 cases x 3 repeats x
fan-out's 6 calls is over 400 requests per model.

With `--provider mock` the numbers only test the plumbing: the mock returns the same canned answer for every
input, which is a perfect answer to the first case of each task (the default input) and a wrong one
for the other seven.

## How the scorer itself is verified

A scorer that is never tested can be wrong in either direction, so it has its own tests:

- Hand-made outputs with a known score: perfect, one wrong label, one missing fact, a hallucinated figure.
- **Discrimination**: an empty answer and `null` score 0 on every case; a constant answer
  (`bug / high / negative` for everything) scores under 60% on label accuracy; a lazy `verdict: mixed`
  does not pass every review case.
- **Whole-word matching**: `li` in "will", `2` in "12" and `ben` in "benefits" must not count.
- **The labels are checked against the schema**: every gold field exists, enum labels are real options,
  list and text fields have the right type, ambiguous cases carry a reason, each task has 8 cases.
- The controller test checks that the mock's canned answer scores 100% on case `st-01` and that the same
  run with a wrong urgency and a wrong sentiment is still **valid** but scores 33% on labels: validity
  and correctness disagree.

## What it cannot tell you

- **Sample size.** 8 cases per task is enough to expose a clearly bad model or a specific weakness, and not
  enough to rank two good ones. The cases are not independent samples (24 runs of one model are 24
  correlated draws, not 72), so as a rule of thumb treat differences under about 10 points as noise.
- **Label bias.** One author wrote the gold. A different reasonable author would move a few labels. That is
  why ambiguous cases are marked, and why a human should review the file.
- **Brittle keywords.** A correct answer phrased unexpectedly fails a fact ("remboursement" for "refund").
  False failures push scores down, never up. Check the top failures before concluding a model is bad.
- **Quality of writing.** Tone, usefulness and politeness of a drafted reply are not measured.
- **Invented names and claims.** Only invented figures are caught.
- **Delivery mode changes the answer.** Fan-out asks narrow questions and may answer differently than one big
  prompt. That is a real effect worth measuring, but it means "accuracy per model" is really "accuracy per
  model and mode". The tables always show both.
- **Free text.** Blocking and streamed text have no fields to compare and are not scored.

## Adding a case

1. Add an `EvalCase` to the right file in `src/lib/eval/`. Write an input and the gold for each field you can
   judge deterministically. Skip fields you cannot.
2. Prefer clear cases. If two labels are defensible, accept both and set `ambiguous` with a reason (a test
   enforces the reason).
3. Use `=` for names, numbers and short words. Add ordinal and spelling alternatives for dates.
4. Run `pnpm test`: the label-consistency tests check the case against the task schema.
5. Regenerate the review file: `pnpm labels > docs/eval/labels.md`.
