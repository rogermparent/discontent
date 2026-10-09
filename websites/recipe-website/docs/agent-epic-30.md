# Epic 30 — Engine hygiene, accent contrast, group thumbnails, content round

> **This is the durable source of truth for the epic-30 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the picture by
> reading this file. **Read this file first** before touching the cms
> readers (`packages/cms/pagination/*`, `content/readContentIndex.ts`,
> `aggregates/readAggregate.ts`), the accent derivation
> (`packages/component-library/theming/derive.ts`), the group search corpus
> (`controller/data/readGroupSearchCorpus.ts`) or the group thumbnail walk.
> Update the roadmap **Status** column and the **Now** line at every phase
> boundary.
> Earlier epics are cited by number with a prefix (`29-D2`, `24-T5`).
> `packages/cms/docs/incremental-regeneration.md` is the engine's own record of
> how derived state is invalidated.

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** 30-plan merged (#184). 30a is in review (`agent/30a-hygiene`). 30d's content
writes are done, with 13 content commits, none pushed. Next: 30b.

## Context

Epic 29 closed at 29a on 2026-10-09: the Pi's reindex dropped from 13.5 s to
2.5 s, and incremental reindex (29b–29d) is deferred. Of the four open areas,
Roger picked three for epic 30 (git-annex activation is out):

- **Engine hygiene**, led by F30 — the one row of
  `incremental-regeneration.md` §11 that is a bug.
- **UI**: the light accent misses WCAG AA in the cyan/teal band, and group
  thumbnails are missing on ⌘K and `/search`.
- **Content**: the three recipes the 27d migration skipped, four missing
  drinks, a syrup-pairing chart, and one spaced retry of The Kitchn.

## Decisions

### D1 — Group thumbnails come from a corpus projection, not F32

The search corpus (`getGroupSearchCorpus`) resolves a fallback thumbnail per
group with the same candidate walk the server-rendered `GroupThumbnail` uses.
F32 (array references, so the _index_ can borrow member images and follow
renames) is recorded below as the follow-up. Decided with Roger.

### D2 — The accent darkens only inside the failing band

Light `--primary` lightness is `0.53` everywhere except a raised-cosine dip
centred on the worst hue. Every hue outside the band keeps its current value,
so the default (hue 50), the static `styles/theme.css` tokens and every
recipe-site visual baseline are unchanged. Decided with Roger.

### D3 — key-lime-pie cites brianlagerstrom.com

`https://www.brianlagerstrom.com/recipes/key-lime-pie`, named "Brian
Lagerstrom". Decided with Roger.

### D4 — Readers never create the indexes they read (F30)

Every cms reader checks `environmentExists(path)` (a sync
`existsSync(join(path, "data.mdb"))`) before opening an LMDB environment.
Missing means the reader's existing empty answer, and nothing on disk. The
export, which would otherwise build an empty site and pass, fails loudly
instead when content exists but its index doesn't.

### D5 — Be polite when scraping

Roger's rule for 30d, and for any session that fetches from recipe sites:

- requests to one site are **sequential and at least 15 s apart**, sitemaps
  included;
- at most **one retry after a 403**, then that site is dropped for the
  session;
- **no parallel fetching** against a single host;
- **image downloads count** as requests.

### D6 — 30d writes with `--content-dir` from the worktree

A worktree's MCP server points at the worktree, which has no content
(`23-T11`). The content round therefore uses the CLI from the worktree root,
`pnpm --silent recipes <cmd> --content-dir /home/roger/Projects/recipe-content
--json` — the 25e/25f precedent — departing from the skill's "never
`--content-dir`". Every write is one commit; pushing is Roger's.

## Roadmap

| Phase   | Scope                                                                                             | Branch               | Status     |
| ------- | ------------------------------------------------------------------------------------------------- | -------------------- | ---------- |
| 30-plan | This doc, CLAUDE.md entry                                                                         | `agent/30-plan`      | ✅ #184    |
| 30a     | F30 reader guard, export fail-loud, aggregate spec guard, `group:` in `recipe_search`, stale docs | `agent/30a-hygiene`  | 🟡         |
| 30b     | Accent contrast, band only                                                                        | `agent/30b-contrast` | 📝         |
| 30c     | Group thumbnails from the corpus (⌘K, `/search`)                                                  | `agent/30c-thumbs`   | 📝         |
| 30d     | Content round on the real content repo (no code PR)                                               | — (+ docs PR)        | ✅ content |

**Order.** 30-plan → 30a → 30b → 30c, each a PR off `origin/main`, merged on
green CI under the standing grant. 30d is independent of the code and can run
while the code PRs sit in CI. 30c touches `CommandPalette`, which has visual
baselines, so it goes after 30b to avoid regenerating them twice.

## Phase detail

### 30a — Engine hygiene

**F30: readers must not create the indexes they read.** `readAllIds`
(`packages/cms/pagination/readAllIds.ts`) calls `getPaginationDatabase` →
`openCachedEnvironment` → lmdb `open`, which creates the directory and
returns `[]`. A standalone `next build` of the export with no indexes
therefore emits no content pages and passes. The same unguarded open is in
`readPaginationMeta.ts`, `readPage.ts` (4 sites), `readContentIndex.ts` and
`aggregates/readAggregate.ts`.

- `environmentExists(path)` in `packages/cms/lmdb/environmentCache.ts`.
- Each reader checks it first and returns its existing empty answer (`[]`,
  `EMPTY_META`, `null`, an empty range) without creating anything — the guard
  F30 proposed, on every read path, following `updateDependents.ts`.
- The export's `generateStaticParams` for recipes, featured and groups uses
  one helper that throws "content has N items but no index — run
  `pnpm recipes reindex`" when the data directory has entries and the index
  environment doesn't exist.
- Tests in `test/pagination.test.ts` ("cheap enumerations"): one reader of
  each kind returns empty **and** leaves no directory behind.

**Read-side spec guard in `readAggregate`** (`24-T5`): return `null` when
`record.specHash !== computeAggregateSpecHash(aggregateConfig)`, so a stale
record reads as never folded rather than as a wrong value. Test: write a
record, bump the config's `version`, read `null`.

**`group:` in `recipe_search`** (epic-27 Deferred): `curation/search.ts`
builds rows with no `groups`, so `group:x` matches nothing and `-group:x`
matches everything. Decorate rows from `getGroupSearchCorpus` with the
browser's rule (`SearchContext.tsx`: each group's slug and name per member
recipe), only when the parsed query has a `group` filter. Add `group:` to the
`recipe_search` description in `editor/mcp/registry.ts`. Test in
`test/curation.test.ts`: `group:<slug>`, `group:"<name>"`, `-group:`.

**Stale docs:** `backlog.md` (push exists; `content-engine-test` row
obsolete), `agent-epic-28.md` follow-ups (incremental → epic 29, batched
rebuild → 29a, systemd → 28i, `next` pins → 28h), `agent-mixology.md`
deferred items done in 27c, the 27c heading in `agent-epic-27.md`,
`deploy-pi.md` "Faster rebuilds … Batching" (29a), and F30 marked fixed in
`incremental-regeneration.md` §11.4.

**Gate:**

- the new reader tests (no directory created) and the spec-guard test;
- a standalone `next build` of the export against a scratch clone with **no**
  indexes fails with the reindex message, and succeeds after
  `recipes reindex`;
- `recipes search 'group:<real group>' --json` against a scratch clone returns
  its members;
- Playwright `git.spec` and the search specs; CI green.

#### 30a results (2026-10-09)

- **Unit.** Both typechecks are clean. vitest: the new reader test (seven
  readers, no directory left behind), the aggregate twin, the spec-guard
  test, `group:` in `searchRecipes`, and the export fail-loud cases.
  - Two existing tests pinned the old behaviour and changed with it:
    `taxonomies.test.ts` "goes back to null when the stored spec version
    moves" now expects `null`, as its title always said; its `readTree`
    helper reads with the real `termTreeAggregate()` instead of a bare
    `{name}`.
  - The D8 boundary allows `data/readGroupSearchCorpus`, which is CLI-safe
    by construction.
- **Spec hashes on disk.** Every aggregate in the 16 Playwright fixtures (38)
  and in the real repo (7) matches its current spec, so the read-side guard
  blanks nothing.
- **Export, no indexes** (a fresh clone of the real repo):
  - `next build` fails at "Collecting page data" with "recipes: content has 645
    items but no index — run `pnpm recipes reindex`" (featured: 20).
  - `recipes/` still holds only `data/` afterwards.
- **Export, after `recipes reindex`:** 943 pages generated in 29.8 s
  (warm cache).
  - On the way, it found a regression from 2459a0fc (2026-10-07, the CRLF
    fix): 38 real recipes carry ingredient-style `{type: "heading", name}`
    entries in `instructions`.
  - `Markdown` and `flattenMarkdown` (JSON-LD) now called `.replace` on their
    undefined `text`, so those pages 500 in the editor and fail the export.
    origin/main failed identically.
  - Fixed here: both pass missing text through, which renders nothing, as
    before.
- **`group:`** on the scratch clone, with two groups made there:
  - `group:gate-sours` → 2;
  - `group:"gate sours"` → 2;
  - `group:gate-parent` (the sub-group plus one recipe) → 3;
  - `tag:drink -group:gate-sours` → 193 of 195.
- **Playwright, partial.** The run was stopped at 48/104 at Roger's request
  (machine load ~27 on 8 cores from other jobs).
  - 40 passed.
  - 2 `search-live` failures came from stopping the server.
  - 6 were 5–10 s UI timeouts with no server error: 5 in `git.spec` (each
    creates a recipe and waits for its page) and one typing timeout in
    `search-autocomplete`.
  - One more was a sign-in timeout on the first test during the cold compile.
  - None of these is confirmed or ruled out locally; CI is the rerun.

### 30b — Accent contrast, band only

`deriveAccent` uses a fixed light `--primary` of `oklch(0.53 0.16 h)` on
`--primary-foreground` `oklch(0.99 0.01 85)`: about 4.31:1 at h≈190. The
recipe-site presets (50/150/250/265) are outside the band, but **portfolio's
"oxide" preset (hue 195) is inside it**, so this is a real failure on a
shipped preset.

- `contrastRatio(fg, bg)` in `packages/component-library/theming/contrast.ts`
  (OKLCH → linear sRGB → WCAG relative luminance). Nothing in the repo
  computed contrast before; axe was the only check.
- Light primary lightness `L(h) = 0.53 − d · bump(h)`, `bump` a raised cosine
  centred on the worst hue and zero outside the failing band; centre,
  half-width and `d` chosen with `contrastRatio` so every hue reaches
  ≥ 4.6:1. `--sidebar-primary` follows.
- `--ring` checked against the background at 3:1; left alone unless it fails.
- Tests in `test/theming.test.ts` for every integer hue 0–359: light and dark
  primary on primary-foreground ≥ 4.5, accent-foreground on accent (both
  modes) ≥ 4.5, and `deriveAccent(50)` byte-identical to before.
- A hue-190 custom theme in `CUSTOM_THEMES`
  (`editor/playwright/tests/accessibility.spec.ts`); portfolio's
  `accessibility.spec.ts` already sweeps oxide.

**Gate:** the all-hues test; default output unchanged; recipe visual
baselines untouched; axe passes at hue 190 (recipe and portfolio
`accessibility.spec`); CI green. Closes `ui-overhaul.md`'s PR 7 note and
`backlog.md`'s contrast row.

### 30c — Group thumbnails from the corpus

What lacks a member-photo fallback today: the client-rendered `/search` group
cards (`SearchForm/GroupResults.tsx`) and ⌘K group rows
(`CommandPalette/index.tsx`, a `Layers` icon). Recipe rows already show
photos.

- Extract the candidate walk from `common/components/GroupThumbnail`
  (`MEMBERS_WALKED = 6`, `GROUPS_DEEP = 4`, depth-first, recipes deduped,
  groups visited once) into a pure helper taking `readGroup(slug)`, so the
  server component and the corpus share one walk.
- `GroupSearchEntry` gains `thumbnail?: { uploadsDirectory: "uploads/recipe"
| "uploads/group"; slug; image }`, set only when the group has no `image`,
  resolved by walking candidates and reading recipe data files until one has
  an image. A sub-group with its own image counts. At most 6 small reads per
  group.
- `GroupResults` draws `image`, else `thumbnail`, else the placeholder. ⌘K
  group rows render `PureStaticImage` from `image` or `thumbnail`, else
  `Layers` — **with no `onError` element swap** (that swap broke cmdk's
  Enter-opens-the-top-row in 28i, `28` doc "28i"). Group rows stay below
  recipe rows.

**Gate:** corpus unit tests (own image wins; first member with a photo; a
sub-group's image; no photo → no field; the 6-candidate cap);
`command-palette.spec` including Enter-opens-the-top-row; the `/search`
groups spec; a dev-editor screenshot of a member photo on a group without its
own image; CI green.

#### F32 — array references (follow-up, not in this epic)

What would let the _index_ borrow member images and follow renames: array
paths in `ReferenceDeclaration`, includes-matching in
`findViaIndex`/`findViaDataFiles`, per-element rename writes, and a
`recipeContentConfig.referencedBy` edge to groups. Until then the corpus
projection (D1) covers the two client-rendered surfaces.

### 30d — Content round (real content repo)

All writes per D6, following the recipe-curator checklist and conventions
(`25-D12`: generic-first ingredients, `drink` spec, style tags, oz with ASCII
fractions, `{"text": …}` steps inside groups), a `--dry-run` before each
create, one commit per write, no push. Fetching follows D5.

1. **The three skipped recipes** — one `recipe_update` each, setting `source`
   and stripping the legacy `*Imported from …*` line and the following `---`:

   | Recipe                             | `source`                                                                                      | Other changes                      |
   | ---------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------- |
   | blueberry-cheesecake-baked-oatmeal | Tablespoon page, "Tablespoon"                                                                 | `video` = the YouTube URL          |
   | key-lime-pie                       | `https://www.brianlagerstrom.com/recipes/key-lime-pie`, "Brian Lagerstrom"                    | `description: null`; `video` stays |
   | salted-caramel-apple-pie-bars      | `https://sallysbakingaddiction.com/salted-caramel-apple-pie-bars`, "Sally's Baking Addiction" | —                                  |

2. **Four drinks:** Sake Cosmo, Sake Bloody Mary, Red Snapper (gin), a
   zero-proof Ginger Mule. Sitemaps of acouplecooks, Imbibe and Love and
   Lemons first, then a web search; at most one source per drink; skip and
   record rather than write a recipe from nothing.
3. **Syrup-pairing chart:** a markdown table of `tag:syrup` recipes × the
   drinks whose ingredients name them, in the `syrup` tag term's description
   (created with the term seat if missing); a page if term descriptions don't
   render tables.
4. **One Kitchn retry:** a single `inspect`. 403 → stop and record the date.
   200 → import the still-missing picks 60 s apart (kalimotxo, Hibiscus Earl
   Grey iced tea, iced green tea, tea hot toddy, NA sangria, mint julep
   mocktail), watching `25-T9` (image URL fixes).

**Gate:** `recipe get` on each write; one content commit per write;
`tag:drink` count up by the drinks created; the editor renders the new
recipes and the syrup term page. A docs PR afterwards updates
`agent-mixology.md` Deferred, `agent-epic-27.md` Hand-off and this doc.

#### 30d results (2026-10-09)

`~/Projects/recipe-content` went from `0cf3d95` to `4648a11`: 13 writes, one
commit each, every write dry-run first and checked with `show`. Not pushed.
`tag:drink` went from 194 to 203.

- **Skipped-migration recipes:**
  - `blueberry-cheesecake-baked-oatmeal` (`b1a52be`): Tablespoon, plus
    `videoUrl`.
  - `key-lime-pie` (`2321684`): Brian Lagerstrom; description `null`.
  - `salted-caramel-apple-pie-bars` (`3ca40d1`): Sally's Baking Addiction.
  - The patch field is `videoUrl`; `video` is rejected.
- **Drinks** (none skipped):
  - `red-snapper-acouplecooks` (`b1f996a`);
  - `sake-bloody-mary-imbibe` (`eb511c6`), Imbibe's "Bloody Samurai";
  - `sake-cosmopolitan-thedrinkkings` (`bddc137`), from a web search, since
    none of the three preferred sites has one;
  - `virgin-moscow-mule-texanerin` (`4579532`), from a web search, since none
    of them has a non-alcoholic mule.
- **The Kitchn is back.** A single `inspect` at 13:32 answered 200. Five picks
  were imported 65 s or more apart, with the T9 image fix:
  - `hibiscus-earl-grey-iced-tea-thekitchn` (`9b07163`);
  - `iced-green-tea-thekitchn` (`fc55bf4`);
  - `tea-hot-toddy-thekitchn` (`b245707`);
  - `non-alcoholic-sangria-thekitchn` (`e7e3aea`);
  - `mint-julep-mocktail-thekitchn` (`649886d`).
  - Kalimotxo was skipped: The Kitchn's page is an article with no recipe
    data, and `kalimotxo-acouplecooks` exists.
- **Syrup chart:**
  - Written as the `syrup` tag term (`4648a11`, label "Syrups"), through
    `createContent` with `tagTermContentConfig`, which writes the record and
    the tree aggregate and commits. No CLI or MCP writes term records yet
    (24e).
  - **List form, not a table.** markdown-to-jsx does emit a `<table>`, but
    `.markdown-body` has no table styles and Tailwind preflight strips
    borders and padding.
  - The chart covers simple syrup (56 drinks), honey (8) and lavender (2). A
    closing line names the syrups drinks use with no recipe yet (maple 21,
    elderflower 5, …).
- **Open for Roger:**
  - `Sake-Cosmo-9.jpg` is 9.7 MB (3695×4873), the largest image in the repo.
  - Pushing the content repo.
  - The workstation service has been inactive since 10-08, so the editor
    render check is still to do.

## Verification (every code PR)

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
pnpm exec vitest run
pnpm --filter recipe-editor e2e-dev -- <spec>   # under setsid nohup in bg jobs
```

The worktree needs `editor/.env.local` and `export/next-env.d.ts` copied from
the main checkout, and `editor/.next` removed before the first Playwright run.

## Risks and traps known up front

- **T1 — lmdb `open` creates.** Any new read path must check
  `environmentExists` before `openCachedEnvironment`; the cache would
  otherwise hold an environment for a directory the reader just made.
- **T2 — cmdk and element swaps.** Swapping a row's child on image error
  re-registers the item and breaks Enter-opens-the-top-row (28i). Render the
  image or the icon up front, never swap.
- **T3 — Content writes go to the real repo.** 30d is the only phase that
  touches `~/Projects/recipe-content`; tests and scripts never point there.

Found on the way:

- **T4 — Next's data cache outlives a build.** An export built once against
  an unindexed directory cached empty aggregate reads in `.next/cache`. A
  rebuild after reindexing reused them: 740 pages instead of 943, with no
  tag pages. `rm -rf export/.next` between such builds. A cold image cache
  also times out the image-heavy pages (60 s); the second run passes.
- **T5 — the importer's 403 retry doubles a request.** On a 403, `inspect`
  retries at once with browser headers, which is two requests to one host
  within a second, against D5. 30d fetched such pages once with `curl` and
  the importer's headers, and inspected the local copy.
- **T6 — instruction headings.** 38 recipes put `{type: "heading"}` in
  `instructions`, a shape only `Ingredient` declares. Renderers must tolerate
  a step with no `text`. Converting them to instruction groups is a content
  follow-up.
- **T7 — the dry-run image check reports no size.** A 9.7 MB photo went in
  unnoticed (30d).
