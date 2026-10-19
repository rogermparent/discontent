"use client";

import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";
import { cn } from "@discontent/component-library/lib/utils";
import type { RecipeListEntry } from "../../controller/paginationConfigs";
import {
  carriesTerm,
  narrowChips,
  otherTags,
  pageTagSlugs,
} from "../../controller/tagBoardPage";
import {
  buildFacetModel,
  facetQuery,
  type FacetTerm,
} from "../../util/facets";
import { ClientListItem } from "../ClientList";
import { RecipeCardPlaceholder, RecipeGrid } from "../List/shared";
import { PureRecipeImage } from "../RecipeImage/PureRecipeImage";
import { Segmented, plural } from "./parts";

/** Cards the filtered list shows before "See all N in search". */
const SHOWN = 48;
/**
 * A term page's recipes with "Narrow X" over them (43t, canvas B): chips
 * from the other facets — and the term's own narrower terms — counted
 * within this term's recipes, which filter the list in place. Several
 * chips AND together (each count is within what is already chosen, so
 * every press narrows); "All" clears them.
 *
 * `rows` are the subtree's every recipe (Dt3: small enough on every page
 * that narrows), so the counts and the filter are the browser's. With no
 * chip pressed the list is the server's cards (`grid`), exactly what the
 * page served before; a pressed chip or the List view draws them here.
 */
export function TermRecipes({
  slug,
  label,
  terms,
  rows,
  recipeCount,
  grid,
  shownCount,
  searchHref,
}: {
  slug: string;
  label: string;
  /** The vocabulary (no pictures); absent leaves the chips out. */
  terms?: FacetTerm[];
  /** Every recipe of the subtree, pinned first; absent leaves the chips out. */
  rows?: RecipeListEntry[];
  recipeCount: number;
  /** The server-rendered grid of the first cards. */
  grid: ReactNode;
  /** How many cards `grid` holds. */
  shownCount: number;
  /** `/search?q=tag:<term>` — the whole list. */
  searchHref: string;
}) {
  const headingId = useId();
  const listId = useId();
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<"grid" | "list">("grid");
  const model = useMemo(
    () => (terms ? buildFacetModel(terms) : undefined),
    [terms],
  );
  const pageTags = useMemo(
    () => (model ? pageTagSlugs(model, slug) : new Set<string>()),
    [model, slug],
  );
  const filtered = useMemo(
    () =>
      rows && model
        ? rows.filter((row) =>
            selected.every((pick) => carriesTerm(model, row.tags, pick)),
          )
        : (rows ?? []),
    [rows, model, selected],
  );
  const chipRows = useMemo(
    () =>
      model && rows ? narrowChips(model, slug, filtered, selected) : [],
    [model, rows, slug, filtered, selected],
  );

  const narrowing = Boolean(model && rows);
  const toggle = (pick: string) =>
    setSelected((current) =>
      current.includes(pick)
        ? current.filter((each) => each !== pick)
        : [...current, pick],
    );
  const labelOf = (pick: string) => model?.terms.get(pick)?.label ?? pick;
  const included = model
    ? selected.flatMap((pick) =>
        model
          .children(pick)
          .filter((child) =>
            filtered.some((row) => carriesTerm(model, row.tags, child)),
          )
          .map(labelOf),
      )
    : [];
  const listed = selected.length > 0 ? filtered : (rows ?? []);
  const total = selected.length > 0 ? filtered.length : recipeCount;
  const fullQuery = facetQuery([slug, ...selected]);

  return (
    <>
      {narrowing && chipRows.length > 0 && (
        <section
          aria-labelledby={headingId}
          className="flex flex-col gap-2.5 border-y border-border py-3.5"
          data-testid="term-narrow"
        >
          <h2
            id={headingId}
            className="m-0 font-display text-lg font-semibold tracking-[-0.02em]"
          >
            Narrow {label}
          </h2>
          {chipRows.map((row, index) => (
            <div
              key={row.id}
              role="group"
              aria-label={row.label}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="w-full font-mono text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase sm:w-36 sm:shrink-0">
                {row.label}
              </span>
              {index === 0 && (
                <NarrowChip
                  label="All"
                  count={recipeCount}
                  pressed={selected.length === 0}
                  onClick={() => setSelected([])}
                />
              )}
              {row.chips.map((chip) => (
                <NarrowChip
                  key={chip.slug}
                  label={chip.label}
                  count={chip.count}
                  pressed={chip.pressed}
                  onClick={() => toggle(chip.slug)}
                />
              ))}
            </div>
          ))}
        </section>
      )}

      <section
        aria-labelledby={listId}
        className="flex flex-col gap-3"
        data-testid="term-recipes"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2
            id={listId}
            className="m-0 font-display text-xl font-semibold tracking-[-0.02em]"
          >
            {selected.length > 0 ? selected.map(labelOf).join(" + ") : "Recipes"}
            <span
              className="ml-2 font-mono text-xs font-normal text-muted-foreground"
              data-testid="term-list-count"
            >
              {selected.length > 0
                ? `${filtered.length} of ${recipeCount}`
                : plural(recipeCount, "recipe")}
              {included.length > 0 &&
                ` · ${included.slice(0, 2).join(", ")} included`}
            </span>
          </h2>
          <div className="flex items-center gap-3">
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="inline-flex min-h-6 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Clear
              </button>
            )}
            {rows && (
              <Segmented
                label="View"
                value={view}
                options={[
                  { id: "grid", label: "Grid" },
                  { id: "list", label: "List" },
                ]}
                onChange={setView}
                testId="term-view"
              />
            )}
          </div>
        </div>

        {selected.length === 0 && view === "grid" ? (
          grid
        ) : view === "grid" ? (
          <RecipeGrid>
            {listed.slice(0, SHOWN).map((row) => (
              <li key={row.slug}>
                <ClientListItem
                  recipe={{
                    ...row,
                    tags: model ? otherTags(model, row.tags, pageTags) : row.tags,
                  }}
                />
              </li>
            ))}
          </RecipeGrid>
        ) : (
          <ul
            className="m-0 flex list-none flex-col p-0"
            data-testid="term-list"
          >
            {listed.slice(0, SHOWN).map((row) => (
              <ListRow
                key={row.slug}
                row={row}
                tags={model ? otherTags(model, row.tags, pageTags) : row.tags}
              />
            ))}
          </ul>
        )}

        {total > (selected.length === 0 && view === "grid" ? shownCount : SHOWN) && (
          <p className="my-2 text-sm">
            <Link
              href={
                selected.length > 0
                  ? `/search?q=${encodeURIComponent(fullQuery)}`
                  : searchHref
              }
              className="underline underline-offset-4 hover:text-primary"
              data-testid="term-see-all"
            >
              See all {total} recipes
            </Link>
          </p>
        )}
      </section>
    </>
  );
}

function NarrowChip({
  label,
  count,
  pressed,
  onClick,
}: {
  label: string;
  count: number;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      data-testid="term-narrow-chip"
      className={cn(
        "inline-flex min-h-7 items-baseline gap-1.5 rounded-md px-2.5 py-1 text-[0.8125rem] font-medium whitespace-nowrap",
        pressed
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      )}
    >
      {label}
      <span className="font-mono text-[0.6875rem] opacity-75">{count}</span>
    </button>
  );
}

function ListRow({ row, tags }: { row: RecipeListEntry; tags?: string[] }) {
  return (
    <li className="border-b border-border">
      <Link
        href={`/recipe/${row.slug}`}
        className="group flex min-h-14 items-center gap-3 py-1.5"
        data-testid="term-list-row"
      >
        <span className="size-11 shrink-0 overflow-hidden rounded-md bg-muted">
          {row.image ? (
            <PureRecipeImage
              slug={row.slug}
              image={row.image}
              alt=""
              width={96}
              height={96}
              className="h-full w-full object-cover"
              fallback={<RecipeCardPlaceholder name={row.name} />}
            />
          ) : (
            <RecipeCardPlaceholder name={row.name} />
          )}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="font-display text-[0.9375rem] font-semibold group-hover:text-primary">
            {row.name}
          </span>
          {tags && tags.length > 0 && (
            <span className="truncate text-xs text-muted-foreground">
              {tags.join(" · ")}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
