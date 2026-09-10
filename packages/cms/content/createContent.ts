import type { Key } from "lmdb";
import { exists } from "fs-extra";
import { getContentDirectory } from "../fs/getContentDirectory";
import { commitContentChanges } from "../git/commit";
import { getContentDatabase, writeToIndex } from "./database";
import {
  getContentItemDirectory,
  getUploadInfo,
  processUploadChanges,
  writeContentToFilesystem,
} from "./filesystem";
import { syncPaginationIndexes } from "../pagination/syncContentItem";
import { createReferenceResolver, resolveReferences } from "./references";
import { updateDependents } from "./updateDependents";
import type {
  ContentTypeConfig,
  ContentWriteResult,
  CreateContentOptions,
  FileUploadData,
} from "./types";

export class SlugConflictError extends Error {
  constructor(public readonly slug: string) {
    super(`Content with slug "${slug}" already exists`);
    this.name = "SlugConflictError";
  }
}

/**
 * Default upload processor for creating content.
 * Processes each upload field by writing new files.
 */
export async function defaultCreateUploadsProcessor(
  config: ContentTypeConfig,
  slug: string,
  uploads: Record<string, FileUploadData | undefined>,
  contentDirectory: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (const [, uploadData] of Object.entries(uploads)) {
    const uploadPaths = await processUploadChanges(
      config,
      slug,
      uploadData,
      undefined, // No existing file for create
      contentDirectory,
    );
    paths.push(...uploadPaths);
  }
  return paths;
}

/**
 * Create new content in the filesystem and index
 *
 * This function orchestrates the full content creation process:
 * 1. Processes any file uploads
 * 2. Writes the data file to the filesystem
 * 3. Adds an entry to the LMDB index
 * 4. Brings any declared pagination indexes back in step
 * 5. Brings any content that borrows fields from this item back in step
 * 6. Commits the changes to git
 *
 * @example
 * ```ts
 * await createContent({
 *   config: recipeConfig,
 *   slug: "chocolate-cake",
 *   data: { name: "Chocolate Cake", date: Date.now(), ... },
 *   author: { name: "user@example.com", email: "user@example.com" },
 *   uploads: {
 *     image: { file: imageFile },
 *     video: { file: videoFile },
 *   },
 * });
 * ```
 */
export async function createContent<TData, TIndexValue, TKey extends Key>(
  options: CreateContentOptions<TData, TIndexValue, TKey>,
): Promise<ContentWriteResult> {
  const {
    config,
    slug,
    data,
    contentDirectory: providedContentDirectory,
    author,
    commitMessage,
    uploads,
    processUploads = defaultCreateUploadsProcessor,
    action,
  } = options;

  const contentDirectory = providedContentDirectory || getContentDirectory();
  const touchedPaths: string[] = [];

  // 0. Check for slug conflict
  if (action !== "overwrite") {
    const itemDir = getContentItemDirectory(
      config as ContentTypeConfig,
      slug,
      contentDirectory,
    );
    if (await exists(itemDir)) {
      throw new SlugConflictError(slug);
    }
  }

  // 1. Process uploads
  if (uploads) {
    const resolvedUploads: Record<string, FileUploadData | undefined> = {};
    for (const [fieldName, spec] of Object.entries(uploads)) {
      resolvedUploads[fieldName] = await getUploadInfo(spec);
    }
    const uploadPaths = await processUploads(
      config as ContentTypeConfig,
      slug,
      resolvedUploads,
      contentDirectory,
    );
    if (uploadPaths) {
      touchedPaths.push(...uploadPaths);
    }
  }

  // 2. Write to filesystem
  const dataFilePath = await writeContentToFilesystem(
    config as ContentTypeConfig<TData>,
    slug,
    data,
    contentDirectory,
  );
  touchedPaths.push(dataFilePath);

  // 3. Write to index
  //
  // One resolver for the whole operation. Module-global would serve values
  // from before the last write; per call would re-read the same target once
  // per dependent later on.
  const resolver = createReferenceResolver(contentDirectory);
  const refs = await resolveReferences({ config, data, resolver });
  const indexKey = config.buildIndexKey(slug, data);
  const indexValue = config.buildIndexValue(data, refs);
  const db = getContentDatabase<TIndexValue, TKey>(
    config as ContentTypeConfig,
    contentDirectory,
  );
  await writeToIndex(db, indexKey, indexValue);

  // 4. Update pagination indexes
  const { pagination, aggregates } = await syncPaginationIndexes({
    config,
    contentDirectory,
    id: slug,
    entry: { key: indexKey, value: indexValue },
  });

  /*
   * 5. Bring dependents in step.
   *
   * A create fires this too: a dependent whose reference was dangling until
   * now resolves for the first time, so its borrowed values have to be filled
   * in. Seeding the resolver means the pass reads this item's data file zero
   * times however many dependents it has.
   */
  resolver.seed(config.contentType, slug, data);
  const { dependents, touchedPaths: dependentPaths } = await updateDependents({
    config,
    contentDirectory,
    slug,
    data,
    resolver,
  });
  touchedPaths.push(...dependentPaths);

  // 6. Commit to git
  const message = commitMessage || `Add new ${config.contentType}: ${slug}`;
  await commitContentChanges(message, author, touchedPaths, contentDirectory);

  return { pagination, aggregates, dependents };
}

export default createContent;
