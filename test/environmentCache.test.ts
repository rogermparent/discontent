// @vitest-environment node
//
// The repo default is jsdom; these tests open real LMDB environments in a
// temporary directory, which needs node.

import { renameSync } from "fs";
import { mkdtemp, rm } from "fs-extra";
import { open } from "lmdb";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getContentDatabase } from "@discontent/cms/content/database";
import { readContentIndex } from "@discontent/cms/content/readContentIndex";
import type { ContentTypeConfig } from "@discontent/cms/content/types";
import {
  closeCachedEnvironments,
  openCachedEnvironment,
} from "@discontent/cms/lmdb/environmentCache";

/*
 * F24. `openCachedEnvironment` used to close a cached environment the moment
 * `data.mdb` changed identity, on the reasoning that nothing could still be
 * reading a file that no longer exists. A reader that acquired the handle
 * before the swap can be: it holds a mapping, and an unlinked file stays
 * readable through one. `readContentIndex` acquires at :41 and uses the handle
 * again after an await, so a second request arriving inside that yield closed
 * the environment out from under the first.
 *
 * LMDB fails it two ways. The survivable one throws `Can not read from a
 * closed database`, which is the 500 the production gate saw. The other
 * abandons a read transaction, and its reset timer throws from `processTimers`
 * where no request-scoped catch can reach it — an uncatchable crash.
 *
 * The grace period is what these tests pin, from both ends: a retired
 * environment must outlive its readers, *and* it must still be closed.
 */

interface Note {
  title: string;
  date: number;
}

type NoteKey = [number, string];

const noteConfig: ContentTypeConfig<Note, Note, NoteKey> = {
  contentType: "notes",
  dataDirectory: "notes/data",
  indexDirectory: "notes/index",
  dataFilename: "note.json",
  buildIndexValue: (data) => ({ title: data.title, date: data.date }),
  buildIndexKey: (slug, data) => [data.date, slug],
};

let contentDirectory: string;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "environment-cache-"));
});

afterEach(async () => {
  vi.useRealTimers();
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

/** `n` notes, one day apart, through the cached environment. */
async function seed(n: number) {
  const db = getContentDatabase<Note, NoteKey>(noteConfig, contentDirectory);
  for (let index = 0; index < n; index += 1) {
    const note = { title: `Note ${index}`, date: 86_400_000 * (100 + index) };
    await db.put(noteConfig.buildIndexKey(`note-${index}`, note), note);
  }
}

const indexPath = () => join(contentDirectory, noteConfig.indexDirectory);

/**
 * A `data.mdb` from a different, valid environment, ready to be renamed into
 * place.
 *
 * Built ahead of time so the swap itself is one synchronous `rename`. Deleting
 * the directory instead is what a content sync really does, but a recursive
 * remove races the environment that is still mapped there — it loses to LMDB
 * recreating `lock.mdb` and fails `ENOTEMPTY`, which is a property of the test,
 * not of the cache. A rename changes the inode just as thoroughly.
 */
async function prepareReplacement(): Promise<string> {
  const scratch = await mkdtemp(join(tmpdir(), "environment-cache-swap-"));
  const fresh = open({ path: join(scratch, "env") });
  await fresh.put("seeded", true);
  await fresh.close();
  return join(scratch, "env", "data.mdb");
}

/**
 * Give the index a different `data.mdb`, the way a content sync or a Playwright
 * fixture swap does: same path, new inode, so the next `openCachedEnvironment`
 * sees a signature that does not match.
 */
function swapIndexFile(replacement: string) {
  renameSync(replacement, join(indexPath(), "data.mdb"));
}

/** Is this handle still usable, or has it been closed underneath us? */
function isOpen(db: { getCount: () => number }): boolean {
  try {
    db.getCount();
    return true;
  } catch {
    return false;
  }
}

describe("openCachedEnvironment across a content-directory swap", () => {
  it("leaves a handle acquired before the swap readable after it", async () => {
    const replacement = await prepareReplacement();
    await seed(3);
    const held = getContentDatabase<Note, NoteKey>(
      noteConfig,
      contentDirectory,
    );

    swapIndexFile(replacement);
    // The second request. This is what used to close `held`.
    const reopened = getContentDatabase<Note, NoteKey>(
      noteConfig,
      contentDirectory,
    );
    expect(reopened).not.toBe(held);

    expect(() => held.getCount()).not.toThrow();
    expect(held.getCount()).toBe(3);
  });

  it("survives a swap wedged into a read that has already started", async () => {
    const replacement = await prepareReplacement();
    await seed(5);

    /*
     * The F24 window itself, driven from inside the read: the swap and the
     * second request land while `readContentIndex`'s range iteration is in
     * flight, which is the only place a test can stand in for two overlapping
     * requests without a server.
     */
    let swapped = false;
    const result = await readContentIndex<Note, NoteKey>({
      config: noteConfig,
      contentDirectory,
      map: ({ key, value }) => {
        if (!swapped) {
          swapped = true;
          swapIndexFile(replacement);
          getContentDatabase<Note, NoteKey>(noteConfig, contentDirectory);
        }
        return { key, value };
      },
    });

    expect(result.entries).toHaveLength(5);
    expect(result.total).toBe(5);
  });

  it("closes the retired environment once the grace period elapses", async () => {
    const replacement = await prepareReplacement();
    await seed(1);
    vi.useFakeTimers();
    const held = getContentDatabase<Note, NoteKey>(
      noteConfig,
      contentDirectory,
    );

    swapIndexFile(replacement);
    getContentDatabase<Note, NoteKey>(noteConfig, contentDirectory);
    expect(isOpen(held)).toBe(true);

    /*
     * The other half of the fix. A retirement that never ended in a close
     * would spend a mapping per fixture swap, and the three Playwright
     * harnesses swap on every test against a 1024-descriptor default.
     */
    await vi.advanceTimersByTimeAsync(10_000);
    expect(isOpen(held)).toBe(false);
  });

  it("drains retired environments on closeCachedEnvironments", async () => {
    const replacement = await prepareReplacement();
    await seed(1);
    vi.useFakeTimers();
    const retired = getContentDatabase<Note, NoteKey>(
      noteConfig,
      contentDirectory,
    );

    swapIndexFile(replacement);
    const current = getContentDatabase<Note, NoteKey>(
      noteConfig,
      contentDirectory,
    );
    expect(isOpen(retired)).toBe(true);

    await closeCachedEnvironments();

    expect(isOpen(retired)).toBe(false);
    expect(isOpen(current)).toBe(false);

    // And the timer that is now pointing at an already-closed environment must
    // not double-close it or throw when it fires.
    await expect(vi.advanceTimersByTimeAsync(10_000)).resolves.not.toThrow();
  });

  it("hands back one environment per path while the file is unchanged", async () => {
    await seed(1);
    const first = openCachedEnvironment(
      join(contentDirectory, noteConfig.indexDirectory),
    );
    const second = openCachedEnvironment(
      join(contentDirectory, noteConfig.indexDirectory),
    );
    expect(second).toBe(first);
  });
});
