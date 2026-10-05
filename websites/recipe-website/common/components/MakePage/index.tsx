"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import type { MassagedRecipeEntry } from "../../controller/data/read";
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
import { InventoryPanel } from "./InventoryPanel";
import { BuyNextList, MakeResults } from "./MakeResults";
import { MakeTicker } from "./MakeTicker";
import { DEFAULT_MAKE_QUERY, scopeRecipes, topTags } from "./scope";
import { useInventory, useLastMakeQuery } from "./useInventory";

/** Quick-pick tag chips after "Drinks". */
const QUICK_PICK_COUNT = 10;
const DRINK_TAG = "drink";

/**
 * `/make` — "What can I make with…" (25c).
 *
 * Everything happens in the browser, over the corpus `SearchProvider` already
 * holds plus the ingredient lines (the same `["recipe-ingredients"]` query, so
 * a search that fetched them first shares the fetch). The scope is the search
 * language — `tag:drink` by default — kept in its own `?q=`, so a term page
 * can deep-link to `/make?q=tag:<slug>` without touching the search box's
 * state.
 *
 * `shared` is 25d's: the editor's committed list, which this browser's
 * changes overlay. The export passes none, and the browser's list is all
 * there is.
 */
export function MakePage({ shared }: { shared?: string[] }) {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q");
  const [lastQuery, rememberQuery] = useLastMakeQuery();
  const [typed, setTyped] = useState<string | null>(null);
  const query =
    typed ?? urlQuery ?? (lastQuery == null ? DEFAULT_MAKE_QUERY : lastQuery);

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

  const sharedItems = useMemo(() => shared ?? [], [shared]);
  const inventory = useInventory(sharedItems);
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
  const chips = useMemo(() => {
    const picks = topTags(scoped, QUICK_PICK_COUNT, [DRINK_TAG]);
    for (const tag of selectedTags) {
      if (tag !== DRINK_TAG && !picks.some((pick) => fold(pick) === tag)) {
        picks.push(tag);
      }
    }
    return [DRINK_TAG, ...picks];
  }, [scoped, selectedTags]);

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
          <div
            className="my-2 flex flex-wrap gap-1.5"
            role="group"
            aria-label="Quick picks"
          >
            {chips.map((tag) => {
              const pressed = selectedTags.has(fold(tag));
              return (
                <Badge
                  key={tag}
                  asChild
                  variant={pressed ? "default" : "secondary"}
                >
                  <button
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => setQuery(toggleTagTerm(query, tag))}
                  >
                    {tag === DRINK_TAG ? "Drinks" : tag}
                  </button>
                </Badge>
              );
            })}
          </div>
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
