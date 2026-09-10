import { auth, signIn, signOut } from "@/auth";
import { buttonVariants } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import {
  FooterLink,
  footerColumnHeadingClass,
  footerLinkClass,
} from "recipe-website-common/components/AppLayout/nav";

const manageLinks = [
  { name: "New Recipe", href: "/new-recipe" },
  { name: "Settings", href: "/settings" },
  { name: "Content Sync", href: "/git" },
];

/**
 * The editor-only "Manage" footer column: owner destinations plus the Sign
 * In/Out control. Passed to AppLayout as `footerNavItems`, so the export
 * (reader) footer never renders it. The Sign In/Out control is a form submit
 * styled with `buttonVariants({ variant: "link" })` (padding/height stripped) so
 * it reads as a text link aligned with the column, not a boxed button.
 */
export async function OwnerFooterLinks() {
  const session = await auth();
  return (
    <div>
      <h2 className={footerColumnHeadingClass}>Manage</h2>
      <div className="flex flex-col gap-2">
        {manageLinks.map((item) => (
          <FooterLink key={item.href} item={item} className={footerLinkClass} />
        ))}
        <form
          className="contents"
          action={async () => {
            "use server";
            if (session) {
              await signOut();
            } else {
              await signIn();
            }
          }}
        >
          <button
            type="submit"
            className={cn(
              buttonVariants({ variant: "link" }),
              "h-auto justify-start p-0",
              footerLinkClass,
            )}
          >
            {session ? "Sign Out" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
