"use server";

import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { featuredRecipeContentConfig } from "recipe-website-common/controller/featuredRecipeContentConfig";
import { tagTermContentConfig } from "recipe-website-common/controller/tagTermContentConfig";

/**
 * The repair seat for the `tag` vocabulary's term records (24c).
 *
 * The only server action term records have in this phase, and deliberately so:
 * every term *write* — create, update, rename, merge, assign — lands with 24e's
 * curation seats, CLI and MCP, and there is no browser form for one. What a
 * term record still needs from here is the same thing every other type needs
 * and for the same reason: an index that has drifted from the files on disk is
 * something only a rebuild repairs, and nothing self-heals on read (T5).
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
