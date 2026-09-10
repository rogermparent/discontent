"use client";

import { useCallback, type ReactNode } from "react";
import Link from "next/link";
import { LayersIcon, ListIcon } from "lucide-react";
import type { PaginationPage } from "@discontent/cms/pagination/types";
import { useInfinitePagination } from "@discontent/cms/pagination/client/useInfinitePagination";
import { useIntersectionTrigger } from "@discontent/cms/pagination/client/useIntersectionTrigger";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@discontent/component-library/components/ui/toggle-group";
import type { RecipeListEntry } from "../../controller/paginationConfigs";
import ClientRecipeList from "../ClientList";
import { RecipePagination } from "../Pagination";
import { useListMode, type ListMode } from "./useListMode";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/** URL numbers are stable page ids plus one; the JSON routes agree. */
const FIRST_PAGE_NUMBER = 1;

async function fetchRecipePage(
  pageIndex: number,
): Promise<PaginationPage<RecipeListEntry>> {
  const response = await fetch(
    `/recipes/page/${pageIndex + FIRST_PAGE_NUMBER}`,
  );
  if (!response.ok) throw new Error(`Recipe page ${pageIndex} failed`);
  return response.json();
}

/**
 * The recipe index's list, in whichever mode the reader prefers.
 *
 * **`seed` is server-rendered markup, passed through untouched.** That is the
 * whole architecture of this component. A recipe card's image comes from
 * `RecipeImage`, an async server component that resizes with sharp as a side
 * effect of rendering, so a client component cannot produce one. Keeping the
 * server's own render of the seed page as a slot means the page the reader
 * landed on is byte-for-byte what it always was — in either mode, before and
 * after the toggle — and only *appended* pages are rendered on the client.
 *
 * Those use `ClientRecipeList`, which is what search results already render
 * with: `PureStaticImage` builds the same `/image/…-w400q75.webp` URL the
 * server's loader does, so an appended card points at a file the corresponding
 * numbered page's render already produced.
 */
export function RecipeIndexList({
  page,
  isLanding,
  seed,
}: {
  page: PaginationPage<RecipeListEntry>;
  isLanding: boolean;
  /** The server's render of `page.items`. Never re-rendered on the client. */
  seed: ReactNode;
}) {
  const [mode, setMode] = useListMode();
  const reducedMotion = usePrefersReducedMotion();
  const infinite = mode === "infinite";

  const {
    pages,
    hasNextPage,
    isFetchingNextPage,
    nextPageIndex,
    error,
    fetchNextPage,
    reset,
  } = useInfinitePagination<RecipeListEntry>({
    initialPage: page,
    fetchPage: fetchRecipePage,
    enabled: infinite,
  });

  const sentinelRef = useIntersectionTrigger(fetchNextPage, {
    /* Never auto-grow for a reader who asked for less motion; the button below
     * is still there, and is the only path forward for them. */
    enabled: infinite && hasNextPage && !reducedMotion,
    /* Load counts, not the fetching flag — see the option's docstring. */
    resetKey: pages.length,
  });

  const onModeChange = useCallback(
    (next: string) => {
      /* Radix clears the value when the active item is pressed again; a mode
       * is not something the reader can have none of. */
      if (next !== "pages" && next !== "infinite") return;
      /* Turning it off discards what was appended, so the list says what the
       * URL says again. Neither direction navigates. */
      if (next === "pages") reset();
      setMode(next as ListMode);
    },
    [reset, setMode],
  );

  /* The seed is already on screen; only the pages after it are appended. */
  const appended = pages.slice(1).flatMap((loaded) => loaded.items);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={onModeChange}
          variant="outline"
          size="sm"
          aria-label="Recipe list layout"
        >
          {/*
           * No `aria-label` on the items: the visible word is the accessible
           * name. An `aria-label` would replace it, leaving a control whose
           * spoken name is nothing a reader can see or say.
           */}
          <ToggleGroupItem value="pages">
            <LayersIcon aria-hidden="true" />
            Pages
          </ToggleGroupItem>
          <ToggleGroupItem value="infinite">
            <ListIcon aria-hidden="true" />
            Infinite
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {seed}

      {infinite ? (
        <div data-testid="recipe-infinite">
          {appended.length > 0 ? <ClientRecipeList recipes={appended} /> : null}

          {/*
           * How much of the list there now is — the thing a reader who cannot
           * see it grow actually needs. Polite, so it waits for a pause rather
           * than interrupting.
           */}
          <p aria-live="polite" className="sr-only">
            {isFetchingNextPage
              ? "Loading more recipes…"
              : `Showing ${page.items.length + appended.length} recipes.`}
          </p>

          {hasNextPage ? (
            <div className="my-4 flex flex-col items-center gap-2">
              <div ref={sentinelRef} aria-hidden="true" />
              {/*
               * A real link to the numbered page, so it works from the
               * keyboard, survives JS failing, and shows where "more" leads.
               * Clicking appends in place instead of navigating.
               */}
              {/*
               * The label never changes while loading. A control's accessible
               * name is how a reader refers to it; swapping it for "Loading…"
               * mid-press renames the thing they just pressed. The live region
               * above carries the state instead.
               */}
              <Button asChild variant="outline">
                <Link
                  href={`/recipes/${(nextPageIndex ?? 0) + FIRST_PAGE_NUMBER}`}
                  aria-busy={isFetchingNextPage}
                  onClick={(event) => {
                    event.preventDefault();
                    fetchNextPage();
                  }}
                >
                  Load more recipes
                </Link>
              </Button>
              {error ? (
                <p className="text-destructive text-sm">
                  Could not load more recipes. Try again.
                </p>
              ) : null}
            </div>
          ) : (
            <p
              data-testid="recipe-infinite-end"
              className="text-muted-foreground my-4 text-center text-sm"
            >
              That&rsquo;s every recipe.
            </p>
          )}
        </div>
      ) : (
        <RecipePagination
          basePath="/recipes"
          page={page}
          isLanding={isLanding}
        />
      )}
    </div>
  );
}

export default RecipeIndexList;
