"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MassagedRecipeEntry } from "../../controller/data/read";
import type { GroupSearchEntry } from "../../controller/data/readGroupSearchCorpus";
import type { SearchTerm } from "../../controller/data/readTermPage";
import { buildTagExpansion } from "../../controller/tagExpansion";
import {
  fieldMatches,
  filterTerms,
  filterUsesField,
  fold,
  insertTagTerm,
  matchesFilter,
  parseQuery,
  toggleTagTerm as toggleTagTermIn,
  type ParsedQuery,
} from "./queryLanguage";
import { tagWordMatch } from "./tagMatch";
import {
  buildSearchIndex,
  deleteLegacySearchIndex,
  searchRecipes,
  yieldToMain,
} from "./searchIndex";

// --- sessionStorage-backed state via useSyncExternalStore ---

const SESSION_EVENT = "recipe-search-storage";
const QUERY_KEY = "search-query";
const INPUT_KEY = "search-inputValue";

/**
 * Debounce before a keystroke drives the shared FlexSearch query. Lives here —
 * beside the query state it feeds — so the two live surfaces (`SearchInput` and
 * the ⌘K palette) can't drift apart; they carried private copies of the same
 * number until PR 20.
 */
export const SEARCH_DEBOUNCE_MS = 180;

function subscribeSession(callback: () => void) {
  window.addEventListener(SESSION_EVENT, callback);
  return () => window.removeEventListener(SESSION_EVENT, callback);
}

function readSession(key: string) {
  return sessionStorage.getItem(key) ?? "";
}

function writeSession(key: string, value: string) {
  if (value) {
    sessionStorage.setItem(key, value);
  } else {
    sessionStorage.removeItem(key);
  }
  window.dispatchEvent(new Event(SESSION_EVENT));
}

const getQuerySnapshot = () => readSession(QUERY_KEY);
const getInputSnapshot = () => readSession(INPUT_KEY);
const getServerSnapshot = () => "";

// --- localStorage-backed recent searches ---
//
// (The search index itself lives in memory since 42s — see `searchIndex.ts`.
// Its old IndexedDB database and the localStorage marker that vouched for it
// are deleted once per browser by `deleteLegacySearchIndex`.)

const LOCAL_EVENT = "recipe-search-local";
const RECENT_SEARCHES_KEY = "search-recent";

/** How many committed queries the RECENT row remembers. */
const MAX_RECENT_SEARCHES = 6;

function subscribeLocal(callback: () => void) {
  window.addEventListener(LOCAL_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(LOCAL_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

// Stored as a raw JSON string so useSyncExternalStore's snapshot stays a stable
// primitive; the array is parsed once per change via useMemo below.

function getRecentSearchesRaw() {
  return localStorage.getItem(RECENT_SEARCHES_KEY) ?? "";
}

const getRecentSearchesServerSnapshot = () => "";

function parseRecentSearches(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

/**
 * Fold a query to a comparison key: accent- and case-insensitive, so "Crème"
 * and "creme" don't both earn a chip. `fold` is the query language's shared
 * helper — the same one the filter evaluates and `highlightText` marks with, so
 * all three agree on what counts as the same word.
 */
function recentKey(query: string): string {
  return fold(query).trim();
}

function writeRecentSearches(list: string[]) {
  if (list.length > 0) {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } else {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  }
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

// --- data fetchers ---

/**
 * The display half of the corpus — every field the client renders from this
 * array. `ingredients` is **not** here; see `fetchIngredients` below.
 */
async function fetchAllRecipes(): Promise<MassagedRecipeEntry[]> {
  const res = await fetch("/search/all");
  return res.json();
}

/**
 * The heavy half, `Record<slug, string[]>`, fetched only on demand (F4a).
 *
 * It was ~80% of the corpus document — 199 of 247 KiB across the 436-recipe
 * corpus — and nothing renders from it: the free-text index is built from it,
 * and `ingredient:` filters read it. Both are conditions, so this is a
 * conditional fetch (42s: the first free text, the palette opening, or a
 * filter that reads ingredients), and a page load that searches nothing never
 * makes it.
 */
export async function fetchIngredients(): Promise<Record<string, string[]>> {
  const res = await fetch("/search/ingredients");
  return res.json();
}

/**
 * Every group, small enough to fetch unconditionally beside the display corpus
 * (22f). Two things need it before any query is typed — the idle browse rail
 * and the group strip — so there is no condition to gate it on that would ever
 * be false on `/search`.
 */
async function fetchGroups(): Promise<GroupSearchEntry[]> {
  const res = await fetch("/search/groups");
  return res.json();
}

/**
 * Every term, with its parent and count (31b): the one "all terms" list, and
 * the tree `tag:` expands through. Fetched unconditionally beside the groups,
 * for the same reason — the rail renders from it before anything is typed.
 */
async function fetchTerms(): Promise<SearchTerm[]> {
  const res = await fetch("/search/terms");
  return res.json();
}

// --- context ---

export interface SearchContextValue {
  query: string;
  /**
   * `query` split into the free text the engine runs and the filter AST
   * evaluated over its results. The query string is the *only* filter state —
   * there is no parallel selection to keep in step, and nothing invisible.
   */
  parsedQuery: ParsedQuery;
  inputValue: string | undefined;
  searchedRecipes: MassagedRecipeEntry[] | undefined;
  allRecipes: MassagedRecipeEntry[];
  /**
   * Every term something carries, as labels, sorted — from `/search/terms`
   * (31b), the one list the rail, autocomplete, ⌘K and `BrowseChips` read.
   */
  allTags: string[];
  /** Every term with its parent and count, record-only terms included (31b). */
  allTerms: SearchTerm[];
  /** Every group, newest first — the browse rail and the group strip read this. */
  allGroups: GroupSearchEntry[];
  /**
   * The group document has resolved (or failed). `group:` filters cannot be
   * answered before it does, exactly as `ingredient:` cannot be answered before
   * the ingredients land.
   */
  groupsSettled: boolean;
  /**
   * Groups the query's **free text** matches on name or description — never its
   * filters, which narrow recipes rather than selecting groups. Empty whenever
   * the query has no free text in it.
   */
  matchedGroups: GroupSearchEntry[];
  /**
   * Results to display: the engine's ranked matches for the query's free text
   * (or the whole corpus, when it has none), narrowed by the query's filter.
   * `undefined` while still resolving — including the browse view before the
   * corpus lands, so nothing reports "All 0 recipes" (42s).
   */
  displayedRecipes: MassagedRecipeEntry[] | undefined;
  /** Add or remove a `tag:` term in the query — the one chip mutation path. */
  toggleTagTerm: (tag: string) => void;
  /** True once the in-memory index is built, i.e. safe to search. */
  indexPopulated: boolean;
  /**
   * Start fetching the ingredients and building the index before any free
   * text arrives — the ⌘K palette calls it on open (42s). Free text and an
   * `ingredient:` filter start it on their own.
   */
  prefetchIndex: () => void;
  /** A query is active and we are still building the index or running it. */
  isSearching: boolean;
  isFetching: boolean;
  status: "pending" | "success" | "error";
  error: Error | null;
  /** Re-fetch the corpus documents after a failure. */
  retry: () => void;
  setInputValue: (value: string) => void;
  submitSearch: (query: string) => void;
  /** Last few *committed* queries, most-recent-first (localStorage-backed). */
  recentSearches: string[];
  /** Remember a query as recent. Call on commit, never per keystroke. */
  recordSearch: (query: string) => void;
  /** Forget a single recent query (matched accent-insensitively). */
  removeRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
}

const SearchContext = createContext<SearchContextValue | undefined>(undefined);

export interface SearchProviderProps {
  children: ReactNode;
}

export function SearchProvider({ children }: SearchProviderProps) {
  // Free the old persisted index (pre-42s) once per browser. Best effort, off
  // the critical path, and it sets no state.
  useEffect(() => {
    void deleteLegacySearchIndex();
  }, []);

  // sessionStorage-backed query / inputValue. Read up here, ahead of the
  // fetches, because the parsed filter is one of the two things that decides
  // whether the ingredients document is needed at all.
  const query = useSyncExternalStore(
    subscribeSession,
    getQuerySnapshot,
    getServerSnapshot,
  );
  const rawInput = useSyncExternalStore(
    subscribeSession,
    getInputSnapshot,
    getServerSnapshot,
  );
  const inputValue = rawInput || undefined;

  // The query *is* the filter state. Parsed once here into the free text the
  // engine runs and the filter AST applied to its results — so the two can't
  // drift, and there is nothing to keep in sessionStorage beside the string.
  const parsedQuery = useMemo(() => parseQuery(query), [query]);
  const { text: searchText, filter } = parsedQuery;

  // Step 1: fetch the display corpus. Unconditional, because the tag filter
  // rail and the no-query browse view both need the full corpus — the recipe
  // list, with tags, drives those directly.
  //
  // What it no longer carries is `ingredients` (F4a): the one field on this
  // path that nothing renders, and four fifths of its bytes.
  const recipesQuery = useQuery({
    queryKey: ["recipes"],
    queryFn: fetchAllRecipes,
    staleTime: Infinity,
  });

  // Step 1a: fetch the groups. Unconditional like the display corpus and for
  // the same reason — the idle rail and the group strip both render from it
  // before anything is typed — but a separate document, because a group write
  // moves this and moves nothing on `/search/all` (22f).
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: fetchGroups,
    staleTime: Infinity,
  });
  const allGroups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
  // Settled, not successful, for the ingredients' reason: a failed fetch must
  // let the pipeline move rather than leaving `group:` pending forever.
  const groupsSettled = groupsQuery.isSuccess || groupsQuery.isError;

  // Step 1b: fetch the terms (31b). The same unconditional fetch, and the same
  // settled-not-successful gate: a failed fetch lets `tag:` fall back to its
  // plain prefix match rather than pending forever.
  const termsQuery = useQuery({
    queryKey: ["terms"],
    queryFn: fetchTerms,
    staleTime: Infinity,
  });
  const allTerms = useMemo(() => termsQuery.data ?? [], [termsQuery.data]);
  const termsSettled = termsQuery.isSuccess || termsQuery.isError;
  // `tag:dessert` also reaches everything under `dessert` in the tree.
  const tagResolver = useMemo(() => buildTagExpansion(allTerms), [allTerms]);

  /**
   * Recipe slug → the group strings a `group:` term may match: each membership
   * contributes both the group's slug and its name, so
   * `group:weeknight-favourites` and `group:weeknight` both find it.
   */
  const groupsByRecipe = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const group of allGroups) {
      for (const slug of group.recipes) {
        const existing = map.get(slug);
        if (existing) {
          existing.push(group.slug, group.name);
        } else {
          map.set(slug, [group.slug, group.name]);
        }
      }
    }
    return map;
  }, [allGroups]);

  const decorateGroups = useCallback(
    (recipes: MassagedRecipeEntry[]): MassagedRecipeEntry[] => {
      if (groupsByRecipe.size === 0) return recipes;
      return recipes.map((recipe) => {
        const groups = groupsByRecipe.get(recipe.slug);
        return groups ? { ...recipe, groups } : recipe;
      });
    },
    [groupsByRecipe],
  );

  // Decorated *here*, ahead of `allTags`, `allRecipes` and the index build, so
  // every consumer downstream sees one corpus rather than two shapes of it.
  // `groups` is never an indexed field — engine hits are looked up in this
  // corpus by slug, and the filter reads it from there.
  const displayRecipes = useMemo(
    () => decorateGroups(recipesQuery.data ?? []),
    [recipesQuery.data, decorateGroups],
  );

  // Every carried term's label, sorted — the filter rail and tag suggestions.
  // From `/search/terms` rather than a scan of the corpus (24-T11): the same
  // list the forms and `/tags` show, with a record's label where one exists.
  // A record nothing carries yet is left out — a chip for it finds nothing.
  const allTags = useMemo(
    () =>
      allTerms
        .filter((term) => term.count > 0)
        .map((term) => term.label)
        .sort(),
    [allTerms],
  );

  // Step 2: is the free-text engine wanted yet? (42s) Free text in the query
  // wants it, and so does the ⌘K palette opening (`prefetchIndex`), which
  // starts the fetch and the build while the first word is still being typed.
  // A page that searches nothing — the homepage, a recipe — pays for neither.
  // Once wanted it stays wanted: clearing the field keeps the built index.
  const [prefetchRequested, setPrefetchRequested] = useState(false);
  const prefetchIndex = useCallback(() => setPrefetchRequested(true), []);
  const indexWanted = !!searchText || prefetchRequested;

  // Step 3: fetch the ingredients — but only when something actually needs
  // them (F4a). Two things can:
  //
  //  - the index is wanted, since `ingredients` is one of the four indexed
  //    fields; or
  //  - the active filter reads them, which a filter-only `ingredient:beef`
  //    does without ever touching the engine.
  //
  // `filterUsesField` reports true for an `"any"` node too, which is what a
  // negated bare word (`-chocolate`) parses to — `matchesFilter` checks
  // ingredients for those, so a narrower test would let `-chocolate` keep the
  // recipes it exists to exclude.
  const filterNeedsIngredients = useMemo(
    () => filterUsesField(filter, "ingredient"),
    [filter],
  );
  const needsIngredients = indexWanted || filterNeedsIngredients;
  // The same gate for groups. The document itself is fetched unconditionally,
  // so this only decides whether the *results* may be shown before it lands.
  const filterNeedsGroups = useMemo(
    () => filterUsesField(filter, "group"),
    [filter],
  );
  // And for terms: only a typed `tag:` expands, so only that waits.
  const filterNeedsTerms = useMemo(
    () =>
      filterTerms(filter).some(
        ({ node }) => node.type === "text" && node.field === "tag",
      ),
    [filter],
  );
  const ingredientsQuery = useQuery({
    queryKey: ["recipe-ingredients"],
    queryFn: fetchIngredients,
    enabled: needsIngredients,
    staleTime: Infinity,
  });
  // Settled, not merely successful: a failed fetch must still let the pipeline
  // move, or a network blip would leave search pending forever. A failure is
  // surfaced as `error` below, and the index built without them lives only in
  // this page's memory — the next load (or `retry`) builds it again.
  const ingredientsDone =
    ingredientsQuery.isSuccess || ingredientsQuery.isError;
  const ingredientsSettled = !needsIngredients || ingredientsDone;
  const ingredientsBySlug = ingredientsQuery.data;

  // The two halves, rejoined. Recipes absent from the map simply have none.
  const allRecipes = useMemo(() => {
    if (!ingredientsBySlug) return displayRecipes;
    return displayRecipes.map((recipe) => {
      const ingredients = ingredientsBySlug[recipe.slug];
      return ingredients ? { ...recipe, ingredients } : recipe;
    });
  }, [displayRecipes, ingredientsBySlug]);

  // Step 4: build the index in memory (42s), in chunks that yield to the page.
  // Keyed on both fetches' dataUpdatedAt so it only re-runs on an actual
  // refetch of either half; the previous build keeps answering meanwhile.
  //
  // It waits for the ingredients to *settle*: `ingredients` is an indexed
  // field, and an index built before they land would answer every
  // ingredient-only word with nothing. A failed fetch still builds (and
  // surfaces the error), so search is degraded rather than stuck.
  const buildQuery = useQuery({
    queryKey: [
      "search-index-build",
      recipesQuery.dataUpdatedAt,
      ingredientsQuery.dataUpdatedAt,
    ],
    queryFn: () => buildSearchIndex(allRecipes, yieldToMain),
    enabled: indexWanted && recipesQuery.isSuccess && ingredientsDone,
    staleTime: Infinity,
    // An index for an older key is garbage the moment its successor lands
    // (the observer still shows it as placeholder until then).
    gcTime: 0,
    placeholderData: keepPreviousData,
    // A FlexSearch Document is not data to diff, and building cannot fail.
    structuralSharing: false,
    retry: false,
  });
  const searchIndex = buildQuery.data;
  const indexPopulated = !!searchIndex;

  // Hits come back as slugs and are looked up here, in the decorated corpus,
  // so every result carries the current `groups` — a group write moves
  // `/search/groups` and nothing else, and needs no rebuild.
  const recipesBySlug = useMemo(
    () => new Map(allRecipes.map((recipe) => [recipe.slug, recipe])),
    [allRecipes],
  );

  // Step 5: run the search — synchronous, about a millisecond. Keyed on the
  // **free text**, not the raw query, so editing a filter term (`tag:` on,
  // `tag:` off) never re-runs the engine for a result set that cannot have
  // changed. `undefined` until the index is built, which is what keeps a query
  // typed before then "Searching…" rather than an honest-looking empty set.
  const searchedRecipes = useMemo(
    () =>
      searchIndex && searchText
        ? searchRecipes(searchIndex, searchText, recipesBySlug)
        : undefined,
    [searchIndex, searchText, recipesBySlug],
  );

  // Displayed set: the engine's ranked matches when there is free text to run,
  // else the whole corpus (browse) — then narrowed by the query's filter. Same
  // shape as the tag filter it replaces, so consumers barely moved.
  //
  // Field priority (name > tags > ingredients > description) is native: it falls
  // out of `SEARCH_FIELDS`' declaration order, so there is no JS re-tiering
  // pass here. Filtering preserves that order.
  const displayedRecipes = useMemo(() => {
    // Browse waits for the corpus itself: an empty array before it lands would
    // read as "All 0 recipes" rather than "Loading recipes…" (42s).
    const base = searchText
      ? searchedRecipes
      : recipesQuery.data
        ? allRecipes
        : undefined;
    if (!base || !filter) return base;
    // An `ingredient:` filter evaluated before its document arrives would match
    // nothing and read as an honest empty result. Stay pending instead.
    if (filterNeedsIngredients && !ingredientsSettled) return undefined;
    // Same for `group:` and the group document.
    if (filterNeedsGroups && !groupsSettled) return undefined;
    // And for `tag:` and the term tree it expands through.
    if (filterNeedsTerms && !termsSettled) return undefined;
    return base.filter((recipe) => matchesFilter(recipe, filter, tagResolver));
  }, [
    searchText,
    filter,
    searchedRecipes,
    recipesQuery.data,
    allRecipes,
    filterNeedsIngredients,
    ingredientsSettled,
    filterNeedsGroups,
    groupsSettled,
    filterNeedsTerms,
    termsSettled,
    tagResolver,
  ]);

  /**
   * The groups the query's free text matches, for the `/search` strip and the
   * palette's Groups rows.
   *
   * **Every** word must match the name or the description — the AND semantics
   * free text has everywhere else in this app — and a filter never selects a
   * group: `tag:dessert` narrows recipes, and answering it with a list of
   * groups that happen to contain a dessert would be a different question than
   * the one that was asked.
   */
  const matchedGroups = useMemo(() => {
    const words = searchText
      .split(/\s+/)
      .map((word) => fold(word))
      .filter(Boolean);
    if (words.length === 0) return [];
    return allGroups.filter((group) =>
      words.every(
        (word) =>
          fieldMatches(group.name, word) ||
          (!!group.description && fieldMatches(group.description, word)),
      ),
    );
  }, [searchText, allGroups]);

  // Results aren't ready yet: either free text is active and the index is still
  // building or the engine is still running, or the filter needs the
  // ingredients document and it is still in flight. A filter-only query
  // (`tag:dessert`) reaches neither, so it is never "searching".
  const isSearching =
    (!!searchText && searchedRecipes === undefined) ||
    (filterNeedsIngredients && !ingredientsSettled) ||
    (filterNeedsGroups && !groupsSettled) ||
    (filterNeedsTerms && !termsSettled);

  const setInputValue = useCallback((value: string) => {
    writeSession(INPUT_KEY, value);
  }, []);

  const submitSearch = useCallback((newQuery: string) => {
    writeSession(QUERY_KEY, newQuery);
    writeSession(INPUT_KEY, newQuery);
  }, []);

  // Chip surfaces (the rail, the card chips) rewrite the query rather than
  // holding a selection of their own. Read from the store rather than closing
  // over `query`, so the callback stays stable across keystrokes.
  //
  // Adding a tag replaces the word being typed when the tag is what it was
  // heading for — `chick` and the "chicken" chip give `tag:chicken`, not
  // `chick tag:chicken` — as the palette's facet rows do (`insertTagTerm`).
  // A chip click takes focus off the field, so "being typed" is the last word.
  const toggleTagTerm = useCallback(
    (tag: string) => {
      const next = toggleTagTermIn(getQuerySnapshot(), tag, (raw) =>
        insertTagTerm(
          raw,
          raw.length,
          tag,
          tagWordMatch(tag, allTerms),
        ).value.trim(),
      );
      writeSession(QUERY_KEY, next);
      writeSession(INPUT_KEY, next);
    },
    [allTerms],
  );

  // Recent searches. Recorded on *commit* (Enter, a chip click, opening a
  // result) rather than per keystroke, so live typing doesn't leave "c", "cr",
  // "cre" behind.
  const rawRecent = useSyncExternalStore(
    subscribeLocal,
    getRecentSearchesRaw,
    getRecentSearchesServerSnapshot,
  );
  const recentSearches = useMemo(
    () => parseRecentSearches(rawRecent),
    [rawRecent],
  );

  const recordSearch = useCallback((newQuery: string) => {
    const trimmed = newQuery.trim();
    if (!trimmed) return;
    const key = recentKey(trimmed);
    if (!key) return;
    const previous = parseRecentSearches(getRecentSearchesRaw());
    const next = [
      trimmed,
      ...previous.filter((item) => recentKey(item) !== key),
    ].slice(0, MAX_RECENT_SEARCHES);
    writeRecentSearches(next);
  }, []);

  // Drop one entry. Matched through the same fold as `recordSearch`'s dedupe, so
  // deleting the chip you see removes the entry that chip stands for even when
  // the stored spelling is accented differently.
  const removeRecentSearch = useCallback((target: string) => {
    const key = recentKey(target);
    if (!key) return;
    const previous = parseRecentSearches(getRecentSearchesRaw());
    writeRecentSearches(previous.filter((item) => recentKey(item) !== key));
  }, []);

  const clearRecentSearches = useCallback(() => {
    writeRecentSearches([]);
  }, []);

  const retry = useCallback(() => {
    recipesQuery.refetch();
    groupsQuery.refetch();
    termsQuery.refetch();
    // Only refetches if it is currently enabled, which is what we want: there
    // is nothing to retry when nothing wanted the ingredients.
    ingredientsQuery.refetch();
  }, [recipesQuery, groupsQuery, termsQuery, ingredientsQuery]);

  // Surface failures from either corpus fetch. The ingredients belong here
  // rather than being swallowed: without them the index is built incomplete
  // and `ingredient:` filters answer nothing, and a silent empty result set is
  // the failure mode this whole pipeline is shaped to avoid.
  const error = (recipesQuery.error ?? ingredientsQuery.error) as Error | null;
  const status: "pending" | "success" | "error" = error
    ? "error"
    : recipesQuery.status;

  const value = useMemo<SearchContextValue>(
    () => ({
      query,
      parsedQuery,
      inputValue,
      searchedRecipes,
      allRecipes,
      allTags,
      allTerms,
      allGroups,
      groupsSettled,
      matchedGroups,
      displayedRecipes,
      toggleTagTerm,
      indexPopulated,
      prefetchIndex,
      isSearching,
      isFetching: recipesQuery.isFetching,
      status,
      error,
      retry,
      setInputValue,
      submitSearch,
      recentSearches,
      recordSearch,
      removeRecentSearch,
      clearRecentSearches,
    }),
    [
      query,
      parsedQuery,
      inputValue,
      searchedRecipes,
      allRecipes,
      allTags,
      allTerms,
      allGroups,
      groupsSettled,
      matchedGroups,
      displayedRecipes,
      toggleTagTerm,
      indexPopulated,
      prefetchIndex,
      isSearching,
      recipesQuery.isFetching,
      status,
      error,
      retry,
      setInputValue,
      submitSearch,
      recentSearches,
      recordSearch,
      removeRecentSearch,
      clearRecentSearches,
    ],
  );

  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error("useSearch must be used within a SearchProvider");
  }
  return context;
}
