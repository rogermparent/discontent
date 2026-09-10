// @vitest-environment node
//
// The repo default is jsdom; these tests open real LMDB environments in a
// temporary directory, which needs node.

import { mkdtemp, pathExists, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAggregateDatabase } from "@discontent/cms/aggregates/database";
import { readAggregate } from "@discontent/cms/aggregates/readAggregate";
import type { AggregateConfig } from "@discontent/cms/aggregates/types";
import { updateAggregates } from "@discontent/cms/aggregates/updateAggregates";
import { getContentDatabase } from "@discontent/cms/content/database";
import type { ContentTypeConfig } from "@discontent/cms/content/types";
import {
  clearPaginationChanges,
  readPaginationChanges,
} from "@discontent/cms/pagination/changes";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { syncPaginationIndexes } from "@discontent/cms/pagination/syncContentItem";
import type { PaginationIndexConfig } from "@discontent/cms/pagination/types";

interface Note {
  title: string;
  date: number;
  tags?: string[];
}

interface NoteIndexValue {
  title: string;
  date: number;
  tags?: string[];
}

type NoteKey = [number, string];

const day = (n: number) => Date.UTC(2026, 0, n);

/**
 * The motivating aggregate: the unique tag set across a corpus.
 *
 * A `Set` accumulator finalizing to a sorted array — the case the two-type
 * `AggregateConfig` exists for, since a `Set` is not JSON-serializable and the
 * stored value must be.
 */
const noteTags: AggregateConfig<
  NoteIndexValue,
  NoteKey,
  Set<string>,
  string[]
> = {
  name: "tags",
  version: "1",
  initial: () => new Set<string>(),
  fold: (tags, { value }) => {
    for (const tag of value.tags ?? []) tags.add(tag);
    return tags;
  },
  finalize: (tags) => [...tags].sort(),
};

/** A second aggregate, to prove one walk serves any number of them. */
const noteCount: AggregateConfig<NoteIndexValue, NoteKey, number, number> = {
  name: "count",
  version: "1",
  initial: () => 0,
  fold: (total) => total + 1,
};

const baseConfig: ContentTypeConfig<Note, NoteIndexValue, NoteKey> = {
  contentType: "notes",
  dataDirectory: "notes/data",
  indexDirectory: "notes/index",
  dataFilename: "note.json",
  buildIndexValue: (data) => ({
    title: data.title,
    date: data.date,
    tags: data.tags,
  }),
  buildIndexKey: (slug, data) => [data.date, slug],
};

/** Declares the tag aggregate and nothing else — no pagination index at all. */
const taggedConfig: ContentTypeConfig<Note, NoteIndexValue, NoteKey> = {
  ...baseConfig,
  aggregates: [noteTags],
};

const notesByDate: PaginationIndexConfig<
  NoteIndexValue,
  NoteKey,
  NoteIndexValue
> = {
  name: "by-date",
  perPage: 2,
  version: "1",
  key: ({ value, id }) => [value.date, id],
  project: ({ value }) => value,
};

let contentDirectory: string;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "aggregates-"));
});

afterEach(async () => {
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

/** Writes straight to the content index, the way a content write does. */
async function putNote(slug: string, note: Note) {
  const db = getContentDatabase<NoteIndexValue, NoteKey>(
    baseConfig,
    contentDirectory,
  );
  await db.put(
    baseConfig.buildIndexKey(slug, note),
    baseConfig.buildIndexValue(note, {}),
  );
}

async function removeNote(slug: string, note: Note) {
  const db = getContentDatabase<NoteIndexValue, NoteKey>(
    baseConfig,
    contentDirectory,
  );
  await db.remove(baseConfig.buildIndexKey(slug, note));
}

function tagsOf(config = taggedConfig) {
  return readAggregate({
    config,
    aggregateConfig: noteTags,
    contentDirectory,
  });
}

/* ------------------------------------------------------------------ */
/* The trigger, both halves                                            */
/* ------------------------------------------------------------------ */

describe("updateAggregates", () => {
  it("does nothing for a config that declares none", async () => {
    const results = await updateAggregates({
      config: baseConfig,
      contentDirectory,
    });
    expect(results).toEqual([]);
    /* Not even a directory: an undeclared kind must cost nothing. */
    expect(
      await pathExists(join(contentDirectory, "notes", "aggregates")),
    ).toBe(false);
  });

  it("folds the corpus and reports the first computation as changed", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["x", "y"] });
    await putNote("b", { title: "B", date: day(2), tags: ["y", "z"] });

    const results = await updateAggregates({
      config: taggedConfig,
      contentDirectory,
    });

    expect(results).toEqual([{ name: "tags", changed: true, total: 2 }]);
    expect(await tagsOf()).toEqual(["x", "y", "z"]);
  });

  /*
   * The positive half of the trigger, per §12.1b's shape: a write that really
   * does move the value says so.
   */
  it("reports changed when a genuinely new tag arrives", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["x"] });
    await updateAggregates({ config: taggedConfig, contentDirectory });

    await putNote("b", { title: "B", date: day(2), tags: ["new"] });
    const results = await updateAggregates({
      config: taggedConfig,
      contentDirectory,
    });

    expect(results[0].changed).toBe(true);
    expect(await tagsOf()).toEqual(["new", "x"]);
  });

  /*
   * The negative half, and the reason the kind exists. Every write touches the
   * corpus the value is folded from; almost none of them move the value.
   */
  it("reports nothing when a write leaves the tag set alone", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["x", "y"] });
    await putNote("b", { title: "B", date: day(2), tags: ["y"] });
    await updateAggregates({ config: taggedConfig, contentDirectory });

    const db = getAggregateDatabase(taggedConfig, noteTags, contentDirectory);
    const before = db.get([0]);

    /* A retitle: touches the index value, touches no folded field. */
    await putNote("a", { title: "A edited", date: day(1), tags: ["x", "y"] });
    const results = await updateAggregates({
      config: taggedConfig,
      contentDirectory,
    });

    expect(results[0].changed).toBe(false);
    /*
     * And the stored record is untouched — `updatedAt` included. A no-op pass
     * must not be detectable downstream, the same rule phase 2 follows for the
     * meta record.
     */
    expect(db.get([0])).toEqual(before);
  });

  it("adding a tag that already exists elsewhere changes nothing", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["shared"] });
    await putNote("b", { title: "B", date: day(2), tags: [] });
    await updateAggregates({ config: taggedConfig, contentDirectory });

    await putNote("b", { title: "B", date: day(2), tags: ["shared"] });
    const results = await updateAggregates({
      config: taggedConfig,
      contentDirectory,
    });

    expect(results[0].changed).toBe(false);
    expect(await tagsOf()).toEqual(["shared"]);
  });

  it("drops a tag when its last carrier is deleted", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["keep", "lonely"] });
    await putNote("b", { title: "B", date: day(2), tags: ["keep"] });
    await updateAggregates({ config: taggedConfig, contentDirectory });

    await removeNote("a", { title: "A", date: day(1), tags: [] });
    const results = await updateAggregates({
      config: taggedConfig,
      contentDirectory,
    });

    expect(results[0].changed).toBe(true);
    expect(await tagsOf()).toEqual(["keep"]);
  });

  it("folds every declared aggregate in one walk", async () => {
    const config = { ...baseConfig, aggregates: [noteTags, noteCount] };
    await putNote("a", { title: "A", date: day(1), tags: ["x"] });
    await putNote("b", { title: "B", date: day(2), tags: ["x"] });

    const results = await updateAggregates({ config, contentDirectory });

    expect(results.map((result) => result.name)).toEqual(["tags", "count"]);
    /* One walk, so both see the same corpus and report the same total. */
    expect(results.every((result) => result.total === 2)).toBe(true);
    expect(
      await readAggregate({
        config,
        aggregateConfig: noteCount,
        contentDirectory,
      }),
    ).toBe(2);
  });

  it("recomputes after a spec change without reporting a content change", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["x"] });
    await updateAggregates({ config: taggedConfig, contentDirectory });

    /*
     * Same fold, new version. The record has to pick up the new spec hash, but
     * the value a reader would render is identical — so this must not fire a
     * tag.
     */
    const rebumped = { ...noteTags, version: "2" };
    const results = await updateAggregates({
      config: { ...baseConfig, aggregates: [rebumped] },
      contentDirectory,
    });

    expect(results[0].changed).toBe(false);
    const db = getAggregateDatabase(taggedConfig, noteTags, contentDirectory);
    expect((db.get([0]) as { specHash: string }).specHash).not.toBe("");
  });

  it("a second pass over an unchanged corpus reports no change", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["x"] });
    await updateAggregates({ config: taggedConfig, contentDirectory });

    const results = await updateAggregates({
      config: taggedConfig,
      contentDirectory,
    });

    expect(results[0].changed).toBe(false);
  });

  it("an emptied corpus folds to an empty value", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["x"] });
    await updateAggregates({ config: taggedConfig, contentDirectory });

    await removeNote("a", { title: "A", date: day(1), tags: [] });
    const results = await updateAggregates({
      config: taggedConfig,
      contentDirectory,
    });

    expect(results[0]).toEqual({ name: "tags", changed: true, total: 0 });
    expect(await tagsOf()).toEqual([]);
  });
});

describe("readAggregate", () => {
  it("returns null when nothing has ever been folded", async () => {
    expect(await tagsOf()).toBeNull();
  });

  /*
   * A read must never trigger the pass — it may be inside a static export or
   * on a read-only mount. This is also why fixtures have to be regenerated by
   * script rather than left to heal themselves.
   */
  it("does not compute on read", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["x"] });
    expect(await tagsOf()).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* The write seat                                                      */
/* ------------------------------------------------------------------ */

describe("the sync seat runs both kinds", () => {
  const bothConfig: ContentTypeConfig<Note, NoteIndexValue, NoteKey> = {
    ...baseConfig,
    paginationIndexes: [notesByDate],
    aggregates: [noteTags],
  };

  async function sync(slug: string, note: Note) {
    await putNote(slug, note);
    return syncPaginationIndexes({
      config: bothConfig,
      contentDirectory,
      id: slug,
      entry: {
        key: bothConfig.buildIndexKey(slug, note),
        value: bothConfig.buildIndexValue(note, {}),
      },
    });
  }

  it("reports one list per derived kind", async () => {
    const result = await sync("a", { title: "A", date: day(1), tags: ["x"] });
    expect(result.pagination).toHaveLength(1);
    expect(result.aggregates).toEqual([
      { name: "tags", changed: true, total: 1 },
    ]);
  });

  /*
   * The payoff, stated against the seat every write path funnels through: an
   * edit that dirties a page leaves the aggregate alone.
   */
  it("dirties a page without moving the aggregate", async () => {
    await sync("a", { title: "A", date: day(1), tags: ["x"] });
    const result = await sync("a", {
      title: "A edited",
      date: day(1),
      tags: ["x"],
    });

    expect(result.pagination[0].dirtyPages).toEqual([0]);
    expect(result.aggregates[0].changed).toBe(false);
  });

  it("runs for a type with aggregates and no pagination index", async () => {
    const slug = "a";
    const note = { title: "A", date: day(1), tags: ["x"] };
    await putNote(slug, note);
    const result = await syncPaginationIndexes({
      config: taggedConfig,
      contentDirectory,
      id: slug,
      entry: {
        key: taggedConfig.buildIndexKey(slug, note),
        value: taggedConfig.buildIndexValue(note, {}),
      },
    });

    expect(result.pagination).toEqual([]);
    expect(result.aggregates[0].changed).toBe(true);
    expect(await tagsOf()).toEqual(["x"]);
  });

  it("records only the aggregates that moved in the changes artifact", async () => {
    await sync("a", { title: "A", date: day(1), tags: ["x"] });
    await clearPaginationChanges(contentDirectory);

    await sync("b", { title: "B", date: day(2), tags: ["x"] });
    const afterNoMove = await readPaginationChanges(contentDirectory);
    expect(afterNoMove.aggregates).toBeUndefined();

    await sync("c", { title: "C", date: day(3), tags: ["fresh"] });
    const afterMove = await readPaginationChanges(contentDirectory);
    expect(afterMove.aggregates).toEqual(["notes/tags"]);
  });
});
