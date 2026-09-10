import Link from "next/link";
import { readContentIndex } from "@discontent/cms/content/readContentIndex";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import {
  noteConfig,
  type NoteIndexValue,
  type NoteIndexKey,
} from "@/lib/notes";
import {
  bookmarkConfig,
  type BookmarkIndexValue,
  type BookmarkIndexKey,
} from "@/lib/bookmarks";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const contentDirectory = getContentDirectory();

  const result = await readContentIndex<NoteIndexValue, NoteIndexKey>({
    config: noteConfig,
    contentDirectory,
    reverse: true, // Newest first
  });

  const bookmarksResult = await readContentIndex<
    BookmarkIndexValue,
    BookmarkIndexKey
  >({
    config: bookmarkConfig,
    contentDirectory,
    reverse: true,
  });

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
        <h2>Notes</h2>
        <Link
          href="/notes/new"
          style={{
            backgroundColor: "#0070f3",
            color: "white",
            padding: "8px 16px",
            borderRadius: "4px",
            textDecoration: "none",
          }}
        >
          Create New Note
        </Link>
      </div>

      {result.entries.length === 0 ? (
        <p style={{ color: "#666" }}>No notes yet. Create your first note!</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {result.entries.map((entry) => {
            const [, slug] = entry.key;
            return (
              <li
                key={slug}
                style={{
                  padding: "15px",
                  marginBottom: "10px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                }}
              >
                <Link
                  href={`/notes/${slug}`}
                  style={{
                    textDecoration: "none",
                    color: "#0070f3",
                    fontSize: "18px",
                    fontWeight: "500",
                  }}
                >
                  {entry.value.title}
                </Link>
                <p
                  style={{ color: "#666", fontSize: "14px", margin: "5px 0 0" }}
                >
                  {new Date(entry.value.date).toLocaleString()}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <p style={{ marginTop: "20px", color: "#666", fontSize: "14px" }}>
        Total notes: {result.total}
      </p>

      {bookmarksResult.entries.length > 0 && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "40px",
            }}
          >
            <h2>Bookmarks</h2>
            <Link href="/bookmarks/browse">Browse bookmarks</Link>
          </div>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {bookmarksResult.entries.map((entry) => {
              const [, slug] = entry.key;
              return (
                <li
                  key={slug}
                  style={{
                    padding: "15px",
                    marginBottom: "10px",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                  }}
                >
                  <Link
                    href={`/bookmarks/${slug}`}
                    style={{
                      textDecoration: "none",
                      color: "#28a745",
                      fontSize: "18px",
                      fontWeight: "500",
                    }}
                  >
                    {entry.value.label}
                  </Link>
                  <p
                    style={{
                      color: "#666",
                      fontSize: "14px",
                      margin: "5px 0 0",
                    }}
                  >
                    References: {entry.value.note}
                  </p>
                  {/*
                   * The referenced note's *title*, with no second read. It is
                   * borrowed into the bookmark's own content index value at
                   * write time, so this list costs one index scan rather than
                   * one scan plus an N+1 of note reads — which is the enrichment
                   * pass `getFeaturedRecipes` still does today.
                   */}
                  <p
                    data-testid="bookmark-note-title"
                    style={{
                      color: "#666",
                      fontSize: "14px",
                      margin: "5px 0 0",
                    }}
                  >
                    Note: {entry.value.noteTitle ?? "(missing)"}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
