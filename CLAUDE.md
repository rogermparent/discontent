# content-engine

A pnpm workspace: a reusable CMS engine plus the sites built on it.

## Shape

- `packages/cms` — the engine (`@discontent/cms`): content types, LMDB
  indexes, pagination, aggregates, forms, git commits, incremental
  regeneration. Other `packages/*` are the component library and collection
  plugins.
- `websites/recipe-website` — the main consumer, three packages:
  - `common/` (`recipe-website-common`) — schema, controller, shared React
    components used by both apps.
  - `editor/` (`recipe-editor`) — the Next.js CMS: authoring UI, server
    actions, the JSON API, and the `pnpm recipes` CLI in `editor/cli/`.
  - `export/` (`recipe-website`) — the read-only static site built from the
    same content.
- `websites/portfolio`, `websites/resume-builder` — smaller consumers.

**Content lives in a separate repo.** `websites/recipe-website/editor/content`
is a symlink to it (and is gitignored here). Never commit anything under
`editor/content`, and never point a test or script at it without saying so.

## Curating recipes

The `recipe-curator` skill (`.claude/skills/recipe-curator/`) imports, cites
and groups recipes. It has exactly one command form, run **from the repo
root**:

```
pnpm --silent recipes <command> … --json
```

`--silent` keeps pnpm's script banner off stdout so `--json` output is a
single object. `pnpm --silent recipes --help` lists every command, global and
environment variable (`CONTENT_DIRECTORY`, `RECIPE_API_URL`,
`RECIPE_API_TOKEN`, `RECIPE_EDITOR_URL`, `RECIPE_AUTHOR`). Without
`CONTENT_DIRECTORY` or `--content-dir` it writes — and commits — to the real
content repo through that symlink.

## Durable docs

Read these before planning work in their areas; they are the memory that
survives a cleared context.

- `websites/recipe-website/docs/agent-curation.md` — the agent-curation phases
  (provenance, groups, the CLI, remote write, this skill): decisions, traps,
  gate results.
- `websites/recipe-website/docs/ui-overhaul.md` — the UI roadmap.
- `packages/cms/docs/incremental-regeneration.md` — how the engine
  invalidates and rebuilds derived state.

## Verification

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
pnpm exec vitest run
pnpm --filter recipe-editor e2e-dev -- <spec>
```

The suite is **Playwright**, not Cypress — `README.md`'s test section is
stale. `e2e-dev` runs against `next dev`; `pnpm --filter recipe-editor
e2e-start` builds and runs production. Prettier runs on commit via
lint-staged.

## Worktrees

A fresh worktree under `.claude/worktrees/` is missing two gitignored files,
and both gates misbehave without them: copy `editor/.env.local` (no
`AUTH_SECRET` fails ~40 e2e tests) and `export/next-env.d.ts` (without it
`tsc --noEmit` reports `TS18003`) from the main checkout first.

Killing a Playwright run mid-flight leaves stale LMDB envs (`MDB_BAD_RSLOT`,
phantom ENOENTs); recover with `rm -rf test-content test-settings test-remotes
test-clones` from `websites/recipe-website/editor`.
