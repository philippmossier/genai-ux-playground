# 6. Correctness by deterministic checks against labelled answers

Date: 2026-10-05

## Status

Accepted. The labels themselves are not yet reviewed

## Context

The first benchmark measured speed and schema validity. Every structured output was valid and the models still
disagreed about the same ticket: validity says nothing about whether the content is right. Comparing a small
on-device model with hosted ones makes that gap the main question. Markus's extraction benchmark in another
project scored output against a curated expected result, which is the right shape.

Options: (a) an LLM judge, (b) human rating, (c) deterministic checks against labelled answers.

## Decision

(c). A small labelled set (24 cases, 8 per task) with gold per field, and a scorer made of checks that pass or
fail: exact match for enums, required facts (keyword alternatives, optionally several words in the same item)
for lists and text, structural checks (counts, length, language, forbidden words), and invented figures.
Names, numbers and short words must match as whole words. Free text is not scored beyond those checks.

An LLM judge is left out of the default path. It would add a second model's bias and cost to every run, and a
scorer that calls a model cannot be unit tested.

## Consequences

- The scorer is fully tested, and its tests include discrimination checks (an empty or constant answer must score
  badly) and whole-word matching.
- It measures presence of facts and absence of invented figures, not quality of writing. Paraphrases a keyword
  list does not anticipate count as misses, so scores err low.
- Eight cases per task cannot rank two good models. EVALUATION.md says so and gives a noise rule of thumb.
- Someone has to review the labels. Until then every score is provisional.
- Delivery mode can change accuracy (narrow fan-out prompts), so results are always reported per mode.
