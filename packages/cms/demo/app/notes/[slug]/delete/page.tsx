import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { readContentFile } from "@discontent/cms/content/readContentFile";
import { deleteContent } from "@discontent/cms/content/deleteContent";
import { revalidateWrite } from "@/lib/revalidateWrite";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import {
  noteConfig,
  NoteIndexValue,
  type Note,
  type NoteIndexKey,
} from "@/lib/notes";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

async function performDelete(formData: FormData) {
  "use server";

  const slug = formData.get("slug") as string;
  const date = parseInt(formData.get("date") as string, 10);
  const contentDirectory = getContentDirectory();
  const indexKey: NoteIndexKey = [date, slug];

  const result = await deleteContent({
    config: noteConfig,
    slug,
    indexKey,
    contentDirectory,
    commitMessage: `Delete note: ${slug}`,
  });

  revalidateWrite(noteConfig.contentType, result, { slug });

  redirect("/");
}

export default async function DeleteNotePage({ params }: Props) {
  const { slug } = await params;
  const contentDirectory = getContentDirectory();

  let note: Note;
  try {
    note = await readContentFile<Note, NoteIndexValue, NoteIndexKey>({
      config: noteConfig,
      slug,
      contentDirectory,
    });
  } catch {
    notFound();
  }

  return (
    <div>
      <h2>Delete Note</h2>
      <div
        style={{
          backgroundColor: "#fff3cd",
          border: "1px solid #ffc107",
          borderRadius: "4px",
          padding: "20px",
          marginBottom: "20px",
        }}
      >
        <p style={{ margin: "0 0 10px", fontWeight: "500" }}>
          Are you sure you want to delete this note?
        </p>
        <p style={{ margin: 0 }}>
          <strong>{note.title}</strong>
        </p>
      </div>

      <form action={performDelete}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="date" value={note.date} />

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="submit"
            style={{
              backgroundColor: "#dc3545",
              color: "white",
              padding: "10px 20px",
              border: "none",
              borderRadius: "4px",
              fontSize: "16px",
              cursor: "pointer",
            }}
          >
            Yes, Delete Note
          </button>
          <Link
            href={`/notes/${slug}`}
            style={{
              padding: "10px 20px",
              border: "1px solid #ddd",
              borderRadius: "4px",
              textDecoration: "none",
              color: "#333",
              display: "inline-block",
            }}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
