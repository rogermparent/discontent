"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Sun,
  Moon,
  Monitor,
  Clock,
  Filter,
  Layers,
  Search,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { PureStaticImage } from "@discontent/next-static-image/src/Pure";
import { Badge } from "@discontent/component-library/components/ui/badge";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@discontent/component-library/components/ui/command";
import { MassagedRecipeEntry } from "../../controller/data/read";
import { SEARCH_DEBOUNCE_MS, useSearch } from "../SearchForm/SearchContext";
import {
  appendFilterTerm,
  filterTerms,
  fold,
  positiveTagValues,
  type FilterField,
  type FilterTerm,
} from "../SearchForm/queryLanguage";
import { highlightText } from "../SearchList";
import { groupKindLabel } from "../../util/groupKindLabel";
import { NAV_DESTINATIONS } from "./destinations";

/**
 * Max recipe rows the palette shows before the "See all results" overflow item.
 * Five, not six: rows are three lines tall since PR 20 and `CommandList` caps at
 * `min(24rem,60vh)` — a sixth row pushes "See all results" out of view.
 */
const MAX_RECIPE_ROWS = 5;
/**
 * Max group rows (22f). Three, and below the recipes, because the recipe rows
 * are what Enter must open — `command-palette.spec.ts` locks that in — and
 * because a corpus never has enough matching groups for a longer list to be the
 * thing that pushed "See all results" out of view.
 */
const MAX_GROUP_ROWS = 3;
/** cmdk `value` prefix for a recent-search row; the ⌫ handler keys off it. */
const RECENT_PREFIX = "recent:";
/**
 * cmdk `value` prefix for a row that writes a term into the field instead of
 * navigating (PR 21b). Its own prefix, like `recipe:` / `nav:` / `action:`, so
 * no row can collide with another kind — and deliberately **not**
 * `palette-filter-group`, PR 20's retired testid, which two specs still assert
 * `toHaveCount(0)` as a fence against the FILTER row coming back.
 */
const TERM_PREFIX = "term:";

/** Tag facet rows offered at once, and bare-field rows after them. */
const MAX_FACET_ROWS = 3;
const MAX_FIELD_ROWS = 2;

/**
 * Fields a bare-field row may offer, in the order they earn their place.
 * `ingredient:` and `time:` lead because nothing else in the UI hints that they
 * exist; `tag:` comes last because the facet rows above already insert whole tag
 * terms, and only becomes useful once the query names both of the others.
 */
const INSERT_FIELDS: FilterField[] = ["ingredient", "time", "tag"];

/** Which field a term binds, for "the query already uses this one". */
function termField(term: FilterTerm): string {
  return term.node.type === "time" ? "time" : term.node.field;
}

/**
 * The tags carried by the current result set, most common first — the rows that
 * are worth offering, because each one is guaranteed to narrow rather than
 * empty the list. Tags the query already filters on positively are dropped:
 * inserting one twice is a no-op the user would have to undo.
 */
function tagFacets(
  recipes: MassagedRecipeEntry[],
  active: Set<string>,
): string[] {
  const counts = new Map<string, number>();
  for (const recipe of recipes) {
    for (const tag of recipe.tags ?? []) {
      if (active.has(fold(tag).trim())) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort(([aTag, aCount], [bTag, bCount]) =>
      bCount === aCount ? aTag.localeCompare(bTag) : bCount - aCount,
    )
    .slice(0, MAX_FACET_ROWS)
    .map(([tag]) => tag);
}

/**
 * The first ingredient the query actually matched, highlighted — so a hit that
 * came only from the ingredient list explains itself instead of showing a name
 * with no visible reason it matched. `highlightText` is a plain function (not a
 * hook), so calling it in a loop is safe.
 */
function firstMatchedIngredient(
  recipe: MassagedRecipeEntry,
  query: string,
): ReactNode | undefined {
  for (const ingredient of recipe.ingredients ?? []) {
    const nodes = highlightText(ingredient, query);
    if (nodes) return nodes;
  }
  return undefined;
}

// --- context: lets the header trigger open the palette without lifting state
// into the server SiteHeader (the trigger just consumes `openPalette`). ---

interface CommandPaletteContextValue {
  openPalette: () => void;
  closePalette: () => void;
}

const CommandPaletteContext = createContext<
  CommandPaletteContextValue | undefined
>(undefined);

export function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext);
  if (context === undefined) {
    throw new Error(
      "useCommandPalette must be used within a CommandPalette provider",
    );
  }
  return context;
}

export interface CommandPaletteProps {
  children: ReactNode;
  /** Owner (signed-in editor) → owner "Go to" destinations are shown. */
  isOwner?: boolean;
  /**
   * Editor-injected Sign In/Out `CommandItem`. Supplied as a ReactNode (mirroring
   * the `footerNavItems` precedent) rather than importing `next-auth/react` here —
   * that package lives only in the editor app, so a direct import would break the
   * static `export` build that also bundles this shared component. Absent in
   * export → no auth action, which is correct for the reader site.
   */
  authAction?: ReactNode;
}

/**
 * The ⌘K command palette: live recipe search + recent searches + navigation
 * ("Go to") + actions (theme, editor-injected auth), all in a single
 * top-anchored `cmdk` dialog. It *participates* in the shared search state
 * rather than merely reading it: it records commits into RECENT, and the field
 * takes the same query language `/search` does — `tag:dessert time:<30` filters
 * here exactly as it does there.
 *
 * PR 20 needed a FILTER row here, because the tag filter lived in
 * sessionStorage and was visible on exactly one route. PR 21a deleted that
 * state; the filter is in the palette's own input now, so the row is gone.
 *
 * Mounted once inside `AppProviders` so it shares the search/theme/bookmarks
 * context, and it *wraps* the app tree so the header's `PaletteTrigger` can open
 * it via context.
 */
export function CommandPalette({
  children,
  isOwner = false,
  authAction,
}: CommandPaletteProps) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const {
    query,
    parsedQuery,
    submitSearch,
    // `displayedRecipes` — engine hits narrowed by the query's own filter. PR 20
    // had to read `searchedRecipes` here instead, because the filter was
    // invisible sessionStorage state that would silently cut palette results on
    // every route but `/search`. Now the filter is whatever this very field
    // says, so honouring it is the only honest thing to do.
    displayedRecipes,
    matchedGroups,
    recentSearches,
    recordSearch,
    removeRecentSearch,
    clearRecentSearches,
    indexPopulated,
    isSearching,
    status,
  } = useSearch();

  const [open, setOpen] = useState(false);
  // Input value is local (drives the field as-you-type); the debounced write to
  // the shared `/search` query lags it by SEARCH_DEBOUNCE_MS.
  const [value, setValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // Only used to hand focus back after a row writes into the field (see
  // `insertTerm`); the field is otherwise focused by the dialog opening.
  const inputRef = useRef<HTMLInputElement>(null);
  // Controlled cmdk selection (see the snap logic below the recipe computation).
  const [selectedValue, setSelectedValue] = useState("");
  const [snappedSlug, setSnappedSlug] = useState<string | undefined>(undefined);
  const [snappedRecent, setSnappedRecent] = useState<string | undefined>(
    undefined,
  );

  // ⌘K / Ctrl-K toggle. The effect only *registers* the listener; the state
  // update lives in the handler, not the effect body, so it satisfies
  // eslint-plugin-react-hooks@7's `set-state-in-effect` rule.
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  // Flush the pending debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Seed the input from the shared query on each open (continuity with the
  // `/search` page). Derived-state-during-render — not an effect — so it never
  // trips the set-state-in-effect lint.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue(query);
  }

  // Close on route change, same derived-state pattern as `SidebarLayout`: compare
  // the live pathname to the last one seen and reset during render.
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);
  const [contextValue] = useState<CommandPaletteContextValue>(() => ({
    openPalette,
    closePalette,
  }));

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const onValueChange = useCallback(
    (next: string) => {
      setValue(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        submitSearch(next.trim());
      }, SEARCH_DEBOUNCE_MS);
    },
    [submitSearch],
  );

  const trimmed = value.trim();
  const q = trimmed.toLowerCase();

  // Static items are filtered manually (the single Command runs with
  // `shouldFilter={false}` so the live recipe rows aren't dropped by cmdk).
  const matchesQuery = (name: string, keywords?: string[]) => {
    if (!q) return true;
    const haystack = [name, ...(keywords ?? [])].join(" ").toLowerCase();
    return haystack.includes(q);
  };

  const navItems = NAV_DESTINATIONS.filter(
    (dest) =>
      (isOwner || !dest.ownerOnly) && matchesQuery(dest.name, dest.keywords),
  );

  const themeActions = [
    { name: "Theme: Light", icon: Sun, mode: "light" as const },
    { name: "Theme: Dark", icon: Moon, mode: "dark" as const },
    { name: "Theme: System", icon: Monitor, mode: "system" as const },
  ].filter((action) =>
    matchesQuery(action.name, ["appearance", "color", "mode"]),
  );

  // Only surface the injected auth item when the query plausibly targets it, so a
  // recipe search doesn't leave "Sign out" dangling under Actions.
  const showAuthAction =
    !!authAction && (!q || "sign in sign out log in log out".includes(q));

  // The recipe group is usable app-wide now that export has /search/all +
  // /search/version parity; the guard just avoids a flash before the index
  // populates (or when it has errored).
  const indexUsable = status !== "error" && (indexPopulated || isSearching);
  // Results reflect the debounced `query`, not the live `value`. Guarded on
  // `query` so an empty palette lists no recipes at all — `displayedRecipes`
  // falls back to the whole corpus when nothing is typed.
  const recipeResults = query ? (displayedRecipes ?? []) : [];
  const highlightQuery = parsedQuery.text;
  const topRecipes = recipeResults.slice(0, MAX_RECIPE_ROWS);
  const hasMore = recipeResults.length > MAX_RECIPE_ROWS;
  const showRecipes = !!trimmed && indexUsable;
  // When a query has recipe hits, the palette enters "recipe search" mode and
  // hides the nav/actions groups, so the only selectable rows are recipes.
  const hasRecipeHits = showRecipes && topRecipes.length > 0;

  /*
   * Group rows (22f). Independent of `indexUsable`: groups are matched in JS
   * over a fetched document, not by FlexSearch, so they can answer while the
   * index is still populating. Gated on the committed `query` for the same
   * reason the recipe rows are — an empty palette is a launcher, not a listing.
   */
  const groupRows = query ? matchedGroups.slice(0, MAX_GROUP_ROWS) : [];

  // --- rows that build the query instead of leaving it (PR 21b) ---
  //
  // Gated on `hasMore`, which is both the product rule and a baseline promise.
  // Product: offer narrowing exactly when there is something to narrow — under
  // six hits the list is already the answer. Baselines: the two palette result
  // snapshots capture 3-hit and 2-hit queries, so neither of them moves.
  const showInsertRows = hasRecipeHits && hasMore;
  const activeTags = new Set(positiveTagValues(parsedQuery.filter));
  const facets = showInsertRows ? tagFacets(recipeResults, activeTags) : [];
  const usedFields = new Set(filterTerms(parsedQuery.filter).map(termField));
  // An operand is half-typed (`tag:`, `ingredient:`) — the user is already
  // filling one in, so offering a second empty field would be in the way.
  const operandPending = /[A-Za-z]+:$/.test(trimmed);
  const insertFields =
    showInsertRows && !operandPending
      ? INSERT_FIELDS.filter(
          (field) =>
            !usedFields.has(field) &&
            // A generic `tag:` row under three concrete `Only tag:x` rows is
            // noise; it earns its place only when the facets have nothing to
            // offer (a corpus, or a result set, with no tags on it).
            !(field === "tag" && facets.length > 0),
        ).slice(0, MAX_FIELD_ROWS)
      : [];

  // Write a term into the field without closing the palette: this row narrows,
  // it doesn't navigate. The pending debounce is cleared first so the keystroke
  // it was going to commit can't land on top of the rewrite.
  //
  // **The focus call is load-bearing, and was found by a failing assertion.**
  // Clicking a cmdk row takes focus off the input, which is fine for every other
  // row here because they all navigate or close. These rows leave the user in the
  // field — a bare `ingredient:` is only "ready for the operand" if the caret is
  // actually there — so the focus has to be handed back explicitly.
  const insertTerm = (next: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setValue(next);
    submitSearch(next);
    inputRef.current?.focus();
  };

  // RECENT leads the empty palette: with nothing typed, the last few committed
  // queries are the most useful thing to offer.
  const showRecents = !trimmed && recentSearches.length > 0;
  const firstRecent = showRecents ? recentSearches[0] : undefined;

  // Re-run a remembered query in place (the palette stays open and becomes a
  // result list). Not a commit — it is already remembered.
  const runRecent = useCallback(
    (entry: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setValue(entry);
      submitSearch(entry);
    },
    [submitSearch],
  );

  // ⌫ / Delete removes the highlighted recent — the accessible deletion path,
  // since a `<button>` inside a `role="option"` row would violate axe's
  // `nested-interactive` (a **wcag2a** rule the palette's axe case asserts).
  // Binding it unconditionally is safe: recents only render when the input is
  // empty, so the key has no text to delete.
  //
  // Plain function, not `useCallback`: it closes over `trimmed`, which the
  // React Compiler flags as possibly-mutated-later (the derived-state block
  // below writes state during this same render), so a manual memo here fails
  // `react-hooks/preserve-manual-memoization` and skips compiling the whole
  // component. The compiler memoizes it for us anyway.
  const onListKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    if (trimmed || !selectedValue.startsWith(RECENT_PREFIX)) return;
    const entry = selectedValue.slice(RECENT_PREFIX.length);
    const index = recentSearches.indexOf(entry);
    if (index === -1) return;
    e.preventDefault();
    // Move the highlight onto the row that reclaims the slot (the next entry,
    // or the previous one when deleting the last), so the keyboard user never
    // lands on a dead selection.
    const next = recentSearches[index + 1] ?? recentSearches[index - 1];
    removeRecentSearch(entry);
    setSelectedValue(next ? `${RECENT_PREFIX}${next}` : "");
  };

  // --- controlled-selection snap (derived during render, never in an effect) ---
  //
  // cmdk only re-runs its own first-item auto-select when the *input text*
  // changes. Two things arrive later without touching the text: async recipe
  // results, and recents read out of localStorage after hydration — so without
  // help the selection is stale or empty exactly when new rows land, and Enter
  // either does nothing or fires the wrong row ("Home", under a visible recent).
  const topSlug = hasRecipeHits ? topRecipes[0]?.slug : undefined;
  if (topSlug && topSlug !== snappedSlug) {
    setSnappedSlug(topSlug);
    setSelectedValue(`recipe:${topSlug}`);
  } else if (!topSlug && snappedSlug !== undefined) {
    // Left recipe-search mode — hand the selection to the recents that reappear
    // beneath, else drop it so cmdk highlights the first launcher item.
    setSnappedSlug(undefined);
    setSelectedValue(firstRecent ? `${RECENT_PREFIX}${firstRecent}` : "");
  }

  if (firstRecent && !topSlug && snappedRecent === undefined) {
    // The recents group just appeared. Snap once; after that the user arrows
    // freely (the guard below re-arms only when the group goes away).
    setSnappedRecent(firstRecent);
    setSelectedValue(`${RECENT_PREFIX}${firstRecent}`);
  } else if (!firstRecent && snappedRecent !== undefined) {
    setSnappedRecent(undefined);
    if (selectedValue.startsWith(RECENT_PREFIX)) setSelectedValue("");
  }

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      {children}
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        shouldFilter={false}
        value={selectedValue}
        onValueChange={setSelectedValue}
        onKeyDown={onListKeyDown}
      >
        <CommandInput
          ref={inputRef}
          value={value}
          onValueChange={onValueChange}
          placeholder="Search recipes or jump to…"
        />
        <CommandList
          data-testid="palette-list"
          data-index-ready={String(indexPopulated)}
        >
          <CommandEmpty>No results found.</CommandEmpty>

          {hasRecipeHits && (
            <CommandGroup heading="Recipes" data-testid="palette-recipes-group">
              {topRecipes.map((recipe) => {
                // Highlight against the *committed* query's free text, not the
                // live input: these rows were matched on it, so marking a prefix
                // from `value` would, for one debounce, highlight something the
                // result set was never matched on — and marking a `tag:` value
                // would highlight a word that constrained the set rather than
                // matched it.
                const matchedIngredient = firstMatchedIngredient(
                  recipe,
                  highlightQuery,
                );
                return (
                  <CommandItem
                    key={recipe.slug}
                    value={`recipe:${recipe.slug}`}
                    // Opening a result is a commit — the same point `/search`
                    // treats as one, so the palette now feeds the RECENT row too.
                    onSelect={() => {
                      recordSearch(query);
                      go(`/recipe/${recipe.slug}`);
                    }}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                      {recipe.image ? (
                        <PureStaticImage
                          slug={recipe.slug}
                          image={recipe.image}
                          alt=""
                          width={400}
                          height={600}
                          className="size-full object-cover"
                        />
                      ) : (
                        <UtensilsCrossed className="size-4 text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {highlightText(recipe.name, highlightQuery) ||
                          recipe.name}
                      </span>
                      {recipe.description && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {highlightText(recipe.description, highlightQuery) ||
                            recipe.description}
                        </span>
                      )}
                      {matchedIngredient && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {matchedIngredient}
                        </span>
                      )}
                      {recipe.tags && recipe.tags.length > 0 && (
                        <span className="mt-1 flex gap-1">
                          {recipe.tags.slice(0, 2).map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="px-1.5 py-0 text-[0.65rem] font-normal"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
              {hasMore && (
                <CommandItem
                  value="see-all-results"
                  onSelect={() => {
                    submitSearch(trimmed);
                    recordSearch(trimmed);
                    // The whole query travels, filters included — `/search`
                    // shows the same set this row is counting, which is only
                    // true now that both surfaces read the same one string.
                    go(`/search?q=${encodeURIComponent(trimmed)}`);
                  }}
                >
                  <Search className="size-4 shrink-0 text-muted-foreground" />
                  <span>See all results for “{trimmed}”</span>
                </CommandItem>
              )}
            </CommandGroup>
          )}

          {/*
            After the recipes, always. The palette's Enter promise is that the
            top *recipe* row opens — "Enter opens the top recipe even when the
            query matches a destination" — and cmdk's auto-selection is
            positional, so a Groups group above the recipes would break it for
            every query that also names a group. Shown whether or not there are
            recipe hits, though: `weeknight` matching a collection and no recipe
            at all is exactly the case this exists for.
          */}
          {groupRows.length > 0 && (
            <CommandGroup heading="Groups" data-testid="palette-groups-group">
              {groupRows.map((group) => (
                <CommandItem
                  key={group.slug}
                  value={`group:${group.slug}`}
                  onSelect={() => {
                    recordSearch(query);
                    go(`/group/${group.slug}`);
                  }}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                    <Layers className="size-4 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {highlightText(group.name, highlightQuery) || group.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {groupKindLabel(group.kind)} · {group.recipes.length}{" "}
                      {group.recipes.length === 1 ? "recipe" : "recipes"}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(facets.length > 0 || insertFields.length > 0) && (
            <CommandGroup
              heading="Narrow this search"
              data-testid="palette-insert-group"
            >
              {/*
                Last, after the recipe rows, for PR 20's reason: Enter must never
                be a filter edit. cmdk's selection is controlled and snapped to
                the top recipe, and it only auto-selects on *input text* change —
                so a group appended below cannot steal the highlight. Asserted in
                the spec rather than trusted.
              */}
              {facets.map((tag) => (
                <CommandItem
                  key={tag}
                  value={`${TERM_PREFIX}tag:${tag}`}
                  onSelect={() =>
                    insertTerm(appendFilterTerm(value, "tag", tag))
                  }
                >
                  <Filter className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1">
                    Only <span className="font-mono">tag:{tag}</span>
                  </span>
                </CommandItem>
              ))}
              {insertFields.map((field) => (
                <CommandItem
                  key={field}
                  value={`${TERM_PREFIX}field:${field}`}
                  // A bare field is dropped by the parser (21a's judgement call
                  // (a)), so this leaves the result set exactly as it is and the
                  // caret ready for the operand — it cannot blank the page while
                  // the user types one.
                  onSelect={() => insertTerm(appendFilterTerm(value, field))}
                >
                  <Filter className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1">
                    Filter by <span className="font-mono">{field}:</span>…
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {showRecents && (
            <CommandGroup heading="Recent" data-testid="palette-recent-group">
              {recentSearches.map((entry) => (
                <CommandItem
                  key={entry}
                  value={`${RECENT_PREFIX}${entry}`}
                  onSelect={() => runRecent(entry)}
                  className="group"
                >
                  <Clock className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{entry}</span>
                  {/*
                    A redundant pointer affordance over the fully-keyboard-
                    accessible ⌫ path — deliberately a non-interactive
                    `aria-hidden` span, because a real <button> here would nest
                    an interactive element inside this `role="option"` row and
                    fail axe's `nested-interactive` (wcag2a).
                  */}
                  <span
                    aria-hidden
                    data-testid={`palette-recent-remove:${entry}`}
                    onClick={(e) => {
                      // cmdk selects on the row's own onClick; without this the
                      // × would also re-run the search it just deleted.
                      e.stopPropagation();
                      removeRecentSearch(entry);
                    }}
                    className="cursor-pointer rounded px-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 group-data-[selected=true]:opacity-100"
                  >
                    ×
                  </span>
                  <CommandShortcut className="ml-0 hidden group-data-[selected=true]:inline">
                    ⌫
                  </CommandShortcut>
                </CommandItem>
              ))}
              <CommandItem
                value="action:clear-recent"
                onSelect={() => clearRecentSearches()}
              >
                <Trash2 className="size-4 shrink-0 text-muted-foreground" />
                <span>Clear recent searches</span>
              </CommandItem>
            </CommandGroup>
          )}

          {!hasRecipeHits && navItems.length > 0 && (
            <CommandGroup heading="Go to">
              {navItems.map((dest) => {
                const Icon = dest.icon;
                return (
                  <CommandItem
                    key={dest.href}
                    value={`nav:${dest.href}`}
                    keywords={dest.keywords}
                    onSelect={() => go(dest.href)}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span>{dest.name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {!hasRecipeHits && (themeActions.length > 0 || showAuthAction) && (
            <CommandGroup heading="Actions">
              {themeActions.map((action) => {
                const Icon = action.icon;
                return (
                  <CommandItem
                    key={action.mode}
                    value={`action:theme:${action.mode}`}
                    onSelect={() => {
                      setTheme(action.mode);
                      setOpen(false);
                    }}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span>{action.name}</span>
                  </CommandItem>
                );
              })}
              {showAuthAction && authAction}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </CommandPaletteContext.Provider>
  );
}
