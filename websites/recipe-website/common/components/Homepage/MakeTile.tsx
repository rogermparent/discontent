"use client";

import { useDeferredValue, useMemo, type ReactNode } from "react";
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
 * plus their Make settings (the staples; close matches always count), over the corpus
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
  const { staples } = useMakeSettings();
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
  const analysis = useMemo(() => {
    if (!deferredCorpus) return undefined;
    return analyzeMakeable(
      deferredCorpus,
      prepareCorpus(deferredCorpus),
      have,
      { staples },
    );
  }, [deferredCorpus, have, staples]);
  const ready = analysis?.canMake.length;

  /*
   * A failed ingredients fetch, or a corpus with no recipes at all, never
   * resolves `corpus` — `wanted` stays true forever with nothing to judge,
   * which used to leave `ready === undefined` and the tile stuck on
   * "Checking…" permanently. Settled-but-unjudgeable shows the plain tile
   * text instead, with no count.
   */
  const cannotJudge =
    wanted && (ingredientsQuery.isError || allRecipes.length === 0);

  let status: ReactNode = " ";
  if (inventory.ready) {
    if (have.length === 0) status = "Tell it what you have";
    else if (cannotJudge) status = " ";
    else if (ready === undefined) status = "Checking…";
    else
      status = (
        <>
          <b className="font-mono text-5xl leading-none font-bold tracking-[-0.03em] tabular-nums lg:text-[3.5rem]">
            {ready}
          </b>{" "}
          <span className="font-display text-lg font-semibold">ready now</span>
        </>
      );
  }
  const judged = analysis && !cannotJudge && have.length > 0;
  const names = judged
    ? analysis.canMake.slice(0, 3).map((match) => shortName(match.recipe.name))
    : [];
  const buyNext = judged ? analysis.buyNext[0] : undefined;

  return (
    <Link
      href="/make"
      className="flex min-h-36 min-w-0 flex-col gap-2.5 rounded-xl bg-primary p-5 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:p-[1.375rem]"
      data-testid="make-tile"
    >
      <span className="font-mono text-xs leading-4 font-medium tracking-[0.08em] uppercase">
        From what you have
      </span>
      <span
        className="flex min-h-14 flex-row items-baseline gap-2.5 text-sm"
        data-testid="make-tile-status"
      >
        {status}
      </span>
      {judged && (
        <span className="font-mono text-[0.8125rem] tabular-nums">
          {analysis.oneAway.length} one away · {analysis.twoAway.length} two
          away
        </span>
      )}
      {names.length > 0 && (
        <span className="text-sm leading-snug">
          {names.join(" · ")}
          {ready !== undefined && ready > names.length
            ? ` · and ${ready - names.length} more`
            : ""}
        </span>
      )}
      {buyNext && buyNext.unlocks > 0 && (
        <span className="text-sm leading-snug">
          Buy next: <b>{buyNext.item}</b> makes {buyNext.unlocks} more.
        </span>
      )}
      <span className="text-sm leading-snug">
        {inventory.ready && have.length > 0
          ? `Checks every recipe against the ${countLabel(have.length, "thing")} on hand`
          : "Checks every recipe against what you have on hand"}
      </span>
      <span className="mt-auto flex flex-row items-center justify-between gap-2 text-sm font-semibold">
        Open What can I make?
        <ArrowRightIcon aria-hidden className="size-5 shrink-0" />
      </span>
    </Link>
  );
}

/** "Lemon Drop (A Couple Cooks)" → "Lemon Drop", as `/make` names them. */
function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "");
}

export default MakeTile;
