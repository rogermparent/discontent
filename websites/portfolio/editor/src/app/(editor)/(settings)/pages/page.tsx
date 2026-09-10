import getPages, {
  PageIndexEntry,
} from "@discontent/pages-collection/controller/data/readIndex";
import Link from "next/link";
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

export default async function Pages() {
  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: "/pages" });
  }

  const { pages } = await getPages();

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
      </div>
      <div>
        <Link href="/pages/new">New Page</Link>
      </div>
    </main>
  );
}
