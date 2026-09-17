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

The `recipe-curator` skill (`.claude/skills/recipe-curator/`) imports, cites,
groups and features recipes through the **`recipes` MCP server** — `.mcp.json`
registers it, `.claude/settings.json` pre-approves its 21 non-destructive
tools, and the skill's frontmatter lists the same 21. Held back, deliberately:
`recipe_delete`, `group_delete`, `unfeature`, `reindex`, `git_revert`,
`git_restore`, `git_push`. The server reads `CONTENT_DIRECTORY` (or
`RECIPE_API_URL` for a running editor, with `RECIPE_API_TOKEN`); with neither
set it writes — and commits — to the real content repo through that symlink.

The same operations exist as a CLI fallback, `pnpm --silent recipes <command>
… --json` from the repo root (`--silent` keeps pnpm's banner out of the JSON).
`pnpm --silent recipes --help` lists every command, global and environment
variable.

## Durable docs

Read these before planning work in their areas; they are the memory that
survives a cleared context.

- `websites/recipe-website/docs/agent-curation.md` — the agent-curation phases
  (provenance, groups, the CLI, remote write, this skill): decisions, traps,
  gate results.
- `websites/recipe-website/docs/agent-mcp.md` — the Recipe MCP epic (23a–23f:
  curation seats, the stdio server, nested groups, git seats, MCP over HTTP,
  the skill rewrite): decisions, traps, gate results.
- `websites/recipe-website/docs/agent-taxonomy.md` — the universal-taxonomy
  epic (24a–24f: the engine kind, site adoption, term records, search, seats,
  close-out): decisions, traps, gate results.
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
`tsc --noEmit` reports `TS18003`) from the main checkout first. The portfolio
editor needs the same `AUTH_SECRET`: `websites/portfolio/editor/.env.local`
is missing from the main checkout too, so copy the recipe editor's there before running
portfolio Playwright (`[auth][error] MissingSecret` fails every signed-in
spec otherwise).

Killing a Playwright run mid-flight leaves stale LMDB envs (`MDB_BAD_RSLOT`,
phantom ENOENTs); recover with `rm -rf test-content test-settings test-remotes
test-clones` from `websites/recipe-website/editor`.

An old worktree carries an old `editor/.next`: after a big merge Turbopack
spends minutes compacting that cache and the first request never returns, so
Playwright's `webServer` times out at 120 s while `next dev` reports "Ready".
`rm -rf websites/recipe-website/editor/.next` before the first run.
