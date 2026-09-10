/**
 * Recorded, not merely stubbed, since D9.
 *
 * The split of `handleContentSuccess` is only worth anything if
 * `revalidateContentWrite` provably does *not* redirect — a `NEXT_REDIRECT`
 * throw escaping an API route is a 500 — and the real `redirect` announces
 * itself by throwing, which this stub cannot do without breaking every form
 * test. So it records instead.
 */
export const redirects = [];

export function redirect(target) {
  redirects.push(target);
  return null;
}

export function resetRedirects() {
  redirects.length = 0;
}

/*
 * `notFound()` throws in Next so that everything after it is unreachable; a
 * stub that returned would let a route body run on past the guard and fail
 * somewhere less obvious. The error carries Next's own digest so a test can
 * assert "this route 404s" without depending on the message.
 */
export function notFound() {
  const error = new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  error.digest = "NEXT_HTTP_ERROR_FALLBACK;404";
  throw error;
}
