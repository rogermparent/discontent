"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import type { TagOption } from "../../controller/tagVocabulary";
import {
  analyzeMakeable,
  prepareCorpus,
  pullCounts,
  type MakeableAnalysis,
} from "../../util/makeable";
import { EmptyState } from "../EmptyState";
import { fetchIngredients, useSearch } from "../SearchForm/SearchContext";
import {
  fold,
  parseQuery,
  positiveTagValues,
  toggleTagTerm,
} from "../SearchForm/queryLanguage";
import { SearchSkeleton } from "../SearchForm/SearchSkeleton";
import { dedupeItems, inventoryKey } from "../../util/inventoryText";
import { canonicalItem, canonicalItems, matcherOf } from "../../util/matchers";
import type { SecondaryInventory } from "../../controller/secondaryInventory";
import {
  InventoryPanel,
  type SaveToEditor,
  type SecondList,
} from "./InventoryPanel";
import {
  savedAdditions,
  type InventoryDiff,
  type SavedInventoryProps,
  type SavedListEdit,
} from "./SavedInventory";
import { CardViewSwitch, MakeResults, type CardContext } from "./MakeResults";
import { MakeTicker } from "./MakeTicker";
import { MakeQuestion } from "./MakeQuestion";
import { scopeRecipes } from "./scope";
import { TagPicks } from "./TagPicks";
import { TagSearch } from "./TagSearch";
import { buildTagIndex, refinementsInScope, subtreeUsage } from "./tagTree";
import { buildTagExpansion } from "../../controller/tagExpansion";
import {
  useInventory,
  useLastMakeQuery,
  useMakeSettings,
} from "./useInventory";
import { useSavedStaples, type SavedStaples } from "./useSavedStaples";
import {
  featuredOfQuery,
  kindOfQuery,
  MAKE_KINDS,
  toggleFeature,
  withKind,
  withoutFeature,
  withoutFeatures,
  withoutTagPicks,
  type MakeKind,
} from "./kinds";
import {
  addCandidates,
  countFromItems,
  featuredLines,
  featureScope,
  matcherMembers,
  mostUsed,
  refineMatcher,
} from "./makeMath";
import { MakeSuggestions, type SuggestionTab } from "./MakeSuggestions";
import { useUndoToast } from "./Toast";

/**
 * A first visit's scope: every recipe (28g). It was `tag:drink` while drinks
 * were the only thing with an inventory story; the tag picker makes any
 * scope one click away, so the page no longer guesses. The last scope used is
 * still remembered — the question's kind word (32j, 41h) shows a remembered
 * `tag:drink` as "drinks" — and `inventory make` has the same "" default.
 */
const FIRST_VISIT_QUERY = "";

/** Refine chips at most (32j). */
const REFINE_LIMIT = 12;

const NO_SLUGS = new Set<string>();

/** Each judged recipe's distance, by slug: can make 0, further away 3+. */
function bucketDistances(analysis: MakeableAnalysis): Map<string, number> {
  const distances = new Map<string, number>();
  for (const match of [
    ...analysis.canMake,
    ...analysis.oneAway,
    ...analysis.twoAway,
    ...analysis.further,
  ]) {
    distances.set(match.recipe.slug, match.distance);
  }
  return distances;
}

/** Without a vocabulary from the route, every carried tag is a root. */
function corpusTagOptions(recipes: MassagedRecipeEntry[]): TagOption[] {
  const seen = new Map<string, TagOption>();
  for (const recipe of recipes) {
    for (const tag of recipe.tags ?? []) {
      const key = fold(tag).trim();
      if (key && !seen.has(key)) seen.set(key, { slug: tag, label: tag });
    }
  }
  return [...seen.values()];
}

/** The tags the kinds are made of (`drink`): never a spec card's style. */
const KIND_TAGS = new Set(
  MAKE_KINDS.flatMap((kind) =>
    positiveTagValues(parseQuery(kind.query.replace(/^-/, "")).filter),
  ).map((tag) => fold(tag).trim()),
);

/**
 * `/make` — "What can I make with…" (25c), redesigned in 41h.
 *
 * Everything happens in the browser, over the corpus `SearchProvider` already
 * holds plus the ingredient lines (the same `["recipe-ingredients"]` query, so
 * a search that fetched them first shares the fetch). The scope is the search
 * language — every recipe on a first visit — kept in its own `?q=`, so a term
 * page can deep-link to `/make?q=tag:<slug>` without touching the search
 * box's state.
 *
 * **The question is the page** (41h): "What drinks can I make with lime?" —
 * the kind word and each featured ingredient are controls
 * (`MakeQuestion`), and both live in the query: a kind is its `tag:` terms
 * (`MAKE_KINDS`), a featured ingredient an `ingredient:` term
 * (`featuredOfQuery`). Featuring narrows every count, bucket and Buy next
 * to recipes that use it; several must all appear.
 *
 * **Count from** (41h, Roger 2026-10-18): this browser's list leads by
 * default, as U6 decided — a browser that never chose counts from its own
 * list. With a second list on the page — `saved`, the signed-in editor's
 * saved inventory (25d's committed list), or `secondary`, the house snapshot
 * an export shares when the operator opted in (`secondaryInventory()`,
 * nothing by default) — the shelf offers Saved and Both, and the choice is
 * per browser (`make-settings-v1`). This replaced U6's separate "Also
 * makeable with…" group (Dh1).
 *
 * `tags` is the vocabulary with its tree (28g), read on the server by both
 * routes. `savedStaples` (38a, signed-in editor only) keeps "Assume I always
 * have" in the editor's settings.
 */
export function MakePage({
  tags,
  secondary,
  saved,
  savedStaples,
}: {
  tags?: TagOption[];
  secondary?: SecondaryInventory;
  saved?: SavedInventoryProps;
  /** The signed-in editor's saved staples (38a); never on the export. */
  savedStaples?: SavedStaples;
}) {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q");
  const [lastQuery, rememberQuery] = useLastMakeQuery();
  const [typed, setTyped] = useState<string | null>(null);
  const query =
    typed ?? urlQuery ?? (lastQuery == null ? FIRST_VISIT_QUERY : lastQuery);

  const setQuery = useCallback(
    (next: string) => {
      setTyped(next);
      rememberQuery(next);
      const url = new URL(window.location.href);
      url.searchParams.set("q", next);
      window.history.replaceState(window.history.state, "", url);
    },
    [rememberQuery],
  );

  /* This browser's list (U6). A pre-U6 overlay becomes the whole list
   * once, before anything judges it — here from the saved list, the one
   * place the editor can read it; with no saved file yet it waits. */
  const inventory = useInventory(
    saved && !saved.missing ? { shared: saved.items } : undefined,
  );
  const { have, setHave } = inventory;
  /* After a save, the saved list the server answered with — until the next
   * load brings the same list back as `saved.items`. */
  const [savedItems, setSavedItems] = useState<string[] | undefined>();
  const savedList = savedItems ?? saved?.items;
  const second = useMemo<SecondList | undefined>(() => {
    if (saved) return { kind: "saved", items: savedList ?? [] };
    if (secondary?.items.length) {
      return { kind: "house", items: secondary.items };
    }
    return undefined;
  }, [saved, savedList, secondary]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryInputId = useId();
  const settings = useSavedStaples(useMakeSettings(), savedStaples);
  const { show: showToast, element: toastElement } = useUndoToast(inputRef);

  const { allRecipes, status, error, retry } = useSearch();
  const ingredientsQuery = useQuery({
    queryKey: ["recipe-ingredients"],
    queryFn: fetchIngredients,
    staleTime: Infinity,
  });
  const ingredientsBySlug = ingredientsQuery.data;

  const corpus = useMemo<MassagedRecipeEntry[]>(() => {
    if (!ingredientsBySlug) return allRecipes;
    return allRecipes.map((recipe) => {
      const ingredients = ingredientsBySlug[recipe.slug];
      return ingredients ? { ...recipe, ingredients } : recipe;
    });
  }, [allRecipes, ingredientsBySlug]);
  const recipesBySlug = useMemo(
    () => new Map(corpus.map((recipe) => [recipe.slug, recipe])),
    [corpus],
  );
  const prepared = useMemo(() => prepareCorpus(corpus), [corpus]);
  const tagOptionList = useMemo(
    () => tags ?? corpusTagOptions(corpus),
    [tags, corpus],
  );
  const tagResolver = useMemo(
    () => buildTagExpansion(tagOptionList),
    [tagOptionList],
  );
  /* 32j review: the scope box reruns the whole analysis; deferring it keeps
   * typing responsive while the results catch up. */
  const scopeQuery = useDeferredValue(query);
  /*
   * A query's recipes on `/make` (Dh7): the search language without the
   * featured ingredients, then each feature through the matcher
   * (`featureScope`) — so featuring gin means gin, never ginger beer.
   */
  const scopeOf = useCallback(
    (q: string) =>
      featureScope(
        scopeRecipes(corpus, withoutFeatures(q), tagResolver),
        prepared,
        featuredOfQuery(q),
      ),
    [corpus, tagResolver, prepared],
  );
  const scoped = useMemo(() => scopeOf(scopeQuery), [scopeOf, scopeQuery]);

  /* Count from (41h): the list every count, bucket and Buy next judges. */
  const source = second ? settings.source : "browser";
  const counted = useMemo(
    () => countFromItems(source, have, second?.items),
    [source, have, second],
  );
  const shelfItems = useMemo(
    () => (second ? dedupeItems([...have, ...second.items]) : have),
    [have, second],
  );

  const { staples } = settings;
  const analysis = useMemo(
    () => analyzeMakeable(scoped, prepared, counted, { staples }),
    [scoped, prepared, counted, staples],
  );
  /* "Most used here" (43m): what the scope asks for, less what's on hand. */
  const used = useMemo(
    () => mostUsed({ scoped, prepared, have: counted, staples }),
    [scoped, prepared, counted, staples],
  );
  const pulls = useMemo(
    () => pullCounts(shelfItems, analysis.canMake, prepared),
    [shelfItems, analysis, prepared],
  );
  const suggest = useCallback(
    (text: string) =>
      addCandidates({
        typed: text,
        scoped,
        prepared,
        analysis,
        have: counted,
        staples,
      }),
    [scoped, prepared, analysis, counted, staples],
  );

  const pending =
    status === "pending" || ingredientsQuery.isPending || !inventory.ready;
  const failed = status === "error" || ingredientsQuery.isError;

  /*
   * A card that just became makeable gets a brief accent ring (41h) — after
   * a change to the list or the settings, not a new scope, where everything
   * would be "new". Derived during render from the analysis before. Since
   * 42m2 a card that moved up a bucket (further away → two away, say, after
   * a tap on one of its missing tapes) lands the same way.
   */
  const [seen, setSeen] = useState<{
    analysis: MakeableAnalysis;
    query: string;
    fresh: Set<string>;
  } | null>(null);
  if (!pending && seen?.analysis !== analysis) {
    const before =
      seen && seen.query === scopeQuery
        ? bucketDistances(seen.analysis)
        : undefined;
    setSeen({
      analysis,
      query: scopeQuery,
      fresh: before
        ? new Set(
            [...bucketDistances(analysis)]
              .filter(([slug, distance]) => {
                const was = before.get(slug);
                return was !== undefined && distance < Math.min(was, 3);
              })
              .map(([slug]) => slug),
          )
        : NO_SLUGS,
    });
  }

  const featured = useMemo(() => featuredOfQuery(query), [query]);
  const scopeFeatured = useMemo(
    () => featuredOfQuery(scopeQuery),
    [scopeQuery],
  );
  const selectedTags = useMemo(
    () => new Set(positiveTagValues(parseQuery(query).filter)),
    [query],
  );
  const tagIndex = useMemo(() => buildTagIndex(tagOptionList), [tagOptionList]);
  const tagLabels = useMemo(
    () =>
      new Map(
        tagOptionList.map((option) => [fold(option.slug).trim(), option.label]),
      ),
    [tagOptionList],
  );
  const scopeUsage = useMemo(
    () => subtreeUsage(scoped, tagIndex),
    [scoped, tagIndex],
  );
  const corpusUsage = useMemo(
    () => subtreeUsage(corpus, tagIndex),
    [corpus, tagIndex],
  );
  /* 32j: the top row counts the scope without the tag picks, so it holds
   * still; the Refine row drills down within the scope itself. */
  const baseQuery = useMemo(() => withoutTagPicks(scopeQuery), [scopeQuery]);
  const baseUsage = useMemo(
    () =>
      baseQuery === scopeQuery
        ? scopeUsage
        : subtreeUsage(scopeOf(baseQuery), tagIndex),
    [baseQuery, scopeQuery, scopeUsage, scopeOf, tagIndex],
  );
  const refinements = useMemo(
    () =>
      refinementsInScope(
        tagIndex,
        scopeUsage,
        scoped.length,
        selectedTags,
        REFINE_LIMIT,
      ),
    [tagIndex, scopeUsage, scoped.length, selectedTags],
  );

  /* The kind: the question's word, with what each would hold if chosen. */
  const currentKind = useMemo(
    () => kindOfQuery(query) ?? MAKE_KINDS[0],
    [query],
  );
  const scopeKind = useMemo(
    () => kindOfQuery(scopeQuery) ?? MAKE_KINDS[0],
    [scopeQuery],
  );
  /* Switching kind drops a tag pick with nothing under the new kind. */
  const keepTag = useCallback(
    (tag: string, kind: MakeKind) =>
      scopeRecipes(corpus, toggleTagTerm(kind.query, tag), tagResolver).length >
      0,
    [corpus, tagResolver],
  );
  const switchKind = useCallback(
    (from: string, kind: MakeKind) => withKind(from, kind, MAKE_KINDS, keepTag),
    [keepTag],
  );
  const kindCounts = useMemo(
    () =>
      new Map(
        MAKE_KINDS.map((kind) => [
          kind.id,
          scopeOf(switchKind(scopeQuery, kind)).length,
        ]),
      ),
    [scopeOf, scopeQuery, switchKind],
  );

  /* --- the shelf's actions, each with its toast ------------------------- */
  /*
   * Undo reads the list and the settings as they are when it runs, not as
   * they were when the toast went up (41h review): what changed meanwhile
   * stays.
   */
  const haveRef = useRef(have);
  const settingsRef = useRef(settings);
  useEffect(() => {
    haveRef.current = have;
    settingsRef.current = settings;
  });
  const [landed, setLanded] = useState<string>();
  const addItems = useCallback(
    (typedItems: string[]) => {
      /* "beans" is the `any bean` matcher (42m2), and says so. */
      const items = canonicalItems(typedItems);
      if (items.length === 0) return;
      inventory.add(items);
      setLanded(inventoryKey(items[items.length - 1]));
      showToast(
        items.length === 1
          ? `Added ${items[0]}.`
          : `Added ${items.length} items.`,
      );
    },
    [inventory, showToast],
  );
  /*
   * A tap on a card's missing tape (42m2): the name joins this browser's
   * list — the one being counted, unless Count from is the saved list
   * alone, which the toast says — and Undo takes it off again. The tape
   * goes with the line it met, so focus moves to Undo (as after Clear).
   */
  const addMissing = useCallback(
    (name: string) => {
      /* A line that asks for plain "beans" adds the `any bean` matcher. */
      const item = canonicalItem(name);
      const key = inventoryKey(item);
      if (haveRef.current.some((kept) => inventoryKey(kept) === key)) {
        /* Only while this browser's list isn't counted (Saved mode). */
        showToast(`${item} is already on this browser's list.`);
        return;
      }
      inventory.add([item]);
      setLanded(key);
      const uncounted = settingsRef.current.source === "saved" && !!second;
      showToast(
        uncounted
          ? `Added ${item} to this browser's list (not counted while Count from is the ${second.kind === "saved" ? "saved" : "house"} list).`
          : `Added ${item}.`,
        () =>
          setHave(haveRef.current.filter((kept) => inventoryKey(kept) !== key)),
        { focusUndo: true },
      );
    },
    [inventory, second, setHave, showToast],
  );
  /*
   * The suggestions card's tab (43m): Most used while the counted list is
   * empty, Buy next otherwise — until the visitor picks one, or taps a
   * Most used row (building a stockpile stays on that tab). Clear forgets
   * the pick, so it lands on Most used — when the list it emptied is the
   * one counted; with Count from the saved list, what's counted hasn't
   * changed and Buy next stays (Dm6).
   */
  const [pickedTab, setPickedTab] = useState<SuggestionTab | null>(null);
  const tab: SuggestionTab =
    pickedTab ?? (counted.length === 0 ? "used" : "buy");
  /*
   * A tap in Most used (43m): as a card's missing tape adds (42m2), with
   * Undo — but focus stays in the list, on the row that took its place, so
   * a keyboard can add one after another (Ctrl+Z still undoes, Dh9).
   */
  const addUsed = useCallback(
    (name: string) => {
      const item = canonicalItem(name);
      const key = inventoryKey(item);
      setPickedTab("used");
      if (haveRef.current.some((kept) => inventoryKey(kept) === key)) {
        showToast(`${item} is already on this browser's list.`);
        return;
      }
      inventory.add([item]);
      setLanded(key);
      const uncounted = settingsRef.current.source === "saved" && !!second;
      showToast(
        uncounted
          ? `Added ${item} to this browser's list (not counted while Count from is the ${second.kind === "saved" ? "saved" : "house"} list).`
          : `Added ${item}.`,
        () =>
          setHave(haveRef.current.filter((kept) => inventoryKey(kept) !== key)),
      );
    },
    [inventory, second, setHave, showToast],
  );
  /* "Keep only these" (42m2): the matcher out, the chosen names in its place. */
  const refine = useCallback(
    (item: string, chosen: string[]) => {
      if (chosen.length === 0) return;
      const before = have;
      const at = before.findIndex(
        (kept) => inventoryKey(kept) === inventoryKey(item),
      );
      const beforeKeys = new Set(before.map(inventoryKey));
      const brought = new Set(
        chosen.map(inventoryKey).filter((key) => !beforeKeys.has(key)),
      );
      setHave(refineMatcher(before, item, chosen));
      setLanded(inventoryKey(chosen[chosen.length - 1]));
      /* Undo puts the matcher back where it was and takes out what the
       * refine brought, keeping anything added since. */
      showToast(
        `Kept ${chosen.length === 1 ? chosen[0] : `${chosen.length} kinds`} for ${item}.`,
        () => {
          const now = haveRef.current.filter(
            (kept) => !brought.has(inventoryKey(kept)),
          );
          if (now.some((kept) => inventoryKey(kept) === inventoryKey(item))) {
            setHave(now);
            return;
          }
          const index = at < 0 ? now.length : Math.min(at, now.length);
          setHave([...now.slice(0, index), item, ...now.slice(index)]);
        },
        { focusUndo: true },
      );
    },
    [have, setHave, showToast],
  );
  const membersOf = useCallback(
    (item: string) => {
      const matcher = matcherOf(item);
      return matcher ? matcherMembers(matcher, scoped, prepared) : [];
    },
    [scoped, prepared],
  );
  const removeItem = useCallback(
    (item: string) => {
      const at = have.findIndex(
        (kept) => inventoryKey(kept) === inventoryKey(item),
      );
      inventory.remove(item);
      /* Undo puts back that one item, where it was. */
      showToast(`Removed ${item}.`, () => {
        const now = haveRef.current;
        if (now.some((kept) => inventoryKey(kept) === inventoryKey(item))) {
          return;
        }
        const index = at < 0 ? now.length : Math.min(at, now.length);
        setHave([...now.slice(0, index), item, ...now.slice(index)]);
      });
    },
    [have, inventory, setHave, showToast],
  );
  const clearAll = useCallback(() => {
    const before = have;
    setHave([]);
    /* Clear lands on Most used (43m): start again from what's used most. */
    setPickedTab(null);
    /* Undo brings the list back, keeping anything added since. */
    showToast(
      `Cleared ${before.length} ${before.length === 1 ? "item" : "items"}.`,
      () => setHave(dedupeItems([...before, ...haveRef.current])),
      { focusUndo: true },
    );
  }, [have, setHave, showToast]);
  const copySecond = useCallback(() => {
    if (!second) return;
    const before = have;
    const beforeKeys = new Set(before.map(inventoryKey));
    const copied = new Set(
      second.items.map(inventoryKey).filter((key) => !beforeKeys.has(key)),
    );
    const sourceBefore = settings.source;
    setHave(second.items);
    settings.setSource("browser");
    /*
     * Undo restores the list as it was, keeping what was added since but
     * not what the copy brought; the source goes back only if it is still
     * the "This browser" the copy chose.
     */
    showToast(
      `Copied ${second.items.length} ${second.kind} ${second.items.length === 1 ? "item" : "items"} to this browser.`,
      () => {
        setHave(
          dedupeItems([
            ...before,
            ...haveRef.current.filter(
              (item) => !copied.has(inventoryKey(item)),
            ),
          ]),
        );
        if (settingsRef.current.source === "browser") {
          settingsRef.current.setSource(sourceBefore);
        }
      },
      /* The copy unmounts its own button (the second list folds away). */
      { focusUndo: true },
    );
  }, [second, have, settings, setHave, showToast]);
  const featureItem = useCallback(
    (item: string) => setQuery(toggleFeature(query, item)),
    [query, setQuery],
  );

  /* Save to editor (41h): signed-in only; the diff first, then one commit. */
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [saving, startSaving] = useTransition();
  const saveToEditor = useMemo<SaveToEditor | undefined>(() => {
    if (!saved) return undefined;
    return {
      saved: savedList ?? [],
      pending: saving,
      error: saveError,
      open: saveOpen,
      setOpen: (open: boolean) => {
        setSaveOpen(open);
        setSaveError(undefined);
      },
      save: (diff: InventoryDiff) =>
        startSaving(async () => {
          const result = await saved.save(diff);
          if ("error" in result) {
            setSaveError(result.error);
            return;
          }
          setSavedItems(result.items);
          setSaveOpen(false);
          showToast("Saved list updated.");
        }),
    };
  }, [saved, savedList, saving, saveError, saveOpen, showToast]);

  /*
   * The saved list item by item (42a, reversing 41-Dh2): a saved label's ×
   * and "Add to saved list", signed-in only. Each is one `{add, remove}`
   * diff through `saved.save` — one commit — and its Undo is another. The
   * writes run one after another, each against the list the last answered.
   */
  const [savedWrites, setSavedWrites] = useState(0);
  const [savedEditError, setSavedEditError] = useState<string>();
  const savedWriteChain = useRef<Promise<unknown>>(Promise.resolve());
  const savedListRef = useRef(savedList);
  useEffect(() => {
    savedListRef.current = savedList;
  });
  const writeSaved = useCallback(
    (diff: InventoryDiff): Promise<boolean> => {
      if (!saved) return Promise.resolve(false);
      const run = async () => {
        setSavedWrites((n) => n + 1);
        try {
          const result = await saved.save(diff);
          if ("error" in result) {
            setSavedEditError(result.error);
            return false;
          }
          setSavedEditError(undefined);
          setSavedItems(result.items);
          return true;
        } catch {
          setSavedEditError("The saved list couldn't be updated. Try again.");
          return false;
        } finally {
          setSavedWrites((n) => n - 1);
        }
      };
      const next = savedWriteChain.current.then(run);
      savedWriteChain.current = next;
      return next;
    },
    [saved],
  );
  const savedEdit = useMemo<SavedListEdit | undefined>(() => {
    if (!saved) return undefined;
    return {
      pending: savedWrites > 0,
      error: savedEditError,
      remove: (item: string) => {
        void writeSaved({ add: [], remove: [item] }).then((ok) => {
          if (!ok) return;
          showToast(`Removed ${item} from the saved list.`, () => {
            void writeSaved({ add: [item], remove: [] });
          });
        });
      },
      add: async (items: string[]) => {
        const fresh = savedAdditions(items, savedListRef.current ?? []);
        if (fresh.length === 0) {
          showToast(
            items.length === 1
              ? `${items[0]} is already on the saved list.`
              : "They're already on the saved list.",
          );
          return true;
        }
        const ok = await writeSaved({ add: fresh, remove: [] });
        if (ok) {
          showToast(
            fresh.length === 1
              ? `Added ${fresh[0]} to the saved list.`
              : `Added ${fresh.length} items to the saved list.`,
            () => {
              void writeSaved({ add: [], remove: fresh });
            },
          );
        }
        return ok;
      },
    };
  }, [saved, savedWrites, savedEditError, writeSaved, showToast]);

  const featureLines = useMemo(
    () => featuredLines(scoped, prepared, scopeFeatured),
    [scoped, prepared, scopeFeatured],
  );
  const cardContext = useMemo<CardContext>(
    () => ({
      view: settings.view,
      recipes: recipesBySlug,
      prepared,
      featuredLines: featureLines,
      fresh: seen?.fresh ?? NO_SLUGS,
      tagLabel: (tag: string) => {
        const key = fold(tag).trim();
        return KIND_TAGS.has(key) ? undefined : (tagLabels.get(key) ?? tag);
      },
      onAddMissing: addMissing,
    }),
    [
      settings.view,
      recipesBySlug,
      prepared,
      featureLines,
      seen,
      tagLabels,
      addMissing,
    ],
  );

  let body;
  if (failed) {
    body = (
      <EmptyState
        title="Recipes are unavailable"
        message={error?.message || "Something went wrong loading the recipes."}
        action={
          <Button
            type="button"
            onClick={() => {
              retry();
              void ingredientsQuery.refetch();
            }}
          >
            Try again
          </Button>
        }
      />
    );
  } else if (pending) {
    body = <SearchSkeleton />;
  } else if (scoped.length === 0) {
    body = (
      <EmptyState
        title="Nothing in scope"
        message={`No recipes match “${query}”.`}
        action={
          <Button
            type="button"
            variant="secondary"
            onClick={() => setQuery("")}
          >
            Clear
          </Button>
        }
      />
    );
  } else {
    /*
     * U6: an empty list is never a fallback to another list — Count from is
     * where a second list is chosen, on purpose. Since 43m it is no dead
     * end either: the card opens on Most used here, so the list starts from
     * what the recipes in scope ask for, one tap at a time.
     */
    const empty = counted.length === 0;
    const suggestions = (
      <MakeSuggestions
        tab={tab}
        onTab={setPickedTab}
        buyNext={analysis.buyNext}
        recipes={recipesBySlug}
        featured={scopeFeatured}
        kind={scopeKind}
        onHave={(item) => addItems([item])}
        onFeature={featureItem}
        mostUsed={used}
        total={scoped.length}
        empty={empty}
        onAddUsed={addUsed}
        intro={
          empty ? (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => inputRef.current?.focus()}
              >
                Type an item
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setDialogOpen(true)}
              >
                Import a list
              </Button>
            </div>
          ) : undefined
        }
      />
    );
    /* One tree either way, so the first tap's list keeps its focus. */
    body = (
      <>
        {suggestions}
        {!empty && (
          <div className="grid gap-4">
            <div className="flex justify-end">
              <CardViewSwitch
                value={settings.view}
                onChange={settings.setView}
              />
            </div>
            <MakeResults analysis={analysis} context={cardContext} />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <MakeQuestion
        kind={currentKind}
        kinds={MAKE_KINDS}
        counts={kindCounts}
        featured={featured}
        onKind={(kind) => setQuery(switchKind(query, kind))}
        onUnfeature={(name) => setQuery(withoutFeature(query, name))}
      />
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex max-w-[40rem] min-w-0 grow basis-[22rem] items-center gap-2">
          <label
            htmlFor={queryInputId}
            className="font-mono text-[0.72rem] tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase"
          >
            Search
          </label>
          <Input
            id={queryInputId}
            data-testid="make-query"
            className="bg-card font-mono"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="tag:quick ingredient:lime"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <MakeTicker
          total={scoped.length}
          canMake={analysis.canMake.length}
          oneAway={analysis.oneAway.length}
          twoAway={analysis.twoAway.length}
          kind={scopeKind}
          pending={pending}
        />
      </div>
      <div className="mt-2">
        <TagSearch
          index={tagIndex}
          corpusUsage={corpusUsage}
          onPick={(slug) => {
            if (!selectedTags.has(fold(slug))) {
              setQuery(toggleTagTerm(query, slug));
            }
          }}
        />
        <TagPicks
          index={tagIndex}
          usage={baseUsage}
          selected={selectedTags}
          onToggle={(slug) => setQuery(toggleTagTerm(query, slug))}
          refinements={refinements}
          scopeUsage={scopeUsage}
        />
      </div>
      <div className="mt-8 grid items-start gap-9 lg:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)]">
        <InventoryPanel
          inventory={inventory}
          settings={settings}
          second={second}
          union={shelfItems.length}
          featured={featured}
          pulls={pulls}
          landed={landed}
          suggest={suggest}
          onAdd={addItems}
          onRemove={removeItem}
          onClear={clearAll}
          onCopySecond={copySecond}
          onToggleFeature={featureItem}
          matcherMembers={membersOf}
          onRefine={refine}
          saveToEditor={saveToEditor}
          savedEdit={savedEdit}
          inputRef={inputRef}
          dialogOpen={dialogOpen}
          onDialogOpenChange={setDialogOpen}
        />
        <div className="grid min-w-0 gap-9" data-testid="make-results">
          {body}
        </div>
      </div>
      {toastElement}
    </>
  );
}

export default MakePage;
