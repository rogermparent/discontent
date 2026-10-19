import { Document, type DocumentData } from "flexsearch";
import type { MassagedRecipeEntry } from "../../controller/data/read";

/**
 * The free-text engine behind `/search` and the ⌘K palette: a FlexSearch
 * `Document` built **in memory** from the fetched corpus (42s).
 *
 * Until 42s it was persisted in IndexedDB through FlexSearch's `IdxDB`
 * adapter, whose commit does one `get` and one `put` per prefix key — about
 * 18,000 of each for the real corpus, 5–30 s of main-thread round trips — on
 * every fresh browser and again after every content write. Building the same
 * index in memory takes well under a second and a query about a millisecond,
 * and a page load re-downloads the display corpus anyway, so the persistence
 * bought nothing worth that wait. `agent-epic-42.md` 42s has the numbers.
 *
 * `SEARCH_FIELDS` is **priority-ordered**, not just a field list: a merged
 * search returns hits in declaration order, so a name hit outranks a tag hit
 * outranks an ingredient hit outranks a description-only hit, natively.
 * (FlexSearch has no per-field weight, and `Resolver` boosts are a verified
 * no-op, so declaration order is the only lever that works.) The default
 * encoder NFKD-normalizes and strips diacritics, so "creme" finds "Crème
 * Brûlée" without a phonetic charset.
 */
export const SEARCH_FIELDS = [
  "name",
  "tags",
  "ingredients",
  "description",
] as const;

export interface SearchIndex {
  document: Document;
  /** Documents added — the `limit` that makes a search return every match. */
  size: number;
}

function createDocument(): Document {
  // No `store`: a hit is looked up by slug in the corpus the caller already
  // holds, so the results always carry the current `groups` decoration and the
  // index keeps no second copy of every recipe.
  return new Document({
    preset: "default",
    tokenize: "forward",
    document: {
      id: "slug",
      index: [...SEARCH_FIELDS],
    },
  });
}

/** Recipes added between yields when building without blocking the page. */
export const BUILD_CHUNK = 100;

/**
 * Build the index over `recipes`.
 *
 * With `yieldToMain`, the build pauses after every `BUILD_CHUNK` recipes so a
 * slow device keeps painting and taking keystrokes while it runs; without it
 * the build is one synchronous loop (tests, and anything that wants the index
 * now).
 */
export async function buildSearchIndex(
  recipes: readonly MassagedRecipeEntry[],
  yieldToMain?: () => Promise<void>,
): Promise<SearchIndex> {
  const document = createDocument();
  for (let i = 0; i < recipes.length; i++) {
    if (yieldToMain && i > 0 && i % BUILD_CHUNK === 0) await yieldToMain();
    document.add(recipes[i] as unknown as DocumentData);
  }
  return { document, size: recipes.length };
}

/**
 * A task break: lets the browser paint and handle input between chunks.
 *
 * `scheduler.yield()` where the browser has it, else a `MessageChannel`
 * round trip — never `setTimeout`, which a background tab clamps to a second
 * or more per call, turning a sub-second build opened in a new tab into one
 * second per chunk.
 */
export function yieldToMain(): Promise<void> {
  const scheduler = (
    globalThis as { scheduler?: { yield?: () => Promise<void> } }
  ).scheduler;
  if (typeof scheduler?.yield === "function") return scheduler.yield();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/**
 * The slugs matching `text`, best first.
 *
 * **`limit` is the corpus size, so every match comes back** — the ticker
 * reports the total and `/search` reveals it 60 at a time. FlexSearch's
 * default is 100 *per field*, which the in-memory index honours; the
 * IndexedDB adapter this replaced overshot it for one-word queries (its
 * `get` only stops when the count lands exactly on the limit), so "lime"
 * answered 108 there and would have answered 103 here. Passing the corpus
 * size keeps the 108 and lifts the same cap from multi-word queries, which
 * both engines applied. The first 100 hits are unchanged either way; the
 * extra ones only ever join the tail.
 *
 * `suggest: true` is what makes multi-word queries usable: without it a single
 * unmatched term zeroes the whole result set, so "chocolate jujube" would
 * return nothing at all instead of the chocolate recipes.
 */
export function searchSlugs(index: SearchIndex, text: string): string[] {
  if (!text.trim() || index.size === 0) return [];
  const hits = index.document.search(text, {
    merge: true,
    suggest: true,
    limit: index.size,
  }) as unknown as { id: string | number }[];
  return hits.map((hit) => String(hit.id));
}

/** `searchSlugs`, resolved against the corpus the index was built from. */
export function searchRecipes(
  index: SearchIndex,
  text: string,
  bySlug: ReadonlyMap<string, MassagedRecipeEntry>,
): MassagedRecipeEntry[] {
  const recipes: MassagedRecipeEntry[] = [];
  for (const slug of searchSlugs(index, text)) {
    const recipe = bySlug.get(slug);
    if (recipe) recipes.push(recipe);
  }
  return recipes;
}

/**
 * The IndexedDB databases and localStorage markers the persisted index left
 * behind (`recipe-search` → `-v2` → `-v3`). FlexSearch prefixes its database
 * names with `flexsearch:`.
 */
export const LEGACY_SEARCH_DATABASES = [
  "flexsearch:recipe-search",
  "flexsearch:recipe-search-v2",
  "flexsearch:recipe-search-v3",
] as const;

export const LEGACY_SEARCH_STORAGE_KEYS = [
  "search-populated-version",
  "search-populated-version:recipe-search-v2",
  "search-populated-version:recipe-search-v3",
] as const;

/**
 * Free the ~5.5 MB the old persisted index holds in each browser that built
 * it. Best effort and silent: storage can be blocked, `indexedDB.databases`
 * is missing in older browsers, and nothing depends on this succeeding.
 *
 * It never *creates* a database. Where `databases()` exists it deletes only
 * names that are present; elsewhere it deletes only when an old marker says
 * the browser populated one, and removing the markers makes that a one-off.
 */
export async function deleteLegacySearchIndex(
  idb: IDBFactory | undefined = globalThis.indexedDB,
  storage: Storage | undefined = globalThis.localStorage,
): Promise<string[]> {
  let hadMarker = false;
  try {
    for (const key of LEGACY_SEARCH_STORAGE_KEYS) {
      if (storage?.getItem(key) != null) {
        hadMarker = true;
        storage.removeItem(key);
      }
    }
  } catch {
    // Storage blocked: carry on to the databases.
  }
  if (!idb) return [];
  try {
    let names: string[];
    if (typeof idb.databases === "function") {
      const present = new Set((await idb.databases()).map((db) => db.name));
      names = LEGACY_SEARCH_DATABASES.filter((name) => present.has(name));
    } else {
      names = hadMarker ? [...LEGACY_SEARCH_DATABASES] : [];
    }
    for (const name of names) idb.deleteDatabase(name);
    return names;
  } catch {
    return [];
  }
}
