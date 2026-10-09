import { readdir } from "fs/promises";
import { resolve } from "path";
import type { ContentTypeConfig } from "@discontent/cms/content/types";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { environmentExists } from "@discontent/cms/lmdb/environmentCache";
import { getPaginationDirectory } from "@discontent/cms/pagination/database";
import type { PaginationIndexConfig } from "@discontent/cms/pagination/types";

/**
 * `generateStaticParams` for a `[slug]` route over one content type's sorted
 * keyspace (F7).
 *
 * Never empty: `output: "export"` rejects a dynamic route whose params come back
 * empty — "Page … is missing generateStaticParams()" is raised for an empty
 * array, not just for a missing function — so a type with no items yields one
 * placeholder the route `notFound()`s, and the export writes a 404 body there.
 *
 * But an empty keyspace is only an empty corpus when the index exists. A
 * content directory whose data was never indexed reads as empty too (F30), and
 * a build that took that at its word would emit no content pages and pass. So
 * when items are on disk and their index is not, this fails the build instead.
 */
export async function staticSlugParams(
  readIds: () => Promise<string[]>,
  config: Pick<
    ContentTypeConfig,
    "contentType" | "dataDirectory" | "indexDirectory"
  >,
  paginationConfig: Pick<PaginationIndexConfig, "name">,
): Promise<{ slug: string }[]> {
  const slugs = await readIds();
  if (slugs.length > 0) return slugs.map((slug) => ({ slug }));

  if (!environmentExists(getPaginationDirectory(config, paginationConfig))) {
    const dataDirectory = resolve(getContentDirectory(), config.dataDirectory);
    const entries = await readdir(dataDirectory, {
      withFileTypes: true,
    }).catch(() => []);
    const count = entries.filter((entry) => entry.isDirectory()).length;
    if (count > 0) {
      throw new Error(
        `${config.contentType}: content has ${count} items but no index — run \`pnpm recipes reindex\``,
      );
    }
  }
  return [{ slug: "_" }];
}
