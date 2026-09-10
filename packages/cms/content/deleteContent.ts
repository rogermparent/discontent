import type { Key } from "lmdb";
import { getContentDirectory } from "../fs/getContentDirectory";
import { commitContentChanges } from "../git/commit";
import { getContentDatabase, removeFromIndex } from "./database";
import { syncPaginationIndexes } from "../pagination/syncContentItem";
import {
  deleteContentFromFilesystem,
  readContentFromFilesystem,
} from "./filesystem";
import { borrowedFieldsOf, createReferenceResolver } from "./references";
import { updateDependents } from "./updateDependents";
import type {
  ContentTypeConfig,
  ContentWriteResult,
  DeleteContentOptions,
} from "./types";

/**
 * Delete content from the filesystem and index
 *
 * This function orchestrates the full content deletion process:
 * 1. Removes the data directory from the filesystem
 * 2. Removes any uploads associated with the content
 * 3. Removes the entry from the LMDB index
 * 4. Brings any declared pagination indexes back in step
 * 5. Clears the borrowed values from content that referenced this item
 * 6. Commits the changes to git
 *
 * @example
 * ```ts
 * await deleteContent({
 *   config: recipeConfig,
 *   slug: "chocolate-cake",
 *   indexKey: [1738438739783, "chocolate-cake"],
 *   author: { name: "user@example.com", email: "user@example.com" },
 * });
 * ```
 */
export async function deleteContent<TData, TIndexValue, TKey extends Key>(
  options: DeleteContentOptions<TData, TIndexValue, TKey>,
): Promise<ContentWriteResult> {
  const {
    config,
    slug,
    indexKey,
    contentDirectory: providedContentDirectory,
    author,
    commitMessage,
  } = options;

  const contentDirectory = providedContentDirectory || getContentDirectory();
  const resolver = createReferenceResolver(contentDirectory);

  /*
   * 0. Read the item while it still exists, so the dependent pass can tell
   *    which borrowed values are leaving. Gated, so a content type nothing
   *    borrows from pays no extra read.
   */
  let previousData: TData | undefined;
  if (borrowedFieldsOf(config as ContentTypeConfig).length > 0) {
    try {
      previousData = await readContentFromFilesystem<TData>(
        config as ContentTypeConfig<TData>,
        slug,
        contentDirectory,
      );
    } catch {
      previousData = undefined;
    }
  }

  // 1. Delete from filesystem (including uploads)
  const deletedPaths = await deleteContentFromFilesystem(
    config as ContentTypeConfig,
    slug,
    contentDirectory,
  );

  // 2. Remove from index
  const db = getContentDatabase<TIndexValue, TKey>(
    config as ContentTypeConfig,
    contentDirectory,
  );
  await removeFromIndex(db, indexKey);

  // 3. Update pagination indexes. No `entry`, which is how phase 1 says
  //    "remove this item".
  const { pagination, aggregates } = await syncPaginationIndexes({
    config,
    contentDirectory,
    id: slug,
  });

  /*
   * 4. Cascade to dependents.
   *
   * `forget`, so nothing seeded earlier in this operation can vouch for an
   * item that is now off disk — resolution has to reach the missing file and
   * come back `undefined`.
   *
   * Dependents keep their reference field pointing at the dead slug. Only the
   * borrowed values leave the index: a list row stops showing a name that is
   * gone, while the record of what the item pointed at survives, which is the
   * only thing that could ever repair the link.
   */
  resolver.forget(config.contentType, slug);
  const { dependents } = await updateDependents({
    config,
    contentDirectory,
    slug,
    previousData,
    resolver,
  });

  // 5. Commit to git
  const message = commitMessage || `Delete ${config.contentType}: ${slug}`;
  await commitContentChanges(message, author, deletedPaths, contentDirectory);

  return { pagination, aggregates, dependents };
}

export default deleteContent;
