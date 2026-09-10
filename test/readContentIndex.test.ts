// @vitest-environment node
//
// The repo default is jsdom; these tests open a real LMDB environment in a
// temporary directory, which needs node.

import { mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getContentDatabase } from "@discontent/cms/content/database";
import { readContentIndex } from "@discontent/cms/content/readContentIndex";
import type { ContentTypeConfig } from "@discontent/cms/content/types";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

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

const DAY = 86_400_000;
const day = (n: number) => n * DAY;

let contentDirectory: string;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "read-content-index-"));
});

afterEach(async () => {
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

/** `n` notes, one day apart, oldest first: note-0 … note-(n-1). */
async function seed(n: number) {
  const db = getContentDatabase<Note, NoteKey>(noteConfig, contentDirectory);
  for (let index = 0; index < n; index += 1) {
    const note = { title: `Note ${index}`, date: day(100 + index) };
    await db.put(noteConfig.buildIndexKey(`note-${index}`, note), note);
  }
}

function read(options: { limit?: number; offset?: number } = {}) {
  return readContentIndex<Note, NoteKey>({
    config: noteConfig,
    contentDirectory,
    ...options,
  });
}

describe("readContentIndex's `more`", () => {
  /*
   * The F2 case. `more` used to add the *requested* limit rather than the
   * number of entries returned, so an unlimited read computed `0 < total` and
   * claimed there was more of a corpus it had just returned in full.
   */
  it("is false for an unlimited read, which returns everything", async () => {
    await seed(5);
    const { entries, total, more } = await read();
    expect(entries).toHaveLength(5);
    expect(total).toBe(5);
    expect(more).toBe(false);
  });

  it("is false for an empty corpus", async () => {
    const { entries, total, more } = await read();
    expect(entries).toHaveLength(0);
    expect(total).toBe(0);
    expect(more).toBe(false);
  });

  it("is true when a limit leaves entries behind", async () => {
    await seed(5);
    const { entries, more } = await read({ limit: 3 });
    expect(entries).toHaveLength(3);
    expect(more).toBe(true);
  });

  it("is false when a limit exactly covers the corpus", async () => {
    await seed(3);
    expect((await read({ limit: 3 })).more).toBe(false);
  });

  /* A limit larger than the corpus returns fewer entries than it asked for. */
  it("is false when a limit overshoots the corpus", async () => {
    await seed(3);
    const { entries, more } = await read({ limit: 10 });
    expect(entries).toHaveLength(3);
    expect(more).toBe(false);
  });

  it("accounts for the offset", async () => {
    await seed(5);
    expect((await read({ offset: 2, limit: 2 })).more).toBe(true);
    expect((await read({ offset: 3, limit: 2 })).more).toBe(false);
    expect((await read({ offset: 3 })).more).toBe(false);
  });
});
