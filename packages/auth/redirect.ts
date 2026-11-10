/**
 * Where to go after signing in or out: a path on *this* host, never a URL.
 *
 * The bug that started 47e was a redirect to an absolute URL built from the
 * server's bind address (`http://localhost:3000/…` on the Pi,
 * `http://0.0.0.0:3000/…` on the workstation) instead of the host the person
 * typed. Keeping every redirect a root-relative path makes that impossible by
 * construction — the browser resolves it against the address bar — and it is
 * also the open-redirect guard: anything that could leave the host
 * (`https://evil.example`, `//evil.example`, `/\evil.example`, a scheme, a
 * control character, a `.` or `..` segment) is refused and replaced by the
 * fallback.
 */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const ENCODED_SEPARATOR = /%2f|%5c/i;
/* `.` or `..` as a whole segment, plain or percent-encoded (`%2e`). */
const DOT_SEGMENT = /(^|\/)(\.|%2e){1,2}(\/|$)/i;
const PARSE_BASE = "http://redirect.invalid";

export function safeRedirectPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  const candidate = value.trim();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    CONTROL.test(candidate)
  ) {
    return fallback;
  }
  const pathEnd = candidate.search(/[?#]/);
  const path = pathEnd === -1 ? candidate : candidate.slice(0, pathEnd);
  if (ENCODED_SEPARATOR.test(path)) return fallback;
  /*
   * Dot segments are refused outright: the URL parser resolves them, and
   * `/.//evil.example` or `/a/..//evil.example` normalise to
   * `//evil.example` — a protocol-relative URL, off this host.
   */
  if (DOT_SEGMENT.test(path)) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(candidate, PARSE_BASE);
  } catch {
    return fallback;
  }
  if (parsed.origin !== PARSE_BASE) return fallback;
  /* And whatever the parser made of it, never a protocol-relative result. */
  if (/^\/[\/\\]/.test(parsed.pathname)) return fallback;
  /* Never back to the sign-in page itself: that is a loop, not a place. */
  if (parsed.pathname === "/login") return fallback;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** `/login?redirectTo=…` for a page that needs the owner. */
export function loginPath(redirectTo?: string): string {
  const target = safeRedirectPath(redirectTo, "");
  return target ? `/login?redirectTo=${encodeURIComponent(target)}` : "/login";
}
