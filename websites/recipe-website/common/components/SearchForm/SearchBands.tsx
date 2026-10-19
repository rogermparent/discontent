"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowRight, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@discontent/component-library/lib/utils";
import { Button } from "@discontent/component-library/components/ui/button";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import {
  setQueryKind,
  toggleFacet,
  type FacetCounts,
  type FacetModel,
} from "../../util/facets";
import { countdownLabel } from "../../util/holidays";
import { useIsOwner } from "../AppLayout/OwnerContext";
import { useSearch } from "./SearchContext";
import { SearchCard } from "./SearchCard";
import {
  breadcrumbOf,
  browseRoots,
  type KindBand,
  type SeasonBand,
} from "./searchView";

/** Cards rendered before the reveal control, and per "Show more" press. */
export const REVEAL_STEP = 60;

/** The band grids' columns: four across beside the Narrow column. */
const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4";

/** What every card on the page shares. */
export interface CardContext {
  model: FacetModel;
  highlightQuery: string;
  words: readonly string[];
  onOpen: () => void;
}

/** A text button that reads as the canvas's accent link ("All 73 drinks →"). */
function LinkButton({
  onClick,
  children,
  className,
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Cards({
  recipes,
  card,
  testId,
}: {
  recipes: MassagedRecipeEntry[];
  card: CardContext;
  testId?: string;
}) {
  return (
    <ul data-testid={testId} className={GRID}>
      {recipes.map((recipe) => (
        <li key={recipe.slug}>
          <SearchCard
            recipe={recipe}
            model={card.model}
            highlightQuery={card.highlightQuery}
            words={card.words}
            onOpen={card.onOpen}
          />
        </li>
      ))}
    </ul>
  );
}

/** "Also: A · B · C · 64 more" — the band's next names, as links. */
function AlsoLine({
  also,
  more,
  onOpen,
}: {
  also: MassagedRecipeEntry[];
  more: number;
  onOpen: () => void;
}) {
  if (also.length === 0) return null;
  return (
    <p className="text-sm leading-[22px] text-muted-foreground">
      Also:{" "}
      {also.map((recipe, index) => (
        <span key={recipe.slug}>
          {index > 0 && " · "}
          <Link
            href={`/recipe/${recipe.slug}`}
            onClick={onOpen}
            className="text-foreground underline decoration-border underline-offset-[3px] hover:decoration-primary"
          >
            {recipe.name}
          </Link>
        </span>
      ))}
      {more > 0 && (
        <>
          {" · "}
          <span className="font-mono tabular-nums">{more} more</span>
        </>
      )}
    </p>
  );
}

function BandHead({
  id,
  title,
  count,
  action,
}: {
  id: string;
  title: string;
  count: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-border pb-2">
      <h2
        id={id}
        className="font-display text-xl font-semibold tracking-tight sm:text-2xl"
      >
        {title}
      </h2>
      <span className="font-mono text-sm tabular-nums text-muted-foreground">
        {count}
      </span>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

/**
 * Drinks and Food (canvas B, "lime"): four cards each, the next names on an
 * "Also:" line, and "All N drinks" / "All N dishes", which writes the Kind
 * into the query (D3) — the page then shows that kind's whole grid.
 */
export function KindBands({
  bands,
  card,
}: {
  bands: KindBand<MassagedRecipeEntry>[];
  card: CardContext;
}) {
  const { query, submitSearch } = useSearch();
  return (
    <div className="flex flex-col gap-9">
      {bands.map((band) => {
        const id = `search-band-${band.kind}`;
        const total = band.recipes.length;
        return (
          <section
            key={band.kind}
            aria-labelledby={id}
            className="flex flex-col gap-3.5"
          >
            <BandHead
              id={id}
              title={band.kind === "drinks" ? "Drinks" : "Food"}
              count={total}
              action={
                <LinkButton
                  onClick={() =>
                    submitSearch(setQueryKind(card.model, query, band.kind))
                  }
                >
                  All {total} {band.kind === "drinks" ? "drinks" : "dishes"}
                  <ArrowRight aria-hidden className="size-4" />
                </LinkButton>
              }
            />
            <Cards recipes={band.cards} card={card} testId={id} />
            <AlsoLine also={band.also} more={band.more} onOpen={card.onOpen} />
          </section>
        );
      })}
    </div>
  );
}

/** "4 · in 13 days" for a holiday, the count alone for a collection. */
function seasonCount(band: SeasonBand<MassagedRecipeEntry>): string {
  const n = band.recipes.length;
  return band.days === undefined
    ? `${n}`
    : `${n} · ${countdownLabel(band.days)}`;
}

/**
 * A `tag:` query's results by date (canvas B, `tag:cookies`): each holiday
 * among them soonest first, each Collection, then "Any time" — the rest, as
 * the page's grid. "All N" adds the band's term to the query.
 */
export function SeasonBands({
  bands,
  rest,
  card,
  revealKey,
}: {
  bands: SeasonBand<MassagedRecipeEntry>[];
  rest: MassagedRecipeEntry[];
  card: CardContext;
  revealKey: string;
}) {
  const { query, submitSearch } = useSearch();
  return (
    <div className="flex flex-col gap-9">
      {bands.map((band) => {
        const id = `search-band-${band.slug}`;
        const total = band.recipes.length;
        return (
          <section
            key={band.slug}
            aria-labelledby={id}
            className="flex flex-col gap-3.5"
            data-testid="season-band"
          >
            <BandHead
              id={id}
              title={band.label}
              count={seasonCount(band)}
              action={
                total > 4 ? (
                  <LinkButton
                    onClick={() =>
                      submitSearch(toggleFacet(card.model, query, band.slug))
                    }
                  >
                    All {total}
                    <ArrowRight aria-hidden className="size-4" />
                  </LinkButton>
                ) : undefined
              }
            />
            <Cards recipes={band.recipes.slice(0, 4)} card={card} />
            <AlsoLine
              also={band.recipes.slice(4, 9)}
              more={Math.max(0, total - 9)}
              onOpen={card.onOpen}
            />
          </section>
        );
      })}
      {rest.length > 0 && (
        <section
          aria-labelledby="search-band-any-time"
          className="flex flex-col gap-3.5"
        >
          <BandHead
            id="search-band-any-time"
            title="Any time"
            count={rest.length}
          />
          <ResultGrid
            key={revealKey}
            recipes={rest}
            card={card}
            heading={false}
          />
        </section>
      )}
    </div>
  );
}

/**
 * Every result in one grid (one kind, a chosen Kind, "Any time"), revealed
 * sixty at a time: the whole corpus is in memory already and images load
 * lazily, so the cap is on DOM nodes and scroll length, not data. Remounted
 * (`key`) when the query or sort changes, which resets it.
 */
export function ResultGrid({
  recipes,
  card,
  heading = true,
}: {
  recipes: MassagedRecipeEntry[];
  card: CardContext;
  /** The sr-only "Recipes" heading, for the outline (41f). */
  heading?: boolean;
}) {
  const [visible, setVisible] = useState(REVEAL_STEP);
  const remaining = recipes.length - visible;
  return (
    <>
      {heading && <h2 className="sr-only">Recipes</h2>}
      <Cards
        recipes={recipes.slice(0, visible)}
        card={card}
        testId="recipe-list"
      />
      {remaining > 0 && (
        <div className="my-6 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setVisible((count) => count + Math.min(REVEAL_STEP, remaining))
            }
          >
            Show {Math.min(REVEAL_STEP, remaining)} more
          </Button>
        </div>
      )}
    </>
  );
}

async function fetchTermDescriptions(): Promise<Record<string, string>> {
  const res = await fetch("/search/term-descriptions");
  return res.json();
}

/**
 * A `tag:` query opens on its term (canvas B): where it sits, what it is,
 * how many recipes it holds, its narrower terms counted inside these results
 * (each adds itself to the query, so the card then describes it), and its
 * page. The description arrives with its own small document, fetched the
 * first time a card shows.
 */
export function TermCard({
  model,
  slug,
  counts,
  corpus,
}: {
  model: FacetModel;
  slug: string;
  /** `countFacets` over the results: the narrower chips' counts. */
  counts: FacetCounts;
  /** The same over the whole corpus: the term's own count. */
  corpus: FacetCounts;
}) {
  const { query, submitSearch } = useSearch();
  const descriptions = useQuery({
    queryKey: ["term-descriptions"],
    queryFn: fetchTermDescriptions,
    staleTime: Infinity,
  });
  const term = model.terms.get(slug);
  if (!term) return null;
  const trail = breadcrumbOf(model, slug);
  const total = corpus.subtree.get(slug) ?? 0;
  const narrower = model
    .children(slug)
    .map((child) => ({
      slug: child,
      label: model.terms.get(child)?.label ?? child,
      count: counts.subtree.get(child) ?? 0,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const description = descriptions.data?.[slug];
  return (
    <section
      aria-labelledby="search-term-name"
      data-testid="search-term-card"
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-card-foreground"
    >
      {trail.length > 0 && (
        <p className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {trail.join(" › ")}
        </p>
      )}
      <h2
        id="search-term-name"
        className="font-display text-[1.75rem] font-semibold leading-8 tracking-tight"
      >
        {term.label}
      </h2>
      {description && (
        <p className="text-[0.9375rem] leading-[22px]">{description}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {total} {total === 1 ? "recipe" : "recipes"}
        </span>
        {narrower.length > 0 && (
          <>
            <span className="text-[0.8125rem] text-muted-foreground">
              Narrower
            </span>
            {narrower.map((row) => (
              <button
                key={row.slug}
                type="button"
                onClick={() =>
                  submitSearch(toggleFacet(model, query, row.slug))
                }
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[0.8125rem] font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {row.label}{" "}
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {row.count}
                </span>
              </button>
            ))}
          </>
        )}
        <Link
          href={`/tags/${slug}`}
          className="inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline sm:ml-auto"
        >
          Open the {term.label} page
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  );
}

/**
 * A search that found nothing (canvas B, "quince"): what was searched, where
 * it looked, and three ways on — Import a recipe (the signed-in owner only;
 * the reader export never has it), Clear, and the facet roots to browse.
 */
export function NoResults({
  model,
  text,
  query,
  corpusSize,
}: {
  model: FacetModel;
  /** The free text, when that is what found nothing. */
  text: string;
  query: string;
  corpusSize: number;
}) {
  const { submitSearch } = useSearch();
  const owner = useIsOwner();
  const roots = browseRoots(model);
  const wordsOnly = !!text && text.trim() === query.trim();
  return (
    <div data-testid="search-no-results" className="flex flex-col gap-2.5 py-2">
      <h2 className="font-display text-xl font-semibold">
        {wordsOnly ? `Nothing mentions ${text}` : `Nothing matches ${query}`}
      </h2>
      <p className="text-sm text-muted-foreground">
        {wordsOnly
          ? `Not a name, tag, ingredient or description in ${corpusSize} ${corpusSize === 1 ? "recipe" : "recipes"}.`
          : `No recipe of ${corpusSize} matches all of it — take a term away to widen it.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {owner && (
          <Button asChild>
            <Link href="/new-recipe">
              <Download aria-hidden />
              Import a recipe
            </Link>
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => submitSearch("")}
        >
          Clear search
        </Button>
      </div>
      {roots.length > 0 && (
        <>
          <p className="mt-1.5 font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Or browse by
          </p>
          <div className="grid max-w-xl grid-cols-1 gap-1.5 sm:grid-cols-2">
            {roots.map((root) => (
              <Link
                key={root.slug}
                href={`/tags/${root.slug}`}
                className="flex min-h-10 items-baseline justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:border-primary"
              >
                {root.label}{" "}
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {root.terms} {root.terms === 1 ? "term" : "terms"}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
