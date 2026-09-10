import { notFound } from "next/navigation";
import { getGroupBySlug } from "recipe-website-common/controller/data/readGroups";
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

  return (
    <PageMain>
      <PageSection maxWidth="xl" grow>
        <EditGroupForm group={group} slug={slug} />
      </PageSection>
    </PageMain>
  );
}
