"use server";

import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { redirect } from "next/navigation";
import { featuredRecipeContentConfig } from "recipe-website-common/controller/featuredRecipeContentConfig";
import type { TermFormState } from "recipe-website-common/controller/termFormState";
import { tagTermContentConfig } from "recipe-website-common/controller/tagTermContentConfig";
import { curationContextFor } from "../apiContext";
import { termUrl } from "../curation/context";
import { submitTermForm, type TermFormTarget } from "../termForm";
import { authenticateUser } from "./shared";

/**
 * The term form's two actions (31e): `/tags/new` and `/tags/<slug>/edit`.
 *
 * Thin on purpose. The session's email becomes the same `CurationContext` an
 * API write gets (`curationContextFor`: the commit's `--author`, and
 * `onWrite` → `revalidateContentWrite` with the `tag-terms` success config),
 * and `submitTermForm` hands the form to 31c's `createTerm` / `updateTerm`, so
 * the browser form validates exactly as `term_create` / `term_update` do. A
 * refusal returns as form state; a save redirects to the term's page.
 */
async function submit(
  target: TermFormTarget,
  formData: FormData,
): Promise<TermFormState> {
  const email = await authenticateUser();
  if (!email) return { message: "Authentication required" };
  const outcome = await submitTermForm(
    curationContextFor(email, getContentDirectory()),
    target,
    formData,
  );
  if (!outcome.ok) return outcome.state;
  /* Outside any try: `redirect` throws, and that throw is the navigation. */
  redirect(termUrl(outcome.slug));
}

/** `/tags/new` — a new term record. */
export async function createTermFromForm(
  _prevState: TermFormState | null,
  formData: FormData,
): Promise<TermFormState> {
  return submit({ kind: "new" }, formData);
}

/**
 * `/tags/<slug>/edit` — the record at `slug`, updated, or created there when
 * the term so far lives only on its carriers. The slug is bound by the page
 * and never edited here: moving a term rewrites its carriers, which is
 * `term_rename`'s job.
 */
export async function saveTermFromForm(
  slug: string,
  _prevState: TermFormState | null,
  formData: FormData,
): Promise<TermFormState> {
  return submit({ kind: "edit", slug }, formData);
}

/**
 * The repair seat for the `tag` vocabulary's term records (24c).
 *
 * Every term *write* — create, update, rename, merge, assign — goes through
 * 31c's curation seats: the API, the CLI, MCP and, since 31e, the two form
 * actions above. What a term record still needs from here is the same thing
 * every other type needs and for the same reason: an index that has drifted
 * from the files on disk is something only a rebuild repairs, and nothing
 * self-heals on read (T5).
 *
 * **Two configs, and the second is what the rebuild actually did**, exactly as
 * `rebuildGroupIndex` argues. `rebuildIndex` cascades through `referencedBy` by
 * default, and term records have two dependents: themselves (a parent rename
 * rewrites its children's borrowed `parentLabel`) and featured recipes (a
 * feature of a term borrows its `label` and `image`). So this call has already
 * reprojected the featured index, and a seat naming only terms would leave
 * every featured *term* card serving pre-rebuild borrowed values — the exact
 * failure the button exists to repair. The self-edge needs no second entry:
 * `tag-terms` is already on the list.
 *
 * The narrowness that remains is the point: a term rebuild moves no recipe
 * record, no recipe page and no recipe aggregate, so recipes are not here.
 *
 * It expands to four tags: the term type's `tree` aggregate and
 * `item:tag-terms`, then the featured keyspace and `item:featured-recipes`.
 */
export async function rebuildTermIndex() {
  const contentDirectory = getContentDirectory();
  await rebuildIndex({
    config: tagTermContentConfig,
    contentDirectory,
  });
  revalidateDerivedState([tagTermContentConfig, featuredRecipeContentConfig]);
}

export default rebuildTermIndex;
