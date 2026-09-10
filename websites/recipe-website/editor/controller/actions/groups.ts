"use server";

import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import slugify from "@sindresorhus/slugify";
import createDefaultGroupSlug from "recipe-website-common/controller/createGroupSlug";
import { featuredRecipeContentConfig } from "recipe-website-common/controller/featuredRecipeContentConfig";
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
import {
  groupDeleteSuccessConfig,
  groupSuccessConfig,
} from "../successConfigs";

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
  successConfig: groupSuccessConfig,
  deleteSuccessConfig: groupDeleteSuccessConfig,
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
   * Two configs, and the second one is not a widening — it is what the rebuild
   * actually did. `rebuildIndex` cascades through `referencedBy` by default,
   * and since 22g groups have a dependent: a featured entry may point at a
   * group, borrowing its `name` and `kind`. So this call has already
   * reprojected the featured-recipes index as well, and a seat that named only
   * groups would leave every featured *group* card serving pre-rebuild borrowed
   * values — the exact failure the button exists to repair.
   *
   * The narrowness that remains is still the point, and it is the same argument
   * `rebuildFeaturedRecipeIndex` makes: a group rebuild moves no recipe record,
   * no recipe page and no recipe aggregate, so recipes are not on this list.
   *
   * It expands to five tags: the group keyspace, the "Appears in" aggregate and
   * `item:groups`, then the featured keyspace and `item:featured-recipes`. The
   * item catch-alls are what every repair seat fires, because a rebuild
   * reprojects and cannot know which cached records are still right.
   */
  revalidateDerivedState([groupContentConfig, featuredRecipeContentConfig]);
}
