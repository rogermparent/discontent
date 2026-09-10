import { redirect } from "next/navigation";
import { createContent } from "@discontent/cms/content/createContent";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { revalidateWrite } from "@/lib/revalidateWrite";
import {
  bookmarkConfig,
  bookmarkFormSchema,
  formDataToBookmark,
  generateBookmarkSlug,
} from "@/lib/bookmarks";
import { BookmarkForm } from "../form";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ note?: string }>;
}

async function createBookmark(formData: FormData) {
  "use server";

  const rawData = {
    note: formData.get("note") as string,
    label: formData.get("label") as string,
    slug: (formData.get("slug") as string) || undefined,
    date: (formData.get("date") as string) || undefined,
  };

  const parsed = bookmarkFormSchema.safeParse(rawData);
  if (!parsed.success) {
    throw new Error("Invalid form data: " + parsed.error.message);
  }

  const slug = parsed.data.slug || generateBookmarkSlug(parsed.data.label);
  const bookmark = formDataToBookmark(parsed.data);
  const contentDirectory = getContentDirectory();

  const result = await createContent({
    config: bookmarkConfig,
    slug,
    data: bookmark,
    contentDirectory,
    commitMessage: `Create bookmark: ${bookmark.label}`,
  });

  revalidateWrite(bookmarkConfig.contentType, result, { slug });

  redirect(`/bookmarks/${slug}`);
}

export default async function NewBookmarkPage({ searchParams }: PageProps) {
  const { note } = await searchParams;

  return (
    <div>
      <h2>Create New Bookmark</h2>
      <form action={createBookmark}>
        <BookmarkForm
          submitLabel="Create Bookmark"
          cancelHref="/"
          note={note}
        />
      </form>
    </div>
  );
}
