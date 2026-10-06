# CLAUDE.md

Instructions for AI assistants working in this repository.

## What this is

GenAI UX Playground: one prompt, delivered five ways (blocking, streamed text, structured, structured
stream, parallel fan-out), with browser-side timing and a deterministic correctness score. Read
`README.md`, then `docs/ARCHITECTURE.md` (design) and `docs/EVALUATION.md` (what the scores mean).
`docs/REVIEW-GUIDE.md` lists known weak spots.

## Commands

```bash
pnpm install
pnpm dev            # http://localhost:3000, loads .env if present
pnpm check          # prettier --write, eslint, tsc, vitest. Run before finishing any change
pnpm test           # vitest run (no network, no keys needed)
pnpm build && pnpm start
pnpm bench --url http://localhost:3000 --provider mock      # speed, all five modes
pnpm eval  --url http://localhost:3000 --provider mock      # correctness on the labelled cases
pnpm labels > docs/eval/labels.md                           # regenerate after changing any case
```

## Rules

- **Never print, log, commit or paste an API key.** `.env` is git-ignored; keep it that way. Do not read
  `.env` unless the task needs a key, and never echo values.
- **Do not commit** unless asked.
- **Tests must pass without network or keys.** Anything that calls a real provider is a script, not a test.
- **When you change a metric definition**, update `run-controller.ts`, its test, ADR 4 and the README table in
  the same change.
- **When you change a labelled case** or the scorer, regenerate `docs/eval/labels.md` and run `pnpm test`.
  The label-consistency tests are there to catch mistakes in the labels.
- **Do not present accuracy numbers as validated.** The labels are unreviewed (see EVALUATION). Numbers in the
  README must come from a dated `pnpm bench` or `pnpm eval` run. Never estimate or round them up by hand.
- **Verify scripted edits.** A search-and-replace that silently matches nothing has happened here before
  (prettier reformats code, so exact-string replacements stop matching). Assert that the replacement applied,
  or edit with the editor tool.
- **UI: shadcn first.** Use the components in `src/components/ui/` and semantic tokens (`text-muted-foreground`,
  `bg-card`, `text-primary`), never raw colours or hand-built selects, tabs, tables or cards. Add components with
  `npx shadcn@latest add <name> --yes --overwrite`, then restore the repo's own `cn` in `src/lib/utils.ts` (the CLI
  overwrites it with a self-import), keep `formatMs` there, and run
  `grep -rl 'from "cn"' src | xargs sed -i '' 's#from "cn"#from "~/lib/utils"#'` (ADR 8).
- Provider SDKs are imported only under `src/lib/providers/`. Server code must not import from `components/`.
  Client code must not import the server SDKs.
- Style: TypeScript strict, Zod 4, Prettier. No em dashes in prose, comments or commit messages.
- Do not copy code, prompts or data from other projects without permission. This repository is meant to be public.

## Where things are

See the module map in `docs/ARCHITECTURE.md`. The core is `src/lib/client/run-controller.ts`; the scorer is
`src/lib/eval/score.ts`; the server entry is `src/lib/server/run-handler.ts`.

## Gotchas

- `pnpm` 11 refuses dependency build scripts unless allowed in `pnpm-workspace.yaml` (`allowBuilds`).
- Benchmarks need `PAID_RATE_LIMIT_PER_MIN` raised (one run-all is 10 requests, fan-out alone is 6 per run).
- The on-device provider needs a Chromium browser with WebGPU. In Brave the GPU vendor string is empty.
