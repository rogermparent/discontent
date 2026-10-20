/**
 * Ask's URL vocabulary (43q), on its own so the browser's half (the
 * palette's handler, `/search`'s Ask, the "Filled in from" line) imports
 * these few strings without the grounding code behind them.
 */

import {
  MAKE_ASK_PARAM,
  MAKE_SCOPE_PARAM,
} from "recipe-website-common/components/MakePage/kinds";

/** The `?ask=` parameter every Ask URL carries: the question, as asked. */
export const ASK_PARAM = MAKE_ASK_PARAM;

/**
 * `/make`'s temporary scope (43q): one pattern item per `?with=`, read by
 * the editor's `/make` only and never written to any list.
 */
export const ASK_SCOPE_PARAM = MAKE_SCOPE_PARAM;

/** Featured ingredients, and pattern items, an answer may carry at most. */
export const ASK_MAX_ITEMS = 4;

/** The plain fallback's line (the brief's words). */
export const ASK_FALLBACK_LABEL =
  "Couldn't work that out — searching for the words instead";

/** A question as Ask keeps it: one line, single spaces. */
export function askWords(question: string): string {
  return question.replace(/\s+/g, " ").trim();
}

/** `path` with `params`, in order (a key may repeat). */
export function askHref(path: string, params: Array<[string, string]>): string {
  const search = new URLSearchParams(params).toString();
  return search ? `${path}?${search}` : path;
}

/** The fallback's URL: a search for the question's own words. */
export function fallbackUrl(question: string): string {
  const words = askWords(question);
  return askHref("/search", [
    ["q", words],
    [ASK_PARAM, words],
  ]);
}

/**
 * A URL Ask may open: site-relative, one leading slash — never another
 * origin, whatever a response said. A tab or a line break is refused
 * outright: the URL parser drops them, so `"/\t/evil.example"` would be
 * `//evil.example`, another host. The browser checks the origin again
 * before it navigates (`sameOriginPath`).
 */
export function isSiteUrl(url: unknown): url is string {
  return (
    typeof url === "string" && !/[\t\n\r]/.test(url) && /^\/(?![/\\])/.test(url)
  );
}

/**
 * `url` resolved against `origin`, when it stays there: its path, query and
 * hash; `undefined` for anything that would leave (43q, the browser's check).
 */
export function sameOriginPath(
  url: unknown,
  origin: string,
): string | undefined {
  if (!isSiteUrl(url)) return undefined;
  try {
    const target = new URL(url, origin);
    if (target.origin !== new URL(origin).origin) return undefined;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return undefined;
  }
}
