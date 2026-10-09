// @vitest-environment node
//
// The repo default is jsdom; these tests open real LMDB environments in a
// temporary directory, which needs node.
//
// Epic 29, 29a: a full rebuild writes the content index in one transaction.
// Before it, `rebuildIndex` dropped the index and then awaited one put per
// item — one synced commit each, and an empty-then-partial index for anyone
// reading in between. These pin both halves: what a reader can see, and how
// many commits the rebuild takes.

import { mkdtemp, outputFile, outputJson, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getContentDatabase } from "@discontent/cms/content/database";
import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import type { ContentTypeConfig } from "@discontent/cms/content/types";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { dumpEnvironments } from "@discontent/cms/lmdb/dumpEnvironments";
import type { PaginationIndexConfig } from "@discontent/cms/pagination/types";

interface Note {
  title: string;
  date: number;
}

type NoteKey = [number, string];

const byDate: PaginationIndexConfig<Note, NoteKey, { slug: string }> = {
  name: "by-date",
  perPage: 5,
  version: "1",
  key: ({ value, id }) => [value.date, id],
  project: ({ id }) => ({ slug: id }),
};

const noteConfig: ContentTypeConfig<Note, Note, NoteKey> = {
  contentType: "notes",
  dataDirectory: "notes/data",
  indexDirectory: "notes/index",
  dataFilename: "note.json",
  buildIndexValue: (data) => ({ title: data.title, date: data.date }),
  buildIndexKey: (slug, data) => [data.date, slug],
  paginationIndexes: [byDate],
};

let contentDirectory: string;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "rebuild-atomic-"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

async function writeNotes(from: number, to: number) {
  for (let index = from; index < to; index += 1) {
    await outputJson(
      join(contentDirectory, "notes/data", `note-${index}`, "note.json"),
      { title: `Note ${index}`, date: 1_000 + index },
    );
  }
}

function contentDb() {
  return getContentDatabase<Note, NoteKey>(noteConfig, contentDirectory);
}

describe("rebuildIndex (29a)", () => {
  it("never shows a reader an empty or partial index", async () => {
    await writeNotes(0, 150);
    await rebuildIndex({ config: noteConfig, contentDirectory });
    expect(contentDb().getCount()).toBe(150);

    await writeNotes(150, 400);
    const seen = new Set<number>();
    let done = false;
    const rebuilt = rebuildIndex({ config: noteConfig, contentDirectory }).then(
      () => {
        done = true;
      },
    );
    /*
     * Poll on every turn of the event loop for as long as the rebuild runs.
     * The old drop-then-put loop yielded between every commit, so this saw 0
     * and then the count climbing.
     */
    while (!done) {
      seen.add(contentDb().getCount());
      await new Promise((resolve) => setImmediate(resolve));
    }
    await rebuilt;
    seen.add(contentDb().getCount());

    expect([...seen].sort((a, b) => a - b)).toEqual(
      seen.size === 1 ? [400] : [150, 400],
    );
  });

  it("skips a malformed data file and indexes the rest", async () => {
    await writeNotes(0, 5);
    await outputFile(
      join(contentDirectory, "notes/data/broken/note.json"),
      "{ not json",
    );
    await rebuildIndex({ config: noteConfig, contentDirectory });

    const slugs = [...contentDb().getKeys()].map((key) => key[1]);
    expect(slugs).toHaveLength(5);
    expect(slugs).not.toContain("broken");
    expect(console.warn).toHaveBeenCalledWith(
      "Failed to read notes at broken, skipping",
    );
  });

  it("empties the index when the data directory is gone", async () => {
    await writeNotes(0, 5);
    await rebuildIndex({ config: noteConfig, contentDirectory });
    expect(contentDb().getCount()).toBe(5);

    await rm(join(contentDirectory, "notes/data"), {
      recursive: true,
      force: true,
    });
    await rebuildIndex({ config: noteConfig, contentDirectory });
    expect(contentDb().getCount()).toBe(0);
  });

  it("commits the content index once per rebuild", async () => {
    await writeNotes(0, 50);
    await rebuildIndex({ config: noteConfig, contentDirectory });

    const db = contentDb();
    /*
     * Writes inside a transaction callback are part of its commit (lmdb-js's
     * `putSync` goes through `put` there), so only the ones made outside it
     * count as commits of their own.
     */
    let inside = 0;
    let transactions = 0;
    let standalone = 0;
    const originalTransaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementation(((
      callback: () => unknown,
    ) => {
      transactions += 1;
      return originalTransaction(() => {
        inside += 1;
        try {
          return callback();
        } finally {
          inside -= 1;
        }
      });
    }) as typeof db.transaction);
    for (const method of ["put", "remove", "drop"] as const) {
      const original = (db[method] as (...args: unknown[]) => unknown).bind(db);
      vi.spyOn(db, method).mockImplementation(((...args: unknown[]) => {
        if (inside === 0) standalone += 1;
        return original(...args);
      }) as never);
    }

    await writeNotes(50, 60);
    await rebuildIndex({ config: noteConfig, contentDirectory });

    expect(transactions).toBe(1);
    expect(standalone).toBe(0);
    expect(db.getCount()).toBe(60);
  });

  it("produces the same logical dump as the rebuild before it", async () => {
    await writeNotes(0, 23);
    await rebuildIndex({ config: noteConfig, contentDirectory });
    const first = await dumpEnvironments(contentDirectory);
    await rebuildIndex({ config: noteConfig, contentDirectory });
    const second = await dumpEnvironments(contentDirectory);

    expect(first.environments).toEqual([
      { environment: "notes/index", entries: 23 },
      /* 23 sorted + 23 paged + 23 lookups + 5 page summaries + META. */
      { environment: "notes/pagination/by-date", entries: 75 },
    ]);
    expect(second.sha256).toBe(first.sha256);
  });
});
