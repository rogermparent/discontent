import type { Key } from "lmdb";
import { getContentDirectory } from "../fs/getContentDirectory";
import { commitContentChanges } from "../git/commit";
import { getContentDatabase, removeFromIndex, writeToIndex } from "./database";
import {
  getUploadInfo,
  processUploadChanges,
  readContentFromFilesystem,
  renameContentDirectory,
  writeContentToFilesystem,
} from "./filesystem";
import { syncPaginationIndexes } from "../pagination/syncContentItem";
import type {
  ContentTypeConfig,
  ContentWriteResult,
  FileUploadData,
  UpdateContentOptions,
  UploadSpec,
} from "./types";
import {
  borrowedFieldsOf,
  createReferenceResolver,
  resolveReferences,
} from "./references";
import { updateDependents } from "./updateDependents";

/**
 * Default upload processor for updating content.
 * Handles directory renames, removes old files, and writes new files.
 */
export async function defaultUpdateUploadsProcessor(
  config: ContentTypeConfig,
  /* Uploads are processed at the *current* slug, before any rename. */
  _slug: string,
  uploads: Record<string, FileUploadData | undefined>,
  contentDirectory: string,
  currentSlug: string,
  uploadSpecs: Record<string, UploadSpec>,
): Promise<string[]> {
  const paths: string[] = [];
  // Process uploads at current slug location before rename
  for (const [fieldName, uploadData] of Object.entries(uploads)) {
    const existingFile = uploadSpecs[fieldName]?.existingFile;
    const uploadPaths = await processUploadChanges(
      config,
      currentSlug,
      uploadData,
      existingFile,
      contentDirectory,
    );
    paths.push(...uploadPaths);
  }
  return paths;
}

/**
 * Update existing content in the filesystem and index
 *
 * This function orchestrates the full content update process:
 * 1. Processes any file uploads (at current slug location)
 * 2. Renames directories if slug changed
 * 3. Writes the data file to the filesystem
 * 4. Updates the LMDB index (removes old entry if key changed, writes new)
 * 5. Brings any declared pagination indexes back in step
 * 6. Brings content that borrows fields from this item back in step, including
 *    rewriting its slug references when the slug changed
 * 7. Commits the changes to git
 *
 * @example
 * ```ts
 * await updateContent({
 *   config: recipeConfig,
 *   slug: "chocolate-cake-deluxe",
 *   currentSlug: "chocolate-cake",
 *   currentIndexKey: [1738438739783, "chocolate-cake"],
 *   data: { name: "Chocolate Cake Deluxe", date: 1738438739783, ... },
 *   author: { name: "user@example.com", email: "user@example.com" },
 *   uploads: {
 *     image: { file: newImageFile, existingFile: "old-image.jpg" },
 *   },
 * });
 * ```
 */
export async function updateContent<TData, TIndexValue, TKey extends Key>(
  options: UpdateContentOptions<TData, TIndexValue, TKey>,
): Promise<ContentWriteResult> {
  const {
    config,
    slug,
    currentSlug,
    currentIndexKey,
    data,
    contentDirectory: providedContentDirectory,
    author,
    commitMessage,
    uploads,
    processUploads,
  } = options;

  const contentDirectory = providedContentDirectory || getContentDirectory();
  const willRename = currentSlug !== slug;
  const touchedPaths: string[] = [];

  /*
   * 0. Read what this item looked like before, while it is still readable —
   *    before the rename moves it and before step 3 overwrites it.
   *
   *    Gated on `borrowedFieldsOf`, so a content type nothing borrows from —
   *    which is all of them until one opts in — pays no extra read at all. A
   *    failure here is not fatal: an absent previous state reads as "every
   *    borrowed field changed", which over-invalidates rather than going
   *    stale.
   */
  let previousData: TData | undefined;
  if (borrowedFieldsOf(config as ContentTypeConfig).length > 0) {
    try {
      previousData = await readContentFromFilesystem<TData>(
        config as ContentTypeConfig<TData>,
        currentSlug,
        contentDirectory,
      );
    } catch {
      previousData = undefined;
    }
  }

  // 1. Process uploads at current slug location (before rename)
  if (uploads) {
    const resolvedUploads: Record<string, FileUploadData | undefined> = {};
    for (const [fieldName, spec] of Object.entries(uploads)) {
      resolvedUploads[fieldName] = await getUploadInfo(spec);
    }

    const uploadProcessor = processUploads || defaultUpdateUploadsProcessor;
    const uploadPaths = await uploadProcessor(
      config as ContentTypeConfig,
      slug,
      resolvedUploads,
      contentDirectory,
      currentSlug,
      uploads,
    );
    if (uploadPaths) {
      touchedPaths.push(...uploadPaths);
    }
  }

  // 2. Rename directories if slug changed
  if (willRename) {
    const renamePaths = await renameContentDirectory(
      config as ContentTypeConfig,
      currentSlug,
      slug,
      contentDirectory,
    );
    touchedPaths.push(...renamePaths);
  }

  // 3. Write to filesystem
  const dataFilePath = await writeContentToFilesystem(
    config as ContentTypeConfig<TData>,
    slug,
    data,
    contentDirectory,
  );
  touchedPaths.push(dataFilePath);

  // 4. Update index (see `createContent` on the resolver's scope)
  const resolver = createReferenceResolver(contentDirectory);
  const refs = await resolveReferences({ config, data, resolver });
  const newIndexKey = config.buildIndexKey(slug, data);
  const indexValue = config.buildIndexValue(data, refs);
  const db = getContentDatabase<TIndexValue, TKey>(
    config as ContentTypeConfig,
    contentDirectory,
  );
  // Check if key changed (we need to stringify to compare complex keys)
  const keyChanged =
    JSON.stringify(newIndexKey) !== JSON.stringify(currentIndexKey);

  if (keyChanged) {
    await removeFromIndex(db, currentIndexKey);
  }

  await writeToIndex(db, newIndexKey, indexValue);

  // 5. Update pagination indexes
  const { pagination, aggregates } = await syncPaginationIndexes({
    config,
    contentDirectory,
    id: slug,
    previousId: willRename ? currentSlug : undefined,
    entry: { key: newIndexKey, value: indexValue },
  });

  /*
   * 6. Bring dependents in step.
   *
   * This replaces both halves of what used to be here: an `updateReferences`
   * pass that rewrote the referencing type's slugs, and a forced full
   * pagination rebuild of that type to cover the index writes it made behind
   * pagination's back (F15). One pass does both, reading each dependent's data
   * file once and reporting exactly the pages that moved.
   *
   * It also fires for writes the old code did not notice at all — any change
   * to a field a dependent borrows, rename or not.
   */
  resolver.seed(config.contentType, slug, data);
  const { dependents, touchedPaths: dependentPaths } = await updateDependents({
    config,
    contentDirectory,
    slug,
    previousSlug: willRename ? currentSlug : undefined,
    previousData,
    data,
    resolver,
  });
  touchedPaths.push(...dependentPaths);

  // 7. Commit to git
  const message = commitMessage || `Update ${config.contentType}: ${slug}`;
  await commitContentChanges(message, author, touchedPaths, contentDirectory);

  return { pagination, aggregates, dependents };
}

export default updateContent;
