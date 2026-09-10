import Link from "next/link";
import type { PaginationPage } from "@discontent/cms/pagination/types";
import type { BookmarkListItem } from "@/lib/bookmarkPagination";

function href(pageIndex: number | null): string {
  return pageIndex === null
    ? "/bookmarks/browse"
    : `/bookmarks/browse/${pageIndex}`;
}

/**
 * One surface of the paginated bookmark index.
 *
 * Each row prints the referenced note's *title*, which the bookmark itself
 * does not store — it is borrowed, materialized into the content index value
 * at write time and projected into the paged keyspace. Rendering this list
 * reads no note at all.
 */
export function BookmarkBrowseList({
  page,
  isLanding,
}: {
  page: PaginationPage<BookmarkListItem>;
  isLanding: boolean;
}) {
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
        <h2>{isLanding ? "Browse Bookmarks" : "Older Bookmarks"}</h2>
        <Link href="/">All notes</Link>
      </div>

      {page.items.length === 0 ? (
        <p style={{ color: "#666" }}>No bookmarks yet.</p>
      ) : (
        <ul
          data-testid="bookmark-browse-list"
          style={{ listStyle: "none", padding: 0 }}
        >
          {page.items.map((item) => (
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
                href={`/bookmarks/${item.slug}`}
                style={{
                  textDecoration: "none",
                  color: "#28a745",
                  fontSize: "18px",
                  fontWeight: "500",
                }}
              >
                {item.label}
              </Link>
              <p style={{ color: "#666", fontSize: "14px", margin: "5px 0 0" }}>
                Note: {item.noteTitle ?? "(missing)"}
              </p>
            </li>
          ))}
        </ul>
      )}

      <nav
        data-testid="bookmark-browse-nav"
        style={{ display: "flex", gap: "15px", marginTop: "20px" }}
      >
        {page.newerPage !== null || !isLanding ? (
          <Link href={href(page.newerPage)}>Newer bookmarks</Link>
        ) : null}
        {page.olderPage !== null ? (
          <Link href={href(page.olderPage)}>Older bookmarks</Link>
        ) : null}
      </nav>

      {/* Only the landing prints a total — see `NoteBrowseList`. */}
      {isLanding ? (
        <p style={{ marginTop: "20px", color: "#666", fontSize: "14px" }}>
          Total bookmarks: {page.total}
        </p>
      ) : null}
    </div>
  );
}

export default BookmarkBrowseList;
