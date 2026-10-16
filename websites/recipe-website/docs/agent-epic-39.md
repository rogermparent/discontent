# Epic 39 — Import reliability, reindex follow-through, cooking UX, unattended Pi sync, hygiene, content calls

> **This is the durable source of truth for epic 39.** Read it before
> touching the import panel's job polling, model labels in import notes and
> warnings, the reading and transcript caches, the index stamp and instance
> start, reindex or git sync as jobs, held shopping ticks, the shopping
> list's sub-recipe groups, the recipe view's headings, the mirror's view of
> a workstation conflict, `instance/notify.ts`, the Export settings page,
> `paceKey`, or resume-builder's styles.
> The orchestrator updates the roadmap **Status** column and the **Now**
> line at every phase boundary; workers add their phase's **Results** and
> **Traps** under their own headings. Earlier epics are cited by number with
> a prefix (`38-Dg9`, `28-D1`). Background: `agent-epic-38.md` (photo import,
> 38g the Claude API backend), `agent-epic-37.md` (import jobs),
> `agent-epic-29.md` (batched reindex, the deferred incremental plan),
> `agent-epic-28.md` (workstation and mirror roles, sync).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** wave 0 done (worktree cleanup); wave 1 — 39a ∥ 39c.

## Context

Roger, 2026-10-16: _"Let's plan next steps."_ Epic 38 and 38g (the Claude
API backend for the Pi's imports) are merged (main 157ae76b); the
workstation is updated and the Pi deployed on 89c3f8da. The reboot moved
Ollama to 0.40.5. The Pi's reindex printed **4.9 s** at that deploy, at
epic 29's ~5 s trigger for reopening incremental reindex. A sweep of the
backlog found about 50 open rows. Roger chose all four directions offered:

- import reliability;
- reindex follow-through;
- cooking UX;
- unattended Pi sync.

He also chose three housekeeping items: a hygiene bundle, stale worktree
cleanup, and a round of content calls.

## Decisions

### D1 — An index-version stamp rebuilds stale indexes at start

`computeIndexVersion(registry)` hashes every aggregate and pagination spec
and is written beside the indexed HEAD (`.git/discontent-index-version`).
At instance start, on either role, a version that differs from the
registry's runs one full reindex. A deploy that bumps a spec no longer
needs a manual reindex step. This is 29b's first slice; incremental
reindex (29b–29d proper) stays deferred unless 39b's measurements demand
it, and the go/no-go goes into `agent-epic-29.md`.

### D2 — Reindex and git sync are jobs

Both run as job kinds (`reindex`, `git-sync`) on a `repo` queue resource,
with named steps (per-type timings, merge outcome), so `/jobs` shows them
beside imports. A reindex can be cancelled only before its atomic swap.

### D3 — Held shopping ticks expire

Browser-held ticks (38-D4, off by default) are dropped after **7 days**
with a one-line notice, instead of living forever.

### D4 — A workstation conflict is visible on the Pi; the Pi keeps working

Within 28-D1 (the workstation is the only merger; mirrors never push): when
the workstation's sync aborts a conflict, the mirror learns it and its
`/git` and Settings say so. The Pi keeps accepting edits; they merge on the
next sync after the conflict is resolved on the workstation (the existing
behaviour, now stated).

### D5 — Notifications beyond the desktop are opt-in and service-neutral

`RECIPE_NOTIFY_URL` (a plain-text POST, ntfy-style) receives the same
attention events as the desktop notification. It is off unless set, and the
URL is redacted in logs. While a conflict stands, a reminder repeats daily.

### D6 — Export stays manual (28-D8); it only says how stale it is

The Export settings page shows "N commits since last export"; nothing
exports by itself.

### D7 — Content changes apply only what Roger approves

39f puts each call to Roger with a recommendation and applies only his
answers, by the epic-33 method (workstation stopped, scratch-clone dry run,
explicit `--content-dir`, revalidate after). Nothing is pushed.

## Roadmap

| Phase    | Size | Branch              | Status | PR  | What                                                                                     |
| -------- | ---- | ------------------- | ------ | --- | ---------------------------------------------------------------------------------------- |
| 39a      | M    | `agent/39a-import`  | 🟡     |     | Panel `stored`, model labels (38-Dg9), `--fresh`, vision digest in the transcript key.   |
| 39b      | M–L  | `agent/39b-reindex` |        |     | D1, D2: measure, the index-version stamp, reindex and git sync as jobs.                  |
| 39c      | S–M  | `agent/39c-cooking` | 🟡     |     | D3: held ticks expire, undo a sub-recipe expansion, Ingredients/Method jump anchors.     |
| 39d      | M    | `agent/39d-pi-sync` |        |     | D4–D6: conflict on the Pi, `RECIPE_NOTIFY_URL`, daily reminder, export staleness hint.   |
| 39e      | S    | `agent/39e-hygiene` |        |     | resume-builder `@source`, `paceKey` by registrable domain (38-Db6), doc/backlog hygiene. |
| 39f      | S    | (content repo)      |        |     | D7: Roger's content calls, the facet-review list.                                        |
| 39-close | S    | `agent/39-close`    |        |     | Close-out, CLAUDE.md bullet, backlog rows, memory, Roger's steps.                        |

Ordering, in waves: wave 0 (worktree cleanup, the content-call list), then
39a ∥ 39c (editor llm/jobs vs common shopping/View), then 39b ∥ 39e, then
39d (after 39b: both touch `instance/start.ts`, and 39d can show sync as a
job), 39f whenever Roger's answers are in (workstation stopped, no heavy
work), then 39-close.

## How it runs

- One orchestrating session; code phases go to worktree workers, each its own
  PR off fresh `origin/main`, opened ready after a local review. A read-only
  review agent reviews each M/L PR. Merge when every check that ran is green
  and the PR is `CLEAN`; merge commit; delete the branch. The next PR merges
  main before it merges.
- Machine memory: typecheck, vitest and builds go through
  `orchestrator/heavy.sh`, Playwright through `heavy-pw.sh`, at most two
  heavy workers at once. GPU real checks go through the orchestrator, which
  pauses the other GPU user first. No real model or API call in tests or CI.
- Never deploy, never push the content repo, never commit `editor/content`.

## Wave 0 — worktree cleanup

On 2026-10-16 the orchestrator removed 15 worktrees (36a–e, 37a–c, 37-close,
38g, the usability-pass branches and `design-homepage`): every branch was
merged into `origin/main` and every tree was clean, so `git worktree remove`
(no `--force`) and `git branch -d` were enough. It also deleted 22 merged
`worktree-agent-*` branches the harness had left. Older local branches
(`agent/28*`–`agent/30*`, `verify-main`, `main-local`, and about 75 unmerged
pre-epic branches) are Roger's to keep or delete.

## Phases

### 39a — Import reliability (M)

- **Tb5:** the single-URL panel reads `stored` from `startSpec`, so a job the
  store couldn't write doesn't 404 into "finished" (as `roundupActions.ts`
  already does).
- **38-Dg9:** warnings and commit notes name the model that answered
  (`modelLabel`), not "local model".
- **Reading-cache bypass:** `--fresh` (CLI), `fresh: true` (API/MCP
  `recipe_import`), a form checkbox on Retry; skips the cache read, still
  writes the new reading.
- **38-Te6:** the vision model's Ollama digest joins `transcribeKey`, so a
  re-pull invalidates saved transcripts (anthropic: the model name).
- **import-list** human output prints a model line per item.
- **Vision re-measure** under Ollama 0.40.5 (orchestrator, GPU): 1024 px and
  1568 px; raise the Ollama cap only if 1568 holds.

### 39b — Reindex follow-through (M–L)

- **Measure first** (scratch copy of the real repo on the workstation; the Pi
  number from Roger's next deploy); go/no-go for 29b–29d in
  `agent-epic-29.md`.
- **D1:** the index-version stamp, `versionStale` in `readIndexFreshness`,
  one reindex at instance start, shown by `git_status` and `/git`.
- **D2:** `reindex` and `git-sync` job kinds, the `repo` resource, every
  route (API, server action, CLI, the sync runner), live queue position.

### 39c — Cooking UX (S–M)

- **D3:** held ticks expire (7 days) with a notice.
- **Undo a sub-recipe expansion:** "Remove these" on a "for <sub-recipe>"
  group on `/shopping`.
- **Jump anchors:** ids on the Ingredients/Instructions headings and an
  "Ingredients · Method" row on long recipes, editor and export.

### 39d — Unattended Pi sync (M)

- **D4:** the Pi's `/git` and Settings show a workstation conflict.
- **D5:** `RECIPE_NOTIFY_URL`, redacted, opt-in; a daily reminder while a
  conflict stands.
- **D6:** "N commits since last export" on the Export settings page.

### 39e — Hygiene (S)

- resume-builder's `@source` for the component library, with screenshots
  reviewed.
- **38-Db6:** `paceKey` keys on the registrable domain.
- Doc and backlog hygiene (36d/36e statuses, 37's AA row, the "featured as a
  group kind" row, the 29 doc's Pi number).

### 39f — Content calls (S, real repo)

- D7: kid-party drinks, a Spicy Cascara Highball source, the Zero-Proof
  Spritz, the red-wine-spritzer citation, the 9.7 MB Sake-Cosmo-9.jpg; a
  regenerated facet-review list.

### 39-close (S)

- Close-out, the CLAUDE.md "Durable docs" bullet, backlog rows, memory,
  Roger's steps.

## Verification

- Per PR: typecheck ×2, the full vitest suite and the touched Playwright
  specs in build mode, through the heavy slot; CI green and `CLEAN`.
- 39a: unit tests — a `stored: false` start doesn't end the panel; a
  Claude-answered import's commit note names Claude; `fresh` skips the cache
  read; a digest change misses the transcript cache. A real photo import on
  a scratch clone, GPU coordinated.
- 39b: unit tests — the version changes when a spec changes; a stale version
  triggers one reindex at start. `/jobs` shows a reindex job with per-type
  steps, and a CLI reindex appears there. Measurements recorded here and in
  `agent-epic-29.md`.
- 39c: unit tests for held-tick expiry and remove-by-`for`; `shopping.spec`
  covers undo; a recipe-view spec for the anchors.
- 39d: unit tests — the conflict state reaches the mirror; the notify URL is
  called and logs redact it (fetch stubbed); the export hint counts. The Git
  settings spec shows the Pi banner.
- 39e: resume-builder Playwright with screenshots reviewed; `paceKey` tests
  (`a.example.co.uk` ≡ `b.example.co.uk`).
- 39f: the scratch-clone diff is reviewed before the real apply; before and
  after counts recorded here.

## Traps

### 39a

### 39b

### 39c

### 39d

### 39e

- **Te1 — an unlayered global rule beats every kit utility.**
  resume-builder's `globals.css` had `svg { width: 100%; height: 100% }`
  outside any layer; Tailwind v4's utilities live in `@layer utilities`,
  and unlayered CSS wins over any layer, so the kit's `size-4` on a lucide
  chevron lost and each one stretched across its pagination link ("Newer"
  pushed into the page number). It showed only once the `@source` fix
  emitted the kit's classes. Before adding an `@source` for the kit to a
  site, look for unlayered element rules in its `globals.css`.
- **Te2 — resume-builder's own Playwright suite was already 7 red on
  `main`**, and nothing runs it in CI (no workflow names it). The same 7
  fail before and after this phase (below); don't read them as 39e's.
- **Te3 — a dynamic `import("fs-extra")` in a Playwright spec** gives the
  CJS module under `default` (`readJson is not a function`); import it
  statically, as `support/tasks.ts` does.

### 39f

## Results

### 39a — Import reliability

### 39b — Reindex follow-through

### 39c — Cooking UX

### 39d — Unattended Pi sync

### 39e — Hygiene

**`paceKey` by registrable domain (38-Db6).**

- **De1 — `tldts`, the private section on, and a two-entry shared-host
  list.** `tldts@7.0.21` was already in the lockfile (under tough-cookie
  6), so it is now a direct dependency of `recipe-website-common` at that
  exact version: one importer entry in `pnpm-lock.yaml`, no download.
  `paceKey` (`common/util/roundupPage.ts`) is
  `getDomain(host, {allowPrivateDomains: true})`: `a.example.co.uk` ≡
  `b.example.co.uk` ≡ `example.co.uk`, `www.x.com` ≡ `cdn.x.com` ≡ `x.com`,
  `example.co.uk` ≢ `other.co.uk`. The private section keeps
  `*.cloudfront.net`, `*.github.io`, `*.blogspot.com` and
  `*.s3.amazonaws.com` tenants apart, which was Db6's worry. Two shared
  hosts the list doesn't know, `wp.com` (Jetpack's `i0`/`i1`/`i2`) and
  `wordpress.com` (one blog per subdomain), are keyed by the host as
  before (`SHARED_HOSTS`), as is a host that is itself a public suffix.
  IP literals and single labels (`127.0.0.1:4001`, `[::1]:4001`,
  `localhost:3019`) keep their port. `tldts` is server-only here:
  `roundupPage.ts` is imported only by editor controllers.
- **`siteKey`** (the page parsers: share targets, a roundup's same-site
  links first) now uses the same list, ICANN section only. It stays
  separate from `paceKey`, since grouping a CDN with its tenants is
  harmless for ordering links, but `bbcgoodfood.co.uk` no longer reads
  as `co.uk`.
- **The callers agree.** `SitePacer.site()` (the per-process line, the
  queue's `site:<key>` slot, `droppedReason` / the machine-wide
  `dropped.json`) and `settleChunk` (the picker's dropped picks) already
  called `paceKey`, so they move together. `jobs/timeline.ts` and
  `views.ts` only read the `site:` resource back. `steps.ts` and
  `ytdlp.ts` take a hostname for display, and the reading-cache keys
  (`importRecipe.ts`, `kinds.ts`) identify a page, not a site. None of
  those is a pacing key, so they stay as they are.
- **The cost.** A page's own CDN subdomain (`cdn.example.com`) now waits
  its turn behind the page, 15 s apart, where 38b paced it separately.
  That is 30-D5's "one site". Most recipe sites serve their pictures from
  the page's own host anyway. Old `site:<host>` directories and drops
  under the previous keys expire on their own (an hour, a day idle).

**resume-builder.** `globals.css`'s `@source` now points at
`node_modules/@discontent/component-library/components` (the
pre-rename path matched nothing). Screenshots of every page at 1280 and
390 px, build mode, before and after:

- **Changed, better:** `/new-resume`, `/resume/<slug>/edit`, `…/copy`
  and `/settings`. The kit's text inputs get their border and padding;
  before, they were invisible on the dark background (labels with no
  field under them). The kit's "Append Skill", the new-resume Submit and
  "Reload Database" become solid buttons where they were bare text.
- **Unchanged (byte-identical):** `/`, `/resumes` (one resume and empty),
  `/resume/<slug>`. These use only the app's own classes.
- **Regressed, then fixed:** with 25 resumes, `/resumes`' kit
  `ListPagination` (the backlog's 35q case) rendered with each chevron
  stretched by the unlayered global `svg {width: 100%}` rule (Te1). That
  rule moved into `@layer base`, after which only the paginated shots
  changed: "‹ Newer · 2" / "1 · Older ›" lay out as in the editors. The
  rule still sizes un-classed inline SVGs as before. The view page's icons
  are `<img>`, so it doesn't touch them.
- One inconsistency is left as it is. The kit's buttons are the kit's
  near-black `primary`, beside the app's own slate "Append Item" and the
  edit form's slate Submit. That's a design choice for the resume app,
  not a regression.

resume-builder Playwright (`e2e`, `next build` + `next start` on 3010):
**44 passed / 7 failed before, 44 / 7 after, and the same 7** (Te2). The 7
are create ×2, update ×2, git ×2 and view ×1. Each one expects the view
page to show the company (it doesn't render it), a Cancel link on the
edit page (there is none), or an "Update resume" commit after an edit.
They're pre-existing app/test drift, out of this phase's scope; a
backlog row records them.

**Docs.** `agent-epic-36.md`: the **Now** line, the 36d/36e roadmap rows
(✅ #234 / #235) and two rows in "What landed". `agent-epic-37.md`: both
AA-contrast rows (Backlog, Close-out backlog) struck, **Done in 38a**
(38-Da5, checked in the code: `border-l-2 border-destructive` in the
form, `BatchPicker`, `RoundupImport`, `ImportProgress`). `backlog.md`:
"Featured recipes as a group kind" struck as **superseded by taxonomy
D5**; the `paceKey` row and the resume-builder `@source` row struck,
**Done in 39e**; a new row for resume-builder's 7 red specs. The sweep for
other rows done by epics 36–38 found none still open: every 36–38 row
was already struck, and the open ones (Tb5's form panel, the reading
cache, Te6, Dg9 → 39a; held ticks → 39c; Te7, the plain-text sub-recipe,
F32 borrowing, term clouds, 2c) aren't done. The 29 doc's Pi number
belongs to 39b.

**Tests.** `roundupPage.test` (the old `.co.uk`/CDN test is replaced by
two): `siteKey`'s registrable domain, and `paceKey`'s ≡ / ≢ pairs, the
private section, `SHARED_HOSTS`, a trailing dot, a host that is a public
suffix, IPv4/IPv6/`localhost` ports. `queue.test` +1: a drop on
`a.example.co.uk` refuses `b.example.co.uk` from another process's pacer
and writes `site:example.co.uk/dropped.json`, while `other.co.uk`, the
next `wp.com` host and the next `cloudfront.net` tenant are still asked.
`roundupPicker.test`: the dropped-pick case now keys on `example.co.uk`,
and `other.co.uk` goes back on the queue.

**Gates.** `recipe-editor` typecheck clean; `recipe-website` `tsc
--noEmit` clean; `pnpm exec vitest run` **105 files / 2195 tests**
passed; resume-builder Playwright as above (twice more for the
pagination fix: the screenshot spec 18/18 and the full run with the same
44 + 7); `import-roundup.spec` (build mode, e2e + mobile) **5/5** — the
picker's pacing path; its fixtures are loopback, whose keys are
unchanged.

### 39f — Content calls

## Close-out
