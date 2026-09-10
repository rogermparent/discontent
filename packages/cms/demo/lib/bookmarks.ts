import type { ContentTypeConfig } from "@discontent/cms/content/types";
import { borrowed } from "@discontent/cms/content/references";
import { z } from "zod";
import dateEpochSchema from "@discontent/cms/forms/schema/dateEpoch";
import { bookmarksByDate } from "./bookmarkPagination";
import { noteConfig, type Note } from "./notes";

// Bookmark data schema - references a note by slug
export interface Bookmark {
  note: string; // Note slug reference
  label: string;
  date: number;
}

// Index value (subset of Bookmark for fast querying)
export interface BookmarkIndexValue {
  note: string;
  label: string;
  date: number;
  /**
   * Borrowed from the referenced note (§6.1). Optional because a reference can
   * dangle — a note can be deleted while bookmarks to it remain — and because
   * an index built before this field existed simply will not have it.
   *
   * Having it here is what lets a list render a note's title with no second
   * read, and what lets the pagination projection cover it at all.
   */
  noteTitle?: string;
}

// Index key: [date, slug] for sorting by date
export type BookmarkIndexKey = [number, string];

// Content type configuration
export const bookmarkConfig: ContentTypeConfig<
  Bookmark,
  BookmarkIndexValue,
  BookmarkIndexKey
> = {
  contentType: "bookmarks",
  dataDirectory: "bookmarks/data",
  indexDirectory: "bookmarks/index",
  dataFilename: "bookmark.json",
  buildIndexValue: (data: Bookmark, refs): BookmarkIndexValue => ({
    note: data.note,
    label: data.label,
    date: data.date,
    /*
     * Pure and synchronous: the engine already read the note and handed the
     * declared fields over. Reading anything not named in `fields` below would
     * be a value nothing invalidates.
     */
    noteTitle: borrowed<Note>(refs, "note")?.title,
  }),
  buildIndexKey: (slug: string, data: Bookmark): BookmarkIndexKey => [
    data.date,
    slug,
  ],
  /*
   * The inbound half of the edge `noteConfig.referencedBy` declares outbound.
   * Both halves name each other's module, so this import is circular — which
   * is exactly what the thunks are for. Without them, whichever module the
   * bundler reached second would evaluate the first's object literal while its
   * `const` was still in the temporal dead zone.
   */
  references: [
    {
      config: () => noteConfig,
      dataField: "note",
      fields: ["title"],
    },
  ],
  paginationIndexes: [bookmarksByDate],
};

// Zod schema for form validation
export const bookmarkFormSchema = z.object({
  note: z.string().min(1, "Note is required"),
  label: z.string().min(1, "Label is required"),
  slug: z.string().nullish(),
  date: dateEpochSchema.nullish(),
});

export type BookmarkFormData = z.infer<typeof bookmarkFormSchema>;

// Helper to convert form data to Bookmark
export function formDataToBookmark(
  formData: BookmarkFormData,
  existingDate?: number,
): Bookmark {
  const date = typeof formData.date === "number" ? formData.date : null;
  return {
    note: formData.note,
    label: formData.label,
    date: date ?? existingDate ?? Date.now(),
  };
}

// Helper to generate slug from label
export function generateBookmarkSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
