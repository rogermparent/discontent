import {
  getPagesListPage,
  type PageIndexEntry,
} from "@discontent/pages-collection/controller/data/readIndex";
import { parseListPage } from "@discontent/cms/content/listPage";
import { ListPagination } from "@discontent/component-library/components/ListPagination";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth, signIn } from "@/auth";

function PageListItem({ page: { name, slug } }: { page: PageIndexEntry }) {
  return (
    <Link
      href={`/pages/edit/${slug}`}
      className="my-2 py-1 px-2 rounded-lg bg-secondary text-secondary-foreground block"
    >
      <h2>{name}</h2>
      <div className="italic text-gray-400">{slug}</div>
    </Link>
  );
}

/** Newest first, 20 to a page (F6b, epic 35q); `/pages?page=2` the next. */
export default async function Pages({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: "/pages" });
  }

  const pageNumber = parseListPage((await searchParams).page);
  if (pageNumber === null) notFound();
  const listed = await getPagesListPage(pageNumber);
  if (!listed) notFound();
  const pages = listed.entries;

  return (
    <main className="flex flex-col items-center w-full p-2 max-w-4xl mx-auto grow">
      <div className="m-2 text-left w-full grow">
        <h2 className="font-bold text-2xl">Page Editor</h2>
        {pages && pages.length > 0 ? (
          <div>
            {pages.map((page) => {
              return <PageListItem key={page.slug} page={page} />;
            })}
          </div>
        ) : (
          <p className="text-center my-4">There are no pages yet.</p>
        )}
        <ListPagination
          basePath="/pages"
          page={listed.page}
          newerPage={listed.newerPage}
          olderPage={listed.olderPage}
        />
      </div>
      <div>
        <Link href="/pages/new">New Page</Link>
      </div>
    </main>
  );
}
