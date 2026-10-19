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
registers its 59 tools, `.claude/settings.json` pre-approves its 45
non-destructive ones, and the skill's frontmatter lists the same 45. Held back,
deliberately (the other 14):
`recipe_delete`, `group_delete`, `term_delete`, `term_merge`, `unfeature`,
`reindex`, `git_revert`, `git_restore`, `git_push`, `git_pull`, `git_sync`,
`inventory_set`, `shopping_clear`, `shopping_settings_set`. `git_fetch` is
pre-approved: it moves only remote-tracking refs; so are `job_list` and
`job_get`, which read the import job store, and `holiday_list` and
`holiday_get` (42h), which read the holidays. The server reads `CONTENT_DIRECTORY` (or
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
- `websites/recipe-website/docs/agent-epic-37.md` — epic 37, import jobs
  (closed): every import runs as a job with a structured step log (JSON
  lines, named steps, redaction) in `RECIPE_JOBS_DIR`, a machine-wide,
  cross-process queue per contended resource (the GPU, yt-dlp, each site)
  with GPU hooks and a placement check, the `fileLock` primitive, the
  form's live import panel, and the `/jobs` page, API, CLI and MCP
  surfaces (37a–37c, 37-close).
- `websites/recipe-website/docs/agent-epic-38.md` — epic 38, follow-through:
  reader UX (the /drinks 60-day seasonal window and drink families,
  alias-aware counts, /tags aliases, agave ages in Make, staples saved in
  the editor), jobs polish (dish names, idle /jobs refresh, Jobs on every
  role, `?import=` on click, roundup live steps, host-keyed pacing), import
  reading fixes (deterministic tidy rules for 36-T23–T36, several JSON-LD
  recipes, a video's recipe link, the kept reading, Vimeo starts), shopping
  v2 (`OR:` lines, sub-recipes, pinch merge, Done shopping), photo /
  recipe-card import (qwen2.5vl transcription then the text path; 1024 px
  cap) and a content round (38a–38f). Roger's steps (workstation update,
  `RECIPE_LLM_VISION_MODEL`, optional Pi deploy, no reindex) are in the
  doc's Close-out.
- `websites/recipe-website/docs/agent-epic-39.md` — epic 39: import
  reliability (an unstored job's panel, the model named in notes and
  warnings, `--fresh`, the vision digest in the transcript key; 1568 px
  still crashes the vision runner), reindex follow-through (an index-version
  stamp that rebuilds stale indexes at start, reindex and git sync as jobs
  on a per-repo queue line, the 29b–29d no-go), cooking UX (held ticks
  expire, undo a sub-recipe expansion, jump anchors), unattended Pi sync
  (the Pi sees a workstation conflict, `RECIPE_NOTIFY_URL`, export
  staleness), hygiene (`paceKey` by registrable domain, resume-builder
  `@source`) and content calls (39a–39f). Roger's steps (workstation
  update, 38g key lines, Pi deploy, optional notify URL; no manual reindex)
  are in the doc's Close-out.
- `websites/recipe-website/docs/agent-epic-40.md` — epic 40: the local
  model's context sized to the input and honest placement wording (40a),
  resume-builder green with its own CI job and portfolio on Turbopack (40b),
  `shopping remove --for`, a bounded rebuild retry, Select/Checkbox on Radix
  and the `/export` actions fix (40c), term clouds measured — a no-go with a
  reopen trigger (40d), a Thanksgiving round (40e), CI flakes fixed at the
  root with `expectHydrated` (40f), axe coverage for the remaining pages
  (40g), patch/minor dependency updates (40h); and the overnight OOM that
  put every heavy job in a memory-capped scope and baselines in Docker.
  Roger's steps and the "Roger to confirm" list are in the doc's Close-out.
- `websites/recipe-website/docs/agent-epic-41.md` — epic 41: incremental
  reindex measured and re-deferred (Pi warm 3.72 s, reopen ~1,050 recipes),
  a write gate for test resets and a CI job building the main checkout's
  symlink shape, zod / markdown-to-jsx / simple-git / sharp holds lifted,
  `--input` at 3:1 and WCAG 2.2 AA, React 19.3 / Tailwind 4.3 / Playwright
  1.64 / Prettier 3.9 (`.git-blame-ignore-revs`), Thanksgiving extras, and
  the Make page redesigned (41h: the question as the title, tape labels,
  Count from, featuring by the matcher) with its MCP/CLI parity (41i).
  Overnight design-variant canvases for four pages are linked in the
  Close-out.
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

The suite is **Playwright**; the root and recipe-website READMEs' test
sections say how to run it. `e2e-dev` runs against `next dev`; `pnpm
--filter recipe-editor e2e-start` builds and runs production. Prettier runs
on commit via lint-staged. A spec that interacts with a server-rendered
control right after a full page load waits for it to hydrate first —
`expectHydrated` in `playwright/support/hydration.ts` (40f) — or the click
is lost, a controlled `<select>` resets, or a form posts natively.

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
