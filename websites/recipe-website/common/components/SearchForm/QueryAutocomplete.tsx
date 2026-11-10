"use client";

import {
  useCallback,
  useId,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@discontent/component-library/components/ui/popover";
import { cn } from "@discontent/component-library/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fetchIngredients, useSearch } from "./SearchContext";
import type { GroupSearchEntry } from "../../controller/data/readGroupSearchCorpus";
import type { SearchTerm } from "../../controller/data/readTermPage";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import { prepareCorpus, suggestNames } from "../../util/makeable";
import { ANY_BEAN_VALUE, ANY_FORM_PREFIX } from "../../util/ingredientQuery";
import {
  FILTER_FIELDS,
  anyLineMatcher,
  completionsAt,
  fold,
  quoteQueryValue,
  replaceAtom,
  replaceSpan,
  type FilterField,
  type QueryCompletion,
} from "./queryLanguage";
import { startsWithFolded } from "./tagMatch";
import { useFacetModel } from "./useFacetModel";
import { countFacets } from "../../util/facets";

/**
 * How many operand rows to offer at once.
 *
 * A corpus can carry any number of tags and the list sits over the results, so
 * it is bounded rather than scrolled — eight is about as many as read as a
 * glanceable menu. Typing one more character is the way to see the rest, which
 * is what a prefix list is for.
 */
const MAX_OPTIONS = 8;

/** One line of prose per field, so the list teaches the language as it offers it. */
const FIELD_HINTS: Record<FilterField, string> = {
  tag: "recipes carrying a tag",
  ingredient: "recipes using an ingredient — ~ for any form, any-bean",
  name: "match the recipe name only",
  description: "match the description",
  group: "recipes in a meal plan or collection — group:<slug>",
  source: "where a recipe came from — source:imbibe",
  time: "total minutes — time:<30",
  before: "added before a date — before:2026-01-01",
  after: "added on or after a date",
};

export interface CompletionOption {
  /** Stable across renders for the same suggestion; also the React key. */
  key: string;
  /** What the row shows as its subject. */
  label: string;
  /** The second line: what accepting it would mean. */
  hint?: string;
  /**
   * How many recipes accepting it would find (43s, canvas B: "pumpkin puree
   * 22"), when that is known.
   */
  count?: number;
  /** What replaces `completion.span` when it is accepted. */
  replacement: string;
}

function fieldOptions(prefix: string): CompletionOption[] {
  const folded = fold(prefix);
  return FILTER_FIELDS.filter((field) => field.startsWith(folded)).map(
    (field) => ({
      key: `field:${field}`,
      label: `${field}:`,
      hint: FIELD_HINTS[field],
      replacement: `${field}:`,
    }),
  );
}

/** One alias, and the label of the term it reaches (32i). */
export interface TagAlias {
  alias: string;
  label: string;
}

/**
 * Every alias of a term something carries, beside that term's label — what
 * the `tag:` completion offers the canonical term for. A term nothing carries
 * is left out, as `allTags` leaves it out: its chip would find nothing.
 */
export function tagAliasesOf(terms: readonly SearchTerm[]): TagAlias[] {
  return terms.flatMap((term) =>
    term.count > 0
      ? (term.aliases ?? []).map((alias) => ({ alias, label: term.label }))
      : [],
  );
}

/**
 * Corpus tags matching what has been typed after `tag:`.
 *
 * Folded on both sides so `tag:cre` offers `Crème`, for the same reason
 * `matchesFilter` folds — and quoted on the way out, so a multi-word tag comes
 * back as one atom rather than two.
 *
 * A tag that folds to exactly the prefix is dropped: it is already typed, and a
 * row offering to replace `dessert` with `dessert` is a list that will not go
 * away.
 *
 * **Aliases (32i).** After the tags themselves, an alias matching the prefix
 * offers the term it belongs to — `tag:bisc` offers "cookies", hinted with the
 * alias — so typing an old or other name lands on the canonical one. An alias
 * typed in full still offers its term (that is the point of the row), and a
 * term already in the list is not offered twice.
 */
export function tagCompletionOptions(
  prefix: string,
  allTags: string[],
  aliases: readonly TagAlias[] = [],
  /** Recipes `tag:<label>` finds, by label (43s). */
  countOf?: (label: string) => number | undefined,
): CompletionOption[] {
  const folded = fold(prefix);
  const counted = (label: string) => {
    const count = countOf?.(label);
    return count === undefined ? {} : { count };
  };
  const options: CompletionOption[] = allTags
    .filter((tag) => startsWithFolded(tag, folded) && fold(tag) !== folded)
    .slice(0, MAX_OPTIONS)
    .map((tag) => ({
      key: `tag:${tag}`,
      label: tag,
      replacement: `tag:${quoteQueryValue(tag)}`,
      ...counted(tag),
    }));
  const offered = new Set(options.map((option) => option.label));
  for (const { alias, label } of aliases) {
    if (options.length >= MAX_OPTIONS) break;
    if (offered.has(label) || fold(label) === folded) continue;
    if (!startsWithFolded(alias, folded)) continue;
    offered.add(label);
    options.push({
      key: `tag-alias:${alias}`,
      label,
      hint: `also called ${alias}`,
      replacement: `tag:${quoteQueryValue(label)}`,
      ...counted(label),
    });
  }
  return options;
}

/**
 * Groups matching what has been typed after `group:` (22f's term, which
 * matches on the group's *slug*). The prefix is tried against the folded slug
 * and the folded name, so `group:week` offers `week-of-may-4` and so does
 * `group:Week of` — a curator remembers the name, the query wants the slug.
 * Slugs carry no whitespace, so nothing needs quoting on the way out.
 */
function groupOptions(
  prefix: string,
  allGroups: GroupSearchEntry[],
): CompletionOption[] {
  const folded = fold(prefix);
  return allGroups
    .filter((group) => {
      const slug = fold(group.slug);
      if (slug === folded) return false;
      return slug.startsWith(folded) || fold(group.name).startsWith(folded);
    })
    .slice(0, MAX_OPTIONS)
    .map((group) => ({
      key: `group:${group.slug}`,
      label: group.slug,
      hint: `${group.name} · ${group.kind === "meal-plan" ? "meal plan" : "collection"}`,
      replacement: `group:${group.slug}`,
    }));
}

/** What `ingredientOptions` completes from: names, and a check against the lines. */
export interface IngredientSuggestions {
  /** `suggestNames`' list, most used first. */
  names: string[];
  /** Would `ingredient:<folded name>` match any line? `anyLineMatcher`'s answer. */
  matches: (needle: string) => boolean;
  /** How many recipes `ingredient:<folded name>` finds (43s). */
  count?: (needle: string) => number;
}

/**
 * The plural-blind keys a folded name answers to — "pumpkin seed" and
 * "pumpkin seeds" (canvas B's finding) share one — on the last word only.
 * The first is the name less one final `s` (lime/limes, cheese/cheeses),
 * when that leaves a word and the name does not end in `ss`; a name ending
 * `es` also answers to its `es`-less stem (tomato/tomatoes). Two names are
 * one row when any of their keys meet.
 */
export function pluralKeys(folded: string): string[] {
  const keys: string[] = [];
  const lastWord = folded.slice(folded.lastIndexOf(" ") + 1);
  const strips = (n: number) =>
    lastWord.length - n >= 2 ? folded.slice(0, -n) : undefined;
  const plain = /[^s]s$/.test(lastWord) ? strips(1) : undefined;
  keys.push(plain ?? folded);
  if (/[^s]es$/.test(lastWord)) {
    const stem = strips(2);
    if (stem !== undefined) keys.push(stem);
  }
  return keys;
}

/** The first of `pluralKeys`: the key the plain `-s` rule gives. */
export function pluralKey(folded: string): string {
  return pluralKeys(folded)[0];
}

/**
 * Recipes whose lines `ingredient:<needle>` would match — `fieldMatches`'
 * rule, over lines folded once — memoized per needle.
 */
export function recipeLineCounter(
  bySlug: Record<string, string[]>,
): (needle: string) => number {
  const recipes = Object.values(bySlug).map((lines) =>
    lines.map((line) => {
      const hay = fold(line);
      return { hay, words: hay.split(/[^\p{L}\p{N}]+/u) };
    }),
  );
  const memo = new Map<string, number>();
  return (needle) => {
    const known = memo.get(needle);
    if (known !== undefined) return known;
    const spaced = /\s/.test(needle);
    let count = 0;
    for (const lines of recipes) {
      const hit = lines.some(({ hay, words }) =>
        spaced
          ? hay.includes(needle)
          : hay.startsWith(needle) ||
            words.some((word) => !!word && word.startsWith(needle)),
      );
      if (hit) count += 1;
    }
    memo.set(needle, count);
    return count;
  };
}

/**
 * Ingredient names matching what has been typed after `ingredient:` (32f).
 *
 * The names are the Make page's (`suggestNames`), so they are *normalized*:
 * "fresh lime juice" is offered as `lime juice` and "2 cups cherries" as
 * `cherry`. The filter, though, matches the lines as written, and `cherry` is
 * not a prefix of any word in "cherries". So each candidate is checked against
 * the lines with the filter's own rule before it is offered. A suggestion that
 * finds nothing is worse than no suggestion. Only the rows shown are checked:
 * the loop stops at `MAX_OPTIONS`.
 *
 * Folded and deduped (an alias such as `Gnista` can fold to a line name), with
 * the same "already typed" rule as tags, and quoted on the way out.
 */
export function ingredientOptions(
  prefix: string,
  { names, matches, count }: IngredientSuggestions,
): CompletionOption[] {
  /* 46h: after `~` the names are offered "in any form", the tilde kept. */
  const anyForm = prefix.trimStart().startsWith(ANY_FORM_PREFIX);
  const folded = fold(
    anyForm ? prefix.trimStart().slice(ANY_FORM_PREFIX.length) : prefix,
  );
  const options: CompletionOption[] = [];
  /* 46h: the bean family, first, for "bea…" or "any…". */
  if (!anyForm && offersAnyBean(folded)) {
    options.push({
      key: `ingredient:${ANY_BEAN_VALUE}`,
      label: ANY_BEAN_LABEL,
      hint: "black, kidney, chickpea and every traditional bean — never green or vanilla beans",
      replacement: `ingredient:${ANY_BEAN_VALUE}`,
    });
  }
  /*
   * Plural-blind (43s): "pumpkin seed" and "pumpkin seeds" are one row, in
   * the place of the more used, offering the *shortest* spelling — every
   * other member starts with it, so `ingredient:"pumpkin seed"` finds the
   * seeds' recipes too. Grouped first, judged after: a member that is
   * already typed, or that no line matches, does not stand for its group.
   */
  const groups: { members: { name: string; value: string }[] }[] = [];
  const groupOf = new Map<string, (typeof groups)[number]>();
  for (const name of names) {
    const value = fold(name);
    const keys = pluralKeys(value);
    let group = keys.map((key) => groupOf.get(key)).find(Boolean);
    if (!group) {
      group = { members: [] };
      groups.push(group);
    }
    if (!group.members.some((member) => member.value === value))
      group.members.push({ name, value });
    for (const key of keys) if (!groupOf.has(key)) groupOf.set(key, group);
  }
  for (const { members } of groups) {
    // The typed name already finds every member: nothing to narrow to.
    if (members.some((member) => member.value === folded)) continue;
    const offered = members
      .filter(({ value }) => value.startsWith(folded) && matches(value))
      .reduce<{ name: string; value: string } | undefined>(
        (best, member) =>
          !best || member.value.length < best.value.length ? member : best,
        undefined,
      );
    if (!offered) continue;
    const tilde = anyForm ? ANY_FORM_PREFIX : "";
    options.push({
      key: `ingredient:${tilde}${offered.value}`,
      label: offered.name,
      replacement: `ingredient:${tilde}${quoteQueryValue(offered.name)}`,
      /* The count is the text match's: an any-form row says what it means instead. */
      ...(anyForm
        ? { hint: "in any form — canned, dried, cooked" }
        : count
          ? { count: count(offered.value) }
          : {}),
    });
    if (options.length >= MAX_OPTIONS) break;
  }
  return options;
}

/** How the bean family is offered after `ingredient:` (46h). */
export const ANY_BEAN_LABEL = "Any bean (black, kidney, chickpea…)";

/**
 * Does a folded `ingredient:` prefix ask for the bean family? Two letters of
 * "any bean" (or "any-bean"), or three of "beans" — not once it is typed out.
 */
export function offersAnyBean(folded: string): boolean {
  const typed = folded.trim();
  if (typed === ANY_BEAN_VALUE || typed === "any bean") return false;
  return (
    (typed.length >= 2 &&
      ("any bean".startsWith(typed) || ANY_BEAN_VALUE.startsWith(typed))) ||
    (typed.length >= 3 && "beans".startsWith(typed))
  );
}

/**
 * Built once per ingredients document, and only when an `ingredient:` value
 * first asks. A search can fetch the lines for its own reasons (the index, an
 * `ingredient:beef` filter), and that should not cost a pass over the corpus
 * nobody wanted. Keyed on the document itself, which the query keeps for good.
 */
const suggestionsByDocument = new WeakMap<
  Record<string, string[]>,
  IngredientSuggestions
>();

/**
 * The corpus `ingredientOptions` reads: the display recipes with their lines
 * rejoined (as `MakePage` does, so stored headings stay headings), staples
 * kept.
 */
function ingredientSuggestions(
  allRecipes: MassagedRecipeEntry[],
  ingredientsBySlug: Record<string, string[]>,
): IngredientSuggestions {
  const cached = suggestionsByDocument.get(ingredientsBySlug);
  if (cached) return cached;
  const corpus = allRecipes.map((recipe) => {
    const ingredients = ingredientsBySlug[recipe.slug];
    return ingredients ? { ...recipe, ingredients } : recipe;
  });
  const built = {
    names: suggestNames(prepareCorpus(corpus), { includeStaples: true }),
    matches: anyLineMatcher(Object.values(ingredientsBySlug).flat()),
    count: recipeLineCounter(ingredientsBySlug),
  };
  // Not before the display corpus lands, or an empty list would stick.
  if (allRecipes.length > 0)
    suggestionsByDocument.set(ingredientsBySlug, built);
  return built;
}

function optionsFor(
  completion: QueryCompletion | undefined,
  allTags: string[],
  tagAliases: readonly TagAlias[],
  allGroups: GroupSearchEntry[],
  ingredients: IngredientSuggestions | undefined,
  tagCount: (label: string) => number | undefined,
): CompletionOption[] {
  if (!completion) return [];
  if (completion.kind === "field") return fieldOptions(completion.prefix);
  /*
   * `tag:`, `group:` and `ingredient:` have values to offer. `allTags` and
   * `allGroups` are on the context already (both fetched unconditionally), so
   * they cost nothing. Ingredients are a *conditional* fetch (F4a) that is
   * often not in memory, so the hook enables it only once the caret is in an
   * `ingredient:` value, and the list says "Loading ingredients…" until it
   * lands. That is one request per page load, not one per keystroke: it is the
   * same `["recipe-ingredients"]` query search and `/make` use, kept forever.
   * The other fields take free text or a date, which no list can shorten.
   */
  if (completion.field === "tag")
    return tagCompletionOptions(
      completion.prefix,
      allTags,
      tagAliases,
      tagCount,
    );
  if (completion.field === "group")
    return groupOptions(completion.prefix, allGroups);
  if (completion.field === "ingredient" && ingredients)
    return ingredientOptions(completion.prefix, ingredients);
  return [];
}

export interface QueryAutocomplete {
  enabled: boolean;
  open: boolean;
  /** The caret is in an `ingredient:` value and the lines are still on their way. */
  loading: boolean;
  listId: string;
  /**
   * The listbox is in the DOM. The field's `aria-controls` and
   * `aria-expanded` follow this rather than `open`, so they can never name a
   * list that is not there (40f). See `listRef`.
   */
  listMounted: boolean;
  /** The callback ref `QueryAutocompleteList` puts on the listbox. */
  listRef: (node: HTMLUListElement | null) => void;
  options: CompletionOption[];
  /** -1 when nothing is active, which is the resting state. See `onKeyDown`. */
  activeIndex: number;
  activeOptionId?: string;
  optionId: (index: number) => string;
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  /** Wired to both `onChange` and `onSelect`: any caret move re-reads the atom. */
  onCaretChange: (event: SyntheticEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onOpenChange: (next: boolean) => void;
  accept: (option: CompletionOption) => void;
  setActiveIndex: (index: number) => void;
}

/**
 * The state behind in-field syntax completion, kept out of `SearchInput` so the
 * field itself stays a field.
 *
 * **Everything reads `inputValue`, never `query`.** `query` lags the field by
 * `SEARCH_DEBOUNCE_MS`, and a completion computed against a 180 ms-old string
 * would carry offsets into text that has already moved — accepting it would
 * splice at the wrong place. The chips can key off `query` because they are
 * drawn *from* it; this is keyed off the caret, which lives in the present.
 */
export function useQueryAutocomplete({
  enabled,
  inputRef,
  clearPendingSearch,
}: {
  enabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Cancels the debounce, so the keystroke it was going to commit cannot land
   * on top of the rewrite — 21b's `insertTerm` opens the same way. */
  clearPendingSearch: () => void;
}): QueryAutocomplete {
  const {
    inputValue,
    setInputValue,
    submitSearch,
    allTags,
    allTerms,
    allGroups,
    allRecipes,
  } = useSearch();
  const tagAliases = useMemo(() => tagAliasesOf(allTerms), [allTerms]);
  /*
   * What `tag:<label>` finds, subtree and aliases included (43f's counting,
   * `tag:`'s own reading), so a row's count is what accepting it shows.
   */
  const model = useFacetModel();
  const corpusCounts = useMemo(
    () => countFacets(model, allRecipes),
    [model, allRecipes],
  );
  const tagCount = useCallback(
    (label: string) => {
      const slug = model.resolve(label);
      return slug === undefined ? undefined : corpusCounts.subtree.get(slug);
    },
    [model, corpusCounts],
  );
  const listId = useId();
  /*
   * Whether the listbox element exists, learned from the element itself
   * (40f). The combobox's ARIA used to follow `open`, and axe caught the
   * field saying `aria-expanded="true"` with an `aria-controls` naming an id
   * the DOM did not hold — the popover's portaled content is not in the DOM
   * in every commit `open` is true in (7 retries of the "loading" spec in 60
   * CI runs). A callback ref runs in the commit that attaches or detaches
   * the list, and its state update re-renders the field before the browser
   * paints, so the field and the list agree whenever anything can read them.
   */
  const [listMounted, setListMounted] = useState(false);
  const listRef = useCallback((node: HTMLUListElement | null) => {
    setListMounted(node !== null);
  }, []);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndexState] = useState(-1);

  const raw = inputValue || "";
  const completion = useMemo(
    () =>
      enabled ? completionsAt(raw, Math.min(caret, raw.length)) : undefined,
    [enabled, raw, caret],
  );

  /*
   * The same query `SearchProvider` and `MakePage` declare, so whichever asks
   * first fetches for all three. Enabled only while the caret is in an
   * `ingredient:` value; once the lines are cached (`staleTime: Infinity`),
   * a later `ingredient:` completes at once.
   */
  const wantsIngredients =
    completion?.kind === "operand" && completion.field === "ingredient";
  const ingredientsQuery = useQuery({
    queryKey: ["recipe-ingredients"],
    queryFn: fetchIngredients,
    enabled: wantsIngredients,
    staleTime: Infinity,
  });
  const ingredientsBySlug = ingredientsQuery.data;
  const ingredients = useMemo(
    () =>
      wantsIngredients && ingredientsBySlug
        ? ingredientSuggestions(allRecipes, ingredientsBySlug)
        : undefined,
    [wantsIngredients, allRecipes, ingredientsBySlug],
  );
  /* A failed fetch shows nothing rather than a row that never stops loading. */
  const loading =
    wantsIngredients && !ingredientsBySlug && !ingredientsQuery.isError;

  const options = useMemo(
    () =>
      optionsFor(
        completion,
        allTags,
        tagAliases,
        allGroups,
        ingredients,
        tagCount,
      ),
    [completion, allTags, tagAliases, allGroups, ingredients, tagCount],
  );

  const open =
    enabled && focused && !dismissed && (options.length > 0 || loading);
  /*
   * Clamped on read rather than reset in an effect: the option list is derived
   * from the query and the caret, so it can shrink under a stored index at any
   * keystroke. `set-state-in-effect` is a lint error in this repo, and an
   * `aria-activedescendant` pointing at a row that no longer exists is an axe
   * violation — deriving avoids both.
   */
  const active = activeIndex < options.length ? activeIndex : -1;

  const optionId = useCallback(
    (index: number) => `${listId}-option-${index}`,
    [listId],
  );

  const onCaretChange = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      setCaret(event.currentTarget.selectionStart ?? 0);
      // Typing or moving the caret revives a list Escape put away: the dismissal
      // was about *this* suggestion, not about the feature.
      setDismissed(false);
      setActiveIndexState(-1);
    },
    [],
  );

  const accept = useCallback(
    (option: CompletionOption) => {
      if (!completion) return;
      clearPendingSearch();

      /*
       * A field name (`tag:`) is half an atom: the caret stays right after the
       * colon, ready for the operand. An operand finishes the atom, so it is
       * written with `replaceAtom` — the same write a picked tag goes through
       * in the palette and the rail — which adds one space and puts the caret
       * after it: the next keystroke starts the next word, and the list closes
       * instead of offering longer tags than the one just chosen.
       *
       * Submitted trimmed, *then* the field set: `submitSearch` writes the
       * field too, and the trailing space belongs to the field, not the query.
       */
      let next: string;
      let at: number;
      if (completion.kind === "operand") {
        ({ value: next, caret: at } = replaceAtom(
          raw,
          completion.span,
          option.replacement,
        ));
      } else {
        next = replaceSpan(raw, completion.span, option.replacement);
        // Clamped because `replaceSpan` tidies, which can shorten the string
        // ahead of the splice; the arithmetic is exact for every query that is
        // not already carrying doubled whitespace.
        at = Math.min(
          completion.span.start + option.replacement.length,
          next.length,
        );
      }
      submitSearch(next.trim());
      setInputValue(next);
      setActiveIndexState(-1);

      /*
       * Put the caret after what was just written, and put focus back in the
       * field — 21b found by a failing assertion that clicking a suggestion
       * takes focus off the input, and a bare `tag:` is only "ready for the
       * operand" if the caret is actually there.
       */
      requestAnimationFrame(() => {
        const element = inputRef.current;
        if (!element) return;
        element.focus();
        element.setSelectionRange(at, at);
        setCaret(at);
      });
    },
    [
      completion,
      raw,
      clearPendingSearch,
      setInputValue,
      submitSearch,
      inputRef,
    ],
  );

  /**
   * The three keys that already meant something in this field, and what each
   * one had to concede.
   *
   * - **Enter (and Tab) stay what they were unless a row is active**, and no row is active
   *   until an arrow key makes one. Auto-highlighting the first suggestion
   *   would mean typing `tag` and pressing Enter inserts `tag:` instead of
   *   searching for the word — a hijack of the field's primary key, and one
   *   every existing spec would trip over, since `searchFor()` fills and then
   *   presses Enter. So the resting `activeIndex` is -1 and Enter falls through
   *   untouched, which keeps "Enter flushes the debounce and records the query"
   *   exactly true.
   * - **Escape must `preventDefault`.** `type="search"` clears the field
   *   natively on Escape in some engines, so dismissing the list without
   *   stopping the event would take the query with it.
   * - **A composing keystroke is not navigation.** An IME sends Enter and the
   *   arrows to commit and move through its own candidate list; `isComposing`
   *   is the guard cmdk applies at its root, for this.
   */
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (!enabled || event.nativeEvent.isComposing) return;

      if (event.key === "Escape") {
        if (!open) return;
        event.preventDefault();
        setDismissed(true);
        setActiveIndexState(-1);
        return;
      }

      if (!open) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndexState((index) =>
          index + 1 >= options.length ? 0 : index + 1,
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndexState((index) =>
          index <= 0 ? options.length - 1 : index - 1,
        );
        return;
      }
      // Tab accepts the active row as Enter does, and only then: with nothing
      // highlighted it is still the key that leaves the field.
      if (
        (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) &&
        active >= 0
      ) {
        event.preventDefault();
        accept(options[active]);
      }
    },
    [enabled, open, options, active, accept],
  );

  return {
    enabled,
    open,
    loading,
    listId,
    listMounted,
    listRef,
    options,
    activeIndex: active,
    activeOptionId: active >= 0 ? optionId(active) : undefined,
    optionId,
    onKeyDown,
    onCaretChange,
    onFocus: useCallback(() => setFocused(true), []),
    onBlur: useCallback(() => setFocused(false), []),
    onOpenChange: useCallback((next: boolean) => {
      // Radix reports its own dismissals — an outside pointer-down, and the
      // Escape its layer stack also sees. Both mean the same thing here.
      if (!next) setDismissed(true);
    }, []),
    accept,
    setActiveIndex: setActiveIndexState,
  };
}

/**
 * The suggestion list itself: a listbox anchored under the field, portaled out
 * of it.
 *
 * **Radix, not a hand-rolled `absolute` div.** `PopoverContent` portals, and the
 * picker modal that shares this field is `max-h-[80vh] overflow-y-auto` — an
 * in-flow dropdown would be clipped by that scroll container. It also brings a
 * correct layer stack, so an Escape aimed at the list is not also an Escape
 * aimed at the dialog behind it.
 *
 * Three overrides are required and none is cosmetic: `align="start"` puts it
 * under the caret's edge rather than centred; the width follows the anchor
 * instead of the default `w-72`; and **both auto-focus events are prevented**,
 * because Radix moves focus into an opening popover by default and the caret has
 * to stay in the input for the next keystroke to land there.
 *
 * **No `<button>` in a row.** `nested-interactive` is a wcag2a rule the axe
 * specs assert, and a `role="option"` carrying a button violates it — the same
 * constraint that shaped the palette's recents and 21b's sibling-button chips.
 * Rows are plain elements; the pointer path is a `mousedown` that
 * `preventDefault`s so focus never leaves the field, then a click.
 *
 * **The loading row is not an option (32f).** It sits above the listbox as a
 * `role="status"`, and the listbox is empty and `aria-busy` meanwhile, which is
 * how `aria-required-children` lets a listbox wait for its options. As an
 * `option` it could be arrowed to and "accepted", and the active-index
 * arithmetic would have to step around it.
 */
export function QueryAutocompleteList({
  autocomplete,
  children,
}: {
  autocomplete: QueryAutocomplete;
  /** The field itself, which the list anchors to. */
  children: ReactNode;
}) {
  const {
    open,
    loading,
    options,
    activeIndex,
    listId,
    listRef,
    optionId,
    accept,
    onOpenChange,
  } = autocomplete;
  const busy = loading && options.length === 0;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-(--radix-popover-trigger-width) overflow-hidden p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {busy ? (
          <p
            role="status"
            data-testid="query-autocomplete-loading"
            className="px-3 py-2 text-sm text-muted-foreground"
          >
            Loading ingredients…
          </p>
        ) : null}
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Query suggestions"
          aria-busy={busy || undefined}
          data-testid="query-autocomplete"
          className={cn("max-h-72 overflow-y-auto", !busy && "py-1")}
        >
          {options.map((option, index) => (
            <li
              key={option.key}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              data-testid="query-autocomplete-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => accept(option)}
              className={cn(
                "flex cursor-pointer flex-row items-baseline gap-2 px-3 py-2 text-sm",
                index === activeIndex && "bg-accent text-accent-foreground",
              )}
            >
              <span
                data-testid="query-autocomplete-label"
                className="font-mono text-foreground"
              >
                {option.label}
              </span>
              {option.hint ? (
                <span className="truncate text-xs text-muted-foreground">
                  {option.hint}
                </span>
              ) : null}
              {option.count !== undefined ? (
                <span
                  data-testid="query-autocomplete-count"
                  className={cn(
                    "ml-auto shrink-0 font-mono text-xs tabular-nums",
                    index === activeIndex
                      ? "text-inherit"
                      : "text-muted-foreground",
                  )}
                >
                  {option.count}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
