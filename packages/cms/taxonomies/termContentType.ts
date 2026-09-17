import { borrowed, type ResolvedReferences } from "../content/references";
import type { ContentTypeConfig } from "../content/types";
import { termTreeAggregate } from "./tree";

/**
 * A term record's data file — `term.json`, one per slug.
 *
 * **An open record on purpose.** A vocabulary is site-level, and a site will
 * want fields the engine has no opinion about (an arrangement for a curated
 * front, a facet flag, a colour). Leaving the index signature off would make
 * every such field a type error at the site's own `buildIndexValue`, and would
 * preclude epic 24's D5 option 2 — terms absorbing collection groups — before
 * it is decided.
 *
 * The slug is not a field: it is the directory name, like every other content
 * type in the engine.
 */
export interface Term {
  /** What to print. The vocabulary's own spelling, which beats a fold's. */
  label: string;
  /** The sort key's first component, the repo-wide `[date, slug]` shape. */
  date: number;
  description?: string;
  image?: string;
  /**
   * The parent term's **slug**, or absent for a root term.
   *
   * Scalar, and that is the whole hierarchy design (D2/D3): a scalar reference
   * is one `updateDependents` can follow, so re-parenting is a one-field edit
   * and a parent rename rewrites its children for free. An array of parents
   * would be a DAG and would need F32.
   */
  parent?: string;
  [key: string]: unknown;
}

/** What the term index carries, so a tree read needs no data-file pass. */
export interface TermIndexValue {
  label: string;
  date: number;
  parent?: string;
  image?: string;
  /**
   * The parent's label, **borrowed** through the self-referencing edge below.
   *
   * Materialized here rather than looked up per render for the reason every
   * borrowed field is (§6.1): a breadcrumb otherwise costs one record read per
   * term page, and nothing would notice when the parent's label moved.
   */
  parentLabel?: string;
}

/** `[date, slug]`, the shape every content type in this repo keys by. */
export type TermIndexKey = [number, string];

export interface CreateTermContentTypeOptions {
  /**
   * The vocabulary's singular stem — the same string its `TaxonomyConfig.name`
   * carries. It names the content type `<taxonomy>-terms`, which is what scopes
   * the cache tags (`item:tag-terms`, `aggregate:tag-terms:tree`).
   */
  taxonomy: string;
  /**
   * Where the records live, relative to the content directory — e.g.
   * `"taxonomies/tag"`, giving `taxonomies/tag/data/<slug>/term.json` and
   * `taxonomies/tag/index`. `derivedDirectoriesOf` derives the ignore lines
   * from `indexDirectory`, so a new vocabulary needs no `.gitignore` edit.
   */
  directory: string;
  uploadsDirectory?: string;
  /**
   * A site's extension of the index value.
   *
   * Receives the record, its resolved references, and the value the engine
   * built, so a site adds fields rather than reimplementing `parentLabel`.
   * D5's option 2 is the case this exists for.
   */
  buildIndexValue?: (
    data: Term,
    refs: ResolvedReferences,
    base: TermIndexValue,
  ) => TermIndexValue;
}

/**
 * A vocabulary's **term records**: an ordinary content type, with one novelty.
 *
 * The novelty is that its reference edge points at **itself**. `references`
 * borrows the parent's `label`, and `referencedBy` declares that this same type
 * is the dependent to rewrite — so renaming a parent term rewrites every
 * child's `parent` field and every child's borrowed `parentLabel`, through the
 * machinery that already existed, with no hierarchy-aware code anywhere. No
 * other spec in the repo points a type at itself (T8), which is why 24a proves
 * this case in `test/taxonomies.test.ts` before 24c relies on it.
 *
 * Both halves are thunks, and here that is not a cycle-breaking formality but
 * a hard requirement: `config` is referenced inside its own initializer, so a
 * direct reference would read a `const` in its temporal dead zone and throw at
 * import time.
 *
 * **Records are optional and additive.** A term with carriers but no record is
 * still a term — the folds derive it from the carriers' strings, and nothing on
 * disk changes. A record with no carriers still gets a page. That is the hybrid
 * D3 chose over materialized paths or slug assignments.
 *
 * @example
 * ```ts
 * export const noteTermConfig = createTermContentType({
 *   taxonomy: "tag",
 *   directory: "taxonomies/tag",
 * });
 * ```
 */
export function createTermContentType(
  options: CreateTermContentTypeOptions,
): ContentTypeConfig<Term, TermIndexValue, TermIndexKey> {
  const { taxonomy, directory, uploadsDirectory, buildIndexValue } = options;

  const config: ContentTypeConfig<Term, TermIndexValue, TermIndexKey> = {
    contentType: `${taxonomy}-terms`,
    dataDirectory: `${directory}/data`,
    indexDirectory: `${directory}/index`,
    dataFilename: "term.json",
    ...(uploadsDirectory ? { uploadsDirectory } : {}),

    buildIndexValue: (data, refs): TermIndexValue => {
      /*
       * Optional fields are omitted rather than set to `undefined`. The index
       * value is hashed by the dependent pass and by every aggregate that folds
       * it, and LMDB's encoder does not round-trip an explicit `undefined`
       * identically to an absent key — so writing one would make a no-op
       * rewrite read as a change.
       */
      const base: TermIndexValue = { label: data.label, date: data.date };
      if (data.parent) base.parent = data.parent;
      if (typeof data.image === "string" && data.image) base.image = data.image;
      const parentLabel = borrowed<Term>(refs, "parent")?.label;
      if (typeof parentLabel === "string") base.parentLabel = parentLabel;

      return buildIndexValue ? buildIndexValue(data, refs, base) : base;
    },

    buildIndexKey: (slug, data): TermIndexKey => [data.date, slug],

    /* The inbound half: what this type reads off its parent. */
    references: [
      { config: () => config, dataField: "parent", fields: ["label"] },
    ],
    /*
     * The outbound half: who to rewrite when *this* term moves. `indexField`
     * rather than `dataField` alone, so the candidate scan is an index scan
     * instead of a read of every term's data file.
     */
    referencedBy: [{ config: () => config, indexField: "parent" }],

    aggregates: [termTreeAggregate()],
  };

  return config;
}

export default createTermContentType;
