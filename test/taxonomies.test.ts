// @vitest-environment node
//
// The repo default is jsdom; these tests open real LMDB environments in a
// temporary directory, which needs node.
//
// Two halves, and they are deliberately different harnesses. The fold half
// writes straight to the content index the way `aggregates.test.ts` does,
// because a fold is a function of the index and nothing else. The term-record
// half drives the *real* write path — `createContent` / `updateContent` — the
// way `references.test.ts` does, because what it is proving is what
// `updateDependents` does when a type's dependent is itself (T8).

import { mkdtemp, readJson, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readAggregate } from "@discontent/cms/aggregates/readAggregate";
import type { AggregateConfig } from "@discontent/cms/aggregates/types";
import { updateAggregates } from "@discontent/cms/aggregates/updateAggregates";
import { createContent } from "@discontent/cms/content/createContent";
import { getContentDatabase } from "@discontent/cms/content/database";
import { derivedTagsOf } from "@discontent/cms/content/next/revalidateDerived";
import type {
  AnyContentTypeConfig,
  ContentTypeConfig,
} from "@discontent/cms/content/types";
import { updateContent } from "@discontent/cms/content/updateContent";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import {
  TAXONOMY_FOLD_VERSION,
  aggregatesOf,
  taxonomyAggregates,
  termsAggregate,
} from "@discontent/cms/taxonomies/aggregates";
import {
  readTaxonomyByTerm,
  readTaxonomyTerms,
} from "@discontent/cms/taxonomies/read";
import { normalizeTerm, termSlug } from "@discontent/cms/taxonomies/slug";
import {
  createTermContentType,
  type Term,
  type TermIndexKey,
  type TermIndexValue,
} from "@discontent/cms/taxonomies/termContentType";
import type { TermTree } from "@discontent/cms/taxonomies/tree";
import type {
  TaxonomyByTerm,
  TaxonomyConfig,
  TaxonomyTerm,
} from "@discontent/cms/taxonomies/types";

/* ------------------------------------------------------------------ */
/* Carrier type                                                        */
/* ------------------------------------------------------------------ */

interface Note {
  title: string;
  date: number;
  tags?: unknown;
}

interface NoteIndexValue {
  title: string;
  date: number;
  tags?: unknown;
}

type NoteKey = [number, string];

const day = (n: number) => Date.UTC(2026, 0, n);

const noteTagTaxonomy: TaxonomyConfig<NoteIndexValue, NoteKey, { id: string }> =
  {
    name: "tag",
    field: "tags",
    version: "1",
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

/** A carrier that declares the vocabulary and nothing by hand. */
const taggedConfig: ContentTypeConfig<Note, NoteIndexValue, NoteKey> = {
  ...baseConfig,
  taxonomies: [noteTagTaxonomy],
};

let contentDirectory: string;
let previousContentDirectory: string | undefined;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "taxonomies-"));
  /* Not a git repository, so `commitContentChanges` no-ops explicitly. */
  previousContentDirectory = process.env.CONTENT_DIRECTORY;
  process.env.CONTENT_DIRECTORY = contentDirectory;
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

function foldNotes(config: AnyContentTypeConfig = taggedConfig) {
  return updateAggregates({ config, contentDirectory });
}

function termsOf(taxonomy = noteTagTaxonomy): Promise<TaxonomyTerm[] | null> {
  return readTaxonomyTerms({
    config: taggedConfig,
    taxonomy,
    contentDirectory,
  });
}

function byTermOf(
  taxonomy = noteTagTaxonomy,
): Promise<TaxonomyByTerm<{ id: string }> | null> {
  return readTaxonomyByTerm({
    config: taggedConfig,
    taxonomy,
    contentDirectory,
  });
}

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

describe("term identity", () => {
  it("normalizes with the same three rules the site's normalizeTag has", () => {
    expect(normalizeTerm("  Christmas   Cookies ")).toBe("christmas cookies");
    expect(normalizeTerm("\t \n")).toBe("");
  });

  it("slugs the way the site's tagSlug does", () => {
    expect(termSlug("christmas cookies")).toBe("christmas-cookies");
    expect(termSlug("half & half")).toBe("half-and-half");
    /* Nothing printable survives, so the term has no page and is dropped. */
    expect(termSlug("---")).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/* aggregatesOf — the single derivation (T4)                           */
/* ------------------------------------------------------------------ */

describe("aggregatesOf", () => {
  const declared: AggregateConfig<NoteIndexValue, NoteKey, number, number> = {
    name: "count",
    version: "1",
    initial: () => 0,
    fold: (total) => total + 1,
  };

  it("returns the declared list untouched for a type with no taxonomy", () => {
    const config = { ...baseConfig, aggregates: [declared] };
    expect(aggregatesOf(config as AnyContentTypeConfig)).toEqual([declared]);
  });

  it("returns nothing for a type that declares neither", () => {
    expect(aggregatesOf(baseConfig as AnyContentTypeConfig)).toEqual([]);
  });

  it("appends taxonomies after declared aggregates, terms before by-term", () => {
    const config = {
      ...baseConfig,
      aggregates: [declared],
      taxonomies: [noteTagTaxonomy],
    };

    expect(
      aggregatesOf(config as AnyContentTypeConfig).map((a) => a.name),
    ).toEqual(["count", "tags", "by-tag"]);
  });

  it("names both derived aggregates from the taxonomy stem alone", () => {
    expect(taxonomyAggregates(noteTagTaxonomy).map((a) => a.name)).toEqual([
      "tags",
      "by-tag",
    ]);
    expect(
      taxonomyAggregates({ ...noteTagTaxonomy, name: "cuisine" }).map(
        (a) => a.name,
      ),
    ).toEqual(["cuisines", "by-cuisine"]);
  });

  it("stores the engine's fold version and the site's, joined", () => {
    // A fold edit in the engine bumps one constant and invalidates every
    // site's record; a site changing its own projection bumps only its own.
    for (const aggregate of taxonomyAggregates(noteTagTaxonomy)) {
      expect(aggregate.version).toBe(`${TAXONOMY_FOLD_VERSION}.1`);
    }
    for (const aggregate of taxonomyAggregates({
      ...noteTagTaxonomy,
      version: "2",
    })) {
      expect(aggregate.version).toBe(`${TAXONOMY_FOLD_VERSION}.2`);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The folds                                                           */
/* ------------------------------------------------------------------ */

describe("the terms aggregate", () => {
  it("folds slug, label and carrier count, sorted by slug", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["Beta", "alpha"] });
    await putNote("b", { title: "B", date: day(2), tags: ["gamma", "ALPHA"] });

    const results = await foldNotes();

    expect(results).toEqual([
      { name: "tags", changed: true, total: 2 },
      { name: "by-tag", changed: true, total: 2 },
    ]);
    expect(await termsOf()).toEqual([
      { slug: "alpha", label: "alpha", count: 2 },
      { slug: "beta", label: "beta", count: 1 },
      { slug: "gamma", label: "gamma", count: 1 },
    ]);
  });

  it("counts a carrier once however often it names the same term", async () => {
    await putNote("a", {
      title: "A",
      date: day(1),
      /* Three spellings, one slug. */
      tags: ["Cookies", "cookies", "  COOKIES  "],
    });
    await foldNotes();

    expect(await termsOf()).toEqual([
      { slug: "cookies", label: "cookies", count: 1 },
    ]);
  });

  it("merges two labels that slugify alike, first one seen winning", async () => {
    /*
     * Two distinct terms, one slug — `&` slugifies to `and`. Their carriers
     * merge onto one page and the label a reader sees is the first one the
     * walk saw, which is oldest first (F8, unchanged by this kind).
     */
    await putNote("a", { title: "A", date: day(1), tags: ["half & half"] });
    await putNote("b", { title: "B", date: day(2), tags: ["half and half"] });
    await foldNotes();

    expect(await termsOf()).toEqual([
      { slug: "half-and-half", label: "half & half", count: 2 },
    ]);
  });

  it("drops a term whose slug is empty", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["---", "keep"] });
    await foldNotes();

    expect(await termsOf()).toEqual([
      { slug: "keep", label: "keep", count: 1 },
    ]);
  });

  it("treats a field that is not an array as no terms at all", async () => {
    // What lets a type declare a taxonomy over a field its older index values
    // never carried: the fold reads the index and cannot fail on what it finds.
    await putNote("a", { title: "A", date: day(1), tags: "not-an-array" });
    await putNote("b", { title: "B", date: day(2) });
    await putNote("c", { title: "C", date: day(3), tags: [42, "real"] });
    await foldNotes();

    expect(await termsOf()).toEqual([
      { slug: "real", label: "real", count: 1 },
    ]);
  });

  it("reports changed: false when a write leaves the vocabulary alone", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["x"] });
    await foldNotes();

    /* A retitle: touches the index value, touches nothing either fold reads. */
    await putNote("a", { title: "A edited", date: day(1), tags: ["x"] });
    const results = await foldNotes();

    expect(results).toEqual([
      { name: "tags", changed: false, total: 1 },
      { name: "by-tag", changed: false, total: 1 },
    ]);
  });

  it("moves both when a carrier joins a term that already exists", async () => {
    /*
     * The one behavioural change this kind makes to a corpus that already had
     * a tag-set aggregate, and it is worth stating plainly: the vocabulary
     * carries `count`, so a *second* carrier of an existing term moves it. The
     * hand-written `Set<string>` fold it replaces reported `changed: false`
     * here.
     *
     * That is the cost of counts, paid knowingly: a term index wants to show
     * how many carriers a term has, and deriving it at read time would mean
     * loading the whole by-term record on a page that renders neither carriers
     * nor links. The kind's payoff — most writes move neither value — is
     * unaffected, and is what the next case asserts.
     */
    await putNote("a", { title: "A", date: day(1), tags: ["x"] });
    await foldNotes();

    await putNote("b", { title: "B", date: day(2), tags: ["x"] });
    const results = await foldNotes();

    expect(results).toEqual([
      { name: "tags", changed: true, total: 2 },
      { name: "by-tag", changed: true, total: 2 },
    ]);
    expect(await termsOf()).toEqual([{ slug: "x", label: "x", count: 2 }]);
  });

  it("moves by-term alone when only a projected field of a carrier changes", async () => {
    // The reason the two are separate aggregates under separate cache tags: a
    // page rendering only the vocabulary must not be invalidated by a change
    // only the carrier lists can see.
    const projected: TaxonomyConfig<
      NoteIndexValue,
      NoteKey,
      { slug: string; title: string }
    > = {
      ...noteTagTaxonomy,
      project: ({ id, value }) => ({ slug: id, title: value.title }),
    };
    const config = { ...baseConfig, taxonomies: [projected] };

    await putNote("a", { title: "A", date: day(1), tags: ["x"] });
    await foldNotes(config as AnyContentTypeConfig);

    await putNote("a", { title: "A edited", date: day(1), tags: ["x"] });
    const results = await foldNotes(config as AnyContentTypeConfig);

    expect(results).toEqual([
      { name: "tags", changed: false, total: 1 },
      { name: "by-tag", changed: true, total: 1 },
    ]);
  });
});

describe("the by-term aggregate", () => {
  it("inverts the corpus, newest first, keyed by slug", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["x", "y"] });
    await putNote("b", { title: "B", date: day(2), tags: ["x"] });
    await foldNotes();

    expect(await byTermOf()).toEqual({
      x: { label: "x", items: [{ id: "b" }, { id: "a" }] },
      y: { label: "y", items: [{ id: "a" }] },
    });
  });

  it("inserts keys in sorted-slug order so the stored value is stable", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["zulu", "alpha"] });
    await foldNotes();

    expect(Object.keys((await byTermOf()) ?? {})).toEqual(["alpha", "zulu"]);
  });

  it("applies project, which is the record's size lever", async () => {
    const projected: TaxonomyConfig<
      NoteIndexValue,
      NoteKey,
      { slug: string; title: string }
    > = {
      ...noteTagTaxonomy,
      project: ({ id, value }) => ({ slug: id, title: value.title }),
    };
    const config = { ...baseConfig, taxonomies: [projected] };

    await putNote("a", { title: "A", date: day(1), tags: ["x"] });
    await foldNotes(config as AnyContentTypeConfig);

    expect(
      await readTaxonomyByTerm({
        config: baseConfig,
        taxonomy: projected,
        contentDirectory,
      }),
    ).toEqual({ x: { label: "x", items: [{ slug: "a", title: "A" }] } });
  });

  it("lists a carrier once per term however often it names it", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["x", "X", " x "] });
    await foldNotes();

    expect((await byTermOf())?.x.items).toEqual([{ id: "a" }]);
  });
});

describe("taxonomy reads", () => {
  it("returns null before anything has been folded, and never folds", async () => {
    await putNote("a", { title: "A", date: day(1), tags: ["x"] });

    expect(await termsOf()).toBeNull();
    expect(await byTermOf()).toBeNull();
  });

  it("goes back to null when the stored spec version moves", async () => {
    // T5: nothing self-heals on read. A site bumping its taxonomy version reads
    // `null` until the next write or a `reindex`.
    await putNote("a", { title: "A", date: day(1), tags: ["x"] });
    await foldNotes();
    expect(await termsOf()).not.toBeNull();

    const bumped = { ...noteTagTaxonomy, version: "2" };
    expect(
      await readAggregate({
        config: taggedConfig,
        aggregateConfig: termsAggregate(bumped),
        contentDirectory,
      }),
    ).not.toBeNull();
    /*
     * The *value* is still readable — `readAggregate` does not compare spec
     * hashes — but `updateAggregates` rewrites it on the next pass, which is
     * where the version earns its keep.
     */
    const results = await foldNotes({
      ...baseConfig,
      taxonomies: [bumped],
    } as AnyContentTypeConfig);
    expect(results.map((r) => r.changed)).toEqual([false, false]);
  });
});

/* ------------------------------------------------------------------ */
/* Invalidation (T4)                                                   */
/* ------------------------------------------------------------------ */

describe("derivedTagsOf", () => {
  it("emits a taxonomy's two tags, terms before by-term, after the declared ones", () => {
    const config = {
      contentType: "notes",
      paginationIndexes: [{ name: "by-date" }],
      aggregates: [{ name: "count" }],
      taxonomies: [noteTagTaxonomy],
    } as unknown as AnyContentTypeConfig;

    expect(derivedTagsOf(config)).toEqual([
      "pagination:notes:by-date",
      "aggregate:notes:count",
      "aggregate:notes:tags",
      "aggregate:notes:by-tag",
      "item:notes",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Term records                                                        */
/* ------------------------------------------------------------------ */

const termConfig = createTermContentType({
  taxonomy: "tag",
  directory: "taxonomies/tag",
});

function createTerm(slug: string, data: Term) {
  return createContent({ config: termConfig, slug, data, contentDirectory });
}

function updateTerm(
  slug: string,
  currentSlug: string,
  currentDate: number,
  data: Term,
) {
  return updateContent({
    config: termConfig,
    slug,
    currentSlug,
    currentIndexKey: [currentDate, currentSlug] as TermIndexKey,
    data,
    contentDirectory,
  });
}

/** The term content index, keyed by slug. */
function readTermIndex(): Map<string, TermIndexValue> {
  const db = getContentDatabase<TermIndexValue, TermIndexKey>(
    termConfig,
    contentDirectory,
  );
  const entries = new Map<string, TermIndexValue>();
  for (const { key, value } of db.getRange()) {
    entries.set((key as TermIndexKey)[1], value);
  }
  return entries;
}

function readTermFile(slug: string): Promise<Term> {
  return readJson(
    join(contentDirectory, "taxonomies/tag/data", slug, "term.json"),
  );
}

function readTree(): Promise<TermTree | null> {
  return readAggregate({
    config: termConfig,
    aggregateConfig: { name: "tree" } as AggregateConfig,
    contentDirectory,
  });
}

describe("createTermContentType", () => {
  it("places the record type where the taxonomy and directory say", () => {
    expect(termConfig.contentType).toBe("tag-terms");
    expect(termConfig.dataDirectory).toBe("taxonomies/tag/data");
    expect(termConfig.indexDirectory).toBe("taxonomies/tag/index");
    expect(termConfig.dataFilename).toBe("term.json");
  });

  it("declares the reference edge in both directions, at itself", () => {
    // The one self-referencing edge in the repo (T8). Thunks on both sides are
    // not a formality here: `config` is named inside its own initializer.
    expect(termConfig.references?.[0].config()).toBe(termConfig);
    expect(termConfig.references?.[0].dataField).toBe("parent");
    expect(termConfig.references?.[0].fields).toEqual(["label"]);
    expect(termConfig.referencedBy?.[0].config()).toBe(termConfig);
    expect(termConfig.referencedBy?.[0].indexField).toBe("parent");
  });

  it("omits absent optional fields rather than storing undefined", async () => {
    await createTerm("cookies", { label: "Cookies", date: day(1) });

    expect(readTermIndex().get("cookies")).toEqual({
      label: "Cookies",
      date: day(1),
    });
  });

  it("lets a site extend the index value without reimplementing parentLabel", async () => {
    const extended = createTermContentType({
      taxonomy: "facet",
      directory: "taxonomies/facet",
      buildIndexValue: (data, _refs, base) => ({
        ...base,
        featured: data.featured === true,
      }),
    });

    await createContent({
      config: extended,
      slug: "diet",
      data: { label: "Diet", date: day(1), featured: true },
      contentDirectory,
    });

    const db = getContentDatabase<TermIndexValue, TermIndexKey>(
      extended,
      contentDirectory,
    );
    expect([...db.getRange()][0].value).toEqual({
      label: "Diet",
      date: day(1),
      featured: true,
    });
  });
});

describe("the self-referencing edge (T8)", () => {
  async function seedTree() {
    await createTerm("cookies", { label: "Cookies", date: day(1) });
    await createTerm("linzer", {
      label: "Linzer",
      date: day(2),
      parent: "cookies",
    });
  }

  it("borrows the parent's label onto the child's index value", async () => {
    await seedTree();

    expect(readTermIndex().get("linzer")).toEqual({
      label: "Linzer",
      date: day(2),
      parent: "cookies",
      parentLabel: "Cookies",
    });
  });

  it("rewrites a child's parent and parentLabel when the parent is renamed", async () => {
    await seedTree();

    const result = await updateTerm("holiday-cookies", "cookies", day(1), {
      label: "Holiday Cookies",
      date: day(1),
    });

    /*
     * The proof 24c depends on. `updateDependents` runs after the item's own
     * write, finds candidates by scanning the dependent type's index for
     * `parent === "cookies"` — and the dependent type is this same type, so the
     * scan is over the environment the write just used. Both halves land: the
     * child's *data file* follows the rename, and its *index value* picks up
     * the new borrowed label.
     */
    expect(result.dependents).toHaveLength(1);
    expect(result.dependents[0].contentType).toBe("tag-terms");
    expect(result.dependents[0].updatedSlugs).toEqual(["linzer"]);

    expect((await readTermFile("linzer")).parent).toBe("holiday-cookies");
    expect(readTermIndex().get("linzer")).toEqual({
      label: "Linzer",
      date: day(2),
      parent: "holiday-cookies",
      parentLabel: "Holiday Cookies",
    });
  });

  it("rewrites a child's parentLabel when only the parent's label is edited", async () => {
    await seedTree();

    const result = await updateTerm("cookies", "cookies", day(1), {
      label: "Cookies & Biscuits",
      date: day(1),
    });

    /* No rename at all: the gate opened on the borrowed field's hash moving. */
    expect(result.dependents[0].updatedSlugs).toEqual(["linzer"]);
    expect((await readTermFile("linzer")).parent).toBe("cookies");
    expect(readTermIndex().get("linzer")?.parentLabel).toBe(
      "Cookies & Biscuits",
    );
  });

  it("does nothing when an unborrowed field of the parent changes", async () => {
    await seedTree();

    const result = await updateTerm("cookies", "cookies", day(1), {
      label: "Cookies",
      date: day(1),
      description: "Rewritten, same label",
    });

    expect(result.dependents).toEqual([]);
    expect(readTermIndex().get("linzer")?.parentLabel).toBe("Cookies");
  });

  it("leaves a term with no children alone", async () => {
    await createTerm("cookies", { label: "Cookies", date: day(1) });

    const result = await updateTerm("biscuits", "cookies", day(1), {
      label: "Biscuits",
      date: day(1),
    });

    expect(result.dependents[0]?.updatedSlugs ?? []).toEqual([]);
  });
});

describe("the term tree aggregate", () => {
  it("links parents to children from the term index alone", async () => {
    await createTerm("cookies", { label: "Cookies", date: day(1) });
    await createTerm("linzer", {
      label: "Linzer",
      date: day(2),
      parent: "cookies",
    });
    await createTerm("spritz", {
      label: "Spritz",
      date: day(3),
      parent: "cookies",
    });

    expect(await readTree()).toEqual({
      cookies: { label: "Cookies", children: ["linzer", "spritz"] },
      linzer: { label: "Linzer", parent: "cookies", children: [] },
      spritz: { label: "Spritz", parent: "cookies", children: [] },
    });
  });

  it("leaves a dangling parent on the child and invents no node for it", async () => {
    await createTerm("linzer", {
      label: "Linzer",
      date: day(2),
      parent: "gone",
    });

    expect(await readTree()).toEqual({
      linzer: { label: "Linzer", parent: "gone", children: [] },
    });
  });

  it("terminates on a hand-edited cycle, with both terms present", async () => {
    /*
     * `A.parent = B` and `B.parent = A` is writable by a text editor and by
     * git. Linking is a single pass with no recursion, so the fold cannot hang
     * on it; the write-time rejection is a curation seat's job (24e), not a
     * fold's.
     */
    await createTerm("a", { label: "A", date: day(1) });
    await createTerm("b", { label: "B", date: day(2), parent: "a" });
    await updateTerm("a", "a", day(1), {
      label: "A",
      date: day(1),
      parent: "b",
    });

    expect(await readTree()).toEqual({
      a: { label: "A", parent: "b", children: ["b"] },
      b: { label: "B", parent: "a", children: ["a"] },
    });
  });

  it("never makes a self-parented term its own child", async () => {
    await createTerm("a", { label: "A", date: day(1), parent: "a" });

    expect(await readTree()).toEqual({
      a: { label: "A", parent: "a", children: [] },
    });
  });
});

describe("a term type folds through the ordinary seat", () => {
  it("runs the aggregate pass for a type with a taxonomy and no pagination index", async () => {
    // The gate in `syncPaginationItems` asks `aggregatesOf`, not
    // `config.aggregates` — otherwise a type whose only derived state is a
    // taxonomy would never be folded at all.
    const result = await createContent({
      config: taggedConfig,
      slug: "a",
      data: { title: "A", date: day(1), tags: ["x"] },
      contentDirectory,
    });

    expect(result.pagination).toEqual([]);
    expect(result.aggregates).toEqual([
      { name: "tags", changed: true, total: 1 },
      { name: "by-tag", changed: true, total: 1 },
    ]);
    expect(await termsOf()).toEqual([{ slug: "x", label: "x", count: 1 }]);
    expect(await byTermOf()).toEqual({
      x: { label: "x", items: [{ id: "a" }] },
    });
  });
});
