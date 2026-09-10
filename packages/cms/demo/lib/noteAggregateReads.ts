import { createCachedAggregateRead } from "@discontent/cms/aggregates/next/cachedReads";
import { noteTags } from "./noteAggregates";
import { noteConfig } from "./notes";

/**
 * The cached read for the note tag cloud.
 *
 * Built at module scope rather than per request so the `React.cache` wrapper
 * inside survives long enough to dedupe anything — a factory called per render
 * would hand back a fresh, empty memo table every time. Same reasoning as
 * `notePaginationReads.ts`.
 */
export const noteTagReads = createCachedAggregateRead({
  config: noteConfig,
  aggregateConfig: noteTags,
});

export default noteTagReads;
