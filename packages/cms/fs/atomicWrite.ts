/**
 * Atomic file writes (epic 34, D8).
 *
 * Write `.<name>.<writeId>.<n>.tmp` beside the target, then `rename` it over
 * the target, so a reader (the export build, a `git add`, another process)
 * sees the old file or the new one and never half of either, and a write that
 * dies part-way leaves the target as it was. The temp file is removed on
 * failure; one a killed process leaves behind is never committed (`commit.ts`
 * excludes `.*.tmp`) and is swept by the next lock holder once it is older
 * than the lock's stale age (`writeLock.ts`). Renaming also never writes
 * *into* an existing inode — which, for a file git-annex hard-linked into its
 * object store, would corrupt the object — and the replaced file's mode is
 * kept.
 *
 * The write id is the enclosing write lock's (`currentWriteId`), else a fresh
 * one, so a stray temp file names the write that left it; `<n>` keeps two
 * temp files of one write apart.
 */
import { createWriteStream } from "node:fs";
import { chmod, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { currentWriteId } from "../git/writeLock";
import { ulid } from "../util/ulid";

/** Bytes of the target's name kept in the temp name: 255 minus the rest. */
const MAX_NAME_BYTES = 200;
let counter = 0;

function truncateBytes(name: string, max: number): string {
  /* By code point, so a multi-byte character is never cut in half. */
  const chars = Array.from(name);
  while (Buffer.byteLength(chars.join("")) > max) chars.pop();
  return chars.join("");
}

export function temporaryPathFor(target: string, writeId?: string): string {
  const id = writeId ?? currentWriteId() ?? ulid();
  counter = (counter + 1) % 1_000_000;
  const name = truncateBytes(basename(target), MAX_NAME_BYTES);
  return join(dirname(target), `.${name}.${id}.${counter}.tmp`);
}

async function replaceWith(
  target: string,
  write: (temporary: string) => Promise<void>,
): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const temporary = temporaryPathFor(target);
  try {
    await write(temporary);
    const existing = await stat(target).catch(() => null);
    if (existing) await chmod(temporary, existing.mode & 0o7777);
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
