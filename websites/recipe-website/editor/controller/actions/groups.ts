"use server";

import { lockedRebuild } from "../lockedRebuild";
import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import slugify from "@sindresorhus/slugify";
import { redirect } from "next/navigation";
import createDefaultGroupSlug from "recipe-website-common/controller/createGroupSlug";
import { featuredRecipeContentConfig } from "recipe-website-common/controller/featuredRecipeContentConfig";
import { getGroupBySlug } from "recipe-website-common/controller/data/readGroups";
import { groupContentConfig } from "recipe-website-common/controller/groupContentConfig";
import type { GroupFormState } from "recipe-website-common/controller/groupFormState";
import type {
  Group,
  GroupEntryKey,
} from "recipe-website-common/controller/types";
import { z } from "zod";
import parseGroupFormData, { ParsedGroupFormData } from "../parseGroupFormData";
import type { UploadSpec } from "@discontent/cms/content/types";
import type { EditorContentConfig } from "@discontent/cms/content/editorContentConfig";
import { createGenericActions } from "@discontent/cms/content/genericActions";
import { authenticateUser } from "./shared";
import {
  groupDeleteSuccessConfig,
  groupSuccessConfig,
} from "../successConfigs";
import { curationContextFor } from "../apiContext";
import {
  addItem,
  assertNoGroupCycle,
  deleteGroup as deleteGroupAndFeatures,
  setItems,
} from "../curation/groups";
import { GroupCycleError, toErrorObject } from "../curation/errors";
import {
  PLAN_CHANGED,
  planItemsKey,
} from "recipe-website-common/util/planPage";

/**
 * The parsed form, as a group record plus the uploads that go with it. The one
 * place the shape is assembled.
 *
 * Modelled on `buildRecipeData` (`actions/index.ts`) and for the same reason:
 * the data file's `image` and the upload's fate are two statements of one
 * decision, and deriving them apart is how a record ends up naming a file that
 * was never written. `current` is the record on disk — the *raw* read, never
 * the cached one (T5) — which is what carries an untouched picture forward
 * through an edit that says nothing about it.
 */
function buildGroupData(
  parsed: ParsedGroupFormData,
  date: number,
  current?: Group | null,
): {
  data: Group;
  uploads: Record<string, UploadSpec>;
} {
  const { name, kind, description, items, image, clearImage, tags } = parsed;

  /*
   * An empty `File` is what an untouched file input submits, so size is the
   * test for "a file was chosen", exactly as the recipe path has it.
   */
  const uploadedImage = image && image.size > 0 ? image : undefined;

  const uploads: Record<string, UploadSpec> = {
    image: {
      file: uploadedImage,
      clearFile: clearImage,
      existingFile: current?.image,
    },
  };

  const imageFileName = uploadedImage
    ? uploadedImage.name
    : clearImage
      ? undefined
      : current?.image;

  const data: Group = {
    name,
    date,
    kind,
    description,
    image: imageFileName,
    /*
     * Spread, never assigned (T16/24b). `tags` is already normalised and
     * defaulted to `[]` by the parser, so an untagged group writes no `tags`
     * key at all and its data file stays byte-identical to what it was — which
     * is also what clears the list when every chip is removed.
     */
    ...(tags.length > 0 ? { tags } : {}),
    items,
  };

  return { data, uploads };
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
    const { data } = buildGroupData(parsed, date);
    return { slug, data };
  },

  async buildUpdateData(parsed, currentSlug, currentDate, contentDirectory) {
    /*
     * The *current* slug is the fallback, not a slug re-derived from the name:
     * renaming a group must not silently move its URL, which is how the
     * featured and page configs differ from each other and why this follows
     * featured recipes.
     */
    const slug = slugify(parsed.slug || currentSlug);
    const date = parsed.date || currentDate || Date.now();
    const current = await getGroupBySlug({
      slug: currentSlug,
      contentDirectory,
    });
    const { data } = buildGroupData(parsed, date, current);
    return { slug, data };
  },

  async buildCreateUploads(parsed) {
    const { uploads } = buildGroupData(parsed, 0);
    return uploads;
  },

  async buildUpdateUploads(parsed, currentSlug, contentDirectory) {
    const current = await getGroupBySlug({
      slug: currentSlug,
      contentDirectory,
    });
    const { uploads } = buildGroupData(parsed, 0, current);
    return uploads;
  },

  buildCurrentIndexKey(currentDate, currentSlug): GroupEntryKey {
    return [currentDate, currentSlug];
  },
};

const groupActions = createGenericActions(groupEditorConfig);

/**
 * `Group.kind` narrowed to `"meal-plan"` (31c, `24-D5`): a curated collection
 * is a term with a pinned front now. The curation seat refuses one in its
 * schema; the form is refused here, as a field error on Kind, because the
 * generic actions' build hooks cannot return one.
 */
const NEW_COLLECTION_REFUSED =
  "New groups are meal plans. A collection is now a term: tag its recipes, then describe the term on its tag page.";

function refuseCollection(): GroupFormState {
  return {
    message: "Error parsing group",
    errors: { kind: [NEW_COLLECTION_REFUSED] },
  };
}

/**
 * The form's "Add group" rows can name any group (epic 31), so a write that
 * would make a group contain itself — directly or through a sub-group — is
 * refused here, before the generic action writes, with the curation seat's own
 * check. `null` when the items are fine, or there is nothing to check.
 */
async function groupCycleError(
  formData: FormData,
  fallbackSlug?: string,
): Promise<GroupFormState | null> {
  const parsed = parseGroupFormData(formData);
  if (!parsed.success || !(await authenticateUser())) return null;
  const { items, name, date } = parsed.data;
  if (!items.some((item) => item.group)) return null;
  const slug = slugify(
    parsed.data.slug ||
      fallbackSlug ||
      createDefaultGroupSlug({ name, date: date || Date.now() }),
  );
  try {
    await assertNoGroupCycle(
      { contentDirectory: getContentDirectory() },
      slug,
      items,
    );
  } catch (error) {
    if (error instanceof GroupCycleError) {
      return { message: error.message, errors: { items: [error.message] } };
    }
    throw error;
  }
  return null;
}

export async function createGroup(
  prevState: GroupFormState | null,
  formData: FormData,
): Promise<GroupFormState> {
  if (formData.get("kind") === "collection") return refuseCollection();
  return (
    (await groupCycleError(formData)) ??
    groupActions.create(prevState, formData)
  );
}

/**
 * An existing collection may be re-saved as one — the form offers the legacy
 * option only to a group that already is a collection — but no other group
 * may become one. The record is read raw (T5), as `buildUpdateData` reads it.
 */
export async function updateGroup(
  currentDate: number,
  currentSlug: string,
  prevState: GroupFormState | null,
  formData: FormData,
): Promise<GroupFormState> {
  if (formData.get("kind") === "collection") {
    const current = await getGroupBySlug({
      slug: currentSlug,
      contentDirectory: getContentDirectory(),
    }).catch(() => null);
    if (current?.kind !== "collection") return refuseCollection();
  }
  return (
    (await groupCycleError(formData, currentSlug)) ??
    groupActions.update(currentDate, currentSlug, prevState, formData)
  );
}

/**
 * The group page's Delete, through the curation seat rather than the generic
 * delete (epic 32, D1): `curation/groups.ts` `deleteGroup` also takes the
 * group's featured entries off the strip, and the browser and `group_delete`
 * should not disagree about what a delete does. `curationContextFor` gives it
 * the same revalidation a form write gets (`groupDeleteSuccessConfig`, and
 * the featured config for each unfeature); the redirect is the one the
 * generic delete made. `_currentDate` stays in the signature the page binds:
 * the seat reads the index key from the record itself.
 */
export async function deleteGroup(
  _currentDate: number,
  slug: string,
): Promise<void> {
  const email = await authenticateUser();
  if (!email) {
    throw new Error("Authentication required");
  }
  await deleteGroupAndFeatures(curationContextFor(email), slug);
  /* Outside any try: `redirect` throws, and that throw is the navigation. */
  redirect(groupDeleteSuccessConfig.redirectTo?.(slug) ?? "/groups");
}

/** A plan page write's answer (43p1): `{ok}`, or the seat's error message. */
export type PlanWriteResult = { ok: true } | { error: string };

async function planWrite(
  run: (email: string) => Promise<unknown>,
): Promise<PlanWriteResult> {
  const email = await authenticateUser();
  if (!email) return { error: "Sign in to change the plan." };
  try {
    await run(email);
    return { ok: true };
  } catch (error) {
    return { error: toErrorObject(error).error.message };
  }
}

/**
 * The plan page's **Save** (43p1, D5): the rows in their new order, each
 * with its scale, and without the rows taken off — one commit through the
 * curation seat's `setItems`, which `PUT /api/group/<slug>` and the agents'
 * `group_set_items` also write through. The seat validates every item (a
 * scale must be positive, a sub-group row carries none) and refuses a
 * cycle. `force`: the page writes back rows it already had, and a dangling
 * row is a state the plan was in, not one this Save made (Dp1-5).
 */
export async function savePlanItems(
  slug: string,
  items: unknown,
  base: unknown,
): Promise<PlanWriteResult> {
  /*
   * `base`: the key of the rows the page's draft was made over
   * (`planItemsKey`). When the stored rows differ — another tab, the API or
   * an agent wrote since the page rendered — nothing is written and the page
   * says so, rather than this Save silently undoing that write.
   */
  if (typeof base !== "string") return { error: PLAN_CHANGED };
  return planWrite((email) =>
    setItems(curationContextFor(email), slug, items, {
      force: true,
      unchanged: (current) => planItemsKey(current) === base,
      changedMessage: PLAN_CHANGED,
    }),
  );
}

/**
 * The plan page's "Add a recipe or a plan by name" (43p1): one row at the
 * end, one commit (`addItem`). Not forced — a name the page offered exists,
 * and a plan that would contain itself is refused.
 */
export async function addPlanItem(
  slug: string,
  ref: unknown,
): Promise<PlanWriteResult> {
  const value = (ref ?? {}) as { recipe?: unknown; group?: unknown };
  const target =
    typeof value.group === "string"
      ? { group: value.group }
      : typeof value.recipe === "string"
        ? { recipe: value.recipe }
        : undefined;
  if (!target) return { error: "Name a recipe or a plan to add." };
  return planWrite((email) => addItem(curationContextFor(email), slug, target));
}

export async function rebuildGroupIndex() {
  const contentDirectory = getContentDirectory();
  /* Under the write lock (34d): see `lockedRebuild`. Busy: nothing moved. */
  const rebuilt = await lockedRebuild(contentDirectory, "rebuild groups", () =>
    rebuildIndex({
      config: groupContentConfig,
      contentDirectory,
    }),
  );
  if (!rebuilt) return;
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
