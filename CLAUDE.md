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
registers its 55 tools, `.claude/settings.json` pre-approves its 41
non-destructive ones, and the skill's frontmatter lists the same 41. Held back,
deliberately (the other 14):
`recipe_delete`, `group_delete`, `term_delete`, `term_merge`, `unfeature`,
`reindex`, `git_revert`, `git_restore`, `git_push`, `git_pull`, `git_sync`,
`inventory_set`, `shopping_clear`, `shopping_settings_set`. `git_fetch` is
pre-approved: it moves only remote-tracking refs. The server reads `CONTENT_DIRECTORY` (or
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
- `websites/recipe-website/docs/agent-mixology.md` — epic 25, the drinks
  track: the `drink` spec on recipes, drink styles as tag terms, bar
  inventory.
- `websites/recipe-website/docs/agent-import-tools.md` — epic 26, import
  tooling (26a–26c: page parsing and image ranking, the SEO fallback, yt-dlp
  server-side, checked image downloads, `inspect` / drafts / the `image`
  seat, the import UI): decisions, traps, gate results.
- `websites/recipe-website/docs/agent-epic-27.md` — epic 27 (27a–27d: CI
  hygiene, Pi content sync and token scopes, bar tools, search ranking and
  the legacy "Imported from" migration): decisions, traps, gate results.
- `websites/recipe-website/docs/agent-epic-28.md` — epic 28: workstation and
  mirror roles, event-driven sync (workstation startup, ref watcher, mirror
  pings), reindex on foreign HEAD moves, git-annex for large media; phases
  28a–28f.
- `websites/recipe-website/docs/agent-epic-29.md` — epic 29: faster reindex —
  a batched, atomic full rebuild and its measurements (29a, Pi 13.5 s →
  2.5 s); incremental reindex from the git diff (29b–29d) is planned but
  deferred, with the trigger for reopening it.
- `websites/recipe-website/docs/agent-epic-30.md` — epic 30: readers that
  never create indexes (F30) and other engine hygiene, accent contrast in the
  cyan/teal band, group thumbnails on ⌘K and `/search` from the corpus, and a
  content round under a polite-scraping rule (30a–30d).
- `websites/recipe-website/docs/agent-epic-31.md` — epic 31: the taxonomy
  finished (24d hierarchy-aware search, 24e term seats/CLI/MCP, a term edit
  form), F32 group items that follow renames, curation and import polish
  (image size, polite 403 retry, feature dedupe), and a content cleanup
  (31a–31f).
- `websites/recipe-website/docs/agent-epic-32.md` — epic 32, an unattended
  sequential run: features that follow a deleted term or group, term image
  upload, F34 one commit per multi-carrier term write, the by-term record
  measured and split (24g), ingredient completion in search, meal-plan item
  `scale`, a type-agnostic Make page, `SidebarLayout` on sticky-chrome,
  search-only term aliases, and a proposed food vocabulary (32a–32k). Closed
  2026-10-10; its morning checklist (pull, workstation update, real-repo
  reindex, Pi deploy) is in the doc's Close-out.
- `websites/recipe-website/docs/agent-epic-33.md` — epic 33, the food
  vocabulary (32k + the 24f backfill): four facet roots (course, main
  ingredient, cuisine, speed & effort) applied to the real repo, quick vs
  easy defined, the drink `spirit` root and drink-name families; method,
  counts, and the workstation-sync lock trap for scripted real-repo runs.
- `websites/recipe-website/docs/agent-epic-34.md` — epic 34: facets
  follow-through (term pages list their subtree, curator skill v4, renames
  keep the old slug), engine write safety (ULID write ids, a cross-process
  write lock, private-index commits with a CAS on HEAD, atomic file writes,
  the `busy` code), roundup ("meta-list") import with a Sally's preference,
  and a seasonal content round (34a–34f).
- `websites/recipe-website/docs/agent-epic-35.md` — epic 35: the shopping
  list (amounts, aisles, a shared per-item store in the content repo, every
  feature a switch, `/shopping`), Halloween and Christmas content rounds,
  curation polish (`term assign` unknown slugs, root-page pins, the CLI
  loading `editor/.env`, the roundup picker) and editor hygiene (F6/F7
  paging, lazy CLI startup).
- `websites/recipe-website/docs/agent-epic-36.md` — epic 36: local-model
  recipe imports (Qwen via Ollama, workstation only, `RECIPE_LLM_*` in
  `editor/.env`): page text, the extractor and its grounding guard, the
  `--llm auto|force|off` mode on every import surface, and a pasted-text
  import mode (36a–36c), and 36d: a video URL's pinned comment and tags,
  and a form that says "give it the URL"; 36e: several recipes in one
  video or paste (`--all` / `--pick`, a picker, linked components, chapter
  starts). Roger's steps (`RECIPE_LLM_URL`,
  workstation update, no reindex) are in the doc's Close-out.
- `websites/recipe-website/docs/agent-epic-37.md` — epic 37, import jobs:
  every import runs as a job with a structured step log (JSON lines, named
  steps, redaction) in `RECIPE_JOBS_DIR`, a cross-process queue per
  contended resource (the GPU, yt-dlp, each site) with GPU hooks and a
  placement check, the `fileLock` primitive, and the `/jobs` page, API, CLI
  and MCP surfaces (37a–37c).
- `websites/recipe-website/docs/deploy-pi.md` — `pnpm deploy:pi`: the arm64
  editor image built here, run on the Pi `uraninite` with `docker run`,
  indexes built here and swapped in; setup, rollback, traps, and the proposed
  workstation/mirror roles.
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
test-clones test-jobs` from `websites/recipe-website/editor`.

An old worktree carries an old `editor/.next`: after a big merge Turbopack
spends minutes compacting that cache and the first request never returns, so
Playwright's `webServer` times out at 120 s while `next dev` reports "Ready".
`rm -rf websites/recipe-website/editor/.next` before the first run.
