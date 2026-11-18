import { Monitor, Smartphone, LogOut } from "lucide-react";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import {
  getWorkstationName,
  isMirror,
} from "recipe-website-common/config/role";
import { auth, listOwnSessions, redirectToLogin } from "@/auth";
import { signOutEverywhereAction } from "@/app/authActions";
import { readSettings } from "@/settings";
import { When } from "@/curator/time";
import {
  deviceName,
  isHandheld,
  orderSessions,
  remembered,
} from "recipe-editor/controller/account/devices";
import { listTokens } from "recipe-editor/controller/account/tokens";
import { signOutSessionAction } from "recipe-editor/controller/actions/account";
import { ApiTokens } from "./ApiTokens";

export const dynamic = "force-dynamic";

export const metadata = { title: "Account & devices" };

/**
 * Account & devices (48d, canvas B): this editor's sign-ins (47e) with a
 * sign-out for each other device and Sign out everywhere, and the API
 * tokens (47h row 11) — made with a scope and shown once, listed, revoked.
 *
 * Sessions are per editor (47e De8, De13) and the page says so: the
 * workstation and the Pi keep their own sign-ins, while users and tokens
 * live in the synced content and so reach both.
 */
export default async function AccountPage() {
  const owner = await auth();
  if (!owner) {
    return redirectToLogin(`/settings/account`);
  }
  const mirror = isMirror();
  const [listed, tokens, settings] = await Promise.all([
    listOwnSessions(),
    listTokens(getContentDirectory(), owner.user.email),
    mirror ? Promise.resolve(null) : readSettings(),
  ]);
  const workstation = getWorkstationName();
  const mirrors = settings?.mirrors ?? [];
  const thisEditor = mirror
    ? `This editor — a mirror of ${workstation} —`
    : "This editor — the workstation —";
  const otherEditor = mirror
    ? `${workstation}'s editor`
    : mirrors.length > 0
      ? `${mirrors.join(" and ")}'s editor`
      : "a mirror's editor";
  const sessions = orderSessions(listed?.sessions ?? [], listed?.currentId);
  const count = sessions.length;

  return (
    <PageMain>
      <PageSection maxWidth="4xl" grow className="flex flex-col gap-6">
        <header className="flex flex-col gap-1.5">
          <p className="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
            You
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Account &amp; devices
          </h1>
          <p className="text-sm text-muted-foreground">
            Signed in as{" "}
            <span className="font-mono text-foreground">
              {owner.user.email}
            </span>
          </p>
        </header>

        <section
          aria-labelledby="account-sessions"
          className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5"
        >
          <div className="flex flex-col gap-1">
            <h2
              id="account-sessions"
              className="font-display text-lg font-semibold"
            >
              Signed in on this editor
            </h2>
            <p
              className="text-sm text-muted-foreground"
              data-testid="sessions-per-editor"
            >
              {thisEditor} keeps its own sign-ins, and {otherEditor} keeps its
              own: signing in here doesn&apos;t sign you in there, and signing
              out here doesn&apos;t sign you out there. &ldquo;Remember this
              device&rdquo; at sign-in keeps you in for 90 days, renewed as you
              use it; without it, until the browser closes.
            </p>
          </div>
          <ul className="flex flex-col" data-testid="session-list">
            {sessions.map((session) => {
              const current = session.id === listed?.currentId;
              const device = deviceName(session.userAgent);
              const Icon = isHandheld(session.userAgent) ? Smartphone : Monitor;
              return (
                <li
                  key={session.id}
                  data-session={current ? "current" : "other"}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-t py-3 first:border-t-0 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground"
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="flex flex-wrap items-center gap-1.5 text-[15px] leading-5 font-semibold">
                      {device}
                      {current && (
                        <span className="inline-flex items-center rounded-full bg-accent px-1.5 text-xs font-medium text-accent-foreground">
                          this one
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Last active <When epoch={session.updatedAt} />
                      {session.ipAddress && (
                        <>
                          {" · from "}
                          <span className="font-mono">{session.ipAddress}</span>
                        </>
                      )}
                      {" · "}
                      {remembered(session) ? (
                        <>
                          remembered until <When epoch={session.expiresAt} />
                        </>
                      ) : (
                        "until the browser closes"
                      )}
                    </p>
                  </div>
                  {!current && (
                    <form
                      action={signOutSessionAction}
                      className="col-start-2 sm:col-start-3"
                    >
                      <input type="hidden" name="session" value={session.id} />
                      <SubmitButton
                        size="sm"
                        variant="outline"
                        aria-label={`Sign out ${device}`}
                        pendingChildren="Signing out…"
                      >
                        Sign out
                      </SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          {/*
            47e (De7): every session of this account on this editor ends, this
            browser's too, and the next page is /login. Moved here from
            Settings → Maintenance (48d).
          */}
          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
            <form action={signOutEverywhereAction}>
              <SubmitButton
                variant="destructive"
                pendingChildren="Signing out…"
              >
                <LogOut aria-hidden="true" />
                Sign out everywhere
              </SubmitButton>
            </form>
            <p className="min-w-60 flex-1 text-sm text-muted-foreground">
              Ends {count === 1 ? "the one sign-in" : `all ${count} sign-ins`}{" "}
              on this editor, this one too. API tokens keep working. On{" "}
              {otherEditor}, do it there as well.
            </p>
          </div>
        </section>

        <ApiTokens tokens={tokens} otherEditor={otherEditor} />
      </PageSection>
    </PageMain>
  );
}
