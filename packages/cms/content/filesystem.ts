import { ensureDir, exists, readJson, rename, rm } from "fs-extra";
import { join, parse, relative, resolve, sep } from "path";
import { Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";
import { writeJsonAtomic, writeStreamAtomic } from "../fs/atomicWrite";
import { getContentDirectory } from "../fs/getContentDirectory";
import { UploadImportError } from "./errors";
import type { ContentTypeConfig, FileUploadData, UploadFetch } from "./types";

/**
 * Get the data directory for a content type
 */
export function getDataDirectory(
  config: ContentTypeConfig,
  contentDirectory?: string,
): string {
  const baseDir = contentDirectory || getContentDirectory();
  return resolve(baseDir, config.dataDirectory);
}

/**
 * A slug that cannot name an item: not one path segment, or one that would
 * resolve outside its type's directory (32-close).
 *
 * Slugs reach the engine from decoded route params (`/api/recipe/<slug>`,
 * `/api/taxonomies/tags/<slug>`, …), and Next decodes `%2F`, so `..%2F..%2Fx`
 * arrives as `../../x`. Creates slugify first; reads, updates, image writes and
 * deletes take the slug as given, and the delete path hands the directory to a
 * recursive `rm`.
 *
 * It carries `code: "ENOENT"` on purpose: such a slug names nothing, so the
 * callers that already turn a missing file into "not found"
 * (`readContentFileOrNull`, the curation error mapping, the routes' 404s)
 * answer it the same way, and a refused slug can't be told apart from an
 * absent one.
 */
export class InvalidSlugError extends Error {
  readonly code = "ENOENT";
  constructor(readonly slug: string) {
    super(`Not a valid content slug: ${JSON.stringify(slug)}`);
    this.name = "InvalidSlugError";
  }
}

/**
 * The engine's slug shape: one non-empty path segment. No separator (`/`,
 * `\`), no `%` (a still-encoded param), no control character, and not `.` or
 * `..`. Every slug the engine makes (`@sindresorhus/slugify`) is far narrower;
 * this is only the floor that keeps a slug inside its directory.
 */
// eslint-disable-next-line no-control-regex
const SLUG_FORBIDDEN = /[/\\%\u0000-\u001f\u007f]/;

export function isContentSlug(slug: string): boolean {
  return (
    typeof slug === "string" &&
    slug !== "" &&
    slug !== "." &&
    slug !== ".." &&
    !SLUG_FORBIDDEN.test(slug)
  );
}

/**
 * `base/slug`, or an `InvalidSlugError` when the slug is not one segment or
 * the result would leave `base`. The containment check is belt and braces
 * behind the shape check (an absolute path, say, fails both).
 */
function slugPath(base: string, slug: string): string {
  if (!isContentSlug(slug)) throw new InvalidSlugError(slug);
  const resolved = resolve(base, slug);
  if (!resolved.startsWith(base + sep)) throw new InvalidSlugError(slug);
  return resolved;
}

/**
 * Get the directory for a specific content item
 */
export function getContentItemDirectory(
  config: ContentTypeConfig,
  slug: string,
  contentDirectory?: string,
): string {
  return slugPath(getDataDirectory(config, contentDirectory), slug);
}

/**
 * Get the full path to a content data file
 */
export function getContentFilePath(
  config: ContentTypeConfig,
  slug: string,
  contentDirectory?: string,
): string {
  return join(
    getContentItemDirectory(config, slug, contentDirectory),
    config.dataFilename,
  );
}

/**
 * Get the uploads directory for a content type/slug
 */
export function getUploadsDirectory(
  /*
   * Only `uploadsDirectory` and `contentType` are read, and neither depends on
   * the data generic — but naming the whole `ContentTypeConfig` pinned it to
   * the *default* instantiation, so passing a real typed config
   * (`ContentTypeConfig<Project, …>`) was a type error. Narrowing to what is
   * actually used makes the function usable from the collections it is for.
   */
  config: Pick<ContentTypeConfig, "uploadsDirectory" | "contentType">,
  slug: string,
  contentDirectory?: string,
): string {
  return join(
    getUploadsBaseDirectory(config, slug, contentDirectory),
    "uploads",
  );
}

/**
 * The directory every item's uploads of one type sit under: the declared
 * `uploadsDirectory`, else `uploads/<contentType>`.
 */
export function getTypeUploadsDirectory(
  config: Pick<ContentTypeConfig, "uploadsDirectory" | "contentType">,
  contentDirectory?: string,
): string {
  const baseDir = contentDirectory || getContentDirectory();
  return config.uploadsDirectory
    ? resolve(baseDir, config.uploadsDirectory)
    : resolve(baseDir, "uploads", config.contentType);
}

/**
 * Get the base uploads directory for a content type/slug (parent of uploads)
 */
export function getUploadsBaseDirectory(
  config: Pick<ContentTypeConfig, "uploadsDirectory" | "contentType">,
  slug: string,
  contentDirectory?: string,
): string {
  return slugPath(getTypeUploadsDirectory(config, contentDirectory), slug);
}

/**
 * Get the full path to an uploaded file
 */
export function getUploadFilePath(
  config: ContentTypeConfig,
  slug: string,
  filename: string,
  contentDirectory?: string,
): string {
  return join(getUploadsDirectory(config, slug, contentDirectory), filename);
}

/**
 * Write content data to the filesystem — atomically (epic 34, D8): a temp
 * file renamed over the data file, the same bytes `outputJSON` wrote.
 */
export async function writeContentToFilesystem<TData>(
  config: ContentTypeConfig<TData>,
  slug: string,
  data: TData,
  contentDirectory?: string,
): Promise<string> {
  const baseDir = contentDirectory || getContentDirectory();
  const itemDirectory = getContentItemDirectory(
    config as ContentTypeConfig,
    slug,
    contentDirectory,
  );
  await ensureDir(itemDirectory);
  await writeJsonAtomic(join(itemDirectory, config.dataFilename), data, {
    spaces: 2,
  });
  return relative(baseDir, join(itemDirectory, config.dataFilename));
}

/**
 * Read content data from the filesystem
 */
export async function readContentFromFilesystem<TData>(
  config: ContentTypeConfig<TData>,
  slug: string,
  contentDirectory?: string,
): Promise<TData> {
  const filePath = getContentFilePath(
    config as ContentTypeConfig,
    slug,
    contentDirectory,
  );
  return readJson(filePath, "utf-8");
}

/**
 * Delete content data from the filesystem
 */
export async function deleteContentFromFilesystem(
  config: ContentTypeConfig,
  slug: string,
  contentDirectory?: string,
): Promise<string[]> {
  const baseDir = contentDirectory || getContentDirectory();
  const paths: string[] = [];

  const itemDirectory = getContentItemDirectory(config, slug, contentDirectory);
  if (await exists(itemDirectory)) {
    paths.push(relative(baseDir, itemDirectory));
    await rm(itemDirectory, { recursive: true });
  }

  // Also remove uploads directory if it exists
  const uploadsBase = getUploadsBaseDirectory(config, slug, contentDirectory);
  if (await exists(uploadsBase)) {
    paths.push(relative(baseDir, uploadsBase));
    await rm(uploadsBase, { recursive: true, force: true });
  }

  return paths;
}

/**
 * Rename content directory when slug changes
 */
export async function renameContentDirectory(
  config: ContentTypeConfig,
  oldSlug: string,
  newSlug: string,
  contentDirectory?: string,
): Promise<string[]> {
  const baseDir = contentDirectory || getContentDirectory();
  const paths: string[] = [];

  const oldDir = getContentItemDirectory(config, oldSlug, contentDirectory);
  const newDir = getContentItemDirectory(config, newSlug, contentDirectory);

  if (await exists(oldDir)) {
    paths.push(relative(baseDir, oldDir));
    paths.push(relative(baseDir, newDir));
    await rename(oldDir, newDir);
  }

  // Also rename uploads directory if it exists
  const oldUploadsDir = getUploadsDirectory(config, oldSlug, contentDirectory);
  const newUploadsDir = getUploadsDirectory(config, newSlug, contentDirectory);
  if (await exists(oldUploadsDir)) {
    paths.push(relative(baseDir, oldUploadsDir));
    paths.push(relative(baseDir, newUploadsDir));
    await ensureDir(resolve(newUploadsDir, ".."));
    await rename(oldUploadsDir, newUploadsDir);
  }

  return paths;
}

/**
 * Get upload info from form data. `uploadFetch` is the write's (47b): it
 * rides on an import's `FileUploadData`, so whichever upload processor runs
 * hands it to `writeUploadFile`.
 */
export async function getUploadInfo(
  {
    file,
    clearFile,
    fileImportUrl,
    existingFile,
  }: {
    file?: File;
    clearFile?: boolean;
    fileImportUrl?: string;
    existingFile?: string;
  },
  uploadFetch?: UploadFetch,
): Promise<FileUploadData | undefined> {
  if (file && file.size !== 0) {
    return { fileName: file.name, file };
  }
  if (clearFile) {
    return undefined;
  }
  if (fileImportUrl) {
    const url = new URL(fileImportUrl);
    const basenameWithoutParams = parse(url.pathname).base;
    return {
      fileName: basenameWithoutParams,
      fileImportUrl,
      ...(uploadFetch ? { uploadFetch } : {}),
    };
  }
  if (existingFile) {
    return { fileName: existingFile };
  }
}

/** How long an upload's `fileImportUrl` download may take, body included. */
export const UPLOAD_FETCH_TIMEOUT_MS = 60_000;

/**
 * Write an uploaded file to the filesystem — atomically (epic 34, D8), so a
 * failed or interrupted download leaves the previous file, not a torn one.
 */
export async function writeUploadFile(
  config: ContentTypeConfig,
  slug: string,
  uploadData: FileUploadData,
  contentDirectory?: string,
): Promise<void> {
  const { fileName, file, fileImportUrl } = uploadData;

  if (!file && !fileImportUrl) {
    return;
  }

  const resultPath = getUploadFilePath(
    config,
    slug,
    fileName,
    contentDirectory,
  );

  if (file) {
    await writeStreamAtomic(
      resultPath,
      Readable.fromWeb(file.stream() as ReadableStream),
    );
  } else if (fileImportUrl) {
    const response = await fetchUploadImport(
      fileImportUrl,
      uploadData.uploadFetch,
    );
    /*
     * No body writes an empty file, as the stream opened up front used to.
     * A body that fails after the headers (the deadline, a reset) is the
     * download's failure too, and says so on the form; the atomic write
     * leaves nothing behind.
     */
    try {
      await writeStreamAtomic(
        resultPath,
        response.body
          ? Readable.fromWeb(response.body as ReadableStream)
          : undefined,
      );
    } catch (error) {
      throw new UploadImportError(
        `Could not download ${fileImportUrl}: ${reasonOf(error)}.`,
        fileImportUrl,
        { cause: error },
      );
    }
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * An upload's `fileImportUrl`, downloaded through the write's `uploadFetch`
 * (47b) — never plain `fetch`, which followed redirects anywhere, checked no
 * host and wrote a 404 page as the image. Throws `UploadImportError`, and
 * nothing is written: with no fetcher (the import is refused, failing
 * closed), when the fetcher throws (a guard's refusal keeps its own
 * message), and for an answer that is not a success.
 */
async function fetchUploadImport(
  url: string,
  uploadFetch: UploadFetch | undefined,
): Promise<Response> {
  if (!uploadFetch) {
    throw new UploadImportError(
      `This editor does not import files from a URL; upload the file instead.`,
      url,
    );
  }
  let response: Response;
  try {
    /*
     * Bounded: this runs inside the write lock, whose heartbeat would keep a
     * hung download's lock fresh forever.
     */
    response = await uploadFetch(url, {
      signal: AbortSignal.timeout(UPLOAD_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof UploadImportError) throw error;
    throw new UploadImportError(
      `Could not download ${url}: ${reasonOf(error)}.`,
      url,
      { cause: error },
    );
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    const status = [response.status, response.statusText]
      .filter(Boolean)
      .join(" ");
    throw new UploadImportError(
      `${url} answered ${status}, not the file; nothing was saved.`,
      url,
    );
  }
  return response;
}

/**
 * Remove an old upload file
 */
export async function removeUploadFile(
  config: ContentTypeConfig,
  slug: string,
  filename: string,
  contentDirectory?: string,
): Promise<void> {
  const uploadFilePath = getUploadFilePath(
    config,
    slug,
    filename,
    contentDirectory,
  );
  if (await exists(uploadFilePath)) {
    await rm(uploadFilePath);
  }
}

/**
 * Process upload changes - writes new files and removes old ones.
 *
 * The new file first, then the old one's removal (47b): a refused or failed
 * import (`UploadImportError`) used to find the existing file already
 * deleted, leaving the working tree dirty with no commit to explain it. Same
 * name as before: the atomic write replaced it, so there is nothing to
 * remove.
 */
export async function processUploadChanges(
  config: ContentTypeConfig,
  slug: string,
  uploadData: FileUploadData | undefined,
  existingFile: string | undefined,
  contentDirectory?: string,
): Promise<string[]> {
  const baseDir = contentDirectory || getContentDirectory();
  const paths: string[] = [];

  const replacesExisting =
    existingFile !== undefined &&
    (uploadData === undefined ||
      Boolean(uploadData.file) ||
      Boolean(uploadData.fileImportUrl));
  const existingPath =
    existingFile === undefined
      ? undefined
      : getUploadFilePath(config, slug, existingFile, contentDirectory);
  if (replacesExisting && existingPath) {
    paths.push(relative(baseDir, existingPath));
  }

  // Write new file if provided
  let newPath: string | undefined;
  if (uploadData) {
    newPath = getUploadFilePath(
      config,
      slug,
      uploadData.fileName,
      contentDirectory,
    );
    paths.push(relative(baseDir, newPath));
    await writeUploadFile(config, slug, uploadData, contentDirectory);
  }

  // Then delete the file it replaced
  if (replacesExisting && existingFile !== undefined && existingPath !== newPath) {
    await removeUploadFile(config, slug, existingFile, contentDirectory);
  }

  return paths;
}
