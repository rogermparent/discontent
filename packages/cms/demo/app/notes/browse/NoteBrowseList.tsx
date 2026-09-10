"use client";

import { useState } from "react";
import Link from "next/link";
import type { PaginationPage } from "@discontent/cms/pagination/types";
import { useInfinitePagination } from "@discontent/cms/pagination/client/useInfinitePagination";
import { useIntersectionTrigger } from "@discontent/cms/pagination/client/useIntersectionTrigger";
import type { NoteListItem } from "@/lib/notePagination";

function href(pageIndex: number | null): string {
  return pageIndex === null ? "/notes/browse" : `/notes/browse/${pageIndex}`;
}

/** The demo's numbered URLs are the stable page ids, so no offset to apply. */
async function fetchNotePage(
  pageIndex: number,
): Promise<PaginationPage<NoteListItem>> {
  const response = await fetch(`/notes/browse/page/${pageIndex}`);
  if (!response.ok) throw new Error(`Note page ${pageIndex} failed`);
  return response.json();
}

/**
 * One surface of the paginated notes index.
 *
 * Navigation is relative — "Older" / "Newer", never "page 3 of 12". Page ids
 * are anchored at the oldest item so URLs stay stable, which means a
 * human-facing number counted from the newest end would move as the corpus
 * grows.
 *
 * A client component since D3, so it can keep walking the index past the page
 * the server handed it. The seed page is still server-rendered, and numbered
 * mode is the default — so what this emits without JS, and what it emits
 * before anyone touches the toggle, is exactly what it emitted before.
 */
export function NoteBrowseList({
  page,
  isLanding,
}: {
  page: PaginationPage<NoteListItem>;
  isLanding: boolean;
}) {
  /*
   * Numbered by default, matching the decision F9 makes for the recipe site:
   * it is what the server rendered, what a crawler sees, and what every
   * existing spec here already describes. Infinite is opt-in.
   *
   * Not persisted, unlike the recipe site's — the demo proves the mechanism,
   * and a remembered preference here would only mean fixture resets have one
   * more thing to clear.
   */
  const [infinite, setInfinite] = useState(false);

  const {
    pages,
    items,
    hasNextPage,
    isFetchingNextPage,
    nextPageIndex,
    error,
    fetchNextPage,
    reset,
  } = useInfinitePagination<NoteListItem>({
    initialPage: page,
    fetchPage: fetchNotePage,
    enabled: infinite,
  });

  const sentinelRef = useIntersectionTrigger(fetchNextPage, {
    enabled: infinite && hasNextPage,
    /*
     * Not an optimisation — it is what keeps the walk going. See the option's
     * docstring: the observer only reports transitions, and this corpus is
     * short enough that the sentinel never leaves the screen.
     */
    resetKey: pages.length,
  });

  const shown = infinite ? items : page.items;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h2>{isLanding ? "Browse Notes" : "Older Notes"}</h2>
        <Link href="/">All notes</Link>
      </div>

      <button
        type="button"
        data-testid="browse-mode-toggle"
        onClick={() => {
          /*
           * Turning it off discards what was appended, so the list says what
           * the URL says again. Turning it on keeps what is rendered and just
           * starts appending below it — neither direction navigates.
           */
          if (infinite) reset();
          setInfinite((on) => !on);
        }}
        style={{ marginBottom: "20px" }}
      >
        {infinite ? "Switch to numbered pages" : "Switch to infinite scroll"}
      </button>

      {shown.length === 0 ? (
        <p style={{ color: "#666" }}>No notes yet.</p>
      ) : (
        <ul data-testid="browse-list" style={{ listStyle: "none", padding: 0 }}>
          {shown.map((item) => (
            <li
              key={item.slug}
              style={{
                padding: "15px",
                marginBottom: "10px",
                border: "1px solid #ddd",
                borderRadius: "4px",
              }}
            >
              <Link
                href={`/notes/${item.slug}`}
                style={{
                  textDecoration: "none",
                  color: "#0070f3",
                  fontSize: "18px",
                  fontWeight: "500",
                }}
              >
                {item.title}
              </Link>
              <p
                /*
                 * Formatted in the reader's locale and zone, which the server
                 * has no way to know — so the two renders legitimately differ.
                 */
                suppressHydrationWarning
                style={{ color: "#666", fontSize: "14px", margin: "5px 0 0" }}
              >
                {new Date(item.date).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}

      {infinite ? (
        <div data-testid="browse-infinite-status" style={{ marginTop: "20px" }}>
          {hasNextPage ? (
            <>
              <div ref={sentinelRef} aria-hidden="true" />
              {/*
               * A real link to the page it would load, not a bare sentinel: it
               * is the keyboard path, and it is what is left if the observer
               * never fires. Clicking appends in place rather than navigating.
               *
               * Named "Load more notes" rather than anything containing "older
               * notes": Playwright's `getByRole` name option matches substrings
               * by default, so the latter would also match the numbered mode's
               * "Older notes" link and quietly widen the existing specs.
               */}
              <Link
                href={href(nextPageIndex)}
                onClick={(event) => {
                  event.preventDefault();
                  fetchNextPage();
                }}
              >
                Load more notes
              </Link>
            </>
          ) : (
            <p data-testid="browse-infinite-end" style={{ color: "#666" }}>
              No older notes.
            </p>
          )}
          <p
            aria-live="polite"
            style={{ color: "#666", fontSize: "14px", margin: "5px 0 0" }}
          >
            {isFetchingNextPage
              ? "Loading older notes…"
              : `Showing ${shown.length} notes.`}
          </p>
          {error ? (
            <p style={{ color: "#b00" }}>
              Could not load older notes. Scroll again to retry.
            </p>
          ) : null}
        </div>
      ) : (
        <nav
          data-testid="browse-nav"
          style={{ display: "flex", gap: "15px", marginTop: "20px" }}
        >
          {page.newerPage !== null || !isLanding ? (
            <Link href={href(page.newerPage)}>Newer notes</Link>
          ) : null}
          {page.olderPage !== null ? (
            <Link href={href(page.olderPage)}>Older notes</Link>
          ) : null}
        </nav>
      )}

      {/*
       * Only the landing prints a total. A numbered page must not: `total`
       * lives behind its own cache tag precisely so that the corpus growing
       * does not invalidate every sealed page, and rendering it here would
       * hand that separation straight back.
       */}
      {isLanding ? (
        <p style={{ marginTop: "20px", color: "#666", fontSize: "14px" }}>
          Total notes: {page.total}
        </p>
      ) : null}
    </div>
  );
}

export default NoteBrowseList;
