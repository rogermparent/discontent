"use server";

/**
 * The new-recipe form's duplicate check (43e1): at Import time, is a recipe
 * already in the collection from this link — and, if Roger keeps importing,
 * which slug the copy is saved at. Read-only; signed in, as every editor
 * action. The roundup picker's `existingBySource` decides what "the same
 * link" is, so the two seats agree.
 */
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { curationContextFor } from "recipe-editor/controller/apiContext";
import { authenticateUser } from "recipe-editor/controller/actions/shared";
import { recipeBySource } from "recipe-editor/controller/curation/importList";
import { resolveCopySlug } from "recipe-editor/controller/curation/recipes";

/** The recipe a link was already imported as. */
export interface SameSource {
  /** The link asked about, so an answer for an older one is ignored. */
  url: string;
  slug: string;
  name: string;
  /** "14 Oct 2026" (UTC), when the recipe has a date. */
  date?: string;
}

async function context() {
  const email = await authenticateUser();
  return email ? curationContextFor(email, getContentDirectory()) : undefined;
}

/** The recipe already imported from `url`, or null. Never throws: it only informs. */
export async function sameSourceAction(
  url: string,
): Promise<SameSource | null> {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const ctx = await context();
    if (!ctx) return null;
    const found = await recipeBySource(ctx, url.trim());
    if (!found) return null;
    const { date, name } = found.recipe;
    return {
      url,
      slug: found.slug,
      name: name || found.slug,
      ...(date
        ? {
            date: new Date(date).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }),
          }
        : {}),
    };
  } catch {
    return null;
  }
}

/**
 * The slug a copy of the recipe named `name` is saved at: its slug with the
 * first free `-2`, `-3`… (`resolveCopySlug`). Null when there is no name to
 * make one from, or nobody signed in.
 */
export async function copySlugAction(name: string): Promise<string | null> {
  if (typeof name !== "string" || !name.trim()) return null;
  try {
    const ctx = await context();
    if (!ctx) return null;
    return await resolveCopySlug(ctx, { name });
  } catch {
    return null;
  }
}
