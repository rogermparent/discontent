"use client";

import {
  useCallback,
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
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
  suggestNames,
} from "../../util/makeable";
import { EmptyState } from "../EmptyState";
import { PageHeading } from "../PageLayout";
import { fetchIngredients, useSearch } from "../SearchForm/SearchContext";
import {
  fold,
  parseQuery,
  positiveTagValues,
  toggleTagTerm,
} from "../SearchForm/queryLanguage";
import { SearchSkeleton } from "../SearchForm/SearchSkeleton";
import { inventoryKey } from "../../util/inventoryText";
import { InventoryPanel } from "./InventoryPanel";
import { SharedChanges, type InventoryDiff } from "./SharedChanges";
import { BuyNextList, MakeResults } from "./MakeResults";
import { MakeTicker } from "./MakeTicker";
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
import { KindSwitch } from "./KindSwitch";
import {
  kindOfQuery,
  MAKE_KINDS,
  withKind,
  withoutTagPicks,
  type MakeKind,
} from "./kinds";

/**
 * A first visit's scope: every recipe (28g). It was `tag:drink` while drinks
 * were the only thing with an inventory story; the tag picker makes any
 * scope one click away, so the page no longer guesses. The last scope used is
 * still remembered — the kind switch (32j) shows a remembered `tag:drink` as
 * the Drinks segment chosen — and `inventory make` has the same "" default.
 */
const FIRST_VISIT_QUERY = "";

/** Refine chips at most (32j). */
const REFINE_LIMIT = 12;

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

/**
 * `/make` — "What can I make with…" (25c).
 *
 * Everything happens in the browser, over the corpus `SearchProvider` already
 * holds plus the ingredient lines (the same `["recipe-ingredients"]` query, so
 * a search that fetched them first shares the fetch). The scope is the search
 * language — every recipe on a first visit — kept in its own `?q=`, so a term
 * page can deep-link to `/make?q=tag:<slug>` without touching the search
 * box's state.
 *
 * `tags` is the vocabulary with its tree (28g), read on the server by both
 * routes: the root chips, their children, and the tag search come from it.
 *
 * `shared` and `saveShared` are 25d's: the editor's committed list, which
 * this browser's changes overlay, and the action that commits those changes.
 * The export passes neither — and neither does the editor for a guest — so
 * the browser's list is all there is.
 */
export function MakePage({
  tags,
  shared,
  saveShared,
}: {
  tags?: TagOption[];
  shared?: string[];
  saveShared?: (diff: {
    add: string[];
    remove: string[];
  }) => Promise<{ items: string[] } | { error: string }>;
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

  /* After a save, the list the server answered with — until the next load
   * brings the same list back as `shared`. */
  const [savedShared, setSavedShared] = useState<string[] | undefined>();
  const effectiveShared = savedShared ?? shared;
  const sharedItems = useMemo(() => effectiveShared ?? [], [effectiveShared]);
  const inventory = useInventory(sharedItems);
  /* What this browser would change about the shared list, or nothing when
   * there is no shared list to change. */
  const pendingDiff = useMemo<InventoryDiff | undefined>(() => {
    if (!effectiveShared) return undefined;
    const keys = new Set(effectiveShared.map(inventoryKey));
    return {
      add: inventory.overlay.added.filter(
        (item) => !keys.has(inventoryKey(item)),
      ),
      remove: inventory.overlay.removed.filter((item) =>
        keys.has(inventoryKey(item)),
      ),
    };
  }, [effectiveShared, inventory.overlay]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryInputId = useId();
  const closeToggleId = useId();
  const settings = useMakeSettings();

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
  const suggestions = useMemo(() => suggestNames(prepared), [prepared]);
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
  const scoped = useMemo(
    () => scopeRecipes(corpus, scopeQuery, tagResolver),
    [corpus, scopeQuery, tagResolver],
  );
  const { countClose, staples } = settings;
  const analysis = useMemo(
    () =>
      analyzeMakeable(scoped, prepared, inventory.have, {
        countClose,
        staples,
      }),
    [scoped, prepared, inventory.have, countClose, staples],
  );

  const pending =
    status === "pending" || ingredientsQuery.isPending || !inventory.ready;
  const failed = status === "error" || ingredientsQuery.isError;

  const selectedTags = useMemo(
    () => new Set(positiveTagValues(parseQuery(query).filter)),
    [query],
  );
  const tagIndex = useMemo(() => buildTagIndex(tagOptionList), [tagOptionList]);
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
        : subtreeUsage(scopeRecipes(corpus, baseQuery, tagResolver), tagIndex),
    [baseQuery, scopeQuery, scopeUsage, corpus, tagResolver, tagIndex],
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

  /* The kind switch: shown when some kind splits the corpus, with what each
   * would hold if chosen now. */
  const currentKind = useMemo(() => kindOfQuery(query), [query]);
  const kindSplits = useMemo(
    () =>
      MAKE_KINDS.some((kind) => {
        if (!kind.query) return false;
        const count = scopeRecipes(corpus, kind.query, tagResolver).length;
        return count > 0 && count < corpus.length;
      }),
    [corpus, tagResolver],
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
          scopeRecipes(corpus, switchKind(scopeQuery, kind), tagResolver)
            .length,
        ]),
      ),
    [corpus, scopeQuery, tagResolver, switchKind],
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
  } else if (inventory.have.length === 0) {
    body = (
      <EmptyState
        title="Start with what you have"
        message="Add what's in your kitchen or bar — produce, pantry staples, bottles — and what you can make shows up here."
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
          onHave={(item) => inventory.add([item])}
        />
        <MakeResults analysis={analysis} recipes={recipesBySlug} />
      </>
    );
  }

  return (
    <>
      <PageHeading as="h1">What can I make?</PageHeading>
      <div className="flex flex-col gap-6 lg:flex-row">
        <InventoryPanel
          inventory={inventory}
          shared={effectiveShared}
          pending={
            pendingDiff && saveShared ? (
              <SharedChanges
                diff={pendingDiff}
                onDiscard={inventory.discard}
                onSave={async (diff) => {
                  const result = await saveShared(diff);
                  if ("error" in result) return result.error;
                  setSavedShared(result.items);
                  inventory.discard();
                  return undefined;
                }}
              />
            ) : undefined
          }
          suggestions={suggestions}
          inputRef={inputRef}
          dialogOpen={dialogOpen}
          onDialogOpenChange={setDialogOpen}
          settings={settings}
        />
        <div className="min-w-0 grow">
          <label htmlFor={queryInputId} className="text-sm font-semibold">
            From these recipes
          </label>
          <Input
            id={queryInputId}
            data-testid="make-query"
            className="mt-1 font-mono"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="tag:quick chicken"
            autoComplete="off"
            spellCheck={false}
          />
          {kindSplits && (
            <KindSwitch
              kinds={MAKE_KINDS}
              current={currentKind}
              counts={kindCounts}
              onChange={(kind) => setQuery(switchKind(query, kind))}
            />
          )}
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
          <MakeTicker
            total={scoped.length}
            canMake={analysis.canMake.length}
            oneAway={analysis.oneAway.length}
            twoAway={analysis.twoAway.length}
            query={query}
            pending={pending}
          />
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              id={closeToggleId}
              type="checkbox"
              data-testid="make-count-close"
              className="size-3.5 accent-primary"
              checked={countClose}
              onChange={(event) => settings.setCountClose(event.target.checked)}
            />
            <label htmlFor={closeToggleId}>
              Count close matches (≈) as had — onion for a shallot, olive oil
              for vegetable oil
            </label>
          </div>
          {body}
        </div>
      </div>
    </>
  );
}

export default MakePage;
