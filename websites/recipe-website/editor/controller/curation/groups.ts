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
import { createContent } from "@discontent/cms/content/createContent";
import { deleteContent } from "@discontent/cms/content/deleteContent";
import { readContentFileOrNull } from "@discontent/cms/content/readContentFile";
import { readContentIndex } from "@discontent/cms/content/readContentIndex";
import { updateContent } from "@discontent/cms/content/updateContent";
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
import { NotFoundError, UnknownRecipeError, ValidationError } from "./errors";
import {
  GroupInputSchema,
  GroupItemInputSchema,
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

  const data: Group = {
    name: input.name,
    date,
    kind: input.kind,
    ...(input.description ? { description: input.description } : {}),
    items,
  };

  await createContent<Group, GroupEntryValue, GroupEntryKey>({
    config: groupContentConfig,
    slug,
    data,
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage: `Create group: ${slug}`,
  });

  return {
    slug,
    date,
    path: groupPath(ctx, slug),
    url: groupUrl(slug),
    ...(warnings.length > 0 ? { warnings } : {}),
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
  await updateContent<Group, GroupEntryValue, GroupEntryKey>({
    config: groupContentConfig,
    slug,
    currentSlug: slug,
    currentIndexKey: [current.date, slug],
    data: { ...current, items },
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage,
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
  await deleteContent<Group, GroupEntryValue, GroupEntryKey>({
    config: groupContentConfig,
    slug,
    indexKey: [current.date, slug],
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage: `Delete group: ${slug}`,
  });
  return { slug, deleted: true };
}
