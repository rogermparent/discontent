import Link from "next/link";
import { notFound } from "next/navigation";
import { getGroupBySlug } from "recipe-website-common/controller/data/readGroups";
import { resolveGroupItems } from "recipe-website-common/controller/data/resolveGroupItems";
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
   * retitle show here without groups declaring a reference (D3). Lifted into
   * `resolveGroupItems` in 22g, when the featured-recipe routes needed the same
   * four lines; that module documents the order and dangling properties.
   */
  const items = await resolveGroupItems(group);

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
          {/*
           * The same affordance a recipe page has had since 22a, in the same
           * place: a group can be pinned to the homepage strip (22g), and the
           * form's toggle opens on Group with this one selected because the
           * slug rides along in the query string.
           */}
          <Button asChild size="sm">
            <Link href={`/featured-recipe/new?group=${slug}`}>Feature</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/group/${slug}/edit`}>Edit</Link>
          </Button>
        </>
      }
    />
  );
}
