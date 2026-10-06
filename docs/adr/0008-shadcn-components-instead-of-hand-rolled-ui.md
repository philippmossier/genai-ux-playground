# 8. shadcn components instead of hand-rolled UI

Date: 2026-10-05

## Status

Accepted

## Context

The first UI was plain Tailwind with raw zinc/sky/emerald colours: native `<select>` elements, hand-built tabs, range
inputs with a custom label, a hand-built table, a `<details>` for the prompts, divs styled as cards, badges and
alerts. It worked, but every piece was bespoke, none of it had consistent focus or keyboard behaviour, and the colours
were scattered across files. The owner's rule is to use built-in components instead of hand-rolling.

## Decision

Use shadcn (`base-vega` style, neutral base, lucide icons, `~` alias, same setup as the sibling Local AI Chat) and
semantic tokens only. The app is dark, so `<html class="dark">`. Mapping: `Select` for the four pickers (with Base UI's
`items` prop so the trigger shows the label), `Tabs` for the modes, `Slider`, `Table`, `Card`, `Badge`, `Alert`,
`Empty`, `Progress`, `Spinner`, `Skeleton`, `Field`/`FieldGroup` for the form, `Collapsible` for the prompts, `Button`
for every action. One extra token, `--warning`, covers the amber text that shadcn has no semantic colour for.

## Consequences

- Less markup to own, and focus handling, keyboard support and ARIA from Base UI.
- Badge tones lose their separate amber: good, warn, bad, neutral map to the `default`, `secondary`, `destructive`
  and `outline` variants.
- Generated files live in `src/components/ui/` and are not hand-edited.
- The CLI imports a `cn` npm package and overwrites `src/lib/utils.ts` with a self-import: restore the repo's own
  `cn` (clsx plus tailwind-merge) and fix the imports after each `add`. `formatMs` also lives in `utils.ts`, so check it
  survived.
