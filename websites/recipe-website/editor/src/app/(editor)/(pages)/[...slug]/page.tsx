import Link from "next/link";
import { notFound } from "next/navigation";
import getPageBySlug from "@discontent/pages-collection/controller/data/read";
import RenderedPage from "recipe-website-common/components/RenderedPage";
import { Button } from "@discontent/component-library/components/ui/button";
import { auth } from "@/auth";
import { deletePage } from "../../../../../controller/actions/pages";
import { ConfirmDeleteButton } from "@discontent/component-library/components/ConfirmDelete";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugSegments } = await params;
  const slug = slugSegments.join("/");
  return { title: slug };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugSegments } = await params;
  const slug = slugSegments.join("/");
  let page;
  try {
    page = await getPageBySlug(slug);
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      notFound();
    }
    throw e;
  }

  // The *page* stays public — this route is how /about renders for a visitor,
  // and `pages.spec` asserts a 200 for it from an unauthenticated request
  // context. What was not public-safe is the editing UI: this route rendered a
  // Delete button to anonymous visitors, and now that the action itself checks
  // auth, showing it would leave a button that silently does nothing.
  const user = await auth();
  const deleteThisPage = deletePage.bind(null, page.date, slug);

  return (
    <RenderedPage
      page={page}
      actions={
        user ? (
          <>
            <form
              id="delete-page-form"
              action={deleteThisPage}
              className="contents"
            />
            <ConfirmDeleteButton formId="delete-page-form" itemLabel="page" />
            <Button asChild size="sm">
              <Link href={`/pages/edit/${slug}`}>Edit</Link>
            </Button>
          </>
        ) : undefined
      }
    />
  );
}
