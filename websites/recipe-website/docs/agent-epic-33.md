# Epic 33 — Food vocabulary (32k + the 24f backfill)

> **This is the durable source of truth for epic 33.** Read it before adding
> food terms, re-tagging food recipes, or touching the drink `spirit` /
> drink-name records. It is a content epic: no engine or site code changed.
> Earlier epics are cited by number with a prefix (`32-D8`, `24-D7`).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · 📝 proposed.

**Now:** epic 33 is **closed** (2026-10-13). The vocabulary is on the real
content repo (`6532d71..5d396de`, 160 commits), the workstation synced it to the Pi, and this PR
records it.

## Context

Epic 32 closed on 2026-10-10 with the type-agnostic Make page (32j) and
hierarchy-aware search (24d) in place, but food had nothing to drill into:

- 444 of the 457 non-drink recipes carried **no tags**;
- the only hierarchy was `drink` (with its style children);
- food's best tags were `vegetarian`, `quick` and `american`, with 6 each.

Roger's calls (2026-10-13): food vocabulary first; four facet roots with
children; **proposal, then apply** (nothing on the real repo until he approved
a review page); work in one agent, subagents only with a compelling reason.
He approved the proposal unchanged and asked for the optional drink tidy too.

## Decisions

### D1 — Four facet roots; recipes carry children only

`course` (Course), `main-ingredient` (Main ingredient), `cuisine` (Cuisine),
`effort` (Speed & effort). Every food recipe gets one or two `course`
children and any number of the others. No recipe carries a root tag: the root
pages and `tag:<root>` collect recipes through the hierarchy (24d). A child
needed at least three recipes to exist; all 43 cleared it (the smallest is
`vietnamese`, 3).

### D2 — Quick vs easy (settles 24f's open question)

Both exist, with distinct definitions written into the term descriptions:

- **`quick`** — total time **≤ 30 minutes**. Uses `totalTime` when it is
  above 0, else prep + cook, else judged from the method (no rising,
  marinating, long simmering or long baking). A stated time that leaves out
  chilling or rising does not count (kefir panna cotta, sourdough pretzels).
- **`easy`** — few ingredients and simple technique, **regardless of time**
  (slow-cooker dumps, sheet-pan dinners, no-knead loaves).
- **`project`** — added: several stages, a long rise or overnight rest,
  lamination, smoking or deep frying.

### D3 — `vegetarian` is a child of `main-ingredient`

It answers the same question as `chicken` or `beef` (what is in the middle of
the plate), so it sits beside them, not under a fifth `diet` root or a
one-child `diet` level. It goes on **savory** dishes only (mains, sides,
salads, soups, sandwiches, snacks); on sweets, breads and sauces it is nearly
always true and would bury the useful hits. Dishes made with chicken stock
(tomato soup, fondant potatoes) are not tagged vegetarian.

### D4 — Seven recipes get no course

The five drink syrups (the existing `syrup` root covers them), `kefir` (a
cultured-milk staple, not a dish), and `non-alcoholic-pina-colada`, a
zero-proof drink that had missed its `drink` tag; the drink tidy (D6) gave it
`drink` + `zero-proof`. So `tag:course` = 457 − 7 = **450**.

### D5 — Pre-existing tags are kept, never removed

`term assign` only adds. Recipes that already carried a child tag keep it,
and the assignment files were made to agree with them (three generic apple
salads keep their older `american`). The validator rejects an assignment that
omits a tag the recipe already carries, so the counts on the review page match
what the repo ends up with.

### D6 — Drink tidy: records only, no re-tagging

- A **`spirit`** root ("Spirit & base") over `vodka`, `gin`, `whiskey`, `rum`,
  `tequila`, `brandy`, `wine`, `sake`, `vermouth`, `liqueur` and `tea`:
  records with a parent, so the bare spirit tags leave the Make page's root
  chips and `tag:spirit` finds every drink with a base.
- The **56 drink-name tags with two or more carriers** (they join the sourced
  versions of one drink, e.g. the A Couple Cooks and Love & Lemons margaritas)
  became children of `drink`, labelled from the slug (`Bee's Knees`,
  `Dark 'n' Stormy`). Labels from the first carrier's name were wrong for
  variants (`vodka-collins` → "Chamomile Collins"), so the slug wins.
- The **82 one-off name tags** and **`house`** stay as they are.

### D7 — One agent, no workers

Classification ran in-session, ten batches of ~46 recipes, validated after
each batch; no subagents were needed. See "How it went" below.

## Vocabulary (as applied)

Counts are recipes carrying the child (or, for a root, recipes under it).

| Root (`tag:`)               | Total | Children                                                                                                                                                                                                                                                              |
| --------------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `course` Course             |   450 | `main` 126 · `dessert` 78 · `bread` 68 (Breads & doughs) · `salad` 37 · `sauce` 35 (Sauces & condiments) · `soup` 33 (Soups & stews) · `breakfast` 33 · `side` 32 · `snack` 26 (Snacks & appetizers) · `sandwich` 18 (Sandwiches & burgers) · `pizza` 8               |
| `main-ingredient`           |   312 | `vegetarian` 69 · `beef` 56 · `chicken` 53 · `pork` 49 · `vegetables` 35 · `fruit` 31 · `beans` 27 · `chocolate` 20 · `cheese` 19 · `rice` 16 (Rice & grains) · `potatoes` 15 · `seafood` 14 (Fish & seafood) · `pasta` 12 (Pasta & noodles) · `eggs` 11 · `turkey` 5 |
| `cuisine` Cuisine           |   258 | `american` 84 · `mexican` 43 (Mexican & Tex-Mex) · `italian` 24 · `japanese` 22 · `chinese` 21 · `british` 9 · `greek` 9 · `middle-eastern` 9 · `eastern-european` 8 · `french` 7 · `caribbean` 7 · `indian` 6 · `jewish` 6 · `vietnamese` 3                          |
| `effort` Speed & effort     |   241 | `easy` 176 · `quick` 103 · `project` 48                                                                                                                                                                                                                               |
| `spirit` Spirit & base (D6) |     — | `vodka` 40 · `gin` 37 · `wine` 31 · `whiskey` 31 · `liqueur` 24 · `tea` 18 · `vermouth` 17 · `tequila` 16 · `rum` 16 · `sake` 9 · `brandy` 9                                                                                                                          |

## Method

All scratch lived under the job's tmp dir (not `/tmp`), on a clone of the
content repo.

1. **Snapshot:** clone, reindex, then `food.jsonl` (one line per non-drink
   recipe: name, description, ingredient lines with `<Multiplyable>` stripped,
   times, tags) from `recipes/data/*/recipe.json` with jq.
2. **Vocabulary:** `vocab.json` — roots, children (slug, label, description,
   parent) and the exempt list.
3. **Classify:** ten batch files read in-session, each written to
   `assign/batch-NN.json` (`{assign: {slug: [child…]}, uncertain: {slug:
note}}`) and checked by `validate.py`: every slug exists, every term is a
   child, one or two `course` children unless exempt, no roots, no duplicate,
   no pre-existing child tag left out (D5). A final pass checked `quick`
   against the stated times.
4. **Generate:** `gen-apply.py` writes `apply.sh` (roots, then children with
   `--parent`, then one `term assign <child> --add …` per child: one commit
   each, F34) and `apply-drink.sh`. Both `unset RECIPE_API_URL` and friends
   and pass `--content-dir` explicitly.
5. **Dry run** on the clone, then `metrics.sh` (reindex; `search tag:<root>`
   totals; `inventory make tag:course`) and a review page
   (an Artifact, "Food Vocabulary Review": tree with counts and recipe lists,
   a recipe lookup, the 51 uncertain calls, the drink proposal).
6. **Apply** after Roger's approval: pre-checks (clean tree; local
   `uraninite` level with `uraninite/uraninite`; workstation active), then
   both scripts on `/home/roger/Projects/recipe-content`.

## Results

| Check                                        | Dry run (scratch clone) | Real repo                                                                                   |
| -------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| Commits                                      | 90 food + 70 drink      | 160: 114 term creates, 45 assigns, 1 `Update term: sandwich` (the lock recovery, see Traps) |
| Tree after                                   | clean                   | clean; local `uraninite` = `uraninite/uraninite` = `5d396de`                                |
| `tag:course`                                 | 450                     | 450 (= 457 food − 7 exempt)                                                                 |
| `tag:main-ingredient` / `cuisine` / `effort` | 312 / 258 / 241         | 312 / 258 / 241                                                                             |
| `tag:chicken` / `tag:quick`                  | 53 / 103                | 53 / 103                                                                                    |
| `tag:drink` / `tag:spirit`                   | 208 / —                 | 209 (+ the piña colada) / 194                                                               |
| `inventory make tag:course`                  | total 450               | total 450                                                                                   |

Web, on the workstation (`localhost:3000`) and the Pi (`uraninite:3000`),
both on `d36562ef`:

- `/tags/course`, `/tags/main-ingredient`, `/tags/cuisine`, `/tags/effort`
  and `/tags/spirit` list every child with its count under "Narrower".
- `/search?q=tag:chicken` → 53 results.
- `/make` shows Course, Main ingredient, Cuisine, Speed & effort and Spirit &
  base next to Drinks and Food; `/make?q=tag:course` → 450 recipes, refined
  by Mains, Sides, Desserts, Breads & doughs, ….

The review page (an Artifact, "Food Vocabulary Review") was approved
unchanged on 2026-10-13.

## Traps

- **The workstation's sync races a burst of CLI writes.** Its ref watcher
  syncs `uraninite` on every new commit (fetch, merge, push), and that holds
  `.git/index.lock`. The ninth command of the real run (`term create
sandwich`) wrote its file, then failed to commit with `index.lock: File
exists`; the scripts stopped there (`set -e`). Recovery: a same-value `term
update sandwich` committed the orphaned record ("Update term: sandwich"),
  then `pnpm workstation stop` for the rest of the run and `pnpm workstation
restart` after it, whose startup sync pushed everything to the Pi. **For any
  scripted run of more than a few writes on the real repo: stop the
  workstation first.** (The dry run on a scratch clone never sees this.)
  ⤴️ **Superseded by epic 34 (34c + 34d), once the workstation runs a build
  with 34d** (`pnpm workstation update`): engine commits go through a
  private index with a compare-and-swap on HEAD and never fail on
  `index.lock` (34-D7), and every write, rebuild, pull and the sync's merge
  share one cross-process write lock (34-D6). Verified by 34d's scratch-clone
  stress run: a workstation-mode editor syncing on every HEAD move while CLI
  loops made 61 writes (feature bursts, term creates and updates, an annexed
  image upload) beside a hand-staged file, then 10 more while it merged three
  mirror commits — every command exit 0, one commit per write, nothing left
  staged or pending, the remote level (`agent-epic-34.md`, 34d Results).
  Until the workstation is updated, its sync merges without the lock: keep
  stopping it.
- **A restart does not refresh the workstation editor.** After the run (and
  a restart, and even a full CLI reindex) `localhost:3000/tags/course` still
  showed no children: Next's data cache lives in `.next` and survives a
  restart. `POST /api/revalidate` with the editor's `RECIPE_API_TOKEN`
  (what the CLI's `--notify --editor-url http://localhost:3000` sends) fixed
  it at once. The Pi was right without help (its post-receive reindex).
- **The content repo's branch is `uraninite`, tracking
  `uraninite/uraninite`** — not `main`. Compare against that ref.
- **`term create` with a label that does not slugify to the slug** prints an
  informational line ("carriers are tagged `main` and the record supplies the
  label"); it is not an error.
- **Labels from carrier names are unreliable** for families whose first
  carrier is a variant; derive them from the slug (D6).
- **Each CLI call is a `tsx` start** (~3–5 s), so 160 commands take ~12–14
  minutes; run them in the background with a log.

## Deferred

- **Uncertain calls (51)** were approved as proposed; the notable ones, if
  anyone revisits: dumplings and buns split between `main` (gyoza, nikuman,
  bao) and `snack` (shumai, rangoons); "Mediterranean" salads filed `greek`;
  keema curry filed `indian`; three generic apple salads keep an older
  `american` (D5); one-off cuisines (Korean, Thai, Colombian, Turkish,
  Swedish, German) get no cuisine.
- **Near-duplicates noticed** (not merged): `marble-rye` / `marble-rye-bread`,
  `white-chili` / `white-chicken-chili`, `barbacoa-beef` / `barbacoa-beef-2`,
  `arayes` / `arayes-lebanese-meat-stuffed-pita`.
- **`lunch`** (2 recipes) stays a bare root tag; fold it into `sandwich` with
  `term merge` if wanted (held back from the MCP seat).
- **New recipes are not auto-tagged.** The curator skill should apply the
  four facets on import; its vocabulary notes still predate this epic.
- **Root term pages read "No recipes are tagged Course."** above their
  children, because recipes carry only children (D1). A root page could list
  its descendants' recipes (`withDescendants`) or word the empty state for a
  facet root; a small code change, not done here.
- ~~**24f's real story run**~~ **done 2026-10-13** (`agent-taxonomy.md`,
  "24f story run"): `christmas-cookies` with a `linzer` child, 8 recipes.

## How it went (single-agent mode)

One session did housekeeping, snapshot, vocabulary, classification of all 457
recipes, the dry run, the review page, the real apply and these docs. Reading
~46 compact recipe lines per batch kept classification fast and consistent
with no workers; the validator caught nothing structural, and the cross-check
of the dry-run search totals against the assignment files caught D5. The only
long waits were the CLI runs.
