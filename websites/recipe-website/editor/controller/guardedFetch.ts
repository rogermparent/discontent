/**
 * `fetch`, with the SSRF guard on every hop (46a).
 *
 * `guardedFetch` checks the URL (`urlRefusal`: the scheme, a private or
 * reserved host, and every address its name resolves to), asks with
 * `redirect: "manual"`, and follows a redirect itself — at most
 * `maxRedirects` — checking each target the same way before a byte is sent
 * there. The answer is the last hop's own `Response`, so its `url` is where
 * the request ended up (what `finalUrlOf` and `FetchedPage.finalUrl` read).
 *
 * `importerFetch` is the one the importer uses: `fetchRetrying403` takes a
 * `CheckedFetch`, and this module is the only place one is made
 * (`markCheckedFetch`; `test/urlGuard.test.ts` scans for it), so every page,
 * image, probe, roundup, video-follow, fill and save-time image fetch is
 * guarded, and a new caller cannot type-check without one. The agent's
 * `web_fetch` follows its redirects through `guardedFetch` too, with its own
 * options.
 *
 * Not caught: DNS rebinding between the guard's lookup and `fetch`'s own
 * (Eb4, open — closing it needs a dispatcher with a checked `lookup`, and
 * undici is not a dependency).
 */
import {
  markCheckedFetch,
  type CheckedFetch,
} from "recipe-website-common/util/politeFetch";
import { UrlRefusedError } from "./curation/errors";
import {
  fetchGuardOptions,
  urlRefusal,
  type UrlGuardOptions,
  type UrlRefusal,
} from "./urlGuard";

export const GUARDED_FETCH_MAX_REDIRECTS = 5;

const REDIRECT = new Set([301, 302, 303, 307, 308]);

export interface GuardedFetchOptions extends UrlGuardOptions {
  /** Default `GUARDED_FETCH_MAX_REDIRECTS`. */
  maxRedirects?: number;
  /** Each hop's own clock, from when it is sent (`web_fetch`'s, Eb5). */
  timeoutMs?: number;
  /** Told each URL just before it is asked for: the first, then each hop. */
  onHop?: (url: string) => void;
}

/**
 * A fetch the redirect chain ended without an answer to read: a name that
 * does not resolve, too many redirects, or a `Location` that is no URL.
 * `web_fetch` calls it `fetch_failed`; the importer, a failed fetch.
 */
export class FetchChainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchChainError";
  }
}

const INSIDE = "imports only read public sites";

/** A refusal as a plain sentence for a person (the form, a 422's body). */
export function refusalSentence(refusal: UrlRefusal): string {
  const subject =
    refusal.hop === 0 ? refusal.url : `It redirects to ${refusal.url}, which`;
  switch (refusal.reason) {
    case "scheme":
      return refusal.hop === 0
        ? `Only http and https addresses can be imported, not ${refusal.url}.`
        : `${subject} is not an http or https address; ${INSIDE}.`;
    case "resolves-private":
      return `${subject} points inside your network (${new URL(refusal.url).hostname} resolves to ${refusal.address}); ${INSIDE}.`;
    default:
      return `${subject} points inside your network; ${INSIDE}.`;
  }
}

/** A refusal as the error the importer and the API throw. */
export function refusedError(refusal: UrlRefusal): UrlRefusedError {
  return new UrlRefusedError(
    refusalSentence(refusal),
    refusal.message,
    refusal.code === "usage" ? "usage" : "forbidden",
  );
}

/** The redirected request's method and body, as `fetch` itself would. */
function redirectedInit(init: RequestInit, status: number): RequestInit {
  const method = (init.method ?? "GET").toUpperCase();
  if (
    (status === 303 && method !== "GET" && method !== "HEAD") ||
    ((status === 301 || status === 302) && method === "POST")
  ) {
    const { body: _body, ...rest } = init;
    void _body;
    return { ...rest, method: "GET" };
  }
  return init;
}

/**
 * `fetch(url, init)` with every hop checked (above). Throws
 * `UrlRefusedError` for a refused URL or redirect — nothing is sent there —
 * and `FetchChainError` for a name that does not resolve, a redirect loop
 * or an unreadable `Location`; anything `fetch` throws passes through.
 */
export async function guardedFetch(
  input: string | URL,
  init: RequestInit = {},
  options: GuardedFetchOptions = {},
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? GUARDED_FETCH_MAX_REDIRECTS;
  let current = new URL(input);
  let request = init;
  for (let hop = 0; ; hop += 1) {
    const refusal = await urlRefusal(current, { ...options, hop });
    if (refusal) {
      if (refusal.code === "fetch_failed") {
        throw new FetchChainError(refusal.message);
      }
      throw refusedError(refusal);
    }
    options.onHop?.(current.href);
    const signal =
      options.timeoutMs === undefined
        ? request.signal
        : request.signal
          ? AbortSignal.any([
              request.signal,
              AbortSignal.timeout(options.timeoutMs),
            ])
          : AbortSignal.timeout(options.timeoutMs);
    const response = await fetch(current.href, {
      ...request,
      redirect: "manual",
      ...(signal ? { signal } : {}),
    });
    /* Test stubs (and nothing real) may omit `headers`. */
    const location = response.headers?.get("location");
    if (!REDIRECT.has(response.status) || !location) return response;
    await response.body?.cancel().catch(() => {});
    if (hop >= maxRedirects) {
      throw new FetchChainError(
        `${new URL(input).href} redirected more than ${maxRedirects} times`,
      );
    }
    if (!URL.canParse(location, current)) {
      throw new FetchChainError(
        `${current.href} redirected to an unreadable location`,
      );
    }
    request = redirectedInit(request, response.status);
    current = new URL(location, current);
  }
}

/**
 * The importer's fetch (46a): `guardedFetch` with the editor's guard
 * options — none, outside a test run (`fetchGuardOptions`).
 */
export const importerFetch: CheckedFetch = markCheckedFetch((url, init) =>
  guardedFetch(url, init, fetchGuardOptions()),
);

/**
 * `guardedFetch` with options of the caller's own, as a `CheckedFetch` for
 * `fetchRetrying403` — the agent's `web_fetch` (its `allowHosts`, `lookup`
 * and per-hop timeout).
 */
export function checkedFetch(options: GuardedFetchOptions): CheckedFetch {
  return markCheckedFetch((url, init) => guardedFetch(url, init, options));
}

/**
 * Throws `UrlRefusedError` when the guard refuses `url` itself — the import
 * routes' and yt-dlp's check before any work starts. A name that does not
 * resolve passes: the fetch says so in its own words.
 */
export async function assertFetchableUrl(url: string): Promise<void> {
  if (!URL.canParse(url)) return;
  const refusal = await urlRefusal(new URL(url), fetchGuardOptions());
  if (refusal && refusal.code !== "fetch_failed") throw refusedError(refusal);
}
