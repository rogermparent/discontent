"use server";

import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import slugify from "@sindresorhus/slugify";
import createDefaultGroupSlug from "recipe-website-common/controller/createGroupSlug";
import { groupContentConfig } from "recipe-website-common/controller/groupContentConfig";
import type { GroupFormState } from "recipe-website-common/controller/groupFormState";
import type {
  Group,
  GroupEntryKey,
} from "recipe-website-common/controller/types";
import { z } from "zod";
import parseGroupFormData, { ParsedGroupFormData } from "../parseGroupFormData";
import type { EditorContentConfig } from "@discontent/cms/content/editorContentConfig";
import { createGenericActions } from "@discontent/cms/content/genericActions";
import { authenticateUser } from "./shared";

/** The parsed form, as a group record. The one place the shape is assembled. */
function buildGroupData(parsed: ParsedGroupFormData, date: number): Group {
  return {
    name: parsed.name,
    date,
    kind: parsed.kind,
    description: parsed.description,
    items: parsed.items,
  };
}

const groupEditorConfig: EditorContentConfig<
  Group,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  GroupEntryKey,
  GroupFormState,
  ParsedGroupFormData
> = {
  contentConfig: groupContentConfig,
  successConfig: {
    itemBasePath: "/group",
    /*
     * Empty, and `paginationOnly` on, for the reason the recipe and featured
     * configs give at length: `/groups` and `/groups/[page]` read through the
     * pagination index, so `revalidatePaginationResults` invalidates exactly
     * the pages this write moved, where a blanket `revalidatePath` would drop
     * every sealed page on every save.
     *
     * The flag's only remaining job is dropping `revalidatePath("/")`, and the
     * homepage reads nothing of groups at all — a homepage section is
     * deferred. The recipe *views* that render "Appears in" do read group
     * state, and they are covered without a path call: the block reads
     * `groupsByRecipe`, whose aggregate tag this write fires through
     * `revalidateAggregateResults` — and only when the folded value actually
     * moved, which is the whole point of the aggregate kind.
     */
    listPaths: [],
    paginationOnly: true,
    /* No `redirectTo`: the default is `itemBasePath + "/" + slug`. */
  },
  /*
   * A delete needs its own, or it would inherit the create/update redirect and
   * send the user to the group it just removed. `/groups` is where a delete
   * leaves you everywhere else in this app (pages, menus), and the aggregate
   * tag above still carries the "Appears in" removal onto every recipe view.
   */
  deleteSuccessConfig: {
    itemBasePath: "/group",
    listPaths: [],
    paginationOnly: true,
    redirectTo: () => "/groups",
  },
  label: "group",
  // Auth is injected rather than imported: the factory lives in
  // @discontent/cms and cannot reach this app's `@/auth` alias. Required by
  // the type, so a content type cannot ship an unauthenticated write path.
  authenticate: authenticateUser,

  parseFormData(formData: FormData) {
    const formResult = parseGroupFormData(formData);
    if (!formResult.success) {
      return {
        success: false as const,
        state: {
          errors: z.flattenError(formResult.error).fieldErrors,
          message: "Error parsing group",
        },
      };
    }
    return { success: true as const, parsed: formResult.data };
  },

  async buildCreateData(parsed) {
    const date: number = parsed.date || Date.now();
    const slug = slugify(
      parsed.slug || createDefaultGroupSlug({ name: parsed.name, date }),
    );
    return { slug, data: buildGroupData(parsed, date) };
  },

  async buildUpdateData(parsed, currentSlug, currentDate) {
    /*
     * The *current* slug is the fallback, not a slug re-derived from the name:
     * renaming a group must not silently move its URL, which is how the
     * featured and page configs differ from each other and why this follows
     * featured recipes.
     */
    const slug = slugify(parsed.slug || currentSlug);
    const date = parsed.date || currentDate || Date.now();
    return { slug, data: buildGroupData(parsed, date) };
  },

  buildCurrentIndexKey(currentDate, currentSlug): GroupEntryKey {
    return [currentDate, currentSlug];
  },
};

const groupActions = createGenericActions(groupEditorConfig);
export const createGroup = groupActions.create;
export const updateGroup = groupActions.update;
export const deleteGroup = groupActions.delete;

export async function rebuildGroupIndex() {
  const contentDirectory = getContentDirectory();
  await rebuildIndex({
    config: groupContentConfig,
    contentDirectory,
  });
  /*
   * One config, and the narrowness is the point — the same argument
   * `rebuildFeaturedRecipeIndex` makes. A group rebuild reprojects every group
   * page and re-folds `groupsByRecipe`; it moves no recipe record, no recipe
   * page and no recipe aggregate, so passing recipes here would be the
   * over-invalidation §6.4 exists to prevent. `rebuildIndex` cascades to
   * dependents by default, and groups have none (D3), so the cascade is empty
   * too.
   *
   * It expands to three tags: the keyspace, the aggregate, and
   * `item:groups` — the catch-all every repair seat fires, because a rebuild
   * reprojects and cannot know which cached group records are still right.
   */
  revalidateDerivedState([groupContentConfig]);
}
