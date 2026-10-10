/**
 * Download an image to import, checked, as a `File` (26a).
 *
 * The engine can fetch an upload itself (`fileImportUrl`, in
 * `packages/cms/content/filesystem.ts`), but it writes whatever comes back: an
 * HTML error page, a 403 body, a 40 MB original — under the URL's last path
 * segment, which on Cloudinary-style URLs has no extension at all (25e's T9).
 * Fetching here instead, and handing the engine a `File`, gets a status check,
 * a type check, a size cap and a real filename without touching the engine or
 * the other sites built on it.
 *
 * Node-safe (D8): the curation layer and the form's server action both call it.
 */
import {
  RECIPE_FETCH_HEADERS,
  fetchRetrying403,
  type ForbiddenRetry,
} from "recipe-website-common/util/importRecipeData";
import { openAsBlob } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { ImportError, ValidationError } from "./curation/errors";

/** Generous for a photo; small enough that a mistaken video URL fails fast. */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/**
 * Above this an image is stored, with a warning (epic 31, 30-T7): a 9.7 MB
 * photo went in unnoticed in 30d. Every page that shows it pays for it.
 */
export const LARGE_IMAGE_BYTES = 2 * 1024 * 1024;

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The warning for an image of `bytes`, or `undefined` when it is small. */
export function largeImageWarning(
  bytes: number | undefined,
  url?: string,
): string | undefined {
  if (bytes === undefined || !(bytes > LARGE_IMAGE_BYTES)) return undefined;
  return `Image ${url ? `${url} ` : ""}is ${megabytes(bytes)}, over ${megabytes(LARGE_IMAGE_BYTES)} — a smaller candidate would load faster`;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/pjpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
};

const IMAGE_EXTENSION =
  /\.(jpe?g|png|webp|gif|avif|svg|bmp|tiff?|heic|heif|ico)$/i;

/** The media type without parameters, lower-cased: `image/jpeg`. */
function mediaType(response: Response): string {
  return (response.headers?.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

/**
 * A safe, readable filename for an image URL.
 *
 * The last path segment, decoded. An encoded `%2F` — Cloudinary packs a whole
 * asset path into one segment (`k%2FPhoto%2FRecipes%2F…%2Fbloody-mary-441_1`)
 * — is a directory separator inside that segment, so only what follows the
 * last one is kept, the same name 25e stored by hand. Anything outside
 * `[\w.-]` becomes `-`, and the extension for `contentType` is appended when
 * the name has no image extension of its own.
 */
export function imageFilename(url: string, contentType?: string): string {
  let segment = "";
  try {
    segment = new URL(url).pathname.split("/").pop() ?? "";
  } catch {
    segment = "";
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    decoded = segment;
  }
  const base = decoded.split(/[/\\]/).pop() ?? "";
  let name = base
    .replace(/[^\w.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/-+\./g, ".")
    .replace(/^[-.]+|-+$/g, "");
  if (!name) name = "image";
  const extension = contentType ? EXTENSIONS[contentType] : undefined;
  if (!IMAGE_EXTENSION.test(name) && extension) {
    name = `${name}${extension}`;
  }
  return name;
}

/**
 * Whether a response is an image.
 *
 * `image/*` is the rule. A server that labels nothing — or labels everything
 * `application/octet-stream`, as some static hosts do — is accepted only when
 * the URL itself names an image file.
 */
function isImageResponse(type: string, url: string): boolean {
  if (type.startsWith("image/")) return true;
  if (type === "" || type === "application/octet-stream") {
    try {
      return IMAGE_EXTENSION.test(new URL(url).pathname);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Plain first, as a browser only after a 403 — the page fetch's order (T10),
 * and its wait before the retry (`ForbiddenRetry`, epic 31 D3).
 */
function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  retry?: ForbiddenRetry,
): Promise<Response> {
  return fetchRetrying403(
    url,
    init,
    { ...RECIPE_FETCH_HEADERS, accept: "image/*,*/*;q=0.8" },
    retry,
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Fetch `url` as an image `File`, or throw `ImportError` (`import_failed`).
 * A file over `LARGE_IMAGE_BYTES` is returned all the same; the caller reports
 * `largeImageWarning(file.size)`.
 */
export async function fetchImageFile(
  url: string,
  { retry }: { retry?: ForbiddenRetry } = {},
): Promise<File> {
  try {
    new URL(url);
  } catch {
    throw new ImportError(`Not an image URL: ${url}`);
  }

  let response: Response;
  try {
    response = await fetchWithRetry(url, {}, retry);
  } catch (error) {
    throw new ImportError(`Could not fetch image ${url}: ${describe(error)}`);
  }
  const status = response.status ?? 200;
  if (status < 200 || status >= 300) {
    throw new ImportError(`Image ${url} answered HTTP ${status}`);
  }
  const type = mediaType(response);
  if (!isImageResponse(type, url)) {
    throw new ImportError(
      `${url} is not an image (content-type ${type || "missing"})`,
    );
  }
  const declared = Number(response.headers?.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    throw new ImportError(
      `Image ${url} is ${declared} bytes, over the ${MAX_IMAGE_BYTES}-byte cap`,
    );
  }

  /* Read with a running count: a missing or lying content-length must not
   * let an unbounded body through. */
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new ImportError(
          `Image ${url} is over the ${MAX_IMAGE_BYTES}-byte cap`,
        );
      }
      chunks.push(value);
    }
  }
  if (total === 0) {
    throw new ImportError(`Image ${url} is empty`);
  }

  return new File(chunks as BlobPart[], imageFilename(url, type), {
    type: type.startsWith("image/") ? type : "",
  });
}

export interface ImageProbe {
  importUrl: string;
  /** The name `fetchImageFile` would store it under. */
  filename: string;
  status?: number;
  contentType?: string;
  /** The declared `content-length`, when the server sends one. */
  bytes?: number;
  /** Why a real write would refuse it, when the probe can already tell. */
  error?: string;
  /** A real write would store it, but it is over `LARGE_IMAGE_BYTES`. */
  warning?: string;
}

/**
 * What `fetchImageFile` would do, from a `HEAD` request: the filename it would
 * store and any refusal it can predict. Never throws, never downloads — a dry
 * run reports, it does not fail.
 *
 * A server that refuses `HEAD` (405, 501) is reported with the URL-derived
 * name and no error: the real `GET` may well succeed.
 */
export async function probeImageFile(
  url: string,
  retry?: ForbiddenRetry,
): Promise<ImageProbe> {
  let response: Response;
  try {
    response = await fetchWithRetry(url, { method: "HEAD" }, retry);
  } catch (error) {
    return {
      importUrl: url,
      filename: imageFilename(url),
      error: `Could not reach image: ${describe(error)}`,
    };
  }
  const status = response.status ?? 200;
  const type = mediaType(response);
  const length = response.headers?.get("content-length");
  const declared = length ? Number(length) : NaN;
  const probe: ImageProbe = {
    importUrl: url,
    filename: imageFilename(url, type),
    status,
    ...(type ? { contentType: type } : {}),
    ...(Number.isFinite(declared) ? { bytes: declared } : {}),
  };
  if (status === 405 || status === 501) return probe;
  if (status < 200 || status >= 300) {
    return { ...probe, error: `Image answered HTTP ${status}` };
  }
  if (!isImageResponse(type, url)) {
    return {
      ...probe,
      error: `Not an image (content-type ${type || "missing"})`,
    };
  }
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    return { ...probe, error: `Over the ${MAX_IMAGE_BYTES}-byte cap` };
  }
  const warning = largeImageWarning(probe.bytes);
  return warning ? { ...probe, warning } : probe;
}

/** Extension → media type, the inverse of `EXTENSIONS`, for local files. */
const TYPES_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  ico: "image/x-icon",
};

function typeForName(name: string): string | undefined {
  return TYPES_BY_EXTENSION[name.split(".").pop()?.toLowerCase() ?? ""];
}

/**
 * The checks `fetchImageFile` makes, for a `File` that arrived some other way
 * (26b): a multipart upload, or a local path read by `readImageFile`. Returns
 * the file renamed to a safe name, or throws `ValidationError`.
 */
export function checkImageFile(file: File): File {
  const type = file.type.split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/") && !IMAGE_EXTENSION.test(file.name)) {
    throw new ValidationError(
      `${file.name || "The upload"} is not an image (type ${type || "missing"}).`,
    );
  }
  if (file.size === 0) {
    throw new ValidationError(`${file.name || "The upload"} is empty.`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ValidationError(
      `${file.name} is ${file.size} bytes, over the ${MAX_IMAGE_BYTES}-byte cap.`,
    );
  }
  const name = imageFilename(
    `file:///${encodeURIComponent(file.name)}`,
    type || typeForName(file.name),
  );
  return name === file.name
    ? file
    : new File([file], name, { type: file.type || typeForName(name) || "" });
}

/**
 * A local image file as a `File` (26b): the CLI's `image --file` and the MCP
 * tool's `path`. Only image extensions are read — the MCP tool runs wherever
 * the server does, and a path seat that would read any file is not one to
 * pre-approve.
 */
export async function readImageFile(filePath: string): Promise<File> {
  const name = path.basename(filePath);
  if (!IMAGE_EXTENSION.test(name)) {
    throw new ValidationError(`${filePath} does not name an image file.`);
  }
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch (error) {
    throw new ValidationError(
      `Could not read ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (size > MAX_IMAGE_BYTES) {
    throw new ValidationError(
      `${filePath} is ${size} bytes, over the ${MAX_IMAGE_BYTES}-byte cap.`,
    );
  }
  const blob = await openAsBlob(filePath, { type: typeForName(name) });
  return checkImageFile(new File([blob], name, { type: blob.type }));
}
