"use server";

import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import slugify from "@sindresorhus/slugify";
import createDefaultFeaturedRecipeSlug from "recipe-website-common/controller/createFeaturedRecipeSlug";
import { featuredRecipeContentConfig } from "recipe-website-common/controller/featuredRecipeContentConfig";
import type { FeaturedRecipeFormState } from "recipe-website-common/controller/featuredRecipeFormState";
import type {
  FeaturedRecipe,
  FeaturedRecipeEntryKey,
} from "recipe-website-common/controller/types";
import { z } from "zod";
import parseFeaturedRecipeFormData, {
  ParsedFeaturedRecipeFormData,
} from "../parseFeaturedRecipeFormData";
import type { EditorContentConfig } from "@discontent/cms/content/editorContentConfig";
import { createGenericActions } from "@discontent/cms/content/genericActions";
import { authenticateUser } from "./shared";
import { featuredRecipeSuccessConfig } from "../successConfigs";

const featuredRecipeEditorConfig: EditorContentConfig<
  FeaturedRecipe,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  FeaturedRecipeEntryKey,
  FeaturedRecipeFormState,
  ParsedFeaturedRecipeFormData
> = {
  contentConfig: featuredRecipeContentConfig,
  successConfig: featuredRecipeSuccessConfig,
  label: "featured recipe",
  // Auth is injected rather than imported: the factory lives in
  // @discontent/cms and cannot reach this app\'s `@/auth` alias. Required by
  // the type, so a content type cannot ship an unauthenticated write path.
  authenticate: authenticateUser,

  parseFormData(formData: FormData) {
    const formResult = parseFeaturedRecipeFormData(formData);
    if (!formResult.success) {
      return {
        success: false as const,
        state: {
          errors: z.flattenError(formResult.error).fieldErrors,
          message: "Error parsing featured recipe",
        },
      };
    }
    return { success: true as const, parsed: formResult.data };
  },

  async buildCreateData(parsed) {
    const date: number = parsed.date || Date.now();
    const slug = slugify(
      parsed.slug || createDefaultFeaturedRecipeSlug({ date }),
    );
    const data: FeaturedRecipe = {
      recipe: parsed.recipe,
      date,
      note: parsed.note,
    };
    return { slug, data };
  },

  async buildUpdateData(parsed, currentSlug, currentDate) {
    const slug = slugify(parsed.slug || currentSlug);
    const date = parsed.date || currentDate || Date.now();
    const data: FeaturedRecipe = {
      recipe: parsed.recipe,
      date,
      note: parsed.note,
    };
    return { slug, data };
  },

  buildCurrentIndexKey(currentDate, currentSlug) {
    return [currentDate, currentSlug];
  },
};

const featuredRecipeActions = createGenericActions(featuredRecipeEditorConfig);
export const createFeaturedRecipe = featuredRecipeActions.create;
export const updateFeaturedRecipe = featuredRecipeActions.update;
export const deleteFeaturedRecipe = featuredRecipeActions.delete;

export async function rebuildFeaturedRecipeIndex() {
  const contentDirectory = getContentDirectory();
  await rebuildIndex({
    config: featuredRecipeContentConfig,
    contentDirectory,
  });
  /*
   * A rebuild reprojects every page, so every cached page is potentially wrong,
   * and the pagination reads are cached by tag. Without this the operator
   * presses "Rebuild" and the site goes on serving pre-rebuild pages, which is
   * the exact failure the button exists to repair.
   *
   * **One config, and the list is the point.** `revalidateDerivedState` takes a
   * list precisely so a seat can say what it touched instead of what exists:
   * this rebuild moves featured recipes and nothing else, so it passes featured
   * recipes and nothing else. That covers `/featured-recipes` and its numbered
   * pages, plus the homepage's featured strip and hero choice, which read the
   * same head — so neither `revalidatePath("/")` nor
   * `revalidatePath("/featured-recipes")` is left; they predate the pages
   * carrying tags at all.
   *
   * It expands to two tags rather than the one written here before: the
   * keyspace, plus `item:featured-recipes`. The second is new and is the
   * catch-all every repair seat fires — a rebuild reprojects, so it cannot know
   * which cached feature records are still right.
   *
   * What it deliberately does **not** fire is anything in the recipe keyspace:
   * no `pagination:recipes:by-date`, no recipe aggregate, no `item:recipes`.
   * Recipe records are untouched by a featured rebuild. The sibling seat in
   * `actions/index.ts` passes both configs because its rebuild really does
   * cascade (D1); this one does not, and widening it to match would be the
   * over-invalidation §6.4 exists to prevent. `test/revalidateDerived.test.ts`
   * pins that difference, since it is a property no e2e test can see.
   */
  revalidateDerivedState([featuredRecipeContentConfig]);
}
