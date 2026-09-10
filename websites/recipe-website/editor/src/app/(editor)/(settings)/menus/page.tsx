import { auth, signIn } from "@/auth";
import Link from "next/link";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";

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
      className="my-2 block rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-primary/50 hover:bg-accent"
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
    <PageMain>
      <PageSection grow>
        <PageHeading>Menu Editor</PageHeading>
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
      </PageSection>
    </PageMain>
  );
}
