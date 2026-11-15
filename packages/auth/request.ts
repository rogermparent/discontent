/**
 * The origin the person is actually using, from the request's own headers
 * (47e).
 *
 * Next 16's `request.url` is built from the address the server is bound to,
 * not from the `Host` header: `http://localhost:3000` on the Pi (`next start`
 * without `-H`), `http://0.0.0.0:3000` on the workstation (`-H 0.0.0.0`). That
 * is what sent a sign-in from `uraninite:3000`, a LAN IP or a Tailscale name
 * to "the set URL" under Auth.js. Better Auth, left without a `baseURL`,
 * derives its origin from the request URL it is handed — so the editor hands
 * it a request whose URL is built from `Host`, and every origin Better Auth
 * computes (its trusted origin, the origin check) is the person's own.
 *
 * `x-forwarded-host` is not read: nothing in front of these editors sets it
 * honestly (Next fills it from `Host` itself), and a client could send any
 * value. `x-forwarded-proto: https` is honoured for the scheme only — Next
 * also fills that one, from the socket, when a TLS proxy has not.
 */
const HOST_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;

export function requestHost(headers: Pick<Headers, "get">): string | null {
  const host = headers.get("host")?.trim();
  if (!host || !HOST_PATTERN.test(host)) return null;
  return host;
}

export function requestOrigin(headers: Pick<Headers, "get">): string | null {
  const host = requestHost(headers);
  if (!host) return null;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return `${proto === "https" ? "https" : "http"}://${host}`;
}

/** The headers Better Auth reads, copied from the person's request. */
const FORWARDED = [
  "cookie",
  "host",
  "origin",
  "referer",
  "user-agent",
  "x-forwarded-for",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
];

/**
 * A `POST <origin><basePath><path>` for `auth.handler`, carrying the
 * person's cookies, Origin and Fetch Metadata so Better Auth's origin check
 * and rate limiter see exactly what the browser sent. `null` without a usable
 * `Host`.
 */
export function authRequest(
  headers: Pick<Headers, "get">,
  path: string,
  body: Record<string, unknown>,
  basePath = "/api/auth",
): Request | null {
  const origin = requestOrigin(headers);
  if (!origin) return null;
  const forwarded = new Headers({ "content-type": "application/json" });
  for (const name of FORWARDED) {
    const value = headers.get(name);
    if (value !== null) forwarded.set(name, value);
  }
  return new Request(`${origin}${basePath}${path}`, {
    method: "POST",
    headers: forwarded,
    body: JSON.stringify(body),
  });
}
