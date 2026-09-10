import { readContentFile } from "@discontent/cms/content/readContentFile";
import { groupContentConfig } from "../groupContentConfig";
import { Group, GroupEntryKey, GroupEntryValue } from "../types";

/**
 * The raw, uncached read of a group's data file. Throws ENOENT when there is
 * none.
 *
 * There **is** a `readGroupItem.ts` beside it since 22g, and the split is the
 * point (D13). This one is the CLI-safe read (T5/D8): `unstable_cache` throws
 * outside Next, and 22c's curation layer needs a read it can call from plain
 * Node with an explicit `contentDirectory`. It is also the read the write path
 * wants, for the reason `readRecipeItem.ts` gives — a stale read at a write
 * site writes the stale value back to disk.
 *
 * The cached twin was added for a reason a *detail* page never had: this page
 * reads its own record once, but every group **card** now picks a member's
 * thumbnail out of `items`, so `/groups` and the homepage read every group they
 * list. A read site missing the cache is a performance miss; a write site
 * hitting it is data loss.
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
