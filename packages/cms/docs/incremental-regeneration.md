# Incremental regeneration for the content engine

This is a **durable roadmap**, not a one-shot plan. It is kept accurate as each PR lands — the
same discipline as `docs/ui-overhaul.md` and `websites/portfolio/docs/rebuild.md`, where a
closing PR existed purely to make the record true.

---

## 0. How this document is used

**Plan mode is re-entered between every phase.** Each PR in §10 and each follow-up in §11 gets
its own planning pass before any code is written; this document is the bootstrap for that pass,
so the next phase starts from written context rather than from re-reading the codebase and
re-deriving decisions already made.

That places an obligation on each PR: **leave this document true.** Concretely, a phase is not
finished until it has

- moved its row in §10 or §11 to done, with anything discovered that changed the shape of later
  phases written into them;
- recorded decisions that were _made_ rather than merely proposed — especially where the
  implementation diverged from what was planned here, and why;
- added any new follow-up the work surfaced to §11, so the map stays the complete picture rather
  than the original guess.

The failure mode this guards against is a roadmap that describes the plan instead of the
system. When those drift, the next planning pass bootstraps from fiction — which is what made a
closing "make the record true" PR necessary in the portfolio stack. Keeping it true as you go
is cheaper than a reconciliation PR at the end.

That obligation is also what produced **this** document. The stack's first three PRs were
organized around pagination, because pagination is where the work started; planning the fourth
surfaced that pagination is one _kind_ of derived artifact rather than the deliverable, and that
the actual thesis was sitting at the bottom of the old document as a deferred follow-up. The
record was mis-framed rather than untrue, which §0 covers just as much. Renaming and
re-sequencing was cheaper than planning a second phase from a frame that had already been
outgrown.

Two things worth stating plainly for whoever picks this up cold: §3 is _why_, not just _what_ —
several of its choices (ascending storage, stable-end anchoring, direction baked into the PAGED
key) look arbitrary until you see the alternative they rejected, and each records that. And §11
is deliberately over-complete: it is a survey of the whole repo, not a commitment to build all
of it.

---

## 1. The goal: minimum-page regeneration

**This project is a content layer for static site generators: pagination and invalidation logic
precise enough that a build regenerates the minimum number of pages for any individual content
update.**

A write to one content item produces a **regeneration set** — the identified artifacts a static
build must re-render, and nothing else. Content files are the only source of truth; everything
else is derived, and each derived kind declares how a content change maps to the artifacts it
invalidates. The engine's job is to keep that set minimal and correct. The export framework's
job is to consume it.

Pagination is the first and most developed instance of that idea, not a separate project. Its
dirty-page diff (`PaginationUpdateResult.dirtyPages`) is the only precise regeneration set the
engine currently produces, which is why so much of this document is about it.

**What there was before.** Pagination had none of it. Each `[page]` route called
`getRecipes({ offset: (n-1)*PER_PAGE, limit: PER_PAGE })` → `db.getRange({ offset, limit })`,
an O(offset) cursor walk recomputed against the whole DB on every read; and every
`generateStaticParams` loaded the **entire** index into an array just to count it. Three
consequences:

1. Reads recalculated pagination against the whole DB every time.
2. Nothing knew _which_ pages changed after an edit, so every consumer — revalidation, cache
   purge, incremental builds — had to assume all of them did.
3. There was exactly one ordering per content type, so "the same content, ordered or filtered
   differently" had nowhere to live.

Read against the goal, (1) and (3) are ordinary performance and flexibility problems, but (2)
is the structural one: those were symptoms of having no regeneration set at all, not of bad
pagination. Fixing (2) is what the rest of this document is for. Pay the cost once at **write**
time, make reads O(page), allow any number of pre-baked queries per content type, and emit a
precise diff.

**Design constraint:** the core imports nothing from Next. A thin adapter wraps it in Next's
own caching and invalidation primitives; nothing Next already does gets hand-rolled. Next's
`output: "export"` cannot rebuild a subset of pages today, so for now the diff feeds cache-tag
invalidation and a build-consumable artifact rather than a partial build. The export framework
that would consume it for a true incremental build is the follow-up (§11.3); the regeneration
set itself is not.

---

## 2. The model: sources, derived artifacts, and the dependency graph

Content files are the only source. Every other artifact the sites serve is derived from them,
and each derived kind is defined by how a content write maps to the artifacts it invalidates.
Naming the kinds is most of the work — once a surface has a name here, "what does a write to X
do to it" is a question with an answer rather than a shrug.

| Derived kind         | Examples in this repo                                | What a write invalidates today                                                                           |
| -------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Item pages**       | `/recipe/<slug>`, `/project/<slug>`                  | **precise**, including a dependent's own item page — recipes fill `dependentItemBasePaths` in D2a (§6.3) |
| **Item records**     | the homepage hero, `/featured-recipe/<slug>`         | **precise** — `item:<type>:<slug>`, fired by every write and keyed by item rather than by path (F19)     |
| **Pagination pages** | `/recipes`, `/featured-recipes`, and their `/<n>`    | **precise** — `dirtyPages` / `removedPages` (§3–§5); featured recipes joined in D2b                      |
| **Aggregates**       | `getAllTags`, the demo's note tag cloud              | **precise** — a stored value plus a hash, so a write reports `changed` or nothing (F10b/F10c)            |
| **Corpus documents** | `search/all`, `search/ingredients`, `search/version` | one blob per corpus, rebuilt whole on any write — but no longer all fetched on every load (F4a)          |

**Item pages and item records are two kinds, not one, and F19 is where that became clear.** Both
depend on one item's whole record; they differ in whether the depending surface has a URL the
writer can name. `/recipe/<slug>` does, so `revalidatePath(itemBasePath + "/" + slug)` reaches it.
The homepage hero renders the same record at `/`, and `/featured-recipe/<slug>` renders an entire
recipe under a _different content type's_ slug — neither is reachable by path from the write that
changed the record, at any amount of configuration, because the set of such URLs is not a function
of the item. Keying the tag by item instead of by path is what makes the reach exact. It also
costs nothing to declare: an item tag's only coupling is the content type, so unlike a pagination
index or an aggregate it needs no seat on the content config at all.

Two consequences of that table are worth stating outright.

**A write should return a regeneration set, not a boolean.** When this was written
`ContentWriteResult` carried `pagination: PaginationUpdateResult[]` and nothing else, because
pagination was the only kind that produced one, and everything else fell back to blanket
`revalidatePath`. Both halves have since been built out: `SyncDerivedResult` and
`DependentWriteResult` now carry `pagination` **and** `aggregates` (F10b), and the item-record
kind reports through fired tags rather than a result list (F19a) — the "one result per derived
kind, per content type" shape, arrived at one kind at a time.

The homepage strips used to be named as the reason `paginationOnly` was off. They were not: they
were bounded reads on an untagged transport, and F10a moved them onto the keyspace without any
new kind (§11.1). What remained was `getAllTags`, a real aggregate, closed by F10c — and then
the hero's `getRecipeBySlug`, an item-page dependency embedded in a page whose URL is `/`, which
no `revalidatePath` could reach and which F19b closed. **The flag has been on since F19c**, set
on all three recipe-family success configs; §10 records why turning it on was a declaration of
correctness rather than an observable win.

**Derivation crosses content types.** A derived artifact of type B can depend on the content of
type A, and this repo already has the case: a featured-recipe card renders the _referenced
recipe's_ name and image (`common/components/List/FeaturedRecipe/index.tsx:19-38`).

That gap used to be paid for twice, in both directions. **D2a closed both**, by making
`FeaturedRecipeEntryValue` carry `recipeName` and `recipeImage` alongside `{ recipe, note }`:

- **On read**, `getFeaturedRecipes` enriched each entry with an `await getRecipeBySlug(...)` — an
  N+1 data-file read per card per render, wrapped in a `try`/`catch` that silently degraded to an
  unnamed, imageless card when the referenced recipe was gone. It is now a projection off the
  index value, and the `catch` is gone with it. A pagination projection could never have done the
  old thing at all: `project` is synchronous by contract, and deliberately so (§3.4).
- **On write**, before D1 the only content-to-content invalidation was a rename-triggered full
  pagination rebuild of the referencing type, recorded as F15. It over-invalidated when it
  fired, and it fired only on rename — so an ordinary recipe edit that changed a name left every
  featured card rendering that name stale, with nothing anywhere aware of it. A recipe write now
  reports exactly which features moved, and fires nothing when it moves no borrowed field.

The edge those two want already existed in the config. `ReferenceSpec` declares that
featured-recipes references recipes via `indexField: "recipe"`; it was simply only ever read to
rewrite slugs on rename. **The reference specs are the dependency graph.** D1 made the engine
read them as one (§6), and D2a is the first production type to declare the inbound half.

What is left in that table is the two kinds with no derived artifact at all. The featured-recipes
_list_ pages used to be the concrete case — a recipe retitle fixed their data, but they read
through `readContentIndex` rather than a pagination keyspace, so they had no tag to be told about
and relied on the blanket `revalidatePath`. **D2b closed that**: they read a keyspace now, and
`listPaths` is empty because the pages carry tags. **F10a closed the same gap for the homepage
strips**, which had it for the same reason and needed the same fix rather than a new kind. The
last untagged reader was one genuine aggregate — the recipe form's tag cloud and the homepage's
`BrowseChips`, both `getAllTags` — closed by F10b/F10c, and then the hero's item-page read,
closed by F19. Nothing on this list is untagged now, which is what let F19c turn `paginationOnly`
on.

**Scope.** The substrate's first cut (D1) is content-to-content dependencies only, because that
is the case with a concrete consumer waiting on it (D2a). Corpus documents (F4) and aggregates
(F10) are later derived kinds plugged into the same graph, not part of the first design — they
have a different shape, since they depend on the _whole_ corpus rather than on identified items,
and the interesting question there is chunking rather than dependency lookup.

---

## 3. Pagination: the first derived-index kind

Everything in this section is shipped (P1–P3). It is the most developed derived kind by a wide
margin, and the reference for what "precise" should mean for the others.

LMDB has no query planner — it has one thing, natural key order. The working model is to
**pre-bake a query as a keyspace**: pick the field to sort on, make it the key, and read the
result by iterating in natural order. Nothing is ever re-sorted at read time. A pagination
index is that materialization plus a page decoration.

### 3.1 Anchor pages at the stable end

Ordinary pagination numbers pages from the newest item, so the _common_ write — creating
content, which lands at the newest end — shifts every position by one and changes the contents
of **every** page. It is the worst possible arrangement for incremental rebuilds.

Instead, rank from the oldest item and let the head page be partially built:

```
oldest ─────────────────────────────────────────────────► newest
[ page 0: 10 ][ page 1: 10 ][ page 2: 10 ][ page 3: 4 ← head, partial ]
                                                  ▲ new items land here
```

The index is stored in **plain ascending order, oldest first**, so an item's rank is simply its
position in the walk and `pageIndex = floor(position / perPage)`. No arithmetic, no global
quantity: an append lands at the natural end of the keyspace and no existing position moves.
Sealed pages are immutable by construction, so a create dirties only the head page.

Storage order is load-bearing, not cosmetic. Storing newest-first would mean deriving
position-from-the-stable-end as `total - 1 - d`, dragging in a `total` that must be maintained,
can drift, and needs a repair path — all to describe something the key order can just _be_.

Rarer writes behave correctly for the same reason: a backdated insert or an old delete shifts
positions only _after_ it, dirtying that page through the head and never the deep history.
Change propagates toward the volatile end.

**This only pays off if page identity is anchored at the stable end too.** If URLs counted from
the newest, then each time the head seals every numbered page would shift by one and everything
would be dirty again — the cascade reduced from every-insert to one-in-`perPage`, not
eliminated. So `pageIndex` counts from the oldest item and page 0 is the oldest content. This
inverts URL numbering relative to what recipes served before; accepted.

The resulting invariant: **once a page is sealed, its content never changes** unless one of its
own items is edited or deleted.

### 3.2 The head fold

The head page holds 1…`perPage` items, so it is a poor landing page alone. `readHead` returns
pages `headPage` and `headPage - 1` together — two bounded range seeks, constant time —
yielding `perPage + 1` to `2 * perPage` items.

- `/recipes` — the landing page, `readHead()`. Volatile by nature; it is the newest content.
- `/recipes/<pageIndex>` — numbered routes for `0 … headPage - 2` only, so the head and the
  folded-in page are never duplicated across two URLs.

When the head seals and `headPage` increments, exactly one new numbered route appears — the
page previously folded into the landing, whose content was already final. **No existing
numbered page changes.** Navigation is relative: older is `pageIndex - 1`, newer is
`pageIndex + 1`, and the landing's "older" link points at `headPage - 2`.

Small corpora need no special case: under `perPage` items means `headPage` is 0, nothing to
fold, and the landing is the whole corpus; at `headPage` 1 the fold covers everything and the
numbered range is empty.

Accepted trade: URLs are stable, human-facing _labels_ are not — "page 3 of 12" counted from
the newest is `headPage - pageIndex + 1` and moves as the corpus grows. Label relatively
("Older recipes") or accept the shift. Stable URLs are the more valuable half.

> **Constraint P2 surfaced, binding on P3 — a numbered page must not render a global total.**
> The meta tag is deliberately separate from the page tags so that a changing `total` does not
> invalidate every page: `total` moves on almost every write, and folding it into the page tags
> would hand back the entire benefit of the dirty-page diff. That separation only holds if
> nothing a numbered page renders depends on meta. §3.2 already accepts that human-facing
> labels are unstable; this makes it a rendering rule rather than a preference. The landing page
> is free to print a total — it is invalidated by any write that changes one.

### 3.3 Each keyspace is keyed for how it is read

The config supplies `key(entry)` in **ascending stable order** — for recipes, plain
`[date, slug]`. Display direction is separate, declared once as `newestFirst` and baked into
the PAGED key at _write_ time.

Both keyspaces are therefore read **forward**, each in its own natural order, and neither is
ever re-sorted:

- **SORTED** `[...sortKey, id]` ascending — walked forward by the pagination phase, where
  position _is_ rank; new items append at the end.
- **PAGED** `[pageIndex, displayRank, id]` — `pageIndex` ascends from the oldest page while
  `displayRank` descends within a page, so reading one page forward yields newest-first.

Two keys per item, each pointing the way its reader travels. The only reverse read anywhere is
the mid-page cursor resume in `readAfter`, bounded by `limit`.

An index whose display order _is_ ascending (alphabetical A–Z) sets `newestFirst: false` and
the two orders coincide. Such an index gets no stability benefit — alphabetical inserts land
anywhere, no end is stable — and degrades gracefully to ordinary pagination.

> **Decided in P1 — `displayRank` is the signed walk position, not a negated sort key.**
>
> The original plan wrote the PAGED key as `[pageIndex, ...negatedDisplaySortKey, id]`. That
> only works when every sort component is numeric: `-date` is fine, but a sort key of
> `[date, slug]` has a string component and there is nothing to negate it with, so ties within
> a date would have come back _ascending_ inside an otherwise descending page.
>
> The walk position is a single integer that already ranks the whole index in sort order, so
> negating _it_ reverses exactly, is independent of the sort key's component types, and keeps
> the key short. `displayRank = newestFirst ? -(position + 1) : position`.
>
> The `+ 1` is not cosmetic. `ordered-binary` does not encode negative zero as a number at all
> — `[1, -0, "b"]` round-trips as `[1, "", null, null, null, "b"]` and sorts _after_
> every other key in the environment. Any future key component that can go negative has to
> avoid producing `-0`.

### 3.4 Covering: the index carries what the list renders

Each entry stores a `project(entry)` payload — a link plus just enough fields for a list item —
inline in PAGED. Iterating a page yields render-ready items with **zero** reads of the content
index or the JSON data files. This is what `data/read.ts`'s `map` does today at read time,
moved to write time and materialized.

The projection is sourced from the content index value plus the id, synchronously. It
deliberately does not read data files: the pass runs on every content update and reading N JSON
files would stop it being quick. The rule — **if a list item renders it, it belongs in
`buildIndexValue`**, and the projection selects from there.

That rule is what §2 runs into for featured recipes: a card renders a field that belongs to
_another_ content type, so no synchronous projection over this type's index value can cover it.
The fix keeps `project` synchronous and makes the content index value covering instead, by
resolving the borrowed fields at write time (§6) — which is the same rule, applied one level
earlier.

### 3.5 Diffing on projected content

Key-diffing misses the most common edit: retitling an item changes neither its key nor its
page, but the rendered page _is_ different. Each page stores a hash over its ordered
`(id, fingerprint)` sequence, and `fingerprint` defaults to **the projected payload** — so a
page is dirty exactly when what it renders changed, and a field nobody projects can never dirty
anything.

> **Decided in P1 — the page hash is also the write-amplification bound.** A page whose new
> hash matches its stored hash is skipped entirely: no keys read, none written. A page whose
> hash differs is rewritten _whole_ — its paged range is deleted and re-put, at most `perPage`
> entries. This is simpler than tracking each item's previous position, and gives the same
> bound the plan asked for, because a clean page's item positions are provably unchanged: an
> item's position is a function of `(pageIndex, offset within page)`, and both are fixed by an
> unchanged id sequence. (The one way that could break — `perPage` changing — forces a full
> rebuild through the spec hash.)

### 3.6 Page assignment is one pluggable function

Everything else — the keyspaces, the projection, the hashing, the diff — is independent of
_how_ a page is chosen. Keeping assignment behind a single `assignPage(position, perPage)` seat
makes the choice reversible:

| Strategy                                     | Append              | Backdated insert / old delete | Page size          |
| -------------------------------------------- | ------------------- | ----------------------------- | ------------------ |
| **Fixed size from the stable end** (default) | head only           | insertion page → head         | exactly `perPage`  |
| Key buckets (`/2026/03`)                     | current bucket only | that bucket only              | unbounded, uneven  |
| Content-defined chunking                     | one page only       | one page only                 | ~`perPage`, ragged |

Fixed-size-from-the-stable-end is the right default: it optimises the common write and keeps
uniform page sizes and honest "page N of M" arithmetic. It ships as
`fixedSizeFromStableEnd` in `updatePaginationIndex.ts`, the only value the `assignPage` seat
currently takes.

Content-defined chunking is the one to remember. Cut a boundary wherever
`hash(id) mod perPage === 0` (with min/max clamps) and boundaries become a property of content
rather than position, so _any_ insert dirties exactly one page, backdated or not — the trick
rsync and borg use. The cost is ragged page sizes. Not worth it while backdated writes are
rare, but it drops into the same slot. It is also the natural chunking strategy for corpus
documents (F4), which is worth knowing before designing that kind.

### 3.7 Parallelism

Assigning a page needs a global position, so a chunk can't start until everything before it is
counted — and that count is the walk. Chunking the walk buys ~nothing, and LMDB serializes
writers within an env anyway, so parallel chunk writers would contend. The walk is keys-ordered
plus a hash: milliseconds at this corpus size. **The real parallelism is across indexes and
across content types** — independent envs, no contention, `Promise.all`.

---

## 4. Storage layout

One LMDB environment **per pagination index**, at
`<contentDir>/<dirname(config.indexDirectory)>/pagination/<name>/` (e.g.
`recipes/pagination/by-date/`). Separate envs rather than named sub-databases because the
existing content index stores entries in the **root** database, and lmdb's README
(`node_modules/lmdb/README.md:317`) warns against mixing the two in one env. Separate envs also
mean zero migration of existing `*.mdb` files and independent parallel writers.

| Key                               | Value                                                                  | Purpose                                                               |
| --------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `[0, ...sortKey, id]`             | `{ item, fingerprint }`                                                | **SORTED**, oldest-first — the pre-baked query; walk position is rank |
| `[1, pageIndex, displayRank, id]` | `item`                                                                 | **PAGED** — one forward range seek returns a page, newest-first       |
| `[2, pageIndex]`                  | `{ hash, count }`                                                      | per-page hash — the diff source                                       |
| `[3, id]`                         | `{ sortKey, pageIndex? }`                                              | reverse lookup: where does this item sort, and what page is it on?    |
| `[4]`                             | `{ total, headPage, perPage, specHash, updatedAt, rebuildInProgress }` | meta; O(1) `generateStaticParams` and head reads                      |

`item` is the `project(entry)` payload, carried inline in PAGED so a page read is a single
sequential scan. That duplicates the projected payload per item — the intended trade, since a
projection is a link plus a handful of fields, not the whole record. If one grows large enough
to hurt, PAGED can hold ids and pay O(log n) per item.

`fingerprint` is stored as a hash of the fingerprint value rather than the value itself, so the
per-page hash is computed over fixed-width strings and the sorted keyspace does not carry a
second copy of the projection.

**Aggregates (F10b) follow the same convention one directory over**, at
`<contentDir>/<dirname(config.indexDirectory)>/aggregates/<name>/` — e.g.
`notes/aggregates/tags/`. One environment per aggregate, holding exactly one key:

| Key   | Value                                  | Purpose                                                 |
| ----- | -------------------------------------- | ------------------------------------------------------- |
| `[0]` | `{ value, hash, specHash, updatedAt }` | the folded value, plus what makes "did it change" cheap |

A tuple key rather than a bare string so the keyspace can grow the way the pagination one did.
`hash` is over `value`; a pass that recomputes to the same hash writes nothing and reports
nothing. `specHash` covers `name` plus the aggregate's required `version`, exactly as the
pagination one does since F16.

The environment cache both kinds use lives in `lmdb/environmentCache.ts`, extracted at F10b
rather than copied — the inode-signature rule that makes a replaced content directory reopen
instead of serving from an unlinked mapping is subtle enough that two implementations of it
would eventually disagree.

**Since F1 the content index is cached through it too**, so "derived-state envs are cached and
content envs are not" is no longer the rule: everything an engine path opens is cached, and
nothing outside `closeCachedEnvironments` may close one. That last part is a hard invariant, not
a style note — a cached environment closed by any caller is handed back _closed_ to every later
reader in the process, which is why F1 had to remove all nine engine `.close()` sites and the
eleven in the unit tests in a single commit.

The lookup is written by both phases and each owns a field: phase 1 owns `sortKey` (it is how
an update finds the _old_ sorted key to delete), phase 2 owns `pageIndex`. Phase 2 rewrites
lookups only for dirty pages, which is sound for the same reason the whole-page rewrite is: a
clean page's items did not move.

`total` is an _output_ of the pass, recomputed from the walk and rewritten each time rather
than incrementally maintained, so it serves "N of M" in O(1) and cannot drift.

`specHash` covers `{ name, perPage, newestFirst, version }` and nothing else. A mismatch forces
a rebuild. `perPage` matters especially: changing it re-cuts every boundary, so every page is
dirty and that must be a detected rebuild, not a silent reshuffle. `version` is **required**,
because it is now the only thing that can tell a reader the projection changed.

> **Closed at F16 — the spec hash is declared, not derived, and a test does the catching.**
> P1 hashed `key`/`project`/`filter`/`fingerprint`/`getId` via `fn.toString()`, on the reasoning
> that a bundler renaming variables would cost a rare spurious rebuild in the safe direction. It
> is neither rare nor safe: a production build minifies those functions and a dev server does
> not, so an index written by one and read by the other mismatches **every time**. It bit twice
> — the demo at P2, recipe at P3 — and P2 left it open as "keep the automatic form as a default,
> pin `version` on anything real", because neither option looked obvious.
>
> F16 made it obvious by counting: all seven real configs, four pagination and three aggregate,
> already declared `version: "1"`. Nothing was using the automatic form except inline test
> fixtures. So `version` became required on both `PaginationIndexConfig` and `AggregateConfig`,
> and both hashes dropped the `fn.toString()` branch outright — not behind a `NODE_ENV` check,
> which would have reintroduced the exact dev/prod split it fixes.
>
> What that gives up is real and worth naming: the source hash was the thing that caught "edited
> a projection, forgot to bump `version`". Dropping it without a replacement trades a rebuild
> footgun for a **staleness** footgun, which is the worse direction and precisely the `3cec4e17`
> failure, where a marker outlived the thing it vouched for. The replacement is
> `test/specVersions.test.ts`: it pins a hash of each config module's **source text** beside the
> versions declared in it, so any edit to any of the five fails CI until an author has decided
> whether it needed a bump. File-level rather than per-function, deliberately — it needs no
> import of `recipe-website-common/*` from a repo-root vitest, and over-triggering on a comment
> edit is the safe direction at a cost of one `vitest -u`.

> **Decided in P2 — a cached environment is invalidated by inode, not trusted forever.**
> An open LMDB environment holds its data file mapped, and unlinking that file leaves the
> mapping valid and pointing at an inode nothing else can reach. P1's process-wide env cache
> would therefore keep answering from content that is no longer on disk, with writes vanishing
> into the unlinked copy. That is not hypothetical — a content directory is a separate
> repository replaced wholesale by a sync, and the demo's harness swaps one out between every
> test. `getPaginationDatabase` now records `dev:ino` of `data.mdb` at open time and reopens
> when it no longer matches. One `statSync` per lookup, against an LMDB open it already
> avoided.

---

## 5. The two phases

**Phase 1 — item operations** (`createContent` / `updateContent` / `deleteContent`): write,
move or delete the item's SORTED entry and its lookup. No page is computed. Independent per
item and per index, so they parallelize freely.

> **Decided in P1 — `filter` runs in phase 1, not phase 2.** The plan had phase 2 apply it
> during the walk, but phase 2 reads only `{ item, fingerprint }` and no longer has the content
> index value a filter predicate needs. Filtering at write time means the sorted keyspace
> contains _exactly_ the included entries, so the walk position is the rank with no further
> qualification. A filtered-out item has its sorted entry and lookup removed, the same as a
> delete. Changing `filter` changes the spec hash and forces a rebuild, which re-applies it to
> the whole corpus.

**Phase 2 — `updatePaginationIndex({ config, paginationConfig, contentDirectory })`:**

0. If there is no meta record, the spec hash does not match, or `rebuildInProgress` is set:
   set the flag, drop keyspaces 0–3, re-run phase 1 over the whole content index, and continue.
   This makes the pass self-healing — the first call on a fresh index materializes it, and no
   caller ever needs a separate "build" entry point.
1. Read old meta + all `[2, page]` hashes into memory (page count is small).
2. Walk SORTED forward from the start, count position,
   `pageIndex = floor(position / perPage)`. Accumulate a rolling per-page hash, buffer the
   entries of dirty pages only. LMDB read transactions are snapshots, so iterating while
   buffering mutations is safe.
3. At each page boundary compare new hash to old → clean pages cost nothing; dirty pages push
   to `dirtyPages`.
4. Pages that had a stored summary and no longer appear in the walk are `removedPages`.
5. Apply buffered page rewrites, page summaries, lookups and meta inside one
   `db.transaction(...)`, so a crash can't leave a half-assigned index. A full rebuild of a
   large corpus should chunk into bounded transactions; that reintroduces a crash window, so
   meta carries `rebuildInProgress`, set at the start and cleared at the end. An index found
   with the flag set is rebuilt rather than trusted — the same rule as `specHash`.

```ts
interface PaginationUpdateResult {
  name: string;
  total: number;
  headPage: number;
  previousHeadPage: number;
  dirtyPages: number[]; // stable ids, content changed
  removedPages: number[];
  unchanged: boolean;
  rebuilt: boolean;
}
```

For the common create, `dirtyPages` is `[headPage]` and nothing else. That is the thesis — and
it is the shape every other derived kind's result should end up resembling (§2).

> **Decided in P1 — a no-op pass writes nothing at all, including meta.** `updatedAt` feeds
> the `version` string that §7's cache tags and §8's client backstop are keyed on. If every
> pass bumped it, an edit to an unprojected field would invalidate every cached page while
> changing none of them — which is the exact failure the projected-content diff exists to
> avoid. The pass therefore skips the transaction entirely when nothing is dirty, nothing is
> removed, and meta already agrees.

**Designed for, not built yet — resume from the last sealed page.** Step 2 is O(N) per update,
irrelevant at this corpus size, and a full walk is much easier to get right, so v1 does exactly
that. But ascending storage makes the optimisation nearly trivial later: sealed pages are a
prefix of the walk and `headPage` is in meta, so the pass can seek to `headPage * perPage` and
reconcile only from there — one page instead of N, without needing to know what changed. Two
writes fall outside it (a backdated insert/delete shifts later positions; a deep in-place edit
changes a hash without moving anything), so phase 1 would record the lowest sort key it touched
in a pending-changes keyspace, which phase 2 starts from and clears on success. Nothing above
forecloses this.

---

## 6. Dependency-tracked invalidation

**Status: built in D1.** This section was a sketch with four open questions; it is now a record
of what was built and what was decided. The four questions are answered in §6.1.

The problem, restated from §2: a derived artifact of type B can render fields belonging to a
content item of type A, and the engine had no way to know it. `project` is synchronous and sees
only B's own index value (§3.4), so B's pagination index could not cover such a field at all;
and the only invalidation crossing the type boundary was a rename-triggered full rebuild.

The pieces D1 built, all in `packages/cms/`:

| Module                           | What it is                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `content/references.ts`          | `ReferenceDeclaration`, the resolver, `resolveReferences`, `borrowedFieldsOf` |
| `content/updateDependents.ts`    | the write-time pass; replaces `updateReferencesViaIndex`                      |
| `pagination/syncContentItems.ts` | phase 1 for K items in one transaction per index, then phase 2 once           |

and the three seams they plug into: `buildIndexValue` gained a second parameter,
`ContentWriteResult` gained `dependents`, and `rebuildIndex` gained a cascade.

### 6.1 Borrowed index-value fields

A content type declares that its index value **borrows fields from a referenced type** through
`ContentTypeConfig.references`, so `BookmarkIndexValue` carries `noteTitle` alongside
`{ note, label, date }` and, since D2a, `FeaturedRecipeEntryValue` carries `recipeName` and
`recipeImage` alongside `{ recipe, note }`. Resolution is **async and engine-owned**: the engine
reads the referenced item and hands the already-resolved values to `buildIndexValue`, which
stays a pure synchronous function of what it is given.

`ReferenceDeclaration` is non-generic, for the reason `paginationIndexes` records at
`content/types.ts`: naming the config's own generics would put `TKey` in a parameter position
and make the whole interface invariant, breaking every `config as ContentTypeConfig` cast in the
package.

> **Decided in D1 — `buildIndexValue`'s second parameter is required in the type, not optional.**
> A required parameter cannot be silently forgotten at a new engine call site. TypeScript still
> accepts an implementation that declares only the first, so **all 7 existing config
> declarations typechecked unchanged**; only `test/pagination.test.ts`'s 8 call sites needed
> `, {}`.

The resolver is created **once per write operation and never module-global**, and caches the
_promise_ per `(contentType, slug)` so N dependents of one target share a single read. A
process-wide cache would serve values from before the last write — the failure shape of
`3cec4e17`, a marker vouching for content that had moved on.

That split is the whole point. It keeps phase 2 a pure walk over materialized values (§5), it
keeps `project` synchronous (§3.4), and it makes the **content** index covering rather than
only the pagination index — which is why `getFeaturedRecipes` could drop its N+1 enrichment read
in D2a, with featured recipes still on offsets and no pagination keyspace anywhere in sight. The
capability is worth having on its own; pagination is one consumer of it, and D2b is where that
consumer arrived — the borrowed fields are what made the featured index _projectable_, since a
pre-baked page is projected once from the index entry and cannot go and read a second file.

> **Confirmed in D2a — the two-way declaration is a real import cycle in production, and the
> thunks hold.** `recipeContentConfig` imports `featuredRecipeContentConfig` for `referencedBy`,
> and D2a's `references` makes the reverse import too. Verified from both entry points, since a
> route reaches only one of them first: `/featured-recipes` loads the featured config first,
> `/recipes` the recipe config. Un-thunking either side fails at import with a `ReferenceError`
> rather than degrading — which is the property that made this safe to do at all.

> **Decided in D1 — resolution reads the referenced type's DATA FILE, not its index.** The
> sketch above leaned toward the index, on the grounds that projections read index values. That
> was wrong on every count once measured against the actual keys. Both content types here are
> keyed `[date, slug]`, so a by-slug lookup against an index is an **O(N) scan**, while the data
> file's path derives directly from the slug. The data file is also the source (§2), so
> resolution is order-independent across a rebuild and can never serve a value from an index
> that has not caught up. And it opens no second LMDB environment per item inside a loop that
> already holds one open — `getContentDatabase` opens a fresh one on every call until F1.

> **Decided in D1 — depth is exactly one hop.** A borrowed field is never itself resolved.
> Deeper chains need transitive dependent tracking on write, which the reverse scan does not
> give cheaply, and nothing in the repo wants it.

> **Decided in D1 — a dangling reference resolves to `undefined`, not an error.** A content
> directory is edited by hand and by git; a reference to a deleted item is an ordinary state,
> not a broken invariant. Non-ENOENT read failures also degrade to `undefined`, but
> `console.warn` — unlike the bare `catch` on today's featured-recipe read path, which is how
> the unnamed card happens silently.

> **Decided in D1 — `refs` carries only the _declared_ fields, never the referenced item's full
> data.** This is correctness, not tidiness: the declaration is both the trigger and the
> payload, and they must be the same set. If `buildIndexValue` could reach an undeclared field,
> a write changing that field would fire nothing — reintroducing exactly the staleness this
> removes, one layer down.

> **Found in D1 — `ReferenceSpec.config` had to become a thunk too.** Declaring the edge from
> both sides makes the two config modules import each other, and whichever side the bundler
> reaches first evaluates the other's object literal while its `const` is in the temporal dead
> zone: a `ReferenceError` at import time, not a type error. `demo/lib/notes.ts` already
> imported `bookmarkConfig` eagerly, so adding the forward edge on bookmarks would have broken
> the demo outright. Both sides defer. A registry or a wiring module were considered and
> rejected — each trades a loud crash for silent load-order dependence.
>
> This is why D1's first commit is the thunk conversion, alone: it is the highest-risk change
> in the pass and it fails loudly.

### 6.2 Dependent resolution on write

`updateDependents` finds the items that borrow from the written one, rebuilds their index values
from freshly resolved references, syncs their pagination and reports what moved — **precise
dirty pages for the dependent type** instead of a forced full rebuild.

It **replaces** `updateReferencesViaIndex` rather than sequencing with it. That is a correctness
property, not a tidiness one: one pass reads each dependent's data file once and writes it at
most once by construction, where two passes would read and write twice and have to agree about
the order they ran in.

Dependent lookup reuses the `indexField` iteration `updateReferences` already performed: the
scan exists, corpora are small, and it needs no new keyspace to maintain or repair. It now runs
on creates too, which is new load. A reverse-dependency keyspace (`[refType, refId] →
dependents`) is the release valve — deliberately not specified, and not worth building before
something profiles slow.

Two rules the pass states and the tests pin down:

- **A delete does not rewrite dependents' data files.** The reference field keeps pointing at
  the dead slug; only the borrowed values leave the index. Rewriting it would destroy the only
  record of what the item pointed at, which is the one thing that could ever repair the link.
- **`removeFromIndex` when a dependent's key moves.** The rename path never did this
  (`updateReferences.ts:162-164` as it stood), so a dependent whose key derives from the
  reference field would have been left in the index twice — a latent orphan D1 fixes in passing.

This **subsumes F15**, which asked for exactly this narrowing and named the two ways to get it:
returning per-type results, or precise per-item sync. D1 does both.

### 6.3 Per-type write results

`ContentWriteResult` gained `dependents: DependentWriteResult[]`
(`{ contentType, pagination, updatedSlugs }`). Additive, so every existing
`({ pagination } = await ...)` destructure kept working.

> **Decided in D1 — `dependents` is a separate list, not a uniform per-type map.** The asymmetry
> between the written type and a dependent one is permanent, not an artifact of the current
> shape: the written type owns the redirect and the item path, while a dependent type's paths
> are not even in the caller's success config.

`handleContentSuccess` takes the whole result and loops, firing
`revalidatePaginationResults(depType, …)` and nothing else per dependent — no redirect, no list
paths. `ContentSuccessConfig.dependentItemBasePaths` is the seat for the one remaining gap: a
dependent's _detail_ page renders borrowed fields too, the write path knows which items changed,
and only the app knows their URLs. Unset everywhere in D1; **D2a fills it in** for recipes, with
`{ "featured-recipes": "/featured-recipe" }` on both the update and delete success configs — a
delete strips the borrowed values just as a retitle rewrites them.

### 6.4 Make the trigger precise, not just narrower

Invalidation fires on **any change to a borrowed field**, not only on rename. The tension reads
like a contradiction — F15 wanted the rename rebuild _narrower_, this wanted the trigger
_broader_ — but they are the same fix. The old trigger was coarse in both directions at once: it
fired for the wrong reason (any rename, whether or not anything rendered changed) and missed the
right one (a borrowed field changing without a rename).

The gate is one line:

```
renamed || borrowedFieldsOf(config).some(f => hashValue(prev[f]) !== hashValue(next[f]))
```

`borrowedFieldsOf` walks out through `referencedBy` and back in through each dependent's
`references`, because the borrowed-field list necessarily lives on the borrowing side — a type
cannot know what its dependents render. The gate subsumes create (a previously-dangling
reference now resolves), delete, and rename-without-borrowed-change; a rename stops being the
one case with special handling and becomes an ordinary one, since the slug is a borrowed value
like any other, just one stored in the dependent's own file.

**Safety property, the same one P2 established with `paginationIndexes`.** `borrowedFieldsOf`
returns `[]` for every production content type in D1, so the gate cannot open for any ordinary
write in this repo and `updateDependents` returns `[]` having opened nothing. D1 is a
behavioural no-op outside the demo.

One consequence worth stating, because it surprised the spec that was written before it ran:
**a rename can now dirty _zero_ pages.** Only the projection is hashed (§3.5), and no bookmark
list renders a note's slug — so renaming a note rewrites four bookmark files and re-indexes them
while leaving every page byte-identical. F15 reported every page dirty for the same write.

---

## 7. Next integration

Verified against this repo's Next 16.1.6 (`next/cache.js` exports `unstable_cache`,
`revalidateTag`, `cacheTag`, `cacheLife`):

- **`React.cache` for per-render dedupe.** This entry used to say "every read opens and closes
  an LMDB env (`readContentIndex.ts:41-58`)". That has been false since **F1** made every
  environment process-cached through `openCachedEnvironment` — §4 and §11.4's standing `grep`
  check are the authority, and this line contradicted both. What `cache()` still buys is
  collapsing the per-render call graph: a page rendering a list _and_ its pagination controls
  asks for the same value twice, and `React.cache` answers the second from memory rather than
  re-entering the read at all. Same shape as
  `websites/portfolio/editor/src/settings/index.ts:1`.
- **`unstable_cache` + `revalidateTag`.** Tags `pagination:<type>:<name>:page:<n>`, `…:head`,
  `…:meta`, plus a catch-all `pagination:<type>:<name>` on every entry. This is the payoff for
  the diff: `handleContentSuccess` fired blanket `revalidatePath(listPath)` for every configured
  list path plus `revalidatePath("/")`; it now also revalidates the dirty tags — for a create,
  just the head and the meta record. Blanket `revalidatePath` is **no longer the default** —
  `paginationOnly` was turned on by F10c and F19c, so the tags carry the invalidation and the
  blanket call is the opt-out rather than the norm. §2 still explains why it defaults off in
  two places (`:117-122`, `:152-160`); those predate F10c and are wrong.

  > **Decided in P2, re-tested under F20 — the tag is expired, not marked stale.** Next 16 made
  > `revalidateTag`'s second argument required. A named cache-life profile (`"max"`) means
  > stale-while-revalidate, and the implementation deliberately does _not_ mark the path
  > revalidated in that case. The adapter passes `{ expire: 0 }`. `updateTag(tag)` means the
  > same thing but throws outside a Server Action, which would shut route handlers and scripts
  > out of the adapter.
  >
  > **Two of P2's premises were incomplete, and F20 (§11.4) corrected them without changing the
  > decision.** First, read-your-own-write does not come from `{ expire: 0 }` at all — it comes
  > from the in-request `pendingRevalidatedTags` bypass
  > (`incremental-cache/index.js:322-331`), which matches on `item.tag === tag` regardless of
  > profile. What `{ expire: 0 }` uniquely buys is marking the _path_ revalidated
  > (`revalidate.js:172`), which is router cache, not data cache. Second, `updateTag` would not
  > have been semantically purer: it writes the identical `expired: now` and meets the same
  > strict `>`, so it moves nothing.
  >
  > That made a non-zero `expire` look viable, and F20 tested it rather than assuming: it is
  > **worse**. A non-zero expire buys a stale-while-revalidate window where there is currently
  > none, turning a sub-second convergence into a guaranteed stale read for the whole window.
  > The seats stay at `{ expire: 0 }`.

- **`generateStaticParams` from meta** (`readPaginationMeta().numberedPages`), not from loading
  the corpus.
- **`force-static` route handlers** for anything new on the export side, per the convention
  documented at `search/version/route.ts`.
- **Forward path:** `cacheComponents` is not enabled in either editor's `next.config.mjs`, so
  `"use cache"` + `cacheTag` isn't usable today. Keeping every cache call inside the adapter
  makes adopting it a one-file change later.

---

## 8. TanStack Query infinite scroll

`@tanstack/react-query` is already mounted at
`websites/recipe-website/common/context/QueryClientContext.tsx` (used by
`SearchForm/SearchContext.tsx`), so this needs no new wiring — only a payload shaped for
`useInfiniteQuery`. `readPage` / `readHead` / `readAfter` all return it:

```ts
interface PaginationPage<TItem> {
  items: TItem[];
  pageIndex: number | null; // null for a cursor read
  headPage: number;
  total: number;
  olderPage: number | null; // -> getNextPageParam
  newerPage: number | null; // -> getPreviousPageParam
  nextCursor: Key[] | null; // [...sortKey, id] of the last entry
  version: string; // specHash + updatedAt
}
```

Scrolling down walks toward older content, so
`getNextPageParam: (last) => last.olderPage ?? undefined` for page-based reads, or
`last.nextCursor ?? undefined` for cursor-based ones. Stable-end anchoring is a real gift here:
pages a reader has already scrolled past cannot change under them, which is the usual failure
mode of infinite scroll over freshly-inserted content.

`nextCursor` covers the one case ids can't — a backdated insert between fetches shifts later
positions, so a bounded reverse read of SORTED from the last item's own key is exact where a
page id would be approximate. It is the _full_ sorted-key suffix `[...sortKey, id]`, not just
the sort key: two items sharing a sort key would otherwise both be skipped on resume.
`version` is the backstop: it changes when the config or corpus changes, letting the client
drop an in-flight query rather than stitch two incompatible snapshots.

### 8.1 What D3 actually shipped: the payload, without the library

The payload above is unchanged — `createPaginatedJsonRoute` serves `PaginationPage` verbatim,
and the `olderPage` / `newerPage` comments still name the react-query methods they were shaped
for. What changed is the client half. `useInfinitePagination`
(`pagination/client/useInfinitePagination.ts`) is **plain React with no query library**, and
this section's opening premise — "already mounted, so this needs no new wiring" — turned out to
be true only of the recipe site.

The demo forced it. `packages/cms/demo` has no `@tanstack/react-query` and no provider, and it
is the first adopter precisely because it proves the engine with the fewest moving parts. Making
the package's first paginated client hook require a query library would have pushed that
dependency onto every future adopter — portfolio at F5 next — to buy dedupe and retry that an
append-only walk of a keyspace does not need. The walk is `olderPage` until it is null; there is
no cache to invalidate and no request to deduplicate beyond a single in-flight guard.

The result shape still mirrors react-query's (`pages`, `items`, `fetchNextPage`, `hasNextPage`,
`isFetchingNextPage`), so an adopter that already has the library can swap it for
`useInfiniteQuery` mechanically.

**Where it lives.** `pagination/client/`, not `pagination/next/` — the latter is server-only
(`cachedReads` reaches for LMDB). No `"use client"` directive, following
`hooks/useCurrentTimezone` and its six adopters across four packages: the package ships React
hooks and the consuming component owns the boundary. `pagination` was already in the package's
`files` list, so nothing about publishing changed.

**One non-obvious thing, recorded because it will bite the next adopter.**
`IntersectionObserver` reports _transitions_. A sentinel that was visible before an append and is
still visible after it never fires again, so on a list short enough that the end stays on screen
the walk stalls after exactly one page — which is exactly what the demo's 14-note fixture does.
`useIntersectionTrigger` takes a `resetKey` for this; pass the loaded page count, and each append
re-attaches the observer, whose `observe()` always delivers an entry for the current state.
Keying it on the hook's own fetching flag looks equivalent and is not: that only works if React
renders the intermediate state, and a fast local response can batch that render away. This was
caught by the demo spec failing on the landing walk while the deep-link walk — one append, so one
transition — passed.

---

## 9. Core API

All functions take one options object with `config`, `paginationConfig` and an optional
`contentDirectory` — the same shape as `readContentIndex({ config, limit, offset, … })` and
`rebuildIndex({ config, contentDirectory })`.

```ts
interface PaginationIndexConfig<
  TIndexValue,
  TKey extends Key,
  TItem = TIndexValue,
> {
  name: string;
  perPage: number;
  /** Ascending / stable order — oldest first. Page assignment walks this. */
  key: (entry: { key: TKey; value: TIndexValue; id: string }) => Key;
  /** Display direction, baked into the PAGED key at write time. Default true. */
  newestFirst?: boolean;
  project?: (entry: { key: TKey; value: TIndexValue; id: string }) => TItem;
  filter?: (entry: { key: TKey; value: TIndexValue; id: string }) => boolean;
  fingerprint?: (item: TItem) => unknown; // defaults to the whole projected item
  version: string; // required — the whole of the spec hash's shape half (F16)
  /** Item id from its content index key. Defaults to the last tuple component. */
  getId?: (key: TKey) => string;
}
```

`packages/cms/pagination/` (core, no Next imports):

| File                         | Contents                                                                                                                                                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                   | the config above, plus `ReadPageOptions`, `ReadHeadOptions`, `ReadAfterOptions`, `ReadPaginationMetaOptions`, `UpdatePaginationIndexOptions`, `WriteSortedEntryOptions`, `PaginationPage`, `PaginationUpdateResult` — mirroring how `content/types.ts` collects its options interfaces |
| `hash.ts`                    | `stableStringify` + `hashValue`; key-sorted so a hash depends on a projection's content, not on the order its fields were written                                                                                                                                                      |
| `database.ts`                | keyspace prefixes, directory resolution, the module-level env cache, `displayRank`/`pagedKey`/`sortedKey`, `computeSpecHash`                                                                                                                                                           |
| `writeSortedEntry.ts`        | phase 1: put/move/delete one item's SORTED entry and lookup                                                                                                                                                                                                                            |
| `updatePaginationIndex.ts`   | phase 2 + the rebuild path, one index; exports the `assignPage` seat                                                                                                                                                                                                                   |
| `updatePaginationIndexes.ts` | all declared indexes via `Promise.all`                                                                                                                                                                                                                                                 |
| `readPage.ts`                | `readPage` (one forward seek), `readHead` (head folded with `headPage - 1`), `readAfter` (keyset), `readItemPage`                                                                                                                                                                      |
| `readPaginationMeta.ts`      | O(1) `{ headPage, total, numberedPages, version }`                                                                                                                                                                                                                                     |
| `readAllIds.ts`              | keys-only walk of SORTED — for `generateStaticParams` over slugs (§11.2/F7)                                                                                                                                                                                                            |
| `syncContentItem.ts`         | **P2** — `syncPaginationIndexes`: the one call the content layer makes after writing an item. Phase 1 for every declared index, phase 2 once, then records the artifact. Returns `[]` and does nothing for a config with no indexes                                                    |
| `changes.ts`                 | **P2** — the dirty-page artifact: `recordPaginationChanges` (merging), `readPaginationChanges`, `clearPaginationChanges`                                                                                                                                                               |

`packages/cms/pagination/next/` is the only place Next is imported, and holds four files:
`tags.ts` (one owner of the tag format), `cachedReads.ts` (`createCachedPaginationReads` →
`readPage`/`readHead`/`readMeta`) and `revalidate.ts` (`revalidatePaginationResults`), all from
**P2**; plus `createPaginatedIndexRoute.ts` from **P3**, deferred out of P2 because a route
factory with no consumer is guesswork. It returns `{ landing, numbered, generateStaticParams }`
from a `reads` object and a `render` function, which collapses an adopter's four route files
(landing and numbered, in the editor and the export) to one line each.

Its `firstPageNumber` option (default `1`) is the single seat where "URLs count from 1" lives.
Internally a page id is 0-based and anchored at the oldest item; the factory adds the offset on
the way out and subtracts it on the way in, so no adopter does that arithmetic and no two
adopters can disagree about it. The param name is fixed at `page`, because the directory name
`[page]` already fixes it. There is no separate `staticParams` helper —
`readPaginationMeta().numberedPages` already _is_ the list.

Pagination configs live in their own module (e.g. `controller/paginationConfigs.ts`) and are
listed on the content config via the optional `paginationIndexes` field; they do not import it
back, so there is no cycle. Key negation for `newestFirst` is internal — authors write the
plain ascending key and never think about it.

> **Decided in P1 — `paginationIndexes` is loosely typed on `ContentTypeConfig`.** Naming the
> config's own `TIndexValue`/`TKey` there puts `TKey` in a function _parameter_ position, which
> makes the whole interface invariant and breaks every `config as ContentTypeConfig` cast in
> the package (nine call sites). It is declared `PaginationIndexConfig<any, any, any>[]`, the
> same escape `referencedBy: ReferenceSpec[]` already uses. The precise types live at the
> declaration site, and `updatePaginationIndex({ config, paginationConfig })` still checks the
> pair when called directly.
>
> Relatedly, `getIndexDirectory` and `getContentDatabase` were narrowed to
> `Pick<ContentTypeConfig, "indexDirectory">` — they only ever read that one field, and naming
> the whole interface pinned them to its _default_ instantiation. Same narrowing, and for the
> same reason, as the one `getUploadsDirectory` already carries a comment about.

---

## 10. Rollout

Each PR on its own branch, fast-forward merged into the working branch, per project convention.
Plan mode is re-entered before each one (§0), and each one leaves this table current.

The P-series built the pagination kind end to end. The D-series builds the dependency substrate
underneath it, then takes the first consumer through both.

| PR      | Scope                                                                                                                                                                                                                                                 | Done when                                                              | Status                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| **P1**  | The core module (§9) + env cache + this document. No consumers.                                                                                                                                                                                       | `test/pagination.test.ts` green (§12.1)                                | **Done** — 26 tests, `ab7a3994`                 |
| **P2**  | Wire into the write path: `createContent`/`updateContent`/`deleteContent`/`rebuildIndex`, the Next adapter, `genericActions` tag revalidation, dirty-page artifact                                                                                    | `packages/cms/demo` pagination spec green (§12.2)                      | **Done** — 38 vitest + 82 demo e2e, `ae4eb8d9`  |
| **P3**  | Recipe index adopts it: `paginationConfigs.ts`, `readRecipePages.ts`, landing + numbered routes, `createPaginatedIndexRoute` (moved here from P2), `Pagination` component on stable ids. Includes the URL renumbering and the empty-trailing-page fix | add-a-recipe rebuild diff touches only the landing page (§12.3)        | **Done** — `ec7cc2b3`, notes below              |
| **D0**  | Reframe: rename this document to `incremental-regeneration.md`, add §1/§2/§6, re-sequence this table, re-bucket §11. Doc only, no code                                                                                                                | the record is true against the code; §12 unmoved                       | **Done** — this PR                              |
| **D1**  | The dependency substrate (§6): borrowed index-value fields, engine-owned async resolution, dependent lookup on write, per-type `ContentWriteResult`                                                                                                   | retitling a note dirties only the demo's bookmark pages that show it   | **Done** — 23 vitest + 90 demo e2e, notes below |
| **D2a** | Featured recipes adopt **borrowed fields** — the first production `references` declaration, the N+1 read deleted, `dependentItemBasePaths` filled                                                                                                     | retitling a recipe updates every featured card, with no snapshot moved | **Done** — 4 new e2e, notes below               |
| **D2b** | Featured recipes adopt **keyspace pagination** — the N-indexes-per-type path, `OffsetPagination` deleted                                                                                                                                              | featured-recipe suites green against an enlarged fixture               | **Done** — 382 e2e, notes below                 |
| **D3**  | Per-page + head JSON route handlers, `useInfinitePagination` hook; **F9**'s toggle rode with it                                                                                                                                                       | infinite-scroll Playwright spec green (§12.4)                          | **Done** — `06eee686`, `469f30d0`, `aaa40055`   |

The F-series models the **second** derived kind, aggregates (F10), and then spends it on the
first user-visible feature the machinery enables, static per-tag pages (F8). Same rollout shape
the P- and D-series used: prove the engine feature in `packages/cms/demo`, then let a production
type adopt it.

| PR       | Scope                                                                                                                                       | Done when                                                                                        | Status                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| **F10a** | Both homepage strips move off `readContentIndex` and onto `recipePages.readHead()` / `featuredRecipePages.readHead()`. No engine change     | every rendered page byte-identical — a moved snapshot is a bug                                   | **Done** — notes below                         |
| **F10b** | The aggregate kind, engine + demo proof: declaration, computation, storage, the did-it-change hash, result plumbing, Next adapter           | `test/aggregates.test.ts` + demo payoff spec green                                               | **Done** — 16 vitest + 7 demo e2e, notes below |
| **F10c** | Recipes adopt it — `getAllTags` reads the aggregate; then settle the `paginationOnly` question against the build output rather than the doc | tag chips and form suggestions unchanged; the flag's status recorded                             | **Done** — 6 e2e, notes below                  |
| **F8**   | `/tags/<tag>` (and possibly `/tags/<tag>/<page>`) as pre-baked static pages; `tagSearchHref` repointed                                      | every tag chip lands on a static page; no visual baseline moves                                  | **Done** — 7 e2e, notes below                  |
| **F19a** | The item-record kind, engine + demo proof: the tag format, the cached by-slug read, the firing seats in `handleContentSuccess`              | `test/itemTags.test.ts` + demo payoff spec green                                                 | **Done** — 19 vitest + 6 demo e2e, notes below |
| **F19b** | Recipes adopt it — `readRecipeItem.ts`, the read call sites move over, the three invalidation seats                                         | the hero and `/featured-recipe/<slug>` follow a description edit                                 | **Done** — 5 e2e, notes below                  |
| **F19c** | `paginationOnly: true` on all three recipe-family success configs; the rebuild actions drop their blanket `revalidatePath`                  | **no rendered output moves** — a moved snapshot is a bug                                         | **Done** — no new tests by design, notes below |
| **F4a**  | `/search/all` splits by consumer; new `search/ingredients`; `filterUsesField`; `getSearchCorpus` withdraws the concurrency the split added  | the unconditional payload measured down, and ingredient search still answers from a cached index | **Done** — 4 e2e + 6 vitest, notes at §12.8    |

The engine-hygiene items in §11.4 are their own series. They share no theme beyond "the record
was wrong or the engine was", so they land one at a time rather than building on each other —
but they are PRs like any other and belong in this table, which claims above to stay current.
F16 → F3 is the one ordered pair: F3's replacement string is baked into a static export, so it
needed F16's build-stable spec hash first.

| PR       | Scope                                                                                                                                                                                             | Done when                                                                                          | Status                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **F1**   | `getContentDatabase` opens through `lmdb/environmentCache.ts`; every engine and test `.close()` site removed in one commit                                                                        | the content index is opened once per process, and nothing closes it                                | **Done** — `912ddd2d`                            |
| **F2**   | `readContentIndex`'s `more` counts returned entries rather than the requested limit                                                                                                               | `test/readContentIndex.test.ts`, two cases failing the old formula                                 | **Done** — 6 vitest, `5b766bfe`                  |
| **F17**  | `commitContentChanges` takes the caller's content directory instead of the ambient one                                                                                                            | the three content writers pass the directory they were given                                       | **Done** — `d8ca75d7`                            |
| **F7**   | `generateStaticParams` walks the SORTED keyspace instead of deserializing the corpus, for two of five routes (a third at F29)                                                                     | identical emitted file list, same count, on two corpora                                            | **Done** — `613ffc09`                            |
| **F20**  | Production mode: the harness never adopts a server it did not build, and the demo suite runs both modes                                                                                           | demo green at 109 in production with retries disabled                                              | **Done** — `1aad0478`…`08f1c3b2`                 |
| **F16**  | `version` required on both config kinds; both spec hashes drop `fn.toString()`; `test/specVersions.test.ts` replaces the net that removes                                                         | an unbumped projection edit fails the version snapshot (§12.1e)                                    | **Done** — 6 vitest, `143bd81e`                  |
| **F3**   | Both `search/version` handlers read `readPaginationMeta().version` instead of `stat`-ing `data.mdb`                                                                                               | two export builds of one commit, corpus re-copied, emit the same string                            | **Done** — no new tests by design, `c2ecb8e4`    |
| **F21a** | `derivedContentPaths(configs)` + a content-type registry per site; all three `.gitignore` writers derive their list                                                                               | the generated body loses no entry any of the three had                                             | **Done** — 9 vitest, `8d01eb4f`                  |
| **F21b** | `revalidateDerivedState(configs)`; all three cache-reset seats — recipe, portfolio and the demo — reduce to one call                                                                              | the fired tag set is a superset of every seat's hand-written list                                  | **Done** — 8 vitest, `504fad8a`                  |
| **F21c** | `rebuildFixtureIndexes({ configs, fixturesDir })`; recipe's script becomes a thin call and portfolio gets its first                                                                               | generic and bespoke produce the same fixtures, within run-to-run noise                             | **Done** — notes below                           |
| **F22a** | `sync.ts`'s private `rebuildRecipeIndex` deleted; it imports the maintained one. The predicted stale-homepage bug measured first                                                                  | red-before / green-after in production, or the hypothesis written down                             | **Done** — hypothesis falsified, notes below     |
| **F22b** | Every `rebuild*Index()` routes through `revalidateDerivedState(configs)`, passing exactly the configs it rebuilt                                                                                  | the featured seat fires no recipe tag, asserted rather than commented                              | **Done** — 4 vitest, notes below                 |
| **F22c** | `scripts/run-sharded-tests.sh --prod`; recipe gets the production gate F20 built for the demo, and the standing flakes get triaged                                                                | a production count recorded, or the runner landed unwired and said so                              | **Done** — 412 prod, notes below                 |
| **F24**  | `openCachedEnvironment` retires an invalidated environment instead of closing it under its readers; the two dead uncached `open()` helpers deleted                                                | two overlapping reads across a directory swap survive, and the retired environment is still closed | **Done** — 5 vitest, notes below                 |
| **F23**  | `flattenMarkdown` recurses into array children, so descriptions and JSON-LD instruction steps survive; `rebuildFixtureIndexes` re-derives every type                                              | a multi-paragraph description is findable in the search corpus, and the fixture script repairs it  | **Done** — 8 vitest + 1 e2e, notes at §12.9      |
| **F4b**  | Spike only: measure whether chunking `/search/ingredients` pays before building it                                                                                                                | a number that justifies the build, or a written deferral                                           | **Deferred** — measured, notes at §12.10         |
| **F26**  | `MAX_INDEXED_DESCRIPTION_LENGTH` 300 → 160, cut at a word boundary; the trade measured on both sides                                                                                              | the unconditional payload measured down, and the cost in search recall written down                | **Done** — 4 vitest, notes at §12.11             |
| **F27**  | Measurement only: what a repeat visit to the corpus documents costs in each serving mode, and whether a cache policy is worth building                                                            | a repeat-visit cost per document per mode, and a written decision either way                       | **Done** — 267 vitest unchanged, notes at §12.12 |
| **F28**  | Measurement only: what one write costs the three derived-state passes at 436 / 1k / 5k / 20k, with D and the largest tag swept on their own axes                                                  | a threshold written as a number for each of F12, F18 and F8b, whichever way it comes out           | **Done** — 267 vitest unchanged, notes at §12.13 |
| **F28h** | `references.ts`'s cache-key separator written as the `\0` escape instead of a literal NUL byte, so the file can be `grep`ped at all                                                               | `grep -c import packages/cms/content/references.ts` is non-zero                                    | **Done** — no behaviour moves, notes at §11.4    |
| **F29**  | Portfolio's `projects` declares `projectsByDate`; `readAllProjectIds` replaces `getProjects()` in the export's `project/[slug]` params (§11.2)                                                    | a project write produces a regeneration set at all, and the emitted file list does not move        | **Done** — 268 vitest, notes at §12.14           |
| **F31**  | Three loose ends too small for a PR each: delete the callerless `getFeaturedRecipes` (a), fix `exportStaticParams.test.ts`'s timeout at the cause (b), repair a doc-truth defect of F28's own (c) | 268 vitest still green with one file no longer near its timeout, and no stale claim left behind    | **Done** — notes at §11.4                        |

**D1's "done when" had to be restated.** It read "a recipe rename dirties only the featured
pages that show it", which is unachievable as written: featured recipes have no pagination
index, so there are no featured _pages_ to dirty until D2b gives them one. D1's scope was engine
plus demo throughout — the same rollout shape P2 used, proving an engine feature in
`packages/cms/demo` before a production content type adopts it — so the bar is restated against
the demo, where it is met exactly.

**What D1 built, and what it left.**

Seven commits, each independently green; the first three are pure refactors. The thunk
conversion lands first and alone because it is the one change that can fail at import time
(§6.1).

- `content/references.ts` — the declaration and resolution layer, plus `borrowedFieldsOf` and
  the `borrowed<T>()` declaration-site helper that keeps the cast in one place.
- `content/updateDependents.ts` — the write-time pass, replacing `updateReferencesViaIndex`.
- `pagination/syncContentItems.ts` — phase 1 for K items in one transaction per index, then
  phase 2 **once**. Phase 2 walks the whole sorted keyspace, so per-item would cost K walks to
  reach a state one walk describes, with intermediate diffs against states no build ever sees.
  `syncPaginationIndexes` is now a one-item delegation to it, so the two cannot drift.
- `rebuildIndex` resolves references per item and **cascades to dependents by default**.

> **Decided in D1 — the rebuild cascade defaults to on.** `rebuildRecipeIndex()` rebuilds
> recipes and nothing else, and it is what `buildExport`, `sync.ts` and the Maintenance button
> all call. A dependent's index value holds fields copied out of another type's data files and
> the content index carries no spec hash, so nothing detects that those copies went stale and
> nothing self-heals. Without the cascade, "rebuild everything" would quietly not, the moment D2a
> lands. That is a deliberate behaviour change for ~10 callers, every one of which is a "make
> everything right" operation. A `visited` set bounds it, since an edge declared from both sides
> is a cycle and this is the only place that walks edges transitively.

**`updateReferences` is kept but no longer called by the engine.** `packages/cms` has no
`exports` map, so its deep paths are public API. `updateReferencesForSpec` now always takes the
file-scan path; `updateReferencesViaIndex` is gone, replaced by the dependent pass.

**The demo proof is bookmarks, not featured recipes.** Deliberately: `notes.ts` already imported
`bookmarkConfig`, so bookmarks importing `noteConfig` back is the exact two-way cycle the thunks
exist for — load-bearing from the first line rather than a latent hazard. Bookmarks gained a
borrowed `noteTitle` and a pagination index of their own, and the homepage renders that title
with zero extra reads: the demo's stand-in for killing `getFeaturedRecipes`' N+1.

That cost the demo its P2 no-op witness (bookmarks were the type with no indexes). Replaced
rather than dropped: the no-index case is asserted in `test/pagination.test.ts`, and the demo now
asserts what only an app can — a bookmark write records nothing under `notes/by-date`.

> **Found in D1 — the dependent pass widens the create path, and a test that
> raced already will start losing.** The demo's `git.spec.ts` "accumulate commits" test clicked
> Create and navigated away without awaiting the redirect, unlike every other test in the file.
> That was always a race — `goto` can abort a server action still running, and the commit is the
> _last_ thing a write does — but it never lost until a note create started scanning the
> bookmarks index for dangling references to backfill. The symptom is a content directory with
> the note on disk and no commit for it, which reads as a git bug rather than a test bug. Await
> the redirect after every write in a suite that then asserts on git.

**Two things D1 changed in the demo that a similar suite will need.** `/test/reset-cache` must
expire _every_ paginated type's catch-all, not just the one that existed first, or the suite goes
back to being run-order dependent (§12.2). And the bookmark form gained slug and date inputs: the
server action already read both, but with no inputs every bookmark took `Date.now()`, so a
generated fixture's sort key depended on how fast the generator ran.

**Why D2 split into D2a and D2b.** The two halves have opposite risk profiles against the same
five specs. Borrowed fields change no URL, no rendered markup and no fixture layout — the cards
already carried `recipeName` and `recipeImage` as props, so D2a's whole safety property is that
**rendered output is byte-identical** and no visual snapshot may move. Pagination adoption
changes all three at once: stable-page ids renumber the URLs, five pagination tests assert
semantics P3 already deleted for recipes, and the fixture has to grow. Landing them together
would have put a snapshot regeneration and a semantics rewrite in the same diff as the index-shape
change, with no way to read a failure as belonging to one or the other. Splitting matches how
P1–P3 and D1 shipped: the risky half alone, provable on its own.

**What D2a built.**

- `featuredRecipeContentConfig.references` — `name` and `image` from the recipe, closing the
  first **production** two-way config cycle. Both entry orders verified (§6.1).
- `FeaturedRecipeEntryValue` gains `recipeName` / `recipeImage`, both optional: a reference can
  dangle, and an index built before the fields existed will not have them.
- `getFeaturedRecipes` drops the `Promise.all` enrichment block and the `getRecipeBySlug` import
  entirely. `MassagedFeaturedRecipeEntry` keeps its shape, so nothing downstream changed.
- Both recipe success configs fill `dependentItemBasePaths: { "featured-recipes": "/featured-recipe" }`.
- `build-fixture-pagination.ts` → `build-fixture-indexes.ts`, with a featured-recipes branch
  calling `rebuildIndex({ cascadeDependents: false })`. Only the two featured fixtures' indexes
  changed; the recipes branch is untouched.
- One engine change, forced by the one below: `updateDependents` now skips a dependent spec whose
  data directory does not exist.

> **Found in D2a — opening a dependent's index _creates_ it, and that is a side effect on a git
> repository.** The first production `references` declaration turned `updateDependents`' gate on
> for every recipe write, and the pass opened the featured-recipes environment before it knew
> whether any featured recipe existed. `getContentDatabase` creates what it opens, so a content
> directory that had never held a featured recipe grew an untracked `featured-recipes/` after any
> recipe write — and a content directory is a git repository. `git.spec.ts`'s five remote-sync
> tests went red: the untracked directory left the repo dirty and the Git UI in its
> uncommitted-changes state, so the Push button never rendered. Verified against base (26/26
> green there, 5 red with D2a) before diagnosing, which is the only way this reads as a
> regression rather than as the container's standing flake pool.
>
> The fix is a `pathExists` on the dependent's data directory _before_ the open: no data
> directory, no items, nothing that can borrow. It is also the cheap half of F18 — a corpus with
> no featured recipes now costs one `stat` per recipe write instead of an environment open and a
> full index scan.
>
> **The general lesson for the next content type that adopts `references`:** the dependent pass
> is not free and not inert on a corpus that has none of the dependent type. Anything it opens,
> it creates.

**What D2a deliberately left, and D2b took.** The featured-recipes _list_ routes read
`readContentIndex` rather than a pagination keyspace, so they had no tag and relied on the blanket
`revalidatePath` — D2b's keyspace is what made them precise, not another `listPaths` entry. This
was invisible
rather than merely untested: a production build of the editor renders **every** route `ƒ`
(server-rendered on demand), because next-auth in the layout reads cookies, and the export app is
`output: "export"` and rebuilt wholesale. So `dependentItemBasePaths` is belt-and-braces in the
editor too — it is the correct declaration of where dependents live, and it is what a
partially-static deployment would need, but neither app can currently serve a stale featured page
for it to save.

**What D2b built.** `featuredRecipesByDate` beside `recipesByDate` with a `FeaturedRecipeListEntry`
row type, `readFeaturedRecipePages.ts` at module scope, a `routes.tsx` collapsing all four route
files to re-exports, `FeaturedRecipeIndexPageWrapper` on `PaginationPage` and `RecipePagination`,
and the three invalidation seats. Deleted: `OffsetPagination`, `FeaturedRecipeIndexPage/index.tsx`,
`FirstFeaturedRecipeIndexPage.tsx`, and the long-dead `FeaturedRecipesPage`. Gate: 382 container
e2e across two sequential shards, 0 failed; 158 vitest; both apps built, the export against a
1-item featured corpus as well as the 40-item one.

The projection is exactly what `FeaturedRecipeListItem` destructures, and `recipeName`/`recipeImage`
are in it **only because D2a borrowed them**. A pre-baked page is projected once, at write time,
from the index entry alone — so a card that needed a `recipe.json` read per row could never have
been paged at all. That is what D2a was for, and it makes featured recipes the first content type
carrying both `references` and `paginationIndexes`: a recipe write now cascades into a dependent
that maintains its own keyspace, `updateDependents` → `syncPaginationItems` running phase 2 once
for K dependents.

> **D2b's safety property is the inverse of D2a's, and that is the point.** D2a's guarantee was
> byte-identical output, so any moved snapshot meant a bug. D2b changes what the landing shows on
> purpose: at `perPage` 12 the 15-item fixture has `headPage` 1, so the landing folds pages 1 and 0
> and renders **all 15 cards** where the offset landing rendered 12. `featured-recipes-page1.png`
> was regenerated and read, not just accepted; `featured-recipes-page-2.png` was deleted, since a
> 15-item corpus has no page 2 any more. The check that this was the _only_ surface that moved is
> that every other visual baseline held on the regeneration run.

**Two live invalidation gaps found while wiring the same seats.** Both are one-liners, and neither
was introduced by D2b:

- **`rebuildRecipeIndex()` never expired `recipePages.tags.all`** — a P3 gap. It fired only
  `revalidatePath("/")`, which does not touch `unstable_cache` tags, so a rebuild reprojected every
  page and the site went on serving the pre-rebuild ones. Worst on the git branch-switch path,
  where `rebuildRecipeIndex` is _how_ the whole corpus is meant to change over. Both rebuilds now
  expire both keyspaces (the recipe rebuild cascades into featured recipes since D1).
- **The production `initializeContentGit` never ignored `featured-recipes/{index,pagination}`** —
  the Playwright harness writes its own `.gitignore`, so nothing went red, but a real content repo
  would have committed LMDB binaries. §13's ignore list is the authority; the two writers of it had
  drifted apart.

**The fixture work, and it was more than a fixture.** `many-featured-recipes` is 15 items at
`perPage` 12 (`FeaturedRecipeIndexPage/constants.ts`), which under stable-end anchoring gives
`headPage` 1 — the fold covers the whole corpus and `numberedPages` is **empty**, so there was no
numbered route left to test at all. `many-featured-recipes-paged` is the dedicated 40-item corpus:
every one of `many-recipes`' recipes featured once, `feature-01` … `feature-40`, dated one per day
from 2024-03-01, giving `headPage` 3, a landing folding 16, and numbered routes
`/featured-recipes/1` and `/2`.

> **Decided in D2a's planning pass and carried out here — a dedicated fixture rather than growing
> the shared one.** Four other specs read `many-featured-recipes` (`search`, `visual`,
> `accessibility`, `mobile`), `search.spec.ts` asserts the first hit for "Recipe 5" is exactly
> "Recipe 5" — at risk in a 40-item corpus — and D2a's own borrowed-fields tests hardcode
> `FEATURED_ON_BOTH = "recipe-12"` against the 15-item layout. Built from `many-recipes` by
> featuring its 40, rather than creating 80 items through the UI.

Two things the generator had to do that the older one does not: set an **explicit slug and date**
on every feature, because the default slug derives from the wall clock at second granularity and
collides at 40 while leaving the ordering non-deterministic; and `test.setTimeout(900_000)`, since
40 UI round-trips are well past the default. The 15-item generator's trailing `→` assertion was
also stale — it predates the control it was written against — and is now a card count.

`featured-recipes.spec.ts`'s five pagination tests asserted semantics P3 had already deleted for
recipes (`aria-current="page"`, "Go to next page", `/featured-recipes/1` redirecting to the
landing) and were rewritten against `recipes-pagination.spec.ts`'s shape: landing fold, per-page
contents, exact-cover union, 404s, the Newer/Older walk, page numbering, and the thesis test. Under
stable ids `/featured-recipes/1` is the _oldest_ page, and on a 1-item corpus it **404s** rather
than redirecting.

> **A public detail page renders the footer's Sign In button, not the sign-in form.** The thesis
> test's `fillSignInForm` timed out on an Email field that was never there; `signIn` clicks the
> button first. Cost one shard re-run. Every _authenticated_ route renders the form directly, which
> is why the rest of the suite gets away with the shorter helper.

The dirty-page artifact is now gitignored under `playwright/fixtures/test-content/`. `rebuildIndex`
and the multi-item write path both drop a `.pagination-changes.json` into the content directory, so
`copyFixtures` sweeps it into whatever fixture is being generated — and it carries a wall-clock
`updatedAt`, so committing it means a spurious diff on every regeneration. The demo's fixtures are
the deliberate exception: its specs assert on the file directly.

**What P2 built, and what it left for P3.**

The write path has exactly five functions that touch the content index, all in
`packages/cms/content/`: `createContent`, `updateContent`, `deleteContent`, `rebuildIndex`,
`updateReferences`. That is the complete seam — no app code writes the index directly. Every
one of them now keeps pagination in step, and all of them do it _after_ the content index
environment is closed, because the rebuild path inside phase 2 opens that environment itself.

- `createContent` / `updateContent` / `deleteContent` call `syncPaginationIndexes`, and their
  return type changed from `Promise<void>` to `Promise<ContentWriteResult>`
  (`{ pagination: PaginationUpdateResult[] }`). Every pre-existing caller ignores the value, so
  this is non-breaking; `genericActions` needs it to know which tags to fire.
- `rebuildIndex` calls `updatePaginationIndexes({ force: true })`. This is what gives a fresh
  checkout its pagination indexes — its ~10 callers (`exportAction.ts`, `sync.ts`, the seed
  scripts) all inherit it unchanged.
- A slug rename forces a full pagination rebuild of each _referencing_ type — F15, now D1's §6.

**`force` is new API surface P2 had to add.** `rebuildIndex` drops and re-derives the content
index without touching the sorted keyspace, and `updateReferences` writes content index entries
directly. After either, meta still matches a spec hash that vouches for nothing, so phase 2
alone would walk stale entries. The caller knows the index is untrustworthy; the index does not.

> **Decided in P2 — `rebuilt` forces the meta write.** P1's rule that a no-op pass writes
> nothing at all held because every path to a rebuild also made meta stale. A _forced_ rebuild
> of an index that turns out to be current breaks that: `rebuildSortedKeyspace` raises
> `rebuildInProgress` and only the final transaction lowers it, so skipping the transaction
> would leave the index permanently mid-rebuild, rebuilding itself on every subsequent pass
> forever. Only an empty index actually reaches this — a rebuild drops the page summaries, so a
> non-empty one always reports every page dirty — but it is a real, reachable state.
>
> That last point is worth stating on its own: **a rebuild has no diff source, so it reports
> every page dirty.** This is exactly why `rebuilt` maps to the index's catch-all cache tag
> rather than to page tags.

**Safety property.** A content type that does not declare `paginationIndexes` gets `[]` back
from `syncPaginationIndexes` having opened nothing and written nothing. P2 is therefore a
behavioural no-op for every existing content type in the repo; the demo's notes are the only
thing that opts in, and the demo's bookmarks stay out precisely so the suite keeps proving it.

**`paginationOnly` is off by default.** `genericActions` now fires
`revalidatePaginationResults` alongside the existing blanket `revalidatePath` calls, and only
skips the blanket ones when `ContentSuccessConfig.paginationOnly` is set. Nothing sets it — and
P3 still does not, though it did narrow `listPaths` to empty for recipes; see the P3 notes
below. Narrowing revalidation is proven per content type, with each site's Playwright suite as
the safety net — not assumed, because a surface still reading through `readContentIndex` has no
tag to be told about. In §2's terms: `paginationOnly` can only go on once _every_ derived kind a
site serves produces a regeneration set, not just the pagination one.

**Phase 1 and phase 2 stay separate calls** on purpose. Batching several item writes before a
single phase 2 is correct and cheaper; calling phase 2 per item is also correct, just wasteful.

**What P3 built, and what it left.**

The recipe index is the first real adopter: `recipesByDate` in
`common/controller/paginationConfigs.ts`, `recipePages` in
`common/controller/data/readRecipePages.ts`, and all four route files reduced to a re-export of
`createPaginatedIndexRoute`'s output. The offset walk and the full-corpus
`generateStaticParams` are both gone.

> **Decided in P3 — URLs are 1-based, the number displayed is the stable id plus one, and the
> landing has no number.** Page ids count from the oldest item so a create moves nothing, but a
> URL starting at 0 is unidiomatic, so `firstPageNumber` (§9) offsets it once for everyone.
> `/recipes/1` is therefore the _oldest_ page rather than an alias for the landing, and the
> `pageNumber === 1 → redirect` branch is deleted. The landing prints no number at all: it sits
> on the head, whose id moves every time the head seals, and a number that moves would break the
> only promise the number makes. Relative "Newer"/"Older" controls are the prominent
> affordance. No surface prints a global total (§3.2's constraint).

> **Decided in P3 — the recipe projection carries five fields, not nine.** A list row renders
> `slug`, `date`, `name`, `image`, `tags`; `getRecipes` also drags `description`, `ingredients`
> and the three times through for the _search_ corpus. Only the projection is hashed (§3.5), so
> anything left out of it can never dirty a page — editing a description now moves no numbered
> page at all. Note the `date`: it lives in the content index _key_, not the value, so both
> `key` and `project` read it from `entry.key`.

**Recipes narrow `listPaths`, but do not set `paginationOnly`.** Both success configs drop
`/recipes` and `/recipes/[page]` to `listPaths: []`, handing those two surfaces to the
pagination tags. `revalidatePath("/")` still fires, because the homepage's newest-six strip and
the recipe form's tag cloud (`getAllTags`) both still read the whole content index and have no
tag to be told about. Flipping `paginationOnly` on is blocked on F10 (§11.1) — the aggregate
kind, of which those two readers are the repo's clearest examples.

**A test harness that rewinds content must expire pagination tags.** Same trap the demo hit
(§12.2): `resetData` rolls the content directory back to a fixture, which is not a write, fires
no tags, and leaves the server serving pages cached from the previous fixture.
`/settings/test-invalidate-cache` was `revalidatePath("/", "layout")` and nothing else —
`revalidatePath` does not touch `unstable_cache` tags — so it now also expires
`recipePages.tags.all`.

> **Any new tagged read needs three seats, not two**, and the third is the one that gets
> forgotten: the write config, `/settings/test-invalidate-cache`, and **every `rebuild*Index()`
> action**. Each kind has added the same three — pagination at D2b, the aggregates at F10b/F10c,
> and the item catch-all at F19b. The rebuild seat matters most on the git branch-switch path,
> where `rebuildRecipeIndex` _is_ how the corpus changes over: without it, everything cached under
> the old branch survives the checkout.
>
> **As of F22, none of the three is hand-written any more.** The first derives from the content
> config, which is where a `paginationIndexes` or `aggregates` entry is declared; the second and
> third both call `revalidateDerivedState(configs)`, the second passing the site's registry (F21b)
> and the third passing the configs that seat actually rebuilt (F22b). So the rule above still
> names three places a new tagged read has to reach, but reaching them is now a consequence of
> declaring the read rather than a list to remember — which is the whole of what F21 and F22 were
> for. What still needs saying out loud is the _difference_ between the second and third: a repair
> seat wants everything, a rebuild seat wants what it rebuilt, and `revalidateDerivedState` takes
> a list precisely so the two can say different things.
>
> The item kind is the first that needs **nothing** in the first of those seats. A pagination
> index and an aggregate are declared on the content config; an item tag's only coupling is the
> content type string, so `handleContentSuccess` fires it generically and a type opts in purely by
> reading through `createCachedItemRead`.

**Every existing fixture needed the keyspace built.** A Playwright fixture is a content
directory captured on disk, LMDB files and all, and reads do not self-heal an unbuilt index — so
the fixtures generated before recipes declared one served an empty `/recipes`. Only one test
caught it (the homepage's "more recipes" link), because the rest assert a 200 and a banner,
which an empty state satisfies. `editor/scripts/build-fixture-indexes.ts` walks the fixtures and
runs `updatePaginationIndexes({ force: true })` over each; the resulting `*.mdb` files are
committed exactly as `recipes/index` already was. Run it whenever a `paginationIndexes` entry is
added or changed — and, since D2a, whenever an index _value_ changes shape, which its
featured-recipes branch repairs with `rebuildIndex` instead. The same hazard applies to a live
content directory, which is what `rebuildRecipeIndex()` in `exportAction` and the Maintenance
rebuild button cover.

**Content repositories gitignore the pagination directory.** `initializeContentGit` runs
`git.add(".")`, which would otherwise sweep the LMDB binaries and `.pagination-changes.json`
into the initial commit. Content _writes_ were never at risk: they stage explicit paths, and the
`git add "./*"` fallback does not match dotfiles (see `changes.ts`).

**What F10a built.** Both homepage strips read the pre-baked keyspace. The two `page.tsx` files
became one-line re-exports of a shared `Homepage/route.tsx`, the same shape `RecipeIndexPage`
already used for the routes the editor and the export share — one authority for the two details
below, rather than the same subtlety duplicated in two apps.

- **`moreRecipes` comes from `PaginationPage.total`, not from `readPaginationMeta`.** Reading
  meta here would have handed back most of the precision the head tag just bought: the meta tag
  moves on nearly every write, while `total` cannot change without the head page being dirty, so
  the head-tagged entry is always fresh. It is also a small correctness win over the `more` it
  replaces, which F2 records as broken for reads that do not bound themselves.
- **Slice, then filter.** `getFeaturedRecipes({ limit: 6 })` took six and _then_ dropped entries
  with a dangling reference, so the strip could render fewer than six. Filtering before slicing
  would silently pull a seventh entry forward and change what the homepage shows.

**The trade is more rows read for a cache tag, and it is worth it.** `readHead` returns
`perPage + 1` to `2 * perPage` rows — up to 24 — to serve six. That is more than
`getRecipes({ limit: 6 })` read, but it is one forward range seek either way, against a
process-cached environment rather than one `readContentIndex` opens and unmaps per call (F1).
The point is the tag: `readContentIndex` carries none, so before this the strips were invalidated
by nothing but the blanket `revalidatePath`.

**Its safety property is D2a's, not D2b's.** The strips' _contents_ do not change, so any moved
output is a bug rather than an expected diff. Verified by building the export against
`many-featured-recipes-paged` before and after and comparing all 92 rendered pages: **none
differ**. That comparison needs §12.3's normalization plus two more sources of noise found while
running it — CSS-module class names carry build hashes, and the _number_ of inline `<script>`
tags varies between builds of identical content. A control build of the unchanged tree against
itself is what proves the normalization is complete; without it the check reports ~22 files and
means nothing.

**What is left on the untagged readers.** `getRecipes` now has three callers — `getAllTags`
(F10c), the search corpus routes (F4; two of them since F4a split `search/all` and
`search/ingredients`, both mapping the same read), and the export's `recipe/[slug]`
`generateStaticParams` (F7); `getFeaturedRecipes` has one, the export's `featured-recipe/[slug]`
params. The homepage's
only remaining full-corpus read is `getAllTags`, which is what F10c takes.

**A third `.gitignore` writer exists, and it is stale.** §13 names two. There is a third: the
committed bundle at `editor/playwright/fixtures/git-test-content/test-git.bundle`, whose
`.gitignore` is only `/transformed-images` and `/recipes/index` — missing `/recipes/pagination`,
both featured-recipes lines and `/.pagination-changes.json`. Latent, not triggered: the specs
that load it (`git.spec.ts:407`) only read the git log and never render a page that opens a
pagination environment. Left alone deliberately rather than regenerating a binary fixture inside
a mechanical PR — but it is the exact shape of the D2a failure, and whoever writes a bundle spec
that visits a content page will meet it.

**What F10b built — the second derived kind.** `AggregateConfig` on `ContentTypeConfig`, a
`<type>/aggregates/<name>/` environment holding one record, `updateAggregates`, `readAggregate`,
and a Next adapter of one tag and one cached read. `ContentWriteResult` gains `aggregates`
beside `pagination` and `dependents`, and so does `DependentWriteResult`.

**The fold reads the content index, not a pagination projection.** This was the design question
worth settling. Phase 2's walk already visits every SORTED entry with the projected item in hand
(`updatePaginationIndex.ts:203-222`), so an aggregate could have ridden along for free. It does
not, and the extra O(N) walk per write is the price:

- riding along means threading a fold callback through phase 2 and coupling the two modules,
  when `updatePaginationIndex` currently returns a summary rather than its entries;
- it would restrict aggregates to _projected_ fields, and to content types that happen to
  declare a pagination index.

Both restrictions bite immediately. The demo's tag aggregate folds `NoteIndexValue.tags`, which
`NoteListItem` deliberately does **not** project — precisely so a note's tags cannot dirty a page
that never renders them. Under the ride-along design that aggregate could not exist without
widening the projection and giving up that property. §3.7 prices the second walk as milliseconds
at this corpus size, and it is in any case strictly better than the once-per-render it replaces.

**One walk serves every aggregate a type declares**, so the second one is nearly free; only the
first pays for the pass.

**`changed` is the whole kind.** A pagination page reports _which_ pages moved; an aggregate has
no pages, so the only useful question is whether the value moved at all — and for a tag cloud the
answer is almost always no. The pass recomputes unconditionally, hashes, and compares. Two
consequences worth stating because they are easy to get wrong in the other direction:

- **There is no `force`, and that is a design statement rather than an omission.** Phase 2 needs
  one because it trusts its own sorted keyspace, which a content rebuild can invalidate behind
  its back. An aggregate pass trusts nothing: it re-reads the corpus and re-folds it every time,
  and compares the _result_. So a rebuild and an ordinary write take the same path, and an
  aggregate whose value survives a rebuild reports `changed: false` and fires nothing — the
  honest answer, and the one F12's incremental reconciliation will want.
- **A spec-hash bump is not a change either.** Bumping `version` rewrites the record so the new
  hash is stored, but the value a reader would render is identical, so no tag fires.
- **A pass that moves neither value nor spec writes nothing at all**, `updatedAt` included, so
  nothing downstream can tell that a no-op pass ran.

**One seat runs both kinds.** `syncPaginationItems` now runs pagination's two phases and then the
aggregate pass, and returns `SyncDerivedResult` — one list per kind. The three write paths and
the dependent cascade therefore picked up the new kind by doing nothing. Adding the call to five
sites instead would have made "did we remember it everywhere" a standing question. The aggregate
pass runs **after** phase 2, not beside it: both open the content environment, and
`syncContentItems.ts:25-26`'s sequencing note is exactly about that.

**Found while writing the demo spec, and not caused by aggregates: the demo serves one stale read
after a tag expiry.** After `revalidateTag(tag, { expire: 0 })`, the _first_ subsequent read of
that entry can return the previous value and refresh behind it; the second is fresh. `/notes/browse`
does it too — measured, same shape — so this is a property of the demo's `unstable_cache` setup,
not of the new kind. Every existing spec is blind to it because they all issue some other request
between a write and the assertion. `aggregates.spec.ts` absorbs it explicitly in one helper rather
than sprinkling retries, so its assertions stay strict. Worth knowing before writing any spec that
asserts on a cached surface immediately after a write.

**The `.gitignore` lines are in before recipes need them.** `/recipes/aggregates` and
`/featured-recipes/aggregates` are listed in both writers now, though no recipe type declares an
aggregate until F10c. §13's trap has fired twice already — once at D2a, once at D2b — and naming
a path that does not exist yet costs nothing. The demo's own `initializeContentGit` writes no
ignore list at all, which is pre-existing and unrelated.

**What F10c built.** `recipeTags` on `recipeContentConfig`, `readRecipeTags.ts` beside
`readRecipePages.ts`, and `getAllTags` reimplemented as one O(1) key read. Four call sites
unchanged in shape: the homepage's `BrowseChips` and the tag suggestions in the new, edit and
copy forms. `RecipeEntryValue` already carried `tags` for the search corpus, so this was **not**
an index-shape change and forced no rebuild — the fixtures only had to gain the aggregate record,
which is why `build-fixture-indexes.ts` gained an `updateAggregates` call rather than a
`rebuildIndex` one.

`getAllTags` lost its `contentDirectory` parameter rather than keeping one that no longer works.
The cached read binds the directory at module scope because it is also part of the cache key, and
all four call sites already passed nothing; a parameter that silently had no effect would be
worse than none. Anything needing a different directory calls `readAggregate` directly.

### `paginationOnly` — settled at F10c, turned on at F19c

The section below is F10c's, kept as written because its three findings are still the reasons that
matter; the note at its end records the flip. The flag was **still off** at F10c, but not for the
reason recorded until then. Three findings, all checked
against the build output rather than assumed:

**1. F4 does not block it.** `revalidatePath("/")` never covered `/search/all` or
`/search/version` — they are separate route paths, and nothing calls `revalidatePath` on them. The
search corpora are stale-or-not entirely independently of this flag. With `listPaths: []` on all
four success configs, `paginationOnly` controls exactly one call: `revalidatePath("/")`. **The
gate is therefore "what does the homepage still read untagged", and nothing else.**

**2. The hero is what blocks it, and §11 never named it.** `Homepage/index.tsx` picks the newest
featured recipe (or the newest recipe) and calls `getRecipeBySlug` on it, reading that recipe's
whole data file to render `HeroBench`. Editing that recipe's description changes what the hero
renders and fires nothing, because no index value projects a description. It is an **item-page
dependency embedded in a page whose URL is `/`**, so `revalidatePath(itemBasePath + "/" + slug)`
cannot reach it. After F10a moved the strips and F10c moved the tag cloud, it is the only untagged
reader the homepage has left — and it is not an aggregate, a pagination page, or a corpus
document, so §2's four kinds do not have a box for it.

**3. Flipping it would be close to unobservable today anyway.** A production build of the editor
renders `/` as `ƒ` — next-auth reads cookies in the layout — so there is no Full Route Cache entry
for `revalidatePath("/")` to drop. The export is `output: "export"` with no server, so it never
runs at all. Turning the flag on would be a declaration of correctness for a deployment that does
not exist yet (a partially-static server, or §11.3's build consuming the artifact), not a win that
anything could measure.

So it stays off, with the reason now _declared_ on both success configs rather than inherited from
a stale comment. Covering the hero is a small, well-shaped follow-up — an item-scoped cache tag on
`getRecipeBySlug`, fired by the write path that already knows the slug — and it is the last thing
between recipes and a genuinely precise write.

> **Now on, as of F19c.** The hero's read is tagged, so the homepage has no untagged reader left.
> `homepageRoute` reads exactly four things, and every one of them carries a tag the write path
> fires when it moves them: `recipePages.readHead()` and `featuredRecipePages.readHead()` (head
> tags, P3 and D2b/F10a), `getAllTags()` (the aggregate tag, F10b/F10c) and
> `recipeItems.read(heroSlug)` (`item:recipes:<slug>`, F19). The flag is set on all **three**
> recipe-family success configs — a comment on the recipe config used to say four, and there are
> three: recipe success, recipe delete, featured success.
>
> **Finding 3 above is the one to keep, and it is why this is a declaration rather than a result.**
> Nothing observable changes. `/` is still `ƒ` in the editor and the export still has no server, so
> there was no Full Route Cache entry for the removed `revalidatePath("/")` to drop. Its safety
> property is D2a's — **no rendered output may move** — and none did: 401 container tests green
> with not one visual baseline regenerated, which is the whole evidence that the flag only removed
> an invalidation other tags already covered. What changed is that the record is true: the write
> path is precise, instead of precise plus a blanket call kept for the one reader that had no tag.
>
> **The two `rebuild*Index()` actions dropped their `revalidatePath("/")` too**, for the same
> reason and with the same argument available: their tags cover every homepage reader. The
> featured one also dropped `revalidatePath("/featured-recipes")`, which its head tag has covered
> since D2b. A rebuild is still the explicit repair-everything button — it just repairs through
> tags now, which is the only thing that ever reached `unstable_cache` anyway.
>
> One case is worth knowing because the flag makes it load-bearing: `featuredRecipeEditorConfig`
> has **no `deleteSuccessConfig`**, so deleting a feature runs through `successConfig` and
> redirects to `/`. With the flag on, the featured head tag alone has to carry the homepage there.
> `featured-recipes.spec.ts:237` already asserted exactly that, and still passes.

**What F8 built — and what it deliberately did not.** `/tags/<slug>` and `/tags` as pre-baked
static pages, served from a second aggregate (`recipesByTag`) that maps each slugified tag to the
recipes carrying it. `tagSearchHref` repoints to `/tags/<slug>`, which moved every tag chip in the
app at once — the recipe detail page, the list cards, and the homepage's browse row — because it
was already "the canonical link into a tag-filtered search, used by every deep link".

**It is unpaginated, and that is a scoped trade rather than an oversight.** A single aggregate
holding every tag's list is a single cache entry: a write that changes any tag's contents
invalidates every tag page, and the value grows as `recipes x tags-per-recipe`. That is the
**corpus-document** shape of §2, not the precise one. It was chosen because it delivers the whole
user-visible feature with no engine change, and because the corpus is nowhere near needing more —
the richest tag in `search-corpus` carries **three** recipes against a `perPage` of twelve.

It is also a large improvement on what it replaced rather than a regression: `?q=tag:<tag>` needed
the client search bundle and a full corpus load to render anything at all, and could not be
indexed by a crawler.

### F8's real engine cost, for when a tag outgrows one page

§11.1 framed the choice as "index-per-tag vs one index keyed `[tag, date, slug]`", as though both
were config declarations. **Neither is**, and this is the correction that entry has earned:

- `PaginationIndexConfig.key` returns **one** `Key` per item, and `[LOOKUP, id]` is strictly
  one-to-one. A recipe with three tags must occupy three positions, so the single-index option
  needs a **fan-out** in phase 1 — a new capability, not a new config value.
- Phase 2 assigns positions by walking the whole SORTED range and counting. With a `[tag, …]` key
  those positions run continuously across tag boundaries, so appending to tag `a` would shift
  every position in tags `b`…`z` — **every page dirty on every write**, the exact failure §3.1
  exists to prevent. The single-index option therefore also needs **partitioned page assignment**,
  with `headPage`/`total`/meta per partition.
- Index-per-tag avoids both, but `paginationIndexes` is read statically off the config on every
  write, so a per-tag list would have to be derived from the tag aggregate at write time — and a
  brand-new tag would create an LMDB environment mid-write. It also orphans a directory per tag
  that goes empty, with no lifecycle to remove it.

The tractable design is **one index partitioned by a leading key component** (`partitionsOf?:
(entry) => Key[]`, multi-valued). Because the partition leads the key, one forward walk still
visits each partition contiguously and in ascending order — phase 2 stays a single walk and just
resets `position` at each boundary, so §3.6 survives verbatim. An index that declares no
`partitionsOf` writes today's keys byte for byte, which is the safety property that makes it
adoptable. Filed as **F8b**; it is also F11's key-buckets (`/recipes/2026/03`) arriving early,
since those are the same feature with a different `partitionsOf`.

**Slugs, decided here.** Tags are free text — `normalizeTag` lowercases and collapses whitespace
but leaves spaces, slashes and punctuation, none of which can be a static export path segment. So
the aggregate keys on `slugify(tag)` and the **display label travels with the stored entry**,
because `slugify` cannot be inverted. Two tags that slugify alike merge onto one page, first label
seen wins; rare, harmless, and cheaper than threading a disambiguator through every link.
`tagSlug` is its own tiny module rather than a field on the aggregate config, so a client
component can build a link without importing a server-side config.

**Both export guards hold.** Against `search-corpus` the build emits all eight tag pages
statically; against `many-recipes`, which has **zero** tags, `generateStaticParams` returns one
placeholder and the route `notFound()`s it — §12.3's rule that `output: "export"` rejects an empty
param list, not just a missing function.

### What F16 built, and the trade it is

The engine change is four lines removed and one type modifier: `version` is required on
`PaginationIndexConfig` and `AggregateConfig`, and `computeSpecHash` /
`computeAggregateSpecHash` no longer touch `fn.toString()`. §4 records why the alternatives
(keep the derived form as a fallback, or gate it on `NODE_ENV`) both preserve the exact dev/prod
split being fixed.

**Making it required broke nothing outside `test/`, which is how the decision got made.** P2 left
this open because "neither option is obvious"; what settled it was counting callers rather than
reasoning about defaults. All seven real configs already declared `version: "1"`, each with a
comment explaining the hazard — four pagination (`recipesByDate`, `featuredRecipesByDate`,
`notesByDate`, `bookmarksByDate`) and three aggregate (`recipeTags`, `recipesByTag`, the demo's
`noteTags`). The only configs relying on the automatic form were inline test fixtures, which is
exactly where the churn belongs. Those seven comments are now wrong in a specific way and were
rewritten: they described the pin as overriding an automatic form that no longer exists.

**One test in `test/pagination.test.ts` asserts the new rule's unwelcome half.** "Does not
rebuild for an edited projection at the same version" is a test that an engine bug would pass —
which is the point. Before F16 that behaviour was a defect; after it, it is the price of a
build-stable hash, and writing it down as an expectation is what stops someone re-deriving the
old design from first principles when they hit it. The catch moved out of the engine and into
CI, and §12.1e is where it lives.

**It changes no current behaviour, and the plan for it predicted otherwise.** The stated proof
was "build the recipe export twice and confirm no pagination index rebuilds on the second, since
the dev-generated fixtures force one on every production read." That premise was already false:
`recipesByDate` has pinned `version: "1"` since P3 for exactly this reason, so nothing in the
repo was on the automatic path and no build was paying for it. Measured rather than assumed —
the post-F16 `computeSpecHash` was run against the stored `specHash` in all **14** on-disk
pagination environments under `websites/recipe-website/editor` (twelve Playwright fixtures, the
editor's `test-content`, and one empty pair), and every one matches at `5ce41d14cd842474`. Zero
mismatches is the result that matters: no existing content directory is forced into a rebuild by
the upgrade.

**So what F16 bought is that the hazard cannot come back by omission.** The pins were the fix;
they were also seven comments and a hope that the eighth config's author would read one of them.
A required field moves that from convention to a compile error, and `test/specVersions.test.ts`
covers the failure the pins never could — declaring a version and then editing the projection
under it.

It is also a prerequisite for F3: deriving the search version from pagination meta bakes
`specHash` into a `force-static` route, and a required `version` is what guarantees that string
is a function of the declared config rather than of which bundler last touched it.

Everything below is a follow-up, sequenced but not scoped here.

---

## 11. Follow-up map

A survey of every surface in the repo that is paginated, or reads a whole corpus and shouldn't.
Each is a candidate PR; none block the rollout above. Each gets its own planning pass when
picked up (§0), and anything a phase discovers gets added here rather than lost.

The buckets are by **derived kind** (§2) rather than by where the code lives, because that is
what determines whether an item needs new design or just an adopter.

### 11.1 Derived kinds not yet modelled

These need design before code: each is a kind whose invalidation shape is undefined, so none of
them can produce a regeneration set today.

**F4 — chunk the search corpora (corpus documents).** Four route handlers each serialize an
entire corpus into one JSON: `recipe-website/{editor,export}/…/search/all/route.ts` and
`portfolio/{editor,export}/src/app/search/all/route.ts`. Paginated chunks are individually
cacheable and individually invalidated, and stable-end anchoring makes this markedly better than
it would have been — a client's cached chunks stay valid as new content arrives, since only the
head chunk ever changes. Content-defined chunking (§3.6) is the natural strategy here, since
chunk boundaries should not move when an item is inserted. This is the single largest payoff
outside the index pages themselves.

> **Finding, from the pass that deferred it (F16/F3).** F5's entry below cites "F4's deferral
> finding" as a known shape; it was never actually written down. It is this, and it has two
> halves.
>
> **There are no cold-load bytes to cut at this corpus size.** `/search/all` against the
> 67-recipe `search-corpus` fixture serializes to **6,468 bytes — 6.3 KiB** (measured by
> applying `getRecipes`'s own `map` projection to the fixture's content index; the fixture is
> mostly name-only, with just 7 of 67 recipes carrying ingredients or tags). Chunking a 6 KiB
> document into individually-invalidated pieces trades a real increase in request count for a
> saving that rounds to nothing. The claim "this is the single largest payoff outside the index
> pages" was written before anyone measured it, and at this scale it is false.
>
> **And it is as much a client rework as a server one.** `SearchContext.tsx:287-306` fetches the
> whole corpus **unconditionally** — `staleTime: Infinity`, with no version gate on the fetch;
> the version only gates the expensive FlexSearch _populate_, which the comment there says
> outright. `allTags` is then derived from that array, and it drives `TagFilterRail` and the
> form's tag suggestions. So the corpus load is not merely the search index's seed: it is what
> makes the filter rail exist, and what renders the browse list before hydration. Chunking the
> route without rethinking those two consumers would leave the client fetching every chunk
> anyway, which is the current behaviour with more round trips.
>
> Same shape as F5's finding below: the call that looks like the obvious adopter is load-bearing
> for a different reason. The trigger to revisit is a corpus large enough for 6 KiB to become a
> number worth caring about — and the first move then is `allTags`, which is already an
> aggregate (F10b) and could be served as one instead of derived on the client.
>
> **The trigger has since fired (§12.7c).** The 6.3 KiB was measured against the fixture the
> note itself calls "mostly name-only". The real corpus is **436 recipes**, where the emitted
> `search/all` is **253,421 bytes — 247 KiB, 39× larger**. The first half of this finding is
> therefore withdrawn: there are cold-load bytes to cut, on a file that moves on every write.
> The second half stands, and still sets the order of work: `allTags` first.

> **F4a is done, and it is not the chunking this entry asked for (§12.8).** Measuring the
> corpus **by field** rather than by row said the chunk was the wrong cut. `ingredients` is
> **78.3%** of the document and is rendered from the fetched array **never** — it exists to
> populate FlexSearch, which is already version-gated and persisted in IndexedDB, and to back
> `ingredient:` filters. Both are conditions. So F4a split the document by consumer instead:
> `search/all` keeps what the client renders, a new `search/ingredients` carries the rest, and
> the client fetches the second one only when the index needs populating or the filter asks.
>
> | document              | bytes       | on every page load? |
> | --------------------- | ----------- | ------------------- |
> | `search/all` (before) | 253,421     | yes                 |
> | `search/all` (after)  | **54,904**  | yes                 |
> | `search/ingredients`  | **204,075** | no — conditional    |
>
> **The unconditional payload is 247 KiB → 53.6 KiB**, a 78% cut, for two route handlers and a
> conditional query. No engine work, no index-shape change, no fixture rebuild. Recipes only —
> portfolio's `search/all` is F5's, whose finding says its whole-corpus load is deliberate.
>
> **What made this the cheap win and not the on-thesis one:** the bytes moved behind a gate that
> already existed rather than behind a new one. **F4b** is the on-thesis half and is still open —
> declare a second pagination index carrying the search projection and serve `search/ingredients`
> through `createPaginatedJsonRoute` (the factory D3 built), so stable-end anchoring means an
> append dirties only the head chunk and the client re-downloads one chunk after a write instead
> of 199 KiB. Leave the display corpus whole: at 53.6 KiB, chunking it buys round trips and
> breaks browse-before-hydration for nothing.
>
> **`allTags` did not have to move after all**, contrary to the order this finding set. Tags are
> in the display half, which is still fetched whole — so the rail and the suggestions kept
> working untouched. The `allTags`-first ordering was derived from the assumption that the fix
> was chunking; it is not binding on a fix that splits by field instead.

> **F4b was measured and deferred a second time (§12.10).** The chunk geometry is _better_ than
> this entry assumed — an append or an edit dirties exactly one chunk of nine, an 8.4%
> re-download — and it is still not worth building, because the saving it produces does not exist
> yet: no search route sets `Cache-Control`, the client's `staleTime: Infinity` is in-memory per
> session, and the public app is a static export whose cache policy is configured outside this
> repository entirely. Without caching, chunking turns one request into nine and saves nothing.
> A backdated insert also dirties **every** chunk, since it inserts at the anchored end.
>
> **And the priority inverted underneath it.** After F23 the unconditional half is 145.6 KiB
> against the conditional half's 199.4 KiB, so the heaviest thing on a page load is the document
> F4b leaves whole. The next moves are the description cap and then `allTags` off the F10b
> aggregate — both on the unconditional half. Chunking is what to build once a cache policy
> exists to make it pay.

> **F4b was deferred a third time at F27, and this deferral does not expire (§12.12).** The
> "once a cache policy exists" condition above was a hypothesis, and it was wrong. Measured
> against a real Chromium and a real server, a repeat visit to the export costs **600 B** — two
> 304s with empty bodies and a third document not requested at all — because content ETags plus
> the _absence_ of any `Cache-Control` force revalidation. The export already re-downloads only
> the document a write actually changed: an ingredients-preserving write leaves
> `search/ingredients` at **300 B**, and a display-only write leaves `search/all` at 300 B.
> Chunking would make the cold load and the display-write path worse, do nothing for the common
> repeat visit, and improve exactly one path. **The payload thread is closed**; what remains is
> the cold load, which chunking does not improve.
>
> **Two corrections this entry needs.** The `allTags`-off-the-F10b-aggregate move named above
> **does not exist** — F10 is closed and F4a settled that tags stay on the display corpus because
> the cards render them, so there is no open `allTags` work anywhere. And the editor's three
> search routes build as **dynamic**, not `force-static`; the export's siblings are the static
> ones. The editor re-downloads 121.2 KiB per load because a dynamic Next route handler emits no
> validator — a real cost, on the one surface where it does not matter.

**F10 — `getAllTags` is a full corpus scan per call (aggregates).** `data/read.ts:95-108` reads
every recipe and builds a `Set` on every render of the recipe form. The materialize-at-write-time
idea applies, but an aggregate's invalidation is genuinely different: it depends on the whole
corpus, so the useful question is not "which pages" but "did the aggregate value actually
change" — a tag cloud is unchanged by most writes even though every write touches the corpus it
is computed from. Blocks `paginationOnly` for recipes (§10).

> **Closed by F10b (the kind) and F10c (recipes adopting it).** The engine answer is the one this
> entry asked for: a stored value plus a hash, so a write reports `changed: false` and fires no
> tag unless the value really moved. `getAllTags` is now one O(1) key read where it used to load
> the whole corpus on every render of four surfaces.

> **Correction, made at F10a: the homepage's newest-six strips are _not_ aggregates.** This entry
> used to claim they were "the same shape" as `getAllTags`, and §12.3's table classed
> `/index.html` as an aggregate on that basis. Both were wrong. The strips called
> `getRecipes({ limit: 6 })` and `getFeaturedRecipes({ limit: 6 })` — **bounded reads**, not
> corpus folds. Their only defect was the transport: `readContentIndex` carries no cache tag.
> So they needed no new kind at all, just the keyspace they were already sitting next to, which
> is what F10a did in a PR with no engine change. Worth keeping as a caution: "reads the whole
> corpus" and "is an aggregate" are different claims, and only the second one needs a design.
> After F10a the homepage's one remaining untagged reader is `getAllTags` itself.

**F8 — static per-tag pages. Shipped, unpaginated.** `/tags/<slug>` and `/tags` are pre-baked
static pages served from the `recipesByTag` aggregate, and `tagSearchHref` points every tag chip
at them instead of `/search?q=tag:<tag>` — indexable, no JS, dirty-tracked. The first thing in
this section that is a _feature_ rather than a refactor, and the first user-visible payoff of the
aggregate kind. See §10 for the trade it accepts (one cache entry for all tag pages) and the slug
decision it settled.

**F8b — partitioned pagination indexes, for when a tag outgrows one page.** This entry used to
say F8 "needs a decision on index-per-tag vs one index keyed `[tag, date, slug]`", and priced the
former as "one sorted-keyspace write per matching item per tag". Both readings were wrong, and
the correction is the useful part:

- **Neither option is a config declaration.** `key` returns one `Key` per item and `[LOOKUP, id]`
  is one-to-one, so a recipe with three tags needs a **fan-out** in phase 1 — a capability the
  engine does not have.
- **The naive single index is actively broken.** Phase 2 counts positions across the whole SORTED
  range, so with a `[tag, …]` key an append to tag `a` shifts every position in tags `b`…`z`:
  every page dirty on every write, the precise failure §3.1 exists to prevent. It needs
  **partitioned page assignment** with per-partition `headPage`/`total`/meta.
- **Both designs write the same number of sorted entries** — one per (item, tag) — so that was
  never the axis. What index-per-tag actually costs is one LMDB environment, directory and lock
  file _per tag_, a `paginationIndexes` list that becomes a function of the corpus, and an
  orphaned directory whenever a tag goes empty.

The tractable design is `partitionsOf?: (entry) => Key[]` on `PaginationIndexConfig`, with the
partition as the **leading** key component so one forward walk still visits each partition
contiguously — phase 2 stays a single walk that resets `position` at each boundary, and §3.6
holds verbatim. An index declaring no `partitionsOf` writes today's keys byte for byte, so
adopting it forces no rebuild. This subsumes **F11**: key buckets (`/recipes/2026/03`) are the
same feature with a different `partitionsOf`.

Not urgent. No tag in the corpus is close to `perPage`, and the unpaginated pages above serve the
feature until one is.

> **Measured at F28, and the trigger written here is the wrong one (§12.13).** A tag crossing
> `perPage` costs nothing: at a largest tag of 100 — more than 8× `perPage` — the aggregate fold is
> unchanged at 22 ms. What costs is the **record's bytes**, because `recipesByTag.finalize` builds the
> whole `Record<slug, TagIndexEntry>` and `hashValue` runs over all of it on every write: 6.2 KB folds
> in 22 ms, 147 KB in 39 ms, and **719 KB in 128 ms — 5.2× the same corpus with no big tag**, which
> makes it the most expensive pass in an ordinary write. So the number to watch is **a by-tag record
> over ~150 KB**, which needs a single tag on roughly 1,000 recipes.
>
> The single-cache-entry trade is confirmed rather than argued: at a largest tag of 5,000 a
> `name`-edit on one recipe reported `moved: by-tag`, because `recipesByTag` projects `name` into
> every entry — one edit rewrites the whole 719 KB record and fires the one tag covering every tag
> page.
>
> **And the corpus is emptier than this entry implies.** 436 real recipes carry **2 distinct tags
> between them, on 1 recipe**, and the by-tag record is **429 B** — three orders of magnitude under
> the threshold. The "richest tag carries three recipes" figure above describes the Playwright
> fixtures, not production.

**F19 — the homepage hero is an untagged item read, and it is the last thing blocking
`paginationOnly` (item pages inside non-item pages).** `Homepage/index.tsx` renders
`HeroBench` from `getRecipeBySlug(newest featured ?? newest recipe)` — the recipe's whole data
file, far more than any projection carries. Editing that recipe's description changes the
homepage and fires no tag: pagination sees no dirty page (description is not projected) and the
tag aggregate sees no change. `revalidatePath(itemBasePath + "/" + slug)` cannot reach it either,
because the page's URL is `/`.

This is a **fifth shape**, not one of §2's four: a derived surface that depends on one item's full
record rather than on a fold or a page of a corpus. The fix is small and well-shaped — an
item-scoped cache tag (`item:<type>:<slug>`) that a cached `getRecipeBySlug` carries and the write
path fires, since the write path already knows the slug and already fires the item _path_. What
makes it worth its own entry is that it is the **only** thing left between recipes and
`paginationOnly`: F10a covered the strips, F10c covered the tag cloud, and F4 turned out never to
have been in the way (§10).

Found at F10c while settling the flag; not scoped there, because an item-tag mechanism is a kind
in its own right rather than an adjustment to the aggregate one.

> **Restored at F8, having been dropped by F8's own doc rewrite.** The rewrite replaced the slice
> from F8's entry through `### 11.2` in one edit, and this entry sat between them, so it went out
> silently. That is a §0 violation — the map stays the complete picture — and it is the second
> time a bulk doc edit has eaten a neighbouring entry. The lesson is mechanical: **edit this file
> with anchored, entry-sized replacements, never by replacing a span between two headings.**

> **The engine half is closed by F19a**, and building it corrected the entry above in one
> respect worth keeping. This entry argued from the hero, which is the case that _blocks the
> flag_; the case that proves the **design** is `/featured-recipe/<slug>`, which renders an entire
> recipe via `RecipeView` under a _different content type's_ slug. The hero at least belongs to
> the site's own homepage, so a sufficiently determined `listPaths` could have named it.
> `/featured-recipe/<slug>` could not be named at all: its URL is a function of the featured
> recipe's slug, not the recipe's, and `DependentWriteResult.updatedSlugs` only populates when a
> **borrowed** field moves — so a description edit reaches it through nothing but an item tag.
> That is what forces the key to be the item rather than the path, and it is why the kind needs no
> declaration on the content config: the coupling is the content type string, which every write
> already carries.
>
> Two further things settled while building it. **A cached read must not memoize a throw**, so
> `readContentFileOrNull` makes ENOENT a value; the negative caching that follows is safe only
> because a later _create_ at that slug fires the same tag, which the write path does. And the
> **catch-all `item:<type>` is fired by repair seats only** — a rebuild or a fixture rollback —
> never by a write, because a write knows its own slugs. That negative is asserted in vitest
> rather than end-to-end, since an over-fired tag re-renders byte-identical HTML and no rendered
> output could ever show it.

> **Closed for recipes by F19b.** `readRecipeItem.ts` is the module-scope cached read; the nine
> rendering call sites moved to it and their copied `try { … } catch (e) { if (e.code === "ENOENT")
notFound(); throw e }` blocks collapsed to `if (!recipe) notFound()`. The four write-path callers
> in `editor/controller/actions/index.ts` keep the raw `getRecipeBySlug`, and the reason is
> sharper than F10c's: `buildUpdateData` reads the current record to carry `image` and `video`
> forward, so a stale read there would write the stale values **back to disk**. A read site
> missing the cache is a performance miss; a write site hitting it is data loss. That asymmetry is
> now stated on `getRecipeBySlug` itself rather than left to be re-derived.
>
> One read stayed as it was and should be left alone: `Homepage/index.tsx`'s
> `.catch(() => undefined)` on the hero. It looks vestigial now that a missing recipe is `null`,
> but with ENOENT no longer throwing it catches only genuine I/O failures — which is the
> difference between a homepage with no hero and a 500.
>
> **`api/recipe/[slug]`'s 404 branch became reachable for the first time.** It always tested
> `if (!recipe)`, but the read threw ENOENT and the surrounding `catch` answered 500. Nothing
> asserted on it, so nothing noticed.
>
> **Two of the payoff assertions failed first, and the cause was the spec rather than the tags** —
> worth recording, because the failure was a perfect impostor of the bug the tests exist to catch.
> The edit helper gated on a level-1 heading, which the _edit page_ also has, so it returned while
> the URL was still `/recipe/<slug>/edit` and the next `goto` aborted the write in flight. The
> commit is the last thing a write does, so that leaves content on disk with no tag fired, which
> reads exactly like a cache that never invalidated. A diagnostic pass showed the description
> reaching the item page, the homepage **and** `/featured-recipe/<slug>` on the _first_ read every
> time — so the demo's "one stale read after a tag expiry" (F10b) does **not** reproduce in the
> recipe editor, and papering over it with a double load would have made the specs pass while
> proving nothing. The specs now wait for the redirect and assert the write landed on it.

### 11.2 Consumers of the existing machinery

No new design — these adopt what P1–P3 shipped.

**F21 removed the per-adoption overhead, which is why it went first.** A content type declaring
its first index used to mean also remembering three hand-maintained lists — the `.gitignore`
writers, the cache-reset seat, and the fixture rebuild — each of which fails _silently_ when
forgotten: an unignored LMDB binary in a content commit, an order-dependent suite, a fixture
serving an empty list. All three now derive from the site's `controller/contentTypes.ts`, so an
adoption costs a `paginationConfigs.ts`, one line on the content config, and a run of that site's
`build-fixture-indexes.ts`. Portfolio has that script for the first time (F21c), which is what
makes **projects first** a safe order rather than merely the recommended one.

**F5 — portfolio homepage loads every project. Answered at F29: it stays unlimited, and
`projects` adopts the engine anyway.** `portfolio/common/components/Index/page.tsx:41` calls
`getProjects()` unlimited and hands the whole array to `IndexSearchProvider`. It has no
pagination of any kind — the same problem the recipe index had, one corpus-growth away from
mattering.

> **Finding, from the pass that deferred it (F1/F2/F17/F7).** F5 was the alternative to that
> pass and is deferred with a reason rather than a guess: **the homepage's whole-corpus load is
> deliberate.** `SearchContext.tsx:92-96` says why — seeding the provider with every project is
> what makes search work before hydration finishes _and_ keeps the list rendering with
> JavaScript disabled. Paginating that surface breaks a property the portfolio rebuild built on
> purpose, so "portfolio adopts the engine" is not a mechanical port of what recipes did.
>
> This is the same shape as F4's deferral finding: the call that looks like the obvious adopter
> is load-bearing for a different reason. F5 needs its own planning pass to decide what
> portfolio should actually paginate — most likely `project/[slug]` enumeration (which would
> also unblock one of F7's remaining routes; this sentence said "two of four" and overcounted,
> see F7 below) and the editor project list (F6a), **not** the homepage.

**What F29 decided, and why it is not a read change.** The planning pass F5 asked for happened,
and its answer is that **nothing portfolio renders paginates.** `projects` declares
`projectsByDate` (`perPage: 12`) and gains a `projects/pagination/by-date/` keyspace; the one
consumer is `readAllProjectIds`, which F7 wanted. Everything else stays exactly where it was:

| Surface                                        | After F29                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Homepage (`Index/page.tsx:41`)                 | **Unchanged, unlimited `getProjects()`** — the pre-hydration/no-JS property above is a requirement, and `readIndex.ts` says so in the code |
| `search/all` (editor and export)               | **Unchanged, whole corpus** — it needs values, not a page; the same shape as recipe's                                                      |
| Editor project list                            | **Unchanged** — F6a stays open, with the reason now written below                                                                          |
| Export `project/[slug]` `generateStaticParams` | `readAllProjectIds()` — a keys-only walk (F7)                                                                                              |

**The write path is the point, not the read.** Before F29 a write to a project produced no
derived state at all, so it yielded nothing a build could act on and portfolio sat outside §1's
thesis entirely. One line on `projectContentConfig` turns the whole path on:
`createContent`/`updateContent`/`deleteContent` maintain the keyspace, report which pages they
dirtied, and `.pagination-changes.json` starts accumulating in portfolio's content directory for
F13's consumer to read. That is what "portfolio adopts the engine" buys at a five-project corpus,
where no read is under any pressure.

**No new fixture and no numbered-page surface, deliberately.** Paging itself is proven by recipe
on two corpora; a 40-project fixture would buy ~400 KB of committed binary and a new set of
visual baselines to assert something already asserted. The `perPage: 12` is therefore a
declaration with no page boundary behind it yet — which is fine, and is exactly the state
recipe's featured index was in before D2b gave it rows.

**F6 — unpaginated list UIs.** All load their whole corpus; all are natural
`readPage`/`readHead` consumers. Editor-side, so no static-export concerns.

| Surface                           | Call site                                              |
| --------------------------------- | ------------------------------------------------------ |
| F6a Portfolio editor project list | `portfolio/editor/…/(settings)/projects/page.tsx:29`   |
| F6b Portfolio editor pages list   | `portfolio/editor/…/(settings)/pages/page.tsx:25`      |
| F6c Recipe editor pages list      | `recipe-website/editor/…/(settings)/pages/page.tsx:30` |
| F6d Resume builder resume list    | `resume-builder/src/controller/data/readIndex.ts:14`   |
| F6e Menus settings lists          | `(settings)/menus/page.tsx`, both sites                |

> **F6a stayed open at F29, with a reason rather than a bare row.** `projects` now has a
> keyspace, so the transport swap is available — and it would be wrong on its own.
> `readHead()` returns "the head page folded with the page below it", i.e. between `perPage + 1`
> and `2 * perPage` rows and never more. Pointing the editor's list at it would silently cap the
> editor at 13–24 projects with **no numbered pages to reach the rest**, and the five-project
> fixture cannot see that: every assertion would stay green while projects 25 and up became
> uneditable. So F6a is a **paging affordance** — links, a page param, a route — not a read
> swap, and it is still a UI PR rather than an engine one. The same reading applies to F6b–F6e.

**F7 — enumerate slugs without deserializing values. Done for three of five routes.** Five routes
load an entire corpus purely to list slugs. A pagination index's SORTED keyspace _is_ the id
list, so a keys-only walk (`readAllIds`, shipped in P1 and until now with zero consumers)
replaces a full value-deserializing read.

Done: **`recipe/[slug]`** and **`featured-recipe/[slug]`**, via `readAllRecipeIds` and
`readAllFeaturedRecipeIds` beside the cached reads they belong with — the latter unblocked by
D2b, which gave featured recipes a keyspace; and at F29 **`project/[slug]`** (portfolio export),
via `readAllProjectIds` in the projects collection. Deliberately _not_ cached reads:
`generateStaticParams` runs once per build, so an `unstable_cache` entry would be written and
never read, and it would add a fourth tagged read to keep in step with §7's three invalidation
seats for no gain. `readAllProjectIds` goes one step further and gets **no**
`createCachedPaginationReads` module at all: portfolio has no other consumer of a paged read, and
§11.1's rule is that derived state lands when a reader is waiting.

> **This was "two of six" until F29, and the sixth route does not exist.** The table below listed
> _"`project/[slug]` enumeration in the editor"_ as a fourth blocked route. There is no such
> route: `grep -rn generateStaticParams websites/portfolio/editor/src` finds nothing, because
> next-auth in the editor layout makes every editor route dynamic, so nothing there enumerates
> anything. F7's denominator is **five**. F5's finding above inherited the same overcount — it
> said adopting projects would unblock "two of F7's four remaining routes", where the answer is
> one — and now carries the correction inline rather than being left to read as true.

Still waiting, both for the same reason — their content type declares no pagination index, so
there is no keyspace to walk. Both are `pages`:

| Route                                      | Blocked on                         |
| ------------------------------------------ | ---------------------------------- |
| `[...slug]` pages route (recipe export)    | pages declaring an index — see F6c |
| `[...slug]` pages route (portfolio export) | pages declaring an index — see F6b |

Verified by the export emitting an **identical file list** — every emitted path, same count —
against `one-featured-recipe` (216 files, 129 rendered pages) and against a 40-recipe/40-feature
corpus with real numbered pages (996 files, 909 pages). That is the property
`generateStaticParams` actually controls, and it holds exactly. The keyspace hands slugs back in
ascending sort order where the old read returned newest-first, which does not matter: it decides
which pages exist, not what any of them contains.

**F29 ran the same check on portfolio, on one corpus.** The export built against a scratch copy of
the `projects` fixture (five projects) before and after: **135 emitted files both times**, and the
77 non-`_next/` paths are identical — the five `project/<slug>.html`, their RSC sidecars, and the
`%2F` placeholder's, all present in both. The `_next/` differences are 11 chunk filenames and the
build id, which move between any two builds of this app; §12.14 records that. One corpus rather
than two because portfolio has one fixture with projects in it, and F29 deliberately did not add a
second.

> **The byte-for-byte check does not exist to be passed, because this build is not
> reproducible against itself.** Two builds of the _same commit_ emit 103 differing files —
> RSC chunks flushed in a different order by the 7 static-generation workers (`HeaderNav` is
> module 12 in one build and 13 in the next), plus `search/version`, whose `data.mdb`
> mtime-and-size proxy moves whenever the corpus is re-copied. That is the very proxy **F3**
> exists to replace. Before-and-after F7 differ in **13** files — a smaller set, of the same
> reordering-only kind: identical byte counts and identical token multisets. So "no snapshot
> moved" is established by the file list and by the container suite, not by hashing `out/`.
>
> **`search/version` left that set at F3, measured.** Two export builds of one commit against
> `many-featured-recipes-paged`, with the corpus **re-copied to a fresh directory in between** —
> the condition that moved the old proxy — now emit a byte-identical
> `{"version":"5ce41d14cd842474:1785775341480"}`. The counterfactual holds on the same two
> copies: `mtime-size` reads `1785940369.073-49152` and `1785940386.008-49152`, so the old
> formula would have differed exactly as F7 recorded. The RSC chunk reordering is untouched and
> remains the other cause; it is out of F3's scope.

One loose end left deliberately at F7: `getFeaturedRecipes` had **no callers at all**, and was
left in place rather than deleted, since removing it was a separate decision from moving two
`generateStaticParams` calls. **F31a took that decision and deleted it.** F7 removed its last
`generateStaticParams` caller and D2b/F10a had already moved the homepage strips onto `readHead`,
so nothing had called it for three passes. Deleting it orphaned
`MassagedFeaturedRecipeEntry`, `ReadFeaturedRecipeIndexResult`, the `readContentIndex` import and
two type imports, all of which went with it; `readFeaturedRecipes.ts` is now
`getFeaturedRecipeBySlug` and nothing else.

Two comments still name it in the past tense — `controller/types.ts:91` and
`Homepage/route.tsx:38` — and both are deliberate. Naming a removed thing is how a
"what this replaced" comment earns its keep, and the homepage one is load-bearing history for a
non-obvious slice-then-filter ordering (§10, F10a). The two `packages/cms/demo` mentions describe
the demo's own unoptimised read by analogy and are unaffected.

**F9 — infinite-scroll toggle on the recipe index. Done, with D3.** The decisions, and why:

- **Numbered pages are the default.** Load-bearing, not timid. It is what the server renders,
  what a crawler indexes and what a reader with JS off keeps, so the opt-in costs nothing to
  anyone who never touches the control — and it is why the seven pre-existing pagination specs
  pass unedited. The preference is remembered once chosen (`localStorage`, via the same
  `useSyncExternalStore` shape `SearchContext` already uses, so there is one mechanism rather
  than two). Absent key and `"pages"` mean the same thing and the setter clears rather than
  writes the default, so promoting infinite later reaches everyone who never expressed a
  preference.
- **A numbered deep link seeds an infinite list at that page.** `/recipes/2` renders page 2 on
  the server, then appends 1, 0, … as the reader scrolls. Appending walks **older only**:
  `newerPage` exists on the payload but a reader who asked for page 2 did not ask for the
  landing.
- **The toggle never navigates, and scrolling never rewrites the URL.** Turning infinite on keeps
  what is rendered and enables appending below it; turning it off discards the appended pages so
  the list says what the URL says again. Rewriting the URL as pages scroll past fights the router
  and breaks the back button for no real gain.
- **The fallback is a real link, not a bare sentinel.** "Load more recipes" points at the
  numbered URL it would load and appends in place when clicked. That is the keyboard path, the
  path when the observer never fires, and the path under
  `prefers-reduced-motion: reduce` — where the sentinel is not attached at all, because
  auto-growing the page moves the scrollbar under a reader who asked for less of exactly that.
  A failed fetch leaves `hasNextPage` untouched, so it retries rather than looking like the end
  of the list.

**The one thing that shaped the implementation more than any UX question.** A recipe card's image
comes from `RecipeImage`, an async server component that resizes with sharp as a side effect of
rendering — so a client component cannot produce one, and "render the appended items on the
client" is not free the way it looks. The seed page is therefore passed into the client component
as **server-rendered markup in a slot**, never re-rendered, and only appended pages render on the
client, using `ClientRecipeList`/`PureStaticImage` — the same pair search results already use,
whose loader builds the identical `/image/…-w400q75.webp` URL the server's does. The page the
reader landed on is byte-for-byte unchanged in either mode, which is also why no snapshot moved.
The visible cost is that infinite mode renders two `RecipeGrid`s rather than one; the alternative
was carrying transformed image props in the projection, which `paginationConfigs.ts` warns
against for good reason — it would dirty every sealed page whenever an image changed.

**F11 — alternative page-assignment strategies.** Content-defined chunking, if backdated writes
become common, slots into the `assignPage` seat (§3.6). Key buckets for archive navigation
(`/recipes/2026/03`) turn out **not** to: they need each bucket to number its pages independently,
which is partitioning rather than a different `assignPage`. Folded into F8b, which is the same
feature with a different `partitionsOf` — noted at F8 so the two are not built twice.

### 11.3 Promoted or subsumed

**F13 — incremental rendering. Promoted into §1: it is the goal, not a follow-up.** What remains
a follow-up is the narrower thing it stood in for — **the export framework that consumes the
regeneration set.** Next's `output: "export"` cannot rebuild a subset of pages, so the
dirty-page artifact from P2 (`.pagination-changes.json`) currently accumulates for a consumer
that does not exist yet. A Vite-based export would read it, and the artifact is deliberately
shaped as its interface. Blocked on that framework, not on this module.

**F15 — a slug rename over-invalidates the referencing type. Closed by D1 (§6).** The forced
full rebuild in `updateContent` is deleted, along with the `updateReferences` call beside it;
`updateDependents` does both jobs in one pass, returning per-type results (§6.3) and precise
per-item sync from resolved index values (§6.2). §6.4 records why "narrow the rename rebuild"
and "fire on more than renames" were the same fix rather than opposing ones — and the demo now
shows the narrowing at its limit, with a rename dirtying zero pages where F15 dirtied every one.

**`OffsetPagination` — deleted by D2b.** The component existed only to serve the one index that
had no keyspace to ask where its ends were; featured recipes were its single importer, and its own
docstring named this PR as its end. Checked against every F-item on the way out: none referenced
it, so nothing here inherits it. The dead `FeaturedRecipesPage` component went with it.

### 11.4 Engine hygiene

**F1 — cache LMDB envs everywhere. Done.** `getContentDatabase` now goes through
`lmdb/environmentCache.ts`, so the content index is opened once per process like the derived
kinds, and inherits P2's inode check (§4) for free — that was the point of F10b's extraction.

**The non-obvious part is that it is all-or-nothing.** A cached environment that any caller
still closes is handed back _closed_ to every later reader in the process, so there is no
incremental version of this change: the nine engine `.close()` sites went in one commit — the
seven content readers and writers, plus `updatePaginationIndex` and `updateAggregates`, which
open the _content_ env themselves to walk it and closed it in a `finally`. The unit tests turned
out to hold eleven more of them in their harnesses, which the original plan had not counted.
`grep -rn "\.close()" packages/cms` returning only the two sites inside `environmentCache.ts` is
the standing check. Two comments explaining why a call sat _outside_ a `finally` now describe
machinery that does not exist and were rewritten rather than left. `closePaginationDatabases`
was dropped rather than renamed: it was already an alias of `closeCachedEnvironments`, and now
that content envs share the cache the honest name is the one that already existed.

**What it measured — not what §11 predicted.** The prediction above was "hundreds of map/unmap
cycles per export build". Measured against a 67-recipe corpus, the export build does **13 real
environment opens before and 13 after** — no change at all — for an identical 979-file `out/`,
with wall clock inside noise (16.7/16.0/16.1s before, 16.2/16.0/16.8s after). The reason is that
the prediction predates its own fix: D3, F10c and F19 moved the export's routes onto pagination
reads, so `getContentDatabase` is now called **four times in an entire build**. There is no
per-page content-index read left to cache.

The win is real but it is on the **write** path, where a single write opened the content env
three times over — once to write the index, once for phase 2's walk, once for the aggregate
walk. Across the 43 tests that drive the real write path, environment opens fall **151 → 61**
(content index 137 → 47, −66%; pagination flat at 14, already cached since P1).

**F2 — fix `readContentIndex`'s `more`. Done.** `more = (offset||0) + (limit||0) < total`
evaluated to `0 < total` for an unlimited read, so it was always `true`. Now
`(offset||0) + entries.length < total`: what the read _returned_, not what it asked for.
Behaviour-preserving in practice — with a limit the two forms agree, and the only helper that
renders `more` (`resume-builder`'s resume index) passes one — so this is correctness of a shared
helper rather than a visible fix. `test/readContentIndex.test.ts` covers it in six cases, two of
which fail against the old formula.

**F3 — derive the search version from pagination meta. Done.** Both handlers built their
version from `data.mdb`'s mtime and size — a proxy for "did the corpus change" that lied in both
directions: it moved when nothing semantic did (re-copying the corpus rewrites both) and stayed
put when the index _shape_ changed, which is how `3cec4e17` happened. Each now calls
`readPaginationMeta({ config: recipeContentConfig, paginationConfig: recipesByDate })` and
returns its `version`, which is `versionOf(meta)` = `specHash.slice(0, 16):updatedAt` — a direct
answer instead of a proxy, and P1's no-op-writes-nothing rule means it does not move when
nothing did.

Near-zero new code, because `readPaginationMeta` **already returns `version: ""` when there is
no meta record** — precisely the fallback both routes hand-rolled for ENOENT. Each `catch` still
returns a Response regardless, and the comment saying why stays: falling through without one
leaves the client's `res.json()` throwing and takes the whole search UI into its error state.
Both `dynamic` directives are unchanged; `force-static` is required under `output: "export"`,
and the export's baked-in string is _supposed_ to change only on a rebuild.

**Ordering was load-bearing, and it is why F16 went first.** The export's version string is
baked in at build time, so deriving it from `specHash` while `specHash` still depended on
`fn.toString()` would have made it change on every build — strictly worse than the mtime proxy
it replaces. See §4.

**The property, measured:** two export builds of one commit with the corpus re-copied between
them emit a byte-identical version, where the old formula would have moved. §12.3 carries the
numbers. Gate: recipe's container suite at `SHARD_TOTAL=2`, **411 passed and 1 flaky out of
412**, both shards exiting 0 — the suite that matters here, since these are recipe routes.
`SearchContext.tsx`, `CommandPalette/index.tsx` and `search-index-recovery.spec.ts` all treat
the value as an opaque string and needed no change; the last one's comment described the old
mtime formula and was corrected.

**F12 — early-exit reconciliation.** The O(changed suffix) optimisation in §5, plus the
pending-changes keyspace it needs. Worth doing only if the full walk shows up in a profile.

> **Measured at F28, and the trigger is now a number: a corpus over ~20,000 items (§12.13).** The
> floor for phase 2's walk is 4.2 ms at 436, 27.9 ms at 5,000 and 112 ms at 20,000 — linear, with a
> per-item cost that improves slightly with size, so `updatePaginationIndex.ts:120`'s "at this corpus
> size it is milliseconds" holds all the way up.
>
> **Two things the measurement changed about this entry.** Its **ceiling is half an ordinary write**:
> the early exit cannot take a write below the aggregate fold's floor, which is the same 123 ms at
> 20,000 and has no suffix to skip because a fold depends on the whole corpus by definition. And it
> does **nothing for the expensive write**. The walk is not what gets costly at scale — the paged
> keyspace rewrite is: a backdated insert at 20,000 writes **20,001** `PAGED` keys and dirties all
> 1,667 pages for **2.5 s**, against an append's 9 keys and 165 ms. F12 has no unchanged suffix to
> exit into there. The better first move at that size is bounded work at the _anchored_ end — §11.1's
> `partitionsOf`, or §3.1's key buckets — not this.

**F14 — `updateContent.ts:25` had an unused `slug` parameter** that failed `eslint`. It never
surfaced because `lint-staged` only lints changed files. **Done in P2** — renamed `_slug`, with
a comment saying why it is unused (uploads are processed at the _current_ slug, before any
rename). P2 also fixed the global ignore list, which anchored `.next/**` at the repo root and so
linted build output under nested packages. One eslint error remains repo-wide, in
`packages/next-static-image/src/resizeImage.ts` — untouched by P2 and outside its scope.

**F17 — `commitContentChanges` ignores the caller's content directory. Done, with F1.** It took
no directory and read `getContentDirectory()` instead, so a write against an explicit
`contentDirectory` committed against whatever the ambient environment said — with `paths` the
caller had computed relative to _its_ directory. Now a trailing optional parameter defaulting to
`getContentDirectory()`: the three content writers pass the directory they were given, and the
editor's `sync` action, which has no explicit one, keeps the default.

Latent rather than live, which is why nothing ever caught it: the two values agree in every
running configuration. Tests still pin `CONTENT_DIRECTORY` at their tmpdir (§12.1b) — a tmpdir
is not a git repository either way, so the no-op stays explicit rather than dependent on the
checkout's layout — but the comments that described the old behaviour were corrected.

**F18 — the dependent scan loads the dependent index into memory, and now runs on creates.**
`db.getRange().asArray` over the whole dependent index, as `updateReferences` already did — but
D1's gate opens on creates too, not only renames, because a create is what resolves a reference
that was dangling. §6.2's reverse-dependency keyspace (`[refType, refId] → dependents`) is the
release valve; the trigger to build it is a corpus large enough to make a create visibly slow,
which no corpus in this repo is. It is already measurable, though: it is what tipped the demo's
racing git test over (§10).

> **Measured at F28, and the trigger is now a number: D over ~50,000 (§12.13).** Swept on its own
> axis at a fixed N of 5,000, the scan is linear in D and never the dominant term — 4.0 ms at D=50,
> 8.8 ms at D=500, 57.5 ms at D=5,000, where an append's whole derived-state cost is 219 ms and one
> O(N) corpus pass alone is 28. Below D ≈ 500 it sits inside the host's noise band. D is the count of
> hand-curated featured recipes; production has one, so this trigger will not arrive.
>
> **The cheap half checks out too.** At D=0 the pass costs 1.8 ms and `.asArray` never runs at all,
> because the `pathExists` check at line 190 comes _before_ `getContentDatabase`.

**F16 — the automatic spec hash is not stable across builds. Closed: `version` is required and
`fn.toString()` is gone.** See §4. P2 documented the trap rather than picking between "make
`version` required" and "hash something build-stable", because neither looked obvious; P3 hit it
again in a second codebase. What made it obvious was counting the callers — all seven real
configs already declared `version: "1"`, so the automatic form had no users outside inline test
fixtures. Both hashes now cover only `{ name, perPage, newestFirst, version }` and `{ name,
version }`. The safety net the source hash provided is replaced by `test/specVersions.test.ts`,
which snapshots each config module's source text against the versions declared in it; the
trade-off it manages — a rebuild footgun for a staleness one — is set out in §4.

**F20 — nothing in this repo had ever run a production build, and what that hid was a racing
test harness rather than an adapter bug.** Two findings, and the first is what hid the second.
The `{ expire: 0 }` seats are **not** at fault: the suspected permanent pin is disproven below,
the three seats stand unchanged, and the demo suite is now green at **109 in production with
retries disabled**.

**No suite exercises `next start`.** Every recorded demo count — 71 → 82 → 90 → 97 → 103 → 109
— is a dev-server number, and so is every gate: the CI job runs `pnpm exec playwright test
--project=e2e` with no `PLAYWRIGHT_BUILD`, and all three container services run `pnpm dev:test`.
Production mode was reachable only through `pnpm e2e-start`, and until the harness fix that
script never ran `next build` at all — `PLAYWRIGHT_BUILD=1` only swapped `pnpm dev:test` for a
bare `next start`, which serves whatever `.next` happens to be on disk. Two demo runs at two
different commits therefore failed **identically**, because the commit under test had no bearing
on what the server was serving, and the five failures that produced were wrongly attributed to
F1. The suite was green at 109 in dev at that same commit — **on the first attempt, no retries
consumed**, which is the form §12.2 requires a count to be stated in. `webServer.command` now
builds, in all three configs.

**The dev-only bypass.** `loadTwice` (`items.spec.ts`) and `loadTagPage` (`aggregates.spec.ts`)
issue a second `page.goto` to the same URL and assert on it, and their comments claimed the
second read was fresh because a background refresh had landed. It is fresh because
`next/dist/server/lib/incremental-cache/index.js:299` returns `null` from `IncrementalCache.get`
whenever `this.dev` and the request carries `cache-control: no-cache` — which is exactly what a
repeat navigation sends. The helpers skip the cache rather than absorbing a timing window, and
they do nothing in production. That is why the workaround has always worked and why the gap
underneath it stayed invisible.

**What a real production run shows.** The first honest one — a build made in the same minute,
current tip, `CI=true PLAYWRIGHT_BUILD=1` — is **104 passed, 2 failed, 3 flaky** out of 109, not
the five hard failures previously reported (the specs are the same five; the earlier line
numbers predate this pass's comment edits). Two fail all three attempts:
`items.spec.ts` "editing a note reaches the bookmark page that renders it" and "renaming a note
reaches the bookmark record the write rewrote". Three pass on the first retry:
`aggregates.spec.ts` ×2 and `items.spec.ts` "an edit to an unprojected field reaches the item
page". The failing assertion is a bookmark page still rendering the pre-edit borrowed title —
a genuine stale read that dev never shows.

**What it shows after the harness fix.** The same command on the same adapter: **109 passed,
0 failed, 0 flaky, retries disabled**, in 1.8 minutes. Dev is unchanged at **109, retries
disabled**. Both counts are first-attempt numbers; neither leans on the `retries: 2` that
§12.2 warns about, which matters here because the whole point of the original finding was that
a real pin survives retries and this no longer needs them at all.

**The mechanism is a candidate, not a conclusion — and the one bounded experiment run here
weakened it.** The candidate: `revalidateTag(tag, { expire: 0 })` records
`expired = Date.now()` in the tag manifest; `areTagsExpired` is called as
`areTagsExpired(combinedTags, cacheData.lastModified)` (`incremental-cache/index.js:354`), so its
`timestamp` is the entry's own `lastModified`; and the test is
`isImmediatelyExpired = expiredAt <= now && expiredAt > timestamp`
(`lib/incremental-cache/tags-manifest.external.js:36`). `executeRevalidates`
(`server/revalidation-utils.js:141-150`) runs the tag expiry and the request's queued
`unstable_cache` writes in a **single `Promise.all`**, so they race; a write landing at or after
the expiry instant makes that strict `>` false permanently, and `createCachedItemRead`
(`content/next/cachedItemRead.ts`) passes `tags` but no `revalidate`, i.e. a year — so a
survivor would be a permanent hit rather than a briefly stale one. All four of those source
facts were read and verified verbatim in the pinned Next 16.1.6.

**But the log does not show that happening.** Running the failing spec against a hand-started
`next start` with `NEXT_PRIVATE_DEBUG_CACHE=1` (`file-system-cache.js:23`) captures the write
firing its tags —

```
FileSystemCache: revalidateTag [ 'pagination:notes:by-date:head', 'pagination:notes:by-date:meta',
  'aggregate:notes:tags', 'item:notes:existing-note', 'pagination:bookmarks:by-date:head',
  'pagination:bookmarks:by-date:meta', 'item:bookmarks:my-mark' ] { expire: 0 }
FileSystemCache: get 1d589c…  [ 'item:notes', 'item:notes:existing-note' ] FETCH true
FileSystemCache: expired tags [ 'item:notes', 'item:notes:existing-note', … ]
FileSystemCache: set 1d589c…
```

— and the very next read of the affected entry **is** reported expired and re-`set`. So in that
capture the tag fired, the key was right, and the invalidation was honoured, yet the assertion
still failed. That rules the permanent-hit story out as the _whole_ explanation and means a
second effect is in play; the two `get /_not-found APP_PAGE` entries interleaved with that
sequence are the obvious thing to chase next, since a 404 captured into the cached render would
produce exactly this symptom.

**Resolved: the second effect was the harness, and the pin does not exist.** Three bounded
experiments, in order.

_The prefetch candidate is dead._ The two `/_not-found` gets were the page's own dead links —
`/bookmarks/<slug>/edit` and `/delete`, neither of which is a route. Deleting them and putting
`prefetch={false}` on both surviving links left the result **bit-identical**: 2 failed, 1 flaky,
3 passed. Production-only prefetch is not the concurrent writer.

_The concurrent writer was `waitForURL`._ `items.spec.ts` waited on `/\/notes\//` immediately
after submitting the note-edit form — from `/notes/<slug>/edit`, **a URL that already matches
it**. `playwright-core/lib/client/frame.js:161-165` returns as soon as the current URL matches,
so the helper waited for nothing and every read after it was issued while the Server Action was
still in flight. The two bookmark-create sites had the same defect: `/\/bookmarks\//` matched
`/bookmarks/new`. Waiting on the actual destination — and changing nothing else — took the spec
from 2 hard failures to **6/6 in 42.5s with no retry consumed**.

_There is no permanent pin._ The mechanism above requires a `set` landing at or after the tag
stamp with pre-write content, and `unstable_cache` writes **only on a miss**. A read racing the
write hits the still-valid entry and writes nothing; a read after the stamp misses and reads a
content file the write has already committed, so it fills fresh. Eight deliberate attempts to
force it — a six-way parallel hammer against `/bookmarks/my-mark` across the whole write, run
both with the entry primed and, to open the miss window, unprimed — produced **zero** pins.
The three leftover `fetch-cache` files that looked like frozen evidence are just the last value
cached for each key before a failing test abandoned it.

_What production really does._ There is a real window, and it is bounded. Sampling
`/notes/tags` after a single tag-changing write, six consecutive runs: **empty at 54–86ms,
correct by 1.10–1.20s**, every time. That is the `revalidateTag` stamp running in a `finally`
Next may execute after the action's response has been sent
(`server/revalidation-utils.js:145-149`). Sub-second, self-healing, and identical in shape to
the flake `aggregates.spec.ts` had been absorbing via retries. It is **not** a year-long hit,
and the strict `>` in `tags-manifest.external.js:36` is never reached with a pre-write body.

Note the logging only appears on a hand-started server: `FileSystemCache.debug` writes to
stdout, and Playwright's `webServer` discards stdout while forwarding stderr, so running the
suite with the flag set produces nothing.

**Fixed in the harness, and the adapter is deliberately untouched.** The three seats —
`content/next/revalidate.ts`, `pagination/next/revalidate.ts:18-22` and
`aggregates/next/revalidate.ts:33`, sharing one `EXPIRE_NOW = { expire: 0 }` — keep
`{ expire: 0 }`. Each candidate fix was evaluated and rejected on evidence, not taste:

- **`updateTag`** is a verified no-op here. It routes to the same internal `revalidate` with an
  `undefined` profile, which takes the no-durations branch and writes the identical
  `expired: now` (`file-system-cache.js:68-73`). Same value, same strict `>`, and it throws
  outside a Server Action — two seats lost for no change in behaviour.
- **A non-zero `expire`** would make things **worse**, not better. With `{ expire: N }` the
  manifest gets `stale = now, expired = now + N·1000`, so for the whole window every pre-write
  entry passes `areTagsExpired`, fails `areTagsStale`, and `unstable_cache` **returns the stale
  body while refreshing behind it** — converting today's ~1s convergence into a guaranteed
  N-second stale read on every request. It also stops setting `pathWasRevalidated`
  (`revalidate.js`: `!profile || cacheLife?.expire === 0`), losing the client-router refresh.
- **Awaiting the pending writes** changes nothing: `IncrementalCache.set` has no await before
  `cacheHandler.set`, so within one request the ordering is already correct.
- **A version counter in the cache key** solves a problem that does not exist, at the cost of
  orphaning a `fetch-cache` file per entry per invalidation, unboundedly.

What was fixed instead: the three no-op `waitForURL` calls, the two dead links, and
`aggregates.spec.ts`'s baseline capture, which now polls until the write it depends on is
observable rather than reading blind into the sub-second window. That last one is a
**precondition** guard, not a retry around an assertion — the assertion still compares exactly
once. A third `page.goto` would still be the wrong fix, and remains absent.

**A trap worth recording, because it cost a full run.** `expect(async () => { … }).toPass({
timeout: 5000 })` around an inner `expect(...)` does **not** retry: the inner assertion's own
five-second default consumes the entire outer budget on the first attempt. It reports
`Timeout 5000ms exceeded while waiting on the predicate`, which reads exactly like a permanent
pin and is not one. Use `expect.poll`, which re-invokes the function it is given.

Reproducer for the original failure, should it ever return:
`cd packages/cms/demo && pnpm e2e-start`.

**F21 — derived state describes itself. F21a done.** The engine knows from `ContentTypeConfig`
every derived directory and every cache tag a content type owns, and until F21 nothing read that
knowledge: it was re-typed by hand in three families of place, and **every one of them had
drifted**. This is the item that makes §11.2's adoption cheap, which is why it went before it
rather than after.

The corpora are the reason for the ordering. `pages` and `projects` are 1 and 5 items, so
adopting pagination there buys no measurable win — only the architectural one. What it does buy
is a fourth, fifth and sixth chance to forget one of the three lists. F21 removes the lists.

**F21a — the ignore list has one owner.** `content/derivedPaths.ts` derives a content
repository's `.gitignore` body from a list of configs, and a per-site `controller/contentTypes.ts`
is the one place a site says what content types it has. The three drifted writers:

- `recipe-website/editor/controller/actions/index.ts` (production) named both recipe types and
  **omitted `/pages/index`**, which the harness had.
- `recipe-website/editor/playwright/support/tasks.ts` (harness) had `/pages/index` but neither
  `/pages/pagination` nor `/pages/aggregates`.
- `portfolio/editor/playwright/support/tasks.ts` (harness) had only `/projects/index` and
  `/pages/index` — no `pagination`, no `aggregates`, no `/.pagination-changes.json`.

**Three writers, not four.** Portfolio has no _production_ writer, and that is correct rather
than a gap: it has no content-git at all — no `simpleGit`, no git UI — and `commitContentChanges`
no-ops when the content directory is not a repository. Its harness inits git for fixtures only.

**Directory-level, and unconditional.** `/recipes/pagination`, not
`/recipes/pagination/by-date`, so a type that declares its second index needs no ignore change
ever; and all three lines are emitted whether or not the type declares anything, carrying
forward F10b's reasoning that naming a path before something creates it costs nothing. The paths
are computed from `dirname(indexDirectory)` rather than from `contentType`, because that is what
`getPaginationDirectory` and `getAggregateDirectory` actually build from — the two agree for
every config today, and deriving from the one that is load-bearing is what makes the list true
rather than merely consistent.

**The safety property, and where it is asserted.** A pure refactor here is behaviour-preserving
in exactly one direction: the generated body may only _gain_ entries, never lose one. A lost
entry means an LMDB binary swept into a content commit, which no rendered-output check would
notice. `test/derivedPaths.test.ts` pins all three historical literals verbatim and asserts each
is a subset — they are a floor, not a spec to keep in step. The measured diff is exactly what
was predicted: recipe production gains `/pages/{index,pagination,aggregates}`, the recipe harness
gains `/pages/{pagination,aggregates}`, and portfolio gains
`/projects/{pagination,aggregates}`, `/pages/{pagination,aggregates}` and
`/.pagination-changes.json`. Nothing is lost anywhere.

**`AnyContentTypeConfig`, and why a registry needs one.** `ContentTypeConfig[]` does not typecheck
as the element type: the default generics put `TKey` in a parameter position (`buildIndexKey`), so
the interface is invariant and `recipeContentConfig` is not assignable to it. That is the same
variance problem `paginationIndexes` and `referencedBy` solve with `any`, and the reason every
engine call site already casts through `config as ContentTypeConfig`. A registry is a list of
_heterogeneous_ configs by definition, so it is the one place with no concrete generics to name.

**F21b — the reset seat asks the config, not the reads.** `revalidateDerivedState(configs)` in
`content/next/` fires, per config, `paginationTags(...).all` for each declared index,
`aggregateTags(...).value` for each declared aggregate, and `itemTags(type).all`. All three are
pure functions of what the config declares, so the seat stops enumerating cached _reads_ — which
was the wrong thing to enumerate, since a read is a consequence of a declaration and the
declaration is what the config already holds.

**The index catch-all, not the per-page tags.** `tags.all` is on every entry a keyspace produces
— head, meta and each numbered page — so one expiry covers the index. The precise tags exist for
the write path, which knows which pages moved; a repair seat knows nothing and wants everything.

**The item catch-all fires for every type, including those with no cached item reads**, where it
is a no-op. Worth stating because §11.4 carries the opposite rule for writes: a _write_ must
never fire it, since it knows its own slugs and expiring the type would be the over-invalidation
§6.4 prevents. A repair seat is exactly what the catch-all exists for — the set of cached item
entries is not enumerable, since the slugs are whatever URLs the suite happened to visit.

Three seats reduce to one call each, and the three differ in what that buys:

- **Recipe** named five reads by hand. The derived set is a **superset**: it adds
  `item:featured-recipes` and `item:pages`, both no-ops today.
- **Portfolio** expired nothing, and was _correct_ only because it has no derived state. After
  this it is correct for the reason that survives `projects` declaring an index — which is the
  whole point of the seat, since the failure for getting it wrong is an order-dependent suite
  rather than an error.
- **The demo** — checked because §10's plan flagged it, and adopted because the answer was yes.
  Its five hand-written tags and the derived set are **the same set**, so this one is a pure
  simplification that could not have changed behaviour. Leaving it would have left the engine's
  own proof harness as the last hand-enumerated copy, which is the drift F21 exists to kill.

`test/revalidateDerived.test.ts` pins all of that: the five recipe tags as a floor, the demo's
five as an exact set, and the negative case that no per-page or meta tag is fired.

**F21b's gates, all three green.** Recipe container at `SHARD_TOTAL=2`: **412 passed, 0 failed, 0
flaky** — the run that matters most here, since the route exists to keep a resharded suite
order-independent, so a regression would show as scattered failures rather than a pointed one.
Portfolio: **84 passed, 0 flaky**. Demo dev: **108 passed + 1 retry-passing flake = 109**, the
recorded count.

**F21a's gate, and what it cost to read.** Recipe came back **411 passed / 1 failed**
(`git.spec.ts:533`, "should pull remote changes with Sync") on the first complete run. Diagnosed
the way D2a's §10 note prescribes rather than assumed either way: the same spec alone on the
branch is **26/26**, the base commit is **412 clean**, and a second full run of the branch passes
that test while flaking a _different_ one (`featured-recipes.spec.ts:431`, retry-passing).
Two unrelated tests failing across two runs, neither reproducible in isolation, is the
load-dependent flake pool this box already has on record — not a regression. Portfolio: 83 passed
/ 1 known flake, its recorded baseline.

> **A green exit code still meant "ran nothing", and this is the second shape of that.** F21a's
> _first_ gate run exited 0 in four minutes having collected **zero tests**. The cause was
> `packages/cms/content/tsconfig.json`, a committed **0-byte file** dating to the `33aba54a`
> rename: nothing referenced it and `packages/cms/tsconfig.json` already covers `content/**`, so
> it sat harmless until F21a made `playwright/support/tasks.ts` import
> `@discontent/cms/content/derivedPaths` — the first thing ever to make the Playwright loader
> resolve a tsconfig from that directory. It failed to parse, every spec that imports the support
> module died at collection, and the runner reported success. Verified A/B on the host: empty
> file → `Total: 0 tests`, removed → `Total: 420 tests`. The file is deleted.
>
> The previous phase fixed the harness defect where the fastest shard killed the others while the
> gate still said green. This is the same lesson one level up: **the exit code is not the gate,
> the count is.** Both runs of a suite that "passed" should be read as `229 + 183 = 412` before
> anything else.

**F21c — one fixture rebuild, driven by the registry.** `content/rebuildFixtureIndexes.ts` walks
each fixture directory and each config, reading off the config which treatment the type needs
rather than being told. Recipe's bespoke two-branch script becomes a five-line call, and
**portfolio gets one for the first time** — which is what makes its §11.2 adoption safe, since
without it the PR that gives `projects` an index would leave every captured fixture serving an
empty list with nothing going red.

**Which branch is read off `references`, not `borrowedFieldsOf`.** Worth writing down because the
first attempt got it backwards and the fixtures said so immediately. `borrowedFieldsOf` reads
`referencedBy` and answers the _outbound_ question — "which of my fields do others borrow" — which
is true of recipes and false of featured recipes, exactly inverted from what this needs. The type
that needs its **content index** rewritten is the one that _borrows_, because materializing
borrowed fields means resolving the reference per item and the content index carries no spec hash
to notice they are missing. That is `config.references`.

**The `pathExists` guard is load-bearing, not an optimisation.** `getContentDatabase` creates what
it opens, so indexing a type a fixture does not hold would leave a new LMDB environment inside the
captured directory — the D2a trap (§10), in the one place where the side effect gets _committed_
rather than merely observed. Portfolio's first run is the proof: two `skipped` lines and a
completely clean `git status`.

**The "clean tree" check in the plan was based on a false premise, and the real check is better.**
A clean tree cannot be the verification, because **the bespoke script never produced one either** —
measured, 62 modified files. So the property was established by comparison instead:

- Same **file set**: bespoke and generic each touch exactly the same 62 paths.
- Same **content**, where content is deterministic: all 47 `data.mdb` files hashed, and every
  content index and every aggregate is **byte-identical**. Only the 13 `pagination/*/data.mdb`
  differ.
- Those 13 are **inherent run-to-run variance, not a difference between the scripts**: running the
  bespoke script twice against itself differs on **13 pagination files _and_ 3 content indexes** —
  a strictly larger set than the generic-vs-bespoke delta. The residue is `updatedAt` in the meta
  record, which `force: true` rewrites every pass.

So the generic path reproduces the bespoke one within the bespoke one's own noise, and is
marginally more stable than it. No fixture is regenerated by this PR.

**F21c's gates.** Recipe container at `SHARD_TOTAL=2`: **410 passed + 2 retry-passing flakes =
412, 0 failed**. Portfolio: **83 passed + 1 known flake** (`menus.spec.ts:57`, its recorded
baseline). Fixtures clean after every run, on both sites.

One of the two recipe flakes was **`git.spec.ts:533` again** — the test that hard-failed during
F21a's first complete run. Seeing it retry-pass here, on a PR that touches neither git nor the
ignore list, is independent confirmation of that diagnosis: it is a load-dependent flake of this
box, not something F21a did. The other was `search-query-language.spec.ts:128`, a third distinct
test. Three different specs across four full runs, none reproducible in isolation, is the shape
of the flake pool rather than of a regression.

> **A repo hygiene note found while diagnosing the above, unrelated. Fixed at F28h.**
> `packages/cms/content/references.ts` contained a **literal NUL byte** at offset 4859 — a cache-key
> separator written as a raw character instead of a `\0` escape. It was harmless at runtime, but it
> made `file` report the source as `data` and made **grep treat it as binary and silently match
> nothing**. Two searches for `borrowedFieldsOf` came back empty against a file that defines and
> exports it. It cost four more empty searches while planning F28, which is what finally got it its
> own entry (**F28h**, §11.4) and the one-escape fix, plus the standing
> `grep -rlP '\x00'` check.

**The registry is its own module and no config imports it.** A config that imported the registry
would give the reference thunks of §6.1 a second path into the cycle they exist to break —
`recipeContentConfig` and `featuredRecipeContentConfig` already name each other, and a registry
one of them imported would be evaluated with the other's `const` still in the temporal dead zone.
The dependency runs one way: registry → configs. It lives in each site's **editor** package
because every consumer does; `recipe-website-common` would be the tidier home for a site-wide
declaration but does not depend on `@discontent/pages-collection`, and the export packages have
no use for the list.

**Cross-reference, and the tell that was there all along.** F19b (§11.4) records that "the
demo's one stale read after a tag expiry does **not** reproduce in the recipe editor", and
explains it by noting that recipe's specs **wait for the write's redirect** rather than
double-loading. That was the answer, written down a pass early and read as a curiosity: the
suite that waits for its writes does not see the bug, and the suite that does not wait does.
The demo now waits too.

**F22 — the third invalidation seat, and the bug that was not there.** F21 gave derived state a
single owner and fixed two of the three seats above. Surveying the third found six
`rebuild*Index()` callers that had drifted four different ways, one of which looked like a live
production bug: `sync.ts` defined its own private `rebuildRecipeIndex` that shadowed the
maintained export and fired **only `revalidatePath("/")`** — exactly the P3 gap D2b closed in the
sibling copy, on the five paths where a rebuild _is_ how the corpus changes over.

**F22a — the seat has one owner, and the hypothesis was wrong.** The structural half is
uncontroversial and landed: `sync.ts` now imports the maintained `rebuildRecipeIndex` from
`./index`, the same import `export/exportAction.ts` already used, and no cycle exists because
`actions/index.ts` does not import `sync.ts`.

The measurement half is the part worth keeping. The prediction was that `git.spec.ts:533` —
"should pull remote changes with Sync", a standing member of the build-path flake pool — was
failing because nothing warmed the homepage's cache entry before the Sync, and that adding the
warming read would turn it **deterministically red on base**. It does not. With
`await page.goto("/")` inserted before the Sync click and the spec run on the host under
`PLAYWRIGHT_BUILD=1`, where the data cache is live, the test is **green on base**. (It _does_ go
deterministically red on base in the container's production build — but for a reason that is not
this one, and not a cache reason at all. F22c below has it.)

Probing why produced a result no reading of Next predicts. Removing `revalidatePath("/")` from the
old seat outright turns **two** assertions red: the warmed homepage in `:533`, and a warmed
`/recipe/shared` after a Take Theirs merge. So that single path call was covering both URLs —
including the item page, and Next 16.1.6's `getImplicitTags` says it should not. `revalidatePath("/")`
emits `_N_T_/` and `_N_T_/index`; the implicit tags an entry created during `/recipe/shared`'s
render carries are `_N_T_/layout`, `_N_T_/recipe/layout`, `_N_T_/recipe/[slug]/layout`,
`_N_T_/recipe/[slug]/page` and `_N_T_/recipe/shared`, and none of them is `_N_T_/`. The effect
reproduces every time; the mechanism is not derived here, and this document should not claim one.

**What that costs the standing claim.** Several places above say "`revalidatePath` does not touch
`unstable_cache` tags". As a statement about _explicit_ tags that is still true and is still why
the tag seats exist. As a statement about whether a path call can leave a page stale, it is too
strong: in production, on this version, `revalidatePath("/")` was empirically enough for both URLs
under test. The honest form of the rule is that a path call's reach is **incidental** — it is not
derived from what the seat touched, it is not assertable, and it changes with Next — which is an
argument for tags on the grounds of precision and testability, not on the grounds that the site
was visibly broken. It was not.

**And `git.spec:533` is not this bug.** It went on retry-passing in the dev container gate after
the fix, which is where it always was: dev's `no-cache` bypass means a cache defect cannot be what
fails there. What it _is_ took the F22c production gate to establish — a readiness race in the
test, diagnosed below — so the earlier reading of it as flake-pool noise was right that F21 had not
broken anything and wrong that there was nothing to find. The warming read stays regardless: a
precondition, not a retry, the same distinction F20 drew for `aggregates.spec.ts`. A
second permanent assertion went in with it: "Take Theirs" now checks `/recipe/shared`, which
`setUpDivergence` leaves warm with the pre-merge name. It is the only assertion in the recipe suite
that goes red when the merge seat under-fires, and the probe above is what proved it does.

**F22b — a rebuild seat states what it moved.** Every seat now calls
`revalidateDerivedState(configs)` with exactly the configs it rebuilt, which is what the helper's
list parameter was for. `actions/index.ts` passes `[recipeContentConfig,
featuredRecipeContentConfig]`, because `rebuildIndex` cascades to dependents by default (D1) and
that rebuild really does move both; five hand-written `revalidateTag` calls and five imports go
with it. `featuredRecipes.ts` passes `[featuredRecipeContentConfig]` alone, **preserving** the
narrow radius its comment argues for. Portfolio's `buildExport` gets a seat it had never had, and
resume-builder gets one too.

Two seats keep something the recipe seat dropped, for opposite reasons and both worth recording.
Portfolio's expires nothing today — it declares no index and no aggregate, so it expands to item
catch-alls no entry carries — which is the same accident F21b removed from its reset route, and
the registry is what makes the accident stop mattering when §11.2 gives it derived state.
Resume-builder **keeps `revalidatePath("/")`**, and that is not the redundancy F19c removed:
`getResumes` calls `readContentIndex` with no `unstable_cache` around it, so that homepage goes
stale in the Full Route Cache, where no tag reaches it. Recipe could drop its path call because
every reader on `/` had been given a tag first. Resume has not been, so the line goes when the
reads become tagged and not before.

**The per-seat property is a unit test because it cannot be anything else.** Over-invalidation has
no symptom a browser can assert — the page is correct either way, merely recomputed — so the
featured seat's narrowness was a claim nothing checked. Four cases in
`test/revalidateDerived.test.ts` now pin it, including that a featured rebuild fires no
`pagination:recipes:by-date`, no recipe aggregate and no `item:recipes`. F22a sharpened the
argument: since the old path call kept both URLs under test fresh in production, a browser cannot
distinguish "fires the right tags" from "fires something broad enough to cover it" even in
principle. Asserting the derivation directly can.

**F22c — recipe gets a production gate.** `scripts/run-sharded-tests.sh --prod`, mirroring the
demo runner F20 built: `PLAYWRIGHT_BUILD=1` reaches the shards through the compose service, and
prod blobs go to `blob-reports-prod` so a prod run cannot merge into a dev run's and report 824
tests. The reason recipe needed this more than anywhere else is the reason F22a's bug could have
survived indefinitely had it been real: `next dev` serves with `no-cache`, so recipe — the site
with the most tagged reads and the most invalidation seats — was gated only in the mode where a
missing tag is invisible.

**F22's dev gates, all green.** Recipe container at `SHARD_TOTAL=2`, run three times — on F22a
alone, on F22b and F22c together, and once more after F22c's spec fix — **409 + 3 flaky**,
**411 + 1 flaky** and **410 + 2 flaky**, each totalling 412 with 0 failed. Portfolio: **83 passed + 1 known flake** (`menus.spec.ts:57`,
its recorded baseline). Demo: **108 passed + 1 flaky** = 109, the flake being the harness's own
`EEXIST … mkdir test-content` race rather than anything in the engine. Vitest **239**. Fixtures
clean after every run, on both sites, and **no visual baseline moved** in any of the three PRs.

`git.spec.ts:533` appeared in all three of those dev runs. That it flakes in **dev** was already enough to rule out the cache: the dev container
bypasses the data cache entirely, so whatever fails there cannot be a stale read. The production
gate then said what it actually is.

**What the production gate caught on its first run, and the shape of the answer.** The first
`--prod` run came back **410 passed + 1 flaky + 1 failed = 412** — and the failure was
`git.spec.ts:533`, deterministic across all three attempts rather than flaky. Four measurements
pinned it down:

| Configuration                                        | Container, production build |
| ---------------------------------------------------- | --------------------------- |
| F22a + F22b, with the warming read                   | fails 3/3                   |
| F22a + F22b, warming read removed                    | fails 3/3                   |
| **base (`ba8d518e`), F22 reverted entirely**         | **fails 3/3**               |
| base, with three extra navigations before the assert | passes                      |

So it predates F22 in both directions — the seat work neither caused it nor fixed it — and the last row says
what it is: **time, not staleness**. `/` does serve the pulled recipe, about a second after the
test looked for it.

It is a readiness bug in the test. `getContentGitLog()` reads the pulled commit straight off disk,
and the pull lands it early — `doSync` still has the index rebuild and the tag expiry to run after
the merge returns. The test navigated to `/` on a side channel that goes green before the work its
next assertion depends on has happened. It now waits for the Sync action's own POST response,
which cannot be early because it does not return until `doSync` has.

**And that is the argument for the gate, made by the gate.** The same race on a faster box usually
wins, which is how this spent several passes in the build-path flake pool being read as noise —
including in the F21 report above, which called it load-dependent and was half right. Slower
conditions did not make it flakier; they made it deterministic. A gate that runs only where the
race usually wins can only ever report this as noise.

**With that fixed, the production gate is green: 411 passed + 1 flaky = 412, both shards exiting 0.** So recipe now has a recorded production number alongside its dev one, which is what F22c was
for.

**It does not retire `git.spec:533` from the _dev_ flake pool, and the reason is worth knowing.**
The final dev run came back **410 passed + 2 flaky = 412**, and `:533` was one of the two — failing
with `apiRequestContext.get: read ECONNRESET` on `GET /settings/test-invalidate-cache`, inside
`resetData()`, before the test had done anything at all. That is the dev server dropping a
connection during the fixture reset. It is a second, unrelated intermittency that happens to live
in the same spec, which is why "`:533` is flaky" was never one fact and why chasing it as one
produced three passes of wrong answers. The production race is fixed; this one is infrastructure
and is left alone.

**Triage of the other three standing build-path flakes — none is an engine defect.**
`reference-updates:114` and `featured-recipes:163` passed outright in both production runs.
`reduced-motion:24` retry-passed in the second, failing its _first_ assertion — that an ordinary
transition is longer than 0.01s — with a measured `0`, which is a page-not-yet-styled race in the
test and not about reduced motion at all. The first run's flake was
`recipe-item-records.spec.ts:125`, an `EEXIST … mkdir test-content` collision in the harness's own
fixture reset, the same shape the demo hits. Fixing these was explicitly out of F22's scope and
they are left alone; what changed is that they are now diagnosed rather than pooled.

**F23 — `flattenMarkdown` drops every real description, so the search index has none.** Found by
F4a's per-field measurement (§12.8), which expected `description` to be ~18% of the search corpus
and measured **0 bytes across all 436 recipes** — while 424 of the 436 source files carry one.

`recipe-website/common/controller/buildIndexValue.ts` compiles the description's markdown and
reduces the node array, concatenating a node only when it is a string or when its `props.children`
**is a string**. A single paragraph of plain prose satisfies that; anything real — several
paragraphs, a link, a list — compiles to nodes whose `children` are arrays, contributes nothing,
and flattens to `""`, which the `|| undefined` then drops. `websites/resume-builder`'s copy of the
same function has the same shape.

The consequences are all silent: `description:` filters match nothing, the ⌘K palette renders no
subtitles, and `description`'s seat in the FlexSearch priority order is inert. **No test catches
it because every description in the `search-corpus` fixture is a single plain sentence** — the
one shape that flattens correctly. That is the fix's first requirement: a fixture recipe whose
description has a paragraph break and a link.

Not F4a's to fix — it reshapes `RecipeEntryValue` and needs a fixture rebuild, which is an index
change rather than a corpus-transport one. Worth doing before F4b: it moves bytes onto
`search/all`, which is the half F4b deliberately leaves whole.

**The content index is not its only consumer.** `components/View/JsonLD/index.tsx` flattens the
same way for `HowToStep.text`, once per instruction — full markdown prose, the same array
children, the same `""`. So every recipe's structured data has been publishing empty instruction
steps to search engines, which is the one consequence of this defect that is visible outside the
site. One flattener, two consumers, one fix.

> **Done.** `flattenMarkdown` recurses into array children, with block-level tags contributing a
> separator so paragraphs and list items do not fuse, and the whitespace runs collapsed once at
> the end. `Multiplyable` keeps its own branch and its check on the literal string type: the node
> is self-closing, so a rewrite that recursed into `children` would have dropped every quantity
> out of every ingredient while looking correct on prose. `test/flattenMarkdown.test.ts` is the
> function's first unit test and pins that case beside the prose ones.
>
> `websites/resume-builder`'s copy is deleted rather than fixed. It was byte-identical, exported,
> and imported by nothing — `buildResumeIndexValue` copies `company` and `job` and never called it.
>
> **The fixture script would not have repaired anything, and that was a second defect
> (§12.9).** `rebuildFixtureIndexes` re-derived the content index only for types declaring
> `references`; everything else got `updatePaginationIndexes` + `updateAggregates`, which
> recompute from the **existing index values** and never call `buildIndexValue`. Recipes declare
> no `references`, so the one script whose header promises to handle "changing what its index
> value carries" excluded exactly that case. Every type now goes through `rebuildIndex`.
>
> **Nothing self-heals and nothing goes red, and that is the shape of the whole finding.** The
> content index carries no spec hash, so there is no version to bump — `specVersions.test.ts`
> watches `paginationConfigs.ts` and would not have noticed either way. A live site needs the
> Maintenance page's "Rebuild recipe index"; a fixture needs the script; and until someone runs
> one of them the index goes on serving the old projection with every test green. A derived kind
> with no hash is a derived kind whose staleness is invisible.
>
> **It costs 81 KiB on the unconditional page-load path**, which is the honest price of a field
> that was supposed to be there. Measured in §12.9.

**F24 — `openCachedEnvironment` closes an environment other readers are still holding.** Found
by F4a's first container gate, which answered **500 on both new corpus routes, alternately, five
times in the first half-minute** — `MDB_BAD_RSLOT: Invalid reuse of reader locktable slot`.

The mechanism is a yield in the middle of a read. `content/readContentIndex.ts` awaits the range
read and calls `getIndexCount(db)` **after** that await:

```
const entries = await entriesIterator.asArray;   // ← yields
const total = getIndexCount(db);                 // ← db may no longer be the db it was
```

During the yield another request reaches `openCachedEnvironment`, finds the content directory's
`data.mdb` inode changed, and takes the invalidation branch — which **closes** the cached
environment. The first read resumes against a closed environment and throws. The comment on that
branch asserts the opposite ("Nothing can still be reading it: the file it maps no longer
exists"); the file being gone says nothing about whether a reader is mid-await on the mapping.

**Two concurrent readers of one content type is all it takes**, and this repo had never routinely
had them: one page render plus one corpus route, never overlapping on the same index. F4a made
the client fetch two corpus routes at once and the gate found it immediately. Fixture-reset
traffic is what supplies the inode change, so the editor's Playwright suite reproduces it and an
ordinary dev session does not — the invalidation branch only fires when the content directory is
swapped underneath a running server, which is `resetData` on every test and a git sync in
production.

**F4a did not fix this; it withdrew the concurrency it had added.** Both routes now go through
`getSearchCorpus()` in `recipe-website/common/controller/data/read.ts`, a single in-flight read
they share, which puts the number of concurrent readers back where it was before the split. The
race itself is untouched and still reachable — any two overlapping reads of one index will do it.

Fixing it properly means the environment cache knowing whether a reader is live, i.e. refcounting
around `readContentIndex`. Note what is _not_ an acceptable fix: retiring the old environment
without closing it. The test harness swaps content directories hundreds of times per shard, and a
retained mapping per swap spends file descriptors against a 1024 default — the close is there for
a reason, it is only the timing that is wrong.

> **Done.** The invalidation branch now _retires_ the environment — drops it from the cache, keeps
> it open for a grace period, and closes it after. Both halves are pinned by
> `test/environmentCache.test.ts`, the first unit test this file has ever had: four of its five
> cases are red on the commit before.
>
> **There is a worse failure than the 500, and it is what settles the "just don't close" option.**
> A closed environment throws `Can not read from a closed database` on the next read, which a
> request turns into a 500 — but the abandoned read transaction also leaves a reset timer behind,
> and that throws `Attempt to reset an invalid read txn` from `processTimers`, where no
> request-scoped `catch` can reach it. Measured directly against `lmdb@3.5.1`. The mode this
> defect could reach was never "some 500s"; it was "the server exits".
>
> **Refcounting turned out not to be implementable at the cache, and the reason is worth
> recording.** A refcount needs a release edge. The three wrappers — `getContentDatabase`,
> `getPaginationDatabase`, `getAggregateDatabase` — are synchronous getters, so they can supply an
> acquire and nothing else; and the hazard is a handle held _between_ operations, where an
> operation-level count sees nothing in flight to hold. Counting `getRange` iterations and pending
> writes would not have caught F24's own reproduction, which is a plain `getIndexCount` after an
> `await` on a range that has already completed. The only fully general fix is a scoped
> `withDatabase(fn)` at all 18 call sites, several of which hold the handle across an entire corpus
> scan (`rebuildIndex.ts:54-83`). **Deferred, and it should stay deferred until something needs
> it** — the grace period covers every reader that finishes within five seconds of acquiring, and
> the reads it guards are single-digit milliseconds.
>
> What the grace period does not cover is a directory swapped **twice** while one reader is still
> inside a read. That is bounded by the same five seconds and has no observed instance.
>
> Two smaller things rode along. `readContentIndex` now takes its count **before** the await, so
> the function that found the defect no longer depends on the grace period at all. And the two dead
> uncached `open()` helpers — `recipe-website/common/controller/database.ts` and
> `featuredRecipeDatabase.ts` — are deleted; they were the only counterexamples to "every `open()`
> goes through the cache", and nothing had imported either since F1.

**F25 — `search-query-language.spec.ts:129`'s first assertion can only pass inside the debounce
window.** The test fills `tag:` and expects the ticker to read `ALL 67 RECIPES`, on the reasoning
that a field with no operand is not a filter, so the browse view stands. The browse view does
stand — 67 matches, 60 cards revealed — but `SearchTicker` branches on the **raw query string**,
not on the parsed free text, so once `SearchInput`'s 180 ms debounce commits `tag:` to the query
the line reads `67 results · “tag:”` and stays there.

So the assertion is satisfiable only in the ~180 ms before the debounce fires. On an idle host
Playwright's first poll wins that race every time; under container load `fill()` itself can take
longer than the debounce, and then no poll ever matches. **Measured on both sides:** a spec that
waits 3 s after the fill reports `"67 results · “tag:”"` on F4a's branch _and_ on its parent
commit, identically. It is a pre-existing latent race, not something the corpus split caused —
which is worth stating plainly, because it failed in both of F4a's container gates and looks like
a search regression.

The one-line fix is to assert on what the test actually means — that the browse view stands, i.e.
the card count — rather than on the ticker's wording. Left alone at F4a because its brief was that
the three existing search specs stay green _unchanged_, and editing one to fix a race it already
had is a different change.

> **Closed.** The assertion now reads `expect(listItems(page)).toHaveCount(60)`, which is the
> file's own idiom for this state — step 4 of the same test already asserts it. The ticker is no
> longer asserted on here at all, because there is no wording it can carry that is both true and
> stable across the debounce.

**It passes in the production run and fails in the dev one**, which is the same story from the
other side: `next start` answers the fill fast enough to leave the debounce window open, two dev
shards on one box do not. A test whose verdict depends on which mode you gate in is worth fixing
before it is worth trusting.

**F28h — `references.ts` carried a raw NUL byte, so the file could not be `grep`ped. Done.** The
resolver's cache key is `` `${contentType}\0${slug}` `` (`references.ts:124`). The separator is sound
— NUL cannot occur in a content type or a slug, so no pair of them can collide on one key — but it
was written as the **literal control byte** rather than as the `\0` escape. Two consequences, and the
second is the one that matters:

- `file` reported the source as `data` rather than as JavaScript.
- **Plain `grep` silently matched nothing anywhere in the file.** Not in the line with the byte in it
  — in the entire file. `grep -c import references.ts` printed nothing and exited non-zero, and four
  searches while planning F28 came back empty against a file that plainly contained what was being
  looked for.

One character, byte-identical at runtime (`` `a\0b` === "a" + String.fromCharCode(0) + "b" ``), and it
gets its own entry rather than a footnote in F28 because a source file that cannot be searched is a
trap for every later reader, not a style preference. `grep -rlP '\x00' --include='*.ts' packages
websites` returning nothing is the standing check; it now does.

**F30 — `readAllIds` creates the index it reads. Open, filed by F29.** `readAllIds` calls
`getPaginationDatabase` **unguarded** (`readAllIds.ts:16`). Against a content directory that
predates the adoption of the index it names, that both **creates** an empty environment and
returns `[]`. Measured on a copy of portfolio's `projects` fixture with
`projects/pagination/` removed:

```
before: pagination dir exists = false
readAllProjectIds() = []
after:  pagination dir exists = true
```

The consequence in a static export is total and silent: `generateStaticParams` emits only the
placeholder param, **every content page disappears from the build**, and nothing goes red — the
build succeeds, `out/` is well-formed, and the missing pages read as "the corpus is empty". It is
the D2a "anything it opens, it creates" trap on a new surface, and it is why D2a's dependent pass
got a `pathExists` guard.

**Why it is survivable today, and why that is not a fix.** Both sites' export actions call
`rebuildIndex` before invoking the build (`exportAction.ts:46` in portfolio,
its recipe counterpart), and `rebuildIndex` forces a pagination rebuild once the config declares
one — verified on the same stripped corpus, where it repopulates all five slugs even though the
empty environment already exists. What is _not_ covered is a standalone `next build` of an export
app, which is how the F7 checks and the incremental-export spike run.

**The fix is D2a's, one line: `pathExists` before `getPaginationDatabase`, returning `[]` without
creating anything.** F29 deliberately did not build it — recipe carries the identical hazard and
accepted it, so matching that keeps the two sites behaving alike, and an adoption PR is the wrong
place to change engine semantics. Worth pairing with the same guard on the other unguarded read
paths when someone takes it.

**F31 — three loose ends, batched because each is too small to be a PR. Done.** Nothing depends on
it and its three parts do not depend on each other; they are one PR because three one-line PRs is
worse bookkeeping than one three-part PR. Numbered **F31** rather than F29: it was planned and
written as F29, and F29 and F30 were both claimed while it was in flight — F29 by portfolio's
adoption above, F30 by the `readAllIds` hazard that adoption found. Renumbered on the way in rather
than argued about, since the number is a label and the collision is what a parallel stack looks like.

**F31a — `getFeaturedRecipes` deleted.** F7 left it callerless and said so; this took the decision
F7 deferred. The details, and the two past-tense comments that deliberately survive it, are in
§11.2 under F7.

**F31b — `exportStaticParams.test.ts`'s timeout fixed at the cause, not the budget.** §12.13 had it
as a load-induced flake "not worth a tag". It was neither load-induced nor a flake: the file's first
test pays a Next page's cold transform for the whole file. A `beforeAll` moves that cost off the
first assertion. Full reasoning and the numbers are in §12.13.

Worth generalising, because this file is not special: **any vitest file whose tests `import()` an app
router page charges the first test with the transform of everything that page pulls in.** Three
others in `test/` import app code (`recipeRoutes`, `tagRoutes`, `searchRoutes`), and none has been
seen near the limit — but the pattern to reach for if one is, is the warm-up hook, not `testTimeout`.

**F31c — a doc-truth defect of F28's own.** §0 asks each PR to leave this document true, and F28 did
not: the hygiene note at §11.4's F21c gates read "unrelated and **unfixed**" about the NUL byte —
while F28h, four hundred lines below **in the same PR**, fixed it. A note describing a closed item as
open is worse than no note, because it sends the next reader to fix something already fixed.
Repointed at F28h.

> **A second defect was on this list and F29 fixed it first, better.** §10's **F7** row read a plain
> `**Done**` while §11.2 said "Done for two of six routes", so the row a planning pass scans made a
> partially-adopted item look finished. F29 qualified it in the scope cell _and_ corrected the
> denominator — the sixth route never existed — so the row now reads "two of five (a third at F29)"
> and there is nothing left here to fix. Recorded rather than dropped silently, because "two people
> found the same doc defect independently" is the argument for §0, not a coincidence.

**Gates: 268 vitest green** — F31 adds no tests of its own — **and `exportStaticParams.test.ts` alone
at 5 passed with no test above 3 ms** (it was 860 ms). Plus a clean `tsc --noEmit` in the editor,
which is what actually proves F31a's deletion has no callers — `grep` proves it too, but only the
typecheck proves the four orphaned type declarations went with it. No container gate on F31 itself:
no rendered output moves.

**Where the engine stack stands after this.** Every row in all three §10 tables is Done or Deferred,
and no deferral turns on an event nobody can recognise — F28 gave F12, F18 and F8b each a number.
What is left in §11 is mostly ahead of need rather than deferred on a guess: F6's list UIs wait on a
paging affordance rather than a transport swap, F7's two remaining routes wait on `pages` declaring
an index for content types with **0 pages in production**, and F13 waits on an export framework that
does not exist. §0 says §11 "is deliberately over-complete: it is a survey of the whole repo, not a
commitment to build all of it", and that is the distinction being honoured.

**One thing here is not ahead of need: F30.** It is an open, reproduced, silent-total-failure hazard
(`readAllIds` creating the index it reads, so a standalone export build emits no content pages and
goes green), and it now applies to recipe and portfolio alike. It is the one row in §11 that is a bug
rather than a not-yet.

---

## 12. Verification

**12.1 `test/pagination.test.ts`** — **done, 39 tests green** (26 from P1, 12 added by P2, 1 by
F16).
Vitest,
`// @vitest-environment node` (the repo default is jsdom and this opens real LMDB envs in a
tmpdir). The anchoring properties are the heart of it:

- **append dirties only the head**: `dirtyPages === [headPage]`, and every sealed page's stored
  hash is byte-identical.
- **sealing**: appending until the head reaches `perPage` increments `headPage`, exposes exactly
  one new numbered page, and changes no existing page.
- **write amplification**: the count of PAGED keys written on an append is measured (by wrapping
  `db.put`) and bounded by `perPage` over a 48-item corpus, not by N.
- **backdated insert** dirties the insertion page through the head and nothing older; **delete**
  of an old item populates `removedPages` and dirties from that page forward.
- `readHead` returns `perPage + 1` … `2 * perPage` items across five corpus sizes and never
  overlaps a numbered route; landing plus numbered routes cover the corpus exactly once; the
  small-corpus cases (`headPage` 0 and 1) produce no numbered routes.
- **covering**: `readPage` returns complete render-ready items after the _content_ index
  directory is renamed away.
- **projection precision**: editing a projected field dirties exactly one page; editing an
  unprojected field leaves every hash unchanged _and_ leaves `version` untouched; changing
  `project` or `perPage` changes `specHash` and forces a rebuild.
- **forward-only reads**: a page comes back newest-first from a plain forward seek, and
  `newestFirst: false` comes back ascending.
- `rebuildInProgress` set by hand ⇒ the index is rebuilt rather than read; and an index with no
  meta at all builds itself from the content index on first use.
- a second index with a different `key`, `project`, `perPage` and `filter` over the same content
  type stays independent — an edit that changes only the filtered index reports `unchanged` on
  the other.
- `readAfter` walks a 23-item corpus with no duplicate and no gap, and picks up an item inserted
  below the cursor between calls.
- page contents match a naive offset-based reference implementation over a 34-item corpus.

P2 added: `force: true` re-derives an index whose meta says it is current, discarding an entry
the content index no longer has; a forced rebuild reports every page dirty (no diff source) and
clears `rebuildInProgress` even on an empty index, where it produces no dirty pages at all;
`syncPaginationIndexes` keeps the index correct across create / update / delete / **rename**,
and returns `[]` having written nothing for a config with no `paginationIndexes`; the artifact
unions dirty pages across two writes, keeps content types apart, writes nothing when handed no
results, and empties on `clearPaginationChanges`.

**12.2 `packages/cms/demo`** — **done, 109 e2e tests green in `next dev`** (6 added by D3's
infinite-scroll specs, §12.4; 103 at F19a, 97 at F10b, 90 at D1, 82 at P2; the count excludes
the four fixture-generator tests, which run as a separate Playwright project). This entry sat
at 103 through D3, which is why 109 existed only in `06eee686`'s commit message.

**The mode is part of the number.** Every count above is a **dev-server** count, and dev is the
suite's contract: the CI job (`.github/workflows/playwright.yml`) and the container service both
run `pnpm dev:test`. The mode used to go unstated, and that is exactly how a stale-build run got
mistaken for a regression — see F20's "why nothing caught it".

**Production mode now passes, and it is a gate rather than a diagnostic.** `pnpm e2e-start` is
**109 passed, 0 failed, 0 flaky with `retries: 2` disabled** (1.8 min, of which ~50s is
`next build --webpack`). It got there by fixing the suite, not the adapter: F20's failures were
three `waitForURL` calls that matched the URL they were already on.

Three ways to reach it, and all three are now wired:

- **CI** — the `demo` job is a `mode: [dev, prod]` matrix, `fail-fast: false`, the prod cell
  setting `PLAYWRIGHT_BUILD: 1`. Two cells rather than one job because a mode that only ever
  runs by hand is a mode nobody runs; F20 sat unnoticed for six passes on exactly that.
- **Container** — `scripts/run-demo-tests.sh --prod`. The flag is `--prod` and not `--build`
  because `docker compose run --build` already appears in that script meaning something else
  entirely. It reports into `blob-reports-demo-prod`, kept separate so a merged report can
  never show 218 tests or attribute a failure to the wrong server. Measured at **109 — 108
  passed and 1 flaky**, 2.1 min including the build. The flake is `update.spec.ts` "should
  update note date" failing `EEXIST … mkdir '/app/packages/cms/demo/test-content'`, which is
  the same container-timing class §12.2 already records for the dev container run and nothing
  to do with cache invalidation. Stated as "108 + 1 flaky" rather than a bare 109 for the
  reason §12.2 gives.
- **Host** — `pnpm e2e-start`, unchanged.

**Recipe and portfolio stay dev-only, deliberately.** Recipe's suite is 412 tests across two
shards and its build is minutes, so a prod cell there would cost far more than it could catch:
its coverage of this class is one spec, `recipe-item-records.spec.ts`. If that changes, add a
prod job pinned to that file rather than converting the shards.

**In the container:** `scripts/run-demo-tests.sh`, i.e. `SITE_DIR=packages/cms/demo` and
`PLAYWRIGHT_PROJECTS=--project=e2e` against `docker-compose.test.yml`'s profile-gated `demo`
service. 109 there too — though as 107 passed and 2 flaky, both in `update.spec.ts` ("should
update note date", "should show 404 for editing non-existent note"), which pass on the first
retry and are container timing rather than anything in F20's class. Said out loud because a
bare "109" that quietly means "109 after retries" is the same understating that made §12.2 wrong
for three passes. The project pin is a correctness guard rather than a filter: the
`generators` project rewrites the fixtures under `playwright/fixtures/` in place, so an
unpinned run would silently regenerate them. A pinned run leaves the working tree clean, which
is worth checking after any change to that variable. A
`/notes/browse` landing and `/notes/browse/[page]` numbered routes beside the untouched
homepage, a `many-notes` fixture of 14 notes at `perPage: 4`, and `pagination.spec.ts`. The
demo calls `createContent`/`updateContent`/`deleteContent` inline from `"use server"`
functions rather than through `createGenericActions`, so it verifies the core write path and
the Next adapter; `genericActions` gets its real exercise at P3.

The payoff assertion: creating a note reports `dirtyPages: [3]` and nothing else, and
`/notes/browse/0` and `/1` render **byte-identically** to before. Also covered: an edit dirties
only its own page, a rename follows the item with no orphan and no duplicate, deleting two old
notes shifts every later page and populates `removedPages` when the head collapses, the
artifact unions dirty pages across two writes, and a bookmark write records nothing at all.

Two things the harness needed, both worth knowing before writing a similar suite:

- **Specs clear the artifact _after_ `resetData`.** It is a dotfile inside the content
  directory and `copyFixtures` copies the directory whole, so a fixture carries whatever the
  generator's last write recorded.
- **`resetData` posts to `/test/reset-cache`.** Rewinding the content directory to a fixture is
  not a write, fires no cache tags, and leaves the running server with no way to learn the
  corpus went backwards — so a page cached by one test leaked into the next and results
  depended on run order. The route calls `revalidateTag(catchAll, { expire: 0 })`;
  `revalidateTag` rather than `updateTag` because the latter throws outside a Server Action.
  **It must list every paginated type**, which is the line D1 had to add for bookmarks.

D1 added `references.spec.ts` against a new `many-bookmarks` fixture — three notes and fourteen
bookmarks at `perPage: 4`, grouped so each note's bookmarks sit on a known page. The payoff
assertion is §12.2's applied across a type boundary, which is D1's thesis check: **retitling a
note reports `dirtyPages: [1]` for `bookmarks/by-date` and leaves `/bookmarks/browse/0`
byte-identical**, where before D1 an edit that changed no slug fired nothing anywhere. Also
covered: the homepage rendering a borrowed title with no note read; editing an unborrowed field
recording nothing under bookmarks while notes still moves; a rename rewriting the reference and
dirtying **zero** pages; a rename that also retitles dirtying exactly page 1; deleting a note
leaving its bookmarks listed with the title gone and the reference intact; and creating a note
backfilling a bookmark that pointed at it before it existed.

**12.1b `test/references.test.ts`** — **done, 23 tests green** (D1). Same harness shape as
§12.1: node environment, real LMDB in a tmpdir. Unlike §12.1 it drives the **real write path** —
`createContent` / `updateContent` / `deleteContent` / `rebuildIndex` — rather than a harness
that imitates it, which makes it the first unit coverage that path has ever had. Safe because
`commitContentChanges` no-ops when its content directory is not a git repository; the suite
points `CONTENT_DIRECTORY` at the tmpdir so that is explicit rather than incidental.

The two halves of the trigger are the heart of it:

- **positive** — editing a borrowed field dirties exactly the pages showing it, and every other
  page's stored hash is byte-identical;
- **negative** — editing an unborrowed field returns `dependents: []`, calls `buildIndexValue`
  zero times, leaves every page hash and the pagination `updatedAt` untouched, and records
  nothing in the artifact. **This half did not exist before D1 in either direction.**

Also covered: covering values materialized and confined to the declared fields; a dangling
reference resolving to `undefined` without throwing; a later create backfilling one; a rename
rebuilding each dependent exactly once and reporting `rebuilt: false`; a rename that changes
nothing displayed dirtying zero pages; the delete cascade clearing borrowed values while leaving
the dead slug in place, in both the index and the data file; K dependents producing one result
set per index; the resolver still answering after its data file is deleted, which is what proves
one read serves N dependents; `forget` making it look again; rebuild order-independence; the
cascade repairing a value edited behind the engine's back, and stopping when told to; the cascade
terminating on a two-type cycle; both thunk directions resolving; and no orphan left when a
dependent's index key moves.

**12.3 The thesis check — run at P3, passed.** Build `websites/recipe-website/export` against a
40-recipe content directory, add a recipe, rebuild, and diff the two `out/` trees. **No
`/recipes/N` file changed**, HTML or RSC payload — that is the claim the whole design rests on.
`/recipes/[page]` also emitted exactly `/recipes/1` and `/recipes/2`, from one meta read.

What did differ, all of it expected — and read against §2, the list is exactly "every derived
kind that has no regeneration set yet":

| File                     | Why                                                               | Kind (§2)       |
| ------------------------ | ----------------------------------------------------------------- | --------------- |
| `/index.html`            | the homepage's newest-six strip, then still on `readContentIndex` | pagination      |
| `/recipes.html`          | the landing — the surface that is _supposed_ to change            | pagination      |
| `search/all`             | the whole search corpus in one file (§11.1/F4)                    | corpus document |
| `search/version`         | its version marker — correctly, since the corpus did change       | corpus document |
| `/recipe/recipe-41.html` | the new recipe's own page                                         | item page       |

`search/all` is F4 territory: chunking the corpus is what makes it stop moving, and until then
it is outside P3's claim rather than a counter-example to it. (F4a has since split it in two,
so a re-run of this check would show `search/ingredients` moving on the same write and for the
same reason — the split changed what the client _fetches_, not what a write rebuilds. Making it
stop moving is F4b's job, and that is the row it is aimed at.) `search/version` was in the same
bucket when this was written, but the two are not the same case and F3 separated them. Adding a
recipe _is_ a corpus change, so this row was always a correct move; the defect was that the
mtime proxy also moved when nothing changed. Since F3 the marker is `versionOf(meta)`, which
moves here and nowhere else.

`/index.html` was classed **aggregate** here until F10a corrected it (§11.1). It is a bounded
read of the newest six, so it belongs to the pagination kind — and it is _supposed_ to change
when a recipe is added, exactly as `/recipes.html` is. What was wrong was not that it moved but
that nothing could tell it to: `readContentIndex` carries no tag. Since F10a it reads the same
head the `/recipes` landing does and shares its tag, so it is no longer on the list of surfaces
without a regeneration set.

**Two things the check itself surfaced, both worth knowing before running it again:**

- **The diff must be normalized, twice over.** Next stamps a random build id into every HTML
  file (`<!--tPNg0yJ7RKN…-->`) and into `_next/static/<buildId>/`, so a raw `diff -rq` reports
  the entire tree. Substitute it out first. Then note that a handful of `/recipe/[slug]` pages
  still differ — module reference ids inside the RSC flight payload get renumbered — and that
  this is **build nondeterminism, not content**: building the _same_ content twice changes a
  different arbitrary subset of those pages each time, while the rendered markup is byte-
  identical. Verify by building twice with no change before blaming a code change.
- **`output: export` rejects an empty `generateStaticParams`.** "Page … is missing
  `generateStaticParams()`" is raised for an empty array, not just a missing function — so a
  route must emit at least one param even when it has no pages. `createPaginatedIndexRoute`
  emits `firstPageNumber` and lets `numbered` 404 it, which matters for any corpus small enough
  to fit in the landing fold (`headPage <= 1`, i.e. under `2 * perPage` items) — the common case
  for a new site, and the state `many-featured-recipes` is in today (§10). The `<=` bound in the
  featured-recipes loop was quietly providing the same guarantee, which is why fixing its
  off-by-one needed `max(1, ceil(…))` rather than `<`. Unrelated but adjacent: a content
  directory with **no** featured recipes cannot be exported at all today, since
  `/featured-recipe/[slug]` then returns an empty array. Pre-existing, not P3's, but it will
  bite whoever runs this check on a fresh corpus. **It did, and it is fixed — see §12.7b.**

The Playwright equivalent, which runs on every suite, is
`editor/playwright/tests/recipes-pagination.spec.ts`: against the 40-recipe `many-recipes`
fixture it captures the rendered HTML of `/recipes/1` and `/recipes/2`, creates a recipe, and
asserts both are byte-identical afterwards while the landing gained the new one.

**12.3b The same check for featured recipes — run at D2b, passed.** The `pagination` describe in
`featured-recipes.spec.ts`, rewritten wholesale onto `many-featured-recipes-paged`, ports every
assertion from the recipe spec: landing fold, per-page contents, exact-cover union, 404s for the
head / the folded page / page zero / nonsense, the Newer-Older walk, `pagination-page-number`
present on numbered pages and absent on the landing, and the thesis — a 41st feature leaves both
sealed pages byte-identical while the landing gains it.

The export build was run against the featured corpus too, in both shapes that matter. Against the
40-item fixture `/featured-recipes/[page]` emitted exactly `/1` and `/2`, holding `feature-12…01`
and `feature-24…13` while the landing held `feature-40…25` — an exact cover of 40 with no overlap,
read out of the emitted HTML rather than inferred. Against the **1-item** `one-featured-recipe`
corpus the build succeeds and writes a 404 body at `/featured-recipes/1`, which is the empty-
`numberedPages` case the note below is about; a hand-written `generateStaticParams` returning `[]`
would have failed the build outright.

**12.4 Infinite scroll — asserted at three levels, because the property lives in three places.**

The property itself is one sentence: following `olderPage` from any seed visits every item
exactly once and stops. It belongs to the index, not to the client, so it is pinned where it is
cheapest first and only then through a browser.

- **`test/paginationJsonRoute.test.ts`** (12 tests, no LMDB — three plain functions handed to
  `PaginatedIndexReads`) walks head → page → page over a simulated 14-item index and asserts the
  cover is exact. Plus the head's `olderPage` being `headPage - 2` specifically, the
  `firstPageNumber` offset in both directions, a non-numeric param, an out-of-range page, an
  in-range page that reads back null, and `generateStaticParams` never returning empty.
- **The demo** (`packages/cms/demo`, 6 specs) does it through a browser against the 14-note
  fixture: the JSON routes answer with the same pages the HTML renders and refuse what it
  refuses; scrolling appends until all 14 are present with no slug twice; `/notes/browse/1` seeds
  there and walks older only, never reaching note-09; a failed fetch keeps a real link to the
  next numbered page and retries rather than looking like the end; turning the mode off returns
  the list to what the URL names.
- **The recipe site** (8 specs, `recipes-infinite-scroll.spec.ts`, 40-recipe fixture) covers the
  same walk plus the F9 UX: the default is numbered; the toggle never navigates; the preference
  survives a reload; `/recipes/2` seeds there and appends `recipe-24…01` without ever showing
  recipe-25; the "Load more recipes" control is a real link to `/recipes/2`; and under
  `prefers-reduced-motion: reduce` scrolling appends nothing while the button still advances a
  page per click.

Three more (`recipes-pagination.spec.ts`) assert the JSON routes serve exactly what the HTML
routes do, including the 404 set — the two must not drift, since a deep link seeds the client
list from the numbered payload for the page the server just rendered.

**The safety property: no existing snapshot moved.** Checked rather than assumed — no `visual`,
`mobile` or `empty-state` spec visits `/recipes` at all, so the new control is in no baseline.
The seven pre-existing tests in `recipes-pagination.spec.ts` pass **unedited**, which is what
defaulting to `pages` was for.

**12.5 Regression** — existing Playwright suites for recipe-website and portfolio stay green,
since the write path changes. There are now **three** containerized suites rather than two:
recipe (`scripts/run-sharded-tests.sh`, **412** — 229 in shard 1 and 183 in shard 2 at
`SHARD_TOTAL=2`), portfolio (`scripts/run-portfolio-tests.sh`), and the cms demo
(`scripts/run-demo-tests.sh`, 109 dev / 109 prod). Recipe now records both too: **412 dev / 412
prod**. "None exercises a production build" was
half of what **F20** was about, and it is no longer true: the demo runs both modes in CI
(`mode: [dev, prod]`) and in the container (`--prod`), green at 109 either way with retries
disabled. **F22c gave recipe the same button** — `scripts/run-sharded-tests.sh --prod` — for the
reason F22a exists: `next dev` serves with `no-cache`, so the site with the most tagged reads was
gated only in the mode where a stale read cannot be seen. Portfolio remains dev-only for the cost
reason in §12.2. The full vitest suite stands at **244 tests green** (134 at D0, plus §12.1b's
24, plus F10b's 16, plus F8's 1, plus F19a's 19, plus D3's 12 — 206 — plus F2's 6 in
`test/readContentIndex.test.ts` — 212 — plus F16's 6: five in `test/specVersions.test.ts` and
one in `test/pagination.test.ts` for the half of the new rule that is a non-event, an edited
projection at an unbumped version not rebuilding — 218 — plus F21a's 9 in
`test/derivedPaths.test.ts` and F21b's 8 in `test/revalidateDerived.test.ts` — 235 — plus F22b's
4 in the same file for the per-seat subsets — 239 — plus the spike's 5 in
`test/exportStaticParams.test.ts` for the empty-`generateStaticParams` rule (§12.7b); F7, F20,
F21c, F22a and F22c added none, being harness and documentation passes). **244.**

> **Found at F16 — `run-sharded-tests.sh` could not run the gate this section names, and said
> it had.** Three defects, discovered by trying to use `SHARD_TOTAL=2` as written above. The
> third is the one that matters and it is F20's shape exactly: a gate reporting green for a run
> that never happened.
>
> 1. **`docker compose up` was given no service names**, so it started every default-profile
>    service. At `SHARD_TOTAL=2` that brought up shards 3 and 4 too, which ran `--shard=3/2` —
>    rejected by Playwright — and tore the run down before a test ran.
> 2. **`AUTH_SECRET` was only ever passed through from the caller's environment.** An ordinary
>    shell got `MissingSecret` from next-auth on every page. `run-portfolio-tests.sh` has read
>    it out of `.env.local` all along, comment-stripping included; recipe's runner now does the
>    same. (Also worth knowing on the way past: the containers write `blob-reports/` as root, so
>    the script's own `rm -rf` failed on the previous run's leftovers and `set -e` aborted
>    before the build. It is cleared from a container now.)
> 3. **`--abort-on-container-exit` made the fastest shard kill the others.** Measured: shard 2
>    (183 tests) finished in 15.7 minutes and SIGKILLed shard 1 (229 tests) at roughly two
>    thirds done, exit 137. Compose reports the _first_ exit, so the script returned **0**, and
>    `blob-reports/` held one zip instead of two — a merged report of whatever the quick shard
>    did. A "412 green" produced this way could mean "180 passed and the rest was killed". The
>    flag is gone; `up` now waits for every named shard, and the script inspects each container's
>    exit code and keeps the worst.
>
> The counts in this section — 229 and 183 — are the two shards' _announced_ totals and are
> right; 229 + 183 = 412 is the suite's real size. What was never verified before F16 is that
> both shards ran to the end in one invocation. They do now: **411 passed and 1 flaky out of
> 412**, shard 1 in 14.4 minutes and shard 2 in 10.4, both exiting 0, with two blob reports
> merging to the full count. The flake is `edit.spec.ts` "should be able to edit a recipe",
> which passes on retry. No visual baseline moved.

**12.1c Aggregates — `test/aggregates.test.ts`, node environment, real LMDB in a tmpdir.** The
two halves of the trigger, in the shape §12.1b uses for references. **Positive:** a genuinely new
tag moves the value and reports `changed`. **Negative:** a retitle leaves the value _and its
stored record, `updatedAt` included_ untouched and reports nothing — a no-op pass must not be
detectable downstream. Also covered: a config declaring no aggregates creates not even a
directory; a tag that already exists elsewhere changes nothing; deleting the last carrier of a
tag drops it; one walk serves every declared aggregate; a `version` bump rewrites the record
without reporting a content change; a second pass over an unchanged corpus reports none;
an emptied corpus folds to an empty value; `readAggregate` returns `null` before the first pass
and never computes on read; and the sync seat reports one list per kind, including for a content
type with aggregates and no pagination index.

**12.1d Item records — `test/itemTags.test.ts`, node environment, real LMDB in a tmpdir.** The
same two halves, but this kind forces them into a different place, and the reason is worth
keeping. Pagination and aggregates each _report_ what they changed, so §12.1b/§12.1c assert the
negative against an engine return value. The item kind has no such value — the fired tag list
**is** the trigger — and a tag fired too eagerly re-renders byte-identical HTML, so no Playwright
spec anywhere can tell over-firing from correct firing. That case exists only here, which is why
`revalidate.ts` exposes a pure `itemTagsForWrite` beside the firing wrapper and why
`test/stub_cache.js` now records `revalidateTag` instead of no-opping it.

**Positive:** a body edit — a field in no index value, no projection and no borrowed field set,
so pagination returns `[]` and no aggregate moves — fires exactly `item:notes:a` and nothing else.
A rename fires the new slug _and_ the old one. A dependent whose data file the write rewrote gets
its own item tag, taken from `DependentWriteResult.updatedSlugs` rather than from any config.
**Negative:** no write of any shape ever fires the catch-all; a sibling item's tag never fires;
a write to a borrowing type fires no tag of the type it borrows _from_ — the production case
being that featuring a recipe changes which recipe the hero renders, not the recipe, and the
choice itself comes from a pagination head the featured write already expires. Also covered: the
`{ expire: 0 }` profile on every tag, since a named profile would withhold read-your-own-writes
from the redirect that follows a write; and `readContentFileOrNull` returning `null` for a
missing slug while still throwing for a file that exists but will not parse.

**12.1e Declared spec versions — `test/specVersions.test.ts`, node environment, no LMDB at
all.** Five tests, one per real config module: recipe's `paginationConfigs.ts` and
`aggregateConfigs.ts`, and the demo's `notePagination.ts`, `bookmarkPagination.ts` and
`noteAggregates.ts`. Each pins an inline snapshot of `{ versions, hash }` — every `version:` the
module declares, in source order, beside a truncated hash of its source text with line endings
normalized. It is the whole of what F16 traded the `fn.toString()` half of the spec hash for, so
what matters is that it **fails**, and that was checked by hand before it was trusted: editing
`recipesByDate.project` to `value.name.trim()` and leaving `version: "1"` alone fails exactly
this one test and no other, in vitest or anywhere else in the suite.

The failure message is the interesting part, not the assertion — it has to tell an author which
of two things to do (bump the version, or accept the hash and leave it), because the test
genuinely cannot tell them apart. That is the cost of file-level granularity, and the reason a
comment edit trips it too. Reading source text rather than importing the modules is what keeps
it runnable from a repo-root vitest: importing `recipe-website-common/*` would pull in Next's
module graph to learn a string.

**12.6 Item records in recipe-website — `playwright/tests/recipe-item-records.spec.ts`.** Five
tests, all editing `description` — chosen rather than convenient, because no index value carries
it, no pagination projection carries it and no featured recipe borrows it, so every other derived
kind reports nothing and only `item:recipes:<slug>` can reach anything. The **homepage hero**
follows the edit, which is the surface that blocked `paginationOnly`; **`/featured-recipe/<slug>`**
follows it too, which is the surface no path could ever have reached. Plus the two halves of the
`null` contract at the API route — 404 for a missing slug, 200 for a present one — and a fixture
rollback proving the type-wide catch-all seat in `test-invalidate-cache`.

Both routes involved are `force-dynamic`, so none of this is _stale_ on today's deployment. What
the cached read changes is that the record now persists in the data cache across requests
(`unstable_cache` is not the route cache), which is exactly what lets these assertions fail if the
write path stops firing.

F19b's gate: the recipe container suite at `SHARD_TOTAL=2`, shards run sequentially with
`--no-deps` — **229 + 172 = 401 passed, 0 failed** (396 before, plus these five), with one
retry-passing flake in `git.spec.ts`. Both apps built; **no fixture regenerated**, which is the
expected result rather than a lucky one — F19 stores no derived state, so
`build-fixture-indexes.ts` needed no new branch.

D2b's gate: the recipe container suite at `SHARD_TOTAL=2`, shards run **sequentially** — **382
passed, 0 failed**, plus one unrelated flake in `youtube-video.spec.ts` that passed on retry.
`SHARD_TOTAL=4` overloads this box and manufactures failures scattered across unrelated specs, so
two sequential shards is the real gate, not a compromise. Both apps were built, not just the
editor — `output: "export"` is the only place an empty `generateStaticParams` is an error.

D1's specific regression gates, all met: `reference-updates.spec.ts` (5 tests, recipe-website)
and the demo's `git.spec.ts` "reference updates" describe (5 tests) stay green **unchanged** —
the rename path's user-visible behaviour is identical, only its invalidation got precise.
Recipes gained no borrowed fields in D1, so any movement there would have meant D1 changed
something it should not have.

**12.7 The incremental-export spike — run before committing to it, and it says don't.** The
question was what it would take to spend the finished regeneration set (§12.3) on an
incremental static export: re-render the five files a write moves instead of all 542 pages.
Three approaches were on the table — **A**, filter `generateStaticParams` and overlay the
result onto the previous `out/`; **B**, migrate to a Vite/RSC renderer; **C**, just cut the
fixed cost. Phase 0 was a day of measurement meant to kill A cheaply if it deserved killing.

**It did.** The headline is not the determinism question everyone expected to be the blocker.
It is that **there is no build time to save at this corpus size.**

All numbers below are `websites/recipe-website/export` against a scratch copy of the real
content repository — **436 recipes**, 20 featured recipes, `by-date` `headPage` 36, 542 pages,
~5,140 emitted files — on an 8-core machine (7 build workers). Turbopack unless stated.

> **Reproducing this.** Copy the content repository somewhere scratch (do not build against the
> live one — opening an index creates it, §10), bring its derived state up to date with
> `pnpm exec tsx ./scripts/build-corpus-indexes.ts <parent-of-the-copy>` from
> `websites/recipe-website/editor`, then build with `CONTENT_DIRECTORY` pointed at it. That
> script is `build-fixture-indexes.ts` with the directory on argv, and it exists so these
> measurements can be re-run against a corpus that is not a Playwright fixture.

**a. Where the build time goes.** "Floor" filters every dynamic route's `generateStaticParams`
to a single param, so 542 pages become 19 — less than any real incremental build would render.

| configuration   | pages | compile | page generation | total             |
| --------------- | ----- | ------- | --------------- | ----------------- |
| full, cold      | 542   | 9.1s    | 7.1s            | 24.0s / 28.5s     |
| full, warm      | 542   | —       | —               | 27.1s / 27.2s     |
| **floor, cold** | 19    | 12.4s   | **1.08s**       | **26.7s**         |
| **floor, warm** | 19    | 9.7s    | **1.04s**       | **21.9s / 22.8s** |

Rendering **523 fewer pages saves 6.1 seconds** of a ~25-second build, and end-to-end the floor
build sits inside run-to-run noise of the full one. Marginal cost per page is **11.6 ms**
wall-clock across 7 workers; the fixed cost — compile, TypeScript, traces, finalize — is
**~22s** and no amount of incrementality touches it.

For per-page rendering merely to _equal_ the fixed cost the export needs roughly **1,900 more
pages**, which at the current 1.24 pages per recipe is about **1,500–2,000 recipes**. That is
where A starts being worth its machinery, and it is 3.5–4.5× today's corpus.

**Warming `.next` is worth nothing either**, so C's first lever does not exist: warm builds
(27.1s, 27.2s) were no faster than cold (24.0s, 28.5s).

**b. `--webpack` does not fix the nondeterminism — it makes it worse.** The standing hypothesis
was that Turbopack assigns module ids differently and that `--webpack`, whose production default
is `optimization.moduleIds: "deterministic"` and which `portfolio/export`, `resume-builder` and
`packages/cms/demo` already set, would make two builds byte-identical. Two cold builds of
identical content, per bundler:

|                                        | Turbopack | webpack         |
| -------------------------------------- | --------- | --------------- |
| files differing (of ~5,150)            | **82**    | **148**         |
| `.txt` payloads differing              | 54        | 98              |
| — pure row reordering                  | 52        | 92              |
| — genuinely different content          | **2**     | **6**           |
| **rendered markup differing (of 503)** | **0**     | **0**           |
| `moduleId → chunks` conflicts          | **0**     | **0**           |
| cold build                             | 28.5s     | 113.6s / 123.5s |

webpack is worse on every axis and ~4× slower. Aligning the recipe apps with the other four
would cost 85–95s a build and buy nothing.

**c. The module table is not renumbered, and §12.3's description of the hazard was wrong.**
§12.3 records the cause as "module reference ids inside the RSC flight payload get renumbered".
Read against actual payloads it is not: there are **20 distinct module ids in the whole export,
the same set in both builds, with zero `moduleId → chunks` disagreements** — under either
bundler. A naive check keyed on `moduleId → (chunks, export)` reports conflicts, but they are
`HeaderNav` and `FooterNav` sharing one module id with different export names, which is a barrel
and entirely legitimate. The global registry is stable. What moves is:

1. **Row emission order** — 52 of 54 differing payloads are identical as an unordered multiset
   of rows. Row ids are local to the file: diff noise and nothing else.
2. **Inline `<script>` chunk boundaries** — the payload is pushed in a build-varying number of
   blocks (13 in one build, 14 in the next for the same page). §12.3's second noise source.
3. **Which client reference is emitted** — the one genuine find. For the same component one
   build writes `I[15851, [chunks], ""]` and the next `I[43749, [chunks], "RecipeIndexList"]`:
   same chunk set, different module id _and_ export name. Both ids exist and mean the same
   thing in both builds, so nothing is mis-pointed — but it is real nondeterminism that
   reordering does not explain, and an invariant gate would have to accept it rather than
   reject it.

**And the rendered markup does not move at all.** Strip every inline `<script>` element,
collapsing _runs_ of them, normalize chunk filenames, and **0 of 503 HTML files differ** —
Turbopack and webpack alike. Every difference either bundler produces lives in the flight
payload. D2a's bar is met today, without any change.

> **Normalizing the diff needs two substitutions, not one.** §12.3 says to substitute the build
> id out. That is necessary and not sufficient: the id is stamped into
> `_next/static/<buildId>/` _and_ into an HTML comment where `-` is rewritten to `_`
> (`<!--Y_6Ka496MYKuQnSGHVS_v-->` for build id `Y-6Ka496MYKuQnSGHVS-v`). Substituting only the
> literal misses the comment whenever an id happens to contain a dash — which accounted for
> **503 of 557** apparent diffs on the first run, i.e. the naive check reports about ten times
> the real number. Anyone re-running §12.3 needs both.

**d. Comparing against a _warm_ rebuild is worse than cold-vs-cold, which is the case that
matters.** An overlay compares retained output against a later build, not two cold builds. Cold
tp-3 against warm tp-5: **172 files differ, 75 payloads genuinely different** (every numbered
`/recipes/N`), against 82 and 2 for cold-vs-cold. Rendered markup still **0 of 503**.

**e. Pinning `generateBuildId` is a hard requirement, confirmed rather than assumed.** Every
emitted HTML file references `_next/static/<buildId>/` (`_buildManifest.js`,
`_ssgManifest.js`, `_clientMiddlewareManifest.json`). Retained pages break the moment the id
changes, so no overlay is possible without pinning it.

**f. The verdict.** **A is not worth building yet, and B is worth less.** A's cost — a params
seam per route, a pinned build id, an overlay script, a module-table invariant gate, a
full-build fallback, and a `PaginationChanges`-to-URL resolver — buys **at most ~6 seconds off
a ~25-second build**, and only if the gate never trips. B pays for a second renderer to buy the
same six seconds, and §1's shared work (teaching the artifact which _items_ changed, and a page
id → URL resolver) is required identically by both, so a migration does not avoid the hard part.
The honest answer to "how close is the roadmap" is: the engine half is done and correct, and the
consumer is not worth writing **until the corpus is roughly 3–4× larger**. Revisit at ~1,500
recipes, or if the fixed ~22s itself becomes the complaint — in which case the target is
TypeScript and trace collection, not page rendering.

**The shared work is deferred with them, deliberately.** The plan staged two items as needed by
A and B alike — recording changed _item_ ids in `PaginationChanges` (the data is already in
scope at `syncContentItems.ts:98`, which closes over `items: { id, previousId, entry }[]`), and
a per-site page id → URL resolver beside `itemBasePath` and `listPaths`. Both are still the
right design, and neither is written here. They have no consumer, and this document's own rule
(§11.1, and D2a in practice) is that a derived-state feature lands when a concrete consumer is
waiting on it. Building the artifact half now would mean a `PAGINATION_CHANGES_VERSION` bump and
a wider artifact maintained against nothing that reads it — which is the shape F4's and F5's
deferral findings both warn about. They land with the overlay, when the overlay is worth it.

This is a documented negative result, which was one of the two acceptable outcomes.

**12.7b What the spike found on the way — a build that could not run.** Building the export
against the `search-corpus` fixture (67 recipes, **no featured recipes**) fails outright:

```
Error: Page "/featured-recipe/[slug]" is missing "generateStaticParams()"
so it cannot be used with "output: export" config.
```

`output: "export"` raises that for an **empty array**, not only for a missing function — the
rule §12.3 states and that `createPaginatedIndexRoute`, `createPaginatedJsonRoute`,
`generateTagStaticParams` and `/[...slug]` each already guard. §12.3 flagged the featured route
as the one place still exposed and predicted "it will bite whoever runs this check on a fresh
corpus"; it bit. `/recipe/[slug]` had the same hole for a corpus with no recipes at all.

Both now emit one placeholder param that the route `notFound()`s, exactly as the tag route
does, so a corpus with nothing featured exports a site with no featured recipes rather than
failing. `test/exportStaticParams.test.ts` pins all three shapes — **5 tests**, red before the
guard and green after.

This is also a Phase 2 prerequisite that the plan did not name: a `generateStaticParams`
filtered to a regeneration set returns `[]` precisely when a write dirtied no page of that kind,
which is the _common_ case, not the corner. Every seam an incremental build filters needs this
guard before it can be filtered at all.

**12.7c F4's deferral was measured on the wrong corpus, and the correction is 39×.** F4's
finding records `/search/all` at **6,468 bytes** against the 67-recipe `search-corpus` fixture,
computed by applying `getRecipes`'s projection to the fixture index. Emitting the route from a
real export build reproduces that figure **to the byte** — so the methodologies agree, and the
comparison below is exact:

| corpus                            | emitted `search/all`    |
| --------------------------------- | ----------------------- |
| 67-recipe `search-corpus` fixture | 6,468 B (6.3 KiB)       |
| **436-recipe real corpus**        | **253,421 B (247 KiB)** |

F4's own stated trigger to revisit was "a corpus large enough for 6 KiB to become a number worth
caring about". At a quarter of a megabyte, fetched unconditionally by `SearchContext`
(`staleTime: Infinity`, no version gate on the fetch) and moved by **every** write, that trigger
is met. F4's second half still stands unchanged — chunking the route without rethinking
`allTags` and the filter rail would leave the client fetching every chunk anyway — so the first
move remains `allTags`, which is already an aggregate.

**Unlike the incremental export, F4 is now worth doing**, and it is the item this spike would
hand the roadmap next.

> **Taken up, and the "`allTags` first" ordering above did not survive contact with a second
> measurement — §12.8.** Measuring the corpus by _field_ rather than by row found a better cut
> than chunking, one that leaves `allTags` where it is.

---

**12.8 F4a — the corpus split, and why measuring by field beat chunking by row.** §12.7c handed
the roadmap "chunk `/search/all`". Measuring the same 436-recipe corpus **by field** instead of
by row said the chunk was the wrong cut, and the cheaper fix was a better one.

| field           | cost in the document       | rendered from the fetched array? |
| --------------- | -------------------------- | -------------------------------- |
| `ingredients`   | 198,517 B — **78.3%**      | **never**                        |
| `description`   | **0 B — 0.0%** (see below) | yes — ⌘K palette subtitles       |
| everything else | 54,904 B — 21.7%           | yes — cards, sort, `time:`       |

`ingredients` is four fifths of the bytes and nothing renders it. It has exactly two consumers,
and **both are conditional**: FlexSearch consumes it once per corpus version (already gated, and
persisted in IndexedDB), and `ingredient:` filters read it. So F4a serves it separately and
fetches it on those two conditions.

**The numbers**, emitted by applying `getRecipes`'s projection to a scratch copy of the real
corpus — the same methodology §12.7c used, which reproduces an export build's emitted bytes to
the byte, and which reproduced its 253,421 exactly here:

| document              | bytes       | KiB   | on every page load?             |
| --------------------- | ----------- | ----- | ------------------------------- |
| `search/all` (before) | 253,421     | 247.5 | yes                             |
| `search/all` (after)  | **54,904**  | 53.6  | yes                             |
| `search/ingredients`  | **204,075** | 199.3 | **no** — version gate or filter |
| sum                   | 258,979     | 252.9 | —                               |

**247.5 KiB → 53.6 KiB unconditional, a 78% cut.** The sum is 5.5 KiB _larger_ than the original
— a map keyed by slug repeats the slug where the array had a bare `"ingredients":` — which is the
right trade: it is paid once, on the path that was already going to fetch everything, and never
on the path that was fetching 247 KiB to render 54.

**Five things worth keeping.**

**1. `description` is 0 bytes on the real corpus, and that is a bug this measurement found —
not a property of the split.** F4a was planned expecting descriptions to be ~18% of the document
and was going to keep them on the unconditional path for the ⌘K palette's subtitles. They are
0.0%: **424 of the 436 recipe files carry a `description`, and not one of them survives into the
content index.** The cause is `flattenMarkdown` in
`recipe-website/common/controller/buildIndexValue.ts`. It reduces the compiled markdown by
concatenating a node only when the node is a string or its `props.children` **is a string** — so
a one-paragraph, plain-prose description flattens fine (which is every description in the
`search-corpus` fixture, and why no test has ever noticed), while a real description — several
paragraphs, a link, a list — compiles to nodes whose `children` are _arrays_, contributes
nothing, and yields `""` → `undefined`.

So the production search index has **no description field at all**: `description:` filters match
nothing, the palette renders no subtitles, and the field's declared place in the FlexSearch
priority order is inert. **This is pre-existing and untouched by F4a** — the cap comment it
prompted was corrected, the field stays where it is, and it stays on the unconditional path
because the decision to keep it is right _when it works_. Filed as its own item; fixing it means
touching `buildIndexValue`, which means a `RecipeEntryValue` reshape and a fixture rebuild, which
is not a corpus-transport change.

It also means the headline number is, if anything, conservative: fixing the flattener adds bytes
to `search/all`, and the 78/22 split is measured against a corpus where the second-heaviest
field is currently missing. Filed as **F23** (§11.1), with the fixture requirement the fix needs.

**2. The failure mode the split creates is silent, and it is a _write_, not a read.** If the
FlexSearch populate is allowed to run before the ingredients land, the index commits without
them — and `writePopulatedVersion` then marks that version populated. The index probes healthy,
the version matches, no later load refetches, and every ingredient search returns nothing until
the corpus version happens to move. This is the same shape as the marker-outlived-its-database
failure `search-index-recovery.spec.ts` covers, and it is why the fix is two-sided: the populate
is gated on the ingredients having _settled_, and the version is written only when they actually
arrived. A failed fetch therefore yields a usable-but-unvouched-for index that the next load
rebuilds, rather than a permanent lie.

**3. `"any"` is an ingredient field.** A negated bare word (`-chocolate`) parses to
`field: "any"`, and `matchesFilter`'s `"any"` arm checks ingredients. So `filterUsesField` — the
predicate deciding whether to fetch — has to report true for `"any"`, or the document stays
unfetched and the exclusion quietly _keeps_ the recipes it exists to remove. An
under-eager predicate here fails as a wrong result set, not as a missing one.

**4. Splitting one document into two made the server read the index twice, at the same time —
and the environment cache cannot take that.** The first container gate answered 500 on both new
routes. `readContentIndex` awaits its range read and calls `getCount()` afterwards; in that gap a
second request can reach `openCachedEnvironment`, see the content directory's inode change, and
close the environment the first read is still holding. Recorded as **F24** (§11.1). F4a's own fix
is `getSearchCorpus()` — one in-flight read the two routes share — which withdraws the
concurrency the split introduced rather than fixing the race, and happens to halve the cold-load
index reads as well.

**The general lesson is about the shape of the change, not this bug.** Splitting a document is
transport-only on the client and emphatically not on the server: two routes over one read path
means two readers where the codebase had assumed one. Anything F4b does to `search/ingredients`
inherits that, more so — chunking it means N concurrent chunk requests, all reading the same
index. F24 should be fixed before F4b, not after.

**5. `allTags` did not have to move first.** §12.7c and F4's own finding both set the order as
"`allTags` first", reasoning that chunking without rethinking it would leave the client fetching
every chunk anyway. That reasoning was sound _for chunking_. Splitting by field leaves tags in
the display half, which is still fetched whole — so the rail, the suggestions and
browse-before-hydration all kept working untouched, and the ordering constraint simply did not
apply.

**F4a's gates, all five.** Recipe container at `SHARD_TOTAL=2`:

| gate                      | result                                               | standing    |
| ------------------------- | ---------------------------------------------------- | ----------- |
| vitest                    | **250**                                              | 244 + 6 new |
| recipe container **prod** | **416 passed, 0 failed, 0 flaky** (12.2 min)         | 412 + 4 new |
| recipe container dev      | 409 passed + 6 flaky + 1 failed = **416** (24.9 min) | 412 + 4 new |
| demo container            | 108 + 1 flaky = **109**                              | 109         |
| portfolio container       | **84**                                               | 84          |

**Zero `MDB_BAD_RSLOT` in either recipe run**, against five in the first half-minute of the
pre-fix one. The production gate — the mode F22c added, and the one that can see the stale-read
class `next dev` hides — is a clean sweep including the four new tests.

The dev run's six flakes are the usual pool (`git.spec`, `not-found`, `bookmarks`,
`command-palette` visual, `featured-recipes`). Its one hard failure is
`search-query-language.spec.ts:129`, which **fails identically on the parent commit** and passes
in the production run: see F25.

**12.9 F23 — what the description costs now that it exists, and the measurement bug found
underneath it.** F23 fixed `flattenMarkdown`. The same harness §12.8 used, re-run against the same
436-recipe corpus, says what that bought and what it cost.

**Both columns are freshly re-derived**, which §12.8's were not — see the second finding below —
so this table compares like with like: the same corpus, both indexes rebuilt from the content
files, only the flattener differing.

| field           | old flattener     | new flattener        |
| --------------- | ----------------- | -------------------- |
| `ingredients`   | 198,517 B — 75.0% | 198,630 B — 57.1%    |
| `description`   | 5,718 B — 2.2%    | **88,601 B — 25.5%** |
| everything else | 60,481 B — 22.8%  | 60,481 B — 17.4%     |

| document             | old flattener         | new flattener             |
| -------------------- | --------------------- | ------------------------- |
| `search/all`         | 66,199 B (64.6 KiB)   | **149,082 B (145.6 KiB)** |
| `search/ingredients` | 204,075 B (199.3 KiB) | 204,188 B (199.4 KiB)     |
| sum                  | 270,274 B (263.9 KiB) | 353,270 B (345.0 KiB)     |

**The unconditional payload goes 64.6 KiB → 145.6 KiB — it more than doubles**, and F4a's 78/22
split becomes 57/43. That is not a regression to undo: the ⌘K subtitle, the search-card snippet,
FlexSearch's `description` seat and the `description:` filter were all reading a field that was
empty, and they now read one that is not. But it is a real cost on the path F4a exists to protect,
and it changes the arithmetic for F4b: `description` is now the second-heaviest field and the
heaviest thing on the unconditional half.

**The cheap lever, not pulled here.** `MAX_INDEXED_DESCRIPTION_LENGTH` is 300, and the average
indexed description is 209 B, so most are under the cap and lowering it would cut real bytes —
but how much prose a subtitle and a snippet need is a product question, not a transport one, and
it should be answered on its own rather than as a side effect of this fix.

**`ingredients` moved by 113 bytes**, which is the flattener change reaching its other caller. The
per-ingredient strings are single lines, so almost nothing there had array children to recover.

**The measurement bug.** §12.8 recorded `description` at **0 B — 0.0%** and "everything else" at
54,904 B. Re-derived, the old flattener yields 5,718 B of description and 60,481 B of everything
else. Neither number was wrong about the corpus; both were measured against index values the
**live application had written over time**, because `build-corpus-indexes.ts` goes through
`rebuildFixtureIndexes`, which until F23 re-derived the content index only for types declaring
`references` — and recipes declare none. So the harness measured a stale projection: no
descriptions at all where a re-derivation recovers the dozen plain ones, and 5.6 KiB less of
everything else than the current `buildIndexValue` emits.

This is the same defect as the fixture one, seen from the other end, and it is worth stating as a
rule: **a measurement harness that reads derived state is only as current as whatever last
derived it.** Rebuild before measuring, and make the rebuild unconditional.

**The gates for F24 and F23.** Both were gated on their own branch against a clean tree, and both
recipe modes were run for each, since F24's race first showed in production and F23 moves rendered
output.

| gate                      | F24                            | F23                            |
| ------------------------- | ------------------------------ | ------------------------------ |
| vitest                    | **255** (250 + 5)              | **263** (255 + 8)              |
| recipe container dev      | **416** — 414 + 2 pool flakes  | **416** — 415 + `git.spec:533` |
| recipe container **prod** | **416 passed, 0 flaky** (8.3m) | **416** — 1 flaky (6.6m)       |
| demo container            | —                              | **109**                        |
| portfolio container       | —                              | **84**                         |

**Zero `MDB_BAD_RSLOT` and zero `Can not read from a closed database` across four container runs.**
F24's dev gate also cleared the hard failure F4a's dev run had, because F25 landed first: that run
was 409 + 6 flaky + 1 failed, and this one has no failure to explain.

**F23's first dev gate failed three visual baselines, and all three were the change working.**
`command-palette.spec:470`, `visual.spec:199` and `visual.spec:211` — the palette rows and the two
search-page shots, which are precisely the three surfaces that render a description. Regenerated
in the container with `--update-snapshots=changed`, which rewrote exactly those three and left
every other baseline untouched; that scoping is what turns "a snapshot moved" into a claim worth
believing, and the regenerated images were looked at rather than accepted.

**Portfolio's fixtures were deliberately not regenerated.** `rebuildFixtureIndexes` changed
behaviour, but `flattenMarkdown` is recipe's, so re-running portfolio's script would rewrite
`.mdb` files without changing a single index value. Its suite is green on the fixtures as
committed.

**12.10 F4b — the chunking spike, and why it is deferred again.** F4's entry assumed F4b was "an
adoption, not an engine change". It was measured before being built, the way §12.7 killed the
incremental export, and the answer is **not yet** — but for a different reason than expected, and
the chunk geometry itself came out _better_ than the plan predicted.

Reproduce with `editor/scripts/spike-ingredient-chunks.ts`, which declares an ingredients
pagination config, throws it away, and touches nothing outside the scratch corpus it is pointed at:

```
CONTENT_DIRECTORY=/path/to/scratch/corpus PER_PAGE=50 SCENARIO=append \
  pnpm exec tsx ./scripts/spike-ingredient-chunks.ts
```

**The geometry, on the real 436-recipe corpus.** `filter: ({value}) => !!value.ingredients?.length`
drops one recipe, so `total` is **435, not 436** — the divergence the plan predicted, and the
thing a `version` would have to cover.

| `perPage` | chunks | head chunk | bytes total |
| --------- | ------ | ---------- | ----------- |
| 50        | 9      | 35 items   | 214,088 B   |
| 100       | 5      | 35 items   | 214,084 B   |

**What one write actually dirties**, measured by hashing every chunk before and after:

| write                      | chunks moved | re-download | share of the whole |
| -------------------------- | ------------ | ----------- | ------------------ |
| append (newest)            | **1 of 9**   | 18,017 B    | **8.4%**           |
| edit one recipe mid-corpus | **1 of 9**   | 25,805 B    | 12.1%              |
| **backdated insert**       | **9 of 9**   | 214,169 B   | **100.0%**         |

The first two are the case for F4b and they are strong — a 91.6% cut on the re-download path, and
`perPage` 100 gives the identical 8.4% because the head chunk is partial either way, so the choice
between 5 and 9 chunks is a request-count decision, not a bytes one.

**The third row is the case against the geometry, and it is structural.** §3.1 anchors pages at
the _stable_ end so an append shifts nothing. A backdated insert goes in _at the anchor_, so every
item after it moves by one and every chunk's hash changes. Importing an old recipe with its
original date is exactly that write — `search-corpus`'s own Crème Brûlée is backdated — so the
worst case is not hypothetical, it is just rare.

**But the reason to defer is none of the above: the saving does not exist yet.** "Re-download one
chunk instead of the whole document" is a saving only if chunks are cached _across loads_, and
nothing in this repository makes them so:

- No search route sets `Cache-Control`. The only one in the repo is `no-store`, on the editor's
  `search/version` — the opposite.
- `SearchContext` fetches with a plain `fetch` and `staleTime: Infinity`, which is in-memory per
  session and buys nothing across a reload.
- **The public app is `output: "export"`, so a Next `headers()` config never applies to it**, and
  this repository contains no deployment configuration at all — no nginx, Caddy, `_headers`,
  `vercel.json` or serving Dockerfile. For the export target, cache policy is set somewhere this
  repo cannot see.

So step 1 of the spike — "serve `/search/ingredients` with a real `Cache-Control` and measure a
repeat visit" — turns out not to be a change this repository can make for the target that matters.
Until caching exists, chunking converts one 199 KiB download into nine, on every load, and saves
nothing at all.

**And F23 moved the target while the spike was running.** The unconditional half is now **145.6
KiB** against the conditional half's 199.4 KiB (§12.9), because `description` finally reaches the
index. The heaviest thing a page load pays for is no longer the document F4b proposed to chunk —
it is the one F4b deliberately leaves whole.

**Decision: F4b stays deferred, and the next move on payload is the unconditional half.** In
order: lower `MAX_INDEXED_DESCRIPTION_LENGTH` if a shorter subtitle is acceptable (a product
question, cheap and reversible — **done, §12.11**); then serve `allTags` from the F10b aggregate,
which F4's own entry has wanted since the start. Chunking is what to build **after** an HTTP cache
policy exists to make it pay, and the spike's numbers will still be here when it does.

> **Both halves of that closing line were wrong, and F27 (§12.12) measured why.**
>
> **The `allTags` move does not exist.** F10 is closed, and F4a settled that tags stay on the
> display corpus because the cards render them (`SearchList/CardTags.tsx`). There was never a
> second move to make after the cap.
>
> **And the cache policy was never the missing piece.** Step 1 of this spike — "measure what a
> repeat visit actually costs" — was skipped here because the export's cache policy lives outside
> this repository. Measured at last, a repeat visit to the export costs **600 B**, because content
> ETags plus the absence of any `Cache-Control` force a revalidation that returns 304 with an empty
> body. Chunking is not waiting on a cache policy; the bytes it proposed to save were never being
> paid twice. F4b is deferred a third time, and §12.12 has the rows.

**The costs it would also have carried**, for whoever picks it up: a second keyspace in ten
fixtures, where LMDB's floor is 32,768 B per `data.mdb` plus 8,272 B per `lock.mdb` — so ~400 KiB
of unreviewable binary before the corpus-sized fixtures are counted; sealed chunks carrying a stale
`total` and `version` by design (`readPage.ts:80-90`), so only the head chunk's version is current
and the populate marker is keyed on a version most chunks lie about; and a client that must hold
every chunk before `commit()`, which multiplies F4a's silent-failure mode (§12.8, point 2) by the
chunk count. `useInfinitePagination` is the wrong tool for that — it is serial, lazy, and seeded
from a server-rendered `initialPage`.

**12.11 The description cap — 300 → 160, and what the two numbers actually trade.** §12.10 named
this the next move on the unconditional half. It is the cheapest one available and the only one
whose cost is a product judgement rather than an engineering one, so it was measured on both sides
before being moved. Reproduce with `editor/scripts/measure-description-cap.ts`.

**The corpus.** 408 of 436 recipes carry a description that survives flattening. Flattened lengths:
median **221**, p75 322, p90 458, p99 782, max 1,437. So the median description already exceeded
the old 300 cap by nothing, and a quarter of them exceeded it comfortably — 114 were being cut.

| cap     | `search/all`  | KiB       | vs 300     | descriptions cut | prose dropped |
| ------- | ------------- | --------- | ---------- | ---------------- | ------------- |
| 300     | 149,082 B     | 145.6     | —          | 114 of 408       | 17,449 ch     |
| 250     | 142,137 B     | 138.8     | −4.7%      | 158              | 24,375 ch     |
| 200     | 132,191 B     | 129.1     | −11.3%     | 241              | 34,268 ch     |
| **160** | **121,725 B** | **118.9** | **−18.4%** | **277**          | 44,707 ch     |
| 140     | 115,988 B     | 113.3     | −22.2%     | 291              | 50,428 ch     |
| 120     | 110,064 B     | 107.5     | −26.2%     | 299              | 56,335 ch     |
| 100     | 103,966 B     | 101.5     | −30.3%     | 308              | 62,425 ch     |
| 80      | 97,685 B      | 95.4      | −34.5%     | 322              | 68,703 ch     |

**The floor is 60,481 B** — `search/all` with no description field at all. That is why the curve
flattens: even at 80 the document is 95.4 KiB, well above the 64.6 KiB it was before F23. Most of
what F23 added cannot be capped away, because 408 recipes carry prose and the cheapest useful
amount of it is still bytes.

**What decided the number is that the two consumers want opposite things, and only one of them can
see the field at all.**

- **Display cannot use more than ~80 characters.** `SearchList/index.tsx:108` clamps the
  description to two lines (`line-clamp-2`) and the palette row to one, and **both render it from
  the start** rather than as a window around the match. Past those lines the text is not shown
  under any query.
- **Search recall wants all of it.** `description` is a FlexSearch field, so a term past the cap is
  not merely unshown — it is unfindable. That is the whole cost column above, and it is invisible:
  no test goes red, the term simply stops matching.

160 is double what any surface can render, keeps most of a median description, and takes back a
third of what F23 added. Going further is available and cheap — the table is the argument — but
each step buys fewer bytes than the last while making more prose unsearchable, and below about 100
the cap starts cutting into what the card itself displays.

**A bare `slice` was also cutting mid-word.** At 160 the corpus's own sample ended `"…under t"`,
which in a FlexSearch field indexes a fragment as a term and leaves the real word reachable only by
prefix. `capDescription` trims back to the last space, with a hard-cut fallback for prose with no
space to find. It costs 1,137 B across the corpus and four unit tests hold it.

**The result, and the whole arc of the field in one place:**

| state                     | `search/all`  | `description` field |
| ------------------------- | ------------- | ------------------- |
| before F23 (field broken) | 64.6 KiB      | 5,718 B             |
| F23, cap 300              | 145.6 KiB     | 88,601 B            |
| **F23, cap 160, trimmed** | **117.8 KiB** | **60,107 B**        |

**No spec version to bump, and nothing self-heals** — the same property as F23 (§11.4). The content
index carries no hash, so a live site needs "Rebuild recipe index" and the fixtures need the script,
or both go on serving descriptions at the old cap with every test green.

**Gates: 267 vitest, recipe container 416 dev and 416 prod (one pool flake each), demo 109,
portfolio 84.** **No visual baseline moved, and that was the prediction** — the clamp is what makes
it one: display never saw a description longer than two lines, so shortening the stored text below
300 and above the clamp cannot change a pixel. A moved baseline here would have meant the cap had
been cut into what the card actually renders.

> **A warning about running these gates on a shared box.** An earlier run of the same commit
> returned **363 passed / 17 failed / 36 flaky in 1.2 hours**, with failures scattered across
> fifteen specs the change does not touch and every one of them a timeout — `locator.fill`
> exceeding 10 s on a resolved, visible input. Load average was 25 on 8 cores, from unrelated
> work. §12.5's note that `SHARD_TOTAL=4` produces a fake regression applies just as well to
> `SHARD_TOTAL=2` on a box that is busy for other reasons: **read the wall-clock time first**, and
> if a 15-minute suite took an hour, the failure list is about the machine.

**What is left.** F4b — chunk `search/ingredients` through `createPaginatedJsonRoute`, so an
append dirties only the head chunk. That is the "individually invalidated" property F4 is
actually about, and it is now a 199 KiB document with one consumer rather than a 247 KiB one
with five. Recipes only; portfolio's `search/all` remains F5's.

> **Answered by F27 (§12.12), and the answer is that there is nothing left here.** A repeat visit
> to the export already costs **600 B**, not 117.8 KiB, and an ingredients-preserving write already
> costs `search/ingredients` **300 B**. F4b is deferred a third time.

**12.12 F27 — what a repeat visit actually costs, and why the cache policy F4b was waiting for
turned out not to be the missing piece.** §12.10 deferred F4b because "re-download one chunk
instead of the whole document" is a saving only if chunks are cached across loads, and nothing in
this repository made them so. It closed by saying chunking was what to build "once a cache policy
exists to make it pay" — and nothing in the follow-up map owned building one. F4b was blocked on an
item that did not exist.

This is step 1 of that spike, the step §12.10 skipped: **measure what a repeat visit costs today.**
It was skipped because the export's cache policy lives outside this repository, and it is
answerable anyway, because the repo declares how the export is served. The answer removes the block
without anybody having to build the thing it was blocked on.

Reproduce with `editor/scripts/measure-corpus-caching.ts`, which takes a **running server** rather
than starting one, so the same script answers for both modes:

```
# the export — the public site, and the mode that matters
CONTENT_DIRECTORY=/path/to/scratch/corpus pnpm build   # in websites/recipe-website/export
pnpm exec serve out -l 3001
BASE_URL=http://localhost:3001 SCENARIO=fresh pnpm exec tsx ./scripts/measure-corpus-caching.ts

# the editor in production
CONTENT_DIRECTORY=/path/to/scratch/corpus pnpm build && pnpm start   # in .../editor
BASE_URL=http://localhost:3000 SCENARIO=fresh pnpm exec tsx ./scripts/measure-corpus-caching.ts
```

`SCENARIO=fresh` wipes the Chromium profile and measures a cold load and a repeat visit;
`SCENARIO=warm` reuses it and measures a repeat visit **after** a write, which is the scenario F4b
exists to improve and the only one where chunking could ever pay. A repeat visit is a new page in
the same profile, not `page.reload()` — a reload carries its own revalidation semantics.

**(a) What each document declares.** 436-recipe corpus, `search/all` 120,588 B and
`search/ingredients` 204,188 B, matching §12.11 exactly.

| mode                  | document             | `Cache-Control` | `ETag`  | `Last-Modified` | `Age` |
| --------------------- | -------------------- | --------------- | ------- | --------------- | ----- |
| export (`serve out`)  | `search/version`     | —               | **yes** | —               | —     |
| export                | `search/all`         | —               | **yes** | —               | —     |
| export                | `search/ingredients` | —               | **yes** | —               | —     |
| editor (`next start`) | `search/version`     | `no-store`      | —       | —               | —     |
| editor                | `search/all`         | —               | **—**   | —               | —     |
| editor                | `search/ingredients` | —               | **—**   | —               | —     |

**(b) What a conditional re-request costs.** Body bytes, not headers:

| mode   | `If-None-Match`               | `If-Modified-Since`              |
| ------ | ----------------------------- | -------------------------------- |
| export | **304 / 0 B**, all three      | n/a — no `Last-Modified` to send |
| editor | n/a — **no validator at all** | n/a                              |

**(c) What the browser actually does**, from `performance.getEntriesByType("resource")`.
`transfer` is bytes on the wire; `body` is `encodedBodySize`, i.e. the document the client ended up
with however it got there.

The export:

| scenario                            | `search/version` | `search/all` | `search/ingredients` | wire total |
| ----------------------------------- | ---------------- | ------------ | -------------------- | ---------- |
| cold load                           | 344 B            | 120,888 B    | 204,488 B            | 325,720 B  |
| **repeat visit, unchanged**         | **300 B**        | **300 B**    | **not fetched**      | **600 B**  |
| repeat after a _display_ write      | 344 B            | 120,899 B    | **300 B**            | 121,543 B  |
| repeat after an _ingredients_ write | 344 B            | **300 B**    | 204,518 B            | 205,162 B  |

The editor:

| scenario                    | `search/version` | `search/all`  | `search/ingredients` | wire total    |
| --------------------------- | ---------------- | ------------- | -------------------- | ------------- |
| cold load                   | 344 B            | 120,888 B     | 204,488 B            | 325,720 B     |
| **repeat visit, unchanged** | 344 B            | **120,888 B** | not fetched          | **121,232 B** |
| repeat after a write        | 344 B            | 120,899 B     | 204,488 B            | 325,731 B     |

**Question 1 — a repeat visit to the export costs 600 bytes.** Two revalidations that return 304
with an empty body, and a third document that is not requested at all because the version gate
holds and the index is already in IndexedDB. The premise F4b was built on — that a returning
visitor re-downloads the corpus — **is false for the mode that matters, and has been all along.**

**The export already has the property F4b was designed to produce**, one granularity up. The two
write rows are mirror images: a write that changes a displayed field costs `search/all` and leaves
`search/ingredients` at 300 B; a write that changes only ingredients costs `search/ingredients` and
leaves `search/all` at 300 B. That is "a write re-downloads only what actually changed" — delivered
by content-derived ETags plus the version gate F4a already built, at document granularity, with no
engine work and no code at all.

That the ETag is derived from content and not from `mtime` is what makes those two rows possible,
and the measurement shows it rather than assuming it: each scenario is a **full export rebuild**, so
every file in `out/` was rewritten and every `mtime` moved — yet the unchanged document still came
back 304. An `mtime`-derived validator would have re-downloaded both documents on every write, which
is the behaviour F4b assumed it was fighting.

**Question 2 — there is no staleness window, and the reason is the absence of a cache policy, not
the presence of one.** With neither `Cache-Control` nor `Last-Modified`, Chromium has no basis for
heuristic freshness, so it _must_ revalidate — and a revalidation against a content ETag returns
304 with an empty body. The two properties that look opposed, freshness and cheapness, come from the
same fact. `/search/version` is revalidated on every load in the export (300 B) and is `no-store` in
the editor, so a client cannot go on believing a stale corpus is current in either mode. **No §11.4
tag: there is no correctness bug to file.**

What this measurement cannot see is the live host. The repo's `deploy` script targets Netlify and
carries no `netlify.toml`, `_headers`, `vercel.json` or `headers()` config — §12.10's claim
re-checked and still true — so host defaults apply and are not verifiable from here. The property
to preserve is narrow and worth writing down: **whatever serves the export must not put a positive
`max-age` on `/search/version`.** Everything above depends on that one document being revalidated.

**Question 3 — nothing to build, and the shape that was proposed would have made it worse.**
Version-keyed URLs (`/search/all?v=<version>`) plus a long `max-age` would replace two 300 B
revalidations with zero requests. That is a **600 B** saving per repeat visit, bought with a code
change in both apps and in `SearchContext`, and paid for by creating exactly the staleness exposure
question 2 found does not currently exist — since the scheme only works if `/search/version` itself
stays uncached, and getting that exemption wrong is a correctness bug rather than a slow page. It is
a bad trade in both directions.

**What this does to F4b: the block is gone, and so is the prize.** Against the measured rows rather
than the assumed ones:

| path                       | whole document today | chunked (§12.10 geometry)      |
| -------------------------- | -------------------- | ------------------------------ |
| cold load                  | 204,488 B            | 204,488 B **+ 8 round trips**  |
| repeat, unchanged          | **not fetched**      | not fetched                    |
| after a display-only write | **300 B**            | ~2,700 B (**9** revalidations) |
| after an ingredients write | 204,518 B            | ~18–25 KiB + 8 revalidations   |

Only the last row improves. Chunking makes the cold load and the display-only-write path **worse**,
does nothing for the common repeat visit, and buys an ~88% cut on one path: a single 199 KiB
re-download, per returning visitor, per write that actually changes an ingredient — against
§12.10's enumerated costs (~400 KiB of unreviewable fixture binary, sealed chunks carrying a
`version` they lie about, a client that must hold every chunk before `commit()`), and against a
backdated insert still dirtying all nine chunks.

**Decision: F4b is deferred a third time, and this time the reason will not expire.** The previous
two deferrals were waiting on something — first a measurement, then a cache policy. This one is
not. The cache policy was never the missing piece; it was a hypothesis about why the bytes were
being paid twice, and the bytes are not being paid twice. **The payload thread is closed.** What
remains is the cold load — 325.7 KiB, once per visitor — and chunking does not improve a cold load.

**The editor is the one mode that pays, and it is the one that does not matter.** 121.2 KiB per
load, every load, because Next's dynamic route handlers emit no validator: the editor's three search
routes build as **dynamic** (`ƒ`), not static — only `search/version` says so with `force-dynamic`,
and the other two come out dynamic anyway. It is a single-author tool, usually on localhost. An
`ETag` on the two corpus routes would fix it. Not worth a tag; recorded so the next person does not
re-derive it.

**Two methodology notes, both worth keeping.**

- **An export build creates indexes in the content directory it is pointed at.** The scratch corpus
  grew `pages/index/{data,lock}.mdb` between the first and second `build-corpus-indexes.ts` run —
  the first said "no pages index, skipped" and the second said "pages index rebuilt". §10's rule
  again, this time from a `next build` rather than from a script. The repo itself stayed clean;
  `git status` after every run is still the check.
- **`out/search/all` came out at exactly 120,588 B**, byte-identical to what
  `measure-search-corpus.ts` computes from the same corpus. That is §12.7c's methodology check
  holding for the third time, and it is why the tables above can be compared against §12.11's.

Measured on ports 3055 and 3060 rather than 3001 and 3000, which were occupied; ports do not move
bytes. **Gates: 267 vitest (unchanged — no product code moves) and a clean `tsc --noEmit` in the
editor.** Its `include` reaches `scripts/` via the `**/*.ts` glob, so a standalone measurement script
is typechecked like anything else. No container gate: nothing the suite exercises changes, and a
25-minute run would be measuring the machine.

**12.13 F28 — where the engine actually breaks, and what the three open deferrals were waiting
for.** Three items in §11 defer to an event that had never been quantified: F12 ("worth doing only
if the full walk shows up in a profile"), F18 ("a corpus large enough to make a create visibly
slow") and F8b ("no tag in the corpus is close to `perPage`"). A deferral with no threshold is
indistinguishable from one that will never be revisited, so this measurement gives each of them a
number. The engine's own comments claim its O(N) passes are cheap on evidence that stops at 436
items — `updatePaginationIndex.ts:118-121`, `updateAggregates.ts:23-27`,
`updateDependents.ts:307-309` — and **one ordinary write costs three full passes**, two O(N) in the
corpus and one O(D) in the dependent corpus.

Two scripts, both standalone `tsx` like §12.10's spike, so a slow host cannot turn the 416 gate into
noise:

```
# synthesize a corpus of any size from the real one
SOURCE_CONTENT_DIRECTORY=~/Projects/recipe-content \
  pnpm exec tsx ./scripts/seed-scale-corpus.ts <target> --recipes N --featured D --hot-tag H

# one write against it, counters first
CONTENT_DIRECTORY=<target> SCENARIO=append pnpm exec tsx ./scripts/measure-engine-scale.ts
```

**Method, and the four decisions in it that change what the numbers mean.**

- **The seeder cycles the real 436-recipe corpus** with fresh slugs and spread dates rather than
  generating filler, so descriptions, ingredient counts and tag counts keep their production
  distribution — which is what makes 436 an anchor against §12.11's and §12.12's byte columns rather
  than a synthetic row on its own scale. It refuses a target that already exists, because the F4b
  spike run twice against one directory compared a written corpus with itself and reported "nothing
  moved" (§12.10).
- **A fresh corpus per scenario**, made by `cp -a` from one seeded base rather than re-seeded. Every
  scenario therefore starts from a byte-identical corpus, which makes the five directly comparable
  and costs one seed per size instead of five.
- **The two passes are called separately, not through `syncPaginationItems`.** That helper runs them
  in sequence (`syncContentItems.ts:87,95`), so calling them individually attributes cost to the
  right pass and still sums to a real write's derived-state cost. Phase 1 is replicated from the same
  helper's transaction rather than skipped — without it the new item is not in the SORTED keyspace
  and phase 2 would have to be `force`d, which measures the _rebuild_ path instead of the walk.
- **`getRange` is not wrapped.** LMDB returns an `ArrayLikeIterable` carrying `.asArray`, `.map` and
  `.filter`, and `updateDependents:317` calls `.asArray` on it; a wrapper would have to reproduce
  that surface and would end up measuring itself. Every counter comes from a value the engine already
  returns — `total` from phase 2 and from `AggregateUpdateResult`, `PAGED` keys from a `db.put` wrap
  by `test/pagination.test.ts:280-285`'s own technique — and D is **counted**, as the featured
  content index's key count, which is exactly what the scan materializes. The `.asArray` row below is
  that same call made directly on the same index: a sibling measurement of the same work, not a
  reading of the engine's own call.

**On the timings.** The host sat at a load average of 11–19 throughout (8 cores, with unrelated
`ffmpeg`, `yt-dlp` and `next-server` processes running), and one identical no-op pass varied up to
9× between its best and worst run. So each O(N) pass is run five times with nothing written in
between — before the write and again after it — and **the reported floor is the minimum of the 25
samples** at each size. A pass is a fixed amount of work with no randomness in it, so every run above
the minimum is interference. Counters lead throughout; every conclusion below rests on one.

**The floor: what a no-op pass costs, by corpus size.** `--featured 50`, no hot tag. 25 samples per
cell.

| N          | phase 2 walk (min / median) | aggregate fold (min / median) | per item |
| ---------- | --------------------------- | ----------------------------- | -------: |
| **436**    | **4.2** / 7.8 ms            | **4.4** / 7.9 ms              |   9.6 µs |
| **1,000**  | **7.1** / 13.2 ms           | **6.2** / 12.2 ms             |   7.1 µs |
| **5,000**  | **27.9** / 52.8 ms          | **24.6** / 46.3 ms            |   5.6 µs |
| **20,000** | **112.0** / 169.7 ms        | **123.3** / 169.0 ms          |   5.6 µs |

N grows 45.9× from 436 to 20,000 and the walk grows 26.7×, so it is linear with a per-item cost that
_improves_ slightly with size. **`updatePaginationIndex.ts:120`'s "at this corpus size it is
milliseconds" holds all the way to 20,000**, where "milliseconds" reads as about 112 of them. The two
passes cost the same as each other at every size, which is what "a second O(N) read per write"
(`updateAggregates.ts:23`) predicted and nobody had checked.

**One write, end to end.** Same corpora; the write itself, not the floor.

| N      | scenario     |   phase 2 | `PAGED` keys written |        dirty pages | aggregate |     total |
| ------ | ------------ | --------: | -------------------: | -----------------: | --------: | --------: |
| 436    | append       |      19.1 |                    5 |            1 of 37 |       9.5 |      30.7 |
| 436    | **backdate** |      58.8 |              **437** |       **37 of 37** |      13.5 |      75.4 |
| 436    | edit         |      12.0 |                **0** |              **0** |      15.6 |      28.0 |
| 436    | rename       |      18.2 |                   12 |                  1 |      10.4 |      75.2 |
| 5,000  | append       |     112.3 |                    9 |           1 of 417 |      91.2 |     207.4 |
| 5,000  | **backdate** |     571.9 |            **5,001** |     **417 of 417** |      96.0 |     677.3 |
| 5,000  | edit         |      94.3 |                **0** |              **0** |      52.4 |     147.2 |
| 20,000 | append       |     165.1 |                    9 |         1 of 1,667 |     178.5 |     346.4 |
| 20,000 | **backdate** | **2,542** |           **20,001** | **1,667 of 1,667** |     487.7 | **3,041** |
| 20,000 | edit         |     182.4 |                **0** |              **0** |     139.7 |     322.5 |
| 20,000 | rename       |     241.5 |                   12 |                  1 |     199.9 |     483.1 |

`total` is all three passes, so on the two `rename` rows it exceeds phase 2 plus the fold by the
dependent pass — 46.5 ms at 436 and 41.7 ms at 20,000, both broken out in F18's table below. The
`name-edit` rows are omitted here because they differ from `rename` only in that pass; nothing in
these four columns separates them.

**The finding F12 was not expecting: the walk is not what gets expensive. The paged-keyspace rewrite
is.** An append at 20,000 writes **9** `PAGED` keys and one page goes dirty; a backdated insert at
the same size writes **20,001** and every one of 1,667 pages goes dirty, and phase 2 costs **15× the
walk**. §3.1 anchors pages at the stable end so an append shifts nothing — a backdated insert goes in
_at the anchor_, so every position after it moves. That is the same structural row §12.10 found for
chunk hashes, now with the write count attached, and importing an old recipe with its original date
is exactly that write.

**And `edit` is the cleanest reading of the walk on its own**: `description` is in the index value but
in neither `borrowedFieldsOf` nor `recipesByDate.project`, so at 20,000 it walks all 20,000 items and
writes **zero** paged keys. 182 ms to discover that nothing a reader sees has changed.

**F18 — the dependent scan, swept on its own axis.** D varied at a fixed N of 5,000, because a scan
measured while N moves gets attributed to the wrong axis.

| D         | `append` — scan, 0 found | `rename` — scan + cascade | `.asArray` alone | write total |
| --------- | -----------------------: | ------------------------: | ---------------: | ----------: |
| **0**     |                   1.8 ms |                    2.7 ms |     — never runs |      142 ms |
| 50        |                   4.0 ms |                   59.3 ms |       0.7–1.2 ms |      207 ms |
| 500       |                   8.8 ms |                   52.3 ms |       4.3–9.2 ms |      169 ms |
| **5,000** |              **57.5 ms** |               **92.9 ms** | **21.6–35.4 ms** |      219 ms |

Linear in D, and **never the dominant term**: at D = N = 5,000 the scan costs about what _one_ of the
two corpus passes costs, and an append's whole derived-state cost is 219 ms of which the scan is 57.
Nothing here is "visibly slow". Below D ≈ 500 the pass is inside the host noise band — the D=50 and
D=500 `rename` rows invert, which is measurement error and not a finding.

**The D=0 row confirms the cheap half of F18 works.** 1.8 ms, and `.asArray` never runs at all,
because `updateDependents:190` checks `pathExists` on the dependent's data directory _before_
`getContentDatabase` — the check that also stopped every recipe write from materializing an empty
`featured-recipes/` index.

**F8b — and the trigger it defers on turns out to be the wrong one.** H, the size of the largest
tag, varied at N = 5,000 and D = 50. The `perPage` it is measured against is **12**.

| largest tag | by-tag record | aggregate fold floor | vs. no hot tag |
| ----------- | ------------: | -------------------: | -------------: |
| 12          |       6,201 B |              22.2 ms |          ~1.0× |
| 100         |      18,715 B |              22.2 ms |          ~1.0× |
| 1,000       |     146,571 B |              39.3 ms |           1.6× |
| **5,000**   | **719,100 B** |         **127.7 ms** |       **5.2×** |

(Baseline: the same corpus with no hot tag folds in 24.6 ms.)

**A tag crossing `perPage` costs nothing.** At H=100 the largest tag is more than 8× `perPage` and the
fold is unchanged at 22 ms. What costs is the **record's bytes**: `recipesByTag.finalize` builds the
whole `Record<slug, TagIndexEntry>` and `hashValue` runs over all of it on **every write**, so the
real trigger is a byte threshold and not a page-count one. F8b's entry defers on "no tag is close to
`perPage`", which is true and is not the reason it can wait.

**The `name-edit` run at H=5,000 reported `moved: by-tag`.** `recipesByTag` projects `name` into every
entry, so one name edit on one tagged recipe rewrites the entire 719 KB record and fires the single
cache tag covering every tag page. That is exactly the trade `aggregateConfigs.ts` documents in prose
— "a write that changes any tag's contents invalidates every tag page" — now with a number on it.

**And the production corpus is emptier than any of this suggests, which nobody had written down.**
Across 436 real recipes there are **2 distinct tags, carried by 1 recipe**, and the by-tag record is
**429 B**. The tag surfaces F8 shipped render from 429 bytes. `aggregateConfigs.ts`'s "the richest tag
in the test corpus carries three recipes" is about the Playwright fixtures; production is thinner
still, and the `--hot-tag` knob exists because without it there is nothing in the corpus to observe.

**Decision: F12, F18 and F8b all stay deferred, and each now names the number that would reopen it.**

| item    | the trigger, written as a number                                                                                                                                                                                                                         |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F12** | **A corpus over ~20,000 items whose ordinary writes matter**, where phase 2's walk crosses 100 ms. Its ceiling is half an ordinary write: F12 cannot take a write below the aggregate fold's floor (123 ms at 20,000), because a fold has no early exit. |
| **F18** | **D over ~50,000**, where the scan would cross 500 ms and become a write's largest single term. D is the count of hand-curated featured recipes; production has one.                                                                                     |
| **F8b** | **A by-tag record over ~150 KB** — a single tag on roughly 1,000 recipes at this corpus's tags-per-recipe. Production is at 429 B, three orders of magnitude below it.                                                                                   |

**F12's ceiling is the useful half of that table.** The early exit is an optimisation of the walk, and
at 20,000 the walk is 112 ms of an ordinary write's 346. The other two passes are untouched: the
aggregate fold depends on the whole corpus by definition, so there is no suffix to skip, and it costs
the same 123 ms. So F12 halves phase 2 and leaves a write above 200 ms either way — and it does
**nothing at all** for the 3-second case, because a backdated insert genuinely changes every page and
there is no unchanged suffix to exit into. **The write that is 8× more expensive than any other is
not the one F12 addresses.** If a corpus that size ever wants faster writes, the thing to build is
bounded work at the _anchored_ end — §11.1's `partitionsOf` and §3.1's key buckets both do that,
because a backdated insert into a `/2019/03` partition rewrites that partition's pages and no others.
That is a better first move than F12 at every size measured here.

**What these numbers do not cover, stated so the next reader does not over-read them.** They are the
three derived-state passes and nothing else. The real write path also writes a data file and ends in
`commitContentChanges` — a git commit against a content directory that at 20,000 recipes holds 20,000
tracked files — and none of that is in any cell above. Before F12 is built on the strength of 112 ms,
the write path should be profiled whole, because the pass this section measures may well not be the
part a caller is waiting on.

**Methodology notes.**

- **Seeding is one call.** `rebuildIndex` on recipes cascades to every type that borrows from it, so
  the featured index and both pagination keyspaces come out of the recipe rebuild. Featured recipes
  get no `aggregates/` directory because they declare none — correct, not a gap.
- **The scenarios land on different sides of the dependent gate, and that is the point.** A create
  opens it (`hashValue(undefined) !== hashValue(name)`, F18's "now runs on creates") and finds
  nothing, because nothing references a slug that did not exist. A `description` or `ingredients` edit
  opens it not at all, since `borrowedFieldsOf(recipeContentConfig)` is `["name", "image"]`
  (`references.ts:233`) and `updateDependents:121` gates the whole pass on one of those moving — so
  an ingredients edit is not a dependent-scan case and measuring one would have reported zero and
  looked like a result.
- **`git status` after every run**, and every corpus lived under the job's scratch directory. Opening
  an index creates it (§10), and these scripts open and rebuild several.

**Gates: 267 vitest, unchanged, and a clean `tsc --noEmit` in the editor** — which covers `scripts/`
and so typechecks both new scripts. No container gate: nothing the suite exercises changes. The one
engine edit is the NUL-byte escape below, which changes a separator's _encoding_ and not its value —
verified byte-identical at runtime — so no behaviour moves.

**A load-induced vitest flake found on the way, recorded rather than filed.** Two of seven suite runs
came back **266 of 267** with the same single failure: `exportStaticParams.test.ts`'s "/recipe/[slug]
emits a placeholder for a corpus with no recipes", `Test timed out in 5000ms`. It is not an assertion
failure and nothing here can reach it — the test mocks `readAllRecipeIds`, and this PR's only engine
edit is a string escape in a module it does not import. In isolation the test runs in **860 ms**, and
the suite then went green on **five consecutive runs at a load average of 30** — higher than the ~15
at which it failed — so this is a 5-second default timeout being missed occasionally on a busy host,
not a threshold that correlates cleanly with load. Worth knowing before someone gates on this file
under contention; not worth a tag until it fails on an idle machine.

> **Closed at F31b, and it was not flakiness.** The cause was identifiable from the numbers already
> in this paragraph: 860 ms for the first `/recipe/[slug]` case and 349 ms for the first
> `/featured-recipe/[slug]` case, of a 2.47 s run with 908 ms attributed to transform. Every test in
> the file `import()`s a Next app-router page, so the **first** test in the file pays the cold
> transform of a whole component graph and the rest ride the module cache — which is why the failure
> was always the same test, and why it was the cheapest assertion in the file. A `beforeAll` that
> imports the page modules once charges the transform to a hook (10 s `hookTimeout`, not the 5 s
> `testTimeout`) and every test now runs in 1–3 ms. Fixing the attribution was preferred to raising
> `testTimeout`, which would have widened the budget for the whole suite to hide one file's cost.

**12.14 F29 — portfolio's `projects` adopts the engine.**

**Gates: 268 vitest (267 → 268), and a clean `tsc --noEmit` in both portfolio apps.** The new case
is §12.1e's sixth — the source hash of
`packages/projects-collection/controller/paginationConfigs.ts` beside its declared `version: "1"`.

**§12.13's load flake now has a threshold, found the hard way.** Four consecutive default-timeout
runs came back 266–267 of 268 with only `exportStaticParams.test.ts`'s "/recipe/[slug] emits a
placeholder" timing out — at a load average of **50–56**, from two peer sessions running recipe
shards in this repo at the same time. The same suite is **268 of 268 with `--testTimeout=30000`**.
It is the 5-second default being missed on a contended host and nothing else: the failures are
timeouts rather than assertions, and the untouched `8d3c243c` checkout reproduces the identical
single failure at 267. Read the count and the failure _kind_, never the exit code (F21a).

> **F31b then fixed the cause, so this threshold is no longer the answer for this file.** Two
> sessions reached the same test from opposite directions in the same week: F29 raised the budget
> (`--testTimeout=30000`) and F31b moved the cost off the assertion (a `beforeAll` that pays the Next
> page transform once). Both readings of the evidence were right — it _is_ the 5-second default being
> missed on a contended host — but only one of them stops the file being the canary for every busy
> box. `--testTimeout` is still the correct blunt instrument for the _rest_ of the suite under load;
> `exportStaticParams.test.ts` no longer needs it.

**No recipe gate, and that is a claim about the diff rather than a shortcut.** Nothing in
`packages/cms` changes, `pages-collection` is untouched, and every edited file is under
`packages/projects-collection` or `websites/portfolio` — except the two vitest files, which run at
the repo root. F27 and F28 stated the same thing for the same reason.

**Two existing vitest cases changed rather than were added, which is the interesting part of the
gate.** `revalidateDerived.test.ts` carried two assertions that portfolio fires _no_
`pagination:` tag, both written at F21b with comments saying in as many words that §11.2's
adoption is what would break them. Both went red on the one-line config change and now assert
`pagination:projects:by-date` fires. Neither invalidation seat was edited: `exportAction.ts` and
the `test-invalidate-cache` route both read the registry, so they picked the new tag up by doing
nothing. That is F21b's payoff arriving on schedule, and the four prose comments that predicted it
— in those two files, in `playwright/support/tasks.ts` and in `build-fixture-indexes.ts` — were
rewritten in the same PR rather than left describing a world that had ended.

**The F7 property — an identical emitted file list, on one corpus.** The export built against a
scratch copy of the `projects` fixture (five projects) at `8d3c243c` and again with the change:
**135 files both times**, and the 77 non-`_next/` paths are byte-for-byte the same list — five
`project/<slug>.html` plus RSC sidecars, plus the `%2F` placeholder's. The 58 `_next/` paths differ
in 11 chunk filenames and the build id, which is the reordering-only noise §12.3 and F7 both
record; that is also why the check is the **file list** and not a hash of `out/`.

**The fixture rebuild is idempotent in its file set and not in its bytes — the F21c trap, confirmed
rather than assumed.** `build-fixture-indexes.ts` run twice against a control copy:

| Comparison             | Paths added                                                                        | Content differing                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| control → second run   | `projects/projects/pagination/by-date/{data,lock}.mdb`, `.pagination-changes.json` | both `index/data.mdb` + `lock.mdb` pairs                                               |
| first run → second run | none                                                                               | every `.mdb`, plus `.pagination-changes.json` — i.e. all of them, on an identical tree |

So the only genuinely new derived state is the one pagination environment, and **a clean tree is
not a usable check here**: `rebuildFixtureIndexes` passes `force: true`, which rewrites each meta
record's wall-clock `updatedAt`, so the two content indexes come back byte-different on every run
while carrying identical entries. `about-page` gains nothing, because
`rebuildFixtureIndexes.ts:77` skips a config whose `indexDirectory` is absent from a fixture and
that fixture has no `projects/index`.

**`.pagination-changes.json` needed a fixture-tree `.gitignore`, which portfolio did not have.**
The plan said no ignore edit anywhere, and that was right about the two derived lists —
`derivedPaths.ts` already emits `/projects/pagination` unconditionally (F10b's rule), and
`playwright/support/tasks.ts` already derives the harness's ignore from the registry. What it
missed is a third thing: the rebuild drops a dirty-page artifact into the fixture itself, carrying
a wall-clock timestamp, and recipe's fixture tree has ignored it since the file existed. Portfolio
now carries the same one-line rule. Committing it instead would mean a spurious binary diff on
every regeneration, and nothing in the suite reads it.

**Portfolio container suite: 84 passed, 0 failed, in 5.3 minutes** — including
`menus.spec.ts:57`, the standing flake, so this is a full pass rather than the 83-plus-one the
plan budgeted for. Run through `scripts/run-portfolio-tests.sh`, never on the host: baselines are
container-generated and host font rasterization lands a few percent off, which is
indistinguishable from a real regression. Five specs read the `projects` fixture
(`accessibility`, `command-palette`, `index-search`, `postures`, `visual`), so a fixture that had
lost its list — the D2a failure this whole gate exists to catch — would surface there rather than
in a unit test; `index-search.spec.ts:11` asserts the full list, and `:109` asserts it with
JavaScript disabled, which is the F5 property the homepage keeps. **No visual baseline moved**,
which is the assertion and not an observation: every rendered surface — homepage, all three
postures, the case study — reads through `getProjects()` and `getProjectBySlug` exactly as before,
so a moved snapshot would have been a bug.

**The hazard this PR found and did not fix is at §11.4 as F30.** `readAllIds` creates the
environment it reads, so a standalone `next build` against a pre-F29 content directory emits only
the placeholder and silently drops every project page. Measured, mitigated by `exportAction`'s
`rebuildIndex`, and written into §13 as an operator step.

**`git status` after every script run and every build**, because this PR adds one script run and
two builds that each open an index, and opening an index creates it (§10). Both scratch corpora
and the two fixture snapshots lived under the job's scratch directory.

---

## 13. Migration

Page numbering inverts, so existing `/recipes/2`- and `/featured-recipes/2`-style URLs change
meaning — accepted for recipes in P3 and for featured recipes in D2b. `/featured-recipes/1`
additionally stops being an alias for the landing: it is the oldest page, and 404s on a corpus
small enough to have no numbered pages. Checked before landing that no app code hardcodes a
numbered link to either — the unnumbered `/featured-recipes` links in the command palette, the
homepage and the detail page are unaffected. Nothing else migrates: pagination indexes are derived state built fresh beside the existing content
indexes, no `*.mdb` file changes format, and a rollback is deleting a directory. An index that
is deleted, or that predates a config change, rebuilds itself on the next
`updatePaginationIndex` call with no operator action.

Three things a content repository gains once a content type opts in, all derived state:

- `<contentDir>/<type>/pagination/<name>/` — the index itself.
- `<contentDir>/<type>/aggregates/<name>/` — the folded value (F10b).

  **Since F21a, neither needs an ignore-list edit when a type adopts it.** Both are derived by
  `content/derivedPaths.ts` from the site's `controller/contentTypes.ts`, at directory level and
  unconditionally, so declaring an index or an aggregate — or a second one — changes nothing here.
  Adding a **content type** to the registry is the only edit, and it is one line.

  The history is why the derivation exists rather than a fourth careful reading. Every writer
  named paths one by one, so `/featured-recipes/index` and `/featured-recipes/pagination` were
  both simply missing until D2b added them; the Playwright harness writes its own `.gitignore`,
  so no test would ever have caught it; and by F21 all three surviving writers disagreed with
  each other. See §11.4.

  **There is one hand-written copy left, and it is stale.** The committed bundle at
  `editor/playwright/fixtures/git-test-content/test-git.bundle` carries a `.gitignore` of only
  `/transformed-images` and `/recipes/index`, baked into a binary fixture where no derivation can
  reach it. Latent, not broken: the specs that load it (`git.spec.ts:407`) read the git log and
  never render a page that opens a derived environment. Whoever writes a bundle spec that visits
  a content page will meet it, and it will look like a git bug. Regenerating the bundle is the
  fix, and nothing in this repo needs it yet.

- `<contentDir>/.pagination-changes.json` — the dirty-page artifact. **Content repositories
  should gitignore it.** It is a dotfile specifically so that `commitChanges`' `git add "./*"`
  fallback, which does not match dotfiles, cannot sweep build bookkeeping into a content commit
  — but the write paths that pass explicit paths are the ones that matter, and an ignore rule
  is the honest belt to that suspenders. It accumulates every change since a build last
  consumed it, and whoever consumes it clears it.

**Borrowed index-value fields are an index-shape change, and nothing self-heals one.** Adopting
one changes what a content index value _contains_, so every existing index of that type must be
rebuilt. The pagination side notices — the spec hash forces a rebuild when a projection changes
— but the **content** index carries no spec hash and never will notice. D1's answer is to make
one operator action sufficient rather than to add a check: `rebuildIndex` now resolves references
per item and cascades to every type that borrows from the one being rebuilt (§10), so
`rebuildRecipeIndex()`, the Maintenance button, `sync.ts` and the seed scripts all repair the
whole dependency closure rather than one index each.

D1 itself changed no production index shape — no production content type declared `references`
yet — so nothing needed rebuilding when it landed. **D2a is the first one that does.**

**The operator step for a live content directory, concretely: press _Rebuild recipe index_ on the
Maintenance page** (`rebuildRecipeIndex()`, also reachable through `exportAction` and `sync.ts`).
Rebuilding _recipes_ is the right instruction even though it is the featured-recipes index whose
shape changed: since D1 that call cascades into every type that borrows from recipes, so it
repairs featured recipes in the same pass. Rebuilding featured recipes alone would work too, but
it is the less obvious button and the one an operator has no reason to reach for.

Skipping it does not error. A featured-recipes index written before D2a simply has no
`recipeName`, and `getFeaturedRecipes` no longer reads the recipe to fill the gap — so every card
degrades to unnamed and imageless, exactly as the old `catch` did. **That failure looks identical
to the bug D2a fixes**, which is the whole reason this step is written down rather than inferred.
The committed fixtures got the same treatment through
`editor/scripts/build-fixture-indexes.ts` (§10).

**The operator step for a live _portfolio_ content directory, added at F29: press _Build_ once.**
`projects` now declares `projectsByDate`, so a portfolio content directory that predates F29 has
no `projects/pagination/by-date/` environment. That button creates and fills it: `buildExport`
calls `rebuildIndex({ config: projectContentConfig })` before invoking the build
(`exportAction.ts:46`), and `rebuildIndex` forces a pagination rebuild once the config declares
one. Portfolio has no Maintenance page and so no separate rebuild button — recipe's equivalent
step names one because recipe has one; here Build is the only seat, which is also why the failure
below is reachable only from a shell.

**Unlike D2a's step, skipping this one is not a graceful degradation — it removes pages.** The
export's `project/[slug]` `generateStaticParams` reads that keyspace, and a read of an absent
index returns `[]` rather than failing: the build succeeds, emits only the `/` placeholder, and
**every project case study is missing from the published site** with nothing in the log to say so.
It cannot happen through the editor, because the button that builds is the button that rebuilds;
it happens to whoever runs `next build` in `websites/portfolio/export` by hand. Filed as F30 in
§11.4 — the guard that would make the absent case return `[]` without creating anything is one
`pathExists`.
