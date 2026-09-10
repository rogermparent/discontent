import Link from "next/link";
import { notFound } from "next/navigation";
import { noteItems } from "@/lib/noteItemReads";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ViewNotePage({ params }: Props) {
  const { slug } = await params;

  /*
   * Cached and tagged `item:notes:<slug>`. `force-dynamic` above only stops
   * the *route* being cached — the read underneath still persists across
   * requests, which is what makes this page a real proving ground: without the
   * write path firing that tag, editing the body below would leave this
   * showing the old one.
   *
   * `null` rather than a throw, so the six-line try/catch this replaces
   * collapses to the line after it.
   */
  const note = await noteItems.read(slug);
  if (!note) notFound();

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "20px",
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 5px" }}>{note.title}</h2>
          <p style={{ color: "#666", fontSize: "14px", margin: 0 }}>
            {new Date(note.date).toLocaleString()}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link
            href={`/notes/${slug}/edit`}
            style={{
              backgroundColor: "#0070f3",
              color: "white",
              padding: "8px 16px",
              borderRadius: "4px",
              textDecoration: "none",
            }}
          >
            Edit
          </Link>
          <Link
            href={`/bookmarks/new?note=${slug}`}
            style={{
              backgroundColor: "#28a745",
              color: "white",
              padding: "8px 16px",
              borderRadius: "4px",
              textDecoration: "none",
            }}
          >
            Bookmark
          </Link>
          <Link
            href={`/notes/${slug}/delete`}
            style={{
              backgroundColor: "#dc3545",
              color: "white",
              padding: "8px 16px",
              borderRadius: "4px",
              textDecoration: "none",
            }}
          >
            Delete
          </Link>
        </div>
      </div>

      {note.tags && note.tags.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          {note.tags.map((tag) => (
            <span
              key={tag}
              style={{
                display: "inline-block",
                backgroundColor: "#f0f0f0",
                padding: "4px 8px",
                borderRadius: "4px",
                marginRight: "5px",
                fontSize: "14px",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          backgroundColor: "#f9f9f9",
          padding: "20px",
          borderRadius: "4px",
          whiteSpace: "pre-wrap",
          lineHeight: "1.6",
        }}
      >
        {note.content || <em style={{ color: "#999" }}>No content</em>}
      </div>

      <div style={{ marginTop: "20px" }}>
        <Link href="/" style={{ color: "#0070f3" }}>
          &larr; Back to all notes
        </Link>
      </div>
    </div>
  );
}
