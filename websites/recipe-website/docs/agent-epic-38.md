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

**Now:** closed (2026-10-16).

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

| Phase    | Size | Branch                  | Status | PR            | What                                                                                    |
| -------- | ---- | ----------------------- | ------ | ------------- | --------------------------------------------------------------------------------------- |
| 38a      | M    | `agent/38a-reader-ux`   | ✅     | #246          | D1, D2: `/drinks` window + families, tile counts, `/tags` aliases, Make matching, AA.   |
| 38b      | M    | `agent/38b-jobs-polish` | ✅     | #245          | D3: dish names, `/jobs` idle refresh and Pi card, Pi jobs volume, roundup steps, queue. |
| 38c      | M    | `agent/38c-reading`     | ✅     | #247          | Local-model post-processing (36-T23–T36), video link follow, several JSON-LD, cache.    |
| 38d      | M    | `agent/38d-shopping-v2` | ✅     | #248          | D4: `OR:` lines, sub-recipe expansion, amount-less merge, browser-held ticks.           |
| 38e      | L    | `agent/38e-photo`       | ✅     | #249          | D5: photo / recipe-card import (vision transcribe → text import) on every surface.      |
| 38f      | S    | (content repo)          | ✅     | — (no writes) | D6: duplicate merges, `lunch` → `sandwich`, drink fixes; Roger's calls listed.          |
| 38-close | S    | `agent/38-close`        | ✅     | #250          | Close-out, CLAUDE.md bullet, backlog rows, memory, Roger's steps.                       |
| 38g      | M    | `agent/38g-claude-api`  | 🟡     |               | Post-close: the Claude API as a third model style, for the Pi's imports (Dg1–Dg10).     |

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
  ("Daiquiri · 2 drinks", → `/tags/<family>`), singletons as today. A family
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
  same before and after. The amount reader had the same trap ("añejo
  tequila, to rinse" read as one of something, `an` = 1): review fix,
  both readers now go through one normaliser, `readableLine`
  (`ingredientNames.ts`). `normalizeIngredientText` itself keeps its
  accents — the form's stored text and the LLM extractor use it.
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
- **Ta6 — `settings.json` was truncate-then-write.** `outputJSON` empties the
  file first, and `readSettings` answers `{}` for a file that doesn't parse,
  so a read-modify-write that landed in another writer's window (the Pi's
  `PUT /api/settings/site` after a sync, the theme form, a staples save
  from a second device) wrote back only its own key and wiped theme,
  mirrors and the rest. Review fix: `writeSettings` is atomic (temp +
  rename), and `updateSettings(fn)` (`@discontent/cms/settings`) holds a
  `fileLock` at `settings/.settings.json.lock` for the read and the write,
  and throws on an unparseable file rather than writing over it. The
  staples action, the mirror actions and the site-settings route use it;
  the settings forms only gained the atomic write.

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

- **Tc1 — "min." does end sentences.** The backlog row said to mind "min."
  and "approx." in a sentence split, but Aunt Carol's own paragraph (36-T24)
  breaks twice right after one: "cook the onion … maybe 5 min. put
  everything back in … simmer 45 min. shred the chicken". So the time
  abbreviations (min, hr, sec, etc) end a sentence unless the next word
  carries it on ("or", "until", "then", a digit, "("); only the never-final
  ones (approx, tsp, tbsp, oz, lb, e.g., a single letter) never do.
- **Tc2 — The model's copy of the line after a heading is not verbatim.**
  On Sally's card the line after "Icing" is "1 and 1/2 cups (180g) sifted
  confectioners’ sugar\*"; qwen3:8b copied it as "1 1/2 cups …". Finding the
  heading in the source by the line that follows it has to compare words
  (60% of the copy's words on the source line), not substrings.
- **Tc3 — A reading key needs the model server, not just the model name.**
  The unit tests point one model name (`qwen3:8b`) at different stand-in
  servers (one that reads, one that invents) over the same text; keyed by
  name alone, the second test reused the first one's reading. The key
  carries `RECIPE_LLM_URL` too — in real use it never changes.
- **Tc4 — The stand-in model names a slice by its first line, in
  capitals** ("LEMON CAKE"). The T25 rule now title-cases a single reading
  of it; in a batch the list's name ("Lemon Cake") wins, as before, so no
  existing expectation moved.
- **Tc5 — `--llm` is refused with `--text`.** Text always goes through the
  local model (there is nothing else to read it with), so `--llm
force`/`auto`/`off` on a pasted-text import is a usage error, not a mode
  switch — the real-model check's first command line was wrong for saying
  otherwise.

### 38d

- **A link text the grammar reads as no name is no sub-recipe.** The check
  reads the link's text as an ingredient name; text that is a modifier or a
  unit ("Level 1", "Large Batch", a lone "B") reads as nothing, and the line
  stays as written — silently, with no warning. Real sub-recipe names are
  dish names; the unit tests had to rename their placeholders.
- **An editor without 38d drops `for` when it rewrites an item.**
  `parseShoppingItem` keeps known keys only, so a tick saved by the Pi before
  its deploy rewrites an expanded line without its "for Simple Syrup" note.
  The line itself stays. Likewise `shopping settings set features.subRecipes`
  (or `holdTicks`) with `--remote` against such an editor is `validation`
  (the strict schema), as 35p's `--force` was.
- **Next's route announcer is a `role="alert"` too**: a Playwright
  `getByRole("alert")` on `/shopping` needs a text filter.
- **The fixture reindex touches every LMDB file**: rebuild the one fixture's
  recipes index only (`rebuildIndex` per type, not
  `build-fixture-indexes.ts`, which rewrites every fixture), restore the
  `lock.mdb` files and untouched types from git, and delete the
  `.pagination-changes.json` it leaves (35d's trap).

### 38e

- **Te1 — `keep_alive: 0` on the call would hide the placement.** Ollama
  unloads a model sent with `keep_alive: 0` as soon as it has answered, so
  the placement check's `/api/ps` right after it finds nothing to read. The
  transcription keeps the usual keep-alive, reads the placement, and only
  then unloads the vision model with its own request (`unload`, an
  `llm.unload` step) — still inside the `gpu` hold.
- **Te2 — a file input cannot be filled back.** React 19 resets the import
  form after its action (36-T27), and a file input is not controllable, so
  the chosen photos live in the form's state, the input only adds to the
  list (it clears itself), and the action wrapper appends the state's
  photos to the `FormData`. The same reason keeps "use the photo as the
  recipe's image" client-side: the image field starts holding the photo
  through a `DataTransfer` (`ImageInput`'s `initialFile`), which only a
  live page has — a `?job=` reopened later fills the form without it.
- **Te3 — two fixture JPEGs of nearly one colour are one file.** A test
  making "different" photos by shifting a solid colour by one step got
  byte-identical JPEGs (quantised the same), so the content-named store
  saw one photo. The tests' cards differ by tens of steps.
- **Te4 — the stand-in keys a photo by the bytes it is sent.** Every photo
  is re-encoded before it is sent (Te5), so a fixture's own hash never
  arrives: the stand-in's transcripts are keyed by `sentPhotoKey` — the
  hash of `photoForVision(bytes)`, the seats' own code in the
  dependency-free `llm/photoPrep.ts` — and `photoTranscripts` is async.
  One `sharp` (0.34.5) serves the tests, the CLI child and the editor, so
  the re-encoded bytes agree.
- **Te5 — a larger photo crashes the vision model's runner; it then stays
  broken.** The orchestrator's real-GPU run (RX 6600 8 GB, Ollama 0.34.3
  on Vulkan, `qwen2.5vl:7b` 5.4 GB at 100% GPU, ctx 4 096, a fresh load
  each): the 1833×1217 rendered card, sent unchanged because it was a
  small upright JPEG under the old 1600 px cap, and a 1280×850 one
  (1.09 MP) both ended with `{"error":"model runner has unexpectedly
stopped … vk::Queue::submit: ErrorDeviceLost"}`; 1024×680 (0.70 MP,
  1 111 prompt tokens) read verbatim, 99 output tokens, 16.3 s with the
  load; 896 px likewise, 16.3 s. Two 1024 px pages in one call: 2 116
  prompt tokens, 26.2 s, verbatim, in order — four would overflow 4 096.
  After a crash every request answered `{"model":"","message":{"role":"",
"content":""},"done":false}` at once until `ollama stop`. And the
  client had read that crash as "the vision model read no text". So:
  every photo is fitted inside 1024 px and 0.75 MP and re-encoded as a
  JPEG (`PHOTO_MAX_SIDE`, `PHOTO_MAX_PIXELS`); one call per photo (De4);
  an `error` body (any status) or an empty `done: false` is an
  `LlmError` carrying the server's words (capped at 200 characters,
  37-D2), marked `runnerFailed`; and `chat()` unloads the model
  (`keep_alive: 0`, an `llm.unload` step with `reason: "runner failed"`)
  before it reports — for the text model too. A 5xx whose body is not
  Ollama's `{"error": …}` (a proxy's page) is not taken for one.
- **Te6 — a kept transcript is keyed by the model's name.** De5 reuses a
  transcript made by the same model name and prompt hash
  (`transcribeKey`: the prompts, the size caps, the context); weights
  re-pulled under the same name reuse it. Delete
  `<jobs dir>/photos/*.transcript.json` to read the photos again.
- **Te7 — `RECIPE_LLM_API=openai` against Ollama's `/v1` unloads
  nothing.** The unload, the D6 reload and the placement check are
  Ollama-API requests (`/api/generate`, `/api/ps`); through the
  OpenAI-compatible endpoint none of them runs, so the vision model stays
  loaded beside the text model until Ollama evicts it, and a crashed
  runner is not unloaded. Use `RECIPE_LLM_API=ollama` (the default) with
  Ollama.

### 38f

- **Tf1 — bare `curl` gets Cloudflare's JS challenge on acouplecooks.com,
  even with the importer's UA.** A direct `curl -A "<importer UA>" …`
  against `acouplecooks.com` answers Cloudflare's JS-challenge page (403);
  the CLI's `inspect` (Node `fetch`, the same code path a real import
  uses) gets 200 on the same URL. Check a page's content through `recipes
inspect`, not a bare `curl`, before concluding a source is unreachable.

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
  more ready drinks of one family into one entry — "Daiquiri · 2 drinks",
  to `/tags/daiquiri` — at the place of the first of them; a family of one
  and a drink with no family stay as they were. `+N more` counts recipes,
  not entries. The entry's count is the family's _ready_ drinks; the term
  page it links to lists all of them.
- **D2, alias counts.** `termCarriers` (tagVocabulary.ts) gives
  `termHierarchy`/`termBoard` a term's carriers over `termKeys` — its slug
  and every alias slug — so `/tags`, the browse chips and the intent tiles
  count an alias-only recipe; `aliasedRows` does the same for Coming up's
  per-term rows. `/tags` prints a term's aliases under it ("also:
  Biscuits"; `TermHierarchyNode.aliases`), on a row and on a root's
  heading — only the ones `termKeys` counts (`ownAliases`: an alias that is
  another record's own slug is left out). An alias slug is no bare tag:
  `TagBoard.aliased` keeps it out of `/tags`' chips and the homepage's
  no-facet chips (review fix; a term carried only through an alias still
  gets its homepage chip). One component renders `/tags` in both apps, so both have it. The
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
  the pantry switch and "count close matches" stay per browser. The saved
  list is **per editor instance, not per user**: a guest's signed-out edits
  are this browser's, and upload as the owner's list on the next sign-in
  when nothing is saved yet. Saves are capped at the action's limits (200
  items, 200 characters each — `stapleLimits.ts`); a refused or failed save
  shows one quiet line under the list and leaves the browser's list as it
  is. The action revalidates `/make`, so a later visit isn't seeded from a
  stale payload (a Reset undone), and writes nothing for an unchanged list.
- **Da3 — alias counts are read time.** No derived index or aggregate
  changes; the whole by-term maps already have each alias slug's row.
- **Da4 — a family is a child of `drink` not in `DRINK_STYLE_SLUGS`**, with
  its subtree and its aliases (`subtreeKeys`) — on the real repo the 56
  drink-name families of epic 33. `familyOf` lists every family a drink
  carries, most drinks first, then by label; the ready list puts a drink in
  two families with the one that has more _ready_ drinks, then more drinks,
  then by label (review fix — so a Hemingway Daiquiri joins two ready
  Daiquiris instead of standing alone). The other family's chip still
  counts it.
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
- **Review fixes** (after merging main at #245): editor and export `tsc`
  clean; vitest 99 files, 2019 tests, one `cliJson` inventory timeout at
  30.15 s (Ta4) that passed alone (23/23). New: `settingsStore.test.ts`
  (no truncated reads, concurrent updates keep every key, no write for no
  change, an unparseable file refused, the staples action), `ownAliases`
  and `TagBoard.aliased`, the ready-first family pick, `capStaples`,
  `readableLine` and `parseAmount` on "añejo". Playwright, production
  build: tag-pages, drinks, make, homepage, accessibility — 108/108
  (103 e2e, 5 mobile).
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

Branch `agent/38c-reading`. Five pieces, each with its unit tests
(`test/tidyReading.test.ts`, `test/importReading.test.ts`, Vimeo in
`test/multiRecipe.test.ts`).

**Decisions**

- **Dc1 — The fixes are a `tidy` pass over the model's raw answer, logged
  per change.** `controller/llm/tidyReading.ts` holds one function per trap;
  `tidyReading` runs them in order (credit lines, the method split, the
  headings, the name, the times) on a copy of the answer **before**
  `readLlmAnswer` — a step's line breaks are still there, and the times are
  still the text's words. Every change is a `tidy` note in the job's log
  (`[job …] tidy: T24: split the one-step method into 5 steps at its
sentence breaks`, data `{rule, trap}`), and the `llm.extract` step's end
  carries `tidied: [rules]`. Not a new named step: no time passes, and a
  note sits under the reading it fixed. A batch's names from the list get
  the T25 rule too (a `tidy` note with the slice's `part`). `parseTimeText`
  moved to `llm/timeText.ts` (re-exported from `extractRecipe.ts`) so the
  rules need not import the extractor.
- **Dc2 — 36-T23 is fixed before the model: a paste's prompt names no
  URL.** The trap: the same pasta-salad paste read 27/27 with both headings
  alone and 25/26 without "Pasta Salad:" once `--source` added one
  "Source URL:" line to the prompt (T1). The URL told the model nothing the
  text did not, so a pasted text's prompts — the reading, the list, the
  one-dish question — leave it out (`LlmSource.pasted`, `urlInPrompt`);
  `source` (and `video`) are still cited from it. Pages and videos keep
  the line: their readings were measured with it (36a, 36d).
- **Dc3 — Each rule acts only on its trap's own shape.**
  - T36 `creditSteps`: a step that opens like a credit ("Thanks to …",
    "Recipe adapted from …", "… for the recipe inspiration") **and** has
    no verb of cooking is dropped. The muffins then read "it found no
    instructions" — untrusted, and under auto for a video kept with that
    warning (36-T21) instead of trusted on a credit line.
  - T24 `splitMethod`: only when the whole method is **one** step: cut at
    its line breaks, else at its sentences when there are at least three
    (or two and 200+ characters) — words unchanged, Tc1's abbreviations
    minded. A short "Shake with ice. Strain." stays one step.
  - T30 `colonlessHeadings`: an amount-free, colon-less line of at most
    five words, capitalised, standing alone on its own line in the source
    with the next ingredient's line after it, followed by an amount-led
    line — and either named like a part (`PART_WORDS`: icing, frosting,
    glaze, filling, dough, crust, preferment… — not sauce, syrup or
    dressing, which are bought as is), or "For the …", or set apart by a
    blank line inside a list whose lines otherwise run together, in title
    case or capitals. "Hot sauce" and "Salt" inside a list stay
    ingredients.
  - T25 `capsName`: only a name whose every cased letter is upper case;
    title case with small words lower ("Fried Shallots (For the
    Casserole)"), hyphenated parts each capitalised, a short vowel-less word
    kept ("BBQ", "BLT"), a trailing colon and "RECIPE" dropped. "SOURDOUGH
    ENGLISH MUFFIN RECIPE | Super Fluffy!" is left alone.
  - T26 `allInTime`: the source must hold exactly one short clause (≤ 12
    words) that ends in "all in", or says "all-in" or "start to finish",
    with a time in it; the model must have read no total, and its prep or
    cook time must equal that clause's time — which then moves to the
    total. It never adds a time the model did not read.
- **Dc4 — A page's own recipes are a batch; the model is not asked.**
  `mapRecipeNodes` (common `importRecipeData.ts`) keeps the page's own
  Recipe nodes: ones with a body (ingredients and steps), not a card for
  another page (a `url` whose page is not this one — a related-recipes
  carousel), a repeated node once (same name and ingredients). Two or more
  go through `schemaReadings` to the 36e contract: the form's picker ("This
  page holds 2 recipes"), `--pick` / `--all` on the CLI and MCP, the
  refusal "The page … has 2 recipes: …", `inspect`'s `recipes`. Each
  reading is trusted and has no `llm` (`SplitReading.llm` is optional now);
  each recipe's own `image` leads its pictures; commits say "(2 of 2 from
  example.com/…)" without "local model". The model is not asked whatever
  the mode (a page is never split by the model; under `force` a warning
  says so), and `asOne` maps the first node, then the model as the mode
  says — today's behaviour. Roundup items (`import-list`) still take the
  first node.
- **Dc5 — Following a video's recipe link.** `curation/videoFollow.ts`:
  only when the model read the video and answered (no failed call) with no
  recipe body and no batch; the links are the description's and the
  creator's comments'; a link counts when its path, its line, or one of
  the two lines above it (up to another link) says "recipe"; **any host**
  — a creator's recipes live on their own site — except a deny list
  (video and social sites, tip jars, shops and affiliate links, link
  shorteners, music credits). Exactly one such link is followed (two or
  more: a `follow` note, none followed), once, through `importPage` — the
  URL path: the site's queue and polite gap (30-D5), its schema or its own
  model reading and D4 grounding. A `follow` step logs the URL. The page's
  recipe keeps its `source` (where the recipe is written, 36-D5); the
  video is its `video`, and its thumbnail the picture when the page has
  none. A page that fails or holds no recipe keeps the bare video, with a
  warning saying what was tried. `inspect` answers `followed: <url>`. With
  no model, or `off`, nothing is followed (the description was not read).
- **Dc6 — The reading is kept by spec, in the job store, for half an
  hour.** `jobs/readingCache.ts`: `<jobs dir>/readings/<key>.json`, one
  per key, overwritten; the key hashes the spec's reading half (the URL,
  or the text and its source; the mode; `asOne`), the model's name, API
  and server (Tc3), and a reading version — a hash of every prompt and
  schema plus `READING_CODE_VERSION` ("38c-1", bumped when the tidy rules,
  grounding or split change what a reading is). `pick`, `all`, `dryRun`,
  tags, slug and name are not in it, so a refusal, a dry run and the
  `--pick` after them share one reading. Reused for 30 minutes
  (`READING_MAX_AGE_MS`; the backlog asked for "a few minutes" — the retry
  is minutes away, and a description edited since is read again), removed
  by `pruneJobs` past that. Kept only when the model answered (no model,
  `off`, a failed call or a page's own schema keep nothing). Only the
  `import-url` / `import-text` job kinds use it (CLI, API, MCP); the form
  never re-reads. A reuse is a `reading` note and a warning ("the local
  model's reading from 2 min ago (job 01J…) was reused, not read again").
- **Vimeo start times.** `withVideoStart` writes Vimeo's fragment,
  `#t=<s>s` (clears it for no chapter), `videoStartSeconds` reads `#t=`
  and `?t=` on Vimeo (YouTube's rules unchanged), and the recipe page's
  player seeks there once the metadata is in (`VideoPlayer`'s new `start`,
  since `vimeo-video-element` builds its own embed URL and drops the
  fragment). Not run in a browser: no spec can reach Vimeo.

**Review fixes** (a second pass, as new commits on the same branch):

- **Blocker, SSRF — `recipeLinks` never follows a private-network link.**
  `videoFollow.ts` now calls the roundup's `isPrivateHost` (RFC 1918,
  loopback, CGNAT, link-local, IPv6 ULA/link-local, `localhost`) on every
  candidate, before the deny list: a description link to `192.168.x.x` or
  `127.0.0.1` is dropped, even unpaced (`sitePacing.ts`'s own loopback
  check is narrower and does not cover it).
- **Dc7 — A page over `MAX_BATCH_RECIPES` (30, the same bound the batch
  picker already enforces) is capped, not refused.** `schemaReadings`
  keeps the first 30 of a page's Recipe nodes and adds a warning saying
  so, rather than a second picker path for a roundup-style index that
  marks up every card as its own Recipe — simpler, and the first nodes are
  usually the page's own rather than a related-posts carousel's.
  `batchActions.ts`'s `BATCH_MAX` now imports this constant instead of its
  own `30`, so the two can never disagree.
- **`pageRecipeNodes` dedupes by ingredients, not name.** A node repeated
  under a slightly different name ("Best Lemon Cake" vs "Best Lemon Cake
  Recipe" — a plugin's graph and the theme's own markup) is now one
  recipe: normalised ingredient lines, ≥ 80% the same between the shorter
  list and the longer one.
  (This _is_ "the same name and ingredients" bullet under Dc4 above — read
  it as revised, not superseded.)
- **`colonlessHeadings` (T30) no longer eats a bought-as-is ingredient
  that ends in a part word** ("Store-bought pizza dough", "Fresh herbs,
  for garnish"). Named a part only when the whole line _is_ the part word
  (optionally "the <part word>") or "For the …" — never by its last word
  alone — and requires at least two amount-led lines after it, not one.
- **`splitMethod` (T24) fixes two real misreads.** `sentences` never ends
  on "in."/"cm."/"mm." when a number precedes it, attached ("9-in.") or as
  the word before ("9 in.") — it was cutting a pan size in two. And the
  line-break branch only treats a line as a step break when it _ends_ a
  sentence (`.`/`!`/`?`); a hard-wrapped paragraph (an emailed or
  PDF-copied method with no punctuation at the wrap) is joined back into
  one line first, then split at sentences if it is long enough — never cut
  mid-sentence at the wrap.
- **The reading cache keeps the right half of a follow.** A follow that
  fails (a transient 403, a timeout) is never cached (`followFailed`),
  so a retry refetches rather than replaying the failure; a follow that
  succeeds keeps the video's own `llm` even when the followed page has
  none of its own (`mapRecipeNodes`/`schemaReadings`, which no model
  reads) — the video _was_ read by the model, and the reading is worth
  keeping so a `--pick` retry does not ask it again.
- **Nits:** `capsName` keeps a short acronym with a real vowel (`IPA`,
  `XO`, `DIY`, `USA`) via a small list, and the no-vowel rule now treats
  "y" as never a vowel, so "NYC" stays capitals without needing the list.
  `WHOLE_TIME`'s `all-in` no longer matches inside "all-in-one". The
  clause split for "all in" no longer breaks on a decimal point ("1.5
  hours all in"). `mergeReadings`' `withoutStart` now calls
  `withVideoStart(url, 0)` instead of stripping only the `?t=` query
  parameter, so a merged recipe's Vimeo fragment (`#t=`) is cleared too.

**Gates** — `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit`: both clean, rerun after each of the two
merges below and clean each time. `pnpm exec vitest run` (full, before
either merge): 99 files, 2040 tests, all green (the three files this phase
touches — `tidyReading.test.ts`, `importReading.test.ts`,
`multiRecipe.test.ts` — 88 tests on their own). Playwright, through
`heavy-pw.sh` (`multi-recipe.spec`, `youtube-video.spec`, `new-recipe.spec`,
`ytdlp-import.spec`), before either merge: 59/59.

Then merged `origin/main` twice more, each a clean auto-merge with no
conflicts (`agent-epic-38.md` keeps every phase's Results/Traps section,
`backlog.md`'s strikes from both sides): 38b (#245, 7d11e86a — touches
`sitePacing.ts`, `importRecipe.ts`, `importList.ts`, the roundup files,
`playwright.config.ts`'s `RECIPE_POLITE_GAP_MS=0`), then 38a (#246,
16e9fdff). After the 38b merge, since it touched the import path and
`new-recipe.spec.ts` itself: `new-recipe.spec` + `multi-recipe.spec`
rerun, 46/46 (no image-save/polite-gap timeout — the 38b e2e fix was
already in by then, so there was nothing to note as unrelated). After
each merge, the vitest files both phases touch — `test/importReading.test.ts`,
`test/multiRecipe.test.ts`, `test/tidyReading.test.ts`, `test/queue.test.ts`,
`test/importList.test.ts`, `test/roundupPage.test.ts` (after 38b: 6 files,
158 tests), then `test/importReading.test.ts`, `test/multiRecipe.test.ts`,
`test/tidyReading.test.ts`, `test/ingredientNames.test.ts` (after 38a:
4 files, 205 tests) — all green.

**Real-model check**

Command: `RECIPE_JOBS_DIR=<scratch>/jobs pnpm --silent recipes import
--text tmp/36/36c/email-chili.txt --dry-run --verbose --json --content-dir
<scratch empty git dir>` (head d6bf1070). Note: `--llm` is refused with
`--text` (usage) — the brief's `--llm force` was wrong; text always uses
the model (Tc5).

GPU freed first (Archilyzer paused; VRAM 91 MiB). `ollama ps`: `qwen3:8b`
6.8 GB, 100% GPU.

```
[job RHMAFCT1] job import-text "pasted text (1243 chars)" …
[job RHMAFCT1] text: pasted text chars 1243
[job RHMAFCT1] split: the gate: one recipe — read as one gate false blocks 1
[job RHMAFCT1] llm.extract …
[job RHMAFCT1] tidy: T24: split the one-step method into 5 steps at its sentence breaks rule split-method trap T24
[job RHMAFCT1] tidy: T25: name "CAROL'S WHITE CHICKEN CHILI" → "Carol's White Chicken Chili" rule caps-name trap T25
[job RHMAFCT1] tidy: T26: prepTime 60 min is the total: the text says "Takes about an hour all in" rule all-in-time trap T26
[job RHMAFCT1] llm.extract 12/12 grounded · 15.5 s · 255 tok @ 40 tok/s · load 7.4 s · GPU
[job RHMAFCT1] ground: trusted — 12/12 lines in the source outcome trusted grounded 12 total 12 verbatim 12
[job RHMAFCT1] job import-text "pasted text (1243 chars)" 16.1 s
```

Draft: name "Carol's White Chicken Chili", totalTime 60, prep/cook unset,
5 steps.

### 38d — Shopping list v2

**Reindex needed: no.** No index, index value or spec version changed:
`parseIngredientLine` feeds Make in the browser (over the index's flattened
lines) and the shopping view, never an index. The shopping store gained one
optional item key (`for`) and two settings switches, both read leniently
(a file without them reads as before; an older editor ignores them).

New: `common/util/shoppingLines.ts` (`recipeLines`, moved out of the seat;
`subRecipeLink`; `expandRecipeLines`; `MAX_SUBRECIPE_DEPTH` = 3) and
`test/shoppingLines.test.ts`. Changed: `ingredientNames.ts` (the `OR:`
label, `orPrevious`, `parseIngredientList`'s fold; a bare "pinch salt" /
"dash bitters"), `shoppingTypes.ts` (`for`, `ShoppingSubRecipe`,
`features.subRecipes` on and `features.holdTicks` off), `shoppingView.ts`
(the `OR:` fold, `alternatives`, `forNote`, the as-needed suffix),
`shoppingTickSync.ts` (holding, `done()`, `setHold`), the seat's add, the
settings schema and the `shopping_settings_set` description, the page (a
"Done shopping" bar, row notes), the curator skill's shopping section, and
the `shopping` fixture (Simple Syrup and Lemonade, recipes index rebuilt).
The CLI needed nothing: `shopping settings set features.<name>` lists
`SHOPPING_FEATURES`, so `subRecipes` and `holdTicks` are there.

Decisions:

- **Dd1 — Sub-recipes expand when added, not on every render.** The view
  runs in the browser over stored items alone and cannot read recipes. So
  the seat stores the sub-recipe's own lines, each with `for` (the path of
  sub-recipes, outermost first: `{slug, name, called?}`) and `line` = its
  index in the sub-recipe; `recipe` stays the recipe that was added, so
  "remove Lemonade" takes its syrup lines too, and ticks and Clear need
  nothing new. The `subRecipes` switch therefore governs adds; lines already
  on the list stay as they are (said in the switch's help).
- **Dd2 — A line is a sub-recipe only when the link is its own name** with
  nothing but an amount before it (the text before the link, with a
  placeholder for the link, must read as that placeholder). "1 tsp maple
  syrup or [simple syrup](…)" buys maple syrup; "3 Tbsp tonkatsu sauce (or
  make [Homemade Tonkatsu Sauce](…))" buys the sauce; "½ oz rich [simple
  syrup](…)" is rich syrup, not the linked recipe. The multiplier:
  `N batches` / `N recipe` / a bare count → ×N (`half batch` → ×½); no amount
  → ×1; a pinch or a splash → ×1. A **measure** ("¾ oz [simple syrup](…)")
  lists **one batch per batch of the recipe above** and notes what was
  called for, scaled ("for Simple Syrup (1½ oz called for)" at ×2) — the
  brief's "unreadable → ×1 with a note", and the shopper can judge. An amount
  the parser cannot read at all is ×1 with the words as the note. Factors
  multiply down the path, and by the recipe's or plan's scale.
- **Dd3 — A sub-recipe's line merges with the recipe's own of that name**
  (the `nameKey` merge, unchanged): Lemonade's ¼ cup sugar and its syrup's ½
  cup are one row, "¾ cup sugar", noted "partly for Simple Syrup"
  ("for Simple Syrup" when every line of the row is), each source reading
  "… — 1/2 cup sugar (for Simple Syrup)". No separate "for" section: with
  aisles on, a sub-recipe's lines are in several aisles anyway.
- **Dd4 — Guards, as warnings, never errors**: an ancestor-path set (a cycle
  A → B → A keeps B's line to A as written), depth 3, a missing sub-recipe
  or one with no lines keeps the linking line as written. Each is one
  `warnings` entry on the add ("Kept "1 recipe lavender syrup" as written:
  there is no recipe "lavender-syrup".") — the add page, the CLI and MCP
  already print `warnings`. Reads are cached for the whole add (a plan names
  the syrup many times); the 35c item cap still bounds the result.
- **Dd5 — `OR:` lines fold on render, with no new stored field.** An item
  whose text opens with `OR:` joins the row of the line just above it in the
  same lot (recipe, plan path, scale, sub-recipe path; the nearest earlier
  id, so a recipe on the list twice finds its own), shown as "or ¼ cup (50g)
  green sanding sugar and ¼ cup (50g) red sanding sugar" under the row (and
  `· or …` in the copy text). Its id rides in the row's `ids` — a tick or a
  Clear takes it along — but not in the amounts, counts or checked state.
  Folding on render means the Christmas Baking list already on the real
  repo reads right with no rewrite. A typed `OR:` line, or one whose line
  above is gone, keeps its own row. Every switch off still folds it: it is
  grammar, not a feature.
- **Dd6 — Make: an `OR:` line is no requirement of its own.**
  `parseIngredientLine` strips the label and marks `orPrevious`; its body's
  parts joined by "and" before a new amount are each read as a line (no
  stray "cup" in a name); `parseIngredientList` adds the names to the
  previous requirement's alternatives, so either meets it and Make counts
  one line (Blossoms with green sanding sugar on hand and no granulated is
  makeable). After a heading, an `OR:` line stands alone.
- **Dd7 — Amount-less lines: a suffix, each kind once.** "pinch salt" + "2
  tsp salt" → "2 tsp salt + a pinch"; a dash → "+ a dash"; "to taste",
  "for garnish", a bare name and the other as-needed words → "+ as
  needed"; in that order (`AS_NEEDED_EXTRAS`), on the label, `quantity` and
  what is left of a partly ticked row. A row of only amount-less lines stays
  its name, as before. The other half was the name: "pinch salt" (no "a", no
  "of") read as the name `pinch salt`; `stripAmount` now drops a leading
  pinch or dash before a word, so it names salt — the one name-side change
  (Make reads "Dash Angostura bitters" as `angostura bitters` too).
- **Dd8 — Held ticks.** `TickSync` takes `hold` and a second storage,
  `heldStorage` (the page passes `localStorage`, key `shopping-held-ticks`,
  **no age limit** — a shop can outlast 35d's 10 minutes, and a locked
  phone may lose the tab). Holding, nothing is sent after the quiet spell,
  on hide, on `pagehide` or on leaving; "Done shopping" (`done()`) sends
  every held tick as one PATCH (a second only for ticks made during that
  flight). A failure — refused, 5xx or offline — keeps them, does not retry
  by itself, and the banner says "… Your ticks are kept on this device —
  press Done shopping to try again." Switching off sends what was held the
  usual way; switching on holds what is pending. The page counts **lines**
  (rows with an unsaved tick), not item ids: "2 lines not saved yet",
  "Saved 2 lines." With the switch off, the per-tick sync is unchanged (the
  existing `shoppingTickSync` tests pass as they were). The switch is shared
  (in `settings.json`, the 35 pattern); the ticks are per device.

Review fixes (amendments):

- **Dd9 — Only batches multiply** (amends Dd2). `N batch(es)` / `N
recipe(s)` (and link text that reads so, "2 [batches of pie dough](…)")
  → ×N. A bare count is pieces, not batches — the recipe's yield is not
  known at add time: "8 [corn tortillas](…)" and "2 [pie crusts](…)" (the
  old ×2 case; Sally's crust makes two) → ×1 with "for Corn Tortillas (8
  called for)", like a measure. A range, "1-2 batches [crust](…)" → ×1 with
  "1–2 batches called for" (`1-1/2` is still one and a half). The line is a
  sub-recipe only when nothing but a remark follows the link: empty, or
  parts opening with "," or "(" none of which is an alternative or an
  extra — "[Simple Syrup](…) or honey syrup", "(or 1 refrigerated crust)",
  ", plus flour for rolling", "+ …", "and …" keep the line as written (no
  warning: it is a choice, not a failure). An `OR:` line is never a
  sub-recipe (its body's link is the other way to make the line above).
- **Dd10 — An `OR:` combination offers only what its parts share** (amends
  Dd6). Parts joined by "plus", or "and"/"&" before an amount, are all
  needed; Make judges a line one item at a time, so a part cannot stand for
  the whole — "OR: 1 cup milk plus 1 Tbsp vinegar" must not let vinegar
  meet buttermilk. The combination offers the name its parts end in when
  that is two words or more: the Blossoms coating offers `sanding sugar`
  (green, red or plain sanding sugar meets it; label "granulated sugar or
  sanding sugar"); milk plus vinegar offers nothing, so buttermilk must be
  met itself. A one-part `OR:` line ("OR: 1 cup honey or maple syrup")
  offers each of its names, as before.
- **Dd11 — A sub-recipe line with an `OR:` line under it stays as written**
  (the simpler of the two fixes): the view then folds the `OR:` line onto
  that row, as Make counts the two as one line. Expanding it would put the
  sub-recipe's lines in another lot and leave the `OR:` line alone.
- **Dd12 — The seat folds as the view does.** `orParents` (exported from
  `shoppingView`) drives `patchShopping`'s name ticks — `shopping check
"granulated sugar"` also ticks the `OR:` items folded into that row,
  through a chain of `OR:` lines — and `clearShopping`, which takes an `OR:`
  item along with the line it folds into, ticked or not, so none is left
  as an "OR: …" row of its own.
- **Dd13 — Held ticks are shared by the browser's tabs** (amends Dd8). The
  held key is one per browser, so each change is read-change-write
  (`TickSync.mutate`): a tick keeps another tab's ticks, a Done settles
  only what it sent (a newer tick in another tab during the flight stays,
  and the same Done sends it next). A tab takes up another's ticks on the
  `storage` event (`refresh`), and Done first reads them, so Done in either
  tab sends every tick held in the browser. A tab that is not holding
  touches the key only to take its ticks and send them (on mount, or when
  the switch goes off) — never on a tick. A held storage that does not
  keep a write leaves the ticks in memory.
- Nits: an `OR:` alternative on a row merged from several recipes says
  whose it is ("… — in Peanut Butter Blossoms"); an add refused by the item
  cap says when sub-recipes went on as their own lines. Dd7's "each kind
  once" stands: two "pinch salt" lines beside "2 tsp salt" read "2 tsp
  salt + a pinch", not "+ 2 pinches" — a pinch is not worth counting.

For Roger's close-out: until the Pi is deployed, its old build refuses
`features.subRecipes` / `holdTicks` in a settings patch, drops them on any
settings save it makes, and drops `for` on any tick it rewrites —
transient, gone with the deploy.

Deferred:

- A line that names a recipe without linking it ("easy cookie icing", 35x)
  is not expanded: Make's name match over the whole corpus (25c) could
  feed it, but a guess on a shopping list buys the wrong things — link the
  line in the recipe instead.
- No undo of an expansion on the list (remove the rows, or switch off and
  add again).

Gates (after the review fixes and the merges of `origin/main` with 38b,
38a and 38c, all through the heavy slot): `pnpm --filter recipe-editor
typecheck` and `pnpm --filter recipe-website exec tsc --noEmit` clean;
the parser and shopping vitest files 373/373 and the full suite 101 files
/ 2081 tests (after 38a, before 38c, which touches no shopping code);
Playwright build mode `shopping.spec make.spec` 42/42 after both merges.
38a's `readableLine` merged without conflict: the `OR:` label is read
from its output. The first Playwright run found the expansion spec
asserting no "Simple Syrup" on a list whose notes name the syrup; the
spec now checks that the linking line ("batch Simple Syrup") is no row.

### 38e — Photo / recipe-card import

**Reindex needed: no.** Nothing in the content repository changes.
**Roger's step:** `RECIPE_LLM_VISION_MODEL=qwen2.5vl:7b` in `editor/.env`
(the workstation; the Pi stays without one), then `pnpm workstation update`.

**Built.**

- **The model** (`controller/llm/vision.ts`): `RECIPE_LLM_VISION_MODEL`, on
  the text model's server and API; in `EDITOR_ENV_KEYS`, `recipes --help`,
  and the Tools page's "Local model" card (a "Vision model" row).
- **`chatJson` takes images** (`client.ts`): `images: [{bytes, type}]` go
  as Ollama's `images` (base64) on the user message, or as OpenAI-style
  `image_url` parts with `data:` URLs. A sibling, **`chatText`**, shares
  the transport (the `gpu` slot, D6's reload, the placement check) and
  sends no schema (De2). `unload: true` unloads the model once it has
  answered and its placement is read (Te1).
- **The transcription** (`transcribePhotos`): one `vision.transcribe` step
  per photo — model, bytes, bytes sent, then `chars`, `lines`, a hash and
  a 160-character `excerpt` (37-D2) — in page order (De4), the vision
  model unloaded after the last (`llm.unload`), and a
  `vision` note naming the swap: "qwen2.5vl:7b read 412 characters and was
  unloaded — qwen3:8b reads the transcription". The extractor's call that
  follows is its own `gpu` acquire with its own placement reading (D5).
  Every photo is turned upright, fitted inside 1024 px and 0.75 MP and
  sent as a JPEG (`llm/photoPrep.ts`, `sharp` with `limitInputPixels:
100e6`) — never the original, however small (Te5). _Amended after the
  real GPU (38e fixes):_ one `vision.transcribe` per photo in page order
  (`part: "1/2"`, "Vision model reads page 1/2"), the pages joined with a
  blank line, every photo prepared before the first call, the unload once
  after the last page; `num_ctx` 4 096 (`VISION_NUM_CTX`, what the check
  read at). A failed page unloads the vision model too (`unloadOnError`),
  and so does a cancel (the old `!signal.aborted` guard is gone: the
  unload has its own 30 s timeout and runs inside the `gpu` hold). A model
  failure is an `ImportError` "the vision model … failed[ on page 2/3]:
  <the server's words>" (Te5).
- **The reading** is the pasted-text path's (`readPastedText` gained a
  `label`, `importFromText` a `photos` origin): the extractor, D4's
  grounding against the transcription, the 36e split, `partial`,
  `pick` / `all`; the warnings say "read from the photo's transcription by
  local model …", a create commits "(local model, photo)", a batch
  "(local model, photo, 2 of 3)". A dry run answers `transcription`.
- **The photos in the job store** (`controller/jobs/photos.ts`):
  `<jobs dir>/photos/<sha256>.<ext>`, stored when the job is enqueued
  (the form's action, the local backend, the route), named by that path in
  the spec — never their bytes — so Retry reads them again; a spec path
  outside `photos/` is refused. The transcription is kept beside them
  (`<set>.transcript.json`, with the model and a hash of the prompts), and a
  Retry or a `--pick` of the same photos with the same model reuses it
  (De5). `pruneJobs` prunes photos and transcripts no remaining job names,
  once an hour old.
- **Job kinds** `import-photo` (CLI, API, MCP) and `form-photo` (the form),
  in `JOB_KIND_NAMES`; resources `["gpu"]`; labels "photo card.jpg",
  "2 photos: a.jpg, b.jpg"; `--all` is a batch tier as for text.
- **The form** (`new-recipe/form.tsx`): "Or read a photo of a recipe card"
  under the paste link, only where a vision model and a text model are
  configured (hidden on the Pi and in CI); up to four photos with previews,
  "Remove" each, the order kept; "Use the first photo as the recipe's
  image" (off); the live import panel names the steps ("Vision model reads
  the photo", "Model reads the recipe"); a "What qwen2.5vl:7b read in the
  photo" fold shows the transcription; a several-recipe photo goes to the
  36e picker ("This photo holds 3 recipes", commits "(local model,
  photo, …)").
- **CLI** `recipes import --photo <file> [<file>…]` (or `--photo` repeated),
  with `--source`, `--photo-as-image`, `--dry-run` (prints the
  transcription), `--out`, `--verbose`, `--pick` / `--all` / `--as-one`.
  `--photo` with `--text`, `--llm`, more than four, or `--photo-as-image`
  without `--photo` / with `--image` is `usage`.
- **`/api/import` multipart**: `photo` parts in page order and a `request`
  part with the rest of the body as JSON, checked by `ImportRequestSchema`
  (the photos counted as `photos`). A JSON body naming `photos` paths is
  refused: this route's photos are the upload's parts (paths are the MCP
  tool's, De6). Before a byte of a multipart body is read (38e review):
  `assertPhotoImport()`, then no `Content-Length` is a `validation` 400
  and one over 4 × 15 MB + 1 MB a 413. The HTTP backend's
  `importPhotos` posts that; an editor from before 38e is named.
- **MCP** `recipe_import` takes `photos: [path]` (1–4) and `photoAsImage`
  (tool count unchanged); the paths are read by the server's process, as
  `recipe_set_image`'s `path` is (De6).
- **"Use the photo as the image"** on CLI / API / MCP: after the create,
  `setRecipeImage({file})` per created recipe (an `image` step, one
  commit each); a dry run says it would. In the form, the image field is
  filled instead (Te2).
- **No vision model** (unset, or no `RECIPE_LLM_URL`): the form hides the
  mode; CLI / API / MCP answer `usage` naming `RECIPE_LLM_VISION_MODEL`.
- **TEST_MODE stand-in**: `/settings/test-llm?url=…&vision=<model>` turns
  photo import on for one spec; the loopback stand-in model
  (`standInModel.ts`) answers the transcription prompt with the transcript
  filed for each photo's hash (`playwright/fixtures/photos/*.txt` beside the
  picture), so the whole path — the upload, the store, `images` on the
  wire, the unload, the reading — runs with no model. Playwright pins
  `RECIPE_LLM_VISION_MODEL` empty beside `RECIPE_LLM_URL` (36-T18).
- **What is read**: JPEG, PNG, WebP, AVIF, TIFF, GIF (anything this `sharp`
  decodes); HEIC/HEIF is refused with advice at enqueue time — this
  `sharp` has no HEVC decoder. A browser's `accept="image/*"` picker on
  iOS converts to JPEG already; a `.heic` copied off the phone is what
  meets the refusal. 15 MB per photo (`checkImageFile`).
- Backlog: "Photo / recipe-card import with a vision model" struck.

**Decisions.**

- **De1 — the vision model is opt-in.** No silent default: Photo mode needs
  `RECIPE_LLM_VISION_MODEL` set as well as `RECIPE_LLM_URL`.
  `qwen2.5vl:7b` is what `--help`, the error and the Tools card name. A
  workstation that never pulled a vision model would otherwise offer a
  mode that only fails with a 404, and the plan's close-out already makes
  setting it Roger's step.
- **De2 — `chatText`, not JSON mode.** A transcription is free text;
  asked through JSON mode the model would escape every line inside one
  string. `chatText` shares `chat()` with `chatJson` — the queue, the
  reload, the placement, `unload` — and only skips the schema and the
  parse.
- **De3 — the unload is a request of its own, after the placement** (Te1),
  inside the same `gpu` hold, so no other job's model can load between
  the vision call and its unload. A failed unload is the step's, never the
  import's (the next load evicts it anyway).
- **De4 — one call per photo** (decided by the real GPU, Te5). Two
  1024 px pages in one call read well (2 116 prompt tokens, 26.2 s) but
  four would overflow the 4 096 context that was measured, and a
  per-photo call keeps each request at the size that read. Each photo is
  its own `vision.transcribe` step and `gpu` acquire; the pages are joined
  with a blank line, which the pasted-text path reads as a paragraph
  break, and D4's grounding finds each line in the joined text whichever
  page it came from (`photoImport.test`). The `gpu` slot is let go between
  pages (each call acquires its own, so its D6 reload still works); a job
  that takes it in between finds the vision model loaded, and Ollama
  evicts it for a model that does not fit.
- **De5 — a kept transcription is reused.** Keyed by the photo set (the
  content-named paths in order), checked against the vision model and the
  prompts' hash. A `--pick` after a several-recipe refusal, or a Retry
  after the text model timed out, reads the photos once.
- **De6 — MCP `photos` work on both backends.** The brief had a remote
  backend refuse; but the stdio server reads the paths on its own machine
  either way, and the HTTP backend already uploads files (`recipe_set_image`'s
  `path` does exactly this), so a remote backend uploads them multipart to
  `/api/import`. Over MCP-over-HTTP the editor reads its own host's paths,
  as `recipe_set_image` does — an exposure the tool already had: a holder
  of a `write`-scoped token (27-D6) can have the editor read any image
  file (by extension, ≤ 15 MB) its process can open into the job store,
  and see the transcription. `/api/import` itself takes no paths.
- **De7 — "use the photo" after the create, one commit more.** As the
  brief said: `setRecipeImage` per created recipe, which covers a batch
  the same way; the form fills its image field instead (Te2). _Amended
  (38e review):_ the image committed is the photo upright and fitted
  inside 2000 px as a JPEG (`photoForImage`, `storedPhotoImage`) — not a
  phone's 10 MB original, and not the 1024 px copy the model reads (too
  small for the site's larger sizes). The form's picker carries it too:
  a several-recipe photo with the box ticked sends the stored photo
  (`RecipeActionState.photo`, checked against `PHOTO_PATH`) to
  `importRecipeBatchAction`, and `form-batch` (spec `photos: [photo]`, so
  the prune keeps it) sets it on each recipe it creates — a row's
  warnings say so. The single-recipe form still uploads the browser's own
  file through the image field, as a picked file would be. The field
  follows the box: `RecipeFields` keys `ImageInput` on the photo's
  identity (`fileKey`), so unticking after the import empties it and
  ticking fills it with its preview.

**Tests.** New `test/photoImport.test.ts` (16): the configuration (De1);
`chatText` with Ollama `images` and no `format`, the unload after it, and
the OpenAI `image_url` shape; `preparePhoto` (as-is, fitted, rotated,
WebP → JPEG, HEIC and garbage refused); the store (content names, order,
five photos / no photos / not an image / HEIC refused, a traversal path
refused, the prune); `transcribePhotos` in a job (one call with both
photos, `/api/ps`, the unload, the step's data, the swap note; nothing
read); the local backend's dry run (the call order: vision chat, ps,
unload, text chat, ps; the transcript kept and reused), a create with
`photoAsImage`, `usage` without a vision model; the form's reducer.
`importRoute.test` +3 (multipart dry run, refusals, the HTTP backend's
upload), `importRequest.test` +1 and two messages, `mcp.test` +1,
`cliJson.test` +1 (`--photo` as a process: flags, `usage`, the dry run and
its printed transcription, a create with `--photo-as-image` — two
commits), `jobs.test` (kinds, labels, tier), `editorEnv.test` (the key).
Playwright: new `photo-import.spec` (3): hidden without a vision model
(and with a text model alone); the live steps (the transcription held
until released), the form filled, the notice, the transcription fold, the
photo as the image through Submit; four photos at most and Remove.

_The fixes (real GPU + review)_ brought `photoImport.test` to 25: every
photo re-encoded (and `sentPhotoKey` agreeing), the 1024 px / 0.75 MP
fit, SVG / ICO / BMP refused; one call per photo (two chats, one unload,
`reason: "done"`, the page prompts, `part`); Ollama's 500 `{"error"}`
surfaced as an `ImportError` with the unload before it (`reason: "runner
failed"`), an empty `done: false` on the text model, a 200 carrying an
`error`, a cancelled call unloaded, a plain 404 left loaded; the prune
keeping photos when a meta is unreadable; `form-batch` with `photos`
setting the photo on each recipe; `photoAsImage` committing a sideways
2400×1200 photo as an upright 1000×2000 JPEG. `importRoute.test` +1 (a
413, a missing `Content-Length`, and `usage` first — the body never
read); the multipart tests send a `Content-Length` as a browser does.
`photo-import.spec`: unticking the box after the import empties the
image field and its preview, ticking it fills both again.

**Gates** (after the fixes, on `origin/main` c2c58808 merged):
`pnpm --filter recipe-editor typecheck` and `pnpm --filter recipe-website
exec tsc --noEmit` clean; `pnpm exec vitest run` 104 files, 2161 tests
passed; Playwright, build mode through the heavy slot (`photo-import`,
`new-recipe`, `multi-recipe`, `jobs`, `settings-nav`): 67 passed (4.1 min).

**Real check** (orchestrator, 2026-10-16, head 31f3f3d4; Archilyzer paused,
79 MiB VRAM in use at the start; RX 6600 8 GB, Ollama 0.34.3 on Vulkan).
**The cards were rendered, not photographed:** recipe-card HTML in a
typewriter font on a ruled, off-white, slightly rotated and grainy card,
turned into JPEGs. There is no camera here. Each ran as
`recipes import --photo … --dry-run --verbose` against a scratch content
repo and a scratch `RECIPE_JOBS_DIR`.

- **Banana bread** (`banana-bread-card.jpg`, 1833×1217, fitted to
  1024 px): `vision.transcribe` 1 photo · 321 chars · 17.0 s (load
  5.8 s) · GPU → `llm.unload` → `llm.extract` 8/8 grounded · 9.6 s (load
  5.0 s) · GPU; the job 26.7 s in all (wall 29.7 s). Draft: "Aunt Ruth's
  Banana Bread", all 8 ingredients and the transcription verbatim. The same
  card had crashed the runner before the fixes (Te5).
- **Chili, two pages** (`chili-page-1.jpg`, `chili-page-2.jpg`, one call
  per page, De4): `vision.transcribe 1/2` 203 chars · 15.0 s (load
  5.4 s) · GPU; `vision.transcribe 2/2` 252 chars · 9.6 s · GPU; one
  `llm.unload` after the last page; the swap note "read 457 characters
  from 2 photos and was unloaded — qwen3:8b reads the transcription";
  `llm.extract` 8/8 grounded · 8.3 s (load 3.2 s) · GPU; the job 33.2 s in
  all (wall 36.0 s). Draft: "Grandpa Joe's Chili", 8 ingredients and 5
  steps, grounded across both pages.
- Every model call ran at 100% GPU, and the two models were never loaded
  together. Afterwards `ollama ps` listed only qwen3:8b (6.8 GB,
  100% GPU, ctx 12 288).

### 38f — Content round

**No content-repo writes.** The real repo was left clean at 746e4336;
the workstation editor was never stopped, since nothing here needed a
scripted write.

**What was verified.**

- **The epic-35 cleanup had already landed.** `tag:lunch` is 0 and
  `marble-rye-bread` is `not_found` (no `lunch` term record either) — the
  35h content round (`agent-epic-35.md` Results) already removed `lunch`
  from its two carriers (both were already tagged `sandwich`) and deleted
  `marble-rye-bread` (the same 9 ingredients as `marble-rye`, which has the
  photo). The other three "pairs" noticed at epic 33 are distinct recipes
  with their own display names: `white-chili` ("White Chili", tasteofhome)
  vs `white-chicken-chili` ("White Chicken Chili", no source);
  `barbacoa-beef` ("Slow Cooker Barbacoa Beef") vs `barbacoa-beef-2` ("…
  2"); `arayes` ("Arayes", no source) vs
  `arayes-lebanese-meat-stuffed-pita` (recipetineats) — kept as written,
  as 35h judged.
- **The Sake Cosmo image was already set, at creation.** Set since
  bddc1379 (2026-10-09, `Sake-Cosmo-9.jpg`) and renders; the backlog row
  naming it as open was stale.
- **The red-wine-spritzer citation has no fix that needs no decision.**
  Its source, `https://www.acouplecooks.com/red-wine-spritzer/`, redirects
  to `/white-wine-spritzer/`, which has no red-wine variation (grep: 0
  matches). Left alone — Roger's call (re-point the citation, drop it, or
  re-source the recipe).
- **Counts:** `tag:lunch` 0, `tag:drink` 217.

**Trap Tf1** — see Traps, above: a bare `curl` gets Cloudflare's
JS-challenge 403 on `acouplecooks.com` even with the importer's UA; the
CLI's `inspect` (Node `fetch`) gets 200 on the same URL. Use the CLI to
check a source page, not a bare `curl`.

**Roger's calls, listed and not applied:** the two kid-party drinks
(`mermaid-lemonade-foodnetwork` / `cotton-candy-fizz-foodnetwork`, keep or
delete), a source for the Spicy Cascara Highball (none in the repo), the
Zero-Proof Spritz (only `zero-proof-aperol-spritz-acouplecooks` exists),
the red-wine-spritzer citation (re-point to `/white-wine-spritzer/`, drop,
or re-source), and the 51 uncertain facet calls from epic 33 (its own
review list isn't recoverable from `agent-epic-33.md` — the list named at
Method step 5, ~l.127, and Results, ~l.156, doesn't store the review
artifact's URL; re-run a review if this is wanted).

### 38g — Claude API backend (post-close)

Roger, 2026-10-16, after deploying epic 38 to the Pi: _"Can we have the pi
set up to use Anthropic Claude API for the import feature since it probably
can't run a good model locally?"_ Branch `agent/38g-claude-api`.

**Reindex needed: no.** Nothing in the content repository changes.

**What kept the Pi off before.** Only the environment: `llmConfig()` was
`undefined` without `RECIPE_LLM_URL` (36-D1). No role check sits on the
model path — not in `controller/llm/`, the import seats, `/api/import`, the
MCP tools, nor the form (`new-recipe/page.tsx` passes `llmConfig()?.model`
on every role). The one role-gated piece was the **Settings → Tools** nav
item (workstation-only since 38b), the home of the "Local model" status
line; the page itself answers by URL on a mirror too. So setting the
variables on the Pi is enough to turn imports on there; Dg8 puts the status
line where a mirror can find it.

#### Decisions

- **Dg1 — A third style, `RECIPE_LLM_API=anthropic`, on only with a key.**
  `RECIPE_LLM_API_KEY` is new and explicit — a shell's `ANTHROPIC_API_KEY`
  is never read. `RECIPE_LLM_URL` is optional for this style (default
  `https://api.anthropic.com`); the other styles are unchanged and still
  gated on it. The default model is `claude-sonnet-5`
  (`DEFAULT_CLAUDE_MODEL`); `claude-haiku-4-5` is the cheaper one the docs
  and `--help` name. `anthropic` without a key is off, and the Settings line
  and `force`'s `import_failed` say "the Claude API is off:
  RECIPE_LLM_API=anthropic needs RECIPE_LLM_API_KEY". The bonus is taken:
  with `RECIPE_LLM_API=openai` a set key goes as `Authorization: Bearer`
  (`llmStatus` too); Ollama never gets it.
- **Dg2 — JSON answers by structured outputs, not a forced tool call.**
  Checked 2026-10-16 against
  `platform.claude.com/docs/en/build-with-claude/structured-outputs`:
  `output_config: {format: {type: "json_schema", schema}}` is GA, with no
  beta header, on every current model; the answer is the text block's JSON.
  A forced `tool_choice` returns a 400 on `claude-opus-5-5` and
  `claude-fable-5-1`, so a forced-tool client would break the day
  `RECIPE_LLM_MODEL` names one; structured outputs do not. They need every
  object closed (`additionalProperties: false`) and take no
  `minimum`/`maxLength`-style constraints: `claudeSchema` closes and drops
  them (ours use none). The root must be an object — all three schemas
  passed to `chatJson` (`LLM_RECIPE_SCHEMA`, `LLM_LIST_SCHEMA`,
  `LLM_ONE_DISH_SCHEMA`) are, a test pins it, and a non-object root throws
  rather than being wrapped (none exists to wrap). `chatText` sends no
  format and reads the concatenated `text` blocks.
- **Dg3 — No GPU machinery for a hosted API.** `chat()` sends an
  `anthropic` call straight to `callClaude`: no `gpu` acquire (so no
  `queue.wait`, no acquire hook), no placement check, no unload or D6
  reload. The photo path still logs `vision.transcribe` then `llm.extract`;
  the `vision` note drops "and was unloaded". `openai` is unchanged
  (38-Te7) beyond the bearer.
- **Dg4 — The request.** `POST {url}/v1/messages`; headers `x-api-key`,
  `anthropic-version: 2023-06-01`, `content-type`; a top-level `system`;
  pictures as `{type: "image", source: {type: "base64", media_type,
data}}` blocks before the text block; **`max_tokens` 16 000**
  (`ANTHROPIC_MAX_TOKENS`): a long recipe's JSON is a few thousand tokens
  and a four-page transcription less, and `claude-sonnet-5`'s default
  adaptive thinking counts against the same limit. No `temperature` (Tg1)
  and no `thinking` parameter (each model's default). `stop_reason:
"max_tokens"` is a `model` failure "…'s answer was cut off: it reached
  max_tokens (16000) before it finished" — never a parse error on half a
  JSON; `"refusal"` is "declined to answer". `usage.input_tokens` /
  `output_tokens` go to the step as the other styles' counts do.
- **Dg5 — One retry, for 429, 529 and other 5xx.** After `retry-after`
  (seconds or an HTTP date), capped at 30 s, else 5 s; an `llm.retry` note
  in the step ("…answered 429 — asking once more in 5 s"); the wait ends on
  a cancel. A second failure is the call's. A timeout, an unreachable host
  or a 4xx is not retried. A 401/403 is "…refused the API key
  (RECIPE_LLM_API_KEY): 401 — <the API's words>"; an `{type: "error",
error: {message}}` body is surfaced by its message, capped at 200
  characters as before.
- **Dg6 — The key never leaks.** It is only ever a request header. Server
  text in a message passes `withoutKey` (should a proxy echo it); the
  TEST_MODE `/settings/test-llm` route answers `publicLlmConfig` (`apiKey:
"set"`); the Settings line shows "API key: set". 37-D2's redaction
  already covers it twice over: `SECRET_ENV_NAME` matches
  `RECIPE_LLM_API_KEY` (`…API_KEY$`), so its value is scrubbed from every
  log line, mirror line (`--verbose`) and job meta error, and a field named
  `apiKey` is `[redacted]` by `SECRET_NAME`. A test runs a failed call in a
  job against a server that echoes the key and finds it in no error, step
  line or file of the job store.
- **Dg7 — Photos under Claude.** The vision model defaults to the text
  model (Claude reads images), so photo mode is on with the key alone;
  `RECIPE_LLM_VISION_MODEL` still overrides. The 1024 px / 0.75 MP cap is
  the workstation GPU's (38-Te5): under `anthropic` a photo is fitted to
  **1568 px** on its long edge (`CLAUDE_PHOTO_LIMITS`; Claude's own
  downscale point for `claude-haiku-4-5` — `claude-sonnet-5` would read up
  to 2576 px at up to ~3× the image tokens). Ollama keeps 1024. The 15 MB
  file cap stays. `transcribeKey(limits)` folds the limits in, so a
  transcript kept for one size is not reused for the other; the Ollama key
  is unchanged, so transcripts kept before 38g still count.
- **Dg8 — The status line on `/jobs`, every role, when a model is
  configured.** Tools stays workstation-only (its yt-dlp path form is the
  workstation's; the mirror image sets `YTDLP_PATH`). `/jobs` — a Settings
  item on every role since 38b — gains "The model imports read with" and
  the same `LocalModelStatus` (in a `Suspense`, as it probes the API), only
  when `llmConfig()` is set, so the workstation suite (no model) and its
  baselines are unchanged. For Claude it says "The Claude API at
  https://api.anthropic.com (anthropic)", the model, "API key: set", and
  `reachable` / "the API knows no model …" / "the API key was refused (401)
  — check RECIPE_LLM_API_KEY", from `GET {url}/v1/models/{model}` with the
  key (200 / 404 / 401).
- **Dg9 — Wording: the client's messages and the Settings line, not the
  provenance strings.** `modelLabel(config)` says "the Claude API
  (claude-sonnet-5)" (with "at <displayUrl>" only off the default URL)
  where 36/38e said "the local model at …". The reading's warnings
  ("extracted by local model claude-sonnet-5 — …"), form notices and commit
  notes ("(local model)") still say "local model" whatever answered: they
  are pinned by many tests and are provenance in git history; a wording
  pass is a backlog row.
- **Dg10 — The Pi gets its settings from the deploy config.**
  `scripts/deploy-pi.sh` copies `RECIPE_LLM_API`, `RECIPE_LLM_API_KEY`,
  `RECIPE_LLM_MODEL`, `RECIPE_LLM_URL` and `RECIPE_LLM_VISION_MODEL` from
  `~/.config/recipe-deploy/uraninite.env` into the Pi's
  `~/recipe-editor/.env` **every time it starts the container**
  (`switch_to`: deploy, `--sync-index`, `--rollback`), before anything
  stops — only the ones the config sets: their lines replaced, every other
  line left (umask 077, `grep -v … > .env.new`, `chmod 600`, as
  `WORKSTATION_URL` in `--setup`). The lines travel on ssh's stdin; the
  terminal shows ".env: model settings (RECIPE_LLM_API=anthropic, key set,
  RECIPE_LLM_MODEL=…)" — never the key, and a URL without `user:pw@`. The
  five names are `unset` before the config is sourced, so the
  workstation's own shell can never send its `RECIPE_LLM_URL` to the Pi.
  Before `--setup` has made `.env`, nothing is written (a `.env` holding
  only these lines would make `--setup` skip `AUTH_SECRET`).

#### Results

**Built.**

- `controller/llm/client.ts`: `LlmApi` gains `anthropic`, `LlmConfig`
  gains `apiKey`; `llmConfig` (Dg1), `publicLlmConfig`,
  `llmUnconfiguredMessage`, `modelLabel` (Dg9), `requestHeaders`;
  `llmStatus` asks `/v1/models/{model}` and reports `keyRefused`;
  `callClaude` with `claudeRequestBody`, `claudeSchema` (Dg2), one retry
  (`retryDelayMs`, Dg5) and the failures of Dg4. `parseJsonAnswer` takes
  who answered.
- `controller/llm/photoPrep.ts`: `PhotoLimits`, `OLLAMA_PHOTO_LIMITS`
  (1024 / 0.75 MP, the default — the Playwright stand-in's key),
  `CLAUDE_PHOTO_LIMITS` (1568); `photoForVision(bytes, limits)`.
  `vision.ts`: the vision model's default (Dg7), `photoLimits(config)`,
  `preparePhoto(photo, limits)`, `transcribeKey(limits)`, no "unloaded"
  under Claude. `importPhoto.ts` keys the kept transcript by the limits.
- Surfaces: `EDITOR_ENV_KEYS` takes `RECIPE_LLM_API_KEY`; `recipes --help`
  lists it and the `anthropic` style, model and vision defaults;
  Settings → Tools' card and `/jobs` (Dg8); the test route answers no key;
  `playwright.config.ts` pins `RECIPE_LLM_API` and `RECIPE_LLM_API_KEY`
  empty (Tg3).
- `scripts/deploy-pi.sh` (Dg10) and `deploy-pi.md` ("The model on the Pi
  (38g)").

**Not done, on purpose.** Prompt caching (each import is one call with a
different text after a short system prompt: little to save), streaming (a
recipe's answer is far below `max_tokens`; a call past the 180 s
`LLM_TIMEOUT_MS` times out as any model's does), the server-side refusal
fallback (a beta header for a risk a recipe does not carry), and a
per-call `effort` (Haiku 4.5 rejects the parameter). The 36-D4 grounding guard is unchanged and applies as it does
to qwen3.

**Rough cost** (list prices, an estimate, not measured): a recipe page is
≤ ~7 k input tokens (36-D6's 24 k-character cap) and ~1–3 k output, so a
Sonnet 5 import is a few cents and a Haiku 4.5 one about half that; a photo
page adds ~2 k image tokens at 1568 px.

**Gates.**

- `pnpm --filter recipe-editor typecheck` ✓;
  `pnpm --filter recipe-website exec tsc --noEmit` ✓.
- `pnpm exec vitest run`: **105 files, 2186 tests, all pass** (new
  `test/claudeApi.test.ts`, 25 tests: config and the URL default, the key
  never picked up from `ANTHROPIC_API_KEY`, the vision default, the request
  shape — headers, `system`, image blocks before the text, structured
  outputs with closed objects, no `temperature` — text and `usage`,
  `max_tokens`, refusal, 401, an error body capped, the 429 retry logged
  and a second 529 failing, no retry on 400, `retry-after` parsing, the key
  absent from a failed job's error, steps and files, `llmStatus`
  200/404/401 and the openai bearer, the 1568 px / 1024 px caps, a Claude
  transcription with no unload; `editorEnv.test.ts` takes the key).
- `scripts/deploy-pi.sh`: `bash -n` ✓; the `.env` rewrite dry-tested on a
  scratch "Pi" directory (`push_llm_env` with `pi` run locally): nothing
  before `.env` exists; API, key and model written beside `AUTH_SECRET` and
  `WORKSTATION_URL`, mode 600; a second run replaces the key, no
  duplicate; nothing set → `.env` byte-identical; a URL with `user:pw@`
  printed without it; a two-line value refused; the key never on the
  terminal.
- Playwright (build mode, `heavy-pw.sh`): `jobs.spec`, `settings-nav.spec`,
  `mirror-role.spec` — **26 passed** (2.2 min), including the new "/jobs
  names the model imports read with, on a mirror too, and nothing when
  there is none (38g)".
- **No real API call** was made, here or in CI; no key exists on this
  machine. The real check is Roger's, after deploying (Close-out, step 6).

#### Traps

- **Tg1 — `claude-sonnet-5` refuses sampling parameters.** `temperature`
  (and `top_p`/`top_k`) is a 400 on Sonnet 5 and the Opus 4.7+/Fable
  family; Ollama's and OpenAI's `temperature: 0` must not be copied into
  the Claude request.
- **Tg2 — A Pi `.env` line the config does not set is left alone.** The
  deploy replaces only the variables the config sets (Dg10), so a stale
  `RECIPE_LLM_URL` (say, an Ollama address) on the Pi would become the
  Claude API's URL under `anthropic`. The Pi has no LLM lines today; if one
  appears, set `RECIPE_LLM_URL=https://api.anthropic.com` in the config or
  delete the line on the Pi.
- **Tg3 — `anthropic` needs no URL, so `RECIPE_LLM_URL: ""` no longer
  pins the suite off.** An `editor/.env` with `RECIPE_LLM_API=anthropic`
  and a key would have turned the model on in every Playwright run (36-T18)
  and sent the stand-in model a Messages API request. `playwright.config`
  now pins `RECIPE_LLM_API` and `RECIPE_LLM_API_KEY` empty as well.
- **Tg4 — Sonnet 5 thinks by default.** Omitting `thinking` runs adaptive
  thinking: `thinking` blocks come before the `text` block (read only the
  text), and their tokens count against `max_tokens` and are billed.
  `claude-haiku-4-5` does not think unless asked — the cheaper choice for a
  plain transcription or extraction.

## Close-out

**What shipped, phase by phase.**

- **38a — Reader UX follow-through.** `/drinks`' seasonal row now hides
  past a 60-day window (D1, `withinDays`/`nextSeasonal`) and groups its
  ready list by drink family ("Daiquiri · 2 drinks") instead of listing
  each one bare. Tag-board counts — the homepage's intent tiles, Coming
  up, browse chips and `/tags` — now count a recipe through every alias of
  a term (D2, `termKeys`), and `/tags` prints a term's aliases. Make
  matching reads agave ages in either word order ("tequila blanco" ≡
  "blanco tequila", Da1), and a signed-in editor's "Assume I always have"
  staples save to `settings.json` and seed the browser (Da2). A
  `settings.json` write is now atomic with a cross-process lock
  (`updateSettings`), fixing a read-modify-write race that could wipe
  theme, mirrors or another device's staples (Ta6). AA contrast fixed on
  three error lines.
- **38b — Jobs polish.** `/jobs` now refreshes itself (2 s live, 10 s
  idle, paused while hidden); Jobs is its own Settings item, shown on
  every role (mirror included), while Tools stays workstation-only.
  `/new-recipe?import=<url>` prefills and waits for the Import button
  (D3) rather than starting a job on a GET. The roundup picker now shows
  each chunk's live steps instead of a silent wait. Image downloads at
  save time are paced per host like every other fetch (Db5), a host's
  403-drop is a file the whole machine's queue honours and outlives a
  redeploy (Db3/Db4), `SiteState` serves interactive waiters ahead of
  batch ones, and pacing keys by host minus `www.` rather than
  `siteKey`'s last two labels, which over-grouped CDNs and `.co.uk`
  sites (Db6). `deploy:pi` now mounts a host directory for
  `RECIPE_JOBS_DIR`.
- **38c — Import reading fixes.** A deterministic `tidy` pass now runs on
  the model's raw reading before extraction, fixing six real 36-T23–T36
  misreads (ALL-CAPS names, an "all in" total time, an unnumbered method
  split into steps, colon-less sub-headings, a source line that changed a
  pasted reading, a credit line taken as the only step) — each logged as
  a `tidy` note with its trap number. A page with several JSON-LD
  `Recipe` nodes now goes to the 36e picker instead of always taking the
  first (Dc4); a video with no recipe but one recipe link in its
  description is followed, once, through the normal import path (Dc5,
  with an SSRF fix for a private-network link). A reading is kept by spec
  hash in the job store for 30 minutes, so a `--pick` retry after a
  several-recipe refusal doesn't re-run the model (Dc6). Vimeo's `#t=`
  start times are now written, read and played.
- **38d — Shopping list v2.** `OR:` lines fold onto the row above them
  instead of standing as their own item (Dd5/Dd10), a `[text](/recipe/
slug)` line expands into its sub-recipe's ingredients when the link
  text names only that recipe (Dd1/Dd2/Dd9), amount-less lines like
  "pinch salt" merge into the measured row instead of sitting apart
  (Dd7), and "Done shopping" can hold ticks in the browser and send them
  as one `PATCH` instead of one commit per tick (Dd8/Dd13, off by
  default). Both the sub-recipe and the held-tick behaviours are
  settings, matching 35's "every feature a switch".
- **38e — Photo / recipe-card import.** A photographed or screenshotted
  recipe card can now be imported: the vision model
  (`RECIPE_LLM_VISION_MODEL`, opt-in, De1) transcribes each photo in its
  own call, then the existing pasted-text path reads, grounds and
  (36e-)splits the transcription exactly as a paste would — on the form
  ("Photo" mode, up to 4 photos), `recipes import --photo`, `/api/import`
  multipart, and `recipe_import`'s `photos`. Every photo is fitted inside
  1024 px / 0.75 MP before it is sent: a real-GPU check found a larger
  image crashes Ollama's runner on the RX 6600 (Te5), and a crashed or
  errored call now unloads the model and surfaces the server's words
  instead of reading as "no text found". "Use the photo as the recipe's
  image" commits the photo fitted to 2000 px, not the 1024 px copy the
  model read (De7).
- **38f — Content round.** No content-repo writes were needed: the
  epic-35 content round had already resolved the duplicate-merge and
  `lunch` → `sandwich` candidates, and the Sake Cosmo image had been set
  since the recipe's creation. The red-wine-spritzer citation and five
  other calls are left for Roger (see 38f Results, above).

**Roger's steps.**

1. `pnpm workstation update` on the workstation (main checkout). **No
   reindex** — no phase changed an index layout or spec version (38a's
   alias counts are read-time).
2. Turn on photo import: add `RECIPE_LLM_VISION_MODEL=qwen2.5vl:7b` to
   `websites/recipe-website/editor/.env` (the model is already pulled on
   the workstation; it's opt-in, De1). Photos are fitted to 1024 px
   (Te5: larger images crash Ollama's runner on the RX 6600).
3. Optional `pnpm deploy:pi` — it now mounts `~/recipe-editor/jobs` for
   `RECIPE_JOBS_DIR` (38b). Until the Pi is deployed, its old build
   rejects/drops 38d's new shopping keys (`features.subRecipes`,
   `holdTicks`, an item's `for`) — transient.
4. Behaviour notes: a corrupt `settings.json` now makes `PUT
/api/settings/site` answer an error instead of silently replacing it
   (38a); `/new-recipe?import=` waits for the Import button (D3); `/jobs`
   is now in Settings on the Pi too.
5. Content calls (from 38f): keep or delete
   `mermaid-lemonade-foodnetwork` / `cotton-candy-fizz-foodnetwork`; a
   source for the Spicy Cascara Highball; the Zero-Proof Spritz (only
   `zero-proof-aperol-spritz-acouplecooks` exists); the red-wine-spritzer
   citation (re-point to `/white-wine-spritzer/`, drop, or re-source);
   the 51 uncertain facet calls from epic 33 (its review list isn't
   recoverable from the doc — re-run a review if wanted).
6. **(38g) The Claude API on the Pi** — the real check, which no session
   could make (no key on this machine, never in CI):
   1. Add to `~/.config/recipe-deploy/uraninite.env` (mode 600):
      ```
      RECIPE_LLM_API=anthropic
      RECIPE_LLM_API_KEY=sk-ant-…
      # optional: RECIPE_LLM_MODEL=claude-haiku-4-5   (cheaper; default claude-sonnet-5)
      ```
   2. `pnpm deploy:pi` from a clean main with 38g merged. The switch step
      prints `.env: model settings (RECIPE_LLM_API=anthropic, key set)` —
      never the key.
   3. On the Pi editor, `/jobs` (Settings → Jobs) shows "The model imports
      read with": "The Claude API at https://api.anthropic.com
      (anthropic)", `claude-sonnet-5`, "API key: set", Status `reachable`.
      "the API key was refused" means a wrong key; "the API knows no
      model" a wrong `RECIPE_LLM_MODEL`.
   4. A URL import with `--llm force`, from the workstation against the
      Pi: `RECIPE_API_TOKEN=<the Pi's token> pnpm --silent recipes
--remote http://uraninite:3000 import <a recipe URL> --llm force
--dry-run --json` (or the Pi's `/new-recipe` with "Re-read with AI even
      if the page has recipe data" ticked, which now names
      `claude-sonnet-5`). Its job on the Pi's `/jobs` shows `llm.extract`
      with `promptTokens` / `outputTokens`, and no `queue.wait` for the GPU,
      no `llm.placement`, no `llm.unload`.
   5. A photo import on the Pi's `/new-recipe` ("Or read a photo of a recipe
      card" now shows there), or `… recipes --remote http://uraninite:3000
import --photo card.jpg --dry-run --json`: `vision.transcribe` then
      `llm.extract`, the `vision` note without "and was unloaded".
   6. Nothing to do on the workstation, which keeps its Ollama settings in
      `editor/.env`. No reindex.

**Backlog** (also added to `backlog.md`): the form's single-URL import
panel has the no-store gap the picker had (Tb5); site keys by host minus
`www.` — a public-suffix list would group subdomains properly (Db6); no
flag to bypass the 30-minute reading cache (38c); a recipe line that
names a sub-recipe without linking it isn't expanded (38d); held ticks
have no age limit (38d); a re-pulled vision model reuses kept transcripts
(Te6); `RECIPE_LLM_API=openai` against Ollama's `/v1` skips unload and
placement (Te7); (38g) "local model" in warnings and commit notes under the
Claude API (Dg9).
