import { notFound } from "next/navigation";
import { getGroupBySlug } from "recipe-website-common/controller/data/readGroups";
import { getTransformedGroupImageProps } from "recipe-website-common/components/GroupImage";
import EditGroupForm from "./form";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { auth, signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default async function EditGroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: `/group/${slug}/edit` });
  }

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
   * Transformed here rather than in the form: `GroupFields` is a client
   * component and the transform writes files. The same three lines the recipe
   * edit page has, with the group's uploads path behind them.
   */
  const defaultImage = group.image
    ? await getTransformedGroupImageProps({
        slug,
        image: group.image,
        alt: "Group image",
        width: 580,
        height: 450,
        className: "object-cover aspect-ratio-[16/10] h-96",
        sizes: "100vw",
      })
    : undefined;

  return (
    <PageMain>
      <PageSection maxWidth="xl" grow>
        <EditGroupForm group={group} slug={slug} defaultImage={defaultImage} />
      </PageSection>
    </PageMain>
  );
}
