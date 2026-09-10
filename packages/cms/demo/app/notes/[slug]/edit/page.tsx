import { redirect, notFound } from "next/navigation";
import { readContentFile } from "@discontent/cms/content/readContentFile";
import { updateContent } from "@discontent/cms/content/updateContent";
import { revalidateWrite } from "@/lib/revalidateWrite";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import {
  noteConfig,
  noteFormSchema,
  formDataToNote,
  generateSlug,
  type Note,
  type NoteIndexKey,
  NoteIndexValue,
} from "@/lib/notes";
import { NoteForm } from "../../form";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

async function updateNote(formData: FormData) {
  "use server";

  const currentSlug = formData.get("currentSlug") as string;
  const currentDate = parseInt(formData.get("currentDate") as string, 10);

  const rawData = {
    title: formData.get("title") as string,
    content: formData.get("content") as string,
    slug: formData.get("slug") as string,
    tags: formData.get("tags") as string,
    date: formData.get("date") as string,
  };

  const parsed = noteFormSchema.safeParse(rawData);
  if (!parsed.success) {
    throw new Error("Invalid form data: " + parsed.error.message);
  }

  const newSlug = parsed.data.slug || generateSlug(parsed.data.title);
  const note = formDataToNote(parsed.data, currentDate);
  const contentDirectory = getContentDirectory();
  const currentIndexKey: NoteIndexKey = [currentDate, currentSlug];

  const result = await updateContent({
    config: noteConfig,
    slug: newSlug,
    currentSlug,
    currentIndexKey,
    data: note,
    contentDirectory,
    commitMessage: `Update note: ${note.title}`,
  });

  revalidateWrite(noteConfig.contentType, result, {
    slug: newSlug,
    previousSlug: currentSlug,
  });

  redirect(`/notes/${newSlug}`);
}

export default async function EditNotePage({ params }: Props) {
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
      <h2>Edit Note</h2>
      <form action={updateNote}>
        <NoteForm
          note={note}
          slug={slug}
          submitLabel="Update Note"
          cancelHref={`/notes/${slug}`}
        />
      </form>
    </div>
  );
}
