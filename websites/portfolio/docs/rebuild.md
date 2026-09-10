# Portfolio Rebuild — "The Index"

> **This is the durable source of truth for the portfolio rebuild.**
> It persists in-repo so a fresh session (with cleared context) can rebuild the
> full picture by reading this file. Update the **Status** checkboxes and the
> **Decisions log** at every PR boundary. Each PR is a stacked branch and gets
> its own plan-mode pass seeded from this doc.
>
> Modelled on `websites/recipe-website/docs/ui-overhaul.md`, which is what made
> that 21-PR stack survive repeated context loss.

## Why this exists

`websites/portfolio` never received any of the UI overhaul that reshaped
`websites/recipe-website`. It is not a neglected-but-working site; it is a
skeleton whose styling is largely **inert**.

- **The design system is imported but never applied.** Neither
  `editor/src/app/globals.css` nor `export/src/app/globals.css` imports
  `packages/component-library/styles/theme.css`, and both carry `@source` globs
  pointing at **pre-`@discontent`-rename** paths
  (`../../node_modules/component-library/components`, likewise
  `projects-collection` and `portfolio-website-common`). Tailwind therefore never
  scans the shared kit, so no class it uses is ever emitted.
- **Every color class resolves to nothing.** `common/components/Homepage/*` is
  written against `bg-background-light`, `text-primary-dark`, `text-body-*` — a
  token vocabulary that exists nowhere in the repo. The only thing painting the
  page is a hardcoded `bg-slate-950` on `<body>`.
- **No typography.** No `next/font` anywhere in either app. Dark mode is faked:
  `.dark` is never applied to any element, so every `dark:` variant in the tree
  is dead code.
- **The export app is a stub.** Four files, homepage-only. No project pages, no
  header, no footer, no `[...slug]` catch-all — meaning **`/about` cannot render
  at all**. `/deploy` points at a directory that does not exist.
- **Zero tests.** The README documents a Cypress suite that was never written;
  the four `e2e-*` scripts in both apps point at a `cypress/` directory that does
  not exist.
- **The write path is a generation behind.** All three
  `packages/projects-collection/controller/actions/*` are `"use server"` with
  **no `auth()` check** — unauthenticated create/update/delete. No
  `createContent`, no git commit, no LMDB index, no uploads. Recipe has since
  moved to TanStack Form over native FormData, a generic `createGenericActions`
  factory, and a Lexical WYSIWYG.

Meanwhile the monorepo already contains a design system portfolio pays for and
does not use: `@discontent/component-library` plus a `theming/` engine whose
contrast curve makes **every accent choice WCAG AA by construction**.

**Outcome:** a portfolio that is (a) visually its own thing, (b) genuinely usable
by anyone who forks it, and (c) covered by tests — with the shared packages left
better than we found them.

## Decisions log

- **Audience: all of them.** The site must pivot easily between a designer's
  image-forward book, a developer's index, and a job-seeker's résumé. That is why
  **postures** (below) exist rather than a single hardcoded layout.
- **Reuse model: fork-and-configure.** Portfolio is meant to be forked. Anything
  generic enough to be worth sharing is **promoted into
  `@discontent/component-library`** rather than copied; anything identity-bearing
  stays in portfolio.
- **Identity: its own palette, type and armature**, riding the shared token +
  theming engine rather than sidestepping it. Portfolio does **not** get a
  private token file.
- **Projects model: unify on the collection.** `@discontent/projects-collection`
  becomes the single source of truth for works; the `homepage.json` blob (which
  today carries a second, parallel project list) is **retired** in PR 12.
- **Pivotability: three named layout _postures_** — Index / Studio / Résumé.
  Same components, different order and weight.
- **Content: seed with Roger's real projects**, not lorem ipsum. A portfolio
  template whose demo content is fake reads as a template.
- **Search: in-place index filter + ⌘K palette.** No `/search` page, no
  FlexSearch, no IndexedDB. See PR 10a for why the recipe stack is the wrong
  size here.
- **Writing/blog: out of scope, and no seam is reserved for it.** _(Corrected
  2026-07-31 — this used to claim "the `Project` shape and the postures leave
  room", which was aspiration stated as fact.)_ `Project` has no `type` or
  `kind` discriminator (see `projects-collection/controller/types.ts`) and there
  is no second collection. Adding writing later means a new content type — the
  `@discontent/cms` factory makes that cheap, which is the real reason it isn't
  worth pre-building, but it is a new content type, not a field.
- **Git-sync UI: out of scope for v1.** Recipe's git panel stays recipe's.
- **Forms: rebuilt on recipe's current architecture**, not on portfolio's. See
  **Forms** below — the mechanism is unusual and load-bearing.
- **Primitives: adopt shadcn wherever it is a genuine win**, and only there. See
  **shadcn adoption** for the explicit do/don't list; several tempting primitives
  are actively harmful in this repo.
- **Branching:** `portfolio/NN-*`, fast-forward-merged into `content-engine-test`,
  mirroring the recipe stack's convention.
- **Prerequisite: land recipe PR19 first**, so recipe's suite is a trustworthy
  gate for the PRs that touch it. _(Satisfied: `content-engine-test` carries PR19,
  PR20 and PR21a as of 2026-07-28.)_

---

## Design direction — "The Index"

### Thesis

A portfolio's most characteristic artifact is **the list of what you made**. So
the homepage _is_ the index — no hero band above it, no stat tiles, no gradient.
A short statement, a count line, then the works.

The central tension: the identity must be distinctive without fighting someone
else's content. **Resolution — personality lives in the armature, not the content
presentation.** The masthead, index, labels and type carry a strong point of view;
the work is shown plainly and generously, untinted and unscrimmed. A gallery has
architecture; the walls are white.

### Signature

**The index doubles as the search surface.** Typing filters rows in place — no
results page, no modal, no route change. The count line updates via `aria-live`;
matched substrings take the accent.

The structural device is the **year rail** — real project dates. Deliberately
_not_ `01 / 02 / 03`: a portfolio's works aren't a sequence, so numbered markers
would encode nothing. Dates encode recency, which the reader wants.

### Color — preset `marginalia`

The accent is an **annotation color** — the reader's mark in the margin. That
sets a hard usage rule: **accent appears only on _marks_** (current row, search
match, focus ring, wordmark square) and **never as a large fill**.

```
accentHue: 335   neutral: "cool"   radius: 0.25   fontPairing: "marginalia"
```

Derived by `theming/derive.ts`, so it sits on the contrast-safe curve:

| Role        | Light                                            | Dark                                               |
| ----------- | ------------------------------------------------ | -------------------------------------------------- |
| paper / ink | `oklch(0.98 0.006 255)` / `oklch(0.22 0.02 255)` | `oklch(0.185 0.008 255)` / `oklch(0.96 0.006 255)` |
| madder      | `oklch(0.53 0.16 335)`                           | `oklch(0.70 0.16 335)`                             |

Cool paper + deep madder is deliberately distant from both the templated
cream/serif/terracotta look and the near-black/acid-accent look. `radius: 0.25`
softens the catalog-card geometry without going to zero — zero-radius belongs to
the broadsheet default we're avoiding.

### Typography — pairing `marginalia`

| Role    | Face                                   | Job                                                                                                                    |
| ------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| display | **Fraunces** (variable, `SOFT`/`WONK`) | Index entries set large. Warm, idiosyncratic old-style — not the high-contrast Didone that templated work reaches for. |
| body    | **Instrument Sans**                    | Quiet under a characterful display; carries case-study prose.                                                          |
| mono    | **DM Mono**                            | Year rail, counts, tags, eyebrow labels.                                                                               |

Portfolio registers **three** pairings so the picker isn't a dead control:
`marginalia`, `bricolage` (all-sans), `plain`. Presets reuse the accents that were
considered and rejected as the default: `marginalia` 335 · `stamp` 15 ·
`oxide` 195/gray · `botanical` 145/warm.

### Layout

```
┌──────────────────────────────────────────────────┐
│ ◼ STUDIO NAME              WORK  ABOUT      ⌘K   │  sticky, --header-height
├──────────────────────────────────────────────────┤
│   Builds content systems                         │  display, 2 lines max
│   that outlive their CMS.                        │
│                                                  │
│   14 WORKS · 2019–2026            [ filter… ]    │  mono; aria-live count
│                                                  │
│   2026   Content Engine        ▸    ┌──────────┐ │
│   2025   Recipe Website        ▸    │  cover   │ │  plate: focused entry,
│   2024   Résumé Builder        ▸    └──────────┘ │  cross-fade only
└──────────────────────────────────────────────────┘
```

Desktop: focus/hover a row → its cover appears in the plate column. Mobile: rows
expand inline.

**Motion budget: the plate cross-fade and nothing else.** No load-in stagger — it
delays the content that _is_ the hero, and staggered list reveals are the most
recognizable AI-design tic.

**Do not rebuild the index row on shadcn `item`.** The row _is_ the signature
(year rail + large Fraunces name + plate trigger), and
`AppLayout/nav.tsx:173` documents why link stacks here stay plain `<div>`s:
`role="listitem"` markup pollutes the unscoped `getByRole("listitem")` counts
that ~30 recipe specs rely on.

### Postures

Same components, different order and weight; stored beside the theme, baked into
the export via `SITE_LAYOUT`.

- **Index** (default) — the catalog above. Neutral; works for anyone.
- **Studio** — plates lead as a grid. Image-forward.
- **Résumé** — statement + roles/skills + compact works list. Credentials-forward.

---

## Forms

Adopt recipe's current architecture wholesale. The mechanism is worth stating
because it is unusual and load-bearing:

**TanStack Form never serializes anything.** Every controlled field also renders a
real DOM input carrying a `name` (or a hidden mirror, for markdown/chips). The
browser builds FormData from the DOM; TanStack just keeps those `value`s in sync.
`RecipeFormShell` is 44 lines and does no reconciliation at all:

```tsx
<form action={action} onSubmit={() => form.handleSubmit()}>
```

`onSubmit` does **not** `preventDefault()` and does **not** gate on validity —
client validators run for error display only; the server stays authoritative.

Rules that must carry over:

1. **Every field keeps a `name`.** A controlled field without one silently never
   submits.
2. **Remount on server error.** `useForm` captures defaults at mount, so the shell
   needs `key={state.formData ? state.message : undefined}` to pick up echoed
   values after a failed round-trip.
3. **Never wrap fields in `form.Subscribe`** — use `useStore(form.store, sel)`.
   Recipe documents that nesting the slug field inside a `Subscribe` broke its
   controlled value at submit time.
4. **Array rows are keyed by index** — normally an anti-pattern, correct here
   _only because_ every child is controlled. One uncontrolled child breaks it.
5. **Nested FormData is dot+bracket names** resolved by lodash `set`
   (`instructions[0].instructions[2].text`). Empty arrays are unrepresentable (no
   key emitted ⇒ `undefined`, not `[]`) — portfolio fields where empty ≠ absent
   need a **sentinel hidden input**.
6. **File inputs stay uncontrolled** — browsers don't allow setting a file input's
   value programmatically.

### The enabler

`editor/controller/actions/{genericActions,editorContentConfig}.ts` are already
fully generic **except for one import**: `ContentFormState` from
`recipe-website-common/controller/formState`. Move that type to
`packages/cms/forms/formState.ts` and portfolio consumes `createGenericActions`
unchanged. **This is the single highest-leverage change in the whole plan.**

### Promotions into `component-library`

This was the plan. **Two rows never happened** — the ⬜ ones below. Both are
still recipe-local as of 2026-07-31; see the note after PR 01d.

| From                  | To                             | Note                                                                                 | Done |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------------------ | ---- |
| `RecipeFormShell.tsx` | `Form/FormShell.tsx`           | Generalize to `{form, action, id}`; recipe adopts it                                 | ✅   |
| `Form/fieldErrors.ts` | `Form/fieldErrors.ts`          | 19 lines, zero recipe knowledge                                                      | ✅   |
| `Form/PasteField/`    | `Form/PasteField/`             | Type-agnostic, but still only at `recipe-website/common/components/Form/PasteField/` | ⬜   |
| `ArrayItemControls`   | `Form/ArrayItemControls`       | **Duplicated verbatim in 3 files** (Ingredients:23, Instructions:33, Timeline:21)    | ✅   |
| `Form/Tags/`          | `Form/ChipsInput`              | Generalize off `name="tags"`/`useRecipeForm()` to `{field, normalize, suggestions}`  | ✅   |
| `durationSchema`      | `cms/forms/schema/duration.ts` | Generic, but still only in `recipe-website/editor/controller/parseFormData.ts`       | ⬜   |
| `normalizeTags.ts`    | `component-library`            | 20 lines, generic                                                                    | ✅   |

**Leak to fix:** `LexicalMarkdown/index.tsx` hard-imports `RECIPE_EDITOR_NODES`,
`RECIPE_TRANSFORMERS`, `$importRecipeMarkdown`/`$exportRecipeMarkdown` and uses
namespace `"recipe-markdown"` — yet recipe's `Multiplyable`/`VideoTime` live in
the _shared_ package. Parameterize on `{nodes, transformers, namespace}`; note
`plugins.tsx:6` imports `$exportRecipeMarkdown` directly and needs the same.

**Preserve exactly** (Playwright depends on it): the hidden `name` input stays a
**direct child of `FieldWrapper`, outside the rich/source switch** — that's the
anchor for `markdownFieldContainer`. Lexical's own `data-lexical-editor="true"`
marker is the hydration gate `markdownEditorReady` waits on.

**Don't regress the `e3d0e87d` fix.** Rich-mode edits persist via a
**normalized-baseline diff**, not an interaction gate: seed the baseline _before_
`registerUpdateListener`, skip selection-only updates via
`dirtyElements`/`dirtyLeaves`, and let the parent own the baseline ref. The old
`interactedRef` approach failed because Lexical's native handlers preempt React's
synthetic `onBeforeInput`/`onPaste`.

---

## shadcn adoption

`components/ui/` currently has 16 primitives. Everything Radix-backed costs a new
dependency; `input`, `textarea`, `field`, `input-group`, `button-group`, `empty`,
`item`, `table`, `alert` are **zero-dep**.

### Do — high value, low spec risk

- **`input` + `textarea` + `label` + `field`** replace `baseInputStyle`, `Label`,
  `FieldWrapper` and `Errors` in
  `component-library/components/Form/index.tsx`. That one style string is
  currently hand-spread across **12 files with drifting padding**, and
  `Video/index.tsx:192` has already drifted onto ad-hoc classes. All 116
  `getByLabel("Name")` calls survive **provided `id`/`htmlFor` plumbing is
  preserved exactly**.
- **Fix a real bug:** `Form/inputs/Image/index.tsx:71` is a `<button>` with no
  `type` inside a form — "Cancel upload" **submits it**.
- **`input-group`** for `File`, `Duration` (h/m addons), and `SearchInput`'s
  hand-rolled icon + `focus-within:ring` recipe.
- **`button-group`** for the `+ ↑ ↓ ×` cluster (independently reimplemented
  **four** times) and `PageActions`.
- **`ui/checkbox`** (already present) for `Form/inputs/Checkbox` — the current
  code applies `baseInputStyle` to a native checkbox, painting a rounded border on
  it. _Medium risk:_ becomes `role="checkbox"`; `.check()`/`toBeChecked()` still
  work, but any `input[type=checkbox]` selector breaks.
- **`alert`** for six git error divs that have **no `role` or `aria-live`** — a
  screen-reader user is never told "Invalid branch" appeared.
- **`alert-dialog`** on **8 unconfirmed delete forms**. Deleting a recipe or
  project is currently one stray click; there is no `window.confirm` anywhere in
  the repo. Biggest safety win, biggest spec cost (~15 tests). Mitigation: name
  the confirm button **"Delete project"** so existing `{exact:true}` "Delete"
  queries stay unambiguous. **Leave `git/BranchSelector` alone** — `git.spec.ts`
  deliberately force-clicks a disabled button to test server-side validation.

### Don't — churn or actively harmful

- **`kbd`** — one instance, already correct.
- **`spinner`** — there are none _by design_; skeletons + pending text instead.
- **`scroll-area`** — JS scrollbars in a repo with a `reduced-motion.spec.ts`; the
  timeline does its own scroll math.
- **`dropdown-menu`** — nothing to replace.
- **`switch`** — semantically wrong; these are submitted form values, not
  immediate-effect toggles.
- **`radio-group`** — native FormData dependency plus page-wide
  `getByRole("radio")).toHaveCount(0)` assertions.
- **`separator`** — `<hr>` is already `role="separator"` for free; the real bug is
  hardcoded `border-slate-700` in 3 files.
- **`calendar`** — the native date picker is right for an editor tool.

### Housekeeping

`components.json` points `css` at `src/styles/globals.css`, which doesn't exist
(actual: `styles/theme.css`), and `tailwind.config` is `""`. **Fix before running
`npx shadcn add`.**

---

## Stacked-PR roadmap

> **One status table, and this is it.** There used to be three — this one, a
> "Status as of 2026-07-29" table, and the A–G follow-up table — and they
> disagreed about 01b, 03, 04, 05, 06, 09 and 12. The other two are gone; the
> follow-up stack is folded in below as rows A–M.

| PR      | Branch                                 | Goal                                                                                                                                                                                  | Status |
| ------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **00**  | `portfolio/00-plan-doc`                | This file — plan + dated decisions log.                                                                                                                                               | ✅     |
| **01a** | `portfolio/01a-theming-multisite`      | Convention-derived font vars + shape validation, so portfolio can have its own typography. **Touches recipe.**                                                                        | ✅     |
| **01b** | `portfolio/01b-promotions`             | Promote layout/theming components; recipe files become one-line re-exports. Fix recipe export's stale `@source`.                                                                      | ✅     |
| **01c** | `portfolio/01c-shadcn-form-primitives` | `input`/`textarea`/`label`/`field`/`input-group`/`button-group`; kill `baseInputStyle`; fix the Image submit bug. **Touches recipe.**                                                 | ✅     |
| **01d** | `portfolio/01d-form-architecture`      | `ContentFormState` → `@discontent/cms`; promote `FormShell`, `mergeFieldErrors`, `PasteField`, `ArrayItemControls`, `ChipsInput`; parameterize `LexicalMarkdown`. **Touches recipe.** | ✅     |
| **02**  | `portfolio/02-foundation`              | Portfolio renders on real tokens for the first time.                                                                                                                                  | ✅     |
| **03**  | `portfolio/03-playwright-harness`      | Harness in place _before_ the redesign, so PRs 04+ are verifiable. Cypress removed.                                                                                                   | ✅     |
| **04**  | `portfolio/04-applayout`               | Portfolio's own `AppLayout`: single masthead, single footer, Appearance popover.                                                                                                      | ✅     |
| **05**  | `portfolio/05-projects-model`          | Projects onto `ContentTypeConfig` + LMDB; richer `Project` shape; **auth-gated `createGenericActions`**.                                                                              | ✅     |
| **06**  | `portfolio/06-projects-form`           | The project form on `FormShell` + TanStack: text, chips (tags), Lexical body, image, links list.                                                                                      | ✅     |
| **07**  | `portfolio/07-detail-pages`            | `/project/[slug]` in _both_ apps; pages catch-all in export; `not-found.tsx`.                                                                                                         | ✅     |
| **08**  | `portfolio/08-settings`                | `(settings)` route group, theme editor, export bake.                                                                                                                                  | ✅     |
| **09**  | `portfolio/09-postures`                | The three postures + picker + `SITE_LAYOUT` baking.                                                                                                                                   | ✅     |
| **10a** | `portfolio/10a-index-search`           | The signature: homepage becomes the live-filtering index.                                                                                                                             | ✅     |
| **10b** | `portfolio/10b-palette`                | ⌘K palette + `/search/all` (`force-static`).                                                                                                                                          | ✅     |
| **11**  | `portfolio/11-confirm-deletes`         | `alert-dialog` on all 8 destructive forms, both sites. Spec-invasive; own PR.                                                                                                         | ✅     |
| **12**  | `portfolio/12-content`                 | Real demo content; retire `homepage.json`; README rewrite.                                                                                                                            | ✅     |
| **13**  | `portfolio/13-baselines`               | Full spec suite, axe sweep across postures × presets × modes, baselines, CI.                                                                                                          | ✅     |

Several of those rows were finished by a follow-up PR rather than by the
numbered one — 06 by **B** and **K**, 08 and 09's picker by **C**, 10b by **E**,
11 by **D**, 12 by **G**, 13 by **F**. The follow-up table below is where the
verification for each actually lives.

**Must be last: PR 13.** A theme change invalidates every visual baseline, and PR
09's postures multiply the matrix.

---

## Phase detail

### PR 00 — Plan doc `portfolio/00-plan-doc` ✅ done

- [x] This file. Mirrors `recipe-website/docs/ui-overhaul.md`; that format is what
      makes a stacked overhaul survive context loss.

### PR 01a — Theming multisite `portfolio/01a-theming-multisite` ✅ done

`theming/parse.ts:51` is a **membership validator**, not a parser:

```ts
? getFontPairing(r.fontPairing).key   // unknown key → silently becomes "bench"
```

`parseTheme` runs on **both** the settings-save path and the `SITE_THEME`
export-bake path, so a portfolio-only pairing key would be silently rewritten and
portfolio would ship recipe's typefaces.

Adding portfolio's keys to the shared `FONT_PAIRINGS` array instead **breaks
recipe**: an unloaded `var(--ff-display-marginalia)` makes the whole
`--font-display` chain invalid-at-computed-value, and headings fall back to the
browser default.

Fix — the `--ff-{role}-{key}` names are pure convention, so **derive** them:

- [x] `fonts.ts` — replace `FONT_PAIRINGS`/`getFontPairing` with
      `isFontPairingKey()` (`/^[a-z][a-z0-9-]{0,31}$/`) and `fontPairingVars(key)`.
- [x] `derive.ts` — `var(--ff-display-${key}, var(--ff-display-fallback))` so an
      unregistered-but-well-formed key degrades to system fonts.
- [x] `styles/theme.css` — add the three `--ff-*-fallback` declarations.
- [x] `parse.ts` — shape check instead of membership.
- [x] `presets.ts` — widen to `getPreset(key, presets = PRESETS)`; `PresetPicker`
      gains a `presets?` prop.
- [x] The **labeled** menu moves into each app's `AppLayout/fonts.ts`, beside the
      `next/font` loaders, with `fontVariables` derived from it so they can't drift.

Recipe impact — **three** source edits plus one spec assertion:
`AppLayout/fonts.ts` (owns the labeled menu, derives `fontVariables` from it),
`ThemeEditor.tsx` (imports `FONT_PAIRINGS` from there instead of the shared
package), and `PresetPicker.tsx` (gains the `presets` prop).

_(2026-07-28, corrected after running the suite.)_ The plan predicted the spec
was untouched because it drives the `<Select>` by visible label — true, but it
**also asserts the derived variable string verbatim**
(`theme-editor.spec.ts:51`), and the fallback changes it to
`var(--ff-display-grotesk, var(--ff-display-fallback))`. Assertion updated; the
fallback is the point of the PR, not an accident. New `test/theming.test.ts`
(12 cases) pins the contract directly: a well-formed unregistered key survives
`parseTheme`, a malformed one is coerced, keys that could smuggle syntax into a
`var()` name are rejected, and `getPreset` falls back **within the supplied
list** rather than to a built-in the picker never rendered.

No runtime check ties a `variable:` literal back to `fontPairingVars(key)`:
next/font returns a hashed class name, not the custom property it defines, so
there is nothing to compare against. An assertion was written and removed.

### PR 01b — Promotions `portfolio/01b-promotions` ✅ done

- [x] Promote `ThemeVarsProvider`, `ThemeToggle`, `PresetPicker` and
      `Appearance` into `component-library/components/theming/` (which already
      held `AccentPicker`); recipe's four files become one-line re-exports, so
      every existing import path still resolves.
- [x] Promote the flash-free pre-paint script out of `AppLayout/index.tsx` into
      `components/theming/prePaint.ts` — portfolio needs the identical script and
      hand-rolling it twice is how the two drift.
- [x] `AppearanceControls`/`AppearanceMenu` gain a `presets` prop threaded to
      `PresetPicker`, so a site's popover offers its own list.
- [x] `next-themes` becomes a direct dependency of `component-library` (it was
      only recipe's).
- [x] Fix recipe **export**'s stale `@source` glob.

_(2026-07-29.)_ The stale glob was worse than a tidy-up: only the **editor** had
been corrected to `@discontent/component-library`. `component-library` exists
**nowhere** under `export/node_modules` — only under `@discontent/` — so
Tailwind was silently scanning a path that does not exist and the static site
was built without ever seeing the shared kit's classes. Tailwind does not warn
on an `@source` that matches nothing, which is why it survived.

_(2026-07-29.)_ **The recipe export build cannot be verified in a fresh
worktree.** `pnpm build` there fails with `Page "/featured-recipe/[slug]" is
missing "generateStaticParams()"` even though the function is right there at
`page.tsx:66`. Confirmed **pre-existing** by stashing this PR's only export
change and rebuilding — identical failure. Cause is the empty content tree: a
fresh worktree has no `content/` and no LMDB index, so the enumeration comes back
empty and Next reports it as a missing export. Seed content before trusting an
export build. Portfolio's own export becomes verifiable at PR 12, when real
content lands.

### PR 01c — shadcn form primitives `portfolio/01c-shadcn-form-primitives` ✅ done

- [x] Fix `components.json` — `css` now points at the real `styles/theme.css`.
      `tailwind.config: ""` is **left as-is**: that is correct for Tailwind v4,
      which has no config file. The plan listed it as a bug; it isn't.
- [x] Add `input`, `textarea`, `label`, `field`, `input-group`, `button-group`,
      taken from the **`new-york-v4`** registry — the plain `new-york` endpoint
      still serves the pre-`data-slot` generation, whose
      `focus-visible:ring-1` would have clashed with every primitive already in
      `ui/`.
- [x] `baseInputStyle` down from **18** call sites to **2**. Every `<input>` and
      `<textarea>` now renders the primitive; the two survivors are the things
      that must _look_ like a field without being one — the Lexical editor shell
      and the native `<select>`. Its docblock now says so.
- [x] `id`/`htmlFor` plumbing preserved exactly.
- [x] Fix `Image/index.tsx` — the "Cancel upload" `<button>` had no `type`, so
      inside a `<form>` it defaulted to `submit` and **submitted the form**.
- [x] `Duration` moves to `input-group` with `h`/`m` addons, keeping the `title`
      attributes that four `new-recipe.spec` assertions locate the fields by.
- [x] `File` moves to `input-group`; the input stays native and uncontrolled.

**Two deviations from the plan, both deliberate:**

_(2026-07-29.)_ **`Checkbox` stays native.** The plan called for `ui/checkbox`.
That primitive's API is `onCheckedChange(boolean)`, while `CheckboxInput`'s is
`onChange(ChangeEvent)` — swapping it rewrites every call site for a cosmetic
gain. The actual defect was narrower than the plan framed it: `baseInputStyle`, a
_text field's_ border/radius/ring, was being painted onto a native checkbox.
Removing that is the fix. A native checkbox is also simply right for a form that
submits FormData. Bonus: the plan's feared `input[type=checkbox]` selector
breakage never applied — no spec uses one.

_(2026-07-29.)_ **`label` is a plain `<label>`, and no `separator` primitive was
added.** shadcn's `label` wraps `@radix-ui/react-label`, whose only behaviour
beyond a native label is suppressing double-click text selection — not worth a
dependency, and a native element keeps the `htmlFor`/`id` association the whole
suite leans on as plain as possible. `field` and `button-group` normally pull in
`ui/separator`; since this repo deliberately does **not** adopt that primitive,
`FieldSeparator` and `ButtonGroupSeparator` use a `div` carrying
`role="separator"` — same accessibility contract, no `@radix-ui/react-separator`.

**Result:** recipe editor builds; **70 of 71** form-suite tests pass on the host.
The one failure was `paste-replace`'s visual baseline at ratio **0.03** against a
`0.02` tolerance — the intended consequence of fields no longer carrying four
different paddings. Regenerated **in the container**, where it now passes 7/7.

### PR 01d — Form architecture `portfolio/01d-form-architecture` ✅ done

- [x] `ContentFormState` → `packages/cms/forms/formState.ts`. **The generic write
      path now imports nothing from recipe** — verified by grep. Recipe's
      `controller/formState.ts` re-exports it, so no call site moved.
- [x] Promote `FormShell` (generalized to `{form, action, id}`; recipe's
      `RecipeFormShell` keeps only the instance + context and delegates the
      `<form>`), `mergeFieldErrors`, `ArrayItemControls`, `normalizeTags`, and a
      shared `fold()`.
- [x] `ArrayItemControls` **was duplicated verbatim in three files** and is now
      one component, wrapped in `ButtonGroup`. It also gained `aria-label`s:
      the buttons' entire content was `+`, `↑`, `↓`, `×`, which are not usable
      accessible names. `ListInputButton` grew `aria-label`/`className` and an
      explicit `type="button"` to support it.
- [x] Parameterize `LexicalMarkdown` on a **`MarkdownDialect`** —
      `{namespace, nodes, transformers}`, exactly the three things that were
      hard-wired. Default is `PLAIN_MARKDOWN`; recipe's five call sites pass
      `RECIPE_MARKDOWN`. `plugins.tsx` took `transformers` as a prop rather than
      importing `$exportRecipeMarkdown` directly.
- [x] **Gate:** `lexical-smoke.spec.ts` green.

_(2026-07-29.)_ The `e3d0e87d` normalized-baseline diff is **preserved exactly**:
the baseline is still seeded before `registerUpdateListener`, selection-only
updates are still skipped via `dirtyElements`/`dirtyLeaves`, and the parent still
owns the ref. Only the serializer it calls became a parameter. Likewise the
hidden `name` input remains a **direct child of `FieldWrapper`, outside the
rich/source switch** — the anchor `markdownFieldContainer` depends on.

**Not done here:** `PasteField` and `ChipsInput` (`Form/Tags` → a generic chips
input) are still recipe-local, and `durationSchema` has not moved. They are
genuinely generic and should be promoted, but neither blocks portfolio's form —
PR 06 needs `FormShell`, the Lexical dialect and `ArrayItemControls`, all of
which landed. Promote them when PR 06 actually reaches for them, so the
generalization is shaped by a second real consumer rather than guessed at.

_(2026-07-31.)_ That is what happened, and it is worth recording as evidence the
rule works. **`ChipsInput` was promoted** the moment PR B's project form needed
tags — `packages/component-library/components/Form/ChipsInput/index.tsx`, with
recipe's `Form/Tags/` consuming it. **`PasteField` and `durationSchema` still
have not moved**, because nothing outside recipe has ever reached for them: a
paste-a-recipe affordance and a `PT30M` duration parser are both recipe
concepts wearing generic clothes. They stay put until a second consumer exists.

**Verified:** recipe editor builds; `lexical-smoke` + `new-recipe` + `edit` +
`paste-review` = **57/57**.

### PR 02 — Foundation `portfolio/02-foundation` ✅ done

Both `websites/portfolio/{editor,export}/src/app/globals.css`:

- [x] Add `@import "../../../../../packages/component-library/styles/theme.css";`
      — portfolio sits at identical depth to recipe, so the line is copy-pasteable.
- [x] Fix `@source` globs to `@discontent/component-library` etc.
- [x] Move `svg { width:100%; height:100% }` into `@layer base` — **unlayered it
      beats every Tailwind `size-*` utility.** Recipe already hit this exact bug.
- [x] Delete `bg-slate-950`, `text-slate-100`, `rgb(var(--foreground-rgb))` (never
      defined), and the cyan/purple global `a {}` rule.
- [x] Port the `prefers-reduced-motion` kill-switch and `@media print` block.
- [x] `next/font` + portfolio's three pairings.
- [x] `serverExternalPackages: ["lmdb"]` in both configs.
- [x] Delete `(editor)/build/route.ts` and `deploy/route.ts`.
- [x] Collapse the three overlapping footers to one.

_(2026-07-29.)_ **Verified in the built CSS, not just by a green build.** The
emitted stylesheet now carries `--background: oklch(98% .006 85)` and its `.dark`
counterpart, `--primary`, `--header-height: 3.5rem` and `--ff-display-marginalia`
— none of which existed before, because the `@source` globs pointed at
directories that do not exist and `theme.css` was never imported. A build passing
proves nothing here; the failure mode was always silent.

Also retokened in passing, since "renders on real tokens" is the goal: the
`Homepage/*` components were written against `bg-background-light`,
`text-primary-dark` and `text-body-*`, a vocabulary that exists nowhere, and
eight editor files hardcoded `bg-slate-700`/`border-slate-700`. Both are gone.
`/deploy` (which ran `netlify` in `resolve("..", "website")`, a directory that
does not exist) and `/build` are deleted.

_Assumption:_ keep `next build --webpack`. It may be a deliberate workaround for
the Turbopack `DirAssetReference` symlink problem documented in
`packages/cms/fs/getContentDirectory.ts`, and there's an open
`fix/pi-build-oom-turbopack` branch. Flipping it is a separate, tested decision.

### PR 03 — Playwright harness `portfolio/03-playwright-harness` ✅ done

- [x] Port `playwright.config.ts` + `playwright/support/*` from recipe.
- [x] `PLAYWRIGHT_PORT` **3019 → 3029** (3011 = cms/demo, 3019 = recipe).
- [x] `dev:test`/`start:test` must use **`TEST_MODE=true`**, _not_
      `CONTENT_DIRECTORY=test-content` — `TEST_MODE` is what makes
      `getContentDirectory()`, `getSettingsDirectory()` and the invalidate-cache
      gate all agree.
- [x] Drop the git-remote fixtures (out of scope).
- [x] Remove cypress + `@testing-library/cypress` + `eslint-plugin-cypress` +
      `start-server-and-test`, the four dead `e2e-*` scripts in both apps,
      `"exclude": [… "cypress"]` in all three tsconfigs, and the README's Cypress
      section.
- [x] Add `/settings`, `/test-settings`, `/playwright-report`, `/test-results`,
      `/playwright/.auth`, `/blob-report*` to `editor/.gitignore`.

### PR 04 — AppLayout `portfolio/04-applayout` ✅ done

- [x] Portfolio's own `AppLayout`: single masthead, single footer, Appearance
      popover wired to `PORTFOLIO_PRESETS`.
- [x] `common/config/site.ts` — title/description/statement from env,
      `getSiteTheme()` **defaulting to `marginalia` rather than the engine's
      Working Bench** (whose `bench` pairing this app never registers, so falling
      back to it would drop every heading to system fonts), and `getSitePosture()`
      ready for PR 09.
- [x] Editor-only affordances are an **injected slot** (`EditorNavExtras`), not
      an import inside `common/` — `common/` is compiled by the export app too,
      and `next-auth` is editor-only.

_(2026-07-29.)_ There were **four** footers, not three: the root layout rendered
one, `(portfolio)/layout` rendered a second, the homepage sat in its own `(home)`
group and rendered a third, and `(editor)/layout` a fourth. Each looked fine in
isolation, which is why `chrome.spec` asserts **counts** —
`getByRole("banner")`/`("contentinfo")` `toHaveCount(1)` — rather than
appearance. The homepage moved into `(portfolio)` so there is one shell.

### PR 05 — Projects model `portfolio/05-projects-model` ✅ done

`@discontent/projects-collection` is consumed **only** by portfolio, so extend it
in place. Mirror `websites/recipe-website/common/controller/` exactly.

```ts
export interface Project {
  name: string;
  date: number;
  summary?: string; // indexed + shown on rows
  content: string; // long-form markdown
  image?: string;
  tags?: string[];
  role?: string;
  client?: string;
  status?: "shipped" | "wip" | "archived";
  featured?: boolean;
  links?: { label: string; url: string }[];
}
```

LMDB is a **requirement, not an optimization**: `controller/data/readIndex.ts`
currently walks the tree and reads every `project.json` in full, so
`{...projectData, slug}` would ship every project's entire markdown body to the
client. `readContentIndex` gives date ordering, pagination and a `map` projection
for free, and `buildIndexValue` keeps `content` out of the index.

**Security work that must land here:**

- [x] All three `packages/projects-collection/controller/actions/*` are
      `"use server"` with **no `auth()` check** — unauthenticated
      create/update/delete. Replace with `createGenericActions` behind
      `authenticateUser()`.
- [x] `common/components/Homepage/ContactSection/index.tsx:32` does
      `readFile(join(getContentDirectory(), "icons", icon))` on a **form-supplied
      value** and injects it via `dangerouslySetInnerHTML` — **path traversal plus
      SVG injection**. It dies with the blob in PR 12; **do not carry the pattern
      forward.**
- [x] While in `parseFormData`: `set(data, key, value)` with attacker-controlled
      FormData keys honours `__proto__.x`. **Add a key guard.**

Other bugs to fix here:

- [x] `filesystemDirectories.ts` uses an eagerly-evaluated `contentDirectory`
      const, so the override argument can never take effect.
- [x] `create.ts`/`update.ts` `redirect("/" + slug)` lands on the **pages**
      catch-all — this is why creating a project appears broken today.
- [x] `createSlug.ts` returns `name` unslugified.
- [x] Data path moves to `projects/data/<slug>/` + `projects/index/` — free now,
      since no content exists.

### PR 06 — Projects form `portfolio/06-projects-form` ✅ done

Landed in two parts: **PR B** built the form, and **PR K** added the one field
B left out. Between them the row above sat ticked while `image` was not
actually wired — the checkbox claimed a field the form could not save.

- [x] The project form on `FormShell` + TanStack: text, chips (tags), Lexical
      body, links list. _(PR B.)_
- [x] `image` — upload, storage, serving and clearing. _(PR K; see the A–M
      table for the two bugs it turned up.)_
- [x] `links` needs a **sentinel hidden input** — empty ≠ absent (see Forms rule 5).

### PR 07 — Detail pages `portfolio/07-detail-pages` ✅ done

Export parity — must gain:

- [x] rewritten `layout.tsx`
- [x] `(portfolio)/page.tsx`
- [x] `project/[slug]/page.tsx` with `generateStaticParams` and the
      ENOENT→`notFound()` guard **in both the page and `generateMetadata`**
- [x] `[...slug]/page.tsx` for pages — **currently absent entirely; `/about`
      cannot render**
- [x] `search/all/route.ts`
- [x] `not-found.tsx`

Gotchas:

- `force-dynamic` is **illegal** under `output: "export"` — parameterless route
  handlers need explicit `export const dynamic = "force-static"`.
- **Never import a server action into an export-shared component.**
- The LMDB index must exist at build time, so `exportAction` should run
  `rebuildIndex` **before** `commandAction("build")` — a stale index means a stale
  _homepage_, since the homepage **is** the index.
- Create `export/public/.gitignore` with `/image` and `/uploads`.
- `PureStaticImage` hardcodes `/uploads/recipe/${slug}/...`; add an
  `uploadsDirectory` prop defaulting to the current value. Deferred here to
  whichever PR first had a real image to point at — which turned out to be
  **PR K**, where it landed with `"uploads/recipe"` as the default so recipe's
  three call sites were untouched.

_(2026-07-29, PR 07.)_ Two environment traps found by actually running the export
build rather than trusting a green compile:

- **`export/public/image` is a dangling symlink** into
  `../../editor/content/transformed-images`. Next stats everything in `public/`,
  so the build dies with a bare `ENOENT ... public/image` that names neither the
  symlink nor its target. The directory has to exist.
- **The pages catch-all emits `out/%2F.html`** from the `[{ slug: ["/"] }]`
  placeholder that a dynamic route needs when the corpus is empty (a dynamic
  route under `output: "export"` must produce at least one param). Harmless and
  the page short-circuits, but it is why that file appears.

**Verified end to end:** the static export builds and `out/` contains all five
project pages, an index linking to every one of them, `404.html`, `search/all`,
and a stylesheet carrying the real OKLCH tokens.

### PR 08 — Settings `portfolio/08-settings`

- [ ] `(settings)` route group, theme editor, export bake.

### PR 09 — Postures `portfolio/09-postures` 🟡 mostly done

- [x] All three postures: **Index** (year rail + plate), **Studio** (plates lead
      as a grid), **Résumé** (statement → roles → skills → compact list).
- [x] `SITE_LAYOUT` → `getSitePosture()`, defaulting to `index`.
- [x] `PostureShell` owns the page frame, the count line and the filter, so all
      three make the same promise. Duplicating the control into each posture is
      exactly how two of them drift — recipe had that happen with two private
      copies of one debounce constant.
- [x] Résumé's skills and roles are **derived from the corpus**, not a second
      hand-maintained field. A skills list that can disagree with the work is
      worse than no skills list.
- [ ] **Owner-facing picker** in settings — not built; the posture is set by
      `SITE_LAYOUT` today. Belongs with PR 08's settings route group.

### PR 10a — Index search `portfolio/10a-index-search` ✅ done

Build a **~150-line in-memory provider**, not a port of recipe's 551-line
`SearchContext`. A portfolio corpus is dozens of entries — with `summary` capped
at 300 chars, ~50 projects is roughly 15 KB. Recipe's FlexSearch + IndexedDB +
react-query stack exists to avoid re-tokenizing _hundreds_ of recipes, and it
carries two documented footguns (the `SEARCH_DB_NAME` schema-version trap and the
`commit()` duplicate-id hazard).

- [x] Keep recipe's context **API shape** and its `sessionStorage` +
      `useSyncExternalStore` mechanism **verbatim** — small, correct, SSR-safe.
- [x] Replace the engine with a `useMemo` filter over the promoted `fold()` (NFD
      diacritic strip), matching `name > tags > role > summary`.
- [x] **Seed from a server-rendered prop, not a fetch.** The homepage already has
      the full array, so search works before hydration and degrades to the full
      list with JS off.
- [~] Reuse as-is: `useSearchURLSync` (uses `replaceState`, so debounced
  keystrokes don't stack history), `TagFilterRail`, `SearchTicker`,
  `SearchInput`, `RecentSearches`. **Not done, and deliberately:** those are
  recipe's `/search`-page furniture, and portfolio has no `/search` page —
  the filter lives on the index itself. Pulling in a URL-sync hook for a
  surface that never changes route would be ceremony. The sessionStorage +
  `useSyncExternalStore` mechanism _was_ kept verbatim, and it is what makes
  the filter survive navigating into a work and back (spec'd).
- [x] Document the escape hatch: past ~500 entries, swap in an in-memory
      FlexSearch `Document` — still without `IdxDB`, skipping both bugs.

### PR 10b — Palette `portfolio/10b-palette`

- [ ] ⌘K palette + `/search/all` (`force-static`).

### PR 11 — Confirm deletes `portfolio/11-confirm-deletes`

- [ ] `alert-dialog` on all 8 destructive forms, both sites.
- [ ] Confirm button named **"Delete project"** / "Delete recipe" so existing
      `{exact:true}` "Delete" queries stay unambiguous.
- [ ] **Leave `git/BranchSelector` alone.**

### PR 12 — Content `portfolio/12-content`

- [ ] Real demo content (Roger's actual projects).
- [ ] Retire `homepage.json` and the `ContactSection` icon reader with it.
- [ ] README rewrite.

### PR 13 — Baselines `portfolio/13-baselines`

- [ ] Full spec suite.
- [ ] Axe sweep across **postures × presets × light/dark** using recipe's
      `seedTheme()` + `expectMode()`. The derivation curve should make this pass
      **by construction**; a failure means someone hand-authored a token.
- [ ] Visual baselines regenerated **inside the Linux container**
      (`scripts/run-sharded-tests.sh`), not on the host.
- [ ] CI wiring.

---

## Verification

Per PR:

1. **`pnpm lint:diff`** — CI lints against `origin/main`, so a long stack
   accumulates diff surface; run **each PR**, not at the end.
2. `cd websites/portfolio/editor && pnpm e2e-dev`.
3. `pnpm build` in both apps, then `pnpm start` on the export; confirm project
   pages, `/about`, and the index render statically.
4. **PRs 01a–01d and 11 only:** run the **recipe** suite
   (`cd websites/recipe-website/editor && pnpm e2e-dev`) — these are the PRs that
   can regress it. For 01d specifically, `lexical-smoke.spec.ts` is the regression
   gate for the WYSIWYG-persistence fix.

End-to-end at PR 13:

- Axe sweep across postures × presets × light/dark.
- Visual baselines regenerated inside the Linux container.
- **Keyboard-only pass over the index:** tab a row, confirm the plate updates and
  focus is visible; `⌘K` opens, `Esc` closes.
- `prefers-reduced-motion: reduce` disables the plate cross-fade.
- **JS disabled** — the index still renders the full list server-side.
- **Forms:** submit with a deliberate validation error and confirm errors render
  _and_ previously-typed values survive the remount.

## Known gotchas

- **Regenerate Playwright fixtures after any `buildIndexValue` change**, so the
  committed LMDB carries the new fields.
- `--update-snapshots` **won't** rewrite a sub-tolerance diff
  (`maxDiffPixelRatio: 0.02`); **delete the baseline file instead.**
- **`rm -rf .next` after a `globals.css` edit** — the dev server serves stale CSS.
- `next/font/google` fetches at build time; in a network-restricted container
  fonts fall back and **every baseline drifts**. Verify before PR 13.
- Portfolio's `dev`/`start` default to ports **3000/3001 — same as recipe's**.
- Worktrees under `.claude/worktrees/` hold full copies of the tree and
  **double every grep hit**. Exclude them when searching. (`vitest.config.js`
  already excludes `.claude/**` for the same reason.)
- **A stale `.next` hangs Turbopack indefinitely**, and it looks exactly like a
  regression. Six unrelated tests failed on 10s timeouts while the dev log sat
  on `Compiling /uploads/[filename] …` and never finished — confirmed still
  stuck at 180s. They **kept failing when re-run in isolation**, which is
  normally the signal that a failure is real; isolation does not clear the
  cache, so it cannot rule this out. `rm -rf .next` fixed it. Do this before
  believing any sudden cluster of timeouts.
- **`import.meta.dirname` is `undefined` under `tsx`** (it transpiles to CJS) —
  use `__dirname`. The failure is a bare `paths[0] must be a string` from
  `node:path` that names nothing useful.
- **Container-written baselines come back root-owned.** Normalize before
  committing: `cp "$f" "$f.tmp" && mv -f "$f.tmp" "$f"`.
- **The container runner needs `AUTH_SECRET` injected at `docker run` time.**
  `.dockerignore` (correctly) keeps `.env.local` out of the image, so without it
  every authenticated test fails on `MissingSecret`.
- **Host visual runs are approximate; the container is authoritative.** A
  host-run baseline lands within a few percent of the container's, which is why a
  genuine regression and a host/container rendering difference look alike. Always
  regenerate in the container.

## Critical files

| Path                                                                                           | Why                              |
| ---------------------------------------------------------------------------------------------- | -------------------------------- |
| `packages/component-library/theming/{fonts,derive,parse,presets}.ts`                           | PR 01a                           |
| `packages/component-library/components/Form/index.tsx` + `inputs/*`                            | PR 01c                           |
| `websites/recipe-website/common/components/Form/{RecipeFormShell,formContext,fieldErrors}.tsx` | PR 01d source                    |
| `websites/recipe-website/editor/controller/actions/{genericActions,editorContentConfig}.ts`    | The write path portfolio adopts  |
| `packages/component-library/components/Form/inputs/LexicalMarkdown/*`                          | Recipe-name leak to parameterize |
| `packages/projects-collection/controller/**`                                                   | PR 05 rewrite                    |
| `websites/portfolio/{editor,export}/src/app/globals.css`                                       | PR 02                            |
| `websites/recipe-website/docs/ui-overhaul.md`                                                  | Format this file mirrors         |

---

## Findings the harness paid for immediately

_(2026-07-29, PR 03.)_ `smoke.spec.ts` asserts that the design system is
**computed**, not merely built, and it caught a real bug on its first run:
`--ff-display` resolved to `ui-sans-serif, system-ui, sans-serif`.

`theme.css` binds the font roles to the `bench` pairing — **recipe's** — and PR
01a's fallback chain then did exactly what it was designed to do, degrading a key
this app never registers to system fonts. So portfolio built cleanly, rendered a
perfectly reasonable page, and used the wrong typeface. `globals.css` now
declares portfolio's own default binding to `marginalia`.

The lesson generalizes: **a green build proves nothing about whether the design
system applied.** Both of this repo's inert-styling bugs — the missing
`theme.css` import and the stale `@source` globs — are invisible to the compiler
and to a screenshot taken before there is a baseline. Assert on computed style.

---

## Security follow-up — closed by PR A

_(2026-07-29, written while it was still open; **closed 2026-07-30**. Left in
place because the shape of the fix is the reusable part — but read the
resolution first: an agent exploring this repo read the old wording and
reported a live vulnerability that no longer exists.)_

**What was wrong.** `packages/{pages,menus}-collection/controller/actions/{create,update,delete}.ts`
were `"use server"` with no `auth()` check, exactly as projects' were. A server
action is a POST endpoint, so `deletePage(slug)` — an unguarded recursive `rm`
on an unsanitized slug — was reachable by anyone who could reach the app. It was
live on the **recipe** site too, which is why it was deliberately left out of
PR 05 rather than half-fixed inside a model refactor.

**How it was closed.** PR A, the first of the A–G stack. Two mechanisms, and the
first is the one that matters:

- `createGenericActions` and `EditorContentConfig` live in `@discontent/cms`,
  and `authenticate` is a **required, non-optional** field on that config
  (`packages/cms/content/editorContentConfig.ts:65`). Every write path in
  `genericActions.ts` calls it. A content type converted to the factory
  therefore _cannot_ ship without a check — the type system refuses. Pages went
  this way: `pages-collection/controller/actions/` no longer exists at all, and
  its replacement is `pageContentConfig.ts`.
- Menus kept two hand-written actions (`update.ts`, `delete.ts`) because their
  shape doesn't fit the factory. Both take `authenticate` as a **required
  injected parameter** rather than importing one, because auth is per-app.

Traversal was proven exploitable before the fix and is now pinned by
`path-traversal.spec` plus the unit tests in `test/projectSecurity.test.ts` and
`test/resolveWithin.test.ts` — which nothing in CI ran until PR L added a vitest
job.

---

## Follow-up stack: PRs A–M (2026-07-29 → 2026-07-31)

The numbered roadmap's "not started" list is done. Security went first, as
decided. A–G closed the roadmap; H–M are the second round, which came out of
actually measuring the result rather than planning it.

| PR                              | Status | Verification                                                                             |
| ------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| **A** collection security       | ✅     | recipe 353 passed; traversal proven exploitable pre-fix, pinned by `path-traversal.spec` |
| **B** projects form             | ✅     | portfolio `projects.spec` 5/5; two real bugs found by the tests                          |
| **C** settings + export bake    | ✅     | static `out/` verified: posture, title, statement and theme all baked                    |
| **D** confirm deletes           | ✅     | 8 destructive actions gated; a cancel test proves the guard                              |
| **E** ⌘K palette                | ✅     | portfolio `command-palette.spec` 7/7                                                     |
| **F** baselines, axe, CI parity | ✅     | portfolio **82/82** and recipe **366/366** _in the container_                            |
| **G** retire `homepage.json`    | ✅     | the blob, its components and its editor route are deleted                                |
| **H** palette off the hot path  | ✅     | `about.html` and every project page **−3,632 B (−13.9%)**; the index keeps the corpus    |
| **I** a fresh clone builds      | ✅     | symlink untracked, empty-`generateStaticParams` guard, a real `seed` script              |
| **J** the case study renders    | ✅     | summary / role / client / status / tags / links shown; `featured` gained a renderer      |
| **K** project images end to end | ✅     | portfolio 83 passed / 1 known flaky; recipe 364 passed / 2 flaky; route probed directly  |
| **L** CI with teeth             | ✅     | vitest (96), `tsc --noEmit` on both editors, and `packages/cms/demo` (71) now run in CI  |
| **M** make the record true      | ✅     | this section; then the duplicate-code and dead-code cleanups below                       |

**Postures and content are no longer 🟡.** The posture picker landed in PR C
(`SITE_LAYOUT` was read-only, so the three postures were a developer feature);
`homepage.json` is retired in PR G.

### PR K — what the plan did not predict, again

Two bugs, neither of which the image plan anticipated:

1. **`Form/index.tsx` dropped `defaultImage`.** A wrapper that forwarded every
   other prop silently omitted this one, so a stored image never reached the
   edit form. Found by a failing test.
2. **The update path destroyed stored images.** `actions/projects.ts` didn't
   carry `image` through an update, so saving _any_ field erased the cover. It
   was unobservable until PR K, because nothing could store an image to lose.

Residual and **not fixed**: `projects.spec.ts` ("removing every link…") needs a
`page.reload()` before its final assertion. The record on disk is correct the
moment the action returns — verified directly; what is stale is the _render_ of
the edit page on the way back. It reproduces only when the run is fast, and
reproduces identically on the commit _before_ PR K, so it is pre-existing.
`force-dynamic` on the edit page and revalidating `/projects` as a `layout` each
fix the isolated case and neither fixes the full-file run. Both were kept
because they are correct on their own terms; the source is still unpinned.

### PR L — what CI was actually checking

Before PR L, CI ran lint-staged and Playwright. That left three gaps:

- **The 96-test vitest suite ran nowhere.** It holds
  `test/projectSecurity.test.ts` and `test/resolveWithin.test.ts` — the tests
  the whole path-traversal argument rests on. It costs under two seconds.
- **Nothing typechecked.** Worse, `websites/recipe-website/editor/tsconfig.json`
  had an `include` of `next-env.d.ts` plus the two generated `.next` type globs
  and **neither source glob** — no `"**/*.ts"`, no `"**/*.tsx"` — so a `tsc` run
  there checked essentially nothing. Restored, it covers 353 files. Both are clean
  from a cold `tsc --noEmit`, so there was no backlog to pay down — but there
  was also nothing stopping one from accumulating.
- **`packages/cms/demo` ran nowhere.** Five specs, 71 tests, the only place the
  CMS core is exercised without a site's opinions layered on it. Its manifest
  was also missing from `Dockerfile.playwright`'s COPY block, and its
  `@playwright/test` had drifted back to `^1.50.0` after PR F reconciled the
  repo on `^1.59.1`.

`docker-compose.test.yml`'s `portfolio` service also stopped borrowing
`shard-1`'s build. Borrowing it meant `run --rm portfolio` silently required a
prior `build shard-1` _and_ — since `docker compose run` starts dependencies —
launched recipe's first shard alongside portfolio's suite.

### What the plan did not predict

Four things only running the suites could reveal, each now covered by a test:

1. **`%2F` reaches `params` decoded.** The uploads traversal was not theoretical:
   pre-fix, `/uploads/..%2Fsecret.txt` returned an out-of-tree file with a 200.
2. **`git.spec` has two "Delete" clicks and only one is BranchSelector's.** Line
   337 deletes a _recipe_; treating both as the branch button broke that test.
3. **Optional fields that could not be omitted.** A `<select>`'s "none" option
   submits `""`, and `z.enum([...]).optional()` accepts `undefined`, not `""` —
   so a project could not be saved without choosing a status.
4. **Two tests that only passed because of the developer's git config.**
   `init.defaultBranch` decides what `test-git.bundle` checks out (it holds only
   `refs/heads/main`), and `sync.ts`'s bare `git pull` consulted the user's
   `pull.rebase` — so the merge its conflict UI is built around never happened in
   a container. The first is a CI-config fix; the second was a **product** bug.

### PR M — make the record true, then tidy

Docs first, because a wrong doc is worse than a missing one. **An explore agent
read the old "Security follow-up — NOT fixed by PR 05" section and reported a
live vulnerability** that PR A had closed months of commits earlier. That is the
cost of a stale doc: it does not just fail to help, it actively misleads. Also
reconciled: three status tables that disagreed with each other, a PR 06 row
ticking an `image` field the form could not save, a promotions table showing
`PasteField` and `durationSchema` as promoted when both are still recipe-local,
a "writing/blog: designed for" claim with no discriminator or second collection
behind it, and recipe's `ui-overhaul.md` table stopping at PR 15 while 16–21a
had shipped.

Then the code:

- **`ContactLink` was declared twice, byte-identical**, in
  `common/config/site.ts` and `editor/src/settings/index.ts` — which already
  imported `Posture` from that module on the same line. Now re-exported.
  `ProjectLink` in `projects-collection` is a third `{label, url}` and stays
  separate on purpose: merging it would make a reusable content type depend on
  portfolio.
- **`Settings` shared two fields and declared them twice.** The _store_ had
  already been promoted to `@discontent/cms/settings`, so what was left was the
  shape: both sites declared `theme?: Theme` and `presets?: NamedPreset[]` with
  near-identical comments. They now come from `ThemedSettings` in
  `component-library/theming` — which is where it has to live, since cms cannot
  name `Theme` without a cycle. Portfolio's `readSettings` (React-`cache`d) /
  `readSettingsFresh` (uncached, for server actions) split is untouched: an
  action shares a request scope with the re-render Next runs after it, so a
  cached read taken before a write would feed that render the pre-write value.
- **The editor's `/about` rendered chrome-less.** The public pages catch-all sat
  under `(editor)`, whose layout is a bare `ThemeShell` — correct for settings
  and edit forms, wrong for a reader-facing page the export renders fully framed
  by `AppLayout`. Moved to `(portfolio)/[...slug]`, mirroring the export. Route
  groups don't affect the URL, so nothing about routing changed.
- **Dead code.** Four copies of `InfoCard` — three byte-identical and unused in
  menus-, pages- and projects-collection, plus recipe's, whose callers PR 11's
  `MetaBar` replaced. `postures.tsx`'s trailing `export type
{ ProjectIndexEntry }`, which nothing imported (everything goes to
  `readIndex` directly). Portfolio's `closePalette`, exposed on the context and
  never called — **recipe's is used**, by `PaletteAuthItem`, and stays. And an
  `extraNavItems` comment promising a "New Project" affordance the masthead has
  never had.

### Container parity

`websites/portfolio` is no longer `.dockerignore`d, the image carries its three
manifests, and `SITE_DIR` picks which site's suite to run. All four Playwright
pins — the image, the GitHub Actions container, and both sites' devDependencies —
are reconciled on **1.59.1**; they had been split across 1.50.0 and 1.59.1.

Baselines are generated in the container via `scripts/run-portfolio-tests.sh`.
Recipe's ten stale ones — invalidated by 01c/01d's form primitives, not by this
stack — were regenerated there too.

Also removed: a dead `cypress` devDependency in `recipe-website/export` with no
cypress directory anywhere, which every install and image build was paying for.
