"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import { buildTagExpansion } from "../../controller/tagExpansion";
import {
  analyzeMakeable,
  prepareCorpus,
  type MakeableAnalysis,
  type MakeableOptions,
} from "../../util/makeable";
import { dedupeItems } from "../../util/inventoryText";
import { fetchIngredients, useSearch } from "../SearchForm/SearchContext";
import { scopeRecipes } from "./scope";
import {
  useInventory,
  useMakeSettings,
  type MakeSettings,
} from "./useInventory";

/**
 * The judge's options from this browser's `/make` settings — the one place a
 * page outside `/make` turns them into `analyzeMakeable`'s options, so a new
 * setting (U5's staples switch) reaches every such page by changing this.
 */
export function makeableOptions(settings: MakeSettings): MakeableOptions {
  return { countClose: settings.countClose, staples: settings.staples };
}

export interface Makeable {
  /**
   * `ready`: the corpus, the ingredient lines and the browser's storage are
   * in. `empty`: the storage is in and there is nothing to judge — no list
   * here and no secondary items — so nothing else was fetched or awaited.
   */
  status: "pending" | "error" | "ready" | "empty";
  /** This browser's list (U6): what this visitor entered, nothing shared. */
  have: string[];
  /** `scope` judged against `have` (plus the staples). */
  analysis?: MakeableAnalysis;
  /**
   * `scope` judged against `have` ∪ `secondary`, when `secondary` was given —
   * the secondary group (U6, `controller/secondaryInventory.ts`). Never part
   * of `analysis`.
   */
  withSecondary?: MakeableAnalysis;
  /** Slug → corpus entry, for cards and names. */
  recipes: Map<string, MassagedRecipeEntry>;
  retry: () => void;
}

/**
 * What the recipes `scope` selects can be made from what's on hand — `/make`'s
 * judge (`analyzeMakeable`, the one the MCP's `inventory_makeable` runs) over
 * the corpus `SearchProvider` already holds plus the ingredient lines, for a
 * page that shows a summary rather than `/make` itself (U3's `/drinks`).
 *
 * **The browser's list first** (U6): the list is `useInventory()` — the
 * items this browser added, in both apps, with a pre-U6 overlay migrated by
 * the shared hook — and never the editor's saved list. The staples are
 * `/make`'s settings (`makeableOptions`), as on the homepage's Make tile. A page with a secondary list (`secondaryInventory()`: the operator's
 * saved inventory in the editor) passes its items as `secondary`, and gets a
 * second analysis to show apart from the first.
 */
export function useMakeable(scope: string, secondary?: string[]): Makeable {
  const { allRecipes, allTerms, status, retry } = useSearch();
  const inventory = useInventory();
  /* The ingredient lines are the one extra fetch, and only once there is a
   * list to judge — as on the homepage's Make tile. */
  const wanted =
    inventory.ready &&
    (inventory.have.length > 0 || (secondary?.length ?? 0) > 0);
  const ingredientsQuery = useQuery({
    queryKey: ["recipe-ingredients"],
    queryFn: fetchIngredients,
    staleTime: Infinity,
    enabled: wanted,
  });
  const ingredientsBySlug = ingredientsQuery.data;
  const corpus = useMemo<MassagedRecipeEntry[]>(() => {
    if (!ingredientsBySlug) return allRecipes;
    return allRecipes.map((recipe) => {
      const ingredients = ingredientsBySlug[recipe.slug];
      return ingredients ? { ...recipe, ingredients } : recipe;
    });
  }, [allRecipes, ingredientsBySlug]);
  const recipes = useMemo(
    () => new Map(corpus.map((recipe) => [recipe.slug, recipe])),
    [corpus],
  );
  const prepared = useMemo(() => prepareCorpus(corpus), [corpus]);
  const resolver = useMemo(() => buildTagExpansion(allTerms), [allTerms]);
  const scoped = useMemo(
    () => scopeRecipes(corpus, scope, resolver),
    [corpus, scope, resolver],
  );

  /* Keyed by value: `useMakeSettings` answers a fresh object every render,
   * and a fresh options object would rerun the whole judge each time. */
  const optionsKey = JSON.stringify(makeableOptions(useMakeSettings()));
  const options = useMemo(
    () => JSON.parse(optionsKey) as MakeableOptions,
    [optionsKey],
  );

  const ready = wanted && status === "success" && ingredientsQuery.isSuccess;
  const analysis = useMemo(
    () =>
      ready
        ? analyzeMakeable(scoped, prepared, inventory.have, options)
        : undefined,
    [ready, scoped, prepared, inventory.have, options],
  );
  const withSecondary = useMemo(
    () =>
      ready && secondary
        ? analyzeMakeable(
            scoped,
            prepared,
            dedupeItems([...inventory.have, ...secondary]),
            options,
          )
        : undefined,
    [ready, secondary, scoped, prepared, inventory.have, options],
  );

  return {
    status:
      inventory.ready && !wanted
        ? "empty"
        : status === "error" || ingredientsQuery.isError
          ? "error"
          : ready
            ? "ready"
            : "pending",
    have: inventory.have,
    analysis,
    withSecondary,
    recipes,
    retry: () => {
      retry();
      void ingredientsQuery.refetch();
    },
  };
}
