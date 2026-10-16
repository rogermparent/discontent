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

### 38b

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

### 38d

### 38e

### 38f

## Results

### 38a — Reader UX follow-through

### 38b — Jobs polish

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

**Gates** — pending the heavy go (see the report).

**Real-model check** — pending the GPU.

### 38d — Shopping list v2

### 38e — Photo / recipe-card import

### 38f — Content round

## Close-out
