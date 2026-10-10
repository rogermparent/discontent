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
 * **One update per carrier** (24-D7, D9's accepted cost): every carrier write
 * goes through `updateRecipe` / `updateGroup`, the same seats `recipe_update`
 * and `group_update` use, so normalisation, index keys, aggregates, dependents
 * and the commit are theirs. A bulk assign over N carriers is N commits — the
 * batched commit is a possible F34, not this.
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
import { normalizeTag } from "recipe-website-common/controller/normalizeTags";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import { recipeTagTaxonomy } from "recipe-website-common/controller/recipeTagTaxonomy";
import { tagSlug } from "recipe-website-common/controller/tagSlug";
import { tagTermContentConfig } from "recipe-website-common/controller/tagTermContentConfig";
import {
  breadcrumbOf,
  childrenOf,
  mergeTagVocabulary,
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
import { fetchImageFile } from "../imageImport";
import { termPath, termUrl, type CurationContext } from "./context";
import {
  CurationError,
  NotFoundError,
  SlugConflictError,
  TermCycleError,
  TermInUseError,
  UnknownTermError,
  ValidationError,
} from "./errors";
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
  /** Slugs that name no carrier of that type. */
  missing: string[];
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

/** Every term record, from the term index: slug, date, label, parent. */
async function readTermRows(
  ctx: CurationContext,
): Promise<{ slug: string; date: number; parent?: string }[]> {
  const { entries } = await readContentIndex<
    TagTermIndexValue,
    TagTermEntryKey,
    { slug: string; date: number; parent?: string }
  >({
    config: tagTermContentConfig,
    contentDirectory: ctx.contentDirectory,
    map: ({ key: [date, slug], value }) => ({
      slug,
      date,
      ...(value.parent ? { parent: value.parent } : {}),
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

/** Re-tag a list of known carriers, reporting the ones that moved by type. */
async function retagAll(
  ctx: CurationContext,
  carriers: Carrier[],
  transform: (tags: readonly string[]) => string[],
): Promise<{ recipes: string[]; groups: string[] }> {
  const recipes: string[] = [];
  const groups: string[] = [];
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
 * Every pinned slug must be a recipe that carries the term (24c's second
 * answer): the page ignores one that does not, so storing it would be a
 * promise the page silently breaks.
 */
async function assertPinned(
  ctx: CurationContext,
  slug: string,
  pinned: readonly string[],
): Promise<void> {
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
    } else if (!carries(recipe.tags, slug)) {
      issues.push({
        path: `pinned.${index}`,
        message: `Recipe "${recipeSlug}" does not carry "${slug}" — assign the term to it first`,
      });
    }
  }
  if (issues.length > 0) {
    throw new ValidationError(
      `Pinned recipes must carry the term "${slug}"`,
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
  });
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
  });
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

/** Every slug at or under `slug` in the tree, `slug` included. */
function subtreeOf(tree: TermTree, slug: string): Set<string> {
  const seen = new Set<string>();
  const walk = (current: string) => {
    if (seen.has(current)) return;
    seen.add(current);
    for (const child of tree[current]?.children ?? []) walk(child);
  };
  walk(slug);
  return seen;
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
  const subtree = subtreeOf(vocabulary.tree, slug);
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
    breadcrumb: breadcrumbOf(vocabulary.tree, slug, vocabulary.bySlug),
    children: childrenOf(vocabulary.tree, slug, vocabulary.bySlug),
    counts: { own: own.length, withDescendants: withDescendants.length },
    recipes: slugsOfType(own, "recipe"),
    groups: slugsOfType(own, "group"),
  };
}

/* --- seats: record writes -------------------------------------------------- */

export async function createTerm(
  ctx: CurationContext,
  raw: unknown,
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

  const parent = input.parent ? tagSlug(input.parent) : undefined;
  if (parent) await assertParent(ctx, slug, parent);
  const pinned = dedupe(input.pinned ?? []);
  if (pinned.length > 0) await assertPinned(ctx, slug, pinned);

  const imageFile = input.imageImportUrl
    ? await fetchImageFile(input.imageImportUrl)
    : undefined;
  const date = input.date ?? Date.now();

  /* Optional keys spread only when set, as every record in this repo is. */
  const data: TagTerm = {
    label: input.label,
    date,
    ...(input.description ? { description: input.description } : {}),
    ...(imageFile ? { image: imageFile.name } : {}),
    ...(parent ? { parent } : {}),
    ...(pinned.length > 0 ? { pinned } : {}),
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
  });
  ctx.onWrite?.({
    contentType: tagTermContentConfig.contentType,
    kind: "create",
    result,
    slug,
  });

  const warnings = labelWarnings(slug, input.label);
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
): Promise<TermWriteResult> {
  const patch = parseInput(TermPatchSchema, rawPatch);
  const current = await requireTerm(ctx, slug);

  const data: TagTerm = { ...current };
  if (patch.label !== undefined) data.label = patch.label;
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

  const imageFile = patch.imageImportUrl
    ? await fetchImageFile(patch.imageImportUrl)
    : undefined;
  const image = imageFile
    ? imageFile.name
    : patch.imageImportUrl === null
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
        clearFile: patch.imageImportUrl === null,
        existingFile: current.image,
      },
    },
    commitMessage: `Update term: ${slug}`,
  });

  const warnings = labelWarnings(slug, data.label);
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
 * said otherwise — one update each.
 *
 * No record is required: assigning a term nobody has described yet is how a
 * bare tag has always come into being, and `term_create` can describe it
 * later. `slug` may be given as a label; it is slugged, and a term with no
 * record and no carriers yet is written with that spelling.
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

  for (const carrier of dedupe(input.add ?? [])) {
    report(
      await retagCarrier(ctx, type, carrier, (tags) =>
        carries(tags, slug) ? [...tags] : [...tags, tag],
      ),
      carrier,
    );
  }
  for (const carrier of dedupe(input.remove ?? [])) {
    report(
      await retagCarrier(ctx, type, carrier, (tags) =>
        tags.filter((t) => tagSlug(t) !== slug),
      ),
      carrier,
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
 * the new carrier string. Renaming onto a term that already exists — a record
 * or carriers — is `slug_conflict`; that is `term_merge`.
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
  const tag = carrierTag(to, label);

  if (record) {
    await writeTermRecord(ctx, {
      currentSlug: slug,
      slug: to,
      current: record,
      data: { ...record, label },
      commitMessage: `Rename term: ${slug} → ${to}`,
    });
  }
  const moved = await retagAll(ctx, own, (tags) =>
    retag(tags, new Set([slug]), tag),
  );

  return {
    from: slug,
    slug: to,
    label,
    tag,
    path: termPath(ctx, to),
    url: termUrl(to),
    record: Boolean(record),
    ...moved,
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
 *   are re-pointed at `into`, `from`'s pinned recipes join the end of
 *   `into`'s, and `from`'s record is deleted.
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
  const moved = await retagAll(ctx, fromCarriers, (tags) =>
    retag(tags, new Set([from]), tag),
  );

  const result: TermMergeResult = {
    from,
    into,
    tag,
    ...moved,
    recordMoved: false,
    deleted: false,
    reparented: [],
    featured: [],
  };
  if (!fromRecord) return result;

  if (!intoRecord) {
    await writeTermRecord(ctx, {
      currentSlug: from,
      slug: into,
      current: fromRecord,
      data: { ...fromRecord, label: intoLabel ?? fromRecord.label },
      commitMessage: `Merge term: ${from} → ${into}`,
    });
    result.recordMoved = true;
    return result;
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

  /* `from`'s pinned recipes now carry `into`, so they may join its front. */
  if (fromRecord.pinned?.length) {
    const freshInto = await requireTerm(ctx, into);
    const pinned = dedupe([...(freshInto.pinned ?? []), ...fromRecord.pinned]);
    if (!sameTags(pinned, freshInto.pinned ?? [])) {
      await writeTermRecord(ctx, {
        currentSlug: into,
        current: freshInto,
        data: { ...freshInto, pinned },
        commitMessage: `Update term: ${into}`,
      });
    }
  }

  result.featured = await repointFeatures(ctx, from, into);
  await deleteTermRecord(ctx, from, fromRecord);
  result.deleted = true;
  return result;
}

/** Every featured entry naming term `from`, pointed at `into`, one commit each. */
async function repointFeatures(
  ctx: CurationContext,
  from: string,
  into: string,
): Promise<string[]> {
  const { entries } = await readContentIndex<
    FeaturedRecipeEntryValue,
    FeaturedRecipeEntryKey,
    { slug: string; term?: string }
  >({
    config: featuredRecipeContentConfig,
    contentDirectory: ctx.contentDirectory,
    map: ({ key: [, slug], value }) => ({ slug, term: value.term }),
  });
  const moved: string[] = [];
  for (const { slug } of entries.filter((entry) => entry.term === from)) {
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
    });
    ctx.onWrite?.({
      contentType: featuredRecipeContentConfig.contentType,
      kind: "update",
      result,
      slug,
    });
    moved.push(slug);
  }
  return moved;
}

/**
 * Delete a term: refused with `term_in_use` while anything carries it, unless
 * `unassign` — then the tag comes off every carrier first, one update each.
 *
 * The record's children are moved up to its parent (or made roots) rather
 * than left pointing at a record that no longer exists, so the tree stays
 * connected. A featured entry of the term is left dangling, as `group_delete`
 * leaves one; `unfeature` it first.
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

  const removed = await retagAll(ctx, own, (tags) =>
    retag(tags, new Set([slug])),
  );
  const reparented: { slug: string; parent?: string }[] = [];
  if (record) {
    for (const row of await readTermRows(ctx)) {
      if (row.parent !== slug || row.slug === slug) continue;
      const child = await reparent(ctx, row.slug, record.parent);
      if (child) reparented.push(child);
    }
    await deleteTermRecord(ctx, slug, record);
  }
  return { slug, deleted: Boolean(record), ...removed, reparented };
}
