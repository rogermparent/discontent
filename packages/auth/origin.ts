/**
 * Is this request from a page on the same host? (47e)
 *
 * For API routes that accept the **session cookie**: a write must come from
 * the editor's own pages, not from another site the signed-in owner happens
 * to have open (CSRF). `SameSite=Lax` already keeps the cookie off most
 * cross-site POSTs; this is the explicit check behind it. Bearer tokens are
 * exempt — the caller only asks this when it fell back to the cookie — and
 * Next's server actions have their own Origin check.
 *
 * - Safe methods (GET, HEAD, OPTIONS) always pass.
 * - `Sec-Fetch-Site` decides when the browser sent it: `same-origin` and
 *   `none` (typed, bookmarked) pass; `same-site` and `cross-site` do not —
 *   another port on the same host is another origin.
 * - Otherwise `Origin` decides: its host must be the request's `Host`.
 *   `Origin: null` fails.
 * - Neither header: not a browser (curl, a script), which cannot be tricked
 *   into sending someone's cookie, so it passes.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface OriginCheckInput {
  method: string;
  headers: Pick<Headers, "get">;
}

export function isSameOriginRequest({
  method,
  headers,
}: OriginCheckInput): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = headers.get("origin");
  if (origin === null) return true;
  const host = headers.get("host");
  if (!host || origin === "null") return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
