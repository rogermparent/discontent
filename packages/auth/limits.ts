import { createHash } from "node:crypto";
import type { EditorAuth } from "./config";

/**
 * The sign-in limits Better Auth's own limiter cannot give (De5).
 *
 * Better Auth counts sign-in attempts per client address, and the address is
 * its reading of `x-forwarded-for` — which the client can send itself: Next
 * fills that header from the socket only when the request has none, and
 * nothing sits in front of these editors to overwrite it. A rotating
 * `X-Forwarded-For` would get unlimited tries. So the sign-in action also
 * counts, before Better Auth runs:
 *
 * - **per account** — the typed email, lower-cased and hashed (an LMDB key
 *   stays short whatever is typed), ten tries per 15 minutes; a successful
 *   sign-in starts its window again;
 * - **overall** — every attempt on this editor, sixty a minute, which also
 *   bounds how many per-account rows a stranger can make.
 *
 * Both live in the same LMDB store as the sessions (`<settings>/auth`).
 */

export function accountLimitKey(email: string): string {
  const digest = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
  return `signin-email:${digest}`;
}

export const GLOBAL_LIMIT_KEY = "signin-all";

/** Seconds to wait, or `null` when this attempt may go ahead. */
export async function checkSignInLimits(
  editor: Pick<
    EditorAuth,
    "storage" | "accountSignInRate" | "globalSignInRate"
  >,
  email: string,
  now: () => number = Date.now,
): Promise<number | null> {
  const { storage, accountSignInRate, globalSignInRate } = editor;
  const overall = await storage.hit(GLOBAL_LIMIT_KEY, globalSignInRate.window);
  if (overall.count > globalSignInRate.max) {
    return secondsUntil(overall.resetAt, globalSignInRate.window, now);
  }
  const account = await storage.hit(
    accountLimitKey(email),
    accountSignInRate.window,
  );
  if (account.count > accountSignInRate.max) {
    return secondsUntil(account.resetAt, accountSignInRate.window, now);
  }
  return null;
}

/** After a successful sign-in: the account's window starts again. */
export async function clearAccountLimit(
  editor: Pick<EditorAuth, "storage">,
  email: string,
): Promise<void> {
  await editor.storage.delete(accountLimitKey(email));
}

function secondsUntil(
  resetAt: number | null,
  window: number,
  now: () => number,
): number {
  if (resetAt === null) return window;
  return Math.max(1, Math.ceil((resetAt - now()) / 1000));
}

/** "Try again in 40 seconds." / "Try again in 14 minutes." */
export function tooManyAttempts(waitSeconds: number): string {
  const wait =
    waitSeconds < 120
      ? `${waitSeconds} seconds`
      : `${Math.ceil(waitSeconds / 60)} minutes`;
  return `Too many sign-in attempts. Try again in ${wait}.`;
}
