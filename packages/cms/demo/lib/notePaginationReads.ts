import { createCachedPaginationReads } from "@discontent/cms/pagination/next/cachedReads";
import { notesByDate, type NoteListItem } from "./notePagination";
import { noteConfig, type NoteIndexKey, type NoteIndexValue } from "./notes";

/**
 * The cached reads for the notes index, built once per process.
 *
 * Built at module scope rather than per request so the `React.cache` wrappers
 * inside survive long enough to dedupe anything — a factory called per render
 * would hand back fresh, empty memo tables every time.
 */
export const notePages = createCachedPaginationReads<
  NoteIndexValue,
  NoteIndexKey,
  NoteListItem
>({
  config: noteConfig,
  paginationConfig: notesByDate,
});
