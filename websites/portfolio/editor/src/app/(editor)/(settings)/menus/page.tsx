import { auth, signIn } from "@/auth";
import Link from "next/link";

function MenuLink({
  name,
  slug,
  description,
}: {
  name: string;
  slug: string;
  description?: string;
}) {
  return (
    <Link
      href={`/menus/edit/${slug}`}
      className="my-2 py-1 px-2 rounded-lg bg-secondary text-secondary-foreground block"
    >
      <h3 className="text-lg font-bold">{name}</h3>
      {description && <p className="text-muted-foreground">{description}</p>}
    </Link>
  );
}

export default async function Menus() {
  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: "/menus" });
  }
  return (
    <main className="flex flex-col items-center w-full p-2 max-w-4xl mx-auto grow">
      <div className="m-2 text-left w-full grow">
        <h2 className="font-bold text-2xl">Menu Editor</h2>
        <MenuLink
          name="Header"
          slug="header"
          description="Site header navigation"
        />
        <MenuLink
          name="Footer"
          slug="footer"
          description="Site footer navigation"
        />
        {/*
          A third "Homepage Projects" menu used to sit here, editing the
          hand-curated project list inside homepage.json. The homepage *is* the
          index now — it reads the projects collection — so that menu edited a
          list nothing rendered.
        */}
      </div>
    </main>
  );
}
