import { createWriteStream } from "fs";
import { ensureDir, exists, outputJSON, readJson, rename, rm } from "fs-extra";
import { join, parse, relative, resolve } from "path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ReadableStream } from "node:stream/web";
import { getContentDirectory } from "../fs/getContentDirectory";
import type { ContentTypeConfig, FileUploadData } from "./types";

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
 * Get the directory for a specific content item
 */
export function getContentItemDirectory(
  config: ContentTypeConfig,
  slug: string,
  contentDirectory?: string,
): string {
  return resolve(getDataDirectory(config, contentDirectory), slug);
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
  const baseDir = contentDirectory || getContentDirectory();
  if (!config.uploadsDirectory) {
    return join(baseDir, "uploads", config.contentType, slug, "uploads");
  }
  return join(baseDir, config.uploadsDirectory, slug, "uploads");
}

/**
 * Get the base uploads directory for a content type/slug (parent of uploads)
 */
export function getUploadsBaseDirectory(
  config: ContentTypeConfig,
  slug: string,
  contentDirectory?: string,
): string {
  const baseDir = contentDirectory || getContentDirectory();
  if (!config.uploadsDirectory) {
    return join(baseDir, "uploads", config.contentType, slug);
  }
  return join(baseDir, config.uploadsDirectory, slug);
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
 * Write content data to the filesystem
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
  await outputJSON(join(itemDirectory, config.dataFilename), data, {
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
 * Get upload info from form data
 */
export async function getUploadInfo({
  file,
  clearFile,
  fileImportUrl,
  existingFile,
}: {
  file?: File;
  clearFile?: boolean;
  fileImportUrl?: string;
  existingFile?: string;
}): Promise<FileUploadData | undefined> {
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
    };
  }
  if (existingFile) {
    return { fileName: existingFile };
  }
}

/**
 * Write an uploaded file to the filesystem
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
  const { dir } = parse(resultPath);
  await ensureDir(dir);

  const fileWriteStream = createWriteStream(resultPath);
  if (file) {
    const readStream = Readable.fromWeb(file.stream() as ReadableStream);
    await pipeline(readStream, fileWriteStream);
  } else if (fileImportUrl) {
    const importedFileData = await fetch(fileImportUrl);
    if (importedFileData.body) {
      await pipeline(
        Readable.fromWeb(importedFileData.body as ReadableStream),
        fileWriteStream,
      );
    }
  }
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
 * Process upload changes - removes old files and writes new ones
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

  // Check if file should be deleted
  if (
    existingFile !== undefined &&
    (uploadData === undefined || uploadData.file || uploadData.fileImportUrl)
  ) {
    paths.push(
      relative(
        baseDir,
        getUploadFilePath(config, slug, existingFile, contentDirectory),
      ),
    );
    await removeUploadFile(config, slug, existingFile, contentDirectory);
  }

  // Write new file if provided
  if (uploadData) {
    paths.push(
      relative(
        baseDir,
        getUploadFilePath(config, slug, uploadData.fileName, contentDirectory),
      ),
    );
    await writeUploadFile(config, slug, uploadData, contentDirectory);
  }

  return paths;
}
