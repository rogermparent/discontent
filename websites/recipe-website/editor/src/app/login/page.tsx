import { redirect } from "next/navigation";
import { REMEMBER_ME_SECONDS } from "@discontent/auth/config";
import { LoginForm } from "@discontent/auth/LoginForm";
import { safeRedirectPath } from "@discontent/auth/redirect";
import {
  PageHeading,
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { auth } from "@/auth";
import { signInAction } from "../authActions";

export const metadata = { title: "Sign in" };

const REMEMBER_DAYS = Math.round(REMEMBER_ME_SECONDS / 86_400);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The editor's own sign-in page (47e). Every "needs the owner" redirect comes
 * here as `/login?redirectTo=<path>`, and the form's action sends the person
 * back to that path — on the host they used, whatever it is.
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
    <PageMain>
      <PageSection maxWidth="xl" grow>
        <PageHeading as="h1">Sign in</PageHeading>
        <LoginForm
          action={signInAction}
          redirectTo={redirectTo}
          notice={notice}
          rememberDays={REMEMBER_DAYS}
        />
      </PageSection>
    </PageMain>
  );
}
