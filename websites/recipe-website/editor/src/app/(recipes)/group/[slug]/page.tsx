import Link from "next/link";
import { notFound } from "next/navigation";
import { getGroupBySlug } from "recipe-website-common/controller/data/readGroups";
import { recipeItems } from "recipe-website-common/controller/data/readRecipeItem";
import GroupDetailPage from "recipe-website-common/components/GroupDetailPage";
import { deleteGroup } from "recipe-editor/controller/actions/groups";
import { Button } from "@discontent/component-library/components/ui/button";
import { ConfirmDeleteButton } from "@discontent/component-library/components/ConfirmDelete";

export const dynamic = "force-dynamic";

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
   * Each item's recipe, through the *cached* item read — which is what makes a
   * retitle show here without groups declaring a reference (D3). The reads are
   * concurrent but the array keeps the group's order, because `Promise.all`
   * resolves positionally; for a meal plan the order is the plan.
   *
   * `recipeItems.read` answers `null` rather than throwing for a missing slug,
   * so a dangling item renders as "Recipe not found" instead of 404ing a group
   * that is otherwise entirely fine.
   */
  const items = await Promise.all(
    (group.items ?? []).map(async (item) => ({
      item,
      recipe: await recipeItems.read(item.recipe),
    })),
  );

  const deleteGroupWithSlug = deleteGroup.bind(null, group.date, slug);

  return (
    <GroupDetailPage
      group={group}
      slug={slug}
      items={items}
      actions={
        <>
          <form
            id="delete-group-form"
            action={deleteGroupWithSlug}
            className="contents"
          />
          <ConfirmDeleteButton
            formId="delete-group-form"
            itemLabel="group"
            title="Delete this group?"
            description="The recipes themselves are not deleted — only the grouping."
          />
          <Button asChild size="sm">
            <Link href={`/group/${slug}/edit`}>Edit</Link>
          </Button>
        </>
      }
    />
  );
}
