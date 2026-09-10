# Recipe Website UI Overhaul — "The Working Bench"

> **This is the durable source of truth for the multi-phase UI overhaul.**
> It persists in-repo so a fresh session (with cleared context) can rebuild the
> full picture by reading this file. Update the **Status** checkboxes and the
> **Decisions log** at every phase boundary. Each phase is a stacked PR and gets
> its own plan-mode pass seeded from this doc.

## Why this exists

The recipe editor app works but reads as generic and half-migrated:

- **No identity.** Homepage is two stacked card grids; no hero, no typeface. The
  app's two distinctive capabilities — **ingredient scaling** (`<Multiplyable>`)
  and **cooking timelines** — surface nowhere.
- **Half-adopted design system.** A shadcn/Radix layer exists in
  `@discontent/component-library` but native `Form/inputs/Select`/`Checkbox`
  duplicate it, raw `<button>`s bypass `Button`, and many components hardcode
  `slate/red/purple/cyan` instead of the OKLCH tokens.
- **Palette scattered & locked.** Tokens duplicated across each app's
  `globals.css`; app hardcoded to dark (`className="dark"` in `AppLayout`). No
  single place to change the palette, and no way to customize it.
- **Search cards blow out.** `SearchList` renders every matching ingredient in an
  unbounded `<ul>`; a match-heavy recipe stretches its whole grid row. Search is
  free-text only — no browse or filter.
- **Paste parsing asymmetric & brittle.** Ingredients detect headings;
  instructions only strip a number prefix — no section/step recognition, no way
  to fix mis-parses.

**Outcome:** a distinctive "Working Bench" identity (light **and** dark) driven by
one central, **fully customizable** palette; the shared design system fully
adopted; a **tag-driven** search/browse experience; smarter paste; and the
timeline as a first-class feature.

## Decisions log

- **Direction:** "The Working Bench" (see Design direction). Working Bench ships
  as the _default preset_, not a hard-coded look.
- **Color mode:** light + dark both first-class; 3-way **System / Light / Dark**
  control (via `next-themes`).
- **Palette:** one central token file in `packages/component-library` imported by
  every content-engine site; sites/users override at runtime (PR 2).
- **Theming depth:** **full end-user theming** — config + in-app Settings editor +
  live preview + switchable presets + import/export + per-component overrides.
- **Search:** tags/taxonomy as **priority filters** (weighted above name/
  ingredient); homepage browse chips feed tag-filtered search.
- **Sequencing:** foundation-first; **stacked branches/PRs, one per phase.**
- **Stack base:** branches off **`overhaul` HEAD** (not `main`). `overhaul` =
  `main` + the TanStack-form migration (Stage 5a–5d), which later PRs build on.
  _(2026-07-24: revised from the initial "base on main" after discovering the
  form-migration commits + uncommitted git-sync WIP.)_
- **git-sync WIP:** committed onto `overhaul` (commit `Git sync UI: sync panel,
conflict resolver, commit log`) before branching.
- **⌘K palette (PR 18):** _(2026-07-27)_ the palette + live search should work
  **everywhere**, so the static `export` app got the two rotted search routes
  (`/search/all` + `/search/version`, statically baked — no `force-dynamic`)
  rather than special-casing the editor. The header **Search affordance becomes
  the palette trigger** (⌘K hint on desktop, tappable on mobile). v1 scope =
  **search + navigation + actions**; deeper search (typeahead on `/search`, tag
  filtering in the palette, recent searches, descriptions, ranking) is **PR 19**.
- **Search engine: default encoder + `suggest`, not a phonetic charset
  (2026-07-28, PR 19).** The plan's original premise — that search couldn't match
  accented names — was **verified false**: the default encoder already NFKD-folds
  diacritics. Testing the alternatives showed the originally-chosen
  `Charset.LatinBalance` would actively _degrade_ quality (it is phonetic: `zzzz`
  encodes to `["s"]`, `qqq` to `["k"]`, both returning real recipes), and
  `flexsearch/lang/en` is a net negative (its 201-word stopword set contains
  `time`, `new`, `back`, `like` — "New York Cheesecake" becomes unfindable by its
  own title — and its stemmer reduces the prefix `sal` to `s` while still failing
  the `tomatoes`→`tomato` case it would supposedly fix). Neither adopted. Ranking
  rides on **`document.index` declaration order**, the only weighting lever that
  works: per-field `boost` does not exist on `FieldOptions`, and `Resolver`
  per-argument `boost` is a verified no-op (negative values silently _drop_
  results, and a Resolver carries a single `this.field` so highlights attach to
  the wrong one). The **built-in highlighter is unusable here**: it emits source
  text unescaped — an XSS sink under `dangerouslySetInnerHTML` — and it _throws_
  `q.trim is not a function` whenever a matched field is array-valued, which both
  `ingredients` and `tags` are, so a search for "flour" would crash. The existing
  React `highlightText` stays.
- **`/search` idle is a browse view (2026-07-28, PR 19).** With no query the page
  now renders the (capped) corpus behind the ticker and tag rail, replacing the
  bare "Enter a search above" prompt — the facet rail was already a browse
  affordance, and an empty results area beneath it read as a dead end.
  `next-auth` is editor-only, so the palette's Sign In/Out is an **editor-injected
  ReactNode** (not a `next-auth/react` import in shared `common/`), and the
  settings destination list is **intentionally duplicated** into `common/` to
  avoid an export→editor dependency inversion (a later PR can flip `SettingsNav`
  to read from the shared module).
- **The palette decouples from tags, and PR 21 retires them (2026-07-28, PR 20).**
  Two surfaces, one language, but not one result set: the palette is the **quick
  jump** and searches the **whole corpus**, while `/search` is the dwell surface
  that honours the tag rail. Reading `displayedRecipes` had made the palette
  silently inherit a filter it never displayed (see PR 20), so it reads
  `searchedRecipes` and instead makes the filter **visible and clearable** — a
  FILTER row, rendered last so clearing can never be what Enter does, and a "See
  all results" that clears tags before navigating rather than landing on a
  filtered page it just promised was unfiltered. Deletion affordances are shaped
  by a hard constraint: **`nested-interactive` is `wcag2a`**, so no `<button>`
  inside a cmdk `role="option"` row and none nested in `/search`'s existing chip
  button — hence ⌫ plus an `aria-hidden` `×` in the palette, and **sibling**
  buttons on `/search`.
- **PR 21 — the typed filter language (scope locked 2026-07-28).** The query
  becomes the **single source of truth**, retiring `selectedTags`/`filterMode`
  entirely: `tag:chinese (ingredient:beef OR ingredient:pork)` with the **full
  field set plus comparisons** — `tag:` / `ingredient:` / `name:` /
  `description:`, negation, `time:<30`, `before:` — a chip preview line that
  appears **only** when advanced syntax is used, and **all four** builder
  affordances (palette rows insert terms; chips are removable and cycle their
  operator; the `/search` rail emits `tag:` terms; in-field syntax autocomplete).
  PR 20 is deliberately shaped so none of its work is thrown away by it.
- **PR 21 splits 21a / 21b, and operators bind typed terms only (2026-07-28).**
  **21a is the language and the migration**; the builder layer (chip preview,
  palette rows that insert terms, removable operator-cycling chips, in-field
  autocomplete) is **21b**. The load-bearing call: **bare words stay free text
  and go to FlexSearch** (ranked, `suggest: true`) exactly as before, and only
  **typed terms** form the AST evaluated in JS over those results. The
  alternative — routing everything through the AST — would have rebuilt in JS
  the hand-rolled field tiering PR 19 deleted in favour of `document.index`
  declaration order. Two rules follow from the field being live: **an unknown
  prefix is not an error** (`foo:bar` is free text, so a colon in an ordinary
  search never traps the user), and **the parser never throws** — it runs on
  every keystroke, so `tag:`, `time:<` and `(ingredient:beef OR` all have to
  resolve to something usable. `time:` needed a corpus change (`prepTime`/
  `cookTime`/`totalTime` onto the index value); `before:`/`after:` needed
  nothing, since `date` was already on every entry. The AND/OR toggle is
  **deleted** rather than ported: OR is something you type now, which is visible
  and shareable in a way a mode flag on one rail never was — and the palette's
  PR-20 FILTER row goes with it, because there is no hidden state left to
  surface.
- **The builder layer splits again, 21b / 21c, along the mechanism (2026-08-11).**
  Three of the four affordances above are **one** thing wearing three hats:
  rewriting the query string from a term's position. They are **21b**. In-field
  autocomplete is not — it needs a caret, its own keyboard contract against
  Enter-flushes-debounce, and a popup primitive this repo does not have — so it is
  **21c**. The load-bearing call inside 21b: chips key on **token offsets threaded
  into the AST**, not on matching a term's value. Two reasons, and the second
  decides it. Value-matching has no well-defined edit for a query that names one
  term twice; and leaf `value` is **pre-folded**, so a chip built from the payload
  would show `tag:creme` to someone who typed `tag:Crème`. `raw.slice(start, end)`
  is the only thing that renders what is actually in the field. The tokenizer
  already recorded the offsets, so this is propagation rather than parsing, at the
  cost of AST equality becoming position-sensitive (the unit tests strip spans
  where they are comparing grammar).
- **Deferred:** the **git-cluster dedup (step 1f)** is dropped from PR 1 — the
  `git/` files are being actively rewritten by the git-sync feature; revisit
  after that lands.
- **Light-mode contrast:** the app now renders light in the axe tests (system
  default), which exposed contrast gaps. Light `--primary` (ember) was darkened
  to `oklch(0.53 0.16 50)` to clear 4.5:1 with white text, and a pre-existing
  hardcoded `text-blue-400` link in `List/FeaturedRecipe` was retokened to
  `text-primary`. Axe WCAG2AA suite is green; the fuller pass is PR 7.
- **Known pre-existing test failures (not from this PR):** two editor-form
  visual tests — `edit form with slug conflict shows Overwrite` and `markdown
editor source mode active` — fail identically on the base commit
  (`37d72617`); they're broken by the in-progress TanStack-form migration.
  _(Resolved in **PR 4.2** — see below.)_
- **PR 4.2 — TanStack-form / Lexical migration repaired + suite greened
  (`ui/04.2-form-fixes` ← `ui/04.1-visual-fixes`, top of stack, no rebase).**
  Investigation reclassified the 23 red tests: a few real form bugs plus a lot of
  overhaul-induced test hygiene. Fixes:
  - **A1 (spike):** the `new-recipe` "submit never lands" failures were **not** a
    migrated-form runtime error — the recipe is created fine; the tests' final
    `getByText(name)` on the homepage now double-matched **PR 4's hero `<h2>`**
    and the list `<h3>`. Scoped those to the `recipe-list` testid (same class as
    B2). The form submit path is sound; no server changes.
  - **A2:** `LexicalMarkdown` rich→source toggle now **synchronously serialises**
    (`editor.read($exportRecipeMarkdown)` via a `CaptureEditor` ref plugin, gated
    on interaction) so a just-inserted node isn't missed by the async
    update-listener.
  - **A3:** added `MultiplyableNode.importDOM` (+ a `data-lexical-multiplyable`
    marker on `exportDOM`) so HTML copy-paste round-trips; clears the dev warning.
  - **B1/B2:** `git.spec` — scoped `getByRole("radio")` to `branchesSection`
    (excludes PR 1's theme toggle) and the hero-name `getByText` collisions to
    `recipe-list`.
  - **C1:** the NextAuth default sign-in page's `#submitButton` (stock `#157efb`,
    3.9:1 on white) now uses `theme.brandColor: "#b14700"` — the light `--primary`
    ember (`oklch(0.53 0.16 50)`, 5.57:1). `accessibility.spec` sign-in test
    un-`test.fail`ed and green.
  - **D1:** pinned `colorScheme: "light"` in `playwright.config.ts` so baselines
    can't drift light/dark.
  - **D2:** regenerated the genuinely-stale form baselines (`new-recipe-form`,
    `-overwrite`, `edit-form-populated`, `-overwrite`, `markdown-source-mode`,
    `paste-replace-imported-ingredients`), each visually confirmed as a correct
    Working Bench render (no dev overlay, tokenised buttons).
  - **Dev-mode hydration flake (root-caused):** the biggest source of suite noise
    was a controlled input / React click interacted-with **before the recipe-form
    island hydrated** (the value gets reset to empty, or the click is swallowed).
    Added a `markdownEditorReady(page, name)` helper that waits for Lexical's
    `data-lexical-editor="true"` marker (set in the same hydration commit that
    attaches handlers) and gated the form specs (yield, timeline, youtube,
    ytdlp, paste-replace, reference-updates, new-recipe, edit, \*-duplicate-slug,
    ingredient-preview) on it. Full `--project=e2e --project=mobile` green.
- **PR 5 — Smarter paste: symmetric heading detection + live review
  (`ui/05-paste` ← `ui/04.2-form-fixes`, top of stack, no rebase).** Shipped as
  **one PR** — a parser-only stage couldn't be CI-verified without the UI (no
  unit-test harness exists; Playwright is the only runner).
  - **Shared `detectHeading` (`common/util/detectHeading.ts`).** Conservative OR
    of three high-precision rules on an already-trimmed line: trailing colon
    (`/:\s*$/`, reproduces the old ingredient rule), `For the|your …` prefix, and
    ALL-CAPS (≥2 letters, no trailing sentence punctuation). Deliberately biased
    to **under-detection** — a false heading silently re-shapes the persisted
    tree, a missed one is a one-click promote in the review UI. `Step N` / `N.` /
    `a)` stay strippable _prefixes_ (handled by the step-number stripper), never
    headings. `parseIngredients.ts` swapped `endsWith(":")` → `detectHeading`;
    colon is still not stripped from ingredient text (unchanged).
  - **Instruction grouping fold.** `parseInstructions` is now a `parseToLines` +
    `assemble` pair: a single-pass fold accumulates flat `Instruction`s until a
    `detectHeading` line opens a new `InstructionGroup` (pushed once by
    reference, mutated as later steps nest in); lines before the first heading
    stay flat. No-heading input is byte-identical to the old flat parser (guards
    the regression specs). The data model, form Group/Ungroup UI, and detail
    rendering already existed — only the parser was missing.
  - **PasteField → always-on live review.** Introduced a flat, type-agnostic
    `ParsedLine { text; isHeading }` intermediate so both lists share one review
    surface; the flat-vs-grouped divergence lives in a per-type `assemble`. The
    textarea is the raw source of truth (its `onChange` re-derives `lines`,
    resetting toggles); a read-only per-line review list under it exposes a
    heading toggle (`Toggle Heading Line {n}`) that refines the derived model
    before Import. Review rows are **local state, not `form.Field`** (no `name=`),
    so they can't collide with `instructions[N]…` / `ingredients[N]…` FormData
    keys. `assemble(parseToLines(v))` reproduces the old `parseFunction(v)`
    exactly, so the one-click path (fill → Import, no toggling) is unchanged —
    which keeps the ~10 existing paste specs green with zero edits.
  - **Symmetry.** Heading detection + review apply to **both** ingredient and
    instruction paste. Ingredient headings stay flat (`type: "heading"`, no group
    nesting) — matching the current model and view; only instructions nest.
  - **Tests:** new `paste-review.spec.ts` (demote a mis-detected ALL-CAPS/`:`
    heading → lands flat; promote a plain line → becomes a group/heading; both
    lists) + new-recipe grouping specs (`For the dough:` / `Bake:`, ALL-CAPS +
    `For your …`, no-heading regression). All existing paste specs unchanged.
    Full `--project=e2e --project=mobile` green; `tsc` clean for editor +
    component-library. No baseline regen needed (paste `<details>` is collapsed
    in form baselines, so the review list isn't captured; ingredient assemble
    output is identical).
- **PR 7 — A11y + motion (`ui/07-a11y-motion` ← `ui/06-detail-timeline`, top of
  stack, no rebase).** Exploration found the app already largely accessible, so a
  targeted gap-closing pass: focus rings on the two Badge-buttons that lacked them
  (TagFilterRail, Form/Tags), keyboard-activation for the Timeline offset grip, a
  global `prefers-reduced-motion` guard in both app `globals.css`, and shared-kit
  convergence (`dialog` dark-bg → token, `sheet`/`slider` → house focus ring),
  committed separately since it touches all content-engine sites.
  - **Contrast = axe-only, expanded.** Per the decision to verify AA by axe at
    runtime (not a computed-ratio linter), the sweep grew from _light + 3 presets +
    `/`_ to _every preset (working-bench included) × light/dark × 3 pages + 2
    off-preset custom themes × light/dark_. This is the "custom themes in both
    modes" guarantee.
  - **Dark `--destructive` nudge.** The new dark axe caught the `bg-destructive
text-white` Delete button at 2.92:1 (needs 4.5) — the dark `--destructive` was
    never axe-verified. Darkened `theme.css` `.dark --destructive` `L=0.70 → 0.577`
    (→ 4.78:1), a surgical single-token fix. Dark-only, so light visual baselines
    (pinned light in `playwright.config`) don't move. Precedent: the PR-1 light
    `--primary` darkening.
  - **Deferred: light-mode teal-band curve gap.** The sweep also exposed that the
    light accent curve `oklch(0.53 0.16 h)` dips to ~4.31:1 at hue ~190 (fails only
    for a _custom_ teal accent; no built-in preset is in the 165–215 band). Fixing
    it is a contrast-curve redesign that would shift light baselines — explicitly
    out of PR 7 scope; documented as a follow-up. Custom test hues (berry 320,
    amber 25) sit outside the band.
- **Improvement Tour (PR 9–12) framing.** With the overhaul on screen, three
  shipped surfaces read as unfinished (masthead, homepage hero, detail scale
  bar). PRs 9–12 are a _tour back_ through those surfaces to raise them toward
  proven recipe-site conventions (NYT Cooking / Serious Eats / King Arthur) —
  layout/component/hierarchy work only. **Working Bench tokens, fonts, and the
  theming engine are kept verbatim; no palette change.** The paste review UI
  (PR 5) is explicitly kept as-is (the reference "review" pattern). Search/tag
  depth (FlexSearch features + tags surfaced in more places) folded into PR 12
  per user request.
- **PR 9 — Header refit (`ui/09-header` ← `test/editor-server-isolation`).**
  Rebuilt the two-row centered masthead into one sticky row: wordmark + a
  lightweight ember-square mark on the left, `Bookmarks` / `Search` / a single
  `Appearance` control on the right. The two chunky appearance eyesores (the
  empty-looking preset `Select` and the triple outlined theme toggle) are
  consolidated into **one ghost icon button → new `ui/popover`** holding a
  labeled "Theme" segmented control + "Preset" select; the mobile hamburger
  `Sheet` hosts the same `AppearanceControls`. New `ui/popover.tsx`
  (`@radix-ui/react-popover`) matches the dialog/tooltip house styling.
  - **Wordmark stays an `<h1>`.** The plan objected to a _centered h1 on its own
    row_, not to the heading semantics. Every index page (Homepage, Bookmarks,
    Featured, All Recipes, Search) uses `PageHeading` at `h2` and relied on the
    masthead for its page `h1`; de-semanticizing the wordmark would open an a11y
    gap across all of them (out of PR 9 scope). So the wordmark is now
    left-aligned and inline but remains the `h1` — zero blast radius into content
    pages, and `navigation.spec`'s "click the site title" + the homepage
    `heading level 1` assertions stay valid.
  - **ThemeToggle de-chunked.** Same 3-way `ToggleGroup` (roles unchanged:
    `role="group"` "Color mode" + `role="radio"` items), restyled from three
    outlined squares into a segmented control on a muted track with the active
    option lifted onto the card surface.
  - **`--header-height` var** added to `theme.css` `:root` (a layout constant,
    not a themeable color). The sticky masthead reserves it; the detail page's
    still-present scale bar was offset `top-0` → `top-[var(--header-height)]` so
    the two stickies don't overlap (that bar is fully removed in PR 11).
  - **Root-caused an app-wide icon-size bug.** Adding icons to the masthead
    surfaced that `globals.css` carried an **unlayered** `svg { width:100%;
height:100% }` (a Lighthouse-era tweak, #27). An unlayered rule beats every
    Tailwind `@layer utilities` declaration, so `size-4` / `w-6` lost and every
    icon silently inflated to fill its parent — invisible inside fixed-size
    buttons, catastrophic (~100px) in the new flex nav anchors. Fix: wrap the
    rule in `@layer base` in **both** apps' `globals.css` so utility sizing wins;
    unsized SVGs still stretch. This corrects icon rendering across the whole app
    (buttons, the oversized BookmarkButton, the schedule chevron) and pre-pays
    part of PR 12's BookmarkButton shrink. _Gotcha logged: the dev server can
    serve a stale compiled `globals.css` after this kind of edit — verify against
    a Playwright-managed server (or `rm -rf .next`), not a hot-reloaded one._
  - **Global chrome → all baselines regenerated.** The masthead + the icon-size
    fix touch every page, so every full-page baseline shifted. PR 9 regenerates
    the whole e2e+mobile snapshot set (not just the masthead) to stay green;
    PR 10/11 further update their content-specific baselines on top.
- **PR 10 — Homepage hero, timeline-led (`ui/10-homepage` ← `ui/09-header`).**
  The hero led with a lone **Multiply** control floating in an empty card — a
  scaler is useless on an index page. Reworked it into a conventional
  featured-recipe hero: the **cook timeline** (the app's signature) is the
  centrepiece, with a clamped description, a Prep·Cook·Total·Yield meta strip,
  and a "View recipe" CTA. Scaling moved off the homepage entirely (it lands in
  the Ingredients header in PR 11). `HeroLivePanel` de-clientised to a plain
  server component; a `StaticMultiplyable` passthrough keeps `<Multiplyable>`
  yield/ingredient markup rendering at base scale without a provider. A
  never-bare fallback ladder (timeline → description+meta → ingredient teaser)
  fixes the empty-hero look on sparse fixtures. `TimelineStrip` grew a
  backward-compatible `size="lg"`/`legend` so the detail page's strip is
  untouched.
- **PR 11 — Detail meta bar + scaler's new home (`ui/11-detail-scaler` ←
  `ui/10-homepage`).** Killed the full-width sticky "MULTIPLY" bar that sat in an
  empty band, gave the hero a canonical **Prep · Cook · Total · Yield** meta strip
  (new `MetaBar` in `View/shared.tsx`; zero-valued prep/cook dropped rather than
  shown as "0 min"; Yield relocated here and still scales in place), and moved the
  scaler into the **Ingredients header** as a segmented **½× · 1× · 2× + custom**
  control (clicking a preset writes its value into the custom field — one source
  of truth via the multiplier `input`). The custom field keeps the accessible
  name "Multiply" so existing scale-by-typing flows/specs hold. The scaler's
  header is `position: sticky` within the column (contained, not page-wide), so
  it stays reachable without the empty band.
  - **Scaler now requires ingredients.** It lives in the Ingredients section, so
    a recipe with **no ingredients** has no scaler (the yield.spec's yield-only
    recipe grew an ingredient; the featured-recipe fixture, being empty, simply
    shows no scaler — correct, nothing to scale).
  - **Label shortening rippled into specs.** `Prep Time`/`Cook Time`/`Total Time`
    → `Prep`/`Cook`/`Total` on the detail page broke `getByText("… Time")`
    detail assertions in `new-recipe`/`edit` specs (form-field `getByTitle("…
Time Minutes")` were left alone); updated them, and the "only total time"
    test now asserts prep/cook are _absent_ (no "0 min").
  - **Gotcha: `--update-snapshots` won't rewrite a sub-tolerance diff.** Removing
    the small "MULTIPLY" box from the empty featured-recipe page was under the 2%
    `maxDiffPixelRatio`, so `--update-snapshots` left the stale baseline in place
    (it still showed the old bar). Fix: **delete the baseline file** and let the
    run recreate it. A `rm -rf .next` between builds also proved necessary to
    dodge stale compiled output.
- **PR 12 — Site-wide polish + search/tags (`ui/12-polish` ←
  `ui/11-detail-scaler`).** The "improve all around" sweep once the three
  headline surfaces were fixed. Recipe cards (`List/*`, `ClientList`,
  `SearchList`) got the display face on names, mono/tabular `<time>` dates, a
  bench-toned monogram placeholder for image-less cards (replacing the flat gray
  box), a quiet linked tag hint (`RecipeCardTagHint`), and a slightly roomier
  grid. `BookmarkButton` shrank to a `size-5` glyph in an `icon-sm` ghost button
  on a token backing (dropped the hardcoded `bg-slate-400/25` and
  `text-yellow-500` → `bg-background/80` + `text-primary`). Empty states
  (featured, search-no-results, homepage) converged on the shared `EmptyState`
  with house-voice copy + a clear action, retiring a hardcoded `bg-slate-700`
  link. **Search/tags fold-in (user request):** the client re-rank became a
  stable **name > tag > ingredient** tiering over FlexSearch's merged results
  (tags earn priority; name hits lead), and tags now surface on the plain cards,
  not just search cards.
- **PR 6 — Detail + timeline: toggle-able schedule, sticky scale, print, retheme
  (`ui/06-detail-timeline` ← `ui/05-paste`, top of stack, no rebase).**
  Exploration corrected the doc's PR 6 brief — the two-column layout and an
  interactive `TimelineView` already existed, so the work was replace/retheme,
  not net-new. Shipped as one branch:
  - **Toggle-able schedule (`View/Schedule`, `RecipeSchedule`).** Collapsed by
    default it shows a read-only compact strip per timeline (name, note, total,
    proportional bar; hands-on events in ember `primary`, rests quiet `muted`) —
    the plan at a glance, and what prints. An **"Adjust schedule"** disclosure
    (`aria-expanded`, stable accessible name) **swaps** those strips in place for
    the kept-and-rethemed interactive editor (resizable durations, zoom, offsets,
    overlap warnings). Swap (not additive) so only one representation is ever in
    the a11y tree on screen, avoiding a duplicate `Timeline: <name>` name; print
    always restores the strips.
  - **Editor retheme.** `View/Timeline/index.tsx`'s hardcoded slate/amber/blue
    palette → Working Bench tokens: surfaces `bg-card`/`bg-background`/
    `border-border`, active (hands-on) = ember `primary/20`, overlap conflict =
    `destructive`, all durations in `font-mono tabular-nums`. Roles/labels
    (`Timeline: <name>` region, `Timeline container` group, `Timeline zoom
multiplier`, `Step N duration in minutes`, `article` names) unchanged, so
    `timeline.spec` gained one "expand first" click per interactive test, not a
    rewrite. Editor duration text moved to the compact format (`1h`, not `1h 0m`).
  - **Sticky scale bar.** `MultiplierInput` + `MultipliedServings` extracted from
    the hero into a slim `sticky top-0 bg-background/90 backdrop-blur border-b`
    bar above the two-column section (`print:static print:hidden`). `MultiplierInput`
    reused verbatim, so `getByLabel("Multiply")` is unchanged. Prep/Cook/Total
    `InfoCard`s stay in the hero (they don't scale).
  - **`InfoCard` retheme.** Now a bench card surface (`bg-card border`) with a mono
    uppercase eyebrow label and a `font-mono tabular-nums` value — ties Prep/Cook/
    Total and Multiply/Yield into the numeric language. (Shared with the hero's
    scale/yield cards; the homepage baselines did not diff — the hero fixtures
    don't surface them at the captured size.)
  - **`formatDuration` consolidated** to `common/util/formatDuration.ts`
    (`formatDurationLong` "1 hr 30 min" for InfoCards, `formatDurationCompact`
    "1h 30m" for strips/editor), collapsing the 4 inline copies. `TimelineStrip`
    extracted to `common/components/TimelineStrip` as the shared read-only strip;
    `CompactTimeline` (hero) is now a thin wrapper over it (hero byte-identical).
  - **Print stylesheet.** A shared `@media print` block (kept in sync across both
    apps' `globals.css`) forces the schedule strip's segment fills and the
    checklist boxes to survive the browser's background-stripping, and avoids
    page-breaks inside an ingredient/step. Screen chrome (sticky bar, Reset,
    Bookmark, tags, image/video, header/footer) hidden via `print:` utilities.
  - **Tests.** `timeline.spec` reworked (collapsed-strip at-a-glance assertion +
    an in-test print check; interactive assertions expand first; compact
    durations). `recipe.spec` gained a sticky-scale-in-viewport test and a
    print-media test (ingredients shown, scale bar + Reset hidden). Full
    `--project=e2e --project=mobile` green; editor `tsc` clean. Regenerated only
    the 4 detail-page baselines a real diff touched — `recipe-6-multiplied`,
    `recipe-detail-signed-out`, `recipe-detail-signed-in`, `recipe-mobile` — each
    visually confirmed a correct Bench render. Homepage/hero, featured-detail, and
    all form baselines unchanged.
- **PR 2 split → 2a / 2b (2026-07-24).** 2a = the theming **engine** + the
  owner's editor + built-in presets + live preview, applied to the **editor
  app**, with the site default persisted in the editor's `settings.json`. 2b =
  baking the site default into the static **export** build, import/export JSON,
  per-component overrides, and user-saved named presets. Rationale: 2a is a
  self-contained, testable engine; export baking + advanced overrides are a
  separable second slice.
- **Theming contract (2a).** A theme is a small set of _knobs_
  (`{accentHue, neutral, radius, fontPairing, defaultMode}`) in
  `packages/component-library/theming`, **derived** into per-mode OKLCH tokens on
  the PR-1 contrast curve (accent L/C fixed, only hue moves; neutral shifts
  hue/chroma at fixed lightnesses) — so **every** accent/neutral choice stays
  WCAG2AA by construction (verified in `accessibility.spec.ts` across presets).
  - **Injection is two-layer, flash-free.** Site default (owner): editor
    `layout.tsx` reads `readSettings()` → `AppLayout` renders a `:root{}/.dark{}`
    `<style data-theme-default>` as the first child of `<body>` (wins over
    `theme.css` by source order; SSR, no JS, both modes). Visitor override + live
    preview: `ThemeVarsProvider` (in `common`, inside `AppProviders`) applies the
    **resolved mode's** tokens as **inline vars on `<html>`** keyed on
    next-themes' `resolvedTheme`; a blocking pre-paint `<script>` in `AppLayout`
    mirrors it from `localStorage` before first paint.
  - **localStorage keys:** `ce-theme` (knobs), `ce-theme-vars` (resolved
    `{light,dark}` maps read by the pre-paint script), `theme` (next-themes mode).
  - **Fonts:** `next/font` is build-time, so all pairings are pre-registered in
    `AppLayout/fonts.ts` on suffixed vars (`--ff-display-<key>`, …); `theme.css`
    binds the roles to the `bench` pairing by default, and the engine switches
    them to `var(--ff-*-<pairing>)`.
  - **Persistence:** `Settings.theme?` in the editor; `updateSettings`
    merge-preserves other fields, validates via `parseTheme`, and
    `revalidatePath("/", "layout")`. `getSiteConfig()` stays env-only.
- **Owner-chrome pass = PR 13–15 (2026-07-26).** Confirmed scope for the footer
  rethink: **columns + colophon + social/contact** (the "go further" option, not
  a minimal tidy). Status colors → **real `--success/--warning/--info` tokens**
  (not one-off retokens), needing a light+dark axe pass. Settings → **a page per
  area** behind a **sidebar** (instrument-rack styling on the existing
  `--sidebar*` tokens; no shadcn sidebar primitive), Theme on its own route. Ship
  as **3 stacked PRs** off `ui/12-polish`.
- **Footer plumbing rendered in PR 13, edited in PR 14 (2026-07-26).** The footer
  note + contact fields are wired end-to-end now (settings → editor layout,
  env-baked → export layout) but the owner-facing edit form is deferred to the
  PR 14 settings work, so PR 13 stays a pure footer/layout change.
- **Settings shell is pathname-gated, not a route-group move (2026-07-27).** The
  `(editor)` group also serves the public catch-all pages (`/about`) and the
  menu/page edit forms, so putting the sidebar directly in `(editor)/layout.tsx`
  would leak it onto `/about`. A client `SettingsShell` gates on the path
  (`/settings|/git|/export|/menus|/pages`) and renders bare otherwise — avoiding
  a route-group restructure and fixing the latent bug where the old sub-footer
  already leaked onto `/about`. Edit forms under those prefixes (`/menus/edit`,
  `/pages/new`) do keep the sidebar (consistent "you're in this area" context).
- **Reworked to a nested `(settings)` layout + full-bleed (2026-07-27).**
  Superseded the pathname-gated shell with a real `(editor)/(settings)` route
  group + nested `layout.tsx`, and extracted a reusable `SidebarLayout` primitive
  (`common/components/SidebarLayout`). The sidebar now hugs the **left screen
  edge** (outer `w-full` overrides the body's `items-center`) with a wide content
  column, instead of insetting inside the centered `max-w-6xl` box. Edit forms
  (`/menus/edit`, `/pages/new`, `/pages/edit`) now sit **outside** the group and
  render bare like recipe editing — reversing the earlier "edit forms keep the
  sidebar" call. Dropped "Back to site" + "Sign Out" from the sidebar (masthead +
  footer already cover them); the drawer auto-closes on route change inside
  `SidebarLayout`, so the nav node stays a plain, decoupled `sidebar` prop.
- **Status tokens are real palette tokens, WCAG-verified (2026-07-27).**
  `--success/--warning/--info` mirror the `--destructive` methodology (light
  L=0.53, dark L≈0.70–0.75) so a single token works both as `text-*` on the
  background and as a `bg-*` fill under its `-foreground`. Verified numerically
  (OKLCH→sRGB→WCAG) **and** with a new git-page axe test in both modes, since the
  status colors live on editor surfaces the reader-page axe sweep never visits.
- **Settings redesign → contained + segmented + carded (2026-07-27).** Reversed
  the full-bleed sidebar: `SidebarLayout` now wraps its aside + content in one
  centered `mx-auto max-w-6xl px-3 sm:px-4` box (the masthead recipe), so the
  aside's left edge aligns **under the wordmark** with a gutter on both sides
  instead of reaching the screen edge. The over-narrow, three-concerns-in-one
  `/settings` page split into **three focused pages** — Site details (`/settings`),
  Tools (`/settings/tools`), Maintenance (`/settings/maintenance`) — each built
  from a uniform `SettingsCard` (the shadcn `Card` family) at a wider `4xl`
  content width, fields still stacked. The **⌘K command palette** (site-wide
  search + actions) is the planned next PR, out of this one's scope.

## Stacked-PR roadmap

Each branch is off the previous. Rebase children after a parent merges.

| PR  | Branch (← parent)               | Status        | Scope                                                                                                                                                                                                                                               |
| --- | ------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ui/01-foundation` ← `overhaul` | ✅ done       | This doc, central palette, typography, 3-way theme, shadcn dedup, primitives                                                                                                                                                                        |
| 2a  | `ui/02a-theming-engine` ← 01    | ✅ done       | Theming engine + owner theme editor + built-in presets + live preview (editor app); site default in `settings.json`                                                                                                                                 |
| 2b  | `ui/02b-theming-export` ← 2a    | ✅ done       | Bake site default into the static export build (`SITE_THEME` env), import/export theme JSON, owner-saved named presets                                                                                                                              |
| 2c  | `ui/02c-theming-overrides` ← 2b | ⏸️ deferred   | Per-component raw-token overrides (`--destructive`, `--chart-*`, …) behind a disclosure; expose owner presets to public visitors — **skipped for now**                                                                                              |
| 3   | `ui/03-search-tags` ← 2b        | ⤴️ superseded | Tall-card fix, tags taxonomy as priority filters, search-page filter-chip rail (AND/OR), tag display on detail/cards — the chip rail was replaced outright by PR 21a's query language                                                               |
| 4   | `ui/04-homepage` ← 03           | ⤴️ superseded | Working Bench homepage + live hero — rebuilt from scratch by PR 10's timeline-led hero                                                                                                                                                              |
| 4.2 | `ui/04.2-form-fixes` ← 04.1     | ✅ done       | Repair TanStack-form / Lexical migration (submit, source-toggle serialise, `importDOM`); fix overhaul-induced selector collisions; sign-in contrast; regen stale form baselines; root-cause + gate dev-mode hydration flake → full e2e+mobile green |
| 5   | `ui/05-paste` ← 04.2            | ✅ done       | Symmetric `detectHeading` (trailing-`:` / `For the …` / ALL-CAPS) for both parsers; `parseInstructions` folds steps into `InstructionGroup`s; always-on live paste review with per-line heading toggle                                              |
| 6   | `ui/06-detail-timeline` ← 05    | ✅ done       | Toggle-able schedule (compact strip → rethemed editor), sticky scale bar, print stylesheet, `formatDuration` dedup + `TimelineStrip` extraction, detail retheme                                                                                     |
| 7   | `ui/07-a11y-motion` ← 06        | ✅ done       | Focus rings on 2 gap buttons, Timeline offset keyboard-activation, global `prefers-reduced-motion` guard, shared-kit focus/dark-bg fixes, dark + custom-theme axe sweep (found + fixed dark `--destructive` AA fail)                                |
| 8   | `test/editor-server-isolation`  | ✅ done       | Isolate the editor test server off port 3010; guard specs against foreign DOM                                                                                                                                                                       |
| 9   | `ui/09-header` ← 08             | ✅ done       | Single sticky masthead (wordmark+ember mark left; Bookmarks/Search/Appearance right); new `ui/popover` primitive; consolidate ThemeToggle+PresetPicker into one Appearance popover / mobile sheet; `--header-height` var                            |
| 10  | `ui/10-homepage` ← 09           | ✅ done       | Timeline-led homepage hero (drop the scaler; TimelineStrip as the signature; meta line; never-bare fallback)                                                                                                                                        |
| 11  | `ui/11-detail-scaler` ← 10      | ✅ done       | Detail hero meta bar (Prep\|Cook\|Total\|Yield); kill the standalone sticky scale bar; scaler → Ingredients heading (½·1·2 + custom)                                                                                                                |
| 12  | `ui/12-polish` ← 11             | ✅ done       | Uniform image-forward cards, BookmarkButton shrink, house-voice empty states, FlexSearch/tag-driven search polish, instrument consistency                                                                                                           |
| 13  | `ui/13-footer` ← 12             | ✅ done       | Rethink the shared site footer: colophon plate (brand block + social/contact icons + menu-driven columns + colophon bar); fix Sign In/Out to a link-styled control; owner "Manage" column (editor-only); footer note + contact plumbing (both apps) |
| 14  | `ui/14-settings` ← 13           | ✅ done       | Replace the hardcoded sub-footer with a settings sidebar (instrument rack); a page per area; Theme → its own `/settings/theme` route; mobile drawer; General page gains the editable Site details (footer note + contact) form                      |
| 15  | `ui/15-tokens` ← 14             | ✅ done       | Semantic status tokens (`--success/--warning/--info`); retokenize ~15 hardcoded-color files; fixed-width mono instruction step numbers; card-ify menus/pages tiles; git h1→h2; light+dark axe sweep (added git-page coverage)                       |
| 16  | `ui/16-settings-nested` ← 15    | ✅ done       | Settings sidebar → nested `(settings)` layout + full-bleed + reusable `SidebarLayout`                                                                                                                                                               |
| 17  | `ui/17-settings-redesign` ← 16  | ✅ done       | Settings redesign → contained layout + segmented pages + card sections (plus `ui/17-settings-polish`: sidebar left-bleed, uniform 4xl page width)                                                                                                   |
| 18  | `ui/18-command-palette` ← 17    | ✅ done       | ⌘K command palette + export search parity                                                                                                                                                                                                           |
| 19  | `ui/19-search-centerpiece` ← 18 | ✅ done       | Search as centerpiece + FlexSearch engine upgrade                                                                                                                                                                                                   |
| 20  | `ui/20-palette-search` ← 19     | ✅ done       | The palette joins the search language                                                                                                                                                                                                               |
| 21a | `ui/21a-query-language` ← 20    | ✅ done       | The query becomes the only filter — this is what superseded PR 3's chip rail                                                                                                                                                                        |
| 21b | `ui/21b-builder-layer` ← 21a    | ✅ done       | The builder layer: a chip preview line, chips that cycle their operator and remove themselves, palette rows that insert terms                                                                                                                       |
| 21c | `ui/21c-autocomplete` ← 21b     | 🟡 next       | In-field syntax autocomplete — the fourth PR-21 affordance, held back for its own keyboard contract and for having no combobox primitive to build on                                                                                                |
| 22  | `agent/22a-provenance` … `22e`  | 🟡 next       | Agent curation (provenance, groups/meal plans, curator CLI, remote write, Claude Code skill) — tracked in its own doc, **`docs/agent-curation.md`**; a separate stack off `content-engine-test`, not off 21c                                    |

_(Table reconciled 2026-07-31.)_ It stopped at 15 while 16 through 21a had
shipped and were merged into `content-engine-test`, and it left PRs 3 and 4
sitting 🟡 when later PRs had replaced their work rather than finished it. Two
`ui/17-*` branches exist because the redesign and its polish pass landed
separately; both are in the same row.

## Design direction — "The Working Bench"

A _working_ recipe index, not a food blog. The surface is a kitchen bench; the
recipe's data (quantities, times, schedule) is the material. Utilitarian but
warm, equal in light and dark.

**Color** — remapped onto the existing shadcn token slots so the whole primitive
layer inherits it: warm-neutral bench + copper/ember accent, kept off the
cream+terracotta cliché by pairing ember with a cool steel neutral.

- `--background` bench: light `oklch(0.98 0.006 85)` · dark `oklch(0.17 0.012 260)`
- `--card`: one step raised per mode
- `--primary`/action ember (copper): `oklch(0.70 0.16 55)`
- `--ring`: ember at reduced chroma
- Neutrals: low-chroma warm slate. Values are the direction; exact OKLCH is
  finalized in implementation and contrast-checked in both modes.

**Type** (added via `next/font`), three content-driven roles:

- **Display** — condensed grotesque (Archivo / Space Grotesk): headings & labels.
- **Body** — humanist sans (Public Sans / Inter): prose, instructions.
- **Utility/mono** — mono w/ tabular figures (Spline Sans Mono / JetBrains Mono):
  **quantities, durations, timeline times, eyebrow labels**. Numbers are a
  recipe's data and tie to the scaling feature — the signature typographic move.

**Layout** — asymmetric bench hero (featured photo tile + live panel), a
browse-chips row, then Featured / Latest grids.

**Signature** — the hero's **live panel**: the featured recipe's quantities scale
in place and its timeline renders as a compact schedule strip. One bold element;
everything else stays quiet.

## Phase detail

### PR 1 — Foundation `ui/01-foundation`

- [x] **1a** Durable plan doc (this file)
- [x] **1b** Central palette + typography: token blocks extracted to
      `packages/component-library/styles/theme.css`, imported by editor + export
      `globals.css` via a relative path (identical depth from both apps). Working
      Bench values applied in light + dark. Three fonts loaded via `next/font` in
      the shared AppLayout (`--ff-display/-body/-mono`), mapped onto
      `font-display/-sans/-mono`.
- [x] **1c** 3-way theme control: `next-themes` provider (defaultTheme=system) in
      AppProviders replaces hardcoded `<html className="dark">`; `ThemeToggle` on
      `ui/toggle-group` added to header (desktop + mobile sheet). Uses
      `useSyncExternalStore` for the mount guard (lint forbids setState-in-effect).
- [x] **1d** Token-drive primitives: `ui/button.tsx` variants rebound to
      `bg-primary/-destructive/-secondary`; shared `baseInputStyle` +
      `Errors` + markdown-toolbar/Lexical-node/Video-error colors retokened, which
      cascades to every hand-rolled input. **Deferred:** consolidating the native
      FormData `Select`/`Checkbox` onto Radix `ui/*` → form PRs (3/5/6), since they
      submit via native name attributes; retokened for now.
- [x] **1e** Off-system app buttons → `Button`: editor `layout.tsx` Sign In/Out
      (two forms merged into one), `Homepage` "More" link (Button asChild).
      Markdown links retokened in 1b. `SearchResultsModal`'s `<button>` left as a
      bare card-click wrapper on purpose. `git/CommitLog` moves with 1f.
- [x] **1g** Added `ui/card` + `ui/badge` primitives; `RecipeCard` given a token
      border + `card-foreground` (kept as a compact media card, not the padded
      Card shell).
- ~~1f git-cluster dedup~~ — **deferred** (see Decisions log).

### PR 2 — Full end-user theming (split into 2a / 2b)

Lives in `packages/component-library` so every content-engine site inherits it.

#### PR 2a — Theming engine + owner editor `ui/02a-theming-engine` ✅ done

- [x] **theming module** `packages/component-library/theming/` — knob model
      (`types.ts`), contrast-safe derivation (`derive.ts`), CSS/vars serializers
      (`serialize.ts`), built-in presets (`presets.ts`), untrusted-input
      validation (`parse.ts`), font-pairing menu (`fonts.ts`).
- [x] **Slider primitive** — `@radix-ui/react-slider` + `ui/slider.tsx`
      (aria-label forwarded to the thumb); `components/theming/AccentPicker.tsx`
      (curated swatches + hue slider).
- [x] **Flash-free injection** — `AppLayout` `theme` prop → SSR
      `<style data-theme-default>` + pre-paint `<script>`; `ThemeVarsProvider` in
      `common` wired into `AppProviders`; `theme.css` font-role default binding +
      pre-registered pairings in `AppLayout/fonts.ts`.
- [x] **Persistence** — `Settings.theme?`; editor `layout.tsx` reads
      `readSettings()` → passes `theme`; `updateSettings` merge-preserves,
      validates, and `revalidatePath("/", "layout")`.
- [x] **Editor UI** — `ThemeEditor` on `/settings`: preset select, `AccentPicker`,
      neutral/font selects, radius slider, default-mode toggle-group, live-preview
      cluster (buttons/card/badge/text), "Save as site default".
- [x] **Visitor preset/mode switch** — `PresetPicker` in the shared header (ships
      in `common` → export inherits it in 2b); built-in preset → localStorage.
- [x] **Tests** — `theme-editor.spec.ts` (live preview, per-mode, preset switch,
      save→SSR-no-flash, visitor persist); `accessibility.spec.ts` extended across
      presets (WCAG2AA green). Default look unchanged (no baseline regen).

#### PR 2b — Export baking + import/export + named presets `ui/02b-theming-export` ✅ done

- [x] **Export baking (env channel).** `common/config/site.ts` gains
      `getSiteTheme()` — parses the build-time `SITE_THEME` env var via
      `parseTheme` (absent/invalid → `undefined` → built-in default). The static
      export `layout.tsx` passes `<AppLayout theme={getSiteTheme()}>`, so the
      prerender inlines `<style data-theme-default>` on every page (pre-paint
      script + `ThemeVarsProvider` still allow visitor overrides). The
      editor→export build injects it: `buildExport()` reads `readSettings().theme`
      and threads `SITE_THEME=JSON.stringify(theme)` through an optional
      `extraEnv` param on `commandAction`, merged into the execa `env` alongside
      `CONTENT_DIRECTORY`. Non-`NEXT_PUBLIC_` → build-time server-only. The deploy
      path is unaffected (it redeploys the already-built `out/`).
- [x] **Import / export theme JSON.** `ThemeEditor` grows an "Import / Export"
      `ui/dialog` with a `ui/tabs` split: _Export_ = read-only textarea of the
      serialized theme + Copy (`navigator.clipboard`); _Import_ = editable
      textarea + Apply → `parseTheme` (inline error on `null`, else `setTheme` +
      `previewTheme` and close).
- [x] **Owner-saved named presets.** `Settings.presets?: NamedPreset[]`
      (`{id,name,theme}`) persisted in the editor's git-ignored `settings.json`.
      Server actions `savePreset`/`deletePreset` (`parseTheme`-validated,
      `randomUUID()` id, read-merge-write, `revalidatePath("/","layout")`). The
      editor UI adds a "Save current as preset" input + list with Apply/Delete,
      and the preset `Select` merges built-in `PRESETS` (by `key`) with saved
      presets (by `saved:<id>` value) under grouped "Built-in" / "Saved" labels
      (`SelectGroup`/`SelectLabel` added to the primitive).

**Contracts logged for later phases:**

- **Env baking:** `SITE_THEME` (JSON `Theme`) → `getSiteTheme()` in
  `common/config/site.ts`, read only by the export `layout.tsx` at build time.
- **Named-preset persistence:** owner-side only, in the editor's
  `settings/settings.json` (`presets[]`) — _not_ in the content repo and _not_
  yet exposed to public visitors. Exposing them to the export build is 2c.

#### PR 2c — Per-component overrides + public presets `ui/02c-theming-overrides` ⏸️ deferred

**Skipped for now** (2026-07-24) — PR 3 stacks directly on 2b instead. Revisit
after the search/homepage work; nothing in PR 3+ depends on it.

- Advanced per-component raw-token overrides (e.g. hand-editing `--destructive`,
  `--chart-*`, or a specific `--card`) behind a disclosure — extends the `Theme`
  model beyond the current knobs.
- Expose owner-saved named presets to public visitors in the export build (today
  visitors only get the built-in `PRESETS` via `PresetPicker`).

### PR 3 — Search + tags `ui/03-search-tags` ⤴️ superseded by PR 21a

> The unticked items below were never done as written. PR 21a replaced the
> filter-chip rail with a query language, which is the reason: there is no chip
> rail left to finish. Kept for the ticked half, which did land.

Re-parented `← 2b` (2c deferred). All shared changes land in `common` so the
export app inherits the model, the tall-card fix, and tag display; **export
search parity stays out of scope** (`/search/all` + `/search/version` exist only
in the editor app, so the FlexSearch filter experience is editor-only today).

- [x] **Tags model + persistence.** `tags?: string[]` on `Recipe` +
      `RecipeEntryValue` + `MassagedRecipeEntry`. Normalized (trim, collapse
      whitespace, lowercase, dedupe) via `common/controller/normalizeTags.ts`,
      applied in the zod `RecipeFormSchema.transform` and the `TagsInput` commit.
      Threaded through `buildRecipeData` / `formDataFromParsed` / form-state +
      form-values types.
- [x] **Indexed twice.** Emitted into the LMDB index value
      (`buildIndexValue.ts`) and mapped into the corpus (`getRecipes`), and added
      to the FlexSearch `Document.index` (`["name","ingredients","tags"]`). A
      lightweight client re-rank in `SearchContext` floats tag matches above
      ingredient-only matches (no FlexSearch-internals rewrite).
- [x] **Tags form field.** `common/components/Form/Tags` — free-form chips
      (Enter/comma commits, Backspace removes last) on the TanStack array-field
      pattern, submitting `tags[i]` (FormData bracket-notation → string array),
      plus one-click quick-add suggestions from the corpus (`getAllTags()`,
      prop-threaded through the new/edit/copy pages).
- [x] **Filter-chip rail (AND/OR).** `SearchForm/TagFilterRail` — corpus tag
      chips toggle a shared `selectedTags` filter with an `All`/`Any`
      (AND/OR, default AND) `ToggleGroup` + clear. Persisted like the query
      (sessionStorage + `tags`/`mode` URL params via `useSearchURLSync`). The
      filter applies to the query's results _or_ the whole corpus, so tags work
      as a no-query **browse** affordance. (Made `/search/all` fetch
      unconditional — the rail/browse need the full corpus with tags; the
      expensive FlexSearch _populate_ stays gated on the version check.)
- [x] **Tall-card fix.** `SearchList/index.tsx` caps matched-ingredient lines to
      3 + a muted "+N more", `line-clamp`s each line, and adds a single
      non-wrapping row of compact tag chips (`SearchList/CardTags`, click →
      toggles the rail filter) → uniform row heights.
- [x] **Reader-facing tags.** Chips under the title on `/recipe/[slug]`
      (`View/index.tsx`, each links to `/search?tags=…`) and schema.org
      `keywords` in `View/JsonLD`.

**Tags contract:** persisted as a normalized `string[]` (trimmed, lowercased,
deduped, empties dropped). Indexed in both the LMDB index value and FlexSearch.
Multi-tag filters combine AND by default with a togglable OR. No migration
script — creating/updating a recipe rewrites its index entry and bumps
`/search/version` (client refetches); older recipes pick up tags on the next
edit or via Settings → "Reload Recipe Database" (`rebuildRecipeIndex`). Export
search parity is a pre-existing limitation, deferred.

### PR 4 — Homepage `ui/04-homepage` ⤴️ superseded by PR 10

> PR 10 rebuilt the homepage around the timeline-led hero and dropped the
> scaler. The unticked items below describe a homepage that no longer exists.

Rebuild `common/components/Homepage/index.tsx` (a shared server component, so both
apps inherit it — no `(recipes)/page.tsx` change): bench hero (featured photo +
live scaler/timeline panel), browse-chips row backed by PR-3 tag filters, then
Featured / Latest grids.

- [x] **Bench hero** — `Homepage/HeroBench.tsx` (server): asymmetric slab pairing
      a large photo tile (`getTransformedRecipeImageProps`) with the live panel.
      Mono eyebrow ("Featured"/"Latest"), `font-display` name (an **`<h2>`** — the
      masthead already owns the page's `<h1>`), ember "View recipe" CTA. Degrades
      to panel-only with no image.
- [x] **Live panel (signature)** — `Homepage/HeroLivePanel.tsx` (`"use client"`):
      `MultiplierProvider` wrapping the reused `MultiplierInput` /
      `MultipliedServings` + the first ~4 ingredients through
      `StyledMarkdown{Multiplyable}` so quantities **scale in place**, plus
      prep/cook/total (`font-mono tabular-nums`).
- [x] **Compact timeline strip (read-only)** — `Homepage/CompactTimeline.tsx`:
      the first timeline's events as one proportional strip (active = ember, rest
      = muted), mono durations, a spoken `aria-label` summary. The full
      interactive schedule stays **PR 6**.
- [x] **Browse chips** — `Homepage/BrowseChips.tsx` (server): `getAllTags()` →
      `Badge asChild` links to `/search?tags=…` (first 12 + a "More →" to
      `/search`); renders nothing when the corpus is untagged.
- [x] **Grids** — reuse `RecipeList`; headings in `font-display`; empty-state and
      the "More Latest Recipes" link preserved.

**Hero source & fallback.** The hero leads with the **first featured** recipe
(full `Recipe` via `getRecipeBySlug`, try/catch → no hero on failure); with **no
featured** recipes it falls back to the **latest** (`recipes[0]`) with a "Latest"
eyebrow. The **Featured grid keeps every featured recipe** (it is _not_ minus the
hero-promoted one): removing it would empty the "Featured Recipes" section on the
common one-featured case and break `featured-recipes.spec` + the fixture
generator, which assert the featured recipe appears under that heading. The
minor hero/grid overlap is the accepted trade-off; the grid heading text stays
"Featured Recipes"/"Latest Recipes" exactly.

**Verification (all green except pre-existing).** New `homepage-hero.spec.ts`
(UI-seeds one rich recipe → hero photo/name, scale `1 cup`→`2 cup`, browse chip
`/search?tags=bread`, timeline segment, WCAG2AA axe). `homepage.spec.ts` +
`featured-recipes.spec` homepage cases unchanged and green; `accessibility.spec`
green; `homepage-three-recipes` / `homepage-two-pages` / `homepage-mobile`
baselines regenerated. `tsc` clean for editor + export. Pre-existing, **not from
this PR** (verified by stashing): the TanStack-form visual baselines (new-recipe/
edit/markdown-source), the `featured-recipes-page-2` visual (99% diff), the flaky
featured-recipe-selector dialog, and the `recipe.spec` multiplier baseline.

### PR 5 — Paste `ui/05-paste` ✅ done

Shared `detectHeading(line)` util (trailing-`:`, `For the …`, ALL-CAPS —
`Step N`/`N.`/`a)` stay strippable prefixes, not headings) for both parsers;
`parseInstructions` (`Form/Instructions/index.tsx`) now folds steps into
`InstructionGroup`s; always-on live review in `Form/PasteField/index.tsx` (a
flat `ParsedLine { text; isHeading }` intermediate with a per-type `assemble`;
read-only rows, headers highlighted, per-line heading toggle before `onImport`).
Symmetric across ingredient + instruction paste; ingredient headings stay flat
(`type: "heading"`). See the Decisions log entry for the full rationale.

### PR 6 — Detail + timeline `ui/06-detail-timeline` ✅ done

The recipe **detail page** pass. Exploration found the two-column layout and an
interactive `TimelineView` already existed, so the work was replace/retheme, not
net-new. See the Decisions log entry for the full rationale.

- [x] **Toggle-able cook schedule** — `View/Schedule` (`RecipeSchedule`): a
      read-only compact `TimelineStrip` per timeline at a glance (ember = hands-on,
      quiet = rest, mono durations), with an **"Adjust schedule"** disclosure that
      swaps in the kept-and-rethemed interactive editor (resize/zoom/offset/overlap).
- [x] **Editor retheme** — `View/Timeline` slate/amber/blue → Bench tokens
      (`primary` active, `destructive` conflict, mono `tabular-nums` durations);
      roles/labels unchanged so `timeline.spec` only expands first.
- [x] **Sticky scale bar** — `MultiplierInput` + `MultipliedServings` in a slim
      `sticky top-0` bar above the two columns (`print:static print:hidden`);
      `getByLabel("Multiply")` unchanged. Prep/Cook/Total stay in the hero.
- [x] **`InfoCard` retheme** — bench card surface + mono eyebrow + mono tabular
      value, unifying the page's numbers with the scaling feature.
- [x] **`formatDuration` dedup** — `common/util/formatDuration.ts`
      (`Long`/`Compact`); `TimelineStrip` extracted to `common/components`
      (`CompactTimeline` a thin wrapper, hero byte-identical).
- [x] **Print stylesheet** — shared `@media print` block in both apps'
      `globals.css` (schedule strip fills + checklist boxes survive print; no
      mid-item page breaks); screen chrome hidden via `print:` utilities.
- [x] **Tests + baselines** — reworked `timeline.spec`; sticky + print tests in
      `recipe.spec`; regenerated the 4 detail-page baselines, each visually
      confirmed. Full e2e+mobile green, editor `tsc` clean.

### PR 7 — A11y + motion `ui/07-a11y-motion` ✅ done

Visible focus rings (`--ring`), `prefers-reduced-motion` on animations, WCAG
contrast check across palette **and custom themes** in both modes, keyboard nav.
Exploration found the app already in good shape (most `ui/*` primitives carry the
house `focus-visible:ring-ring/50 ring-[3px]`; widgets are real buttons), so this
was a targeted gap-closing pass, not a sweep.

- [x] **Focus rings** — the two recipe-website buttons that rendered a Badge with
      no focus indicator: `SearchForm/TagFilterRail` filter chips and `Form/Tags`
      suggestion chips got the house ring (+ `rounded-md`). The TagFilterRail
      Badge's `ring-primary` is a _selected-state_ marker, left alone.
- [x] **Keyboard — Timeline offset** — `View/Timeline` OffsetBlock's
      `role="button"` grip had `onClick`/`tabIndex` but no key handler; added
      `onKeyDown` (Enter/Space, `preventDefault` on Space) reusing the click
      handler. Kept as a `role="button"` div (a native `<button>` would create an
      ambiguous label association inside its `<label>` wrapper).
- [x] **Reduced-motion kill-switch** — one `@media (prefers-reduced-motion:
reduce)` guard beside the print block in **both** app `globals.css` (kept in
      sync), collapsing every animation/transition to `0.01ms`. One global
      guarantee, not per-component `motion-reduce:` variants; `0.01ms` (not `0`)
      keeps `*end` events firing. Not in shared `theme.css` (app-globals precedent
      keeps blast radius local + visible to this app's reviewers).
- [x] **Shared-kit convergence** (separately-revertable) — `ui/dialog.tsx` dropped
      the hardcoded `dark:bg-slate-900` (a real dark-theming bug; `bg-background`
      is mode-aware); `ui/sheet.tsx` close `focus:` → `focus-visible:` + house
      ring; `ui/slider.tsx` thumb `ring-4` → house `ring-[3px]`. None alter the
      default light render.
- [x] **Dark + custom-theme axe sweep** — `seedTheme()` helper; every preset
      (working-bench included) × light/dark across `/`, `/recipe/recipe-6`,
      `/search`, plus 2 off-preset custom themes (berry 320, amber 25) × light/dark
      on `/`. `expectMode()` asserts the mode class took before axe. This is the
      "contrast across palette + custom themes in both modes" deliverable.
- [x] **Dark `--destructive` AA fix** — the sweep flagged the `bg-destructive
text-white` Delete button in dark at **2.92:1** (needs 4.5). Darkened the
      dark `theme.css` `--destructive` from `L=0.70` to `L=0.577` → 4.78:1.
      Surgical single-token nudge (no curve redesign); dark-only so light visual
      baselines are untouched; applies to all presets (shared fall-through token).
- [x] **Tests** — new `reduced-motion.spec` (computed transition-duration
      collapses under emulation) and `timeline.spec` keyboard-activation test, plus
      the axe expansion above.

**Known follow-up (out of PR 7 scope):** the expanded sweep also revealed the
light-mode accent curve (`deriveAccent`, `oklch(0.53 0.16 h)`) dips just under AA
in the cyan/teal band (~hue 165–215, worst ~4.31:1 at 190) against the near-white
`--primary-foreground`. Closing it means darkening the light accent `L`, which is
a **contrast-curve redesign** that would shift light visual baselines — deliberately
deferred (PR 7 = surgical dark-token nudges only). Built-in presets (hues 50/150/
250/265) and the two custom hues all sit outside the band, so nothing ships under
AA today; a teal _custom_ accent is the only way to hit it.

## Improvement Tour (PR 9–12)

A tour back through the shipped surfaces to raise them toward proven recipe-site
conventions (NYT Cooking / Serious Eats / King Arthur). **Layout / component /
hierarchy only** — Working Bench tokens, fonts, and the theming engine are kept
verbatim. The paste review UI (PR 5) is kept as-is (the reference "review"
pattern). Base of the stack: `ui/09-header` off `test/editor-server-isolation`
(PR 8), so new specs inherit the isolated test port + served-app guard.

**Follow-up backlog (surfaced by the tour — not built here):**

- **Select/Checkbox → Radix consolidation** — punted across PRs 1/3/5/6; the
  native `name`-submitting controls still bypass the Radix `ui/*` primitives. A
  real cleanup PR (don't let the PR-1 note overstate it).
- **Light-mode teal-band contrast gap** — the accent curve dips ~4.31:1 at hue
  ~165–215 (from PR 7's deferred note); an accent-curve redesign that would shift
  light baselines.
- **Export search parity** — `/search/all` + `/search/version` are editor-only,
  so the FlexSearch filter/browse experience is missing in the static export.
- **PR 2c** — per-component raw-token overrides + exposing owner presets to
  public visitors (deferred).
- **"Jump to recipe / ingredients"** anchor buttons on long detail pages
  (conventional, optional).
- **Hero/Featured overlap** — the hero shows `featured[0]`, which also appears in
  the Featured grid; accepted trade-off, revisit only if it grates.

### PR 9 — Header refit `ui/09-header` ✅ done

Rebuilt the fugly two-row centered masthead into one sticky row and consolidated
the two chunky appearance controls into a single popover. Header is fully shared
(`common/AppLayout`), so this changes both apps.

- [x] **`ui/popover.tsx` primitive** — thin `@radix-ui/react-popover` wrapper in
      `packages/component-library/components/ui/`, matching the dialog/tooltip
      house styling (mode-aware `bg-popover`, house border, shared enter/exit
      motion). First Popover/Dropdown primitive in the kit.
- [x] **Single sticky row** (`SiteHeader` + `HeaderNav`) — a flex
      `justify-between` row, `sticky top-0 z-40` at `h-[var(--header-height)]`
      over a `bg-card/80 backdrop-blur` surface. **Left:** wordmark `Link` to `/`
      in
      `font-display` with a small ember-square glyph (identity without a logo
      asset), kept as the page `<h1>` (see Decisions log). **Right cluster:**
      `Bookmarks` + `Search` nav links (`size-4` lucide icons + label, injected
      by href so menu data stays icon-free) and one **Appearance** control.
- [x] **Appearance popover** (`AppLayout/Appearance.tsx`) — a single ghost
      icon `Button` (sliders icon) opens the popover with the shared
      `AppearanceControls`: a labeled "Theme" segmented control (the
      de-chunked 3-way `ThemeToggle`) + a "Preset" select (`PresetPicker` full
      width). Removes both the empty-looking preset box and the triple outlined
      toggle from the bar.
- [x] **De-chunked `ThemeToggle`** — same 3-way `ToggleGroup` (roles unchanged:
      `role="group"` "Color mode", `role="radio"` items), restyled from three
      outlined squares into a segmented control on a muted track, active option
      lifted onto the card surface with a shadow.
- [x] **Mobile** — the existing hamburger `Sheet` now hosts the same
      `AppearanceControls` below the nav links; no new mobile pattern (the mobile
      header was already the better wordmark-left/one-control-right shape).
- [x] **`--header-height`** — added to `theme.css` `:root` (`3.5rem`). The detail
      page's still-present sticky scale bar offsets `top-0` →
      `top-[var(--header-height)]` so the two stickies don't overlap (bar fully
      removed in PR 11).
- [x] **Tests + baselines** — new `header.spec.ts` (single sticky row, wordmark
      returns home, Appearance popover exposes Theme + Preset, Dark takes effect,
      mobile sheet still lists nav + appearance) with a `masthead-signed-out`
      locator baseline. Because the masthead is global chrome, the whole
      e2e+mobile snapshot set was regenerated; axe WCAG2AA sweep (light + dark)
      stays green; editor + export `tsc` clean.

### PR 10 — Homepage hero, timeline-led `ui/10-homepage` ✅ done

Turn the bare, mis-focused hero into a conventional featured-recipe hero whose
live element is the **cook timeline** (the app's signature), and drop the
scaler — scaling belongs on the recipe page, per every real recipe site.

- [x] **Scaler removed from the hero.** `HeroLivePanel` no longer wraps a
      `MultiplierProvider` and drops `MultiplierInput` / `MultipliedServings`;
      it's now a plain server component. A tiny `StaticMultiplyable` passthrough
      renders `<Multiplyable>` markup in yield/ingredient text at its base number
      so provider-free rendering never throws.
- [x] **Timeline promoted to centrepiece.** `TimelineStrip` gained an optional
      `size="lg"` (taller bar) + `legend` (hands-on/rest key); `CompactTimeline`
      forwards both. The hero renders the first timeline as the prominent
      `size="lg" legend` strip — larger than the 44px detail preview. Defaults
      are unchanged, so the detail page's strip and baselines don't move.
- [x] **Panel content (top→bottom):** mono eyebrow (`Featured`/`Latest`, in
      `HeroBench`) → `font-display` title (`<h2>`, masthead still owns the
      `<h1>`) → clamped `recipe.description` → prominent timeline strip →
      `font-mono tabular-nums` meta line (Prep · Cook · Total · Yield, the `Stat`
      helper) → ember "View recipe" CTA.
- [x] **Never-bare fallback ladder:** description leads when present; a short
      static **ingredient teaser** fills in only when there's no description; the
      timeline and meta strip render whenever their data exists. A no-image
      recipe degrades to a balanced panel-only card (not the old empty look).
- [x] **Tests + baselines** — `homepage-hero.spec` reworked: the rich hero shows
      description + timeline + yield meta with **no** `Multiply` control (and the
      teaser suppressed under a description); a second test seeds a
      description-less recipe and asserts the ingredient-teaser fallback. Both
      stay WCAG2AA-clean. Regenerated `homepage-three-recipes` /
      `homepage-two-pages` / `homepage-mobile`; homepage/featured/accessibility/
      mobile specs green; editor + export `tsc` clean.

### PR 11 — Detail: meta bar + scaler's new home `ui/11-detail-scaler` ✅ done

Kill the standalone sticky scale bar; give the hero a canonical meta bar; move
the scaler into the Ingredients header as a ½× · 1× · 2× + custom control.

- [x] **Hero meta bar** — new `MetaBar` (`View/shared.tsx`): a horizontal
      **Prep · Cook · Total · Yield** strip in `font-mono tabular-nums`, hairline
      dividers via a `bg-border` grid gap (4-across desktop, 2×2 mobile). Fills
      the hero's formerly-dead right column. Zero-valued prep/cook are dropped
      (no "0 min"); Yield relocated from the old bar and still scales in place via
      a new `ScaledYield`. Prints (times belong on paper).
- [x] **Standalone sticky bar removed** — the full-width `sticky … backdrop-blur`
      scale band between the hero and the columns is gone (`View/index.tsx`).
- [x] **Scaler → Ingredients heading** (`Ingredients/index.tsx`,
      `Multiplier/index.tsx`) — `MultiplierInput` reworked into a segmented **½× ·
      1× · 2×** preset group (`role="group"` "Scale", `aria-label`ed "Half/Single/
      Double batch" buttons) **+ a custom numeric field** that keeps the
      accessible name **"Multiply"**. Clicking a preset writes its value into the
      field — the multiplier `input` is the single source of truth (`fraction.js`
      parses `1/2`). Default 1×. Reuses the view-wide `MultiplierProvider`.
- [x] **Contained sticky** — the Ingredients heading + scaler pins to
      `top-[var(--header-height)]` _within its column_ (not page-wide), so it
      stays reachable while scrolling the ingredients; `print:static`.
- [x] **Tests + baselines** — `recipe.spec`: presets scale (`1 1/2 tsp`→`3 tsp`
      at 2×, `→ 3/4 tsp` at ½×) and write the custom field; a sticky-header test
      (asserts `position: sticky`, robust to short fixtures); a new meta-bar test
      on the timed `baked-potatoes` fixture. `new-recipe`/`edit`/`yield` detail
      assertions updated for the short labels + ingredient-hosted scaler.
      Regenerated `recipe-6-multiplied`, `recipe-detail-signed-out`/`-in`,
      `featured-recipe-detail-signed-in` (delete-to-regen), `recipe-mobile`,
      `yield-multiplied-half`. Full e2e+mobile green; editor + export `tsc` clean.

### PR 12 — Site-wide polish + search/tags `ui/12-polish` ✅ done

The all-around sweep. Cards, bookmark control, empty states, and the search
ranking, plus the folded-in tag/FlexSearch work.

- [x] **Recipe cards** (`List/shared.tsx` + `List/index.tsx`, `ClientList`,
      `SearchList`) — `font-display` name, `font-mono tabular-nums` `<time>`
      date, a bench-toned monogram `RecipeCardPlaceholder` for image-less cards
      (was a flat gray box), a linked `RecipeCardTagHint` (server-safe, the plain
      counterpart to search's interactive `CardTags`), and a roomier `gap-3`.
- [x] **BookmarkButton** — `size-5` glyph in an `icon-sm` ghost button on a
      `bg-background/80 backdrop-blur` backing; dropped hardcoded
      `bg-slate-400/25` and swapped the active `text-yellow-500` → `text-primary`
      ember. (The PR-9 `@layer base` svg fix is what lets `size-5` actually take.)
- [x] **Empty states** — `FeaturedRecipesPage`, search-no-results, and the
      homepage "Latest" empty converged on the shared `EmptyState` with a title,
      one house-voice line, and a clear action (Browse / Clear search). Retired a
      hardcoded `bg-slate-700` link.
- [x] **Search ranking + tags** (user fold-in) — the client re-rank is now a
      stable **name > tag > ingredient** tiering over FlexSearch's merged results
      (`SearchContext`), so a name hit leads and tags earn priority above
      ingredient-only hits. Tags now show on the plain recipe cards too, not just
      search cards — reinforcing the by-name search specs (name matches float
      first) while keeping the tag-priority guarantee.
- [x] **Tests + baselines** — functional specs (empty-state, search, search-tags,
      bookmarks, featured, homepage, navigation, accessibility) green; regenerated
      the card/empty/search baselines across the e2e+mobile snapshot set (delete-
      to-regen where a change fell under the 2% tolerance). Editor + export `tsc`
      clean.

## Owner-chrome pass (PR 13–15)

With the reader surfaces done (PR 9–12), the **owner chrome** and a
**hardcoded-color debt** read as unfinished. Three stacked PRs off `ui/12-polish`
rethink the footer (13), give settings a real sidebar + a page per area (14), and
add semantic status tokens + retokenize the remaining hardcoded colors (15).

### PR 13 — Rethink the site footer `ui/13-footer` ✅ done

The old footer was one wrapping link row: the `/search` item's icon wrapped to a
broken line, and Sign In/Out was a boxed `<Button>` misaligned with the text
links. Rebuilt as a structured colophon plate, shared `common/` so it ships to
editor + export.

- [x] **Colophon plate** (`AppLayout/index.tsx` `SiteFooter`) —
      `border-t border-border bg-card`, `max-w-6xl` centered like the masthead. A
      4-col grid: brand block (ember mark + `font-display` wordmark + clamped
      description + a social/contact icon row) then the menu columns, over a
      hairline colophon bar (`© {year} {title}` + optional owner note + a mono
      "Built on Content Engine" credit).
- [x] **Menu-driven columns** (`AppLayout/nav.tsx` `FooterNav`) — a top-level
      footer `MenuItem` **with `children`** becomes a titled column (name =
      mono-uppercase heading); flat items collect under a default **"Browse"**
      column. Reuses the menus collection's nested `children` — columns are an
      owner customization with no model change. Columns are vertical block links
      (`inline-flex items-center gap-1.5`), so the search icon can no longer wrap
      mid-item — the broken line is gone by construction.
- [x] **Owner "Manage" column** (editor-only) — new `OwnerFooterLinks` server
      component (New Recipe, Settings, Content Sync, Sign In/Out), passed to
      `AppLayout` as `footerNavItems` and rendered only when present, so the
      export footer stays reader-only. **Sign In/Out** is now a form submit styled
      with `buttonVariants({ variant: "link", className: "h-auto p-0 …" })` — a
      text link aligned with the column, not a boxed button. (`NavLink` stays
      internal to keep its `onNavigate` function prop off the boundary; a
      serializable `FooterLink` wrapper is what the server column imports.)
- [x] **Customization plumbing** — `AppLayoutProps.footer?: { note?; contact? }` + a `ContactLinks` type (known keys → known lucide icons) in
      `common/config/site.ts`. Editor `layout.tsx` reads `readSettings()` →
      `footer`; export `layout.tsx` reads a new env-baked `getSiteFooter()`
      (mirrors `getSiteTheme()`), fed by `exportAction` baking
      `SITE_FOOTER_NOTE` / `SITE_CONTACT`. `Settings` gains `footerNote` +
      `contact` (edit UI lands in PR 14).
- [x] **Tests + baselines** — new `footer.spec.ts` (columns, link-styled Sign
      In/Out, inline search icon, colophon, configured note + contact icons,
      mobile stacking). Regenerated the 20 `@visual` baselines + the functional
      snapshot set (footer sits in every full-page shot). Editor + export `tsc`
      clean.

### PR 14 — Settings sidebar + a page per area `ui/14-settings` ✅ done

Replaced the hardcoded `bg-slate-800` sub-footer (`(editor)/footer.tsx`) with a
real two-pane settings shell, and split Theme onto its own route.

- [x] **Settings shell** (`(editor)/layout.tsx` → `SettingsShell`) — a
      pathname-gated client shell: on a settings _area_ it renders the sidebar +
      `<main>`, otherwise it renders children bare. This matters because the
      `(editor)` group also serves the **public catch-all pages** (`/about`) and
      the menu/page edit forms; gating fixes a latent bug where the old
      sub-footer bled onto `/about`. Centered `max-w-6xl` like the masthead.
- [x] **`SettingsSidebar`** (instrument rack on the `--sidebar*` tokens) — mono
      uppercase group labels (Setup / Content / System), lucide icons, ember
      active indicator (`border-primary` + `bg-sidebar-accent`) via `usePathname`.
      `/settings` is active only on its exact path (so `/settings/theme` doesn't
      light up General). Footer: "Back to site" + a link-styled Sign Out (a
      `signOutAction` server action imported into the client component). Below
      `lg` it collapses into a labeled `ui/sheet` drawer. Nav rows are `<a>`/links
      (no `<ul>/<li>`) to keep `getByRole('listitem')` counts clean.
- [x] **Page per area** — Appearance moved to `(editor)/settings/theme/page.tsx`
      (renders `ThemeEditor`, kept in `settings/`); General (`/settings`) dropped
      its Theme section and gained a **Site details** form (`SiteDetailsForm`:
      footer note + the 7 contact fields, namespaced `contact.<key>`), wiring the
      PR 13 plumbing to an editor. `updateSettings` now merges `footerNote` +
      `contact`. Navigation/Pages/Content Sync/Export keep their pages; only the
      surrounding nav changed. Section titles stay `<h2>` (masthead owns `<h1>`).
- [x] **Tests + baselines** — new `settings-nav.spec.ts` (area list + active
      state, General→Appearance→Navigation, Theme at `/settings/theme`, public
      page has no sidebar, mobile drawer). Repointed `theme-editor.spec.ts` to
      `/settings/theme`; git.spec's dead sub-footer "Git" link → `goto('/git')`.
      Regenerated `git-page` (sidebar) + `page-view-signed-in` (`/about` lost the
      sub-footer). Full e2e+mobile green; editor + export `tsc` clean.
- [x] **Follow-up (PR 15 branch): nested layout + full-bleed + reusable
      `SidebarLayout`.** Replaced the pathname-gated `SettingsShell` with a real
      `(editor)/(settings)` route group + nested `layout.tsx`; moved the six area
      folders/pages under it (URLs unchanged) and left the edit forms outside so
      they render bare. Extracted a reusable `SidebarLayout`
      (`common/components/SidebarLayout`) that renders the aside + mobile
      `ui/sheet` drawer and auto-closes on route change, taking the nav as a plain
      `sidebar` node (`SettingsNav`). Sidebar now hugs the left screen edge
      (`w-full` over `items-center`) with a wide content column; dropped "Back to
      site" + "Sign Out" (masthead/footer cover them) and `signOutAction`.

### PR 15 — Kill hardcoded colors + fix instruction numbers `ui/15-tokens` ✅ done

- [x] **Semantic status tokens** — added `--success/--warning/--info`
      (+ `-foreground`) to `theme.css` `:root` + `.dark`, mapped in `@theme` as
      `--color-*` → `bg-success` / `text-warning` / `border-info` utilities.
      WCAG-checked like `--destructive`: light L=0.53 (≥4.68:1 both as text on the
      background and as a fill under near-white foreground), dark L≈0.70–0.75
      (≥6.75:1). Verified with an OKLCH→sRGB→WCAG contrast script.
- [x] **Retokenized every hardcoded color** in the audit (~15 files): git panels
      (red→`destructive`, green→`success`, amber→`warning`, sky→`info`,
      `bg-black/30`→`bg-muted`, `bg-green-950`→`bg-success/15`, the conflict
      callout → `warning` tint), the Timeline form panels + Instructions/menus
      `border-white`→`border-border`, form status messages, the `/menus` + `/pages`
      index tiles, and the export `OutputWindow`. **Left documented:** the print
      `#666` in both `globals.css` (physical paper color) and `auth.ts`
      `brandColor:"#b14700"` (a NextAuth literal that can't take a CSS var; it's
      already the WCAG-matched `--primary`).
- [x] **Instruction step numbers** (`View/Instructions`) — replaced the native
      `list-decimal` markers (which paint in the tight `list-outside` gutter and
      overflowed the card at 2 digits) with a fixed-width mono `tabular-nums`
      counter column (`min-w-[2rem]`, explicit `{i + 1}.`), on both the top-level
      and grouped `<ol>`. 1- and 2-digit numbers now share one border-clear
      gutter (verified with a seeded 12-step recipe).
- [x] **Polish** — card-ified the `/menus` + `/pages` index tiles
      (`bg-card border` + hover); the export `OutputWindow` is a `font-mono`
      `bg-muted` log surface; form status messages use tokens
      (`text-success`/`text-destructive`); git page heading `h1`→`h2` (the
      masthead owns the page `h1`, PR 9).
- [x] **Verification** — added a **content-sync (git) page axe test in both
      light and dark** (the densest use of the new status tokens; not covered by
      the reader-page sweep) → green. Full axe WCAG2AA sweep green in both modes.
      Regenerated the recipe-detail + git baselines. Editor + export `tsc` clean.

### PR 17 — Settings redesign: contained layout + segmented pages + cards `ui/17-settings-redesign` ✅ done

Reworked the PR 16 full-bleed settings shell into a contained, masthead-aligned
layout and split the crowded General page into three carded, focused pages.

- [x] **`SidebarLayout` → contained + masthead-aligned** — replaced the outer
      full-bleed `w-full` wrapper with `mx-auto w-full max-w-6xl px-3 sm:px-4`,
      identical to the header/footer inner box in `AppLayout`. The aside's left
      edge now lines up under the wordmark with a gutter on both sides (no longer
      flush to the screen edge). Kept the `lg:flex-row lg:items-start` two-column
      row (preserves the PR-14/16 footer-overlap fix) and the `self-stretch`
      aside + sticky `top-[var(--header-height)]` inner. With `max-w-6xl` minus the
      14rem rail the content column is ≈56rem — roughly double the old page. Mobile
      drawer + render-time auto-close unchanged. Doc comment rewritten (no new
      prop; a `maxWidth`/`fullBleed` variant is a documented future add).
- [x] **Three focused pages** — `/settings` now renders **only** `SiteDetailsForm`
      (footer note + contact/social); new `settings/tools/page.tsx`
      (`/settings/tools`, `SettingsForm` yt-dlp) and `settings/maintenance/page.tsx`
      (`/settings/maintenance`, the two reload-index forms), each with its own
      `auth()` gate + `signIn(redirectTo)`. Dropped Tools + Database (and their
      imports) off the General page.
- [x] **New nav IA** (`SettingsNav`) — Setup: **Site details** (renamed from
      General, `Store` icon) + Appearance. System gains **Tools** (`Wrench`) +
      **Maintenance** (`Database`). `isActive` unchanged and still correct:
      `/settings` stays exact-match so `/settings/tools` + `/settings/theme` don't
      light it up.
- [x] **`SettingsCard`** — a reusable server component
      (`(editor)/(settings)/SettingsCard.tsx`) wrapping `Card`/`CardHeader`/
      `CardTitle`/`CardDescription`/`CardContent` for uniform sections on the
      `--card`/`--border` surfaces. Each page: `PageSection maxWidth="4xl"` (up
      from `xl`) → `PageHeading` → a `space-y-6` stack of cards. Site details = one
      form spanning two cards ("Footer note", "Contact & social") + a single Save;
      Tools = "Media downloader" card; Maintenance = "Search index" card (two
      stacked reload buttons). Existing `TextInput`/`SubmitButton` primitives + the
      tokenized status styling are reused as-is.
- [x] **Tests + baselines** — `settings-nav.spec` `AREAS` updated (General→Site
      details, + Tools + Maintenance), active-state assertions repointed, and new
      Tools + Maintenance navigation tests (active state + page landmark). Added a
      `/settings` axe case (the new card surface) alongside the git-page sweep.
      Regenerated the `git-page` visual baseline (full-bleed → contained). Full
      e2e+mobile green; editor + export `tsc` clean. **Next PR: ⌘K command
      palette** (site-wide search + actions).

### PR 18 — ⌘K command palette + export search parity `ui/18-command-palette` ✅ done

A site-wide ⌘K palette that unifies **live recipe search + navigation +
actions** into one quick-nav surface, plus the two export search routes it needs
to work on the reader site. First step toward making search the site's
navigation centerpiece; deeper search lands as PR 19.

- [x] **`cmdk` primitive** — added `cmdk` to `component-library` and a standard
      shadcn `ui/command.tsx`. Repo-specific: `CommandDialog` imports
      `{ DialogRoot as Dialog, DialogContent }` (this repo exports `DialogRoot`,
      not `Dialog`) and forwards command-level props (`shouldFilter`, controlled
      `value`/`onValueChange`) to the inner `Command` while the dialog props go to
      `DialogRoot`. Overrode the inherited `bg-background p-6` → `p-0 bg-popover`,
      widened to `max-w-xl sm:max-w-2xl`, top-anchored (`top-[15%] translate-y-0`).
      Working-Bench styling: mono-uppercase group headings, `data-[selected]` accent + left **ember rail** (echoing `SettingsNav`), leading `Search` icon on the
      input, `sr-only` `DialogTitle "Command palette"` (Radix a11y).
- [x] **Export search parity (unrot)** — added `export/(recipes)/search/all/route.ts`
      (verbatim from editor) and `search/version/route.ts` **without**
      `dynamic = "force-dynamic"` (illegal under `output: "export"`). Both render
      statically: the corpus JSON + the index `mtimeMs-size` version string are
      **baked at build**, so `useSearch()`'s FlexSearch/react-query pipeline
      resolves on the reader site and the palette's recipe group works everywhere —
      no editor-only special-casing. Kept the ENOENT → `{ version: "" }` fallback.
- [x] **`CommandPalette`** (`common/components/CommandPalette/`, `"use client"`) —
      mounted once inside `AppProviders` (inside `BookmarksProvider`) and **wraps**
      the app tree so the header trigger can open it via a colocated
      `CommandPaletteContext` (`openPalette`/`closePalette`). Open state is local;
      ⌘K/Ctrl-K toggles via a listener-only `useEffect` (state update in the
      handler, not the effect body — lint-safe under `react-hooks@7`'s
      `set-state-in-effect`). Route-close + open-seed + selection-snap all use the
      **derived-state-during-render** pattern (never `setState` in an effect),
      copying `SidebarLayout`'s route-close. Single `Command shouldFilter={false}`;
      static items are substring-filtered manually.
  - **Recipes** (live): the input drives a **debounced** (~180ms) `submitSearch`;
    `displayedRecipes.slice(0,6)` → rows with a `PureStaticImage` thumb,
    `highlightText(name, value)`, and up to 2 tag chips; `>6` appends a "See
    all results" item → `/search?q=…`.
  - **Search-first mode** — when a query has recipe hits the nav/actions groups
    **hide**, so recipes are the only selectable rows. cmdk only re-runs its
    first-item auto-select on _input-text_ change (not when async results land
    a tick later), so a controlled `value` **snaps** the selection to the top
    recipe whenever a new result set arrives — keeping "**Enter opens the top
    recipe**" true even for queries that also match a destination (e.g.
    "recipe"). This replaced an earlier attempt that let a stale nav row stay
    highlighted while recipes rendered below it.
  - **Go to** — shared `destinations.ts` (reader routes always; owner routes
    only when `isOwner`). **Actions** — theme Light/Dark/System
    (`useTheme().setTheme`) + an editor-injected Sign In/Out item.
- [x] **`isOwner` + auth plumbing** — `AppLayoutProps` gained a serializable
      `isOwner?: boolean` (default `false`) threaded to `AppProviders` →
      `CommandPalette`. Editor's `layout.tsx` does `auth()` → `isOwner={!!session}`;
      export omits it (`false`), so owner destinations are structurally impossible
      in the static build. **`next-auth` lives only in the editor package**, so the
      Sign In/Out action can't be imported into shared `common/` — it's an
      **editor-injected `ReactNode`** (`PaletteAuthItem`, uses `next-auth/react` +
      `useCommandPalette().closePalette`), passed down as `commandPaletteAuth`
      exactly like the existing `footerNavItems` precedent. Export never bundles it.
- [x] **`destinations.ts`** — plain serializable module (reader routes + the
      `SettingsNav` owner entries flattened with `ownerOnly` + their lucide icons +
      `New Recipe`). **Intentional small duplication** of the settings list: the
      palette lives in `common/` (shared with `export`), so importing editor's
      `NAV_GROUPS` would invert the dependency. A later PR can have `SettingsNav`
      read the owner subset from here (editor→common is allowed).
- [x] **Header trigger** — the masthead Search affordance is now a
      `PaletteTrigger` (opens the palette). Desktop: `Search` icon + label + a
      decorative (`aria-hidden`) `⌘K` hint chip; mobile: same button in the nav
      `Sheet`, no hint, closes the sheet before opening so two Radix dialogs don't
      stack. `/search` stays reachable via the "Go to → Search" palette item. The
      masthead visual baseline **held** (the old Search link already had the icon,
      so the delta — just the ⌘K chip — sat under the 2% snapshot threshold).
- [x] **Tests** — new `command-palette.spec.ts` (e2e + mobile): open via trigger
      **click** and via **⌘K**; `sr-only` title; live query → recipe row → Enter
      navigates to `/recipe/[slug]`; **Enter-opens-top-recipe** even when the query
      matches a destination; owner items ("New Recipe", "Content Sync", "Sign out")
      visible signed-in and **absent** for a signed-out reader; "Go to" navigation;
      route-close; a **palette-open axe** case; mobile tap-to-open (no keyboard).
      Four new visual baselines (empty light/dark, recipe results, owner). Editor +
      export `tsc` clean. **Next PR: PR 19 — search as centerpiece** (live typeahead
      on `/search`, tag filtering in the palette, recent searches, descriptions in
      results, ranking polish).

### PR 19 — Search as the centerpiece `ui/19-search-centerpiece` ✅ done

PR 18 gave the ⌘K palette a command-surface vocabulary — leading magnifier, mono
caption, instant results — over the shared `useSearch()` engine. `/search` never
got it: a labelled **"Query" input + Submit button**, results only on submit,
while the palette right beside it filtered as you type. PR 19 closes that gap and
takes the engine past its defaults. **One search language, two surfaces:** the
palette is the quick jump, `/search` is the dwell.

**A correction that shaped this PR.** The premise going in was that search
couldn't match accented names. That was wrong, and verified so: FlexSearch's
_default_ encoder already NFKD-normalizes and strips diacritics —
`encode("Crème Brûlée")` → `["creme","brule"]` on the config the app already ran,
so `creme` and `brulee` matched all along. The real defects were smaller in code
and larger in effect (below).

- [x] **`suggest: true`** — the biggest real-world miss. Without it a single
      unmatched term zeroed the whole result set, so `search("chocolate jujube")`
      returned **nothing** instead of the chocolate recipes. One option.
- [x] **`description` in the corpus** — `buildIndexValue` now writes a
      `flattenMarkdown`ed, 300-char-capped `description` (the field was _already_
      declared on `RecipeEntryValue`; it was simply never written), and
      `MassagedRecipeEntry`/`getRecipes` carry it through additively.
      **Operational note:** descriptions only appear in search once the LMDB index
      is rebuilt — the deploy/content pipeline must run `rebuildRecipeIndex`
      (Maintenance → "Reload Recipe Database", or a sync) before `next build`.
- [x] **Ranking is now native — `rankedSearched` deleted.**
      `search(q, {merge: true})` returns hits in `document.index` **declaration
      order**, so declaring `["name","tags","ingredients","description"]`
      reproduces the old hand-rolled tiering exactly, with none of its
      accent-blind `.includes()` matching. Side benefit: `SearchResultsModal`
      reads `searchedRecipes` directly, so the recipe picker inherits correct
      ranking for free — closing an old page/modal inconsistency.
- [x] **Two latent IndexedDB bugs fixed** — both would have detonated on any
      index change. (1) `IdxDB` hard-codes `VERSION = 1` and only creates object
      stores in `onupgradeneeded`, which fires once per origin+DB _name_ — so
      adding `description` would leave `map:description` uncreated and the first
      transaction would throw `NotFoundError`. Bumping the localStorage version
      key is **not** sufficient; the **DB name must change**, hence
      `recipe-search` → `recipe-search-v2`. (2) `commit()` _concatenates_ onto
      existing posting lists and the `reg` dedupe guard is cleared after each
      commit, so a repopulate into a surviving DB duplicated ids — the populate
      step now `clear()`s first. Also added `commit: false` so the bulk populate
      isn't punctuated by 1 ms autocommit timers.
- [x] **Live typeahead** — `SearchInput` is now the shared **live** field (page
      _and_ picker modal): leading `Search` icon, generous height, ember
      focus-within ring, mono placeholder, `aria-label` "Search recipes", no
      Submit button. `onChange` sets the input immediately plus a debounced
      ~180 ms `submitSearch` (the palette's `SEARCH_DEBOUNCE_MS` approach). A
      `<form>` is kept so **Enter** flushes the debounce and records the search;
      an `sr-only` submit preserves implicit form submission.
- [x] **`useSearchURLSync` → `replaceState`** — the write-back used `pushState`,
      which live typing would have flooded into history (one entry per debounced
      keystroke). URLs stay shareable and reload-safe; `?q=`/`?tags=` seeding and
      the `popstate` handler stay for deep links.
- [x] **The ticker — the one signature element.** A mono-uppercase `aria-live`
      line under the field, always reporting state: `ALL 67 RECIPES` idle →
      `42 RESULTS · "creme" · 2 TAGS` active. It reports the **total** match
      count, never the visible count, so the reveal cap can't misstate the set.
      Everything else stays quiet: no big-number hero, no numbered markers, no
      animated transitions, no stats sidebar.
- [x] **Recent searches** — localStorage-backed via the same
      `useSyncExternalStore` + `LOCAL_EVENT` pattern as the populated version.
      Last 6, deduped case- **and accent-insensitively**, most-recent-first.
      Recorded on **commit** (Enter, chip click, opening a result) not per
      keystroke, so `c`/`cr`/`cre` never pollute the row. Renders as ember-outlined
      Badge chips with a ghost Clear; vanishes the moment you type.
- [x] **`/search` compose order** — live field → ticker → (recents when idle) →
      `TagFilterRail` → results grid → reveal control. **The idle state is now a
      browse view** (the whole corpus, capped) rather than the old bare "Enter a
      search above" line.
- [x] **Capped progressive reveal replaces the orphaned pagination.** The page
      rendered _every_ result, and with no query that meant every recipe on the
      site. Link-based pagination is the wrong instrument here — results change on
      every keystroke, the client already has the full corpus from `/search/all`
      (so paging saves no data), and a URL page number would fight the
      `replaceState` change. Instead: local `visibleCount`, initial 60, with a
      "Show N more" button. The cap resets on `query`/`selectedTags`/`filterMode`/
      `sort` change **derived during render** off a last-inputs key, _not_ in an
      effect — `eslint-plugin-react-hooks@7`'s `set-state-in-effect` rule forbids
      setState in effect bodies (the same pattern PR 18 used for the palette's
      selection snap).
- [x] **Description snippet + accent-aware highlighting** — cards gained a
      `line-clamp-2` muted description line, highlighted via the existing
      `highlightText`. That helper prefix-matched raw text, so the engine matched
      `creme` → "Crème Brûlée" while the UI highlighted **nothing**; it now
      compares through an NFD-strip fold. Length-preserving for precomposed (NFC)
      text, and it checks that before slicing rather than assuming it.
- [x] **Removed** — `(recipes)/search/page/[page]/route.ts` in **both** apps plus
      `SearchForm/constants.ts` (whose only export was `RECIPES_PER_SEARCH_PAGE`):
      leftovers from before search moved client-side, unused by any client code.
      This also drops a needlessly statically-built route from the export app,
      whose `generateStaticParams` iterated the whole corpus.
- [x] **Fixed along the way** — both `(recipes)/search/version/route.ts` handlers
      had a fall-through path (a non-ENOENT `stat` error) that returned
      `undefined` instead of a `Response`, which turns the client's `res.json()`
      into a hard search error. Both now return the `{ version: "" }` fallback on
      any failure.
- [x] **Tests.** Dropping the "Query" label and Submit button broke **six** spec
      files, not two, and `getByRole("button", {name: "Submit"})` is _also_ the
      recipe-form submit — so it couldn't just be purged. All six now route
      through a shared **`searchFor(page, query, scope?)`** helper, so the next
      search change touches one place. New additive **`search-corpus` fixture**
      (67 recipes: an accented name, descriptions, a term that lives _only_ in a
      description, a name-vs-ingredient ranking pair, and filler to overflow the
      cap) — its generator drives Description through the sanctioned
      `fillMarkdownField` helper, and it was regenerated **after** the
      `buildIndexValue` change so the committed LMDB index carries `description`.
      New **`search-live.spec.ts`** (e2e + mobile) covers: filters-as-you-type with
      no Submit; the ticker; `suggest`; accent folding; the description snippet and
      its highlight; the **name-outranks-ingredient** ranking guard (now that no JS
      re-tiering exists to catch a regression); recent searches round-trip;
      `replaceState` not stacking history; and the reveal cap extending and
      resetting while the ticker still reports the total. Plus an idle + active axe
      case; `/search` is also in the `THEME_PAGES` matrix.
- [x] **Manual check the suite can't cover** — the export app has _no_ e2e tests
      (Cypress was removed, Playwright never added) yet renders the same shared
      `SearchForm` code, so its `/search` was built and clicked through by hand.
- **Next PR: PR 20 — palette search enhancements** (tag filtering in the palette,
  recents in the palette, deeper result rows).

### PR 20 — The palette joins the search language `ui/20-palette-search` ✅ done

PR 18 built the ⌘K palette; PR 19 made `/search` its dwell surface and upgraded
the shared engine. The palette never caught up: it **consumed** the shared search
state without **participating** in it. PR 20 closes that, and fixes one real bug
found on the way.

- [x] **The bug: an invisible tag constraint.** The palette read
      `displayedRecipes`, which is **post-tag-filter** — and `selectedTags` lives
      in sessionStorage while the only thing that ever _shows_ it, `TagFilterRail`,
      renders **only on `/search`**. So tags set there silently constrained the
      palette on every other route with no chip, count, or hint. Worst case (AND
      mode, two tags that never co-occur) the palette showed **zero** recipe rows
      for an obviously-matching query; `hasRecipeHits` went false, the launcher
      took over so it read as "no such recipe", and the snap-reset arm handed
      **Enter to "Home"**. Fix: read **`searchedRecipes`** — the palette is the
      quick jump and searches the whole corpus.
- [x] **…and the filter is now visible instead.** A **FILTER** group renders
      whenever tags are set: `Filtered on /search: soup, bread`, selecting it
      clears them and keeps the palette open. It is rendered **last on purpose** —
      clearing a filter must be deliberate, never what Enter happens to do, so it
      can never sit where cmdk's default selection lands. **"See all results"
      clears tags too**: the palette searched unfiltered, so a row promising "all
      results" that landed on a filtered `/search` would lie about its own count.
- [x] **RECENT leads the empty palette**, above "Go to" — the last few committed
      queries are the most useful thing to offer a blank field. Selecting one
      re-runs it in place. Deletion has two paths because
      **`nested-interactive` is a `wcag2a` rule** (verified against the installed
      axe-core) and cmdk items are `role="option"`, so **no `<button>` may live
      inside a row**: **⌫ / Delete** removes the highlighted entry (safe to bind
      unconditionally — recents only render when the input is empty, so the key
      has no text to delete) with a `CommandShortcut` hint on the selected row,
      plus a hover-revealed **`×`** that is a non-interactive `aria-hidden` span
      with an `onClick`, a redundant pointer affordance over the fully accessible
      keyboard path. A `Clear recent searches` row wipes the group. New
      `removeRecentSearch(query)` on the context reuses the existing `recentKey()`
      fold, so deleting the chip you see removes the entry it stands for even when
      the stored spelling is accented differently.
- [x] **`/search` parity, ARIA-clean.** The recent chip there was already a
      `<button>` wrapping a `Badge`, so an inline `×` would have nested one button
      in another. It is now **two sibling buttons** sharing a border — same
      capability, and `search-live.spec.ts`'s axe case keeps passing.
- [x] **The snap arm that is easy to miss.** cmdk re-runs its own first-item
      auto-select only when the **input text** changes. Recents arrive from
      localStorage _after_ hydration with the text unchanged, so the group mounted
      with the highlight still on "Home". The derived-during-render snap block
      gained an arm that snaps the selection to the first recent when the group
      appears while there are no recipe hits — and the ⌫ handler moves the
      highlight onto the row that reclaims the slot, so a keyboard user never
      lands on a dead selection. In render, never an effect
      (`set-state-in-effect`).
- [x] **Rows are as deep as `/search` cards.** `description` was on every result
      object and indexed since PR 19 but unrendered here, so a description-only
      hit showed a row with **no visible reason it matched**. Rows now carry the
      clamped description and the **first matched ingredient** (the same
      `highlightText` treatment `SearchListItem` uses), and the hand-rolled tag
      chips are the shared **`Badge variant="secondary"`**, matching `TagFilterRail`
      and `CardTags`. `MAX_RECIPE_ROWS` drops **6 → 5**: `CommandList` caps at
      `min(24rem,60vh)`, which six three-line rows fill exactly, pushing "See all
      results" out of view.
- [x] **Four adjacent fixes.** (a) The palette **records recents** now — on
      opening a result and on "See all results", the same two commit points
      `/search` treats as commits; palette-originated searches were previously
      invisible to the RECENT row. (b) The trigger's **⌘K chip is
      platform-aware** (`⌘K` / `Ctrl+K`) via `useSyncExternalStore` — the
      codebase's established idiom, which sidesteps both hydration mismatch and
      `set-state-in-effect`; the handler always accepted `metaKey || ctrlKey`, so
      the chip had been lying to every Linux/Windows reader. (c) Rows **highlight
      against the committed `query`**, not the live input, which for one debounce
      marked a prefix the result set was never matched on; and
      **`SEARCH_DEBOUNCE_MS`**, copy-pasted verbatim in two files, is now a single
      export from `SearchContext` (not a resurrected `SearchForm/constants.ts`,
      deleted in PR 19). (d) Test-surface repairs, below.
- [x] **A readiness gate, at last.** The palette had no analogue of `/search`'s
      ticker, which is why every palette result assertion carried a bare
      `{timeout: 15_000}`. `CommandList` now exposes
      `data-testid="palette-list"` + `data-index-ready`, and `palette()` /
      `openPalette()` / `paletteIndexReady()` moved into `support/helpers.ts`
      beside `searchFor` (PR 19's one-place precedent). The palette input is
      matched by **placeholder, never by an accessible name of "Search recipes"** —
      `searchFor()` resolves that name unscoped, so a matching name would make
      every `/search` spec strict-mode ambiguous.
- [x] **Tests.** Depth-dependent specs moved to the **`search-corpus`** fixture
      (67 recipes, 8 tags, descriptions, the ginger name-vs-ingredient pair);
      launcher/owner tests stay on `three-recipes` so the owner baseline doesn't
      churn. New: the **tag-leak regression** (set two never-co-occurring tags on
      `/search`, open the palette elsewhere, assert results are unfiltered and the
      FILTER row names and clears them); recents appear / re-run / delete-one-and-
      reflow / clear-all, by **both** ⌫ and pointer; description snippet +
      matched-ingredient line and their highlights; "See all results" clearing
      tags and recording a recent; palette-opened results recording a recent; and
      the **⌘-vs-Ctrl chip** (both `navigator.platform` and the UA are stubbed, so
      the assertion holds whatever the host OS is). Axe grew from one case (light,
      signed out, empty) to **four**: populated results, recents visible, and dark
      — the guard for the `nested-interactive` constraint. The
      `Command palette visuals` describe was **untagged**, so `e2e-dev:visual`
      silently skipped it; it is now **`@visual`**, with two new shots (recents, a
      deep result row). The four existing baselines were regenerated delete-first
      and came back **byte-identical** — `three-recipes` carries no descriptions
      and no tags, so the deeper row renders exactly as before on that fixture;
      the new depth is captured by the `search-corpus` shot instead. Full editor
      suite green: **349 passed**.
- [x] **Export app.** Shared code, and export still has no e2e suite, so it was
      driven by hand twice. **Behaviour** on `next dev` against `search-corpus`:
      the tag-leak case, the FILTER row naming and clearing the tags, deep rows
      (description + matched ingredient + chips), a palette-opened result reaching
      `/search`'s RECENT row, the chip's sibling `×`, and the `Ctrl+K` hint — all
      pass, no page errors. **The real static build** (`next build` →
      `serve out`) against the fully-indexed `many-featured-recipes` fixture:
      builds clean and the palette works on the built artifact (5 recipe rows +
      "See all results", index-ready gate, `Ctrl+K` hint), again with no page
      errors. Worth restating the known trap, because it bit again here: an
      **`output: export` build fails with "missing `generateStaticParams()`" when
      a dynamic route's params come out _empty_** — so `search-corpus` (no
      featured recipes) fails on `/featured-recipe/[slug]`, and it names a
      _different_ route depending on which index is empty. That is a fixture
      problem, not a code one.
- **Next PR: PR 21a — the typed filter language** (see the decisions log).

### PR 21a — The query becomes the only filter `ui/21a-query-language` ✅ done

PR 18 built the palette, PR 19 made `/search` its dwell surface, PR 20 made the
palette _participate_ in the shared state. One thing was still not the query: the
tag filter. `selectedTags` + `filterMode` lived in sessionStorage, were mutated
from four places, and were visible in two — the rail on `/search`, and the FILTER
row PR 20 added _precisely because_ the state was otherwise invisible. That row
was a workaround for a design problem. 21a fixes the design problem.

- [x] **`SearchForm/queryLanguage.ts` — the whole language, pure and unit-tested.**
      `parseQuery(raw)` → `{ text, filter, hasAdvancedSyntax }`; `matchesFilter`
      evaluates the AST over a `MassagedRecipeEntry`. Fields: `tag` /
      `ingredient` / `name` / `description` / `time` / `before` / `after`,
      implicit AND, explicit `AND`/`OR`, parentheses, `-x` ≡ `NOT x`, and
      `tag:"slow cooker"` for operands with spaces. The two `fold()` copies
      (`SearchList`, `SearchContext`'s `recentKey`) collapse into one export
      here, so the engine, the filter and the highlighter all agree on what
      counts as the same word.
- [x] **Three judgement calls worth naming.** (a) A **known field with no operand
      yet** (`tag:`, `time:<`) is **dropped**, not passed on as free text —
      passing it on would search the corpus for the literal word "tag" and blank
      a page that is one keystroke from being filtered. An **unknown** prefix
      still keeps its whole atom as text. (b) A **negated bare word** (`-choc`)
      can't go to the engine (free text has no exclusion), so it becomes an
      all-fields exclusion rather than silently searching _for_ the word. (c) An
      **OR with an unconstrained operand** (`tag:a OR chocolate`) drops that
      operand instead of absorbing the expression; the strictly-logical reading
      ("no constraint") would silently widen to the whole corpus.
- [x] **Matching mirrors the engine.** Operands match at a **word prefix**, the
      same shape as `tokenize: "forward"`, so `ingredient:choc` narrows live
      while it is typed. Toggling is **exact**, though: a chip for "baked" must
      not read as pressed because the query happens to say `tag:b`.
- [x] **The context keys the engine on `text`, not `query`.** Editing a filter
      term neither invalidates the search cache nor re-runs FlexSearch for a
      result set that cannot have changed. `displayedRecipes` = engine hits (or
      the whole corpus, when there is no free text) filtered by the AST — the
      same shape as the tag filter it replaces, so consumers barely moved.
      `selectedTags`, `filterMode`, `toggleTag`, `setSelectedTags`, `clearTags`,
      `setFilterMode`, `TAGS_KEY` and `MODE_KEY` are **gone**; `parsedQuery` and
      `toggleTagTerm` replace them.
- [x] **One mutation path for every chip.** The rail and `CardTags` both call
      `toggleTagTerm`, which rewrites the **string**. "Clear tags" strips `tag:`
      terms only, leaving free text (and any other filter) intact, and tidies the
      parentheses and operators the removal orphans. The ticker counts filter
      **terms** off the AST (`2 FILTERS`, not `2 TAGS`).
- [x] **The palette reads `displayedRecipes` again — and this time it's correct.**
      PR 20 had to read `searchedRecipes` because the filter was invisible
      sessionStorage state that would cut palette results on every route but
      `/search`. The filter is now whatever the palette's own field says, so
      honouring it is the only honest option; the FILTER group and its testid are
      deleted, and "See all results" carries the whole query across instead of
      clearing anything.
- [x] **The subtle break: highlighting.** `highlightText(text, query)` left alone
      would `<mark>` "dessert" inside every name and description for a
      `tag:dessert` query — marking a word that _constrained_ the set rather than
      matched it. Every call site now passes **`parsed.text`**; `SearchList`'s
      prop is renamed `highlightQuery` so the contract is in the type, not a
      comment.
- [x] **`time:` is the one filter that needed data.** `prepTime`/`cookTime`/
      `totalTime` were added to `RecipeEntryValue`, `buildIndexValue`,
      `getRecipes`'s map and `MassagedRecipeEntry`; `time:` reads `totalTime`,
      falling back to prep + cook, and a recipe with **no** timing matches no
      `time:` query (unknown is not fast). A bare `time:30` reads as "30 minutes
      or less" — exact equality on a duration is true of almost nothing.
      `before:`/`after:` needed nothing (`date` was already there) and bound at
      **local** midnight, both exclusive of the named day. **Operationally**,
      same as PR 19's `description`: times only reach search after the LMDB index
      is rebuilt (Maintenance → "Reload Recipe Database", or a sync). PR 19's
      IndexedDB-rename trap did **not** apply — these are `store`d, not added to
      `document.index` — and that was verified, not assumed.
- [x] **URLs: `?q=` writes, `?tags=` still reads.** The sync effect writes only
      `q`, but reads `?tags=`/`?mode=` once on mount and folds them into the query
      (`?tags=a,b&mode=or` → `(tag:a OR tag:b)`), then deletes them from the URL
      so a reload can't apply the same tags twice. Existing links, bookmarks and
      history entries keep working; nothing mints them again. Every deep link
      (detail page, card hints, homepage browse chips) goes through one
      `tagSearchHref()` and lands on `/search?q=tag:<tag>`.
- [x] **Tests.** The grammar is **unit-tested** (`test/queryLanguage.test.ts`,
      65 cases): precedence, grouping, negation, quoting, comparisons, unknown
      prefixes, ~18 half-typed fragments, and the rewrite helpers' round-trips —
      all miserable through a browser. **Blocker cleared first:** root
      `vitest run` had no `include`, so it swept up every Playwright spec (which
      throw under a vitest runner) _and_ collected every test file once more per
      checkout in `.claude/worktrees/*`; `vitest.config.js` now scopes to
      `test/**`. New e2e `search-query-language.spec.ts` covers the locked shape,
      free-text + filter composition, negation, `time:`, `before:`/`after:`, an
      unknown prefix behaving as free text, a half-typed query not blanking the
      page, highlighting **not** marking filter values, `?q=` round-tripping and
      `?tags=` back-compat, plus axe with a filter active. `search-tags.spec.ts`'s
      rail case is rewritten around terms; the palette's FILTER-row case becomes
      "the filter doesn't follow the palette off `/search`" plus a new "the
      palette takes the query language too".
- [x] **Fixture.** `search-corpus` regenerated **after** the `buildIndexValue`
      change (PR 19's ordering trap) so the committed LMDB index carries the new
      fields: prep/cook times on the seven rich recipes (two under 30 minutes,
      one prep-only to exercise the fallback), none on the 60 filler, and one
      deliberately backdated recipe so `before:`/`after:` can discriminate rather
      than merely parse. Crème Brûlée was chosen for the backdate because it is
      created first and so already sorts **last** in the reverse-chronological
      browse view — the visual baselines clip the top of that list, so no
      snapshot moves.
- **The "lands unused" inventory was wrong by the time 21a closed, and the
  additive claim it was supporting is still right.** What actually landed unused
  is **`hasAdvancedSyntax` alone**. `toggleTagTerm` shipped with two consumers
  (`TagFilterRail` and `CardTags`), `removeFilterTerms` drives "Clear tags",
  `positiveTagValues` drives every chip's pressed state, `countFilterTerms` is
  the ticker's `2 FILTERS`, and `quoteQueryValue` is inside `toggleTagTerm`. The
  conclusion held — 21b added a component, three exports and one group and
  changed no existing behaviour — but the evidence given for it did not, from
  within 21a itself. Corrected by 21b, per the §0-style obligation this document
  carries.
- **Next PR: PR 21b — the builder layer.**

### PR 21b — The builder layer `ui/21b-builder-layer` ✅ done

21a made the query the only filter and left it a thing you **type**. 21b makes it
a thing you can also **point at**: what the query says is now drawn as chips, and
each chip is two edits. The fourth affordance from the scope lock, in-field
autocomplete, is 21c.

- [x] **Split 21b / 21c, along the line of the mechanism.** Three of the four
      locked affordances reduce to one thing — rewriting the query string from a
      term's position — so they ship together. Autocomplete does not: it needs a
      caret, its own keyboard contract against `SearchInput`'s
      Enter-flushes-debounce, and a popup primitive that does not exist here. A
      **fifth** item from the scope lock, "the `/search` rail emits `tag:`
      terms", was already done inside 21a (`TagFilterRail.tsx:39`,
      `SearchList/CardTags.tsx:27`) — recorded here so nobody goes hunting for
      it.
- [x] **The mechanism: token offsets, threaded into the AST.** `tokenize` has
      always set `start`/`end` on every token — including the negation-aware
      `start` and the post-quote `end`. What dropped them was `termNode`, the
      single construction site for a leaf. So the change is **propagation, not
      new parsing**: the three leaf variants of `FilterNode` carry a `QuerySpan`,
      `filterTerms(filter)` walks them out in query order (`countFilterTerms`'s
      walk with the leaves as the accumulator instead of a tally), and three new
      helpers rewrite the raw string by offset through the existing private
      `spliceTokens` / `tidy`.
- [x] **Offsets rather than value-matching, and the second reason is the one that
      decided it.** Value-matching (what `toggleTagTerm` does) cannot tell "this
      chip" from "a chip that looks like it", so a query naming one term twice has
      no well-defined edit. And leaf `value` is **pre-folded** — `tag:Crème` is
      held as `creme` — so a chip drawn from the payload would display text the
      user never typed. `raw.slice(start, end)` is the only source that cannot lie
      about what is in the field, and it is what every chip face renders.
- [x] **The trade that buys, stated plainly.** AST equality became
      position-sensitive: `-tag:baked` and `NOT tag:baked` still parse to the same
      _shape_ but no longer to the same object. Nothing evaluates on the spans
      (`matchesFilter` ignores them), and the ~20 unit assertions that compare a
      parsed filter as a value go through a `spanless()` helper rather than
      carrying two offsets that say nothing about the grammar.
- [x] **Mid-keystroke is well-defined by construction, not by debouncing.** Chips
      are re-derived from the current string on every parse, so there is no stored
      mapping to invalidate and no offset can be stale. A chip being typed simply
      re-renders or disappears. The helpers still revalidate — they locate a token
      at exactly that span _and_ check its kind and field agree with the leaf —
      and **no-op rather than mis-edit** when handed a string that moved. A dead
      click is recoverable; a silently mangled query is not.
- [x] **Affordance 1 — the chip preview line**, in `SearchResults.tsx` between
      the ticker row and the tag rail. Not in `SearchInput.tsx`, which is shared
      with the featured-recipe picker modal — and asserted, not assumed: a spec
      opens the picker and checks the line is absent. `InputGroup` was considered
      as a host for it and rejected: its `block-end` addon slot looks like a
      natural chip shelf, but it is `h-9` with `shadow-xs` against
      `SearchInput`'s hand-rolled `h-12`, so adopting it would move baselines for
      no functional gain. Gated on `hasAdvancedSyntax`, which 21a landed for
      exactly this.
- [x] **Affordance 3 — two edits per chip, on sibling buttons.** The body cycles
      the operator; the `×` removes the term and tidies the parens and operators
      the removal orphans. Sibling and not nested, following 21a's own precedent:
      `nested-interactive` is a **wcag2a** rule this page's axe case asserts, so
      the chip reuses the RECENT row's shape (a pair of buttons sharing one
      border) rather than inventing one.
- [x] **The cycle contract, unit-pinned.** It is **never destructive** — only the
      `×` removes — and for text and dates **two cycles are the identity**. Text
      fields flip negation, normalising a long-hand `NOT tag:x` by dropping the
      `NOT` token rather than growing a second negation. `time:` walks all four
      comparisons (`<` → `<=` → `>` → `>=`), starting a bare `time:30` from `<=`
      because that is what it parses as. `before:`/`after:` **are** their
      operator and the language can only express two of the four, so a date term
      cycles by swapping the field — the faithful reading of "cycles its
      operator" for a field that has no operator slot.
- [x] **Affordance 2 — a "Narrow this search" palette group.** Facet rows insert
      a whole term (`Only tag:dessert`, drawn from the tags the current result set
      actually carries, so a row can only narrow and never empty the list);
      bare-field rows insert `ingredient:` / `time:` for the fields nothing else
      in the UI hints exist. Own `value` prefix (`term:`) per the file's
      convention, and the testid is **`palette-insert-group`** — deliberately not
      `palette-filter-group`, PR 20's retired testid, which two specs still assert
      `toHaveCount(0)` as a fence.
- [x] **Gated on `hasMore`, for two reasons that agree.** Product: offer
      narrowing exactly when there is something to narrow — under six hits the
      list is already the answer. Baselines: the two palette result snapshots
      capture a 3-hit and a 2-hit query, so neither moves. A generic `tag:` row is
      suppressed when facet rows are present, because it is noise under three
      concrete `Only tag:x` rows.
- [x] **A bare field must not blank the page, and 21a is why it doesn't.**
      Judgement call (a) drops a known field with no operand, so appending `tag:`
      leaves the result set the user is looking at exactly where it was while they
      type the operand. Asserted on the row count, not inferred.
- [x] **cmdk's selection was checked, not trusted.** cmdk snaps to the first item
      when the item list changes and the palette already controls `selectedValue`
      for that reason. Appending a group _below_ the recipes cannot steal the
      highlight, and a spec asserts both halves: the top recipe row still carries
      `data-selected`, and Enter still opens it.
- [x] **Two defects found by failing assertions rather than by reasoning.**
      Clicking a cmdk row takes focus **off** the input — fine for every other row
      in the palette, since they all navigate or close, but a bare-field row is
      only "ready for the operand" if the caret is there, so the focus is handed
      back explicitly. And removing a single operand of a group produced
      `tag:a ( tag:c)`: `tidy` collapsed whitespace but never had to handle a
      space hugging a parenthesis, because before this PR no removal could reach
      that state. Both fixed at the cause.
- [x] **Two deliberate omissions.** No **clear-all** in the chip line: the rail
      renders "Clear tags" a few pixels below whenever there is a tag term, and
      two near-identical clear controls stacked reads worse than one. No
      **`aria-live`** on the chip container: `SearchTicker` already owns a polite
      region describing the same change, and a second one announces every edit
      twice. `toggleTagTerm` was also **not** refactored onto the new
      `appendFilterTerm`; it has eight unit cases and three e2e assertions riding
      on it and the shared tail is four lines.
- [x] **Known trade, recorded rather than hidden.** The palette group renders
      after five recipe rows and the overflow row, which is past `CommandList`'s
      `min(24rem,60vh)` — so it takes an arrow-down or a scroll to see. Being last
      is the deliberate half (PR 20's rule: Enter must never be a filter edit);
      needing a scroll is the price. Its baseline is scoped to the group for the
      same reason.
- [x] **Tests.** **28 new unit cases** in `test/queryLanguage.test.ts` (296 total,
      from 268): spans on every leaf for quoted, negated and comparison terms; the
      `raw.slice` round-trip on a folded `tag:Crème`; every cycle step and the
      two-cycles-identity property; removal tidying orphaned parens and operators;
      one term appearing twice editing independently; stale handles no-oping both
      ways, including the `time:<30`-vs-`tag:abcd` case where the spans coincide;
      and 21a's half-typed fragments re-asserted for offsets never leaving the
      string. New **`search-query-chips.spec.ts`** (12 cases) plus **6 new palette
      cases**, and the chip line is asserted inside `search-query-language.spec.ts`'s
      existing axe pass — which already ran with a filter active, so the
      `nested-interactive` fence costs nothing extra. `search-tags.spec.ts` gains a
      cross-surface case: the rail writes a term, the chip line shows it, the
      chip's `×` takes it away, and the rail chip goes unpressed.
- [x] **Baselines: 26 of 27 unchanged, two added, one pre-existing failure
      established as pre-existing.** The chip line renders nothing without
      advanced syntax, which is what holds the four `/search` baselines still, and
      the `hasMore` gate holds the palette's six. New: `search-query-chips.png`
      and `palette-insert-rows-light.png`, both locator-scoped. The 27th,
      `search-reveal-control`, fails on a "Show 7 more" button this PR does not
      touch — checked out at `8d3c243c` with none of 21b applied and it fails
      identically, so it is this box's sub-pixel text rendering, not a regression.
- **Next PR: PR 21c — in-field syntax autocomplete.** 21b leaves it the mechanism
  it wants: `filterTerms` and the offset helpers are exported, and finding the
  atom under a caret is a span comparison rather than new parsing. The open
  question, recorded now so it isn't rediscovered: **there is no combobox
  primitive** in `packages/component-library/components/ui/` (there is
  `command.tsx`, `popover.tsx`, `input-group.tsx`, `badge.tsx`). The
  shadcn-canonical composition is Popover + Command, but a `Command` inside the
  `/search` field puts a second cmdk instance on a page that already has the ⌘K
  palette, and autocomplete inside the palette's own `CommandInput` would nest
  Command in Command. 21c should probably hand-roll a `role="listbox"` on
  `popover.tsx` instead.

## Reader chrome pass

Qualifies two earlier decisions: PR 9 introduced the sticky masthead and
`--header-height`, and PR 11 moved the scaler into a sticky Ingredients header.
Both were right for the viewport they were designed on and wrong for a short one.

On a phone held sideways — 851×393, the reported case — the masthead (56px) plus
the Ingredients header (~84px) is **140px, 36% of the viewport**, spent on chrome
that labels the ingredients it is crowding out. This is not a phone bug: a
split-screen or short desktop window has it too.

- [x] **Responsive by default, with an override.** A plain toggle in the
      Appearance panel would have been simpler and would have missed the reader
      it is for — the one who never opens a menu. So `auto` (the default)
      releases below 600px of viewport height, `always` pins regardless, and
      `off` never pins. The two overrides exist for the reader whose judgement
      differs from the threshold, not as the mechanism.
- [x] **600px, not 640.** 640 sits right on a 1366×768 laptop's usable viewport
      and would flap for a large real population.

      | viewport                         | height | must be  |
      | -------------------------------- | ------ | -------- |
      | iPhone 14/15 Pro Max, landscape  | 430    | released |
      | Pixel 5 landscape / the report   | 393    | released |
      | 1366×768 laptop, real browser    | ~640   | pinned   |
      | Playwright `e2e` (Desktop Chrome)| 720    | pinned   |
      | Playwright `mobile` (Pixel 5)    | 851    | pinned   |

      600 clears the tallest phone landscape by 170px and the laptop by ~40px.

- [x] **The cascade split** (`styles/theme.css`). Tailwind v4 emits a bare
      `@layer components;` declaration _before_ `@layer utilities`, and layers
      order by declaration — so a `@layer components` block loses to every
      utility regardless of `@import` order. But **unlayered declarations outrank
      every cascade layer**. Hence the split: `--sticky-chrome-position` /
      `--sticky-chrome-offset` stay **unlayered** on `:root` (a layered override
      of an unlayered default could never win — a silent no-op), while
      `.sticky-chrome { position: var(…) }` goes in **`@layer components`** so
      the call sites' `print:*` utilities still beat it. Rejected: an
      `@utility` definition, which puts the class in the utilities layer where
      `[data-sticky-chrome="off"]` at (0,3,0) out-ranks `print:static` at (0,1,0)
      — printing under **Always** would keep the header pinned. Also rejected: a
      `@custom-variant short` repeated at every call site as three utilities
      (`short:static`, `chrome-off:static`, `chrome-pinned:sticky`), which
      depends on variant sort order and on every future adopter repeating it
      correctly.
- [x] **Never re-add `sticky`.** An element carrying `.sticky-chrome` must never
      also carry Tailwind's `sticky` utility: the utility out-ranks the
      components layer and the reader's preference dies quietly, with nothing to
      see in the diff. Noted at both call sites and in `theme.css`.
- [x] **Position and offset move together.** One condition sets both. An offset
      still reserving 3.5rem under a released masthead would strand a dead band
      at the top of every secondary sticky element.
- [x] **Layout-neutral, so no baselines moved.** A sticky box is already in
      normal flow, so releasing one shifts nothing — nothing needed a
      compensating `padding-top` or `scroll-margin`, and no screenshot changed.
      The masthead's backdrop-blur fallback (`supports-[backdrop-filter]`) means
      that at scroll-top it already rendered as 80% card over the page
      background: a static header is
      pixel-identical to the current sticky-at-rest state. Every `toHaveScreenshot`
      call site is in `playwright/support/visual.ts` and none captures the
      Appearance popover open, so adding a control there shifted nothing either.
- [x] **The Radix-unmount trap.** `PopoverContent` and `SheetContent` both
      unmount when closed, so the effect writing `data-sticky-chrome` onto
      `<html>` **cannot** live beside the toggle — the preference would hold only
      while the menu was open. It mounts as `<StickyChromeSync />` in
      `AppProviders`. `sticky-chrome.spec.ts` presses **Escape** between choosing
      Off and asserting: without that step the test passes with the effect in the
      wrong place.
- [x] **Pre-paint script for scroll restoration, not flash.** Releasing a sticky
      box shifts nothing at scroll-top, so there is no flash to avoid. The reason
      is scroll restoration: a reload restores the scroll offset around first
      paint, and a masthead pinned for the pre-hydration frames and then released
      visibly pops away from the top of a mid-page view. Split into
      `AppLayout/stickyChrome.ts` with **no** `"use client"` — `AppLayout/index.tsx`
      is an async server component, and a client module imported across that
      boundary yields a client _reference_, not a callable function (same reason
      `prePaint.ts` carries none). Injected as its own `<script>` beside the theme
      one, not concatenated, so either can fail or be reviewed independently.
- [x] **`auto` is never persisted.** Setting it `removeItem`s the key, following
      the `useListMode` convention: an absent key and `auto` mean the same thing,
      and clearing it lets a future change to the 600px threshold reach readers
      who never expressed a preference.
- [x] **The panel took a slot, not a union.** `AppearanceControls` /
      `AppearanceMenu` gained `extraControls` and `Field` was exported as
      `AppearanceField`. The kit can't own a sticky-header preference (it means
      nothing on a portfolio) but it belongs in the same panel. Named for
      `AppLayout`'s `extraNavItems` convention. Wired at **both** `nav.tsx` call
      sites — the mobile sheet is the easy miss, because `AppearanceMenu`'s prop
      does not reach it.
- [x] **Vocabulary mismatch on purpose.** Internal name `stickyChrome` ("chrome"
      is house usage — see `globals.css` and the Owner-chrome pass above);
      visible label "Sticky headers", because "chrome" is jargon to a reader.
      Commented at the definition so nobody "fixes" one of the two.
- [ ] **`SidebarLayout` deliberately left alone.** Retiring its
      `top-[var(--header-height)]` for the policy offset was considered and
      rejected: it is a kit component serving both sites, and only recipe's
      masthead follows the policy, so the swap would drop portfolio's settings
      sidebar to 0 under a masthead that is still pinned. Low urgency either way
      — the aside is `lg:block`, so it is never on screen on a landscape phone.
      Switch it in the same change that gives portfolio's masthead
      `.sticky-chrome`. Noted at the call site.
- [x] **Export app needed no sync.** It shares `theme.css` via its `globals.css`
      and the same `AppLayout`, so its hand-duplicated `@media print` block was
      untouched — the policy lives in one place.

## Verification (Playwright-first)

Verify UI changes with Playwright; open a real browser only to diagnose
failures. Existing specs: `visual.spec.ts` (regenerate baselines on intentional
change), `paste-replace.spec.ts`, `ingredient-preview.spec.ts`, `git.spec.ts`,
`sticky-chrome.spec.ts`.
Run the editor suite after each PR; keep both editor + export apps building with
the shared theme.

**Snapshot-owning specs (regenerate ALL on a theme change).** Visual baselines
live in two places, and a theme change invalidates both. The `@visual`-tagged
specs — `visual.spec.ts` and `mobile.spec.ts` — are covered by `e2e-dev:visual`
(`--grep @visual`, which also spawns `-mobile.png` variants). But several
**functional** (non-`@visual`) specs embed their own screenshots and are _not_
touched by `e2e-dev:visual`: `empty-state.spec.ts`, `featured-recipes.spec.ts`,
`recipe.spec.ts`, `ingredient-preview.spec.ts`, `menus.spec.ts`, `yield.spec.ts`,
and `paste-replace.spec.ts`. Regenerating only the `@visual` set (as PR 1 did)
leaves these functional baselines stale against the new theme. Regenerate them
with `e2e-dev:update-functional-snaps` (`--project=e2e --update-snapshots` against
exactly those specs — no mobile project, so no unwanted `-mobile.png` variants).
Historically `e2e-dev:update` wholesale was unsafe while the TanStack-form
migration was in flight (it would enshrine broken new-recipe/edit/markdown-source
renders). **PR 4.2 repaired that migration and greened the suite**, so wholesale
regen is no longer a landmine — but still prefer targeted regen (only the specs a
change actually touches) to keep diffs reviewable. When regenerating a form
baseline, gate on hydration first (`markdownEditorReady`) so a mid-hydration frame
isn't captured.
