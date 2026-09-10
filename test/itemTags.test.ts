// @vitest-environment node
//
// The repo default is jsdom; the second half of this suite opens real LMDB
// environments in a temporary directory and drives the real write path, which
// needs node.
//
// **Why the trigger is asserted here rather than end-to-end.** Pagination and
// aggregates both report what they changed, so §12.1b/§12.1c can assert the
// negative half — "this write reported nothing" — against an engine return
// value. The item kind has no such value: the fired tag list *is* the trigger.
// And a tag fired too eagerly re-renders byte-identical HTML, so no Playwright
// spec can tell over-firing from correct firing. That case only exists here.

import { mkdtemp, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createContent } from "@discontent/cms/content/createContent";
import { deleteContent } from "@discontent/cms/content/deleteContent";
import {
  readContentFile,
  readContentFileOrNull,
} from "@discontent/cms/content/readContentFile";
import { updateContent } from "@discontent/cms/content/updateContent";
import { borrowed } from "@discontent/cms/content/references";
import type { ContentTypeConfig } from "@discontent/cms/content/types";
import {
  itemTag,
  itemTags,
  itemTypeTag,
} from "@discontent/cms/content/next/itemTags";
import {
  itemTagsForWrite,
  revalidateItemWrite,
} from "@discontent/cms/content/next/revalidate";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

/*
 * The recording stub `vitest.config.js` aliases `next/cache` to. Imported by
 * the same specifier the engine uses, so this is the very array
 * `revalidateItemWrite` pushes to.
 */
import { revalidatedTags, resetRevalidatedTags } from "./stub_cache.js";

/* ------------------------------------------------------------------ */
/* Content types — a referenced type and a borrowing one                */
/* ------------------------------------------------------------------ */

interface Note {
  title: string;
  body: string;
  date: number;
}
interface NoteIndexValue {
  title: string;
  date: number;
}
type NoteKey = [number, string];

interface Bookmark {
  note: string;
  label: string;
  date: number;
}
interface BookmarkIndexValue {
  note: string;
  label: string;
  noteTitle?: string;
  date: number;
}
type BookmarkKey = [number, string];

const bookmarkConfig: ContentTypeConfig<
  Bookmark,
  BookmarkIndexValue,
  BookmarkKey
> = {
  contentType: "bookmarks",
  dataDirectory: "bookmarks/data",
  indexDirectory: "bookmarks/index",
  dataFilename: "bookmark.json",
  buildIndexValue: (data, refs): BookmarkIndexValue => ({
    note: data.note,
    label: data.label,
    noteTitle: borrowed<Note>(refs, "note")?.title,
    date: data.date,
  }),
  buildIndexKey: (slug, data): BookmarkKey => [data.date, slug],
  references: [
    { config: () => noteConfig, dataField: "note", fields: ["title"] },
  ],
};

const noteConfig: ContentTypeConfig<Note, NoteIndexValue, NoteKey> = {
  contentType: "notes",
  dataDirectory: "notes/data",
  indexDirectory: "notes/index",
  dataFilename: "note.json",
  buildIndexValue: (data): NoteIndexValue => ({
    title: data.title,
    date: data.date,
  }),
  buildIndexKey: (slug, data): NoteKey => [data.date, slug],
  referencedBy: [{ config: () => bookmarkConfig, indexField: "note" }],
};

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let contentDirectory: string;
let previousContentDirectory: string | undefined;

const DAY = 86_400_000;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "item-tags-"));
  /*
   * Since F17 the write path passes its own directory to
   * `commitContentChanges`, so this only covers anything that still falls back
   * to the ambient one. Kept anyway: a tmpdir is not a git repository, so
   * pointing it here makes the commit no-op explicit either way instead of
   * dependent on the checkout's layout.
   */
  previousContentDirectory = process.env.CONTENT_DIRECTORY;
  process.env.CONTENT_DIRECTORY = contentDirectory;
  resetRevalidatedTags();
});

afterEach(async () => {
  await closeCachedEnvironments();
  if (previousContentDirectory === undefined) {
    delete process.env.CONTENT_DIRECTORY;
  } else {
    process.env.CONTENT_DIRECTORY = previousContentDirectory;
  }
  await rm(contentDirectory, { recursive: true, force: true });
});

const createNote = (slug: string, note: Note) =>
  createContent({ config: noteConfig, slug, data: note, contentDirectory });

const createBookmark = (slug: string, bookmark: Bookmark) =>
  createContent({
    config: bookmarkConfig,
    slug,
    data: bookmark,
    contentDirectory,
  });

const firedTags = () => revalidatedTags.map((entry) => entry.tag);

/* ------------------------------------------------------------------ */

describe("item cache tags — the format", () => {
  it("keys an entry by content type and slug, and the catch-all by type", () => {
    expect(itemTag("notes", "hello")).toBe("item:notes:hello");
    expect(itemTypeTag("notes")).toBe("item:notes");
  });

  it("hands the read and write sides the same two tags", () => {
    const tags = itemTags("notes");
    expect(tags.all).toBe("item:notes");
    expect(tags.item("hello")).toBe("item:notes:hello");
  });

  it("keeps content types apart", () => {
    expect(itemTag("notes", "a")).not.toBe(itemTag("bookmarks", "a"));
  });
});

describe("item cache tags — which tags one write implies", () => {
  it("fires exactly the written slug on a create or a plain update", () => {
    expect(itemTagsForWrite("notes", { slug: "a" })).toEqual(["item:notes:a"]);
  });

  it("fires both slugs on a rename, so the old URL stops serving the record", () => {
    expect(itemTagsForWrite("notes", { slug: "b", previousSlug: "a" })).toEqual(
      ["item:notes:b", "item:notes:a"],
    );
  });

  it("does not fire the same slug twice when a write reports no rename", () => {
    expect(itemTagsForWrite("notes", { slug: "a", previousSlug: "a" })).toEqual(
      ["item:notes:a"],
    );
  });

  /*
   * The load-bearing negative. A write knows its own slugs; expiring the type
   * would drop every other item's entry for nothing, which is exactly the
   * over-invalidation the kind exists to avoid — and it is invisible from
   * outside, since the re-render produces identical bytes.
   */
  it("never fires the catch-all, whatever the write", () => {
    const writes = [
      { slug: "a" },
      { slug: "a", previousSlug: "a" },
      { slug: "b", previousSlug: "a" },
    ];
    for (const write of writes) {
      expect(itemTagsForWrite("notes", write)).not.toContain(
        itemTypeTag("notes"),
      );
    }
  });

  it("expires immediately rather than serving stale, so a redirect reads its own write", () => {
    revalidateItemWrite("notes", { slug: "b", previousSlug: "a" });
    expect(revalidatedTags).toEqual([
      { tag: "item:notes:b", profile: { expire: 0 } },
      { tag: "item:notes:a", profile: { expire: 0 } },
    ]);
  });
});

describe("the cached read's contract: a missing item is a value, not a throw", () => {
  it("returns null for a slug that does not exist", async () => {
    await expect(
      readContentFileOrNull<Note, NoteIndexValue, NoteKey>({
        config: noteConfig,
        slug: "nope",
        contentDirectory,
      }),
    ).resolves.toBeNull();
  });

  it("returns the whole record for one that does", async () => {
    await createNote("a", { title: "A", body: "body of a", date: DAY });
    const note = await readContentFileOrNull<Note, NoteIndexValue, NoteKey>({
      config: noteConfig,
      slug: "a",
      contentDirectory,
    });
    expect(note?.body).toBe("body of a");
  });

  /*
   * Only ENOENT is an answer. A half-written file is a real failure, and
   * turning it into a 404 would hide a broken deployment behind a site full of
   * missing pages.
   */
  it("still throws for a file that exists but is not readable as JSON", async () => {
    await createNote("a", { title: "A", body: "b", date: DAY });
    await writeFile(
      join(contentDirectory, "notes/data/a/note.json"),
      "{ not json",
    );
    await expect(
      readContentFileOrNull<Note, NoteIndexValue, NoteKey>({
        config: noteConfig,
        slug: "a",
        contentDirectory,
      }),
    ).rejects.toThrow();
  });

  it("is the same read as readContentFile when the item is there", async () => {
    await createNote("a", { title: "A", body: "b", date: DAY });
    const strict = await readContentFile<Note, NoteIndexValue, NoteKey>({
      config: noteConfig,
      slug: "a",
      contentDirectory,
    });
    const lenient = await readContentFileOrNull<Note, NoteIndexValue, NoteKey>({
      config: noteConfig,
      slug: "a",
      contentDirectory,
    });
    expect(lenient).toEqual(strict);
  });
});

/*
 * The half that needs the real engine. Everything above is a pure function;
 * these drive `createContent`/`updateContent`/`deleteContent` against real
 * LMDB and fire the tags the way `handleContentSuccess` does, so the dependent
 * slugs come from real reference resolution rather than from a fixture.
 */
describe("item cache tags — driven by the real write path", () => {
  /** What `handleContentSuccess` does, minus the parts unrelated to items. */
  function fireAsGenericActionsWould(
    contentType: string,
    result: { dependents: { contentType: string; updatedSlugs: string[] }[] },
    slug: string,
    previousSlug?: string,
  ) {
    revalidateItemWrite(contentType, { slug, previousSlug });
    for (const dependent of result.dependents) {
      for (const dependentSlug of dependent.updatedSlugs) {
        revalidateItemWrite(dependent.contentType, { slug: dependentSlug });
      }
    }
  }

  it("fires the edited item's tag and nothing for its untouched siblings", async () => {
    await createNote("a", { title: "A", body: "first", date: DAY });
    await createNote("b", { title: "B", body: "first", date: 2 * DAY });
    resetRevalidatedTags();

    const result = await updateContent({
      config: noteConfig,
      slug: "a",
      currentSlug: "a",
      currentIndexKey: [DAY, "a"] as NoteKey,
      data: { title: "A", body: "second", date: DAY },
      contentDirectory,
    });
    fireAsGenericActionsWould("notes", result, "a", "a");

    /* Positive: the write's own item. */
    expect(firedTags()).toContain("item:notes:a");
    /* Negative: the sibling, which this write did not touch. */
    expect(firedTags()).not.toContain("item:notes:b");
    /* And never the whole type. */
    expect(firedTags()).not.toContain("item:notes");
  });

  it("fires an unprojected, unborrowed edit — the case no other kind reports", async () => {
    await createNote("a", { title: "A", body: "first", date: DAY });
    resetRevalidatedTags();

    /*
     * `body` is in no index value, no projection and no borrowed field set, so
     * pagination reports nothing and no aggregate moves. The item tag is the
     * only thing that fires at all — which is the entire reason this kind
     * exists.
     */
    const result = await updateContent({
      config: noteConfig,
      slug: "a",
      currentSlug: "a",
      currentIndexKey: [DAY, "a"] as NoteKey,
      data: { title: "A", body: "second", date: DAY },
      contentDirectory,
    });
    expect(result.pagination).toEqual([]);
    fireAsGenericActionsWould("notes", result, "a", "a");
    expect(firedTags()).toEqual(["item:notes:a"]);
  });

  it("fires both slugs on a rename, so the old URL 404s instead of serving the record", async () => {
    await createNote("a", { title: "A", body: "first", date: DAY });
    resetRevalidatedTags();

    const result = await updateContent({
      config: noteConfig,
      slug: "b",
      currentSlug: "a",
      currentIndexKey: [DAY, "a"] as NoteKey,
      data: { title: "A", body: "first", date: DAY },
      contentDirectory,
    });
    fireAsGenericActionsWould("notes", result, "b", "a");

    expect(firedTags()).toContain("item:notes:b");
    expect(firedTags()).toContain("item:notes:a");
  });

  it("fires a dependent's item tag when the write rewrote its data file", async () => {
    await createNote("a", { title: "A", body: "first", date: DAY });
    await createBookmark("mark", { note: "a", label: "Mark", date: DAY });
    resetRevalidatedTags();

    /*
     * A rename makes `updateDependents` rewrite the bookmark's own data file
     * so its `note` field points at the new slug. The bookmark's cached record
     * is therefore genuinely stale — and reaching it needs no config seat,
     * because `DependentWriteResult` carries the content type an item tag is
     * keyed by.
     */
    const result = await updateContent({
      config: noteConfig,
      slug: "b",
      currentSlug: "a",
      currentIndexKey: [DAY, "a"] as NoteKey,
      data: { title: "A", body: "first", date: DAY },
      contentDirectory,
    });
    fireAsGenericActionsWould("notes", result, "b", "a");

    expect(result.dependents[0]?.updatedSlugs).toContain("mark");
    expect(firedTags()).toContain("item:bookmarks:mark");
    expect(firedTags()).not.toContain("item:bookmarks");
  });

  it("fires no dependent item tag when nothing borrowed or referenced moved", async () => {
    await createNote("a", { title: "A", body: "first", date: DAY });
    await createBookmark("mark", { note: "a", label: "Mark", date: DAY });
    resetRevalidatedTags();

    /* `body` is neither the reference nor a borrowed field. */
    const result = await updateContent({
      config: noteConfig,
      slug: "a",
      currentSlug: "a",
      currentIndexKey: [DAY, "a"] as NoteKey,
      data: { title: "A", body: "second", date: DAY },
      contentDirectory,
    });
    fireAsGenericActionsWould("notes", result, "a", "a");

    expect(firedTags()).toEqual(["item:notes:a"]);
  });

  it("fires the deleted item's tag", async () => {
    await createNote("a", { title: "A", body: "first", date: DAY });
    resetRevalidatedTags();

    const result = await deleteContent({
      config: noteConfig,
      slug: "a",
      indexKey: [DAY, "a"] as NoteKey,
      contentDirectory,
    });
    fireAsGenericActionsWould("notes", result, "a");

    expect(firedTags()).toContain("item:notes:a");
    expect(firedTags()).not.toContain("item:notes");
  });

  it("a write to one content type fires no item tag of the other", async () => {
    await createNote("a", { title: "A", body: "first", date: DAY });
    await createBookmark("mark", { note: "a", label: "Mark", date: DAY });
    resetRevalidatedTags();

    /*
     * Bookmarks borrow *from* notes, not the other way round, so editing a
     * bookmark must leave every note's record alone. Featuring a recipe is the
     * production case: it changes which recipe the homepage hero renders, but
     * not the recipe — and the hero's selection comes from a pagination head
     * the featured write already expires.
     */
    const result = await updateContent({
      config: bookmarkConfig,
      slug: "mark",
      currentSlug: "mark",
      currentIndexKey: [DAY, "mark"] as BookmarkKey,
      data: { note: "a", label: "Renamed", date: DAY },
      contentDirectory,
    });
    fireAsGenericActionsWould("bookmarks", result, "mark", "mark");

    expect(firedTags()).toEqual(["item:bookmarks:mark"]);
    expect(firedTags()).not.toContain("item:notes:a");
  });
});
