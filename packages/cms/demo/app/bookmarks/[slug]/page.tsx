import Link from "next/link";
import { notFound } from "next/navigation";
import { bookmarkItems } from "@/lib/bookmarkItemReads";
import { noteItems } from "@/lib/noteItemReads";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BookmarkPage({ params }: PageProps) {
  const { slug } = await params;

  /*
   * This page is the demo's version of the shape the whole kind exists for: it
   * renders one item's whole record *and* a second item's, of a different
   * content type, at a URL that is neither of theirs. Nothing derived from a
   * projection reaches it — `revalidatePath("/bookmarks/" + slug)` covers the
   * bookmark and the note not at all.
   */
  const bookmark = await bookmarkItems.read(slug);
  if (!bookmark) notFound();

  /*
   * A reference can dangle — the note may have been deleted — and `null` was
   * always the answer here. The cached read simply hands it back as a value
   * instead of as a swallowed exception, which is the contract the kind adopts
   * everywhere else.
   */
  const note = await noteItems.read(bookmark.note);

  return (
    <div>
      <Link
        href="/"
        style={{ color: "#0070f3", marginBottom: "20px", display: "block" }}
      >
        &larr; Back to all notes
      </Link>

      <h1>{bookmark.label}</h1>

      <p style={{ color: "#666", marginBottom: "20px" }}>
        References note: <strong>{bookmark.note}</strong>
      </p>

      {note ? (
        <p>
          <Link href={`/notes/${bookmark.note}`} style={{ color: "#0070f3" }}>
            View Note: {note.title}
          </Link>
        </p>
      ) : (
        <p style={{ color: "#999" }}>Referenced note not found</p>
      )}

      <p style={{ color: "#999", fontSize: "14px" }}>
        Created: {new Date(bookmark.date).toLocaleString()}
      </p>
    </div>
  );
}
