/**
 * The vocabulary's write path: term records and their carriers, from plain
 * Node (31c, epic 24's 24e).
 *
 * Two things are written here, and the design is that they stay two things
 * (24-D3, the hybrid). A **term record** (`taxonomies/tag/data/<slug>/term.json`)
 * holds what a curator says about a term — label, description, picture,
 * parent, pinned front. A **carrier** is a recipe or a group whose `tags`
 * array holds a string that folds to the term's slug. A term may have either,
 * both, or (for a moment) neither, and every function below says which of the
 * two it touches:
 *
 * | Seat         | Record                       | Carriers                          |
 * | ------------ | ---------------------------- | --------------------------------- |
 * | `createTerm` | creates                      | —                                 |
 * | `updateTerm` | patches (parent, pinned, …)  | —                                 |
 * | `assignTerm` | —                            | adds / removes the tag            |
 * | `renameTerm` | moves to the new slug        | rewrites the tag string           |
 * | `mergeTerm`  | moved, or folded and deleted | re-tagged to the target           |
 * | `deleteTerm` | deletes                      | refused while carried (`unassign`) |
 *
 * The picture alone has its own seat, `setTermImage` (`recipeImage.ts`, 32c):
 * a URL, a file or a clear, one commit — `recipe_set_image`'s twin. A create
 * or update may carry an uploaded file too (`TermWriteOptions`), which is how
 * the browser form sends one.
 *
 * **One update per carrier, one commit per seat** (24-D7; F34, 32d): every
 * carrier write goes through `updateRecipe` / `updateGroup`, the same seats
 * `recipe_update` and `group_update` use, so normalisation, index keys,
 * aggregates and dependents are theirs. The commit is not: `assignTerm`,
 * `renameTerm`, `mergeTerm` and `deleteTerm` run inside `withBatchCommit`
 * (`batch.ts`), so a bulk assign over N carriers — or a merge's carriers,
 * children and features — is one commit, and a failure part-way commits what
 * landed as `… (partial)` (D3).
 *
 * **Matching is by slug.** A carrier carries a term when any of its tags
 * slugs to the term's slug (`tagSlug`, the fold's own identity), so
 * `"christmas cookies"` and `"Christmas-Cookies"` are the same term here
 * exactly as they are on `/tags`.
 *
 * **What string a carrier gets** (`carrierTag`): the record's label,
 * normalised, when that label slugs back to the term's slug — so the fold's
 * label and the record's agree — and the slug itself otherwise. A term with no
 * record uses the folds' label, and a term nobody has used yet, the string the
 * caller typed.
 *
 * **Node-safe reads only** (T5/D8): data files, the content indexes and the
 * aggregates read straight from LMDB, never a cached read. The hierarchy
 * comes from the term records' data files when a write is being validated
 * (the index may be about to change), and from the `tree` aggregate when a
 * read is being answered.
 */
import { readAggregate } from "@discontent/cms/aggregates/readAggregate";
import { createContent } from "@discontent/cms/content/createContent";
import { deleteContent } from "@discontent/cms/content/deleteContent";
import { getContentItemDirectory } from "@discontent/cms/content/filesystem";
import { readContentFileOrNull } from "@discontent/cms/content/readContentFile";
import { readContentIndex } from "@discontent/cms/content/readContentIndex";
import type {
  ContentTypeConfig,
  UploadSpec,
} from "@discontent/cms/content/types";
import { updateContent } from "@discontent/cms/content/updateContent";
import { readTaxonomyTerms } from "@discontent/cms/taxonomies/read";
import {
  termTreeAggregate,
  type TermTree,
} from "@discontent/cms/taxonomies/tree";
import { exists } from "fs-extra";
import { featuredRecipeContentConfig } from "recipe-website-common/controller/featuredRecipeContentConfig";
import { groupContentConfig } from "recipe-website-common/controller/groupContentConfig";
import { groupTagTaxonomy } from "recipe-website-common/controller/groupTagTaxonomy";
import { fold } from "recipe-website-common/components/SearchForm/queryLanguage";
import { normalizeTag } from "recipe-website-common/controller/normalizeTags";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import { recipeTagTaxonomy } from "recipe-website-common/controller/recipeTagTaxonomy";
import { tagSlug } from "recipe-website-common/controller/tagSlug";
import { tagTermContentConfig } from "recipe-website-common/controller/tagTermContentConfig";
import {
  breadcrumbOf,
  childrenOf,
  mergeTagVocabulary,
  subtreeKeys,
  subtreeSlugs,
  type TagVocabularyEntry,
} from "recipe-website-common/controller/tagVocabulary";
import type {
  FeaturedRecipe,
  FeaturedRecipeEntryKey,
  FeaturedRecipeEntryValue,
  Group,
  GroupEntryKey,
  GroupEntryValue,
  Recipe,
  RecipeEntryKey,
  RecipeEntryValue,
  TagTerm,
  TagTermEntryKey,
  TagTermIndexValue,
} from "recipe-website-common/controller/types";
import {
  checkImageFile,
  fetchImageFile,
  largeImageWarning,
} from "../imageImport";
import { withBatchCommit, countsTail } from "./batch";
import {
  batchOptions,
  collectBatch,
  groupPath,
  recipePath,
  termPath,
  termUrl,
  type CurationContext,
} from "./context";
import {
  CurationError,
  NotFoundError,
  SlugConflictError,
  TermCycleError,
  TermInUseError,
  UnknownGroupError,
  UnknownRecipeError,
  UnknownTermError,
  ValidationError,
} from "./errors";
import {
  findAllFeatured,
  findFeatured,
  unfeature,
  unfeatureTarget,
} from "./featured";
import { updateGroup } from "./groups";
import { updateRecipe } from "./recipes";
import {
  TermAssignSchema,
  TermInputSchema,
  TermMergeSchema,
  TermPatchSchema,
  TermRenameSchema,
  parseInput,
} from "./schema";

/* --- the vocabularies ------------------------------------------------------ */

/**
 * The taxonomies these seats write. One today: `tag`, the vocabulary recipes
 * and groups share. The API spells it into the URL
 * (`/api/taxonomies/<taxonomy>/…`) so a second vocabulary is a second value
 * here rather than a second set of routes.
 */
export const TERM_TAXONOMIES = ["tag"] as const;

/** A 404 for any taxonomy this site does not have. */
export function assertTaxonomy(taxonomy: string): void {
  if (!(TERM_TAXONOMIES as readonly string[]).includes(taxonomy)) {
    throw new NotFoundError(
      `No taxonomy "${taxonomy}". Known: ${TERM_TAXONOMIES.join(", ")}.`,
    );
  }
}

/* --- result shapes -------------------------------------------------------- */

/** Which kind of thing carries a tag. */
export type TermCarrierType = "recipe" | "group";

/** One row of `term_list`: the merged vocabulary, plus where the term sits. */
export interface TermRow {
  slug: string;
  /** Record label, else the recipe fold's, else the group fold's. */
  label: string;
  /** Own carriers (recipes + groups), as the folds count them. */
  count: number;
  /** The parent's slug, for a record that has one. */
  parent?: string;
  /** The record's aliases (32i), when it has any. */
  aliases?: string[];
  /** Whether a term record exists — a page with a curated front, featurable. */
  record: boolean;
}

export interface TermListResult {
  total: number;
  more: boolean;
  terms: TermRow[];
}

export interface TermDetail {
  slug: string;
  label: string;
  /** The term's page. */
  url: string;
  /** The record's data file, when there is a record. */
  path?: string;
  /** The record itself, or `null` for a term that only exists on carriers. */
  record: TagTerm | null;
  parent?: string;
  /**
   * Other spellings that reach this term (32i, D5) — `record.aliases`, lifted
   * so a caller need not dig. Absent when there are none.
   */
  aliases?: string[];
  /** Root first, this term last. */
  breadcrumb: TagVocabularyEntry[];
  /** Direct children, in the tree's order, each with its own count. */
  children: TagVocabularyEntry[];
  counts: {
    /** Carriers tagged with this term itself. */
    own: number;
    /** Distinct carriers tagged with it or with anything under it. */
    withDescendants: number;
  };
  /** The own carriers, by slug. */
  recipes: string[];
  groups: string[];
}

export interface TermWriteResult {
  slug: string;
  date: number;
  path: string;
  url: string;
  /** The string a carrier gets when this term is assigned to it. */
  tag: string;
  warnings?: string[];
}

export interface TermAssignResult {
  slug: string;
  type: TermCarrierType;
  tag: string;
  /** Carriers written — one update each. */
  updated: string[];
  /** Carriers that already said so (an add they had, a remove they lacked). */
  unchanged: string[];
  /**
   * Slugs that name no carrier of that type: a `remove` of one that is not
   * there, or (with `force`) an `add` of one not written yet (35-D10).
   */
  missing: string[];
  /** One line per `missing` slug, for the CLI's stderr and an agent's eye. */
  warnings?: string[];
}

export interface TermRenameResult {
  from: string;
  slug: string;
  label: string;
  tag: string;
  path: string;
  url: string;
  /** Whether a record moved (a term with only carriers has none to move). */
  record: boolean;
  /** Carriers whose tag string was rewritten. */
  recipes: string[];
  groups: string[];
  /**
   * The record's aliases after the rename (34-D4): the old slug joins them,
   * as a merge's `from` does (32i, D5), so `tag:<from>` and `/tags/<from>`
   * keep reaching the term. Empty when there was no record — a bare tag has
   * nowhere to keep an alias, and a rename does not create one.
   */
  aliases: string[];
}

export interface TermMergeResult {
  from: string;
  into: string;
  tag: string;
  /** Carriers moved from `from` to `into`. */
  recipes: string[];
  groups: string[];
  /**
   * `from`'s record became `into`'s, because `into` had none: children and
   * featured entries followed it by reference.
   */
  recordMoved: boolean;
  /** `from`'s record was deleted after its children and features moved. */
  deleted: boolean;
  /** Children of `from` given a new parent. */
  reparented: { slug: string; parent?: string }[];
  /** Featured entries re-pointed from `from` to `into`. */
  featured: string[];
  /**
   * Featured entries of `from` taken off the strip instead, because `into`
   * was already featured (epic 32: re-pointing would duplicate it, 31-D2).
   */
  unfeatured: string[];
  /**
   * `into`'s aliases after the merge (32i, D5): `from`'s slug and its own
   * aliases join them, so `tag:<from>` and `/tags/<from>` still reach the
   * term. Empty when neither term had a record — a bare tag has nowhere to
   * keep an alias.
   */
  aliases: string[];
}

export interface TermDeleteResult {
  slug: string;
  /** Whether a record was deleted (a carried-only term has none). */
  deleted: boolean;
  /** Carriers the tag was removed from (`unassign`). */
  recipes: string[];
  groups: string[];
  /** Children moved up to the deleted term's parent (or made roots). */
  reparented: { slug: string; parent?: string }[];
  /** Featured entries re-pointed at the deleted term's parent (epic 32, D1). */
  featured: string[];
  /**
   * Featured entries taken off the strip: the term had no parent, or its
   * parent was already featured (epic 32, D1).
   */
  unfeatured: string[];
}

/* --- reads ----------------------------------------------------------------- */

async function readTerm(
  ctx: CurationContext,
  slug: string,
): Promise<TagTerm | null> {
  return readContentFileOrNull<TagTerm, TagTermIndexValue, TagTermEntryKey>({
    config: tagTermContentConfig,
    slug,
    contentDirectory: ctx.contentDirectory,
  });
}

async function requireTerm(
  ctx: CurationContext,
  slug: string,
): Promise<TagTerm> {
  const term = await readTerm(ctx, slug);
  if (!term) {
    throw new NotFoundError(
      `No term record at slug "${slug}" — term_create writes one.`,
      slug,
    );
  }
  return term;
}

/** A recipe or group, by the one thing this module cares about: its tags. */
interface Carrier {
  type: TermCarrierType;
  slug: string;
  tags: string[];
}

/** Whether any tag in the list folds to `slug`. */
function carries(tags: readonly string[] | undefined, slug: string): boolean {
  return (tags ?? []).some((tag) => tagSlug(tag) === slug);
}

/**
 * Every carrier, from the two content indexes (whose values copy `tags`
 * verbatim). The indexes rather than the by-term aggregates, because an
 * aggregate is a fold that can be stale (T5) and this answers "who carries
 * it" for writes that act on the answer.
 */
async function readCarriers(ctx: CurationContext): Promise<Carrier[]> {
  const [recipes, groups] = await Promise.all([
    readContentIndex<RecipeEntryValue, RecipeEntryKey, Carrier>({
      config: recipeContentConfig,
      reverse: true,
      contentDirectory: ctx.contentDirectory,
      map: ({ key: [, slug], value }) => ({
        type: "recipe",
        slug,
        tags: value.tags ?? [],
      }),
    }),
    readContentIndex<GroupEntryValue, GroupEntryKey, Carrier>({
      config: groupContentConfig,
      reverse: true,
      contentDirectory: ctx.contentDirectory,
      map: ({ key: [, slug], value }) => ({
        type: "group",
        slug,
        tags: value.tags ?? [],
      }),
    }),
  ]);
  return [...recipes.entries, ...groups.entries];
}

function carriersOf(carriers: Carrier[], slug: string): Carrier[] {
  return carriers.filter((carrier) => carries(carrier.tags, slug));
}

function slugsOfType(carriers: Carrier[], type: TermCarrierType): string[] {
  return carriers
    .filter((carrier) => carrier.type === type)
    .map((carrier) => carrier.slug);
}

interface Vocabulary {
  entries: TagVocabularyEntry[];
  bySlug: Map<string, TagVocabularyEntry>;
  tree: TermTree;
}

/**
 * The merged vocabulary, as `/tags` builds it (`readTagVocabulary`), from the
 * same three aggregates read Node-safe — `tagResolver.ts`'s read, kept whole.
 */
async function readVocabulary(ctx: CurationContext): Promise<Vocabulary> {
  const { contentDirectory } = ctx;
  const [recipeTerms, groupTerms, tree] = await Promise.all([
    readTaxonomyTerms({
      config: recipeContentConfig,
      taxonomy: recipeTagTaxonomy,
      contentDirectory,
    }),
    readTaxonomyTerms({
      config: groupContentConfig,
      taxonomy: groupTagTaxonomy,
      contentDirectory,
    }),
    readAggregate({
      config: tagTermContentConfig,
      aggregateConfig: termTreeAggregate(),
      contentDirectory,
    }),
  ]);
  const entries = mergeTagVocabulary({ recipeTerms, groupTerms, tree });
  return {
    entries,
    bySlug: new Map(entries.map((entry) => [entry.slug, entry])),
    tree: tree ?? {},
  };
}

/** One term record as the term index has it. */
interface TermIndexRow {
  slug: string;
  date: number;
  parent?: string;
  aliases?: string[];
}

/** Every term record, from the term index: slug, date, parent, aliases. */
async function readTermRows(ctx: CurationContext): Promise<TermIndexRow[]> {
  const { entries } = await readContentIndex<
    TagTermIndexValue,
    TagTermEntryKey,
    TermIndexRow
  >({
    config: tagTermContentConfig,
    contentDirectory: ctx.contentDirectory,
    map: ({ key: [date, slug], value }) => ({
      slug,
      date,
      ...(value.parent ? { parent: value.parent } : {}),
      ...(value.aliases?.length ? { aliases: value.aliases } : {}),
    }),
  });
  return entries;
}

/* --- the carrier string ---------------------------------------------------- */

/**
 * What a carrier's `tags` gains when this term is assigned to it.
 *
 * The label, normalised, when it slugs back to the term — so the folds learn
 * the vocabulary's own spelling — and the slug otherwise, because a carrier
 * string that slugged anywhere else would be a *different* term.
 */
export function carrierTag(slug: string, label?: string): string {
  if (label) {
    const normalized = normalizeTag(label);
    if (normalized && tagSlug(normalized) === slug) return normalized;
  }
  return slug;
}

/**
 * Remove every tag folding to one of `remove`, and put `add` where the first
 * removed one was — so a rename keeps the carrier's tag order — unless the
 * carrier already has it. With nothing removed, `add` goes last.
 */
function retag(
  tags: readonly string[],
  remove: ReadonlySet<string>,
  add?: string,
): string[] {
  const kept = tags.filter((tag) => !remove.has(tagSlug(tag)));
  let placed = !add || carries(kept, tagSlug(add));
  const result: string[] = [];
  for (const tag of tags) {
    if (!remove.has(tagSlug(tag))) {
      result.push(tag);
    } else if (!placed && add) {
      result.push(add);
      placed = true;
    }
  }
  if (!placed && add) result.push(add);
  return result;
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

/**
 * One carrier, read from its data file, re-tagged through its own seat.
 *
 * The data file rather than the index value, because the write replaces the
 * whole list and the data file is what it replaces. `null` — not `[]` — when
 * nothing is left, the patch contract's "clear".
 */
async function retagCarrier(
  ctx: CurationContext,
  type: TermCarrierType,
  slug: string,
  transform: (tags: readonly string[]) => string[],
): Promise<"updated" | "unchanged" | "missing"> {
  const current =
    type === "recipe"
      ? await readContentFileOrNull<Recipe, RecipeEntryValue, RecipeEntryKey>({
          config: recipeContentConfig,
          slug,
          contentDirectory: ctx.contentDirectory,
        })
      : await readContentFileOrNull<Group, GroupEntryValue, GroupEntryKey>({
          config: groupContentConfig,
          slug,
          contentDirectory: ctx.contentDirectory,
        });
  if (!current) return "missing";
  const before = (current.tags as string[] | undefined) ?? [];
  const after = transform(before);
  if (sameTags(before, after)) return "unchanged";
  const patch = { tags: after.length > 0 ? after : null };
  if (type === "recipe") await updateRecipe(ctx, slug, patch);
  else await updateGroup(ctx, slug, patch);
  return "updated";
}

/**
 * Re-tag a list of known carriers, reporting the ones that moved by type.
 *
 * `moved` is filled as each carrier lands rather than returned at the end, so
 * a batch message read after a failure part-way (`withBatchCommit`'s partial)
 * counts the carriers that were written.
 */
async function retagAll(
  ctx: CurationContext,
  carriers: Carrier[],
  transform: (tags: readonly string[]) => string[],
  moved: { recipes: string[]; groups: string[] } = { recipes: [], groups: [] },
): Promise<{ recipes: string[]; groups: string[] }> {
  const { recipes, groups } = moved;
  for (const carrier of carriers) {
    const outcome = await retagCarrier(
      ctx,
      carrier.type,
      carrier.slug,
      transform,
    );
    if (outcome !== "updated") continue;
    (carrier.type === "recipe" ? recipes : groups).push(carrier.slug);
  }
  return { recipes, groups };
}

/* --- validation ------------------------------------------------------------ */

/**
 * How deep a chain of terms may go. A bound rather than a promise, as
 * `MAX_GROUP_DEPTH` is: the walk terminates on its visited set alone, and this
 * keeps a legitimate but absurd chain out of the breadcrumb.
 */
const MAX_TERM_DEPTH = 32;

/**
 * A `parent` that exists and does not make `slug` its own ancestor.
 *
 * `parent === slug` comes first (24-T8): the engine's dependent scan matches
 * `value.parent === <old slug>`, so a self-parented term would be its own
 * candidate. Then the parent must be a **record** — the tree links a child
 * only to a parent that has one, so a bare tag as parent would leave the child
 * a root that merely claims otherwise. Then the walk up, over data files: the
 * write being validated has not happened, and the index may be about to move.
 *
 * The path reads like `group_cycle`'s, outermost-first and closing on itself:
 * `["a", "b", "a"]` is "a would sit under b, which already sits under a".
 */
async function assertParent(
  ctx: CurationContext,
  slug: string,
  parent: string,
): Promise<void> {
  if (parent === slug) throw new TermCycleError([slug, slug]);
  const parentRecord = await readTerm(ctx, parent);
  if (!parentRecord) throw new UnknownTermError([parent]);

  const path = [slug, parent];
  const visited = new Set([parent]);
  let current = parentRecord.parent;
  while (current) {
    if (current === slug) throw new TermCycleError([...path, slug]);
    /* A hand-edited cycle further up that does not involve `slug`. */
    if (visited.has(current)) return;
    if (path.length >= MAX_TERM_DEPTH) {
      throw new TermCycleError(
        path,
        `Terms may not nest deeper than ${MAX_TERM_DEPTH}: ${path.join(" → ")}.`,
      );
    }
    visited.add(current);
    path.push(current);
    current = (await readTerm(ctx, current))?.parent;
  }
}

/** First occurrence wins, so a pinned list keeps the order it was given. */
function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Every pinned slug must be a recipe the term's page lists (24c's second
 * answer): the page ignores one it does not, so storing it would be a promise
 * the page silently breaks.
 *
 * Since 34a a page lists its whole subtree, and since 35-D12 so does this
 * check: a recipe qualifies when any of its tags slugs to a key of
 * `subtreeKeys(tree, slug)` — the term, a narrower term, or an alias of
 * either — so a facet root (`course`, which nothing carries itself) can pin a
 * dessert. The tree is the aggregate, read Node-safe, as `readVocabulary`
 * reads it; a term with no record yet is a subtree of one, itself.
 */
async function assertPinned(
  ctx: CurationContext,
  slug: string,
  pinned: readonly string[],
): Promise<void> {
  const tree = await readAggregate({
    config: tagTermContentConfig,
    aggregateConfig: termTreeAggregate(),
    contentDirectory: ctx.contentDirectory,
  });
  const keys = new Set(subtreeKeys(tree, slug));
  const issues: { path: string; message: string }[] = [];
  for (const [index, recipeSlug] of pinned.entries()) {
    const recipe = await readContentFileOrNull<
      Recipe,
      RecipeEntryValue,
      RecipeEntryKey
    >({
      config: recipeContentConfig,
      slug: recipeSlug,
      contentDirectory: ctx.contentDirectory,
    });
    if (!recipe) {
      issues.push({
        path: `pinned.${index}`,
        message: `No recipe at slug "${recipeSlug}"`,
      });
    } else if (!(recipe.tags ?? []).some((tag) => keys.has(tagSlug(tag)))) {
      issues.push({
        path: `pinned.${index}`,
        message: `Recipe "${recipeSlug}" does not carry "${slug}" or a narrower term — assign the term to it first`,
      });
    }
  }
  if (issues.length > 0) {
    throw new ValidationError(
      `Pinned recipes must carry the term "${slug}" or a narrower one`,
      issues,
    );
  }
}

/** A warning, when a label would not fold to its own record's slug. */
function labelWarnings(slug: string, label: string): string[] {
  return tagSlug(normalizeTag(label)) === slug
    ? []
    : [
        `The label "${label}" does not slug to "${slug}", so carriers are tagged "${slug}" and the record supplies the label.`,
      ];
}

/**
 * Aliases deduplicated by slug, first spelling kept, minus any that slug to
 * `own` — the list a merge writes, where nothing is refused.
 */
function dedupeAliases(aliases: readonly string[], own: string): string[] {
  const seen = new Set<string>([own]);
  const kept: string[] = [];
  for (const alias of aliases) {
    const slug = tagSlug(alias);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    kept.push(alias);
  }
  return kept;
}

/**
 * How `tag:` spells an alias (`tagExpansion.ts`): folded as typed, and folded
 * as its slug. A label is spelled `fold(label).trim()`.
 */
function aliasSpellings(alias: string): string[] {
  return [...new Set([fold(alias).trim(), fold(tagSlug(alias))])].filter(
    Boolean,
  );
}

function labelSpelling(label: string): string {
  return fold(label).trim();
}

/**
 * The record, other than `except`, one of whose aliases is spelled like
 * `label` — so `tag:<label>` would be contested between the two.
 */
function labelAliasOwner(
  rows: readonly TermIndexRow[],
  label: string,
  except?: string,
): string | undefined {
  const spelling = labelSpelling(label);
  return rows.find(
    (row) =>
      row.slug !== except &&
      row.aliases?.some((alias) => aliasSpellings(alias).includes(spelling)),
  )?.slug;
}

/**
 * The record that lists `slug` as an alias, other than `except` — from the
 * term index, which every record write keeps current.
 */
/**
 * The record `slug` is an alias of, and the record whose alias `label` is
 * spelled like (except `slug`'s own) — for a caller that must decide before
 * it writes, as roundup import (34f) does before its first fetch.
 */
export async function termAliasOwners(
  ctx: CurationContext,
  slug: string,
  label?: string,
): Promise<{ slug?: string; label?: string }> {
  const rows = await readTermRows(ctx);
  return {
    slug: aliasOwner(rows, slug),
    label: label ? labelAliasOwner(rows, label, slug) : undefined,
  };
}

function aliasOwner(
  rows: readonly TermIndexRow[],
  slug: string,
  except?: string,
): string | undefined {
  return rows.find(
    (row) =>
      row.slug !== except &&
      row.aliases?.some((alias) => tagSlug(alias) === slug),
  )?.slug;
}

/**
 * A record's new alias list, normalised as a tag is and deduplicated by slug
 * (32i, D5). Each alias **added** by this write may not slug to the term
 * itself, to another term (a record, or a tag something carries), or to
 * another record's alias, and may not be spelled like another term's label
 * (`tag:` matches labels too, so an alias "biscuits" would contest
 * `tag:"Biscuits"` with a record of that label at another slug): any of those
 * would make `tag:<alias>` mean two things. Every clash is one `validation`
 * issue on `aliases.<i>`, naming the term it collides with.
 *
 * Aliases the record already has are kept without the check. Nothing
 * canonicalises a carrier's tags (D5), so a recipe can come to carry an
 * alias as a tag after it was recorded — a merged term's old slug typed
 * again — and refusing every later edit of the record for it would be a
 * trap. Search resolves that case in the alias's favour (`tagExpansion.ts`).
 */
async function assertAliases(
  ctx: CurationContext,
  slug: string,
  aliases: readonly string[],
  existing: readonly string[] = [],
): Promise<string[]> {
  const kept = new Set(existing.map((alias) => tagSlug(alias)));
  const [vocabulary, rows] = await Promise.all([
    readVocabulary(ctx),
    readTermRows(ctx),
  ]);
  const issues: { path: string; message: string }[] = [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of aliases.entries()) {
    const alias = normalizeTag(raw);
    const aliasSlug = tagSlug(alias);
    const path = `aliases.${index}`;
    if (!aliasSlug) {
      issues.push({ path, message: `"${raw}" does not slugify to anything` });
      continue;
    }
    if (seen.has(aliasSlug)) continue;
    seen.add(aliasSlug);
    if (aliasSlug === slug) {
      issues.push({
        path,
        message: `"${raw}" is this term's own slug`,
      });
      continue;
    }
    if (!kept.has(aliasSlug)) {
      const owner = aliasOwner(rows, aliasSlug, slug);
      if (owner) {
        issues.push({
          path,
          message: `"${raw}" is already an alias of the term "${owner}"`,
        });
        continue;
      }
      if (
        vocabulary.bySlug.has(aliasSlug) ||
        (await exists(termPath(ctx, aliasSlug)))
      ) {
        issues.push({
          path,
          message: `"${raw}" names the term "${aliasSlug}" — term_merge folds it into this one and records the alias`,
        });
        continue;
      }
      const spellings = aliasSpellings(alias);
      const labelled = vocabulary.entries.find(
        (entry) =>
          entry.slug !== slug && spellings.includes(labelSpelling(entry.label)),
      );
      if (labelled) {
        issues.push({
          path,
          message: `"${raw}" is the label of the term "${labelled.slug}"`,
        });
        continue;
      }
    }
    result.push(alias);
  }
  if (issues.length > 0) {
    throw new ValidationError(
      `Aliases must not name another term or another term's alias`,
      issues,
    );
  }
  return result;
}

/**
 * A new term at `slug` may not take another record's alias (32i): search
 * resolves the alias to that record, so the new term could not be found by
 * its own name. `field` is the input that named it (`slug`, or a rename's
 * `to`).
 */
async function assertNotAlias(
  ctx: CurationContext,
  slug: string,
  field: string,
  except?: string,
): Promise<void> {
  const owner = aliasOwner(await readTermRows(ctx), slug, except);
  if (owner) {
    throw new ValidationError(`"${slug}" is an alias of the term "${owner}"`, [
      {
        path: field,
        message: `"${slug}" is an alias of the term "${owner}" — take it off the aliases of "${owner}" first`,
      },
    ]);
  }
}

/**
 * A label may not be spelled like another record's alias (32i): `tag:` would
 * then resolve the name to that record, and this term could not be found by
 * its own label. Checked only when the label is new or changes, so an
 * unrelated edit never trips on a state the write did not create.
 */
async function assertLabelNotAlias(
  ctx: CurationContext,
  label: string,
  slug: string,
): Promise<void> {
  const owner = labelAliasOwner(await readTermRows(ctx), label, slug);
  if (owner) {
    throw new ValidationError(`"${label}" is an alias of the term "${owner}"`, [
      {
        path: "label",
        message: `"${label}" is an alias of the term "${owner}" — take it off the aliases of "${owner}" first`,
      },
    ]);
  }
}

/* --- record writes --------------------------------------------------------- */

/**
 * One term record rewritten — every record write except create and delete
 * comes through here, so the index key, the picture carried forward and the
 * write event are stated once. `uploads` defaults to "keep the picture".
 */
async function writeTermRecord(
  ctx: CurationContext,
  {
    currentSlug,
    slug = currentSlug,
    current,
    data,
    uploads,
    commitMessage,
  }: {
    currentSlug: string;
    slug?: string;
    current: TagTerm;
    data: TagTerm;
    uploads?: Record<string, UploadSpec>;
    commitMessage: string;
  },
): Promise<void> {
  const result = await updateContent<
    TagTerm,
    TagTermIndexValue,
    TagTermEntryKey
  >({
    config: tagTermContentConfig,
    slug,
    currentSlug,
    currentIndexKey: [current.date, currentSlug],
    data,
    uploads: uploads ?? { image: { existingFile: current.image } },
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage,
    ...batchOptions(ctx),
  });
  collectBatch(ctx, result);
  ctx.onWrite?.({
    contentType: tagTermContentConfig.contentType,
    kind: "update",
    result,
    slug,
    ...(slug !== currentSlug ? { previousSlug: currentSlug } : {}),
  });
}

/** A child's parent replaced (or cleared), one commit. */
async function reparent(
  ctx: CurationContext,
  childSlug: string,
  parent: string | undefined,
): Promise<{ slug: string; parent?: string } | null> {
  const child = await readTerm(ctx, childSlug);
  if (!child) return null;
  const data: TagTerm = { ...child };
  if (parent && parent !== childSlug) data.parent = parent;
  else delete data.parent;
  await writeTermRecord(ctx, {
    currentSlug: childSlug,
    current: child,
    data,
    commitMessage: `Update term: ${childSlug}`,
  });
  return { slug: childSlug, ...(data.parent ? { parent: data.parent } : {}) };
}

async function deleteTermRecord(
  ctx: CurationContext,
  slug: string,
  current: TagTerm,
): Promise<void> {
  const result = await deleteContent<
    TagTerm,
    TagTermIndexValue,
    TagTermEntryKey
  >({
    config: tagTermContentConfig,
    slug,
    indexKey: [current.date, slug],
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage: `Delete term: ${slug}`,
    ...batchOptions(ctx),
  });
  collectBatch(ctx, result);
  ctx.onWrite?.({
    contentType: tagTermContentConfig.contentType,
    kind: "delete",
    result,
    slug,
  });
}

/* --- seats: reads ---------------------------------------------------------- */

/**
 * The vocabulary, sorted by slug: every term any carrier uses, plus every
 * record, with its own count and its parent. `records: true` keeps only the
 * terms that have a record. Unpaged unless asked, like `tag_list`.
 */
export async function listTerms(
  ctx: CurationContext,
  {
    limit,
    offset = 0,
    records = false,
  }: { limit?: number; offset?: number; records?: boolean } = {},
): Promise<TermListResult> {
  const { entries, tree } = await readVocabulary(ctx);
  const rows: TermRow[] = entries
    .map((entry) => {
      const node = tree[entry.slug];
      return {
        slug: entry.slug,
        label: entry.label,
        count: entry.count,
        ...(node?.parent ? { parent: node.parent } : {}),
        ...(node?.aliases?.length ? { aliases: node.aliases } : {}),
        record: node !== undefined,
      };
    })
    .filter((row) => !records || row.record);
  const page =
    limit === undefined
      ? rows.slice(offset)
      : rows.slice(offset, offset + limit);
  return {
    total: rows.length,
    more: offset + page.length < rows.length,
    terms: page,
  };
}

/**
 * One term: its record (or `null`), where it sits, and who carries it —
 * `counts.own` is this term's carriers, `counts.withDescendants` the distinct
 * carriers of it and everything under it, which is what `tag:<slug>` answers.
 */
export async function getTerm(
  ctx: CurationContext,
  slug: string,
): Promise<TermDetail> {
  const [record, carriers, vocabulary] = await Promise.all([
    readTerm(ctx, slug),
    readCarriers(ctx),
    readVocabulary(ctx),
  ]);
  const own = carriersOf(carriers, slug);
  if (!record && own.length === 0 && !vocabulary.bySlug.has(slug)) {
    throw new NotFoundError(`No term at slug "${slug}"`, slug);
  }
  const subtree = new Set(subtreeSlugs(vocabulary.tree, slug));
  const withDescendants = carriers.filter((carrier) =>
    carrier.tags.some((tag) => subtree.has(tagSlug(tag))),
  );
  return {
    slug,
    label: record?.label ?? vocabulary.bySlug.get(slug)?.label ?? slug,
    url: termUrl(slug),
    ...(record ? { path: termPath(ctx, slug) } : {}),
    record,
    ...(record?.parent ? { parent: record.parent } : {}),
    ...(record?.aliases?.length ? { aliases: record.aliases } : {}),
    breadcrumb: breadcrumbOf(vocabulary.tree, slug, vocabulary.bySlug),
    children: childrenOf(vocabulary.tree, slug, vocabulary.bySlug),
    counts: { own: own.length, withDescendants: withDescendants.length },
    recipes: slugsOfType(own, "recipe"),
    groups: slugsOfType(own, "group"),
  };
}

/* --- seats: record writes -------------------------------------------------- */

/**
 * The non-schema half of a record write (32c): an uploaded picture. It is not
 * in `TermInputSchema` / `TermPatchSchema` because a `File` is not JSON — the
 * browser form is the one transport that has one to hand, and `setTermImage`
 * (`term_set_image`) is the seat every other transport uploads through.
 */
export interface TermWriteOptions {
  /** Beats `imageImportUrl` — and, on an update, a clear — as the forms do. */
  imageFile?: File;
}

/**
 * The picture a create or update writes, if any: the uploaded file, checked as
 * `setTermImage` checks one, else the URL, fetched. A file wins outright, so a
 * URL beside it is never downloaded. A refused file is a `validation` issue on
 * `image`, so the form prints the reason beside its file input.
 */
async function termImageFile(
  imageFile: File | undefined,
  imageImportUrl: string | null | undefined,
): Promise<{ file?: File; warning?: string }> {
  let file: File | undefined;
  let url: string | undefined;
  if (imageFile) {
    try {
      file = checkImageFile(imageFile);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      throw new ValidationError("The image was refused", [
        { path: "image", message: error.message },
      ]);
    }
  } else if (imageImportUrl) {
    url = imageImportUrl;
    file = await fetchImageFile(url);
  }
  const warning = file && largeImageWarning(file.size, url);
  return { file, ...(warning ? { warning } : {}) };
}

export async function createTerm(
  ctx: CurationContext,
  raw: unknown,
  { imageFile: uploaded }: TermWriteOptions = {},
): Promise<TermWriteResult> {
  const input = parseInput(TermInputSchema, raw);
  const slug = tagSlug(input.slug || input.label);
  if (!slug) {
    throw new ValidationError(
      `Could not derive a slug from label "${input.label}" — pass an explicit slug.`,
    );
  }
  /*
   * Before the picture is fetched, so a conflict costs no download — the
   * reason `updateGroup` pre-checks a rename. `createContent` would refuse the
   * occupied directory too, after the fetch.
   */
  const directory = getContentItemDirectory(
    tagTermContentConfig as unknown as ContentTypeConfig,
    slug,
    ctx.contentDirectory,
  );
  if (await exists(directory)) throw new SlugConflictError(slug);
  await assertNotAlias(ctx, slug, "slug");
  await assertLabelNotAlias(ctx, input.label, slug);

  const parent = input.parent ? tagSlug(input.parent) : undefined;
  if (parent) await assertParent(ctx, slug, parent);
  const pinned = dedupe(input.pinned ?? []);
  if (pinned.length > 0) await assertPinned(ctx, slug, pinned);
  const aliases = input.aliases?.length
    ? await assertAliases(ctx, slug, input.aliases)
    : [];

  const { file: imageFile, warning: imageWarning } = await termImageFile(
    uploaded,
    input.imageImportUrl,
  );
  const date = input.date ?? Date.now();

  /* Optional keys spread only when set, as every record in this repo is. */
  const data: TagTerm = {
    label: input.label,
    date,
    ...(input.description ? { description: input.description } : {}),
    ...(imageFile ? { image: imageFile.name } : {}),
    ...(parent ? { parent } : {}),
    ...(pinned.length > 0 ? { pinned } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
  };

  const result = await createContent<
    TagTerm,
    TagTermIndexValue,
    TagTermEntryKey
  >({
    config: tagTermContentConfig,
    slug,
    data,
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage: `Create term: ${slug}`,
    ...(imageFile ? { uploads: { image: { file: imageFile } } } : {}),
    /* Inside a batch (34f's roundup import: create, then assign) the record
     * joins the batch's one commit; outside one this is a no-op. */
    ...batchOptions(ctx),
  });
  collectBatch(ctx, result);
  ctx.onWrite?.({
    contentType: tagTermContentConfig.contentType,
    kind: "create",
    result,
    slug,
  });

  const warnings = [
    ...labelWarnings(slug, input.label),
    ...(imageWarning ? [imageWarning] : []),
  ];
  return {
    slug,
    date,
    path: termPath(ctx, slug),
    url: termUrl(slug),
    tag: carrierTag(slug, input.label),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * Label, description, picture, parent, pinned, date — everything about a
 * record except its slug, which is `renameTerm`'s (it rewrites carriers too).
 * A label change reaches children (`parentLabel`) and features (`termLabel`)
 * through the engine's dependent pass, as a group rename does.
 */
export async function updateTerm(
  ctx: CurationContext,
  slug: string,
  rawPatch: unknown,
  { imageFile: uploaded }: TermWriteOptions = {},
): Promise<TermWriteResult> {
  const patch = parseInput(TermPatchSchema, rawPatch);
  const current = await requireTerm(ctx, slug);

  const data: TagTerm = { ...current };
  if (patch.label !== undefined) {
    if (labelSpelling(patch.label) !== labelSpelling(current.label)) {
      await assertLabelNotAlias(ctx, patch.label, slug);
    }
    data.label = patch.label;
  }
  if (patch.date !== undefined) data.date = patch.date;
  if (patch.description === null) delete data.description;
  else if (patch.description !== undefined) {
    data.description = patch.description;
  }

  if (patch.parent === null) {
    delete data.parent;
  } else if (patch.parent !== undefined) {
    const parent = tagSlug(patch.parent);
    await assertParent(ctx, slug, parent);
    data.parent = parent;
  }

  if (patch.pinned === null) {
    delete data.pinned;
  } else if (patch.pinned !== undefined) {
    const pinned = dedupe(patch.pinned);
    if (pinned.length > 0) {
      await assertPinned(ctx, slug, pinned);
      data.pinned = pinned;
    } else {
      delete data.pinned;
    }
  }

  if (patch.aliases === null) {
    delete data.aliases;
  } else if (patch.aliases !== undefined) {
    const aliases = await assertAliases(
      ctx,
      slug,
      patch.aliases,
      current.aliases,
    );
    if (aliases.length > 0) data.aliases = aliases;
    else delete data.aliases;
  }

  const { file: imageFile, warning: imageWarning } = await termImageFile(
    uploaded,
    patch.imageImportUrl,
  );
  /* A file beats a clear as well as a URL — the recipe and group forms'
   * precedence — so "Remove Image" ticked beside a new file replaces it. */
  const clearImage = !imageFile && patch.imageImportUrl === null;
  const image = imageFile
    ? imageFile.name
    : clearImage
      ? undefined
      : current.image;
  if (image) data.image = image;
  else delete data.image;

  await writeTermRecord(ctx, {
    currentSlug: slug,
    current,
    data,
    uploads: {
      image: {
        file: imageFile,
        clearFile: clearImage,
        existingFile: current.image,
      },
    },
    commitMessage: `Update term: ${slug}`,
  });

  const warnings = [
    ...labelWarnings(slug, data.label),
    ...(imageWarning ? [imageWarning] : []),
  ];
  return {
    slug,
    date: data.date,
    path: termPath(ctx, slug),
    url: termUrl(slug),
    tag: carrierTag(slug, data.label),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/* --- seats: carriers ------------------------------------------------------- */

/**
 * Tag (`add`) and untag (`remove`) carriers of one `type` — recipes unless
 * said otherwise — one update each, one commit for the lot (F34):
 * `Assign term: cookies (+5 recipes)`, `Unassign term: cookies (-2 recipes)`,
 * or both counts when a call adds and removes.
 *
 * No record is required: assigning a term nobody has described yet is how a
 * bare tag has always come into being, and `term_create` can describe it
 * later. `slug` may be given as a label; it is slugged, and a term with no
 * record and no carriers yet is written with that spelling.
 *
 * **Every `add` must name a carrier that exists** (35-D10), checked before
 * anything is written — `unknown_recipe` / `unknown_group`, naming them all,
 * as the group seats refuse a dangling item. Epic 34's seasonal round ran an
 * assign before the import it depended on and lost a recipe to a quiet
 * `missing` (34e). `force` keeps the old behaviour: the slug is reported under
 * `missing` with a warning, and the CLI exits non-zero. A `remove` of a
 * carrier that is not there was never a hazard — the tag is not on it either
 * way — so it stays a `missing` report (with its warning) and never throws.
 */
export async function assignTerm(
  ctx: CurationContext,
  rawSlug: string,
  raw: unknown,
): Promise<TermAssignResult> {
  const input = parseInput(TermAssignSchema, raw);
  const slug = tagSlug(rawSlug);
  if (!slug) {
    throw new ValidationError(`"${rawSlug}" does not slugify to anything.`);
  }
  const type = input.type ?? "recipe";
  const adds = dedupe(input.add ?? []);
  /*
   * Whether each data file is there, not whether it parses: a corrupt file
   * is the write's own failure, part-way, committed `(partial)` (F34) — the
   * check only stops a slug that names nothing.
   */
  const dataFile = type === "recipe" ? recipePath : groupPath;
  const unknown: string[] = [];
  for (const carrier of adds) {
    if (!(await exists(dataFile(ctx, carrier)))) unknown.push(carrier);
  }
  if (unknown.length > 0 && !input.force) {
    throw type === "recipe"
      ? new UnknownRecipeError(unknown)
      : new UnknownGroupError(unknown, { forceHint: true });
  }
  const [record, vocabulary] = await Promise.all([
    readTerm(ctx, slug),
    readVocabulary(ctx),
  ]);
  const tag = carrierTag(
    slug,
    record?.label ?? vocabulary.bySlug.get(slug)?.label ?? rawSlug,
  );

  const result: TermAssignResult = {
    slug,
    type,
    tag,
    updated: [],
    unchanged: [],
    missing: [],
  };
  const report = (outcome: "updated" | "unchanged" | "missing", s: string) =>
    result[outcome].push(s);

  let added = 0;
  let removed = 0;
  const message = () =>
    `${added === 0 && removed > 0 ? "Unassign" : "Assign"} term: ${slug}` +
    countsTail([
      [added, type, "+"],
      [removed, type, "-"],
    ]);
  await withBatchCommit(ctx, message, async (batchCtx) => {
    for (const carrier of adds) {
      const outcome = await retagCarrier(batchCtx, type, carrier, (tags) =>
        carries(tags, slug) ? [...tags] : [...tags, tag],
      );
      if (outcome === "updated") added += 1;
      report(outcome, carrier);
    }
    for (const carrier of dedupe(input.remove ?? [])) {
      const outcome = await retagCarrier(batchCtx, type, carrier, (tags) =>
        tags.filter((t) => tagSlug(t) !== slug),
      );
      if (outcome === "updated") removed += 1;
      report(outcome, carrier);
    }
  });
  if (result.missing.length > 0) {
    const removes = new Set(input.remove ?? []);
    result.warnings = result.missing.map((carrier) =>
      removes.has(carrier)
        ? `No ${type} "${carrier}" — nothing to remove.`
        : `No ${type} "${carrier}" — not tagged; assign again once it exists.`,
    );
  }
  return result;
}

/**
 * Move a term to a new slug: the record (when there is one) and every
 * carrier's tag string.
 *
 * The record moves through `updateContent` with a new slug, so its children's
 * `parent` and every feature's `term` follow by reference (24-T8, proven at
 * 24a) — no hierarchy code here. The carriers are rewritten one update each to
 * the new carrier string, and the record and carriers land as one commit
 * (F34): `Rename term: a → b (5 recipes, 1 group)`, or the bare
 * `Rename term: a → b` when only the record moved. Renaming onto a term that
 * already exists — a record or carriers — is `slug_conflict`; that is
 * `term_merge`. The old slug stays on the record as an alias (34-D4), so
 * `/tags/a` and `tag:a` still reach it.
 */
export async function renameTerm(
  ctx: CurationContext,
  slug: string,
  raw: unknown,
): Promise<TermRenameResult> {
  const input = parseInput(TermRenameSchema, raw);
  const to = tagSlug(input.to);
  if (!to) {
    throw new ValidationError(`"${input.to}" does not slugify to anything.`);
  }
  if (to === slug) {
    throw new ValidationError(
      `"${input.to}" is already this term's slug — term_update changes only the label.`,
    );
  }

  const [record, carriers, targetRecord] = await Promise.all([
    readTerm(ctx, slug),
    readCarriers(ctx),
    readTerm(ctx, to),
  ]);
  const own = carriersOf(carriers, slug);
  if (!record && own.length === 0) {
    throw new NotFoundError(`No term at slug "${slug}"`, slug);
  }
  if (targetRecord || carriersOf(carriers, to).length > 0) {
    throw new CurationError(
      "slug_conflict",
      `Term "${to}" already exists — merge "${slug}" into it instead.`,
      { slug: to },
    );
  }
  await assertNotAlias(ctx, to, "to", slug);

  /*
   * The record's label survives a rename that keeps it valid (a pure slug
   * fix); otherwise the new label is what was asked for — the `label` input,
   * or `to` as typed, so `rename christmas-cookies "Holiday Cookies"` reads
   * right without a second flag.
   */
  const label =
    input.label ??
    (record && tagSlug(normalizeTag(record.label)) === to
      ? record.label
      : input.to);
  if (!record || labelSpelling(label) !== labelSpelling(record.label)) {
    await assertLabelNotAlias(ctx, label, slug);
  }
  const tag = carrierTag(to, label);

  /*
   * The old slug becomes an alias (34-D4), so links and searches that still
   * say it reach the term. Renamed onto one of its own aliases, that alias is
   * now the slug and drops out; renamed back, the slug it returns to drops
   * out the same way. Skipped when a third record already lists it — that
   * would contest `tag:<from>`, as a merge's skip does. No record, no
   * aliases: a rename does not create a record, as a bare merge does not.
   */
  const aliases = record
    ? dedupeAliases(
        [
          ...(record.aliases ?? []),
          ...(aliasOwner(await readTermRows(ctx), slug, slug) ? [] : [slug]),
        ],
        to,
      )
    : [];

  const moved = { recipes: [] as string[], groups: [] as string[] };
  const message = () =>
    `Rename term: ${slug} → ${to}` +
    countsTail([
      [moved.recipes.length, "recipe"],
      [moved.groups.length, "group"],
    ]);
  await withBatchCommit(ctx, message, async (batchCtx) => {
    if (record) {
      const data: TagTerm = { ...record, label };
      if (aliases.length > 0) data.aliases = aliases;
      else delete data.aliases;
      await writeTermRecord(batchCtx, {
        currentSlug: slug,
        slug: to,
        current: record,
        data,
        commitMessage: `Rename term: ${slug} → ${to}`,
      });
    }
    await retagAll(
      batchCtx,
      own,
      (tags) => retag(tags, new Set([slug]), tag),
      moved,
    );
  });

  return {
    from: slug,
    slug: to,
    label,
    tag,
    path: termPath(ctx, to),
    url: termUrl(to),
    record: Boolean(record),
    ...moved,
    aliases,
  };
}

/**
 * Fold `from` into `into`: every carrier of `from` is re-tagged to `into`, and
 * `from`'s record goes away.
 *
 * Two shapes for the record, chosen by whether `into` has one:
 *
 * - **`into` has no record** — `from`'s record *moves* to `into` (a rename of
 *   the record alone, labelled with `into`'s fold label), so its curation —
 *   description, picture, pinned front — survives, and its children and
 *   features follow by reference.
 * - **`into` has a record** — `from`'s children are re-parented to `into`
 *   (any of them that is `into` or one of its ancestors goes to `from`'s own
 *   parent instead, so the merge cannot close a cycle), features of `from`
 *   are re-pointed at `into` (or unfeatured, when `into` is already
 *   featured), `from`'s pinned recipes join the end of `into`'s, and
 *   `from`'s record is deleted.
 *
 * Either way `from` becomes an alias of `into` (32i, D5), along with `from`'s
 * own aliases, so a search or a link that still says `from` reaches the term.
 * A bare tag merged into a bare tag records nothing: there is no record to
 * keep the alias on.
 *
 * Every write lands in one commit (F34), counted in its message:
 * `Merge term: a → b (5 recipes, 2 children, 1 feature)`.
 */
export async function mergeTerm(
  ctx: CurationContext,
  from: string,
  raw: unknown,
): Promise<TermMergeResult> {
  const input = parseInput(TermMergeSchema, raw);
  const into = tagSlug(input.into);
  if (into === from) {
    throw new ValidationError(`A term cannot be merged into itself.`);
  }
  const [fromRecord, intoRecord, carriers, vocabulary] = await Promise.all([
    readTerm(ctx, from),
    readTerm(ctx, into),
    readCarriers(ctx),
    readVocabulary(ctx),
  ]);
  const fromCarriers = carriersOf(carriers, from);
  if (!fromRecord && fromCarriers.length === 0) {
    throw new NotFoundError(`No term at slug "${from}"`, from);
  }
  if (!intoRecord && carriersOf(carriers, into).length === 0) {
    throw new NotFoundError(
      `No term at slug "${into}" — renaming "${from}" to it is term_rename.`,
      into,
    );
  }

  const intoLabel = intoRecord?.label ?? vocabulary.bySlug.get(into)?.label;
  const tag = carrierTag(into, intoLabel);

  const result: TermMergeResult = {
    from,
    into,
    tag,
    recipes: [],
    groups: [],
    recordMoved: false,
    deleted: false,
    reparented: [],
    featured: [],
    unfeatured: [],
    aliases: [],
  };
  const message = () =>
    `Merge term: ${from} → ${into}` +
    countsTail([
      [result.recipes.length, "recipe"],
      [result.groups.length, "group"],
      [result.reparented.length, "child"],
      [result.featured.length + result.unfeatured.length, "feature"],
    ]);
  await withBatchCommit(ctx, message, (batchCtx) =>
    mergeTermWrites(batchCtx, {
      result,
      fromRecord,
      intoRecord,
      intoLabel,
      fromCarriers,
    }),
  );
  return result;
}

/** `mergeTerm`'s writes, inside its batch; they fill `result` as they land. */
async function mergeTermWrites(
  ctx: CurationContext,
  {
    result,
    fromRecord,
    intoRecord,
    intoLabel,
    fromCarriers,
  }: {
    result: TermMergeResult;
    fromRecord: TagTerm | null;
    intoRecord: TagTerm | null;
    intoLabel: string | undefined;
    fromCarriers: Carrier[];
  },
): Promise<void> {
  const { from, into, tag } = result;
  await retagAll(
    ctx,
    fromCarriers,
    (tags) => retag(tags, new Set([from]), tag),
    result,
  );
  /*
   * `from` lives on as an alias of `into` (32i, D5), with `from`'s own
   * aliases: `tag:<from>` and `/tags/<from>` keep reaching the term. Written
   * by the record write the merge makes anyway, so it adds no commit. With
   * no record on either side there is nowhere to keep it.
   */
  /* Not one already listed by a third record: that would contest it. */
  const aliasRows = await readTermRows(ctx);
  const fromAliases = (fromRecord?.aliases ?? []).filter((alias) => {
    const owner = aliasOwner(aliasRows, tagSlug(alias), from);
    return owner === undefined || owner === into;
  });
  const aliases = dedupeAliases(
    [...(intoRecord?.aliases ?? []), ...fromAliases, from],
    into,
  );

  if (!fromRecord) {
    if (!intoRecord) return;
    const freshInto = await requireTerm(ctx, into);
    if (!sameTags(aliases, freshInto.aliases ?? [])) {
      await writeTermRecord(ctx, {
        currentSlug: into,
        current: freshInto,
        data: { ...freshInto, aliases },
        commitMessage: `Update term: ${into}`,
      });
    }
    result.aliases = aliases;
    return;
  }

  if (!intoRecord) {
    await writeTermRecord(ctx, {
      currentSlug: from,
      slug: into,
      current: fromRecord,
      data: { ...fromRecord, label: intoLabel ?? fromRecord.label, aliases },
      commitMessage: `Merge term: ${from} → ${into}`,
    });
    result.recordMoved = true;
    result.aliases = aliases;
    return;
  }

  /* `into` and its ancestors, so no child of `from` is hung beneath itself. */
  const rows = await readTermRows(ctx);
  const parentOf = new Map(rows.map((row) => [row.slug, row.parent]));
  const intoLine = new Set<string>();
  for (
    let current: string | undefined = into;
    current && !intoLine.has(current);
    current = parentOf.get(current)
  ) {
    intoLine.add(current);
  }
  for (const row of rows) {
    if (row.parent !== from || row.slug === from) continue;
    const parent = intoLine.has(row.slug) ? fromRecord.parent : into;
    const child = await reparent(
      ctx,
      row.slug,
      parent === from ? undefined : parent,
    );
    if (child) result.reparented.push(child);
  }

  /*
   * `from`'s pinned recipes now carry `into`, so they may join its front, and
   * `from` joins its aliases — one write of `into`'s record for both.
   */
  const freshInto = await requireTerm(ctx, into);
  const pinned = dedupe([
    ...(freshInto.pinned ?? []),
    ...(fromRecord.pinned ?? []),
  ]);
  if (
    !sameTags(pinned, freshInto.pinned ?? []) ||
    !sameTags(aliases, freshInto.aliases ?? [])
  ) {
    await writeTermRecord(ctx, {
      currentSlug: into,
      current: freshInto,
      data: {
        ...freshInto,
        ...(pinned.length > 0 ? { pinned } : {}),
        aliases,
      },
      commitMessage: `Update term: ${into}`,
    });
  }
  result.aliases = aliases;

  Object.assign(result, await repointFeatures(ctx, from, into));
  await deleteTermRecord(ctx, from, fromRecord);
  result.deleted = true;
}

/**
 * Every featured entry naming term `from`, pointed at `into` — one commit
 * each, or none of their own inside a caller's batch (F34).
 *
 * Unless `into` is already featured: re-pointing would then put it on the
 * strip twice, the duplicate `feature` refuses without `again` (31-D2), so
 * `from`'s entries are unfeatured instead and `into`'s own entry stays. Two
 * entries of `from` re-pointed at an unfeatured `into` stay two — that
 * duplicate was deliberate when it was made.
 */
async function repointFeatures(
  ctx: CurationContext,
  from: string,
  into: string,
): Promise<{ featured: string[]; unfeatured: string[] }> {
  const slugs = await findAllFeatured(ctx.contentDirectory, { term: from });
  if (slugs.length === 0) return { featured: [], unfeatured: [] };
  if (await findFeatured(ctx.contentDirectory, { term: into })) {
    for (const slug of slugs) await unfeature(ctx, slug);
    return { featured: [], unfeatured: slugs };
  }
  const featured: string[] = [];
  for (const slug of slugs) {
    const current = await readContentFileOrNull<
      FeaturedRecipe,
      FeaturedRecipeEntryValue,
      FeaturedRecipeEntryKey
    >({
      config: featuredRecipeContentConfig,
      slug,
      contentDirectory: ctx.contentDirectory,
    });
    if (!current) continue;
    const result = await updateContent<
      FeaturedRecipe,
      FeaturedRecipeEntryValue,
      FeaturedRecipeEntryKey
    >({
      config: featuredRecipeContentConfig,
      slug,
      currentSlug: slug,
      currentIndexKey: [current.date, slug],
      data: { ...current, term: into },
      contentDirectory: ctx.contentDirectory,
      author: ctx.author,
      commitMessage: `Feature term: ${into} (was ${from})`,
      ...batchOptions(ctx),
    });
    collectBatch(ctx, result);
    ctx.onWrite?.({
      contentType: featuredRecipeContentConfig.contentType,
      kind: "update",
      result,
      slug,
    });
    featured.push(slug);
  }
  return { featured, unfeatured: [] };
}

/**
 * Delete a term: refused with `term_in_use` while anything carries it, unless
 * `unassign` — then the tag comes off every carrier first, one update each.
 *
 * The record's children are moved up to its parent (or made roots) rather
 * than left pointing at a record that no longer exists, so the tree stays
 * connected. Its featured entries follow the same way (epic 32, D1): they are
 * re-pointed at the parent — or unfeatured, when there is no parent or the
 * parent is already featured — so the strip never keeps a card for a term
 * that is gone. All of that happens before the record goes, so a failure
 * part-way leaves the record and whatever still names it intact.
 *
 * One commit for all of it (F34): `Delete term: cookies (5 recipes, 1 child,
 * 1 feature)`, or the bare `Delete term: cookies` when only the record went.
 * A failure part-way commits what landed as `… (partial)` (D3).
 */
export async function deleteTerm(
  ctx: CurationContext,
  slug: string,
  { unassign = false }: { unassign?: boolean } = {},
): Promise<TermDeleteResult> {
  const [record, carriers] = await Promise.all([
    readTerm(ctx, slug),
    readCarriers(ctx),
  ]);
  const own = carriersOf(carriers, slug);
  if (!record && own.length === 0) {
    throw new NotFoundError(`No term at slug "${slug}"`, slug);
  }
  if (own.length > 0 && !unassign) {
    throw new TermInUseError(
      slug,
      slugsOfType(own, "recipe"),
      slugsOfType(own, "group"),
    );
  }

  const result: TermDeleteResult = {
    slug,
    deleted: false,
    recipes: [],
    groups: [],
    reparented: [],
    featured: [],
    unfeatured: [],
  };
  const message = () =>
    `Delete term: ${slug}` +
    countsTail([
      [result.recipes.length, "recipe"],
      [result.groups.length, "group"],
      [result.reparented.length, "child"],
      [result.featured.length + result.unfeatured.length, "feature"],
    ]);
  await withBatchCommit(ctx, message, async (batchCtx) => {
    await retagAll(
      batchCtx,
      own,
      (tags) => retag(tags, new Set([slug])),
      result,
    );
    if (record) {
      for (const row of await readTermRows(batchCtx)) {
        if (row.parent !== slug || row.slug === slug) continue;
        const child = await reparent(batchCtx, row.slug, record.parent);
        if (child) result.reparented.push(child);
      }
    }
    /*
     * A parent is a record when it is set (`assertParent`), but check: a
     * feature must name a record, and one that does not is the nameless card.
     * A carried-only term can have no features of its own, so this finds only
     * one left dangling by an older delete, and takes it off.
     */
    const parent =
      record?.parent && (await readTerm(batchCtx, record.parent))
        ? record.parent
        : undefined;
    if (parent) {
      Object.assign(result, await repointFeatures(batchCtx, slug, parent));
    } else {
      result.unfeatured = await unfeatureTarget(batchCtx, { term: slug });
    }
    if (record) {
      await deleteTermRecord(batchCtx, slug, record);
      result.deleted = true;
    }
  });
  return result;
}
