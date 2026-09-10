import type { ContentTypeConfig } from "@discontent/cms/content/types";
import { z } from "zod";
import dateEpochSchema from "@discontent/cms/forms/schema/dateEpoch";
/*
 * Circular: `bookmarks.ts` imports this module back, because the reference
 * edge between the two is declared from both sides. Safe only because both
 * sides defer the config behind a thunk — see `ReferenceSpec.config`.
 */
import { bookmarkConfig } from "./bookmarks";
import { noteTags } from "./noteAggregates";
import { notesByDate } from "./notePagination";

// Note data schema
export interface Note {
  title: string;
  content: string;
  date: number;
  tags?: string[];
}

// Index value (subset of Note for fast querying)
export interface NoteIndexValue {
  title: string;
  date: number;
  /*
   * Carried so the tag aggregate can fold it. An aggregate reads the index
   * value, not a pagination projection — which is exactly why this field can
   * be here without `NoteListItem` carrying it, and so without a note's tags
   * dirtying a page nobody renders them on.
   */
  tags?: string[];
}

// Index key: [date, slug] for sorting by date
export type NoteIndexKey = [number, string];

// Content type configuration
export const noteConfig: ContentTypeConfig<Note, NoteIndexValue, NoteIndexKey> =
  {
    contentType: "notes",
    dataDirectory: "notes/data",
    indexDirectory: "notes/index",
    dataFilename: "note.json",
    buildIndexValue: (data: Note): NoteIndexValue => ({
      title: data.title,
      date: data.date,
      tags: data.tags,
    }),
    buildIndexKey: (slug: string, data: Note): NoteIndexKey => [
      data.date,
      slug,
    ],
    referencedBy: [
      {
        config: () => bookmarkConfig,
        indexField: "note",
      },
    ],
    paginationIndexes: [notesByDate],
    aggregates: [noteTags],
  };

// Zod schema for form validation
export const noteFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string(),
  slug: z.string().optional(),
  tags: z.string().optional(), // Comma-separated tags
  date: dateEpochSchema.optional(),
});

export type NoteFormData = z.infer<typeof noteFormSchema>;

// Helper to convert form data to Note
export function formDataToNote(
  formData: NoteFormData,
  existingDate?: number,
): Note {
  const date = typeof formData.date === "number" ? formData.date : undefined;
  return {
    title: formData.title,
    content: formData.content,
    date: date ?? existingDate ?? Date.now(),
    tags: formData.tags
      ? formData.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined,
  };
}

// Helper to generate slug from title
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
