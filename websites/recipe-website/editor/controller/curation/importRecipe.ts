/**
 * Import a recipe from a URL, cite it, and (optionally) write it.
 *
 * `importRecipeData` is shared with the browser's `/new-recipe` flow, so the
 * parsing, the markdown conversion and the `source` citation are identical.
 * What this adds is everything the form used to do around it: turning the
 * importer's two `*ImportUrl` fields into an upload spec and a stored value
 * (fact 9), supplying a name when the page had none, and a dry run — which is
 * how the curator skill inspects a candidate before deciding to keep it.
 */
import path from "node:path";
import { importRecipeData } from "recipe-website-common/util/importRecipeData";
import type {
  Recipe,
  RecipeSource,
} from "recipe-website-common/controller/types";
import type { CurationContext } from "./context";
import { ImportError, ValidationError } from "./errors";
import {
  buildRecipeWrite,
  createRecipe,
  resolveCreateSlug,
  type RecipeWriteResult,
} from "./recipes";
import { RecipeInputSchema, parseInput, type RecipeInput } from "./schema";

export interface ImportDryRunResult {
  dryRun: true;
  url: string;
  slug: string;
  recipe: Recipe;
  image?: { importUrl: string; filename: string };
  video?: string;
}

export interface ImportCreateResult extends RecipeWriteResult {
  source?: RecipeSource;
}

export type ImportResult = ImportDryRunResult | ImportCreateResult;

/** The importer's own return, with "nothing here" turned into an error. */
export async function importFromUrl(url: string) {
  let imported;
  try {
    imported = await importRecipeData(url);
  } catch (error) {
    throw new ImportError(
      `Could not fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!imported) {
    throw new ImportError(`No schema.org Recipe found at ${url}`);
  }
  return imported;
}

/**
 * The importer's shape, as this layer's input.
 *
 * A video-host URL returns no name at all — `importRecipeData` short-circuits
 * to `{videoImportUrl, source}` for YouTube and friends — so `--name` is the
 * only way to import one, and saying so is more useful than a zod issue on a
 * field the caller never wrote.
 */
export function importedToInput(
  imported: Awaited<ReturnType<typeof importFromUrl>>,
  { tags, slug, name }: { tags?: string[]; slug?: string; name?: string } = {},
): RecipeInput {
  const resolvedName = name ?? imported.name;
  if (!resolvedName) {
    throw new ValidationError(
      "The imported page carries no recipe name (video hosts never do) — pass --name to supply one.",
    );
  }
  const raw = {
    name: resolvedName,
    ...(slug ? { slug } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(imported.description ? { description: imported.description } : {}),
    ...(imported.prepTime !== undefined ? { prepTime: imported.prepTime } : {}),
    ...(imported.cookTime !== undefined ? { cookTime: imported.cookTime } : {}),
    ...(imported.totalTime !== undefined
      ? { totalTime: imported.totalTime }
      : {}),
    ...(imported.recipeYield ? { recipeYield: imported.recipeYield } : {}),
    ...(imported.ingredients ? { ingredients: imported.ingredients } : {}),
    ...(imported.instructions ? { instructions: imported.instructions } : {}),
    ...(imported.source ? { source: imported.source } : {}),
    ...(imported.imageImportUrl
      ? { imageImportUrl: imported.imageImportUrl }
      : {}),
    ...(imported.videoImportUrl
      ? { videoImportUrl: imported.videoImportUrl }
      : {}),
  };
  return parseInput(RecipeInputSchema, raw);
}

export async function importAndCreate(
  ctx: CurationContext,
  url: string,
  {
    tags,
    slug,
    name,
    dryRun = false,
    overwrite = false,
  }: {
    tags?: string[];
    slug?: string;
    name?: string;
    dryRun?: boolean;
    overwrite?: boolean;
  } = {},
): Promise<ImportResult> {
  const imported = await importFromUrl(url);
  const input = importedToInput(imported, { tags, slug, name });

  if (dryRun) {
    /*
     * Everything a real import would compute, and nothing written: no
     * `createContent`, so no data file, no index entry and no commit. The
     * recipe shown is the *shaped* one — parsed ingredients, resolved image
     * filename — because what the caller is deciding is whether that is worth
     * keeping.
     */
    const date = input.date ?? Date.now();
    const { data } = buildRecipeWrite(input, { date });
    return {
      dryRun: true,
      url,
      /*
       * `resolveCreateSlug`, imported rather than re-derived, so a dry run
       * cannot advertise a slug the real run would not use.
       */
      slug: resolveCreateSlug(input),
      recipe: data,
      ...(input.imageImportUrl
        ? {
            image: {
              importUrl: input.imageImportUrl,
              filename: path.parse(new URL(input.imageImportUrl).pathname).base,
            },
          }
        : {}),
      ...(data.video ? { video: data.video } : {}),
    };
  }

  const result = await createRecipe(ctx, input, { overwrite });
  return { ...result, ...(input.source ? { source: input.source } : {}) };
}
