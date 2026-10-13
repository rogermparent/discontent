/**
 * Atomic file writes (epic 34, D8).
 *
 * Write `.<name>.<writeId>.tmp` beside the target, then `rename` it over the
 * target, so a reader (the export build, a `git add`, another process) sees
 * the old file or the new one and never half of either, and a write that
 * dies part-way leaves the target as it was. The temp file is removed on
 * failure. Renaming also never writes *into* an existing inode — which, for a
 * file git-annex hard-linked into its object store, would corrupt the object.
 *
 * The write id is the enclosing write lock's (`currentWriteId`), else a fresh
 * one, so a stray temp file names the write that left it.
 */
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { currentWriteId } from "../git/writeLock";
import { ulid } from "../util/ulid";

export function temporaryPathFor(target: string, writeId?: string): string {
  const id = writeId ?? currentWriteId() ?? ulid();
  return join(dirname(target), `.${basename(target)}.${id}.tmp`);
}

async function replaceWith(
  target: string,
  write: (temporary: string) => Promise<void>,
): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const temporary = temporaryPathFor(target);
  try {
    await write(temporary);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** `writeFile`, atomically. Creates the parent directory. */
export function writeFileAtomic(
  target: string,
  data: string | Uint8Array,
): Promise<void> {
  return replaceWith(target, (temporary) => writeFile(temporary, data));
}

/** `JSON.stringify(data, null, spaces)` plus a newline — `outputJSON`'s bytes. */
export function writeJsonAtomic(
  target: string,
  data: unknown,
  { spaces }: { spaces?: number } = {},
): Promise<void> {
  return writeFileAtomic(target, `${JSON.stringify(data, null, spaces)}\n`);
}

/** Stream `source` into `target`, atomically; no source writes an empty file. */
export function writeStreamAtomic(
  target: string,
  source: Readable | undefined,
): Promise<void> {
  return replaceWith(target, (temporary) =>
    source
      ? pipeline(source, createWriteStream(temporary))
      : writeFile(temporary, ""),
  );
}
