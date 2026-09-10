import { notFound } from "next/navigation";
import { getGroupBySlug } from "recipe-website-common/controller/data/readGroups";
import { readAllGroupIds } from "recipe-website-common/controller/data/readGroupPages";
import { recipeItems } from "recipe-website-common/controller/data/readRecipeItem";
import GroupDetailPage from "recipe-website-common/components/GroupDetailPage";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    const group = await getGroupBySlug({ slug });
    return { title: group.name || slug };
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      notFound();
    }
    throw e;
  }
}

export default async function GroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let group;
  try {
    group = await getGroupBySlug({ slug });
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      notFound();
    }
    throw e;
  }

  /*
   * The same body as the editor's, minus the actions and the `force-dynamic` —
   * see that file for why the reads keep the group's order and why a dangling
   * item is rendered rather than skipped.
   */
  const items = await Promise.all(
    (group.items ?? []).map(async (item) => ({
      item,
      recipe: await recipeItems.read(item.recipe),
    })),
  );

  return <GroupDetailPage group={group} slug={slug} items={items} />;
}

/*
 * A keys-only walk of the sorted keyspace, not a read of the content index
 * (F7) — see `recipe/[slug]`.
 *
 * Never empty, for the reason `createPaginatedIndexRoute` and
 * `featured-recipe/[slug]` both document: `output: "export"` rejects a dynamic
 * route whose params come back empty — "Page … is missing
 * generateStaticParams()" is raised for an empty array, not just for a missing
 * function. A content directory with no groups is the ordinary state of every
 * site that has not made one, and without this the build fails outright rather
 * than emitting a site with no groups in it. The placeholder names no group,
 * and the route `notFound()`s it exactly as it would at runtime, so the export
 * writes a 404 body there.
 */
export async function generateStaticParams() {
  const slugs = await readAllGroupIds();
  if (slugs.length === 0) return [{ slug: "_" }];
  return slugs.map((slug) => ({ slug }));
}
