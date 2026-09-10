import { readContentFile } from "@discontent/cms/content/readContentFile";
import { groupContentConfig } from "../groupContentConfig";
import { Group, GroupEntryKey, GroupEntryValue } from "../types";

/**
 * The raw, uncached read of a group's data file. Throws ENOENT when there is
 * none.
 *
 * There is no `readGroupItem.ts` beside it, and that is a decision rather than
 * an omission. `createCachedItemRead` earns its place on recipes because
 * `/recipe/<slug>` and `/featured-recipe/<slug>` each read the same record
 * twice per request (metadata, then the body) — a group detail page reads its
 * own record once and spends the rest of the request reading *recipes*, which
 * do go through the cache. So this is the only group-record read, and it is the
 * CLI-safe one (T5/D8): `unstable_cache` throws outside Next, and 22c's
 * curation layer needs a read it can call from plain Node with an explicit
 * `contentDirectory`.
 *
 * Callers render a missing group as `notFound()`, exactly as
 * `featured-recipe/[slug]` does with `getFeaturedRecipeBySlug`.
 */
export async function getGroupBySlug({
  slug,
  contentDirectory,
}: {
  slug: string;
  contentDirectory?: string;
}): Promise<Group> {
  return readContentFile<Group, GroupEntryValue, GroupEntryKey>({
    config: groupContentConfig,
    slug,
    contentDirectory,
  });
}

export default getGroupBySlug;
