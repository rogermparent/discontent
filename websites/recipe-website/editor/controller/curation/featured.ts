/**
 * The homepage strip, written from plain Node (D5).
 *
 * Featuring was form-only until this phase: `actions/featuredRecipes.ts` takes
 * `FormData` through `createGenericActions`, which needs a session and the Next
 * runtime. This is the same write seen from the other side — same
 * `featuredRecipeContentConfig`, same "only the key that is set" data shape as
 * `buildFeaturedRecipeData`, same default slug — taking JSON and a content
 * directory instead (T16).
 *
 * The one thing this adds that the form gets from its pickers is **checking
 * that the target exists**. Unlike a group's items, a dangling feature is not a
 * legitimate state: `resolveReferences` borrows the target's name for the card,
 * so a feature of nothing renders as a nameless card that no write will ever
 * repair. That is why there is no `--force` here (D5) and why the three
 * failures are `unknown_recipe` / `unknown_group` / `unknown_term` rather than
 * warnings.
 *
 * Three targets since 24c, and the third is a **term record** rather than a
 * tag: the card borrows the record's label and picture, so `--term cookies`
 * features the vocabulary entry and refuses a slug that only exists as a string
 * on some recipes.
 *
 * Featuring an already-featured target *is* allowed: the form allows it, the
 * strip shows the six newest, and "feature this again" is a real curator move.
 */
import { createContent } from "@discontent/cms/content/createContent";
import { deleteContent } from "@discontent/cms/content/deleteContent";
import { readContentFileOrNull } from "@discontent/cms/content/readContentFile";
import { readContentIndex } from "@discontent/cms/content/readContentIndex";
import slugify from "@sindresorhus/slugify";
import createDefaultFeaturedRecipeSlug from "recipe-website-common/controller/createFeaturedRecipeSlug";
import { featuredRecipeContentConfig } from "recipe-website-common/controller/featuredRecipeContentConfig";
import { groupContentConfig } from "recipe-website-common/controller/groupContentConfig";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import { tagTermContentConfig } from "recipe-website-common/controller/tagTermContentConfig";
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
import { featuredPath, featuredUrl, type CurationContext } from "./context";
import {
  NotFoundError,
  UnknownGroupError,
  UnknownRecipeError,
  UnknownTermError,
} from "./errors";
import { FeaturedInputSchema, parseInput } from "./schema";

export interface FeaturedRow {
  slug: string;
  date: number;
  recipe?: string;
  group?: string;
  /** A term record's slug (24c) — the third mutually exclusive target. */
  term?: string;
  note?: string;
  /** The target's current name, borrowed through the index. */
  name?: string;
}

export interface FeaturedListResult {
  total: number;
  more: boolean;
  featured: FeaturedRow[];
}

export interface FeaturedWriteResult {
  slug: string;
  date: number;
  path: string;
  /** `/featured-recipe/<slug>` — the feature's own page, not the target's. */
  url: string;
  recipe?: string;
  group?: string;
  term?: string;
}

async function readFeatured(
  ctx: CurationContext,
  slug: string,
): Promise<FeaturedRecipe | null> {
  return readContentFileOrNull<
    FeaturedRecipe,
    FeaturedRecipeEntryValue,
    FeaturedRecipeEntryKey
  >({
    config: featuredRecipeContentConfig,
    slug,
    contentDirectory: ctx.contentDirectory,
  });
}

/**
 * Newest first, and the `name` is the *borrowed* one.
 *
 * `recipeName ?? groupName` rather than a read per row: the featured index is
 * covering by design (22g), so listing what is on the homepage costs one index
 * walk and no data files at all — the same read `FeaturedStrip` does.
 */
export async function listFeatured(
  ctx: CurationContext,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<FeaturedListResult> {
  const { entries, total, more } = await readContentIndex<
    FeaturedRecipeEntryValue,
    FeaturedRecipeEntryKey,
    FeaturedRow
  >({
    config: featuredRecipeContentConfig,
    limit,
    offset,
    reverse: true,
    contentDirectory: ctx.contentDirectory,
    map: ({ key: [date, slug], value }) => ({
      slug,
      date,
      ...(value.recipe ? { recipe: value.recipe } : {}),
      ...(value.group ? { group: value.group } : {}),
      ...(value.term ? { term: value.term } : {}),
      ...(value.note ? { note: value.note } : {}),
      ...((value.recipeName ?? value.groupName ?? value.termLabel)
        ? { name: value.recipeName ?? value.groupName ?? value.termLabel }
        : {}),
    }),
  });
  return { total, more, featured: entries };
}

/** The existence check `checkRecipes` does for items, for the one target. */
async function requireTarget(
  ctx: CurationContext,
  target: { recipe?: string; group?: string; term?: string },
): Promise<void> {
  if (target.recipe) {
    const recipe = await readContentFileOrNull<
      Recipe,
      RecipeEntryValue,
      RecipeEntryKey
    >({
      config: recipeContentConfig,
      slug: target.recipe,
      contentDirectory: ctx.contentDirectory,
    });
    if (!recipe) throw new UnknownRecipeError([target.recipe]);
    return;
  }
  if (target.group) {
    const group = await readContentFileOrNull<
      Group,
      GroupEntryValue,
      GroupEntryKey
    >({
      config: groupContentConfig,
      slug: target.group,
      contentDirectory: ctx.contentDirectory,
    });
    if (!group) throw new UnknownGroupError([target.group]);
    return;
  }
  if (target.term) {
    /*
     * The **record**, not the tag. A bare tag with carriers and no record is an
     * ordinary state and the term's page renders for it — but a feature borrows
     * the record's `label` and `image`, so featuring a term nobody has written
     * a record for would produce exactly the nameless card this check exists to
     * prevent. `feature --term` therefore means "feature this vocabulary
     * entry", and 24e's `term_create` is how one comes into being.
     */
    const term = await readContentFileOrNull<
      TagTerm,
      TagTermIndexValue,
      TagTermEntryKey
    >({
      config: tagTermContentConfig,
      slug: target.term,
      contentDirectory: ctx.contentDirectory,
    });
    if (!term) throw new UnknownTermError([target.term]);
  }
}

export async function feature(
  ctx: CurationContext,
  raw: unknown,
): Promise<FeaturedWriteResult> {
  const input = parseInput(FeaturedInputSchema, raw);
  await requireTarget(ctx, input);

  const date = input.date ?? Date.now();
  /*
   * Second-resolution by default (`YYYY-MM-DD-HH-MM-SS`), so two features in
   * the same second collide with a 409 rather than overwriting each other — a
   * caller featuring several targets in a burst passes explicit slugs (T26).
   */
  const slug = slugify(input.slug || createDefaultFeaturedRecipeSlug({ date }));

  /*
   * Only the key that is set, as `buildFeaturedRecipeData` does: a record that
   * carries `"group": null` would be a second dataField for
   * `resolveReferences` to walk and a second name for the card to prefer.
   */
  const data: FeaturedRecipe = {
    ...(input.recipe ? { recipe: input.recipe } : {}),
    ...(input.group ? { group: input.group } : {}),
    ...(input.term ? { term: input.term } : {}),
    date,
    ...(input.note ? { note: input.note } : {}),
  };

  const result = await createContent<
    FeaturedRecipe,
    FeaturedRecipeEntryValue,
    FeaturedRecipeEntryKey
  >({
    config: featuredRecipeContentConfig,
    slug,
    data,
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage: input.recipe
      ? `Feature recipe: ${input.recipe}`
      : input.group
        ? `Feature group: ${input.group}`
        : `Feature term: ${input.term}`,
  });
  ctx.onWrite?.({
    contentType: featuredRecipeContentConfig.contentType,
    kind: "create",
    result,
    slug,
  });

  return {
    slug,
    date,
    path: featuredPath(ctx, slug),
    url: featuredUrl(slug),
    ...(input.recipe ? { recipe: input.recipe } : {}),
    ...(input.group ? { group: input.group } : {}),
    ...(input.term ? { term: input.term } : {}),
  };
}

export async function unfeature(
  ctx: CurationContext,
  slug: string,
): Promise<{ slug: string; deleted: true }> {
  /* `deleteContent` needs the index key, which only the record carries. */
  const current = await readFeatured(ctx, slug);
  if (!current) {
    throw new NotFoundError(`No featured entry at slug "${slug}"`, slug);
  }
  const result = await deleteContent<
    FeaturedRecipe,
    FeaturedRecipeEntryValue,
    FeaturedRecipeEntryKey
  >({
    config: featuredRecipeContentConfig,
    slug,
    indexKey: [current.date, slug],
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage: `Unfeature: ${slug}`,
  });
  ctx.onWrite?.({
    contentType: featuredRecipeContentConfig.contentType,
    kind: "delete",
    result,
    slug,
  });
  return { slug, deleted: true };
}
