/**
 * Meal plans and collections, read and written from plain Node.
 *
 * Groups are the reason this phase exists: the curator's output is a group, and
 * everything else here feeds it. The write path is the ordinary engine one —
 * `createContent` / `updateContent` / `deleteContent` against
 * `groupContentConfig` — with one thing layered on top that the browser form
 * gets for free from its `RecipeSelectInput`: **checking that the recipes named
 * actually exist**.
 *
 * That check is advisory, not structural. Groups declare no `references` (D3),
 * so a dangling item is a legitimate state the detail page renders as "Recipe
 * not found" — which is why `--force` downgrades the error to a warning rather
 * than being refused.
 */
import path from "path";
import { createContent } from "@discontent/cms/content/createContent";
import { deleteContent } from "@discontent/cms/content/deleteContent";
import { readContentFileOrNull } from "@discontent/cms/content/readContentFile";
import { readContentIndex } from "@discontent/cms/content/readContentIndex";
import { getContentItemDirectory } from "@discontent/cms/content/filesystem";
import type {
  ContentTypeConfig,
  UploadSpec,
} from "@discontent/cms/content/types";
import { updateContent } from "@discontent/cms/content/updateContent";
import { exists } from "fs-extra";
import slugify from "@sindresorhus/slugify";
import createDefaultGroupSlug from "recipe-website-common/controller/createGroupSlug";
import { groupContentConfig } from "recipe-website-common/controller/groupContentConfig";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import type {
  Group,
  GroupEntryKey,
  GroupEntryValue,
  GroupItem,
  GroupKind,
  Recipe,
  RecipeEntryKey,
  RecipeEntryValue,
} from "recipe-website-common/controller/types";
import { groupPath, groupUrl, type CurationContext } from "./context";
import {
  NotFoundError,
  SlugConflictError,
  UnknownRecipeError,
  ValidationError,
} from "./errors";
import {
  GroupInputSchema,
  GroupItemInputSchema,
  GroupPatchSchema,
  parseInput,
  toGroupItems,
} from "./schema";
import { z } from "zod";

export interface ResolvedGroupItem extends GroupItem {
  /** The recipe's own name, when it resolves. */
  name?: string;
  /** Set only when the slug resolves to nothing (D3 leaves these behind). */
  missing?: true;
}

export interface GroupDetail {
  slug: string;
  path: string;
  url: string;
  group: Group;
  items: ResolvedGroupItem[];
}

export interface GroupRow {
  slug: string;
  date: number;
  name: string;
  kind: GroupKind;
  itemCount: number;
}

export interface GroupListResult {
  total: number;
  more: boolean;
  groups: GroupRow[];
}

export interface GroupWriteResult {
  slug: string;
  date: number;
  path: string;
  url: string;
  warnings?: string[];
}

async function readGroup(
  ctx: CurationContext,
  slug: string,
): Promise<Group | null> {
  return readContentFileOrNull<Group, GroupEntryValue, GroupEntryKey>({
    config: groupContentConfig,
    slug,
    contentDirectory: ctx.contentDirectory,
  });
}

async function requireGroup(
  ctx: CurationContext,
  slug: string,
): Promise<Group> {
  const group = await readGroup(ctx, slug);
  if (!group) throw new NotFoundError(`No group at slug "${slug}"`, slug);
  return group;
}

export async function getGroup(
  ctx: CurationContext,
  slug: string,
): Promise<GroupDetail> {
  const group = await requireGroup(ctx, slug);
  const items: ResolvedGroupItem[] = await Promise.all(
    (group.items ?? []).map(async (item) => {
      const recipe = await readContentFileOrNull<
        Recipe,
        RecipeEntryValue,
        RecipeEntryKey
      >({
        config: recipeContentConfig,
        slug: item.recipe,
        contentDirectory: ctx.contentDirectory,
      });
      return recipe
        ? { ...item, name: recipe.name }
        : { ...item, missing: true as const };
    }),
  );
  return {
    slug,
    path: groupPath(ctx, slug),
    url: groupUrl(slug),
    group,
    items,
  };
}

export async function listGroups(
  ctx: CurationContext,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<GroupListResult> {
  const { entries, total, more } = await readContentIndex<
    GroupEntryValue,
    GroupEntryKey,
    GroupRow
  >({
    config: groupContentConfig,
    limit,
    offset,
    reverse: true,
    contentDirectory: ctx.contentDirectory,
    map: ({ key: [date, slug], value }) => ({
      slug,
      date,
      name: value.name,
      kind: value.kind,
      itemCount: (value.items ?? []).length,
    }),
  });
  return { total, more, groups: entries };
}

/**
 * Every item's recipe must exist, unless `force`.
 *
 * The warnings are returned *and* printed to stderr by the CLI, because the
 * JSON contract keeps stdout to exactly one object — a caller parsing stdout
 * sees `warnings`, a human watching the terminal sees the lines.
 */
async function checkRecipes(
  ctx: CurationContext,
  items: GroupItem[],
  force: boolean,
): Promise<string[]> {
  const unknown: string[] = [];
  for (const slug of new Set(items.map((item) => item.recipe))) {
    const recipe = await readContentFileOrNull<
      Recipe,
      RecipeEntryValue,
      RecipeEntryKey
    >({
      config: recipeContentConfig,
      slug,
      contentDirectory: ctx.contentDirectory,
    });
    if (!recipe) unknown.push(slug);
  }
  if (unknown.length === 0) return [];
  if (!force) throw new UnknownRecipeError(unknown);
  return unknown.map((slug) => `Unknown recipe: ${slug}`);
}

export async function createGroup(
  ctx: CurationContext,
  raw: unknown,
  { force = false }: { force?: boolean } = {},
): Promise<GroupWriteResult> {
  const input = parseInput(GroupInputSchema, raw);
  const date = input.date ?? Date.now();
  const slug = slugify(
    input.slug || createDefaultGroupSlug({ name: input.name, date }),
  );
  if (!slug) {
    throw new ValidationError(
      `Could not derive a slug from name "${input.name}" — pass an explicit slug.`,
    );
  }
  const items = toGroupItems(input.items);
  const warnings = await checkRecipes(ctx, items, force);

  /*
   * The file name the record will carry, derived from the URL exactly as
   * `buildRecipeData` derives it — the engine's `getUploadInfo` takes the
   * basename of the same pathname, so deriving it here is restating what the
   * write will do rather than deciding it. `imageImportUrl` itself never lands
   * on disk: it is an input-only key, and `data` is what gets written.
   */
  const imageImportUrl = input.imageImportUrl;
  const image = imageImportUrl
    ? path.parse(new URL(imageImportUrl).pathname).base
    : undefined;

  const data: Group = {
    name: input.name,
    date,
    kind: input.kind,
    ...(input.description ? { description: input.description } : {}),
    ...(image ? { image } : {}),
    items,
  };

  const result = await createContent<Group, GroupEntryValue, GroupEntryKey>({
    config: groupContentConfig,
    slug,
    data,
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage: `Create group: ${slug}`,
    /*
     * Only when an URL was given. Declaring the field with nothing in it would
     * ask `processUploadChanges` to carry a file forward that does not exist —
     * the same reason `buildRecipeData`'s curation twin declares `image` and
     * nothing else.
     */
    ...(imageImportUrl
      ? { uploads: { image: { fileImportUrl: imageImportUrl } } }
      : {}),
  });
  ctx.onWrite?.({
    contentType: groupContentConfig.contentType,
    kind: "create",
    result,
    slug,
  });

  return {
    slug,
    date,
    path: groupPath(ctx, slug),
    url: groupUrl(slug),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * Rename, retitle, re-describe, re-picture — everything about a group except
 * its items (D4).
 *
 * Modelled on `updateRecipe` rather than on `writeItems`, because this is the
 * one group write that may *move* the slug: `writeItems` always writes the same
 * slug back and so needs neither a conflict pre-check nor a `previousSlug`.
 * Both are here for the same reasons they are there — `updateContent` has no
 * conflict guard of its own, so a rename onto an occupied directory would fail
 * as a raw `ENOTEMPTY` after the uploads had already been processed; and the
 * old URL is a page that now 404s, which only the event can tell a cache.
 *
 * The featured→group reference follows the rename on its own: `group` is a
 * scalar `dataField` on `featuredRecipeContentConfig`, so `updateDependents`
 * rewrites every feature pointing at the old slug. That is engine behaviour,
 * pinned here by a test rather than re-implemented.
 */
export async function updateGroup(
  ctx: CurationContext,
  currentSlug: string,
  rawPatch: unknown,
): Promise<GroupWriteResult> {
  const patch = parseInput(GroupPatchSchema, rawPatch);
  const current = await requireGroup(ctx, currentSlug);

  const slug = patch.slug ? slugify(patch.slug) : currentSlug;
  if (!slug) {
    throw new ValidationError(`"${patch.slug}" does not slugify to anything.`);
  }
  if (slug !== currentSlug) {
    const target = getContentItemDirectory(
      /* The engine's own call sites widen the same way; the helper reads two
       * string fields off the config and is generic in nothing. */
      groupContentConfig as unknown as ContentTypeConfig,
      slug,
      ctx.contentDirectory,
    );
    if (await exists(target)) throw new SlugConflictError(slug);
  }

  const date = patch.date ?? current.date ?? Date.now();

  /*
   * Spread the record that is on disk, so every key this patch does not name —
   * `items` above all — survives verbatim. `null` clears, `undefined` leaves
   * alone; the same contract `buildRecipeWrite` states for recipes.
   */
  const data: Group = { ...current, date };
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.kind !== undefined) data.kind = patch.kind;
  if (patch.description === null) delete data.description;
  else if (patch.description !== undefined) {
    data.description = patch.description;
  }

  const imageImportUrl = patch.imageImportUrl ?? undefined;
  const image = imageImportUrl
    ? path.parse(new URL(imageImportUrl).pathname).base
    : patch.imageImportUrl === null
      ? undefined
      : current.image;
  if (image) data.image = image;
  else delete data.image;

  /* Never on disk: input-only keys, and the slug, which is the directory name. */
  delete data.slug;
  delete data.imageImportUrl;

  const uploads: Record<string, UploadSpec> = {
    image: {
      fileImportUrl: imageImportUrl,
      clearFile: patch.imageImportUrl === null,
      existingFile: current.image,
    },
  };

  const result = await updateContent<Group, GroupEntryValue, GroupEntryKey>({
    config: groupContentConfig,
    slug,
    currentSlug,
    currentIndexKey: [current.date, currentSlug],
    data,
    uploads,
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage: `Update group: ${slug}`,
  });
  ctx.onWrite?.({
    contentType: groupContentConfig.contentType,
    kind: "update",
    result,
    slug,
    /* Only on a real rename: the old URL is a page that now 404s. */
    ...(slug !== currentSlug ? { previousSlug: currentSlug } : {}),
  });

  return {
    slug,
    date,
    path: groupPath(ctx, slug),
    url: groupUrl(slug),
  };
}

/** One write seat for every item mutation, so the index key handling is stated once. */
async function writeItems(
  ctx: CurationContext,
  slug: string,
  current: Group,
  items: GroupItem[],
  warnings: string[],
  commitMessage: string,
): Promise<GroupWriteResult> {
  const result = await updateContent<Group, GroupEntryValue, GroupEntryKey>({
    config: groupContentConfig,
    slug,
    currentSlug: slug,
    currentIndexKey: [current.date, slug],
    data: { ...current, items },
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage,
  });
  /*
   * Every item mutation lands here — `setItems`, `addItem`, `removeItem` — so
   * one hook covers all three. Never a rename: this seat writes the same slug
   * back, which is why there is no `previousSlug`.
   */
  ctx.onWrite?.({
    contentType: groupContentConfig.contentType,
    kind: "update",
    result,
    slug,
  });
  return {
    slug,
    date: current.date,
    path: groupPath(ctx, slug),
    url: groupUrl(slug),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

export async function setItems(
  ctx: CurationContext,
  slug: string,
  rawItems: unknown,
  { force = false }: { force?: boolean } = {},
): Promise<GroupWriteResult> {
  const parsed = parseInput(z.array(GroupItemInputSchema), rawItems);
  const items = toGroupItems(parsed);
  const current = await requireGroup(ctx, slug);
  const warnings = await checkRecipes(ctx, items, force);
  return writeItems(
    ctx,
    slug,
    current,
    items,
    warnings,
    `Set items on group: ${slug}`,
  );
}

/**
 * Append one item.
 *
 * Duplicates are allowed and deliberate: a meal plan that cooks the same thing
 * Monday and Thursday is two items with two labels, and `groupsByRecipe` folds
 * one "Appears in" entry per *item* precisely so both labels survive.
 */
export async function addItem(
  ctx: CurationContext,
  slug: string,
  recipe: string,
  {
    label,
    note,
    force = false,
  }: { label?: string; note?: string; force?: boolean } = {},
): Promise<GroupWriteResult> {
  const current = await requireGroup(ctx, slug);
  const item: GroupItem = {
    recipe,
    ...(label ? { label } : {}),
    ...(note ? { note } : {}),
  };
  const warnings = await checkRecipes(ctx, [item], force);
  return writeItems(
    ctx,
    slug,
    current,
    [...(current.items ?? []), item],
    warnings,
    `Add ${recipe} to group: ${slug}`,
  );
}

/** Removes *every* row naming that recipe — the inverse of `addItem`'s duplicates. */
export async function removeItem(
  ctx: CurationContext,
  slug: string,
  recipe: string,
): Promise<GroupWriteResult> {
  const current = await requireGroup(ctx, slug);
  const items = (current.items ?? []).filter((item) => item.recipe !== recipe);
  if (items.length === (current.items ?? []).length) {
    throw new NotFoundError(
      `Group "${slug}" has no item for recipe "${recipe}"`,
      slug,
    );
  }
  return writeItems(
    ctx,
    slug,
    current,
    items,
    [],
    `Remove ${recipe} from group: ${slug}`,
  );
}

export async function deleteGroup(
  ctx: CurationContext,
  slug: string,
): Promise<{ slug: string; deleted: true }> {
  const current = await requireGroup(ctx, slug);
  const result = await deleteContent<Group, GroupEntryValue, GroupEntryKey>({
    config: groupContentConfig,
    slug,
    indexKey: [current.date, slug],
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage: `Delete group: ${slug}`,
  });
  ctx.onWrite?.({
    contentType: groupContentConfig.contentType,
    kind: "delete",
    result,
    slug,
  });
  return { slug, deleted: true };
}
