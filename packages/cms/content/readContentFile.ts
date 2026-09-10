import { Key } from "lmdb";
import { getContentDirectory } from "../fs/getContentDirectory";
import { readContentFromFilesystem } from "./filesystem";
import type { ContentTypeConfig, ReadContentFileOptions } from "./types";

/**
 * Read a single content file from the filesystem by slug
 *
 * @example
 * ```ts
 * const recipe = await readContentFile({
 *   config: recipeConfig,
 *   slug: "chocolate-cake",
 * });
 * ```
 */
export async function readContentFile<
  TData = Record<string, unknown>,
  TIndexValue = TData,
  TKey extends Key = Key,
>(options: ReadContentFileOptions<TData, TIndexValue, TKey>): Promise<TData> {
  const { config, slug, contentDirectory: providedContentDirectory } = options;

  const contentDirectory = providedContentDirectory || getContentDirectory();

  return readContentFromFilesystem<TData>(
    config as ContentTypeConfig<TData>,
    slug,
    contentDirectory,
  );
}

/**
 * The same read, with "no item at this slug" as a value rather than a throw.
 *
 * Two reasons this exists rather than every caller writing the `try`/`catch`
 * itself — which, before this, fifteen of them did:
 *
 * - **A cached read must not memoize a throw.** `createCachedItemRead` wraps
 *   this, and a rejected promise is not a cache entry; turning the miss into
 *   `null` makes the absence cacheable, which is the desirable half. Negative
 *   caching is only safe because a later *create* at that slug fires
 *   `itemTag(contentType, slug)` and drops the entry — the write path fires
 *   that tag on create, not just on update.
 * - It matches `readAggregate`'s contract, where `null` already means "no
 *   stored value", so the kinds read alike.
 *
 * Only `ENOENT` becomes `null`. A permissions error or a `SyntaxError` from a
 * half-written file is a real failure and still throws — swallowing those
 * would turn a broken deployment into a site full of 404s.
 *
 * @example
 * ```ts
 * const recipe = await readContentFileOrNull({ config, slug });
 * if (!recipe) notFound();
 * ```
 */
export async function readContentFileOrNull<
  TData = Record<string, unknown>,
  TIndexValue = TData,
  TKey extends Key = Key,
>(
  options: ReadContentFileOptions<TData, TIndexValue, TKey>,
): Promise<TData | null> {
  try {
    return await readContentFile<TData, TIndexValue, TKey>(options);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }
}

export default readContentFile;
