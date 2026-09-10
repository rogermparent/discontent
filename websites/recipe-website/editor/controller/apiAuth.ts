/**
 * Who is making this API request.
 *
 * Two credentials, checked in that order:
 *
 * 1. `Authorization: Bearer rcp_…` — an API token on a user record (D10). This
 *    is what the CLI's HTTP backend and the curator skill send.
 * 2. The session cookie, through `authenticateUser()`. Kept as a fallback so a
 *    signed-in browser can hit the same routes from devtools without minting a
 *    token, and so the routes and the form actions agree about identity.
 *
 * **This module is outside `controller/curation/`** and cannot move in: it
 * reaches `@/auth` through `actions/shared`, which the D8 allow-list forbids
 * (and rightly — `@/` resolves only under Next). Everything the routes call
 * that *is* transport-agnostic lives on the other side of that line.
 *
 * The editor allows guests (`authorized` in `auth.config.ts` returns true), so
 * nothing intercepts these routes; every write handler calls this itself. Fact
 * 1 of the phase doc: there is no middleware.
 */
import { findUserByToken } from "../src/users";
import { authenticateUser } from "./actions/shared";

const BEARER = /^Bearer\s+(.+)$/i;

/**
 * The authenticated user's email, or `null`.
 *
 * `null` rather than a throw: a GET route may want to know who is asking
 * without refusing an anonymous reader, and the write routes turn `null` into
 * the one 401 shape through `UnauthenticatedError`.
 */
export async function authenticateRequest(
  request: Request,
  contentDirectory: string,
): Promise<string | null> {
  const header = request.headers.get("authorization");
  const match = header ? BEARER.exec(header.trim()) : null;
  if (match) {
    const email = await findUserByToken(contentDirectory, match[1].trim());
    /*
     * A *present but wrong* bearer token still falls through to the session.
     * The alternative — refusing outright — would make a stale token in an
     * agent's environment mask a perfectly good browser session, and the token
     * check has already cost nothing.
     */
    if (email) return email;
  }
  return authenticateUser();
}
