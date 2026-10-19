"use client";

import { useDeferredValue, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import { analyzeMakeable, prepareCorpus } from "../../util/makeable";
import { fetchIngredients, useSearch } from "../SearchForm/SearchContext";
import { useInventory, useMakeSettings } from "../MakePage/useInventory";
import { countLabel } from "../../controller/homepageIntents";
import { ArrowRightIcon } from "lucide-react";

/**
 * The Make tile: "What can I make?", linking to `/make`, with how many
 * recipes are ready right now (usability pass, 2026-10-15). Since 42f it
 * stands beside the search field as the band's accent block (canvas B), no
 * longer the first of a row of equal tiles.
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
 * HTML never claims a count it cannot know. With no list it asks for one. A
 * failed ingredients fetch, or a corpus with no recipes, leaves the line
 * blank too rather than stuck on "Checking…" forever.
 */
export function MakeTile() {
  const inventory = useInventory();
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

  /*
   * A failed ingredients fetch, or a corpus with no recipes at all, never
   * resolves `corpus` — `wanted` stays true forever with nothing to judge,
   * which used to leave `ready === undefined` and the tile stuck on
   * "Checking…" permanently. Settled-but-unjudgeable shows the plain tile
   * text instead, with no count.
   */
  const cannotJudge =
    wanted && (ingredientsQuery.isError || allRecipes.length === 0);

  let status = " ";
  if (inventory.ready) {
    if (have.length === 0) status = "Tell it what you have";
    else if (cannotJudge) status = " ";
    else if (ready === undefined) status = "Checking…";
    else status = `${ready} ready now`;
  }

  return (
    <Link
      href="/make"
      className="flex min-h-36 flex-col gap-2 rounded-xl bg-primary p-5 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      data-testid="make-tile"
    >
      <span className="font-display text-xl font-bold leading-tight">
        What can I make?
      </span>
      <span className="text-sm leading-snug">
        {inventory.ready && have.length > 0
          ? `Checks every recipe against the ${countLabel(have.length, "thing")} on hand`
          : "Checks every recipe against what you have on hand"}
      </span>
      <span className="mt-auto flex flex-row items-center justify-between gap-2">
        <span
          className="font-mono text-xs tabular-nums"
          data-testid="make-tile-status"
        >
          {status}
        </span>
        <ArrowRightIcon aria-hidden className="size-5 shrink-0" />
      </span>
    </Link>
  );
}

export default MakeTile;
