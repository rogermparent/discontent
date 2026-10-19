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
import { fetchIngredients, useSearch } from "../SearchForm/SearchContext";
import { countFromItems } from "./makeMath";
import { scopeRecipes } from "./scope";
import {
  useInventory,
  useMakeSettings,
  type CountFrom,
  type Inventory,
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
   * in. `empty`: the storage is in and the counted list is empty, so nothing
   * else was fetched or awaited.
   */
  status: "pending" | "error" | "ready" | "empty";
  /** The browser's storage — the list and the settings — has been read. */
  stored: boolean;
  /** This browser's list (U6): what this visitor entered, nothing shared. */
  inventory: Inventory;
  /** This browser's list, as `inventory.have`. */
  have: string[];
  /**
   * Which list counts (41h's Count from): this browser's unless the page
   * has a `second` list and this browser chose it, or both.
   */
  source: CountFrom;
  setSource: (source: CountFrom) => void;
  /** The list judged: `countFromItems(source, have, second)`. */
  counted: string[];
  /** `scope` judged against `counted` (plus the staples). */
  analysis?: MakeableAnalysis;
  /** Slug → corpus entry, for cards and names. */
  recipes: Map<string, MassagedRecipeEntry>;
  retry: () => void;
}

/**
 * What the recipes `scope` selects can be made from what's on hand — `/make`'s
 * judge (`analyzeMakeable`, the one the MCP's `inventory_makeable` runs) over
 * the corpus `SearchProvider` already holds plus the ingredient lines, for a
 * page that shows a summary rather than `/make` itself (`/drinks`' shelf).
 *
 * **Count from, as on `/make`** (41h; 42d): the list judged is this
 * browser's — `useInventory()`, the items this browser added, in both apps
 * — unless the page has a `second` list (the signed-in editor's saved list,
 * or the house snapshot an export shares: `secondaryInventory()`) and this
 * browser's `/make` settings chose it, or both (`countFromItems`, the same
 * per-browser `source`). A browser that never chose counts from its own
 * list (U6). The staples are `/make`'s settings too (`makeableOptions`).
 */
export function useMakeable(scope: string, second?: string[]): Makeable {
  const { allRecipes, allTerms, status, retry } = useSearch();
  const inventory = useInventory();
  const settings = useMakeSettings();
  const source: CountFrom = second ? settings.source : "browser";
  const counted = useMemo(
    () => countFromItems(source, inventory.have, second),
    [source, inventory.have, second],
  );
  /* The ingredient lines are the one extra fetch, and only once there is a
   * list to judge — as on the homepage's Make tile. */
  const stored = inventory.ready && settings.ready;
  const wanted = stored && counted.length > 0;
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
  const optionsKey = JSON.stringify(makeableOptions(settings));
  const options = useMemo(
    () => JSON.parse(optionsKey) as MakeableOptions,
    [optionsKey],
  );

  const ready = wanted && status === "success" && ingredientsQuery.isSuccess;
  const analysis = useMemo(
    () =>
      ready ? analyzeMakeable(scoped, prepared, counted, options) : undefined,
    [ready, scoped, prepared, counted, options],
  );

  return {
    status:
      stored && !wanted
        ? "empty"
        : status === "error" || ingredientsQuery.isError
          ? "error"
          : ready
            ? "ready"
            : "pending",
    stored,
    inventory,
    have: inventory.have,
    source,
    setSource: settings.setSource,
    counted,
    analysis,
    recipes,
    retry: () => {
      retry();
      void ingredientsQuery.refetch();
    },
  };
}
