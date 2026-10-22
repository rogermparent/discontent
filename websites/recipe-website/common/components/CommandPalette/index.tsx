"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Bot,
  Sun,
  Moon,
  Monitor,
  Clock,
  CornerDownLeft,
  Filter,
  Layers,
  Sparkles,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { PureStaticImage } from "@discontent/next-static-image/src/Pure";
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
import type {
  GroupSearchEntry,
  GroupSearchThumbnail,
} from "../../controller/data/readGroupSearchCorpus";
import { SEARCH_DEBOUNCE_MS, useSearch } from "../SearchForm/SearchContext";
import {
  appendFilterTerm,
  filterTerms,
  fold,
  insertTagTerm,
  positiveTagValues,
  type FilterField,
  type FilterTerm,
} from "../SearchForm/queryLanguage";
import { tagWordMatch } from "../SearchForm/tagMatch";
import { highlightText } from "../SearchList";
import { SEARCH_MARKS } from "../SearchForm/SearchCard";
import { useFacetModel } from "../SearchForm/useFacetModel";
import {
  isDrinkRecipe,
  queryWords,
  recipeMeta,
  whyMatch,
} from "../SearchForm/searchView";
import { useShortcutModifier } from "./shortcutModifier";
import { groupKindLabel } from "../../util/groupKindLabel";
import { CURATOR_DESTINATION, NAV_DESTINATIONS } from "./destinations";
import { PaletteAskRegistry, type PaletteAskHandler } from "./askSlot";

/** The Ask row's cmdk `value` (43q). */
const ASK_VALUE = "ask:question";
/** The curator hand-off row's (44d). */
const CURATOR_VALUE = "curator:ask";

/**
 * How long "Opening …" may wait for its navigation before the palette closes
 * anyway (43q): a navigation the transition never reports still lands.
 */
const ASK_OPEN_GRACE_MS = 5_000;

/** An Ask in flight (43q): waiting on the model, then routing. */
interface AskState {
  question: string;
  phase: "asking" | "opening";
  label?: string;
  /** The answer is the plain word search: `label` is its sentence. */
  fallback?: boolean;
}

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

/** A group row's picture: its own, else the member photo it borrowed (30c). */
function groupPicture(
  group: GroupSearchEntry,
): GroupSearchThumbnail | undefined {
  if (group.image) {
    return {
      uploadsDirectory: "uploads/group",
      slug: group.slug,
      image: group.image,
    };
  }
  return group.thumbnail;
}
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
 * Why a row matched, when its name does not say (43s: `whyMatch`, the line
 * `/search`'s cards carry) — the first ingredient the query marked, else the
 * description when that is where it matched — so an ingredient- or
 * description-only hit explains itself. `highlightText` is a plain function
 * (not a hook), so calling it in a loop is safe.
 */
function rowWhy(
  recipe: MassagedRecipeEntry,
  query: string,
  words: readonly string[],
): ReactNode | undefined {
  const why = whyMatch(recipe, words);
  if (!why) return undefined;
  const text = why.kind === "ingredient" ? why.line : why.text;
  return highlightText(text, query) || text;
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
  /**
   * Editor-injected Ask (43q): a component that registers a
   * `PaletteAskHandler` (`useRegisterPaletteAsk`). Absent on the export, so
   * the palette there has no Ask row, no Tab-to-Ask and no model call.
   */
  askSlot?: ReactNode;
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
  askSlot,
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
    allTerms,
    recentSearches,
    recordSearch,
    removeRecentSearch,
    clearRecentSearches,
    indexPopulated,
    prefetchIndex,
    isSearching,
    status,
    allRecipes,
  } = useSearch();
  const model = useFacetModel();
  const modifier = useShortcutModifier();

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

  /*
   * Ask (43q): the editor's handler, once its slot registers one; whether
   * Tab has called the row up for an input that doesn't read as a question;
   * the Ask in flight; and the input the row last took the highlight for.
   */
  const [askHandler, setAskHandler] = useState<PaletteAskHandler>();
  const registerAsk = useCallback(
    (handler: PaletteAskHandler | undefined) => setAskHandler(handler),
    [],
  );
  const [askForced, setAskForced] = useState(false);
  const [askState, setAskState] = useState<AskState>();
  const [snappedAsk, setSnappedAsk] = useState<string | undefined>();
  const askAbort = useRef<AbortController | undefined>(undefined);
  const [routing, startRouting] = useTransition();
  const [sawRouting, setSawRouting] = useState(false);

  // ⌘K / Ctrl-K toggle. The effect only *registers* the listener; the state
  // update lives in the handler, not the effect body, so it satisfies
  // eslint-plugin-react-hooks@7's `set-state-in-effect` rule.
  //
  // Opening also starts the search index (42s): the ingredients fetch and the
  // in-memory build run while the first word is typed, so a cold palette has
  // results about when the debounce fires rather than a beat after it.
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        prefetchIndex();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [prefetchIndex]);

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
    /* A new opening starts without Tab's Ask, and a closing ends any Ask
     * (the effect below aborts its request). */
    setAskForced(false);
    if (!open) {
      setAskState(undefined);
      setSawRouting(false);
    }
  }
  useEffect(() => {
    if (open) return;
    askAbort.current?.abort();
    /* Forgotten, so its grace timer can't close a later opening. */
    askAbort.current = undefined;
  }, [open]);

  // Close on route change, same derived-state pattern as `SidebarLayout`: compare
  // the live pathname to the last one seen and reset during render.
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  const openPalette = useCallback(() => {
    prefetchIndex();
    setOpen(true);
  }, [prefetchIndex]);
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
      if (!next.trim()) setAskForced(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        submitSearch(next.trim());
      }, SEARCH_DEBOUNCE_MS);
    },
    [submitSearch],
  );

  const trimmed = value.trim();
  const q = trimmed.toLowerCase();

  /*
   * The Ask row (43q, the editor's only). It **leads** — first, and
   * highlighted, so Enter asks — for a question ("what drinks can I make
   * with lime", "…?"), when Tab called it up, or while an Ask is in flight.
   * A request that may as well be a search ("any bean salad", "use up
   * buttermilk", a long recipe name) gets the row **after** the results,
   * unhighlighted, so Enter still opens the top recipe (Dq12).
   */
  const askLeads =
    !!askHandler &&
    !!trimmed &&
    (!!askState || askForced || askHandler.leads(trimmed));
  const showAsk = askLeads || (!!askHandler && askHandler.offers(trimmed));
  const runAsk = (question: string) => {
    if (!askHandler || askState) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const controller = new AbortController();
    askAbort.current?.abort();
    askAbort.current = controller;
    setAskState({ question, phase: "asking" });
    askHandler.ask(question, controller.signal).then(
      (answer) => {
        if (controller.signal.aborted) return;
        setAskState({
          question,
          phase: "opening",
          label: answer.label,
          fallback: answer.fallback,
        });
        /* Not a recent search: a question re-run as words finds little. */
        /* A transition, so "Opening …" stays up until the page is there. */
        let inPlace = false;
        startRouting(() => {
          inPlace = askHandler.open(answer, question);
        });
        if (inPlace) {
          askAbort.current = undefined;
          setOpen(false);
          return;
        }
        setTimeout(() => {
          if (askAbort.current === controller) setOpen(false);
        }, ASK_OPEN_GRACE_MS);
      },
      () => {
        if (askAbort.current === controller && !controller.signal.aborted) {
          setAskState(undefined);
        }
      },
    );
  };
  /* "Opening …" until the navigation's transition has come and gone. */
  if (askState?.phase === "opening") {
    if (routing && !sawRouting) setSawRouting(true);
    else if (!routing && sawRouting) {
      setSawRouting(false);
      setAskState(undefined);
      setOpen(false);
    }
  }
  const askLine = askState
    ? askState.phase === "asking"
      ? `Asking about “${askState.question}”…`
      : askState.fallback
        ? askState.label
        : `Opening ${askState.label ?? "the page"}`
    : undefined;

  // Static items are filtered manually (the single Command runs with
  // `shouldFilter={false}` so the live recipe rows aren't dropped by cmdk).
  const matchesQuery = (name: string, keywords?: string[]) => {
    if (!q) return true;
    const haystack = [name, ...(keywords ?? [])].join(" ").toLowerCase();
    return haystack.includes(q);
  };

  /* The curator (44d) joins the owner rows after New Recipe once the
   * editor's slot offers its hand-off (a model is set up). */
  const destinations = askHandler?.curator
    ? NAV_DESTINATIONS.flatMap((dest) =>
        dest.href === "/new-recipe" ? [dest, CURATOR_DESTINATION] : [dest],
      )
    : NAV_DESTINATIONS;
  const navItems = destinations.filter(
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
  // is built (or when it has errored).
  const indexUsable = status !== "error" && (indexPopulated || isSearching);
  // Results reflect the debounced `query`, not the live `value`. Guarded on
  // `query` so an empty palette lists no recipes at all — `displayedRecipes`
  // falls back to the whole corpus when nothing is typed.
  const recipeResults = query ? (displayedRecipes ?? []) : [];
  const highlightQuery = parsedQuery.text;
  const words = queryWords(highlightQuery);
  const topRecipes = recipeResults.slice(0, MAX_RECIPE_ROWS);
  const hasMore = recipeResults.length > MAX_RECIPE_ROWS;
  const showRecipes = !!trimmed && indexUsable;
  /* The hand-over row's second line (43s): "73 drinks · 35 food". */
  const drinkCount = recipeResults.filter((recipe) =>
    isDrinkRecipe(model, recipe),
  ).length;
  const foodCount = recipeResults.length - drinkCount;
  // `/search` with the whole query, filters and all — the last row's target,
  // and Ctrl/⌘ ↵'s from anywhere in the list (43s). The live input, not the
  // debounced query: the pending debounce is dropped and the input committed.
  const openAll = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    submitSearch(trimmed);
    recordSearch(trimmed);
    go(`/search?q=${encodeURIComponent(trimmed)}`);
  };
  // When a query has recipe hits, the palette enters "recipe search" mode and
  // hides the nav/actions groups, so the only selectable rows are recipes.
  const hasRecipeHits = showRecipes && topRecipes.length > 0;
  /*
   * The rows count the debounced query; the hand-over row opens the live
   * input. While the two differ (a keystroke not yet committed) its count is
   * withheld rather than shown for a set it would not open (43s review).
   */
  const countSettled = trimmed === query;
  /*
   * Recipe rows are on their way (42s): text is typed, nothing has failed, no
   * hits are showing yet, and either the index is still being built or the
   * engine has not answered. Until then "No results found." would be a claim
   * the palette cannot make yet — a cold load used to show it for the whole
   * of the old IndexedDB populate — so a "Searching recipes…" status stands in
   * for it. The debounce alone does not count once the index is built: the
   * answer is a millisecond away, and a row that flickered on every keystroke
   * after a no-hit word would re-announce itself each time.
   */
  const recipesPending =
    !!trimmed &&
    status !== "error" &&
    !hasRecipeHits &&
    (isSearching || !indexPopulated);

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
  //
  // The caret is placed explicitly too: after a bare field it is the end of the
  // string, and after a tag it is just past the term and its trailing space,
  // which may be mid-query when the tag replaced the word under the caret.
  const insertTerm = (next: string, caret = next.length) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setValue(next);
    submitSearch(next.trim());
    const input = inputRef.current;
    input?.focus();
    // After React has written the new value, which moves the caret to the end.
    requestAnimationFrame(() => input?.setSelectionRange(caret, caret));
  };

  // A facet row picked while a word is half-typed replaces that word: typing
  // `chick` and taking "Only tag:chicken" gives `tag:chicken`, not
  // `chick tag:chicken` (`insertTagTerm`). A row that is not what the word was
  // heading for appends, as it always has. Read at the moment of the pick, so a
  // click and an Enter on the highlighted row see the same caret — a click
  // moves focus but leaves the input's selection where it was.
  const insertTag = (tag: string) => {
    const caret = inputRef.current?.selectionStart ?? value.length;
    const edit = insertTagTerm(value, caret, tag, tagWordMatch(tag, allTerms));
    insertTerm(edit.value, edit.caret);
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
    /*
     * Tab to Ask (43q): from the field, Tab calls the Ask row up (or moves
     * the highlight onto it) instead of leaving the field. Once the row is
     * up and highlighted, Tab moves focus as it always did — never a trap.
     */
    if (
      e.key === "Tab" &&
      !e.shiftKey &&
      askHandler &&
      trimmed &&
      !askState &&
      e.target === inputRef.current &&
      (!showAsk || selectedValue !== ASK_VALUE)
    ) {
      e.preventDefault();
      setAskForced(true);
      setSelectedValue(ASK_VALUE);
      return;
    }
    /*
     * Ctrl ↵ (⌘ ↵ on a Mac) opens every result on `/search` (43s), whatever
     * row is highlighted. Prevented before cmdk sees it: its root handler
     * runs only when the event is not already `defaultPrevented`, so plain
     * Enter still opens the highlighted row.
     */
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      // Any typed query, hits or not: never the highlighted nav row instead.
      if (trimmed && !e.nativeEvent.isComposing) {
        e.preventDefault();
        openAll();
      }
      return;
    }
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
  /*
   * A leading Ask row (43q) takes the highlight once per input, and results
   * landing later don't take it back. A trailing one never takes it.
   */
  const askKey = askLeads ? trimmed : undefined;
  if (askKey !== snappedAsk) {
    setSnappedAsk(askKey);
    if (askKey) setSelectedValue(ASK_VALUE);
    else if (selectedValue === ASK_VALUE) {
      setSelectedValue(topSlug ? `recipe:${topSlug}` : "");
    }
  }
  if (topSlug && topSlug !== snappedSlug) {
    setSnappedSlug(topSlug);
    setSelectedValue(askLeads ? ASK_VALUE : `recipe:${topSlug}`);
  } else if (!topSlug && snappedSlug !== undefined) {
    // Left recipe-search mode — hand the selection to the recents that reappear
    // beneath, else drop it so cmdk highlights the first launcher item.
    setSnappedSlug(undefined);
    setSelectedValue(
      askLeads
        ? ASK_VALUE
        : firstRecent
          ? `${RECENT_PREFIX}${firstRecent}`
          : "",
    );
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

  /* Its second line is the Ask's progress, said again by the status line. */
  const askGroup = showAsk ? (
    <CommandGroup heading="Ask" data-testid="palette-ask-group">
      <CommandItem
        value={ASK_VALUE}
        onSelect={() => runAsk(trimmed)}
        aria-busy={askState ? true : undefined}
      >
        <span className="flex size-9 shrink-0 items-center justify-center">
          <Sparkles aria-hidden className="size-5 text-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            Ask: “{askState?.question ?? trimmed}”
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {askLine ?? "Fills in a page from your question"}
          </span>
        </span>
        {askLeads && !askState && (
          <CommandShortcut aria-hidden>↵</CommandShortcut>
        )}
      </CommandItem>
    </CommandGroup>
  ) : null;

  /*
   * The curator hand-off (44d): a fetch request ("find …", "import …")
   * gets a row right after Ask's place that opens the curator with the
   * words filled in (never started). The snap above never moves the
   * highlight onto it, so wherever another row would take Enter, 43q's
   * rules stand; only when it is the one row does cmdk's own first-row
   * highlight land on it, and Enter opens the curator.
   */
  const curator = askHandler?.curator;
  const curatorGroup =
    curator && trimmed && !askState && curator.offers(trimmed) ? (
      <CommandGroup heading="Curator" data-testid="palette-curator-group">
        <CommandItem
          value={CURATOR_VALUE}
          onSelect={() => go(curator.href(trimmed))}
        >
          <span className="flex size-9 shrink-0 items-center justify-center">
            <Bot aria-hidden className="size-5 text-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">Ask the curator: “{trimmed}”</span>
            <span className="block truncate text-xs text-muted-foreground">
              Opens the curator with this filled in
            </span>
          </span>
        </CommandItem>
      </CommandGroup>
    ) : null;

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      <PaletteAskRegistry.Provider value={registerAsk}>
        {children}
        {askSlot}
      </PaletteAskRegistry.Provider>
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
        {/*
          A status, not an option: outside the listbox (whose children must be
          options or groups), announced politely, never selectable. Always
          mounted with only its text swapped, so a screen reader hears the
          change rather than a live region appearing (which many never read).
        */}
        <p
          role="status"
          data-testid="palette-searching"
          className={
            recipesPending
              ? "px-4 pt-3 text-sm text-muted-foreground"
              : "sr-only"
          }
        >
          {/* "Searching 799 recipes…" once the corpus is in (canvas B). */}
          {recipesPending
            ? allRecipes.length > 0
              ? `Searching ${allRecipes.length} recipes…`
              : "Searching recipes…"
            : ""}
        </p>
        {/* Ask's progress (43q), for a screen reader: mounted once Ask is. */}
        {askHandler && (
          <p role="status" data-testid="palette-ask-status" className="sr-only">
            {askLine ?? ""}
          </p>
        )}
        {/* A mark in a muted line of the highlighted row reads in the
            foreground: muted text on the mark's tint over the row's accent
            measured 4.2:1 (43q's axe run, Dq18). */}
        <CommandList
          className={`${SEARCH_MARKS} [&_[data-selected=true]_mark]:text-foreground`}
          data-testid="palette-list"
          data-index-ready={String(indexPopulated)}
          aria-busy={recipesPending || undefined}
        >
          {!recipesPending && <CommandEmpty>No results found.</CommandEmpty>}

          {/*
            Ask (43q) leads when the input reads as a question: the question
            is what Enter should send.
          */}
          {askLeads && askGroup}
          {askLeads && curatorGroup}

          {hasRecipeHits && (
            <CommandGroup heading="Recipes" data-testid="palette-recipes-group">
              {topRecipes.map((recipe) => {
                // Highlight against the *committed* query's free text, not the
                // live input: these rows were matched on it, so marking a prefix
                // from `value` would, for one debounce, highlight something the
                // result set was never matched on — and marking a `tag:` value
                // would highlight a word that constrained the set rather than
                // matched it.
                const why = rowWhy(recipe, highlightQuery, words);
                const drink = isDrinkRecipe(model, recipe);
                const meta = [
                  ...(drink ? ["Drink"] : []),
                  ...recipeMeta(model, recipe, drink),
                ];
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
                      {meta.length > 0 && (
                        <span className="block truncate font-mono text-[0.6875rem] leading-4 text-muted-foreground">
                          {meta.join(" · ")}
                        </span>
                      )}
                      {why && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {why}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
              {/*
                The hand-over row (43s, canvas B): always last among the
                recipes, counting every result — the whole query travels,
                filters included, so `/search` shows the very set it counts.
              */}
              <CommandItem
                value="see-all-results"
                onSelect={openAll}
                aria-keyshortcuts={
                  modifier === "⌘" ? "Meta+Enter" : "Control+Enter"
                }
                className="rounded-t-none border-t border-t-border font-semibold"
              >
                <span className="flex size-9 shrink-0 items-center justify-center">
                  <CornerDownLeft className="size-5 text-primary" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">
                    {countSettled
                      ? `All ${recipeResults.length} ${recipeResults.length === 1 ? "result" : "results"} in search`
                      : "All results in search"}
                  </span>
                  {countSettled && drinkCount > 0 && foodCount > 0 && (
                    <span className="block font-mono text-[0.6875rem] font-normal leading-4 text-muted-foreground">
                      {drinkCount} {drinkCount === 1 ? "drink" : "drinks"} ·{" "}
                      {foodCount} food
                    </span>
                  )}
                </span>
                {/* Said by `aria-keyshortcuts`; the glyphs read as noise. */}
                <CommandShortcut
                  aria-hidden
                >{`${modifier.replace("+", "")} ↵`}</CommandShortcut>
              </CommandItem>
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
                    {/*
                      The group's own picture, else the member photo the corpus
                      borrowed for it (30c), else the icon. Decided up front and
                      never swapped on an image error: replacing a row's child
                      re-registers the cmdk item, which is what broke
                      Enter-opens-the-top-row in 28i (30-T2).
                    */}
                    {(() => {
                      const picture = groupPicture(group);
                      return picture ? (
                        <PureStaticImage
                          {...picture}
                          alt=""
                          width={400}
                          height={600}
                          className="size-full object-cover"
                        />
                      ) : (
                        <Layers className="size-4 text-muted-foreground" />
                      );
                    })()}
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
                  onSelect={() => insertTag(tag)}
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
          {/*
            A request that may as well be a search (43q): Ask after
            everything else, unhighlighted — Tab, or the arrows, reach it.
          */}
          {!askLeads && askGroup}
          {!askLeads && curatorGroup}
        </CommandList>
        {/* How to ask what doesn't read as a question (43q). */}
        {askHandler && trimmed && !askLeads && (
          <p
            data-testid="palette-ask-hint"
            className="border-t px-4 py-2 text-xs text-muted-foreground"
          >
            Press <kbd className="font-mono">Tab</kbd> to ask this as a question
          </p>
        )}
      </CommandDialog>
    </CommandPaletteContext.Provider>
  );
}
