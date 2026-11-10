import Link from "next/link";
import { auth } from "@/auth";
import { signOutAction, startSignInAction } from "@/app/authActions";
import { Button } from "@discontent/component-library/components/ui/button";

/**
 * Owner-only masthead items.
 *
 * Lives in the editor app, not `common/`: it imports the sign-in, and `common/`
 * is compiled by the export app too — importing it there would pull an
 * editor-only dependency into a static build. AppLayout takes it as a slot.
 */
export async function EditorNavExtras() {
  const session = await auth();
  const navClass =
    "font-mono text-xs uppercase tracking-widest text-muted-foreground";

  return (
    <>
      {session ? (
        <>
          <Link
            href="/projects"
            className={`rounded-sm px-2 py-1 transition-colors hover:text-foreground ${navClass}`}
          >
            Manage
          </Link>
          <form
            action={async () => {
              "use server";
              await signOutAction();
            }}
          >
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className={navClass}
            >
              Sign Out
            </Button>
          </form>
        </>
      ) : (
        <form action={startSignInAction}>
          <Button type="submit" variant="ghost" size="sm" className={navClass}>
            Sign In
          </Button>
        </form>
      )}
    </>
  );
}
