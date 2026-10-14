/**
 * The importer's polite fetch: browser headers for a 403 retry, and the retry
 * itself (epic 31, D3). Split out of `importRecipeData.ts` at 35q so the image
 * download (`editor/controller/imageImport.ts`) — and through it every CLI and
 * MCP command that loads the curation layer — no longer pulls in the HTML and
 * markdown parsers (`hast-util-*`, `mdast-util-*`) at startup, ~0.45 s of it.
 * `importRecipeData.ts` re-exports all of it, so its importers are unchanged.
 */

/**
 * The headers a recipe page is re-requested with after a 403: a desktop
 * browser's.
 *
 * Some recipe sites answer Node's default `fetch` with a 403 and serve the
 * same page to a browser — Imbibe is the one the 25e source probe found
 * (`docs/agent-mixology.md`). Asking as a browser gets the page and its
 * JSON-LD; it does **not** get past a real bot wall: the Dotdash Meredith
 * sites (liquor.com, Allrecipes, Serious Eats, …) still answer 403.
 *
 * Image downloads follow the same plain-then-browser order since 26a
 * (`editor/controller/imageImport.ts`).
 */
export const RECIPE_FETCH_HEADERS: Readonly<Record<string, string>> = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

/**
 * How the importer retries a 403 with browser headers (epic 31, D3).
 *
 * A retry is a second request to a host that has just refused one, so off the
 * browser form it waits first: Roger's scraping rule (30-D5) wants requests to
 * one host at least 15 s apart. The browser `/new-recipe` form passes
 * `delayMs: 0`, because a person is waiting on it.
 */
export interface ForbiddenRetry {
  /** Wait this long before the retry. */
  delayMs?: number;
  /** `false`: never retry; the 403 is the answer. */
  enabled?: boolean;
  /**
   * Awaited before the retry *instead of* `delayMs`: the caller paces the
   * retry itself. Roundup import (34f) waits on its per-site clock here, so
   * the retry is spaced like every other request of the call and counted.
   */
  beforeRetry?: () => Promise<void>;
  /** Called with the retry's response — how a pacer tells a second 403. */
  afterRetry?: (response: Response) => void;
}

export const DEFAULT_403_DELAY_MS = 15_000;

/**
 * `RECIPE_FETCH_403_DELAY_MS`: unset means 15000, a number of milliseconds
 * (`0` = retry at once), `off` = never retry. Anything else is the default.
 */
export function forbiddenRetryFromEnv(
  value: string | undefined = typeof process === "undefined"
    ? undefined
    : process.env.RECIPE_FETCH_403_DELAY_MS,
): Required<Omit<ForbiddenRetry, "beforeRetry" | "afterRetry">> {
  const text = value?.trim().toLowerCase();
  if (text === "off") return { delayMs: 0, enabled: false };
  const delay = text ? Number(text) : NaN;
  return {
    delayMs:
      Number.isFinite(delay) && delay >= 0 ? delay : DEFAULT_403_DELAY_MS,
    enabled: true,
  };
}

/**
 * `fetch(url, init)`, and on a 403 one more try with `retryHeaders` — after
 * the delay, unless retrying is off. Explicit `retry` fields beat the
 * environment's. The page fetch and the image download share it.
 */
export async function fetchRetrying403(
  url: string,
  init: RequestInit,
  retryHeaders: Record<string, string>,
  retry: ForbiddenRetry = {},
): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status !== 403) return response;
  const env = forbiddenRetryFromEnv();
  const enabled = retry.enabled ?? env.enabled;
  if (!enabled) return response;
  const delayMs = retry.delayMs ?? env.delayMs;
  /* Let the refused connection go before waiting on the next one. */
  await response.body?.cancel().catch(() => {});
  if (retry.beforeRetry) {
    await retry.beforeRetry();
  } else if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  const retried = await fetch(url, { ...init, headers: retryHeaders });
  retry.afterRetry?.(retried);
  return retried;
}
