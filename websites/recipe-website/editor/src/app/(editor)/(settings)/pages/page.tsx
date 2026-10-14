import {
  getPagesListPage,
  type PageIndexEntry,
} from "@discontent/pages-collection/controller/data/readIndex";
import { parseListPage } from "@discontent/cms/content/listPage";
import { ListPagination } from "@discontent/component-library/components/ListPagination";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth, signIn } from "@/auth";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";

function PageListItem({ page: { name, slug } }: { page: PageIndexEntry }) {
  return (
    <Link
      href={`/pages/edit/${slug}`}
      className="my-2 block rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-primary/50 hover:bg-accent"
    >
      <h2>{name}</h2>
      <div className="italic text-muted-foreground">{slug}</div>
    </Link>
  );
}

/**
 * The pages list, newest first, 20 to a page (F6c, epic 35q): `/pages` is page
 * 1, `/pages?page=2` the next older 20.
 */
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
    <PageMain>
      <PageSection grow>
        <PageHeading>Page Editor</PageHeading>
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
      </PageSection>
      <PageSection className="py-2">
        <Link href="/pages/new">New Page</Link>
      </PageSection>
    </PageMain>
  );
}
