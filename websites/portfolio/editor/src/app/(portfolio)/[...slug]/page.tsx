import Link from "next/link";
import { notFound } from "next/navigation";
import getPageBySlug from "@discontent/pages-collection/controller/data/read";
import { PageView } from "@discontent/pages-collection/components/View";
import { auth } from "@/auth";
import { deletePage } from "../../../../controller/actions/pages";
import { ConfirmDeleteButton } from "@discontent/component-library/components/ConfirmDelete";

/**
 * The public pages catch-all — this is what renders `/about` in the editor app.
 *
 * It used to live under `(editor)`, whose layout is a bare `ThemeShell`. That
 * is right for settings and the edit forms, and wrong for this: the export
 * renders the same route under `(portfolio)`, fully framed by `AppLayout`, so
 * `/about` had a masthead and footer in the export and none in the editor. The
 * route group is the only thing that changed; route groups do not affect the
 * URL, so `/about` still resolves here.
 */
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
    <main className="flex flex-col items-center w-full h-full grow">
      <div className="flex flex-row grow w-full h-full">
        <div className="grow flex flex-col flex-nowrap items-center">
          <PageView page={page} />
        </div>
      </div>
      {user ? (
        <>
          <hr className="w-full border-border print:hidden" />
          <div className="flex flex-row justify-center m-1 print:hidden">
            <form id="delete-page-form" action={deleteThisPage} />
            <ConfirmDeleteButton formId="delete-page-form" itemLabel="page" />
            <Link
              href={`/pages/edit/${slug}`}
              className="underline bg-secondary text-secondary-foreground rounded-md text-sm py-1 px-2 mx-1"
            >
              Edit
            </Link>
          </div>
        </>
      ) : null}
    </main>
  );
}
