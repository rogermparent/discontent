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
import { findFeatured } from "../curation/featured";

/**
 * The parsed form, as a featured-recipe record. The one place the shape is
 * assembled, following `buildGroupData`'s lead.
 *
 * **Only the key that is set is written.** The parser guarantees exactly one of
 * them, and spreading conditionally rather than assigning `undefined` keeps the
 * *other* key out of the JSON altogether — so a record on disk says what it
 * features rather than saying it features nothing twice, and re-featuring a
 * recipe on an entry that used to name a group leaves no `"group": null` behind
 * for `resolveReferences` to walk.
 */
function buildFeaturedRecipeData(
  parsed: ParsedFeaturedRecipeFormData,
  date: number,
): FeaturedRecipe {
  return {
    ...(parsed.recipe && { recipe: parsed.recipe }),
    ...(parsed.group && { group: parsed.group }),
    ...(parsed.term && { term: parsed.term }),
    date,
    note: parsed.note,
  };
}

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
    return { slug, data: buildFeaturedRecipeData(parsed, date) };
  },

  async buildUpdateData(parsed, currentSlug, currentDate) {
    const slug = slugify(parsed.slug || currentSlug);
    const date = parsed.date || currentDate || Date.now();
    return { slug, data: buildFeaturedRecipeData(parsed, date) };
  },

  buildCurrentIndexKey(currentDate, currentSlug) {
    return [currentDate, currentSlug];
  },
};

const featuredRecipeActions = createGenericActions(featuredRecipeEditorConfig);

/**
 * The generic create, after the curation seat's duplicate check (epic 31, D2):
 * a target that is already featured comes back as a form error naming the
 * entry that holds it, unless "Feature it again" is ticked. Only on create —
 * an edit rewrites its own entry.
 */
export async function createFeaturedRecipe(
  prevState: FeaturedRecipeFormState | null,
  formData: FormData,
): Promise<FeaturedRecipeFormState> {
  const parsed = parseFeaturedRecipeFormData(formData);
  if (parsed.success && !parsed.data.again && (await authenticateUser())) {
    const { recipe, group, term } = parsed.data;
    const existing = await findFeatured(getContentDirectory(), {
      recipe,
      group,
      term,
    });
    if (existing) {
      const field = recipe ? "recipe" : group ? "group" : "term";
      const message = `Already featured as "${existing}". Tick "Feature it again" to feature it a second time.`;
      return { message, errors: { [field]: [message], again: [message] } };
    }
  }
  return featuredRecipeActions.create(prevState, formData);
}
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
