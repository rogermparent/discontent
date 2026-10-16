# Epic 38 — Follow-through: reader UX, jobs and import polish, shopping v2, photo import, a content round

> **This is the durable source of truth for epic 38.** Read it before
> touching the `/drinks` page, the homepage intent tiles, the tag board and
> `/tags`, Make matching and staples, the `/jobs` page and job timeline, the
> local-model reading path (`editor/controller/llm/`), the shopping list's
> line parsing and merging, or the photo import.
> The orchestrator updates the roadmap **Status** column and the **Now**
> line at every phase boundary; workers add their phase's **Results** and
> **Traps** under their own headings. Earlier epics are cited by number with
> a prefix (`37-D4`, `36-T24`). Background: `agent-epic-37.md` (import jobs),
> `agent-epic-36.md` (the local model), `agent-epic-35.md` (the shopping
> list), `ui-overhaul.md` "Usability pass (2026-10-15)".

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** 38a ∥ 38b (wave 1).

## Context

Roger, 2026-10-16: _"Let's plan next steps."_ The 2026-10-15 usability pass
(#239, #240, #243) and epic 37 (import jobs, #237–#242) are merged; neither is
deployed yet. A sweep of the durable docs found about 39 open backlog rows.
Roger chose all four directions offered:

- reader UX follow-through;
- jobs and import polish;
- photo / recipe-card import;
- shopping list v2.

He also chose a **60-day window** for `/drinks`' seasonal row (the open
question from the usability pass) and a **small content round**.

## Decisions

### D1 — `/drinks`' seasonal row has a 60-day window

The row keeps `orderByNextOccurrence`, but shows only when the next
drink-bearing holiday is at most 60 days away (Roger's pick). One
`withinDays(today, date, n)` helper serves it and the homepage's Coming-up
window.

### D2 — Reader counts follow aliases

Tag-board counts (intent tiles, Coming up, browse chips, `/tags`) count a
recipe that carries only an alias of a term, through the same `termKeys` the
search uses. `/tags` lists a term's aliases ("also: …").

### D3 — `?import=` never runs on GET

`/new-recipe?import=<url>` prefills the form and waits for one click.
Bookmarklets and links keep working; a crawler or prefetch can't start a job.

### D4 — Shopping v2 features are switches (35-D-style)

Sub-recipe expansion is a shopping setting, **on** by default. Browser-held
ticks ("Done shopping" sends one `PATCH`) are a setting, **off** by default.

### D5 — A photo import is a transcription, then a pasted-text import

The vision model only transcribes (`vision.transcribe`). The existing
pasted-text path does the reading: the extractor, the grounding guard (against
the transcription), and the 36e several-recipe split. Each model call is its
own GPU acquire, so the model swap is logged and the placement check runs for
both. Photos live under the job's dir, never in the meta, so Retry works.
Where there is no vision model (the Pi, CI) the photo mode is hidden; CI uses
a TEST_MODE stand-in transcriber.

### D6 — The content round applies only what needs no decision

Duplicate merges and the drink rows with an obvious fix are applied on the
real repo (workstation stopped, a scratch-clone dry run first, counts before
and after recorded here). Calls that are Roger's are listed, not applied.
The content repo is never pushed from a session.

## Roadmap

| Phase    | Size | Branch                  | Status | PR  | What                                                                                    |
| -------- | ---- | ----------------------- | ------ | --- | --------------------------------------------------------------------------------------- |
| 38a      | M    | `agent/38a-reader-ux`   | 🟡     |     | D1, D2: `/drinks` window + families, tile counts, `/tags` aliases, Make matching, AA.   |
| 38b      | M    | `agent/38b-jobs-polish` | 🟡     |     | D3: dish names, `/jobs` idle refresh and Pi card, Pi jobs volume, roundup steps, queue. |
| 38c      | M    | `agent/38c-reading`     | 📝     |     | Local-model post-processing (36-T23–T36), video link follow, several JSON-LD, cache.    |
| 38d      | M    | `agent/38d-shopping-v2` | 📝     |     | D4: `OR:` lines, sub-recipe expansion, amount-less merge, browser-held ticks.           |
| 38e      | L    | `agent/38e-photo`       | 📝     |     | D5: photo / recipe-card import (vision transcribe → text import) on every surface.      |
| 38f      | S    | (content repo)          | 📝     |     | D6: duplicate merges, `lunch` → `sandwich`, drink fixes; Roger's calls listed.          |
| 38-close | S    | `agent/38-close`        | 📝     |     | Close-out, CLAUDE.md bullet, backlog rows, memory, Roger's steps.                       |

Ordering, in waves: 38a ∥ 38b (disjoint: common/reader vs editor/jobs), then
38c ∥ 38d, then 38e (the GPU and a model pull), 38f whenever the workstation
editor is stopped (content only, no heavy work), then 38-close.

## How it runs

- One orchestrating session; code phases go to worktree workers, each its own
  PR off fresh `origin/main`, opened ready after a local review. A read-only
  review agent reviews each M/L PR. Merge when every check that ran is green
  and the PR is `CLEAN`; merge commit; delete the branch. The next PR merges
  main before it merges.
- Machine memory: typecheck, vitest and builds go through
  `orchestrator/heavy.sh`, Playwright through `heavy-pw.sh`, at most two
  heavy workers at once. GPU real checks go through the orchestrator, which
  pauses the other GPU user first.

## Phases

### 38a — Reader UX follow-through (M)

- `/drinks` seasonal row: D1, in `common/components/DrinksPage/Seasonal.tsx`
  with a `withinDays` helper beside `withinComingUpWindow`.
- The ready list groups by drink family (Daiquiri ×2): one entry per family
  ("Daiquiri · 2 recipes", → `/tags/<family>`), singletons as today. A family
  is a child of `drink` not in `DRINK_STYLE_SLUGS`; the page data passes a
  slug → family map (`RecipeMatch.recipe` has no tags).
- Homepage intent tiles: a per-tile fallback in `homepageIntents` (hierarchy
  total if the slug is in the hierarchy, else the flat count); D2's alias
  counts in `readTagBoard` via `termKeys`.
- `/tags` lists aliases. The export's alias redirect stays client-side.
- Make matching: "tequila blanco" ≡ "blanco tequila" (word-order-insensitive
  two-word names, guarded; or `SYNONYMS` rows for blanco, reposado, añejo).
  Staples persist to editor settings when signed in and seed the browser; the
  export keeps the browser only.
- AA contrast on the form's submit error, the 36e picker and the roundup
  picker.

### 38b — Jobs polish (M)

- Dish names on the job page (`resultRows` reads `row.recipe.name` for
  `SplitReading` rows before "Recipe N").
- `/jobs` polls every 10 s while idle (2 s while live), paused while the tab
  is hidden.
- The `/jobs` card shows on every role; Settings → Tools stays
  workstation-only otherwise.
- `deploy:pi` mounts a host dir for `RECIPE_JOBS_DIR`.
- D3: `?import=` prefills and waits for the Import button.
- The roundup picker shows live steps from its chunk jobs (`useJobPoll`).
- Queue gaps: the save-time image fetch through `site:<host>`; the 403 drop
  list in the shared queue store; `SiteState` waiters honour tiers.

### 38c — Import reading fixes (M)

- Deterministic post-processing in the local-model path: ALL-CAPS names to
  title case (36-T25); "all in" is the total time (36-T26); an unnumbered
  method split into steps (36-T24); colon-less pasted sub-headings (36-T30);
  a source header that changes the reading (36-T23); a credit line taken as
  the only step (36-T36). Each has a unit test from the trap's real example.
- A video description with no recipe but one recipe link: follow it through
  the site queue (a `follow` step).
- A page with several JSON-LD `Recipe` nodes goes to the 36e picker.
- The last reading is cached by job spec hash in the job store, so a `--pick`
  retry after a several-recipe refusal doesn't re-run the model.
- Non-YouTube video start times (Vimeo `#t=`).

### 38d — Shopping list v2 (M)

- `OR:` lines are an alternative of the previous line, not their own row.
- Sub-recipe expansion (D4): a `[text](/recipe/slug)` line expands into the
  sub-recipe's ingredients, scaled where the amount reads, under a
  "for <sub-recipe>" note.
- Amount-less lines merge: "pinch salt" + "2 tsp salt" → "2 tsp salt + a
  pinch"; `AS_NEEDED` parts become a suffix.
- Browser-held ticks (D4), sent by "Done shopping" as one `PATCH`.

### 38e — Photo / recipe-card import (L)

- D5. `RECIPE_LLM_VISION_MODEL` (default `qwen2.5vl:7b`); `chatJson` gains
  `images?: Buffer[]` (Ollama `images`, OpenAI-style `image_url` parts).
- Surfaces: a form "Photo" mode (up to 4 images, job kind `form-photo`),
  `recipes import --photo <file…>`, `recipe_import` `photos: [path]` and
  multipart `/api/import`.
- Validation through `checkImageFile`/`readImageFile` (15 MB cap); an
  optional "use the photo as the recipe image" checkbox, off by default.

### 38f — Content round (S, real repo)

- Merges: marble rye, white chili, barbacoa ×2, arayes (the better-sourced
  one stays; features follow); `lunch` → `sandwich`.
- Drink rows with no decision: the red-wine-spritzer citation, the Sake Cosmo
  image.
- Roger's calls, listed here and not applied: the two kid-party drinks, a
  source for the Spicy Cascara Highball, the Zero-Proof Spritz, and the 51
  uncertain facet calls.

### 38-close (S)

- Close-out, the CLAUDE.md "Durable docs" bullet, backlog rows, memory,
  Roger's steps.

## Verification

- Per PR: typecheck ×2, the full vitest suite and the touched Playwright
  specs in build mode, through the heavy slot; CI green and `CLEAN`.
- 38a: `/drinks` with the make-drinks fixture shows one Daiquiri entry ×2;
  the seasonal row is hidden on a frozen date 61+ days out and shown at
  ≤ 60; tile counts include an alias-only fixture recipe; accessibility specs
  pass with the new error colour.
- 38b: a `form-url` batch's job page shows dish names; a CLI import appears
  on an idle `/jobs` within 10 s; `/new-recipe?import=` creates no job until
  the button is pressed.
- 38c: unit tests per trap example; a real-model check on a scratch clone
  (GPU coordinated) with one 36-T24/T25 paste.
- 38d: unit tests for `OR:`, expansion and the pinch merge; `shopping.spec`
  covers expansion and Done-shopping mode.
- 38e: a real check on a scratch clone (GPU coordinated): a photographed
  recipe card through `recipes import --photo card.jpg --dry-run --verbose`
  logs `vision.transcribe` then `llm.extract`, both at 100% GPU, and the
  recipe is grounded. The form's Photo mode shows live steps.
- 38f: the scratch-clone dry-run diff is reviewed before the real apply;
  each term's count before and after is recorded here.

## Traps

### 38a

- **Ta1 — NFKD splits accents off before the article cut.**
  `parseIngredientLine` runs `normalizeIngredientText` (NFKD, for the
  vulgar fractions), so "añejo" is `an` + U+0303 + `ejo`; JS `\b` sees a
  boundary after `an`, the leading-article cut takes it, and "2 oz añejo
  tequila" read as `ejo tequila`. The marks are now stripped right after
  the normalize (the name is folded later anyway). Any accented word that
  starts with `a`/`an` was affected; `crème`, `jalapeño` and `açaí` read the
  same before and after.
- **Ta2 — `toHaveCount(0)` passes before hydration.** The seasonal row is a
  client island that renders nothing until it has the browser's date, so
  "no row" is true of the server HTML too. `drinks.spec` waits for the make
  panel's island first (`panelReady`), then asserts the row is absent.
- **Ta3 — a word-order rule has real false positives.** "milk chocolate" /
  "chocolate milk" and "cane sugar" / "sugar cane" are different things in
  both orders, so "tequila blanco" ≡ "blanco tequila" is rows for the known
  age words, not a swap (Da1). "juice lemon" already meets "lemon juice"
  through the derived-form rule (`lemon` → `lemon juice`), before and after
  38a — not a word-order case.
- **Ta4 — CLI-subprocess tests time out under a loaded machine.**
  `cliJson`'s inventory case spawns five CLI processes inside a 30 s
  budget; with two other workers' heavy jobs queued it failed twice in full
  runs and passed alone and on a quieter full run. Rerun before
  suspecting the change.
- **Ta5 — the seat lowercases aliases.** `PATCH /api/taxonomies/tag/<slug>`
  with `aliases: ["Biscuits"]` stores `biscuits`, so `/tags` prints
  "also: biscuits"; a hand-written `term.json` keeps its casing ("also:
  Daiquiris" in `drinks-bar`).

### 38b

- **Tb1 — `SitePacer#request` is not re-entrant.** Its per-process line
  and its `site:<site>` slot (taken with `acquire`, not `withResource`)
  both wait for whoever holds them — the caller included. A paced request
  made inside another paced request to the same site, in one process,
  waits for itself forever. 38b's `fetchImageFilePaced` is the default
  image download of `buildRecipeWrite` and the group writes; the import
  seats never reach that default while they hold a site (they pass their
  own `fetchImage`, or the file they already fetched), and a new caller
  must not either.
- **Tb2 — a job started by a server action outlives the action.** The
  roundup picker's chunk actions now answer the job's id at once, so the
  job's writes call `revalidatePath`/`revalidateTag` after the action
  returned — 37-T26's trap, in an action instead of a route. The same fix
  holds: the action hands `done` to `after()`. `import-roundup.spec`'s
  "the imports reach the cached pages" reads `/recipes` before and after.
- **Tb3 — a paced Save waits out the gap on a real host in e2e.** Three
  `new-recipe` fixtures (`naan_prep_cook.html` and its siblings) name an
  image on kingarthurbaking.com, which Submit downloads. Paced (Db5), the
  second and third saves in a row waited 15 s for that site and missed
  their 10 s expectation. Playwright's server now runs with
  `RECIPE_POLITE_GAP_MS=0`, as vitest does; loopback fixtures were never
  paced.
- **Tb4 — `document.hidden` in a spec.** Playwright cannot hide a tab;
  `jobs.spec` redefines `document.hidden` on the document and dispatches
  `visibilitychange`, which `useSyncExternalStore` reads like the real one.
- **Tb5 — a job without a record has an id nobody can follow.** When the
  jobs dir cannot be written (37-T6), `startJob` runs the job anyway and
  `/api/jobs/<id>` answers 404 — which `useJobPoll` takes as final. A
  surface that starts a job and then follows it must check `stored` and
  await `done` instead; the roundup picker does since the review. (The
  form's import panel is 37c's and was not changed here.)

### 38c

### 38d

### 38e

### 38f

## Results

### 38a — Reader UX follow-through

**No reindex needed.** Everything here is read time: no index layout,
projection or spec version changed (`test/specVersions.test.ts` untouched).
The alias counts read rows the whole by-term maps already hold, and the
fixture indexes that moved (`drinks-bar`) moved because the fixture gained
recipes.

**What changed.**

- **D1, the seasonal row's window.** `withinDays(today, date, n)` in
  `util/holidays.ts` is the one window rule; `withinComingUpWindow` (the
  homepage, 180 days) now filters through it with no change in behaviour,
  and `nextSeasonal(items, today, 60)` is `/drinks`' pick
  (`SEASONAL_WINDOW_DAYS`). Frozen-date tests: Christmas shows on 26 October
  (60 days) and not on 25 October (61); the day after Christmas shows
  nothing (Halloween is 309 days off), and a `new-year` term crosses the
  year end (6 days); Halloween is back on 1 September.
- **Families on the ready list.** `drinksPageData` answers `familyOf`
  (recipe slug → family term) and `groupReady` (pure, beside it) turns two or
  more ready drinks of one family into one entry — "Daiquiri · 2 recipes",
  to `/tags/daiquiri` — at the place of the first of them; a family of one
  and a drink with no family stay as they were. `+N more` counts recipes,
  not entries.
- **D2, alias counts.** `termCarriers` (tagVocabulary.ts) gives
  `termHierarchy`/`termBoard` a term's carriers over `termKeys` — its slug
  and every alias slug — so `/tags`, the browse chips and the intent tiles
  count an alias-only recipe; `aliasedRows` does the same for Coming up's
  per-term rows. `/tags` prints a term's aliases under it ("also:
  Biscuits"; `TermHierarchyNode.aliases`), on a row and on a root's
  heading. One component renders `/tags` in both apps, so both have it. The
  export's alias redirect stays the client-side page it was (32i).
- **Per-tile intent fallback.** `route.tsx` reads `readTagBoard()` and
  counts each tile from the board (roots' subtrees and the loose records,
  `termTotals([...roots, ...loose])`), else from a flat vocabulary built
  from the by-term maps it already holds (`vocabularyOfRows`) — so a bare
  `quick` tag gets its tile beside a hierarchy, and a site with one reads no
  term cloud for it (`readTagVocabulary` stays only for the no-facet chips).
- **Make matching** (Da1) and **staples in the editor** (Da2), below.
- **AA contrast** (Da5): the form's submit error, the 36e picker's "not
  trusted — check it" and its error line, and the roundup picker's error
  line swap `text-destructive` for the jobs pages' rule-and-foreground
  treatment (`border-l-2 border-destructive pl-2`, foreground text; 37-T25).
  Class swaps only.

**Decisions.**

- **Da1 — agave ages are `SYNONYMS` rows, not a word-order rule.** One row
  in `ingredientNames.ts`: `tequila|mezcal` followed by `blanco`, `plata`,
  `silver`, `gold`, `joven`, `reposado`, `extra anejo` or `anejo` is read
  with the age first. A general "two words in either order" match in
  `namesMatch` was tried on paper and rejected (Ta3): tested false
  positives — "milk chocolate" vs "1 cup chocolate milk", "cane sugar" vs
  "sugar cane juice", "liqueur orange" vs "orange liqueur" and "orange
  curaçao", "blanco rum" vs "tequila blanco" — all stay unmet. `toName` and
  `parseIngredientLine` are the one pipeline under `analyzeMakeable`, so
  `/make`, `/drinks`, the homepage tile, MCP `inventory_makeable`,
  `/api/inventory/make` and `recipes inventory make` all agree. Side effect:
  the shopping list's row key for such a line is now `blanco tequila`, so
  "tequila blanco" and "blanco tequila" lines merge (a stored tick on an
  old `tequila blanco` row would not follow; the real store has none known).
- **Da2 — staples: this browser first; the editor seeds and saves.** A
  signed-in editor `/make` passes `settings.makeStaples` (per instance,
  never a mirror key, never read by the export) to `MakePage`. On the first
  load after storage is read (`staplesSync`, pure): a browser still on the
  default list takes the saved one; a browser with its own list keeps it
  and saves it when nothing is saved yet; two different lists are never
  merged (a union would resurrect what another browser removed). Every add,
  remove and Reset on the signed-in page then saves too (Reset clears the
  saved list, so it doesn't re-seed). Only "Assume I always have" is saved;
  the pantry switch and "count close matches" stay per browser.
- **Da3 — alias counts are read time.** No derived index or aggregate
  changes; the whole by-term maps already have each alias slug's row.
- **Da4 — a family is a child of `drink` not in `DRINK_STYLE_SLUGS`**, with
  its subtree and its aliases (`subtreeKeys`) — on the real repo the 56
  drink-name families of epic 33. A drink carrying two families goes to the
  one with more drinks, then by label (the order of `families`, so the
  first claim wins); the other family's chip still counts it.
- **Da5 — AA by treatment, not a token.** The newer screens have no AA
  error-text token; they keep the text in the foreground and mark it with a
  `border-destructive` rule (37-T25). The theme's `--destructive` is
  unchanged, so no baseline moved for it.

**Fixture.** The `/drinks` spec's fixture is `drinks-bar` (`make-drinks`
plus terms), so the two daiquiris went there rather than into
`make-drinks`, which `make.spec`, `bar-tools`, the homepage and the
`make-page` baseline count: a `daiquiri` family record (parent `drink`,
alias "Daiquiris"), a Daiquiri tagged `drink` + `daiquiri`, and a Classic
Daiquiri tagged only `daiquiris` — the alias-only recipe. The Gin and Tonic
gained a bare `quick` tag for the per-tile fallback. Indexes rebuilt with
`recipes reindex --content-dir` on a scratch copy.

**Gates** (2026-10-16, all through the heavy slot):

- Editor and export `tsc` clean.
- vitest 98 files, 2006 tests. New: `withinDays`, `nextSeasonal` and the
  frozen dates in `holidays.test.ts`; families and `groupReady` in
  `drinksPage.test.ts`; word order, the false positives and the NFKD fix
  in `makeable.test.ts`; `savedStaples.test.ts` (the merge rule). Two
  earlier full runs each failed one CLI-subprocess test under the machine's
  load (`cliJson` inventory, once `shopping` cap) that passed alone and on
  the final run (Ta4).
- Playwright, production build, e2e + mobile: drinks, homepage-browse,
  homepage, tag-pages, make, accessibility, visual and mobile — 145/146;
  the one was the new `/tags` test expecting "Biscuits" where the seat
  stores aliases lowercased ("also: biscuits"). Rerun of tag-pages and
  drinks with the fix: 36/36. New specs: the ready list's Daiquiri entry,
  the seasonal row gone on 26 December, the drink tile's alias count and a
  bare `quick` tile beside a hierarchy (homepage-browse), `/tags`' alias
  count and "also:" line, and the saved staples following the owner to a
  new browser (and not to a guest).
- **Baselines:** `drinks-page` (e2e + mobile) regenerated in their own
  commit — the Classics row gained Daiquiri and New drinks a sixth card.
  They had passed unchanged inside the 2% pixel budget; regenerated so the
  budget isn't spent on known content.

### 38b — Jobs polish

**Reindex needed: no.** Nothing in the content repository changes.
**Deploy:** the Pi's next `pnpm deploy:pi` mounts the jobs volume (Roger's;
not run here).

**Built.**

- **Dish names on `/jobs/<id>`** — already done by 37c's review round
  (`resultRows` reads `name`, else `recipe.name`, else "Recipe n";
  `jobSurfaces.test`'s `resultRows` case covers both shapes, and
  `jobs.spec`'s picker test reads the four dish names off the job's page).
  The 37c Results' "Misbehaved" paragraph predates that fix. Nothing more
  to do; no new test.
- **`/jobs` refreshes by itself** (`JobsDashboard.tsx`): every 2 s while
  anything is live, every 10 s while idle (`JOBS_IDLE_POLL_MS`), nothing
  while the tab is hidden (`useSyncExternalStore` over `visibilitychange`),
  and one read at once when it is shown again. Refresh still reads now.
- **Jobs on every role** (`SettingsNav.tsx`): Jobs is its own Settings item
  (`/jobs` and `/jobs/<id>` light it), shown on the workstation and the
  mirror; Tools — the yt-dlp path and the local model — stays
  workstation-only. The Tools page keeps its "See the jobs and the queue"
  card. The mirror role is `mirror` (`EDITOR_ROLE`, epic 28).
- **D3, `?import=` waits** (`new-recipe/page.tsx`, `workspace.tsx`,
  `form.tsx`): `/new-recipe?import=<url>` fills the URL field, focuses
  Import and says "Press Import to fetch this link."; no job until Import
  is pressed, which then follows at `?job=` as a typed URL does. Signing in
  from that address comes back to it. The roundup picker's "Import it as
  one recipe" link and any bookmarklet that builds the address are
  unchanged.
- **The roundup picker's live steps** (`roundupActions.ts`,
  `RoundupImport.tsx`, new `src/jobs/JobFollow.tsx`): each call is two
  actions — start (`inspectRoundupAction`, `importRoundupAction`: the job
  started, its id answered) and read (`inspectRoundupResult`,
  `importRoundupResult`: the ended job's record read back through
  `getJobView`, its error answered for a failed, cancelled or interrupted
  job). Between them the picker follows the job with `JobFollow` —
  `useJobPoll` every second, the live `StepList`, the wait in the queue, a
  "Job details" link, folded to "N steps" at the end — by the URL field
  while listing, by the progress line while importing. Stop still stops
  after the chunk in flight; a chunk cancelled from `/jobs` ends the run
  with its error and leaves Resume.
- **Queue gaps.**
  - **The save-time image fetch** goes through `site:<site>`:
    `fetchImageFilePaced` (`imageImport.ts`; it loads the pacer on first
    use, so the CLI's startup stays lazy, 35q) for the form's Save
    (`actions/index.ts`, which passed `retry: {delayMs: 0}` before) and,
    as the default `fetchImage`, for `recipe_create`/`recipe_update` and
    the group writes that name an `imageImportUrl`. Outside a job it is
    `interactive`. A 403's retry now waits the polite gap, as the form's
    page fetch has since 37b.
  - **The 403 drop list is the machine's** (`queue.ts` `readSiteDrop` /
    `writeSiteDrop`): `<queue dir>/site:<site>/dropped.json`
    (`{until, reason}`), written when a pacer on the real clock drops a
    site and read by every pacer before a request — and again once the
    slot is granted, for a drop another process wrote meanwhile. A fake
    clock keeps its drops in its `SiteState`, as before. `droppedReason`
    and `drop` are async now (`importList.ts` awaits them).
  - **`SiteState` honours tiers**: its per-process line is an explicit
    list — `interactive` waiters go ahead of every waiting `batch` one,
    first come first served within a tier — and a cancelled waiter leaves
    the line instead of holding its place until its turn.
- **Pi jobs volume** (`deploy/pi/run.sh`, `scripts/deploy-pi.sh` `--setup`,
  `deploy-pi.md`): `~/recipe-editor/jobs` at `/jobs`,
  `RECIPE_JOBS_DIR=/jobs`, `RECIPE_QUEUE_DIR=/jobs/queue`; `run.sh` makes
  the directory as the Pi user first (a Docker-made one would be root's,
  37-T6). `deploy-pi.md` has the setup line and a "What changed with epic
  38" note.
- Backlog: the eight 37 rows this phase lands are struck in
  `agent-epic-37.md` (both lists). `backlog.md` carries no epic-37 rows,
  so nothing to strike there.

**Decisions.**

- **Db1 — Jobs is a Settings item of its own**, rather than the Tools page
  shown on a mirror with only its jobs card: "Tools stays
  workstation-only" stays literally true, and `/jobs` lights its own item
  instead of Tools'.
- **Db2 — a roundup call is start + read, not one awaited action.** A
  server action cannot stream, and the picker needs the job's id while it
  runs. The answer is read back from the record on the server, so the
  outcome logic (`settleChunk`, which needs the page parsers) stays off the
  client, and the picks are re-validated there.
- **Db3 — the drop is a file of its own, `dropped.json`**, not a field of
  `state.json` as 37's backlog row suggested: `touchResource` rewrites
  `state.json` without holding the slot (a redirect's final site), and its
  read-modify-write could race a drop away. The first unexpired drop
  stands, as a process keeps its first.
- **Db4 — the Pi's queue lives in the jobs volume** (`/jobs/queue`), so a
  site's drop and its polite-gap clock survive a redeploy along with the
  records. A slot the old container held is freed by the stale rules
  (another pid namespace: 60 s), its jobs end `interrupted` after the
  ten-minute heartbeat rule.
- **Db5 — every save-time image download is paced**, not only the form's:
  `recipe_create`/`recipe_update`/group writes with an `imageImportUrl`
  are the same request to the same site. Since the review, so are
  `recipe_set_image` / `term_set_image` with a URL and a term write's
  `imageImportUrl` (`setImage`, `termImageFile`): both download before the
  write and its lock, and inside no held site (Tb1).
- **Db6 — pacing and drops key by host, not `siteKey`** (review). Once a
  drop is the machine's and outlives the process, `siteKey`'s last two
  labels reach too far: every `.co.uk` site is `co.uk`, and a CDN
  (`i0.wp.com` → `wp.com`, `*.cloudfront.net`) is one site for everyone it
  serves, so two 403s on one Jetpack image would stop every `wp.com`
  request for an hour. No public-suffix list is a dependency (`tldts` is in
  the lockfile only under tough-cookie), so `paceKey` (`roundupPage.ts`) is
  the host, less a leading `www.`; an IP or single-label host keeps its
  port, as before. `SitePacer.site()` and `settleChunk`'s dropped-pick
  match use it; `siteKey` stays for the page parsers (share targets,
  same-site-first ordering). The cost: `cdn.example.com` and
  `www.example.com` are paced apart now — two requests 15 s apart each,
  not one line — which 30-D5's "one host" allows.
- **Db7 — an image's 403s never drop a site** (review). With images keyed
  by their own host, a hotlink guard on the page's own host would still
  drop the page's site; so `SitePacer#request` / `pacedRequest` take
  `{image: true}` — every picture download and probe (`fetchImageFilePaced`,
  importList's, importRecipe's four) — which waits its turn and retries a
  403 once like any request but drops nothing. The recipe is imported
  without its picture, as before. A host already dropped still refuses an
  image request.

**Tests.** `queue.test.ts` +6 ("a site's line and its drop (38b)"): a site
dropped by one pacer is dropped for another with its own state on the same
queue dir (no request made, `dropped.json` written, another site
untouched); the first drop kept and a run-out one forgotten; a drop written
while a request waited for the slot; `SiteState` grants interactive before
batch; a cancelled waiter leaves the line; an interactive `SitePacer`
request ahead of a batch job's queued ones. `jobs.test` awaits the async
`droppedReason`. Playwright: `jobs.spec` +1 (an idle `/jobs` shows a job
another process recorded — `recordOutsideJob`, written through the store
as the CLI does — within the idle interval; none read while hidden; one
read at once when shown); `new-recipe.spec` +1 (D3: the field filled,
Import focused, no `form-url` job after the visit and a reload, one after
Import); `import-roundup.spec` +1 and changed (the chunk's job panel, the
listing's, the imports on a warmed `/recipes`; "Import it as one recipe"
now fills and waits); `settings-nav.spec` +1 and `mirror-role.spec` (Jobs
on both roles, lit on `/jobs` and a job's page; Tools still absent on the
mirror).

**Review fixes.**

- **The picker without a job store** (Tb5): `startJob` / `startSpec` say
  whether the record was `stored`; when it was not, `inspectRoundupAction`
  and `importRoundupAction` await the job and answer inline
  (`{job, answer}`, the pre-38b path) and the picker follows nothing.
  New `roundupActions.test.ts` (3): with the jobs dir under a regular
  file, listing and a two-pick import answer inline with the recipes
  already written, and a failing job's error comes back inline; with a
  store, only the id, and the result read back.
- Db5's two unpaced seats, Db6 and Db7 above. `roundupPage.test` +1
  (`.co.uk`, `i0.wp.com`, `cloudfront.net`, `www.`, `cdn.`); `queue.test`
  +1 (an image refused twice writes no `dropped.json`, and the page host is
  still asked); `importList.test`'s pies case now expects nothing dropped
  and the cake on the same site imported in the same call; three tests that
  paced `cdn.` with `www.` now use `example.com` and `www.example.com`.
- `?import=a&import=b` (or a repeated `?job=`) is ignored, not trimmed into
  a 500 (`new-recipe.spec`'s D3 test visits it first); `/jobs` stops
  polling on a 401/403, as `useJobPoll` does (Refresh still reads, and a
  good read starts it again); the picker settles a pending follow when it
  unmounts; `run.sh` gives a trial instance (`NAME=` set, `JOBS=` not)
  `~/recipe-editor/jobs-<name>`, noted in `deploy-pi.md`.
- Not done, by the review's call: a "waiting for <site>" Save button text
  (Tb3 stays a trap note).

**Gates.** `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit` clean; eslint clean on the changed
files; `pnpm exec vitest run` **97 files / 1998 tests** passed (303 s).
Playwright (build mode, heavy slot) `jobs`, `new-recipe`, `import-roundup`,
`settings-nav`, `mirror-role`, `accessibility`, `visual`: **126 / 129** in
7.2 min, the three `new-recipe` saves of a kingarthurbaking.com image
(Tb3); with the e2e gap at 0, `new-recipe` again **43 / 43** (4.6 min). No
visual baseline moved (the git page's settings sidebar included).

After the review fixes: both `tsc` gates and eslint clean; `pnpm exec
vitest run` **98 files / 2003 tests** passed (280 s); Playwright (build
mode, heavy slot) `new-recipe`, `import-roundup`, `jobs`, `settings-nav`,
`mirror-role`: **73 / 73** in 4.1 min.

### 38c — Import reading fixes

### 38d — Shopping list v2

### 38e — Photo / recipe-card import

### 38f — Content round

## Close-out
