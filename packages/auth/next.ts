import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  parseSetCookieHeader,
  toCookieOptions,
} from "better-auth/cookies/utils";
import type { EditorAuth } from "./config";
import {
  checkSignInLimits,
  clearAccountLimit,
  tooManyAttempts,
} from "./limits";
import { loginPath, safeRedirectPath } from "./redirect";
import { authRequest, requestHost } from "./request";
import { readStoredUser } from "./userFiles";
import type { StoredSession } from "./storage";

/**
 * What each editor's `@/auth` module is made of (47e): the session helper
 * every page and action calls, and the bodies of the sign-in, sign-out and
 * sign-out-everywhere server actions.
 *
 * Every redirect here is a root-relative path (`redirect.ts`), so the
 * browser stays on the host it is on — whatever that host is.
 */

export interface OwnerSession {
  user: { id: string; email: string };
  session: { id: string; expiresAt: Date };
}

export interface LoginState {
  error?: string;
  email?: string;
}

/** One message for a wrong email and a wrong password alike. */
export const WRONG_CREDENTIALS = "That email and password don't match.";

/** Anything else that stopped a sign-in: a storage failure, say. */
export const SIGN_IN_FAILED = "Couldn't sign in — try again.";

/*
 * Better Auth's error codes that mean "not these credentials". Everything
 * else — `FAILED_TO_CREATE_SESSION` (an LMDB write failure, also a 401),
 * a validation error, a 500 — is not the person's typing, and saying "wrong
 * password" for it would send them hunting for a password that was right.
 */
const CREDENTIAL_CODES = new Set([
  "INVALID_EMAIL_OR_PASSWORD",
  "INVALID_EMAIL",
  "PASSWORD_TOO_LONG",
]);

async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.clone().json()) as { code?: unknown };
    return typeof body?.code === "string" ? body.code : undefined;
  } catch {
    return undefined;
  }
}

export interface NextAuthHelperOptions {
  getAuth: () => EditorAuth;
  usersDirectory: () => string;
  cookiePrefix: string;
}

/** The path the person was on, from `Referer` — only if it is this host. */
export function refererPath(
  requestHeaders: Pick<Headers, "get">,
): string | undefined {
  const referer = requestHeaders.get("referer");
  const host = requestHost(requestHeaders);
  if (!referer || !host) return undefined;
  try {
    const url = new URL(referer);
    if (url.host.toLowerCase() !== host.toLowerCase()) return undefined;
    return safeRedirectPath(`${url.pathname}${url.search}`, "") || undefined;
  } catch {
    return undefined;
  }
}

export function createNextAuthHelpers({
  getAuth,
  usersDirectory,
  cookiePrefix,
}: NextAuthHelperOptions) {
  const sessionCookie = `${cookiePrefix}.session_token`;
  const ownCookies = [
    sessionCookie,
    `${cookiePrefix}.session_data`,
    `${cookiePrefix}.dont_remember`,
  ];

  /**
   * The signed-in owner, or `null`. Cached per request (`react`'s `cache`),
   * so the layout, the footer and the page share one lookup.
   *
   * A session whose user file has gone (the user was removed from `users/`)
   * is not a session: deleting the file signs that person out everywhere.
   */
  const auth = cache(async (): Promise<OwnerSession | null> => {
    const requestHeaders = await headers();
    const cookie = requestHeaders.get("cookie");
    /* A guest's request: no LMDB read at all. */
    if (!cookie || !cookie.includes(`${sessionCookie}=`)) return null;
    let result;
    try {
      result = await getAuth().auth.api.getSession({
        headers: requestHeaders,
      });
    } catch (error) {
      console.error("[auth] session lookup failed", error);
      return null;
    }
    if (!result) return null;
    const stored = await readStoredUser(usersDirectory(), result.user.id);
    if (!stored) return null;
    return {
      user: { id: stored.id, email: stored.email },
      session: {
        id: result.session.id,
        expiresAt: new Date(result.session.expiresAt),
      },
    };
  });

  /** For a page or action that needs the owner: off to `/login`, and back. */
  function redirectToLogin(redirectTo?: string): never {
    redirect(loginPath(redirectTo));
  }

  async function clearCookies() {
    const jar = await cookies();
    for (const name of ownCookies) {
      if (jar.get(name)) jar.delete(name);
    }
  }

  /** The `/login` form's action body. Redirects on success. */
  async function signInWithPassword(
    _previous: LoginState,
    formData: FormData,
  ): Promise<LoginState> {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const rememberMe = formData.get("remember") === "on";
    const redirectTo = safeRedirectPath(formData.get("redirectTo"), "/");
    if (!email || !password) {
      return { error: "Enter your email and password.", email };
    }
    const requestHeaders = await headers();
    const editor = getAuth();
    let wait: number | null;
    try {
      wait = await checkSignInLimits(editor, email);
    } catch (error) {
      console.error("[auth] sign-in limit check failed", error);
      return { error: SIGN_IN_FAILED, email };
    }
    if (wait !== null) return { error: tooManyAttempts(wait), email };
    const request = authRequest(requestHeaders, "/sign-in/email", {
      email,
      password,
      rememberMe,
    });
    if (!request) {
      return { error: "Couldn't sign in from this address.", email };
    }
    let response: Response;
    try {
      response = await editor.auth.handler(request);
    } catch (error) {
      console.error("[auth] sign-in failed", error);
      return { error: SIGN_IN_FAILED, email };
    }
    if (response.status === 429) {
      const retry = Number(response.headers.get("x-retry-after")) || 60;
      return { error: tooManyAttempts(retry), email };
    }
    if (response.status === 401 || response.status === 400) {
      const code = await errorCode(response);
      if (code && CREDENTIAL_CODES.has(code)) {
        return { error: WRONG_CREDENTIALS, email };
      }
      console.error(
        `[auth] sign-in failed with ${response.status} ${code ?? "(no code)"}:`,
        await response.text().catch(() => ""),
      );
      return { error: SIGN_IN_FAILED, email };
    }
    if (response.status >= 500) {
      console.error(
        `[auth] sign-in failed with ${response.status}:`,
        await response.text().catch(() => ""),
      );
      return { error: SIGN_IN_FAILED, email };
    }
    if (!response.ok) {
      console.warn(
        `[auth] sign-in refused with ${response.status}:`,
        await response.text().catch(() => ""),
      );
      return {
        error:
          "Couldn't sign in: the request was refused. Reload and try again.",
        email,
      };
    }
    const jar = await cookies();
    for (const line of response.headers.getSetCookie()) {
      for (const [name, attributes] of parseSetCookieHeader(line)) {
        jar.set(name, attributes.value, toCookieOptions(attributes));
      }
    }
    await clearAccountLimit(editor, email).catch((error) => {
      console.warn("[auth] couldn't reset the account's sign-in count", error);
    });
    redirect(redirectTo);
  }

  /** The footer's Sign In: to `/login`, coming back to this page. */
  async function startSignIn(): Promise<never> {
    redirectToLogin(refererPath(await headers()));
  }

  /** Sign out this browser, then back to `redirectTo` (or this page). */
  async function signOut(redirectTo?: string): Promise<never> {
    const requestHeaders = await headers();
    try {
      await getAuth().auth.api.signOut({ headers: requestHeaders });
    } catch (error) {
      console.error("[auth] sign-out failed", error);
    }
    await clearCookies();
    redirect(safeRedirectPath(redirectTo ?? refererPath(requestHeaders), "/"));
  }

  /**
   * Settings → Maintenance's "Sign out everywhere": every session of this
   * user ends, this browser's included (De7), and the person lands on
   * `/login` to sign in again here.
   */
  async function signOutEverywhere(): Promise<never> {
    const requestHeaders = await headers();
    const owner = await auth();
    if (!owner) redirectToLogin(refererPath(requestHeaders));
    const { auth: instance, storage } = getAuth();
    try {
      await instance.api.revokeSessions({ headers: requestHeaders });
    } catch (error) {
      console.error("[auth] revokeSessions failed; sweeping", error);
    }
    await storage.sweepUserSessions(owner.user.id);
    await clearCookies();
    redirect("/login?signedOut=everywhere");
  }

  /**
   * The owner's sign-ins on this editor (48d, Account & devices), and which
   * one is this browser's. Never a session's token. `null` signed out.
   */
  async function listOwnSessions(): Promise<{
    currentId: string;
    sessions: StoredSession[];
  } | null> {
    const owner = await auth();
    if (!owner) return null;
    const sessions = await getAuth().storage.listUserSessions(owner.user.id);
    return { currentId: owner.session.id, sessions };
  }

  /**
   * End one of the owner's other sign-ins by its id (48d). This browser's
   * own is a plain sign-out, so it is refused here: answers `false` for it,
   * for an id that is not the owner's, and signed out.
   */
  async function signOutSession(sessionId: string): Promise<boolean> {
    const owner = await auth();
    if (!owner || !sessionId || sessionId === owner.session.id) return false;
    return getAuth().storage.revokeUserSession(owner.user.id, sessionId);
  }

  return {
    auth,
    redirectToLogin,
    listOwnSessions,
    signOutSession,
    signInWithPassword,
    startSignIn,
    signOut,
    signOutEverywhere,
  };
}
