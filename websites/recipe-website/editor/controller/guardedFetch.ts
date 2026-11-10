/**
 * `fetch`, with the SSRF guard on every hop (46a).
 *
 * `guardedFetch` checks the URL (`checkUrl`, `urlRefusal`'s own: the
 * scheme, a private or reserved host, and every address its name resolves
 * to), asks with
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
 * **Each hop connects to the addresses its check vetted (47a).** The
 * guard's one lookup per hop (`checkUrl`) hands back the answers it
 * checked, and the request goes through a dispatcher of that hop's own
 * (`pinnedDispatcher.ts`) whose `connect.lookup` answers those and never
 * asks DNS again — so a name that answers public to the check and private
 * to the connect (DNS rebinding, Eb4 / Da3) still reaches only the public
 * address.
 *
 * **Since 47b the loop lives in `@discontent/url-guard`** (`guardedFetch.ts`
 * there: the per-hop check, manual redirects, the pinned connect), which
 * the portfolio editor uses too. This module wraps it with what is the
 * recipe editor's own: a refusal as the curation layer's `UrlRefusedError`,
 * the test allowance (`fetchGuardOptions`) and the `CheckedFetch` brand.
 */
import {
  FetchChainError,
  GUARDED_FETCH_MAX_REDIRECTS,
  guardedFetch as sharedGuardedFetch,
  refusalSentence,
  type GuardedFetchOptions as SharedGuardedFetchOptions,
} from "@discontent/url-guard/guardedFetch";
import {
  markCheckedFetch,
  type CheckedFetch,
} from "recipe-website-common/util/politeFetch";
import { UrlRefusedError } from "./curation/errors";
import { fetchGuardOptions, urlRefusal, type UrlRefusal } from "./urlGuard";

export { FetchChainError, GUARDED_FETCH_MAX_REDIRECTS, refusalSentence };

/** The shared guard's options; a refusal is always `UrlRefusedError` here. */
export type GuardedFetchOptions = Omit<SharedGuardedFetchOptions, "refused">;

/** A refusal as the error the importer and the API throw. */
export function refusedError(refusal: UrlRefusal): UrlRefusedError {
  return new UrlRefusedError(
    refusalSentence(refusal),
    refusal.message,
    refusal.code === "usage" ? "usage" : "forbidden",
  );
}

/**
 * `fetch(url, init)` with every hop checked (above). Throws
 * `UrlRefusedError` for a refused URL or redirect — nothing is sent there —
 * and `FetchChainError` for a name that does not resolve, a redirect loop
 * or an unreadable `Location`; anything `fetch` throws passes through.
 */
export function guardedFetch(
  input: string | URL,
  init: RequestInit = {},
  options: GuardedFetchOptions = {},
): Promise<Response> {
  return sharedGuardedFetch(input, init, {
    ...options,
    refused: refusedError,
  });
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
