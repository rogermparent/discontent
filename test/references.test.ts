// @vitest-environment node
//
// The repo default is jsdom; these tests open real LMDB environments in a
// temporary directory, which needs node.
//
// Unlike `pagination.test.ts`, this suite drives the *real* write path —
// `createContent` / `updateContent` / `deleteContent` / `rebuildIndex` — rather
// than a harness that imitates it. That is safe because `commitContentChanges`
// no-ops when the content directory is not a git repository — and a tmpdir is
// not — and it is worth doing because it is the first unit coverage the
// content write path has ever had.

import { mkdtemp, outputJson, pathExists, readJson, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Key } from "lmdb";

import { createContent } from "@discontent/cms/content/createContent";
import { deleteContent } from "@discontent/cms/content/deleteContent";
import { getContentDatabase } from "@discontent/cms/content/database";
import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { updateContent } from "@discontent/cms/content/updateContent";
import {
  borrowed,
  borrowedFieldsOf,
  createReferenceResolver,
  resolveReferences,
  NO_REFERENCES,
} from "@discontent/cms/content/references";
import type { ContentTypeConfig } from "@discontent/cms/content/types";
import {
  clearPaginationChanges,
  readPaginationChanges,
} from "@discontent/cms/pagination/changes";
import {
  PAGE_SUMMARY,
  getPaginationDatabase,
} from "@discontent/cms/pagination/database";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { syncPaginationItems } from "@discontent/cms/pagination/syncContentItems";
import type {
  PageSummary,
  PaginationIndexConfig,
  PaginationMeta,
} from "@discontent/cms/pagination/types";

/* ------------------------------------------------------------------ */
/* Content types                                                       */
/* ------------------------------------------------------------------ */

interface Author {
  name: string;
  bio: string;
  date: number;
}
interface AuthorIndexValue {
  name: string;
  date: number;
}
type AuthorKey = [number, string];

interface Post {
  title: string;
  author: string;
  date: number;
}
interface PostIndexValue {
  title: string;
  author: string;
  authorName?: string;
  date: number;
}
type PostKey = [number, string];

interface PostListItem {
  slug: string;
  title: string;
  authorName?: string;
  date: number;
}

/** Every `buildIndexValue` call on posts, by title. Reset per test. */
let postIndexValueCalls: string[] = [];

const postsByDate: PaginationIndexConfig<
  PostIndexValue,
  PostKey,
  PostListItem
> = {
  name: "by-date",
  perPage: 2,
  version: "test",
  key: ({ value, id }) => [value.date, id],
  /* `authorName` is projected, so a change to it can dirty a page (§3.5). */
  project: ({ value, id }) => ({
    slug: id,
    title: value.title,
    authorName: value.authorName,
    date: value.date,
  }),
};

/*
 * Declared before `authorConfig`, which it names in a thunk. That ordering is
 * deliberate: with a direct reference this line would read a `const` in its
 * temporal dead zone and throw at import time.
 */
const postConfig: ContentTypeConfig<Post, PostIndexValue, PostKey> = {
  contentType: "posts",
  dataDirectory: "posts/data",
  indexDirectory: "posts/index",
  dataFilename: "post.json",
  buildIndexValue: (data, refs): PostIndexValue => {
    postIndexValueCalls.push(data.title);
    return {
      title: data.title,
      author: data.author,
      authorName: borrowed<Author>(refs, "author")?.name,
      date: data.date,
    };
  },
  buildIndexKey: (slug, data): PostKey => [data.date, slug],
  references: [
    { config: () => authorConfig, dataField: "author", fields: ["name"] },
  ],
  paginationIndexes: [postsByDate],
};

const authorConfig: ContentTypeConfig<Author, AuthorIndexValue, AuthorKey> = {
  contentType: "authors",
  dataDirectory: "authors/data",
  indexDirectory: "authors/index",
  dataFilename: "author.json",
  buildIndexValue: (data): AuthorIndexValue => ({
    name: data.name,
    date: data.date,
  }),
  buildIndexKey: (slug, data): AuthorKey => [data.date, slug],
  referencedBy: [{ config: () => postConfig, indexField: "author" }],
};

/** A type with no edges in either direction — the no-op witness. */
const noteConfig: ContentTypeConfig<
  { title: string; date: number },
  { title: string; date: number },
  [number, string]
> = {
  contentType: "notes",
  dataDirectory: "notes/data",
  indexDirectory: "notes/index",
  dataFilename: "note.json",
  buildIndexValue: (data) => ({ title: data.title, date: data.date }),
  buildIndexKey: (slug, data) => [data.date, slug],
};

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let contentDirectory: string;
let previousContentDirectory: string | undefined;

const DAY = 86_400_000;
const day = (n: number) => n * DAY;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "references-"));
  /*
   * Since F17 the write path passes its own directory to
   * `commitContentChanges`, so this only covers anything that still falls back
   * to the ambient one. Kept anyway: pointing it at the tmpdir — which is not
   * a git repository — makes the commit no-op explicit either way rather than
   * dependent on the checkout's layout.
   */
  previousContentDirectory = process.env.CONTENT_DIRECTORY;
  process.env.CONTENT_DIRECTORY = contentDirectory;
  postIndexValueCalls = [];
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

function createAuthor(slug: string, author: Author) {
  return createContent({
    config: authorConfig,
    slug,
    data: author,
    contentDirectory,
  });
}

function createPost(slug: string, post: Post) {
  return createContent({
    config: postConfig,
    slug,
    data: post,
    contentDirectory,
  });
}

function updateAuthor(
  slug: string,
  currentSlug: string,
  currentDate: number,
  data: Author,
) {
  return updateContent({
    config: authorConfig,
    slug,
    currentSlug,
    currentIndexKey: [currentDate, currentSlug] as AuthorKey,
    data,
    contentDirectory,
  });
}

function deleteAuthor(slug: string, date: number) {
  return deleteContent({
    config: authorConfig,
    slug,
    indexKey: [date, slug] as AuthorKey,
    contentDirectory,
  });
}

/** The post content index, keyed by slug. */
async function readPostIndex(): Promise<Map<string, PostIndexValue>> {
  const db = getContentDatabase<PostIndexValue, PostKey>(
    postConfig,
    contentDirectory,
  );
  const entries = new Map<string, PostIndexValue>();
  for (const { key, value } of db.getRange()) {
    entries.set((key as PostKey)[1], value);
  }
  return entries;
}

/** Every raw key in the post content index, for orphan checks. */
async function readPostKeys(): Promise<Key[]> {
  const db = getContentDatabase<PostIndexValue, PostKey>(
    postConfig,
    contentDirectory,
  );
  return [...db.getRange()].map(({ key }) => key);
}

/** The stored per-page hashes — the diff source, read directly. */
function storedPageHashes(): Map<number, string> {
  const db = getPaginationDatabase(postConfig, postsByDate, contentDirectory);
  const hashes = new Map<number, string>();
  for (const { key, value } of db.getRange({
    start: [PAGE_SUMMARY],
    end: [PAGE_SUMMARY + 1],
  })) {
    hashes.set((key as Key[])[1] as number, (value as PageSummary).hash);
  }
  return hashes;
}

function readStoredMeta(): PaginationMeta {
  const db = getPaginationDatabase(postConfig, postsByDate, contentDirectory);
  return db.get([4]) as PaginationMeta;
}

function readPostFile(slug: string): Promise<Post> {
  return readJson(join(contentDirectory, "posts/data", slug, "post.json"));
}

/* ------------------------------------------------------------------ */
/* Covering: the index carries what a dependent renders                */
/* ------------------------------------------------------------------ */

describe("borrowed index-value fields", () => {
  it("materializes the referenced item's declared fields into the index", async () => {
    await createAuthor("ada", { name: "Ada", bio: "First", date: day(1) });
    await createPost("hello", {
      title: "Hello",
      author: "ada",
      date: day(10),
    });

    const posts = await readPostIndex();
    expect(posts.get("hello")).toEqual({
      title: "Hello",
      author: "ada",
      authorName: "Ada",
      date: day(10),
    });
  });

  it("carries only the declared fields, never the whole referenced item", async () => {
    await createAuthor("ada", { name: "Ada", bio: "Secret", date: day(1) });
    await createPost("hello", {
      title: "Hello",
      author: "ada",
      date: day(10),
    });

    /*
     * `bio` is not in `fields`, so it must be unreachable from
     * `buildIndexValue`. If it were reachable, a write changing it would fire
     * no invalidation — the trigger and the payload have to be the same set.
     */
    const resolver = createReferenceResolver(contentDirectory);
    const refs = await resolveReferences({
      config: postConfig,
      data: { title: "Hello", author: "ada", date: day(10) },
      resolver,
    });
    expect(refs.author?.values).toEqual({ name: "Ada" });
    expect(refs.author?.values).not.toHaveProperty("bio");
  });

  it("resolves a dangling reference to undefined without throwing", async () => {
    await expect(
      createPost("orphan", {
        title: "Orphan",
        author: "nobody",
        date: day(10),
      }),
    ).resolves.toBeDefined();

    const posts = await readPostIndex();
    expect(posts.get("orphan")?.authorName).toBeUndefined();
    expect(posts.get("orphan")?.author).toBe("nobody");
  });

  it("returns NO_REFERENCES for a type that declares none", async () => {
    const resolver = createReferenceResolver(contentDirectory);
    const refs = await resolveReferences({
      config: noteConfig,
      data: { title: "Note", date: day(1) },
      resolver,
    });
    expect(refs).toBe(NO_REFERENCES);
  });

  it("backfills a previously-dangling reference when the target is created", async () => {
    await createPost("early", {
      title: "Early",
      author: "ada",
      date: day(10),
    });
    expect((await readPostIndex()).get("early")?.authorName).toBeUndefined();

    const result = await createAuthor("ada", {
      name: "Ada",
      bio: "Arrived second",
      date: day(1),
    });

    expect(result.dependents).toHaveLength(1);
    expect(result.dependents[0]).toMatchObject({
      contentType: "posts",
      updatedSlugs: ["early"],
    });
    expect((await readPostIndex()).get("early")?.authorName).toBe("Ada");
  });
});

/* ------------------------------------------------------------------ */
/* The trigger, in both directions                                     */
/* ------------------------------------------------------------------ */

describe("the invalidation trigger", () => {
  /** Two authors, four posts: pages 0 and 1 by ada, page 2+ by grace. */
  async function seedCorpus() {
    await createAuthor("ada", { name: "Ada", bio: "First", date: day(1) });
    await createAuthor("grace", { name: "Grace", bio: "Second", date: day(2) });
    await createPost("p1", { title: "P1", author: "ada", date: day(10) });
    await createPost("p2", { title: "P2", author: "ada", date: day(11) });
    await createPost("p3", { title: "P3", author: "grace", date: day(12) });
    await createPost("p4", { title: "P4", author: "grace", date: day(13) });
    await clearPaginationChanges(contentDirectory);
    postIndexValueCalls = [];
  }

  it("fires on a borrowed field changing, dirtying only the pages that show it", async () => {
    await seedCorpus();
    const hashesBefore = storedPageHashes();

    const result = await updateAuthor("ada", "ada", day(1), {
      name: "Ada Lovelace",
      bio: "First",
      date: day(1),
    });

    /*
     * The half of the trigger that did not exist before D1: no slug changed,
     * so nothing fired at all.
     */
    expect(result.dependents).toHaveLength(1);
    const posts = result.dependents[0];
    expect(posts.contentType).toBe("posts");
    expect(posts.updatedSlugs.sort()).toEqual(["p1", "p2"]);
    expect(posts.pagination).toHaveLength(1);
    expect(posts.pagination[0].rebuilt).toBe(false);
    expect(posts.pagination[0].dirtyPages).toEqual([0]);

    const hashesAfter = storedPageHashes();
    expect(hashesAfter.get(0)).not.toBe(hashesBefore.get(0));
    /* Every page Ada is not on is byte-identical. */
    for (const [pageIndex, hash] of hashesBefore) {
      if (pageIndex === 0) continue;
      expect(hashesAfter.get(pageIndex)).toBe(hash);
    }

    const index = await readPostIndex();
    expect(index.get("p1")?.authorName).toBe("Ada Lovelace");
    expect(index.get("p2")?.authorName).toBe("Ada Lovelace");
    expect(index.get("p3")?.authorName).toBe("Grace");
  });

  it("does nothing at all when only an unborrowed field changes", async () => {
    await seedCorpus();
    const hashesBefore = storedPageHashes();
    const metaBefore = readStoredMeta();

    const result = await updateAuthor("ada", "ada", day(1), {
      name: "Ada",
      bio: "Rewritten, same name",
      date: day(1),
    });

    /*
     * `bio` is not borrowed, so the gate never opens: no index is read, no
     * dependent is rebuilt, nothing is recorded and `updatedAt` does not move.
     * This is the half F15 could never have — it fired on renames only, and
     * fired regardless of whether anything rendered had changed.
     */
    expect(result.dependents).toEqual([]);
    expect(postIndexValueCalls).toEqual([]);
    expect(storedPageHashes()).toEqual(hashesBefore);
    expect(readStoredMeta().updatedAt).toBe(metaBefore.updatedAt);
    expect(await readPaginationChanges(contentDirectory)).toMatchObject({
      indexes: {},
    });
  });

  it("rebuilds each dependent exactly once on a rename", async () => {
    await seedCorpus();

    const result = await updateAuthor("ada-lovelace", "ada", day(1), {
      name: "Ada",
      bio: "First",
      date: day(1),
    });

    /*
     * One `buildIndexValue` per dependent, not two. Sequencing a slug-rewrite
     * pass and a borrowed-value pass would read and write each file twice, and
     * the two would have to agree about the order they ran in.
     */
    expect(postIndexValueCalls.sort()).toEqual(["P1", "P2"]);

    // The reference followed, in the data file and in the index.
    expect((await readPostFile("p1")).author).toBe("ada-lovelace");
    expect((await readPostIndex()).get("p1")?.author).toBe("ada-lovelace");

    /*
     * Reconciled, not rebuilt. F15 forced `rebuilt: true` here, which reports
     * every page dirty because a rebuild has no diff source.
     */
    expect(result.dependents[0].pagination[0].rebuilt).toBe(false);
  });

  it("dirties no page when a rename changes nothing a page renders", async () => {
    await seedCorpus();
    const hashesBefore = storedPageHashes();

    const result = await updateAuthor("ada-lovelace", "ada", day(1), {
      name: "Ada",
      bio: "First",
      date: day(1),
    });

    /*
     * The post projection carries `authorName`, not `author`, so a slug change
     * moves the index value without moving anything displayed. §3.5 reaching
     * across a type boundary.
     */
    expect(result.dependents[0].pagination[0].dirtyPages).toEqual([]);
    expect(storedPageHashes()).toEqual(hashesBefore);
  });

  it("clears borrowed values on delete but leaves the reference pointing at the dead slug", async () => {
    await seedCorpus();

    const result = await deleteAuthor("ada", day(1));

    expect(result.dependents[0].updatedSlugs.sort()).toEqual(["p1", "p2"]);

    const index = await readPostIndex();
    expect(index.get("p1")?.authorName).toBeUndefined();
    expect(index.get("p2")?.authorName).toBeUndefined();
    expect(index.get("p3")?.authorName).toBe("Grace");

    /*
     * The rule: a delete cascades values, not rows. Rewriting the reference
     * would destroy the only record of what the post pointed at — the one
     * thing that could ever repair the link.
     */
    expect(index.get("p1")?.author).toBe("ada");
    expect((await readPostFile("p1")).author).toBe("ada");
    expect(
      await pathExists(join(contentDirectory, "authors/data", "ada")),
    ).toBe(false);
  });

  it("is a no-op for a content type with no edges", async () => {
    const result = await createContent({
      config: noteConfig,
      slug: "solo",
      data: { title: "Solo", date: day(1) },
      contentDirectory,
    });
    expect(result.dependents).toEqual([]);
    expect(result.pagination).toEqual([]);
    expect(borrowedFieldsOf(noteConfig)).toEqual([]);
  });

  it("creates no index for a dependent type the corpus has none of", async () => {
    /*
     * The gate opens on a create — `previousData` is absent, so every borrowed
     * field counts as changed — and there is no cheap way to know there are no
     * dependents without looking. Looking must not *make* anything: opening an
     * LMDB environment creates it, so without the data-directory check this
     * left a `posts/index` behind in a corpus that has never had a post.
     *
     * That is not tidiness. A content directory is a git repository, and
     * derived state appearing in it as a side effect of an unrelated write is
     * what took `git.spec.ts`'s remote-sync tests red in D2a: an untracked
     * index directory left the repo dirty and the Git UI in its
     * uncommitted-changes state.
     */
    const result = await createAuthor("ada", {
      name: "Ada",
      bio: "First",
      date: day(1),
    });

    expect(result.dependents).toEqual([]);
    expect(await pathExists(join(contentDirectory, "posts", "index"))).toBe(
      false,
    );
  });

  it("reports no borrowed fields for a type whose dependents borrow nothing", () => {
    /*
     * The behavioural-no-op guarantee, stated as a property: every production
     * content type in this repo is in exactly this state in D1, so every
     * ordinary write returns `[]` having opened nothing.
     */
    const referencedOnly: ContentTypeConfig<
      { name: string },
      { name: string },
      string
    > = {
      contentType: "referenced-only",
      dataDirectory: "x/data",
      indexDirectory: "x/index",
      dataFilename: "x.json",
      buildIndexValue: (data) => ({ name: data.name }),
      buildIndexKey: (slug) => slug,
      referencedBy: [{ config: () => noteConfig, indexField: "x" }],
    };
    expect(borrowedFieldsOf(referencedOnly)).toEqual([]);
    expect(borrowedFieldsOf(authorConfig)).toEqual(["name"]);
  });
});

/* ------------------------------------------------------------------ */
/* Batching and caching                                                */
/* ------------------------------------------------------------------ */

describe("cost", () => {
  it("runs phase 2 once for K dependents spanning several pages", async () => {
    await createAuthor("ada", { name: "Ada", bio: "First", date: day(1) });
    for (let index = 0; index < 5; index += 1) {
      await createPost(`p${index}`, {
        title: `P${index}`,
        author: "ada",
        date: day(10 + index),
      });
    }
    await clearPaginationChanges(contentDirectory);

    const result = await updateAuthor("ada", "ada", day(1), {
      name: "Ada Lovelace",
      bio: "First",
      date: day(1),
    });

    const posts = result.dependents[0];
    expect(posts.updatedSlugs).toHaveLength(5);
    /*
     * One result per declared index, whatever K is — the pass collects every
     * item and hands them to `syncPaginationItems` once. Per-item phase 2
     * would produce K result sets, each diffing against a state no build ever
     * sees.
     */
    expect(posts.pagination).toHaveLength(1);
    /* All five posts moved, so every page they occupy is dirty. */
    expect(posts.pagination[0].dirtyPages).toEqual([0, 1, 2]);
  });

  it("syncPaginationItems covers every item handed to it in one pass", async () => {
    await createAuthor("ada", { name: "Ada", bio: "First", date: day(1) });
    await createPost("p0", { title: "P0", author: "ada", date: day(10) });
    await createPost("p1", { title: "P1", author: "ada", date: day(11) });
    await createPost("p2", { title: "P2", author: "ada", date: day(12) });

    const results = await syncPaginationItems({
      config: postConfig,
      contentDirectory,
      items: [
        {
          id: "p0",
          entry: {
            key: [day(10), "p0"],
            value: {
              title: "P0!",
              author: "ada",
              authorName: "Ada",
              date: day(10),
            },
          },
        },
        {
          id: "p2",
          entry: {
            key: [day(12), "p2"],
            value: {
              title: "P2!",
              author: "ada",
              authorName: "Ada",
              date: day(12),
            },
          },
        },
      ],
    });

    expect(results.pagination).toHaveLength(1);
    /* p0 is on page 0 and p2 on page 1; a one-item call could reach only one. */
    expect(results.pagination[0].dirtyPages).toEqual([0, 1]);
  });

  it("returns nothing for an empty item list without opening anything", async () => {
    const results = await syncPaginationItems({
      config: postConfig,
      contentDirectory,
      items: [],
    });
    expect(results).toEqual({ pagination: [], aggregates: [] });
    expect(
      await pathExists(join(contentDirectory, "posts", "pagination")),
    ).toBe(false);
  });

  it("reads one data file for N dependents of the same target", async () => {
    await createAuthor("ada", { name: "Ada", bio: "First", date: day(1) });

    const resolver = createReferenceResolver(contentDirectory);
    const first = await resolver.read(authorConfig, "ada");
    expect(first?.name).toBe("Ada");

    /*
     * Take the file away, then read again. A second filesystem read would come
     * back `undefined`; the cached promise comes back with the value — which is
     * what makes N dependents of one target cost one read rather than N.
     */
    await rm(join(contentDirectory, "authors/data", "ada"), {
      recursive: true,
      force: true,
    });
    expect((await resolver.read(authorConfig, "ada"))?.name).toBe("Ada");

    /* And `forget` is how a delete makes the resolver look again. */
    resolver.forget(authorConfig.contentType, "ada");
    expect(await resolver.read(authorConfig, "ada")).toBeUndefined();
  });

  it("serves seeded data without touching the filesystem", async () => {
    const resolver = createReferenceResolver(contentDirectory);
    resolver.seed(authorConfig.contentType, "ghost", {
      name: "Never Written",
    });
    expect((await resolver.read(authorConfig, "ghost"))?.name).toBe(
      "Never Written",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Rebuild                                                             */
/* ------------------------------------------------------------------ */

describe("rebuildIndex", () => {
  it("resolves references, whichever type is rebuilt first", async () => {
    await createAuthor("ada", { name: "Ada", bio: "First", date: day(1) });
    await createPost("p1", { title: "P1", author: "ada", date: day(10) });

    // Rebuild posts alone: resolution reads author data files, not the author
    // index, so it cannot depend on which index was rebuilt first.
    await rebuildIndex({
      config: postConfig,
      contentDirectory,
      cascadeDependents: false,
    });
    const afterPostsFirst = await readPostIndex();

    await rebuildIndex({ config: authorConfig, contentDirectory });
    const afterAuthorsFirst = await readPostIndex();

    expect(afterPostsFirst.get("p1")?.authorName).toBe("Ada");
    expect(afterAuthorsFirst).toEqual(afterPostsFirst);
  });

  it("cascades to dependents by default, and stops when asked", async () => {
    await createAuthor("ada", { name: "Ada", bio: "First", date: day(1) });
    await createPost("p1", { title: "P1", author: "ada", date: day(10) });

    expect((await readPostIndex()).get("p1")?.authorName).toBe("Ada");

    /*
     * Edit the author behind the engine's back — a hand edit, a git pull, or
     * (the case this exists for) a borrowed field being adopted after the
     * index was built. The content index carries no spec hash, so nothing
     * detects that the copy in the post index went stale.
     *
     * Writing through `createContent` would defeat the test: that fires the
     * dependent pass itself and repairs posts on the spot.
     */
    await outputJson(
      join(contentDirectory, "authors/data", "ada", "author.json"),
      { name: "Ada Byron", bio: "First", date: day(1) },
    );

    // Rebuilding authors alone must not repair posts…
    await rebuildIndex({
      config: authorConfig,
      contentDirectory,
      cascadeDependents: false,
    });
    expect((await readPostIndex()).get("p1")?.authorName).toBe("Ada");

    // …but the default does, which is what makes adoption an operator rebuild.
    await rebuildIndex({ config: authorConfig, contentDirectory });
    expect((await readPostIndex()).get("p1")?.authorName).toBe("Ada Byron");
  });

  it("terminates on a reference cycle", async () => {
    /*
     * Two types that name each other in `referencedBy`. Without the `visited`
     * guard this recurses until the stack gives out.
     */
    const left: ContentTypeConfig<{ name: string }, { name: string }, string> =
      {
        contentType: "left",
        dataDirectory: "left/data",
        indexDirectory: "left/index",
        dataFilename: "left.json",
        buildIndexValue: (data) => ({ name: data.name }),
        buildIndexKey: (slug) => slug,
        referencedBy: [{ config: () => right, indexField: "left" }],
      };
    const right: ContentTypeConfig<{ name: string }, { name: string }, string> =
      {
        contentType: "right",
        dataDirectory: "right/data",
        indexDirectory: "right/index",
        dataFilename: "right.json",
        buildIndexValue: (data) => ({ name: data.name }),
        buildIndexKey: (slug) => slug,
        referencedBy: [{ config: () => left, indexField: "right" }],
      };

    await expect(
      rebuildIndex({ config: left, contentDirectory }),
    ).resolves.toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Thunks and key movement                                             */
/* ------------------------------------------------------------------ */

describe("declaration mechanics", () => {
  it("resolves the config thunk from either evaluation order", () => {
    /*
     * `postConfig` is declared *above* `authorConfig` in this file and names it
     * in a `references` thunk, while `authorConfig` names `postConfig` back.
     * Both directions resolve, which is the property the module graph needs and
     * a direct reference would break with a temporal-dead-zone ReferenceError.
     */
    expect(postConfig.references?.[0].config().contentType).toBe("authors");
    expect(authorConfig.referencedBy?.[0].config().contentType).toBe("posts");
  });

  it("leaves no orphan when a dependent's index key moves", async () => {
    /*
     * A dependent whose key is derived from the reference field, so renaming
     * the target moves every dependent entry. The rename path never removed
     * the old key — a latent orphan, since the item would then sit in the
     * index twice.
     */
    const citationConfig: ContentTypeConfig<
      { topic: string; text: string },
      { topic: string; text: string },
      [string, string]
    > = {
      contentType: "citations",
      dataDirectory: "citations/data",
      indexDirectory: "citations/index",
      dataFilename: "citation.json",
      buildIndexValue: (data) => ({ topic: data.topic, text: data.text }),
      buildIndexKey: (slug, data) => [data.topic, slug],
    };
    const topicConfig: ContentTypeConfig<
      { name: string; date: number },
      { name: string; date: number },
      [number, string]
    > = {
      contentType: "topics",
      dataDirectory: "topics/data",
      indexDirectory: "topics/index",
      dataFilename: "topic.json",
      buildIndexValue: (data) => ({ name: data.name, date: data.date }),
      buildIndexKey: (slug, data) => [data.date, slug],
      referencedBy: [{ config: () => citationConfig, indexField: "topic" }],
    };

    await createContent({
      config: topicConfig,
      slug: "lmdb",
      data: { name: "LMDB", date: day(1) },
      contentDirectory,
    });
    await createContent({
      config: citationConfig,
      slug: "c1",
      data: { topic: "lmdb", text: "One" },
      contentDirectory,
    });
    await createContent({
      config: citationConfig,
      slug: "c2",
      data: { topic: "lmdb", text: "Two" },
      contentDirectory,
    });

    await updateContent({
      config: topicConfig,
      slug: "lmdb-renamed",
      currentSlug: "lmdb",
      currentIndexKey: [day(1), "lmdb"] as [number, string],
      data: { name: "LMDB", date: day(1) },
      contentDirectory,
    });

    const db = getContentDatabase<
      { topic: string; text: string },
      [string, string]
    >(citationConfig, contentDirectory);
    const keys = [...db.getRange()].map(({ key }) => key as [string, string]);

    expect(keys).toHaveLength(2);
    expect(keys.map(([topic]) => topic)).toEqual([
      "lmdb-renamed",
      "lmdb-renamed",
    ]);
  });

  it("keeps one index entry per post across a rename", async () => {
    await createAuthor("ada", { name: "Ada", bio: "First", date: day(1) });
    await createPost("p1", { title: "P1", author: "ada", date: day(10) });
    await createPost("p2", { title: "P2", author: "ada", date: day(11) });

    await updateAuthor("ada-lovelace", "ada", day(1), {
      name: "Ada",
      bio: "First",
      date: day(1),
    });

    expect(await readPostKeys()).toHaveLength(2);
  });
});
