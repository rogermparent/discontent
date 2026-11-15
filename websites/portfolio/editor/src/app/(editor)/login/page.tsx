import { redirect } from "next/navigation";
import { REMEMBER_ME_SECONDS } from "@discontent/auth/config";
import { LoginForm } from "@discontent/auth/LoginForm";
import { safeRedirectPath } from "@discontent/auth/redirect";
import { auth } from "@/auth";
import { signInAction } from "@/app/authActions";

export const metadata = { title: "Sign in" };

const REMEMBER_DAYS = Math.round(REMEMBER_ME_SECONDS / 86_400);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The editor's own sign-in page (47e), the recipe editor's twin: back to a
 * path on this host after signing in, never to a configured URL.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectTo = safeRedirectPath(first(params.redirectTo), "/");
  if (await auth()) redirect(redirectTo);
  const notice =
    first(params.signedOut) === "everywhere"
      ? "Signed out everywhere. Sign in again to keep working on this device."
      : undefined;
  return (
    <main className="mx-auto w-full max-w-xl grow p-4">
      <h1 className="mb-4 font-display text-2xl font-bold">Sign in</h1>
      <LoginForm
        action={signInAction}
        redirectTo={redirectTo}
        notice={notice}
        rememberDays={REMEMBER_DAYS}
      />
    </main>
  );
}
