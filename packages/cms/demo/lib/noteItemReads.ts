import { createCachedItemRead } from "@discontent/cms/content/next/cachedItemRead";
import {
  noteConfig,
  type Note,
  type NoteIndexKey,
  type NoteIndexValue,
} from "./notes";

/**
 * The cached by-slug read for a note's whole record.
 *
 * Built at module scope so the `React.cache` wrapper inside survives long
 * enough to dedupe — same reasoning as `notePaginationReads.ts`. It matters
 * more here than there: `/bookmarks/<slug>` reads a note that is not its own
 * item, so two different surfaces ask for the same record.
 */
export const noteItems = createCachedItemRead<
  Note,
  NoteIndexValue,
  NoteIndexKey
>({
  config: noteConfig,
});

export default noteItems;
