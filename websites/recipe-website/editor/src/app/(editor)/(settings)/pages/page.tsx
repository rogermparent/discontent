import getPages, {
  PageIndexEntry,
} from "@discontent/pages-collection/controller/data/readIndex";
import Link from "next/link";
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

export default async function Pages() {
  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: "/pages" });
  }

  const { pages } = await getPages();

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
      </PageSection>
      <PageSection className="py-2">
        <Link href="/pages/new">New Page</Link>
      </PageSection>
    </PageMain>
  );
}
