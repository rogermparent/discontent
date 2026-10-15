"use client";

import { useDeferredValue, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import { analyzeMakeable, prepareCorpus } from "../../util/makeable";
import { fetchIngredients, useSearch } from "../SearchForm/SearchContext";
import { useInventory, useMakeSettings } from "../MakePage/useInventory";
import { countLabel } from "../../controller/homepageIntents";
import { intentTileClassName } from "./tileStyles";

/* No shared list, ever (U6): the browser's own list is laid over nothing. */
const NO_SHARED: string[] = [];

/**
 * The primary intent tile: "What can I make?", linking to `/make`, with how
 * many recipes are ready right now (usability pass, 2026-10-15).
 *
 * The count is the `/make` page's judgement over **this browser's list
 * only**, in both apps (U6, Roger 2026-10-15): what this visitor entered here,
 * plus their Make settings (staples, close matches), over the corpus
 * `SearchProvider` already fetched for every page. It never reads the
 * editor's shared inventory, not even for a signed-in owner — that list is
 * the agents' and `/make`'s secondary group, and the export never sees it.
 * The ingredient lines are the one extra fetch, and only once there is a
 * list to judge.
 *
 * Until the browser's storage has been read the line is blank, so the server
 * HTML never claims a count it cannot know. With no list it asks for one.
 */
export function MakeTile() {
  const inventory = useInventory(NO_SHARED);
  const { countClose, staples } = useMakeSettings();
  const have = inventory.have;
  const wanted = inventory.ready && have.length > 0;

  const { allRecipes } = useSearch();
  const ingredientsQuery = useQuery({
    queryKey: ["recipe-ingredients"],
    queryFn: fetchIngredients,
    staleTime: Infinity,
    enabled: wanted,
  });
  const ingredientsBySlug = ingredientsQuery.data;

  const corpus = useMemo<MassagedRecipeEntry[] | undefined>(() => {
    if (!wanted || !ingredientsBySlug || allRecipes.length === 0) {
      return undefined;
    }
    return allRecipes.map((recipe) => {
      const ingredients = ingredientsBySlug[recipe.slug];
      return ingredients ? { ...recipe, ingredients } : recipe;
    });
  }, [wanted, ingredientsBySlug, allRecipes]);
  /* The judgement is the page's heaviest work; keep it off the first paint. */
  const deferredCorpus = useDeferredValue(corpus);
  const ready = useMemo(() => {
    if (!deferredCorpus) return undefined;
    return analyzeMakeable(
      deferredCorpus,
      prepareCorpus(deferredCorpus),
      have,
      {
        countClose,
        staples,
      },
    ).canMake.length;
  }, [deferredCorpus, have, countClose, staples]);

  let status = " ";
  if (inventory.ready) {
    if (have.length === 0) status = "Tell it what you have";
    else if (ready === undefined) status = "Checking…";
    else status = `${ready} ready now`;
  }

  return (
    <Link href="/make" className={intentTileClassName(true)}>
      <span className="font-display text-xl font-bold leading-tight">
        What can I make?
      </span>
      <span className="text-sm leading-snug">
        {inventory.ready && have.length > 0
          ? `Checks every recipe against the ${countLabel(have.length, "thing")} on hand`
          : "Checks every recipe against what you have on hand"}
      </span>
      <span
        className="mt-auto font-mono text-xs tabular-nums"
        data-testid="make-tile-status"
      >
        {status}
      </span>
    </Link>
  );
}

export default MakeTile;
