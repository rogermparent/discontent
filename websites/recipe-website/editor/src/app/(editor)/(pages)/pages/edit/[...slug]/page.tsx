import getPageBySlug from "@discontent/pages-collection/controller/data/read";
import EditForm from "./form";
import { notFound } from "next/navigation";
import { auth, redirectToLogin } from "@/auth";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugSegments } = await params;
  const slug = slugSegments.join("/");
  const user = await auth();
  if (!user) {
    return redirectToLogin(`/pages/edit/${slug}`);
  }
  let page;
  try {
    page = await getPageBySlug(slug);
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      notFound();
    }
    throw e;
  }
  const { name } = page;
  return (
    <PageMain>
      <PageSection maxWidth="xl" grow>
        <PageHeading as="h1">Editing Page: {name}</PageHeading>
        <EditForm page={page} slug={slug} />
      </PageSection>
    </PageMain>
  );
}
