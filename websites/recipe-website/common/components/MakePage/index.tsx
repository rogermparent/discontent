"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
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
import { buildTagIndex, subtreeUsage } from "./tagTree";
import { useInventory, useLastMakeQuery } from "./useInventory";

/**
 * A first visit's scope: every recipe (28g). It was `tag:drink` while drinks
 * were the only thing with an inventory story; the tag picker makes any
 * scope one click away, so the page no longer guesses. The last scope used is
 * still remembered, and `inventory make` keeps its own drinks default.
 */
const FIRST_VISIT_QUERY = "";

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
  const scoped = useMemo(() => scopeRecipes(corpus, query), [corpus, query]);
  const analysis = useMemo(
    () => analyzeMakeable(scoped, prepared, inventory.have),
    [scoped, prepared, inventory.have],
  );

  const pending =
    status === "pending" || ingredientsQuery.isPending || !inventory.ready;
  const failed = status === "error" || ingredientsQuery.isError;

  const selectedTags = useMemo(
    () => new Set(positiveTagValues(parseQuery(query).filter)),
    [query],
  );
  const tagIndex = useMemo(
    () => buildTagIndex(tags ?? corpusTagOptions(corpus)),
    [tags, corpus],
  );
  const scopeUsage = useMemo(
    () => subtreeUsage(scoped, tagIndex),
    [scoped, tagIndex],
  );
  const corpusUsage = useMemo(
    () => subtreeUsage(corpus, tagIndex),
    [corpus, tagIndex],
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
        message="Add the bottles, mixers and fruit on hand, and what you can make shows up here."
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
            placeholder="tag:drink -tag:batch"
            autoComplete="off"
            spellCheck={false}
          />
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
            usage={scopeUsage}
            selected={selectedTags}
            onToggle={(slug) => setQuery(toggleTagTerm(query, slug))}
          />
          <MakeTicker
            total={scoped.length}
            canMake={analysis.canMake.length}
            oneAway={analysis.oneAway.length}
            twoAway={analysis.twoAway.length}
            query={query}
            pending={pending}
          />
          {body}
        </div>
      </div>
    </>
  );
}

export default MakePage;
