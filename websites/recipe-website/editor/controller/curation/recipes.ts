/**
 * Recipe reads and writes, without Next.
 *
 * This is `controller/actions/index.ts`'s `buildRecipeData` seen from the other
 * side of the form: same fields, same precedence rules for `image`/`video`,
 * same `normalizeTags`, same `createContent`/`updateContent`/`deleteContent`
 * calls — but taking JSON rather than `FormData`, and taking its content
 * directory as an argument rather than from the ambient environment.
 *
 * It is a mirror rather than a reuse because `actions/index.ts` is a
 * `"use server"` module: importing it drags `next/cache`, `@/auth` and the
 * whole Next runtime into a plain `tsx` process (D8). What that costs is a
 * second copy of the precedence rules, and what keeps the copies honest is that
 * both are pinned by tests over the same content config.
 */
import slugify from "@sindresorhus/slugify";
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
import { exists } from "fs-extra";
import path from "node:path";
import {
  matchesFilter,
  parseQuery,
  quoteQueryValue,
} from "recipe-website-common/components/SearchForm/queryLanguage";
import createDefaultSlug from "recipe-website-common/controller/createSlug";
import type { MassagedRecipeEntry } from "recipe-website-common/controller/data/read";
import { normalizeTags } from "recipe-website-common/controller/normalizeTags";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import type {
  Recipe,
  RecipeEntryKey,
  RecipeEntryValue,
} from "recipe-website-common/controller/types";
import { recipePath, recipeUrl, type CurationContext } from "./context";
import { NotFoundError, SlugConflictError, ValidationError } from "./errors";
import {
  RecipeInputSchema,
  RecipePatchSchema,
  parseInput,
  toIngredients,
  toInstructions,
  type RecipeInput,
  type RecipePatch,
} from "./schema";

/**
 * The row every list surface returns.
 *
 * Structurally identical to what `/recipes` and the search corpus render, and
 * declared as that type rather than as a new one so the two cannot drift. The
 * import is **type-only**: `data/read.ts` also exports `getAllTags`, which
 * reads through `unstable_cache` and throws outside Next (D8).
 */
export type RecipeRow = MassagedRecipeEntry;

export interface RecipeDetail {
  slug: string;
  path: string;
  url: string;
  recipe: Recipe;
}

export interface RecipeWriteResult {
  slug: string;
  date: number;
  path: string;
  url: string;
}

export interface RecipeListResult {
  total: number;
  more: boolean;
  recipes: RecipeRow[];
}

export function toRecipeRow(
  key: RecipeEntryKey,
  value: RecipeEntryValue,
): RecipeRow {
  const [date, slug] = key;
  return {
    date,
    slug,
    name: value.name,
    description: value.description,
    ingredients: value.ingredients,
    image: value.image,
    tags: value.tags,
    prepTime: value.prepTime,
    cookTime: value.cookTime,
    totalTime: value.totalTime,
  };
}

/**
 * The whole index, newest first.
 *
 * Unbounded on purpose: `tag:` filtering and free-text search are evaluated in
 * JS over the corpus (fact 3 — there is no server-side search database, only a
 * browser FlexSearch index), so paging the read would page the *wrong* set.
 * The corpus is a few hundred rows of index values, which is what the browser
 * downloads whole on every search anyway.
 */
export async function readAllRecipeRows(
  ctx: CurationContext,
): Promise<RecipeRow[]> {
  const { entries } = await readContentIndex<
    RecipeEntryValue,
    RecipeEntryKey,
    RecipeRow
  >({
    config: recipeContentConfig,
    reverse: true,
    contentDirectory: ctx.contentDirectory,
    map: ({ key, value }) => toRecipeRow(key, value),
  });
  return entries;
}

export async function getRecipe(
  ctx: CurationContext,
  slug: string,
): Promise<RecipeDetail> {
  const recipe = await readContentFileOrNull<
    Recipe,
    RecipeEntryValue,
    RecipeEntryKey
  >({
    config: recipeContentConfig,
    slug,
    contentDirectory: ctx.contentDirectory,
  });
  if (!recipe) throw new NotFoundError(`No recipe at slug "${slug}"`, slug);
  return { slug, path: recipePath(ctx, slug), url: recipeUrl(slug), recipe };
}

export async function listRecipes(
  ctx: CurationContext,
  {
    limit = 20,
    offset = 0,
    tag,
  }: { limit?: number; offset?: number; tag?: string } = {},
): Promise<RecipeListResult> {
  if (tag) {
    /*
     * Routed through the query language rather than a bare `tags.includes`, so
     * `list --tag x` and `search "tag:x"` cannot answer differently: the filter
     * folds diacritics and matches at word starts, and a hand-rolled equality
     * check here would quietly be stricter than what the browser does.
     */
    const { filter } = parseQuery(`tag:${quoteQueryValue(tag)}`);
    const rows = await readAllRecipeRows(ctx);
    const matched = filter
      ? rows.filter((row) => matchesFilter(row, filter))
      : rows;
    const page = matched.slice(offset, offset + limit);
    return {
      total: matched.length,
      more: offset + page.length < matched.length,
      recipes: page,
    };
  }

  const { entries, total, more } = await readContentIndex<
    RecipeEntryValue,
    RecipeEntryKey,
    RecipeRow
  >({
    config: recipeContentConfig,
    limit,
    offset,
    reverse: true,
    contentDirectory: ctx.contentDirectory,
    map: ({ key, value }) => toRecipeRow(key, value),
  });
  return { total, more, recipes: entries };
}

/**
 * Shape a recipe data file and its upload specs, mirroring `buildRecipeData`
 * (`controller/actions/index.ts:56`).
 *
 * Three things this has to get right, all of them mirrored from there:
 *
 * - **`image` is a bare filename**, derived from the import URL's basename —
 *   the same value `getUploadInfo` writes into the uploads directory, which is
 *   what makes the two agree about what file the recipe points at.
 * - **`video` is a URL string or a filename**, and `videoUrl` beats
 *   `videoImportUrl` beats what the recipe already had. The CLI never downloads
 *   a video, exactly as the editor never does.
 * - **The import URLs must not survive into `data`.** `Recipe` has an index
 *   signature, so `imageImportUrl` would be written to `recipe.json` verbatim
 *   and re-imported on every subsequent edit (fact 9).
 *
 * `null` clears, `undefined` leaves alone — the patch contract. On a create
 * there is no `current`, so the two are indistinguishable and both mean "not
 * set".
 */
export function buildRecipeWrite(
  input: RecipeInput | RecipePatch,
  { date, current }: { date: number; current?: Recipe | null },
): { data: Recipe; uploads: Record<string, UploadSpec> } {
  const data: Recipe = current
    ? ({ ...current } as Recipe)
    : ({ name: "", date } as Recipe);

  const put = (key: string, value: unknown) => {
    if (value === null) delete data[key];
    else if (value !== undefined) data[key] = value;
  };

  put("name", input.name);
  put("description", input.description);
  put("recipeYield", input.recipeYield);
  put("prepTime", input.prepTime);
  put("cookTime", input.cookTime);
  put("totalTime", input.totalTime);
  put("source", input.source);
  put("timelines", input.timelines);

  if (input.tags === null) {
    delete data.tags;
  } else if (input.tags !== undefined) {
    const tags = normalizeTags(input.tags);
    if (tags.length > 0) data.tags = tags;
    else delete data.tags;
  }

  if (input.ingredients === null) delete data.ingredients;
  else if (input.ingredients !== undefined) {
    data.ingredients = toIngredients(input.ingredients);
  }

  if (input.instructions === null) delete data.instructions;
  else if (input.instructions !== undefined) {
    data.instructions = toInstructions(input.instructions);
  }

  const imageImportUrl = input.imageImportUrl ?? undefined;
  const image = imageImportUrl
    ? path.parse(new URL(imageImportUrl).pathname).base
    : current?.image;
  if (image) data.image = image;
  else delete data.image;

  const video =
    input.videoUrl === null || input.videoImportUrl === null
      ? undefined
      : (input.videoUrl ?? input.videoImportUrl ?? current?.video);
  if (video) data.video = video;
  else delete data.video;

  data.date = date;

  /* Never on disk: input-only keys, and the slug, which is the directory name. */
  delete data.slug;
  delete data.imageImportUrl;
  delete data.videoImportUrl;
  delete data.videoUrl;

  return {
    data,
    /*
     * Only `image`. The editor also declares a `video` upload because its form
     * has a file input; nothing here can hand over a `File`, and declaring the
     * field with no file would ask `processUploadChanges` to carry an existing
     * one forward for no reason.
     */
    uploads: {
      image: {
        fileImportUrl: imageImportUrl,
        existingFile: current?.image,
      },
    },
  };
}

export function resolveCreateSlug(input: RecipeInput): string {
  const slug = slugify(input.slug || createDefaultSlug({ name: input.name }));
  if (!slug) {
    throw new ValidationError(
      `Could not derive a slug from name "${input.name}" — pass an explicit slug.`,
    );
  }
  return slug;
}

export async function createRecipe(
  ctx: CurationContext,
  raw: unknown,
  { overwrite = false }: { overwrite?: boolean } = {},
): Promise<RecipeWriteResult> {
  const input = parseInput(RecipeInputSchema, raw);
  const slug = resolveCreateSlug(input);
  const date = input.date ?? Date.now();
  const { data, uploads } = buildRecipeWrite(input, { date });

  if (overwrite) {
    /*
     * Delete-then-create, not `action: "overwrite"` (fact 7). The engine's
     * overwrite skips the conflict check and nothing else, so the old item's
     * *uploads* directory survives — the editor's `deleteConflictingContent`
     * (`actions/index.ts:290`) exists for the same reason and does the same
     * thing.
     */
    await deleteRecipeIfPresent(
      ctx,
      slug,
      `Delete recipe before overwrite: ${slug}`,
    );
  }

  const result = await createContent<Recipe, RecipeEntryValue, RecipeEntryKey>({
    config: recipeContentConfig,
    slug,
    data,
    uploads,
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage: `Create recipe: ${slug}`,
  });
  ctx.onWrite?.({
    contentType: recipeContentConfig.contentType,
    kind: "create",
    result,
    slug,
  });

  return {
    slug,
    date,
    path: recipePath(ctx, slug),
    url: recipeUrl(slug),
  };
}

export async function updateRecipe(
  ctx: CurationContext,
  currentSlug: string,
  rawPatch: unknown,
): Promise<RecipeWriteResult> {
  const patch = parseInput(RecipePatchSchema, rawPatch);
  const current = await readContentFileOrNull<
    Recipe,
    RecipeEntryValue,
    RecipeEntryKey
  >({
    config: recipeContentConfig,
    slug: currentSlug,
    contentDirectory: ctx.contentDirectory,
  });
  if (!current) {
    throw new NotFoundError(`No recipe at slug "${currentSlug}"`, currentSlug);
  }

  /*
   * A rename is explicit here, where the browser form recomputes the slug from
   * the name on every save. A patch that only retitles a recipe must not move
   * its URL out from under every link to it — the form's behaviour is defensible
   * because a human is looking at the slug field while they do it.
   */
  const slug = patch.slug ? slugify(patch.slug) : currentSlug;
  if (!slug) {
    throw new ValidationError(`"${patch.slug}" does not slugify to anything.`);
  }
  if (slug !== currentSlug) {
    /*
     * `updateContent` has no conflict guard of its own (fact 5): the rename is
     * an `fs.rename` onto the occupied directory, which fails with a raw
     * `ENOTEMPTY` *after* the uploads have already been processed. Checking
     * here is what turns that into the same `SlugConflictError` a create throws.
     */
    const target = getContentItemDirectory(
      /* The engine's own call sites widen the same way; the helper reads two
       * string fields off the config and is generic in nothing. */
      recipeContentConfig as unknown as ContentTypeConfig,
      slug,
      ctx.contentDirectory,
    );
    if (await exists(target)) throw new SlugConflictError(slug);
  }

  const date = patch.date ?? current.date ?? Date.now();
  const { data, uploads } = buildRecipeWrite(patch, { date, current });

  const result = await updateContent<Recipe, RecipeEntryValue, RecipeEntryKey>({
    config: recipeContentConfig,
    slug,
    currentSlug,
    currentIndexKey: [current.date, currentSlug],
    data,
    uploads,
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage: `Update recipe: ${slug}`,
  });
  ctx.onWrite?.({
    contentType: recipeContentConfig.contentType,
    kind: "update",
    result,
    slug,
    /* Only on a real rename: the old URL is a page that now 404s. */
    ...(slug !== currentSlug ? { previousSlug: currentSlug } : {}),
  });

  return { slug, date, path: recipePath(ctx, slug), url: recipeUrl(slug) };
}

async function deleteRecipeIfPresent(
  ctx: CurationContext,
  slug: string,
  commitMessage: string,
): Promise<boolean> {
  const current = await readContentFileOrNull<
    Recipe,
    RecipeEntryValue,
    RecipeEntryKey
  >({
    config: recipeContentConfig,
    slug,
    contentDirectory: ctx.contentDirectory,
  });
  if (!current) return false;
  const result = await deleteContent<Recipe, RecipeEntryValue, RecipeEntryKey>({
    config: recipeContentConfig,
    slug,
    indexKey: [current.date, slug],
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage,
  });
  /*
   * Fires on the overwrite path too, so `create --overwrite` reports a delete
   * and then a create. That is what actually happened on disk (fact 7), and the
   * delete's config is the one that clears the old item's dependents.
   */
  ctx.onWrite?.({
    contentType: recipeContentConfig.contentType,
    kind: "delete",
    result,
    slug,
  });
  return true;
}

export async function deleteRecipe(
  ctx: CurationContext,
  slug: string,
): Promise<{ slug: string; deleted: true }> {
  /* `deleteContent` needs the index key, which only the record carries (fact 6). */
  const deleted = await deleteRecipeIfPresent(
    ctx,
    slug,
    `Delete recipe: ${slug}`,
  );
  if (!deleted) throw new NotFoundError(`No recipe at slug "${slug}"`, slug);
  return { slug, deleted: true };
}
