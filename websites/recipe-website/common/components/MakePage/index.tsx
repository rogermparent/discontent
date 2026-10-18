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
import type { SecondaryInventory } from "../../controller/secondaryInventory";
import {
  InventoryPanel,
  type SaveToEditor,
  type SecondList,
} from "./InventoryPanel";
import type { InventoryDiff, SavedInventoryProps } from "./SavedInventory";
import {
  BuyNextList,
  CardViewSwitch,
  MakeResults,
  type CardContext,
} from "./MakeResults";
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
} from "./makeMath";
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
        settings.countClose,
      ),
    [corpus, tagResolver, prepared, settings.countClose],
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

  const { countClose, staples } = settings;
  const analysis = useMemo(
    () =>
      analyzeMakeable(scoped, prepared, counted, {
        countClose,
        staples,
      }),
    [scoped, prepared, counted, countClose, staples],
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
   * would be "new". Derived during render from the analysis before.
   */
  const [seen, setSeen] = useState<{
    analysis: MakeableAnalysis;
    query: string;
    fresh: Set<string>;
  } | null>(null);
  if (!pending && seen?.analysis !== analysis) {
    const before =
      seen && seen.query === scopeQuery
        ? new Set(seen.analysis.canMake.map((match) => match.recipe.slug))
        : undefined;
    setSeen({
      analysis,
      query: scopeQuery,
      fresh: before
        ? new Set(
            analysis.canMake
              .map((match) => match.recipe.slug)
              .filter((slug) => !before.has(slug)),
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
    (items: string[]) => {
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

  const featureLines = useMemo(
    () => featuredLines(scoped, prepared, scopeFeatured, countClose),
    [scoped, prepared, scopeFeatured, countClose],
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
    }),
    [settings.view, recipesBySlug, prepared, featureLines, seen, tagLabels],
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
  } else if (counted.length === 0) {
    /* U6: never a fallback to another list — an invitation; Count from
     * is where a second list is chosen, on purpose. */
    body = (
      <EmptyState
        title="Tell it what you have"
        message="Add what's in your kitchen or bar — produce, bottles, what's in the fridge — and what you can make shows up here."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => inputRef.current?.focus()}>
              Add an item
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDialogOpen(true)}
            >
              Import a list
            </Button>
          </div>
        }
      />
    );
  } else {
    body = (
      <>
        <BuyNextList
          buyNext={analysis.buyNext}
          recipes={recipesBySlug}
          featured={scopeFeatured}
          kind={scopeKind}
          onHave={(item) => addItems([item])}
          onFeature={featureItem}
        />
        <div className="grid gap-4">
          <div className="flex justify-end">
            <CardViewSwitch value={settings.view} onChange={settings.setView} />
          </div>
          <MakeResults analysis={analysis} context={cardContext} />
        </div>
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
          saveToEditor={saveToEditor}
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
