/**
 * A photo import's pictures in the job store (38e, D5): `<jobs dir>/photos/`.
 *
 * - **Stored at enqueue time**, before the job starts, named by their
 *   content (`<sha256>.<ext>`): the spec names them by that relative path,
 *   never by their bytes — the meta stays small and JSON, and Retry (which
 *   replays the spec) reads the same files. The same photo sent twice — a
 *   `--pick` after a several-recipe refusal — is one file.
 * - **The transcription** is kept beside them, `<set>.transcript.json`
 *   (`<set>` hashes the photo paths in order), with the model and prompt
 *   that made it: a person debugging a reading sees what the model saw, and
 *   a Retry or a `--pick` of the same photos with the same model reuses it
 *   rather than reading the photos again.
 * - **Pruned with the jobs** (`prunePhotos`, called by `pruneJobs`): a
 *   photo — or a transcript — that no remaining job's spec names, once
 *   older than an hour (a photo just stored has no job yet).
 *
 * Paths read back are checked against `PHOTO_PATH` — a spec is JSON from
 * the store, and a retried one must not name a file outside it.
 */
import { createHash } from "node:crypto";
import { readFile, readdir, rm, stat, utimes } from "node:fs/promises";
import path from "node:path";
import {
  writeFileAtomic,
  writeJsonAtomic,
} from "@discontent/cms/fs/atomicWrite";
import { ValidationError } from "../curation/errors";
import type { PhotoBytes } from "../llm/vision";
import { MAX_PHOTOS } from "../photoLimits";

/** The directory the photos live in, inside the job store. */
export const PHOTOS_DIR = "photos";

/** A photo's path in a spec: `photos/<sha256, 32 hex>.<ext>`. */
export const PHOTO_PATH = /^photos\/[0-9a-f]{32}\.[a-z0-9]{2,5}$/;

/** How long an unreferenced photo is kept: its job may not exist yet. */
export const PHOTO_GRACE_MS = 60 * 60 * 1000;

/** A stored photo, as a spec names it. */
export interface StoredPhoto {
  /** Relative to the jobs directory: `photos/<sha>.<ext>`. */
  path: string;
  /** The name it arrived with: what a person and the job's label see. */
  name: string;
  type: string;
  bytes: number;
}

function sha(bytes: Buffer | string, length = 32): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, length);
}

function extension(name: string, type: string): string {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase();
  if (fromName) return fromName === "jpeg" ? "jpg" : fromName;
  const fromType = /^image\/([a-z0-9]+)/i.exec(type)?.[1]?.toLowerCase();
  if (fromType === "jpeg") return "jpg";
  /* `PHOTO_PATH`'s 2–5 characters: `image/x-…` gives "x", which is none. */
  return fromType && fromType.length >= 2 && fromType.length <= 5
    ? fromType
    : "img";
}

/**
 * Check and store the photos of one import (`checkImageFile`: an image,
 * not empty, at most 15 MB; at most `MAX_PHOTOS`; no HEIC), in order.
 * Answers what the spec names. Throws `ValidationError`.
 */
export async function storePhotos(
  dir: string,
  files: readonly File[],
): Promise<StoredPhoto[]> {
  if (files.length === 0) {
    throw new ValidationError("No photos given: add a photo of the recipe.");
  }
  if (files.length > MAX_PHOTOS) {
    throw new ValidationError(
      `${files.length} photos given; a photo import takes at most ${MAX_PHOTOS} (the pages of one card, in order).`,
    );
  }
  /* Loaded here, not with the store (which `pruneJobs` loads). */
  const { checkImageFile } = await import("../imageImport");
  const { checkPhotoFormat } = await import("../llm/vision");
  const checked = files.map((file) => {
    const safe = checkImageFile(file);
    checkPhotoFormat({ type: file.type, name: file.name || safe.name });
    return { file, safe };
  });
  const stored: StoredPhoto[] = [];
  for (const { file, safe } of checked) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = (file.type || safe.type || "").split(";")[0].trim();
    const relative = `${PHOTOS_DIR}/${sha(bytes)}.${extension(safe.name, type)}`;
    const target = path.join(dir, relative);
    /* Content-named: a file already there is this photo — touched, so the
     * prune's grace starts again for the job about to name it. */
    const there = await stat(target).catch(() => null);
    if (!there || there.size !== bytes.length) {
      await writeFileAtomic(target, bytes);
    } else {
      const now = new Date();
      await utimes(target, now, now).catch(() => undefined);
    }
    stored.push({
      path: relative,
      name: file.name || safe.name,
      type,
      bytes: bytes.length,
    });
  }
  return stored;
}

/** A spec's photo path, checked: a retried spec names nothing outside the store. */
function photoFile(dir: string, relative: string): string {
  if (typeof relative !== "string" || !PHOTO_PATH.test(relative)) {
    throw new ValidationError(
      `"${String(relative)}" is not a stored photo's path.`,
    );
  }
  return path.join(dir, relative);
}

/**
 * The stored photos' bytes, in order. A photo pruned since (a Retry of a
 * job past its retention) is a `ValidationError` that says so.
 */
export async function readStoredPhotos(
  dir: string,
  photos: readonly StoredPhoto[],
): Promise<PhotoBytes[]> {
  return Promise.all(
    photos.map(async (photo) => {
      const file = photoFile(dir, photo.path);
      let bytes: Buffer;
      try {
        bytes = await readFile(file);
      } catch {
        throw new ValidationError(
          `The photo ${photo.name} (${photo.path}) is no longer in the job store — it was pruned; import the photo again.`,
        );
      }
      return { bytes, type: photo.type, name: photo.name };
    }),
  );
}

/**
 * A stored photo as a recipe's image (`photoAsImage`): turned upright,
 * fitted inside `PHOTO_IMAGE_MAX_SIDE` (2000 px) and re-encoded as a JPEG
 * (`photoForImage`) — not the phone's original, which may be 10 MB and
 * sideways — named as the photo was, `.jpg`.
 */
export async function storedPhotoImage(
  dir: string,
  photo: StoredPhoto,
): Promise<File> {
  const [read] = await readStoredPhotos(dir, [photo]);
  const { photoForImage } = await import("../llm/photoPrep");
  let bytes: Buffer;
  try {
    bytes = await photoForImage(read.bytes);
  } catch (error) {
    throw new ValidationError(
      `${photo.name} could not be converted for the recipe's image: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const base = path.basename(photo.name).replace(/\.[^.]*$/, "") || "photo";
  const { checkImageFile } = await import("../imageImport");
  return checkImageFile(
    new File([new Uint8Array(bytes)], `${base}.jpg`, { type: "image/jpeg" }),
  );
}

/** The key of one ordered set of photos: its transcript's name. */
export function photoSetKey(photos: readonly Pick<StoredPhoto, "path">[]) {
  return sha(photos.map((photo) => photo.path).join("\n"));
}

function transcriptFile(
  dir: string,
  photos: readonly Pick<StoredPhoto, "path">[],
): string {
  for (const photo of photos) photoFile(dir, photo.path);
  return path.join(dir, PHOTOS_DIR, `${photoSetKey(photos)}.transcript.json`);
}

/** A transcript as kept. */
export interface KeptTranscript {
  text: string;
  /** The vision model that read it. */
  model: string;
  /** Its Ollama digest then (39a; also folded into `prompt`). */
  digest?: string;
  /** `transcribeKey()` when it was read: another prompt reads again. */
  prompt: string;
  /** The job that read it. */
  job?: string;
  savedAt: number;
}

/** Keep a set's transcription beside its photos (best effort). */
export async function saveTranscript(
  dir: string,
  photos: readonly Pick<StoredPhoto, "path">[],
  transcript: Omit<KeptTranscript, "savedAt">,
): Promise<void> {
  try {
    await writeJsonAtomic(transcriptFile(dir, photos), {
      ...transcript,
      savedAt: Date.now(),
    });
  } catch {
    /* A store that cannot be written: the next run reads the photos again. */
  }
}

/** The set's kept transcription, when the same model and prompt made it. */
export async function loadTranscript(
  dir: string,
  photos: readonly Pick<StoredPhoto, "path">[],
  { model, prompt }: { model: string; prompt: string },
): Promise<KeptTranscript | undefined> {
  let kept: Partial<KeptTranscript>;
  try {
    kept = JSON.parse(await readFile(transcriptFile(dir, photos), "utf8"));
  } catch {
    return undefined;
  }
  if (
    !kept ||
    typeof kept.text !== "string" ||
    !kept.text ||
    kept.model !== model ||
    kept.prompt !== prompt ||
    typeof kept.savedAt !== "number"
  ) {
    return undefined;
  }
  return kept as KeptTranscript;
}

/** A spec's photos, if it has any: what a remaining job keeps. */
export function specPhotos(spec: unknown): StoredPhoto[] {
  const photos = (spec as { photos?: unknown } | undefined)?.photos;
  return Array.isArray(photos)
    ? photos.filter(
        (photo): photo is StoredPhoto =>
          !!photo && typeof (photo as StoredPhoto).path === "string",
      )
    : [];
}

/**
 * Remove photos and transcripts no remaining job names, once older than
 * `graceMs` (`pruneJobs` calls this after it has pruned the jobs, with the
 * specs of those that remain). Answers how many files it removed.
 */
export async function prunePhotos(
  dir: string,
  specs: readonly unknown[],
  {
    now = Date.now(),
    graceMs = PHOTO_GRACE_MS,
  }: { now?: number; graceMs?: number } = {},
): Promise<number> {
  const folder = path.join(dir, PHOTOS_DIR);
  const names = await readdir(folder).catch(() => [] as string[]);
  if (names.length === 0) return 0;
  const kept = new Set<string>();
  for (const spec of specs) {
    const photos = specPhotos(spec);
    if (photos.length === 0) continue;
    for (const photo of photos) kept.add(path.basename(photo.path));
    kept.add(`${photoSetKey(photos)}.transcript.json`);
  }
  let removed = 0;
  for (const name of names) {
    if (kept.has(name)) continue;
    const file = path.join(folder, name);
    const info = await stat(file).catch(() => null);
    if (info && now - info.mtimeMs > graceMs) {
      await rm(file, { force: true });
      removed += 1;
    }
  }
  return removed;
}
