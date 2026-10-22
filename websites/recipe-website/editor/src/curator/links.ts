/**
 * The curator page's small pure helpers (44d): which links stay in the
 * app, and how a tool's input or result reads in its disclosure.
 */

/**
 * Which of the curator's links stay in the app: a site path (`/recipe/x`,
 * not `//host`), or an absolute URL on this page's origin — answered as its
 * path, query and hash. Anything else is `undefined`.
 */
export function sitePath(
  href: string | undefined,
  origin: string | undefined = typeof window === "undefined"
    ? undefined
    : window.location.origin,
): string | undefined {
  if (!href) return undefined;
  const text = href.trim();
  if (text.startsWith("/") && !text.startsWith("//") && !text.includes("\\")) {
    return text;
  }
  if (!origin || !/^https?:\/\//i.test(text)) return undefined;
  try {
    const url = new URL(text);
    return url.origin === origin
      ? `${url.pathname}${url.search}${url.hash}`
      : undefined;
  } catch {
    return undefined;
  }
}

/** The most of an input or a result a disclosure shows. */
export const DETAIL_MAX_CHARS = 6_000;

/**
 * Text for a disclosure: JSON pretty-printed (a result that is JSON is
 * parsed first), anything else as it is — page text included, which React
 * only ever renders as text — cut at `max`.
 */
export function detailText(value: unknown, max = DETAIL_MAX_CHARS): string {
  let text: string;
  if (typeof value === "string") {
    try {
      text = JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      text = value;
    }
  } else {
    text = JSON.stringify(value ?? {}, null, 2) ?? "";
  }
  return text.length > max
    ? `${text.slice(0, max)}\n… (${(text.length - max).toLocaleString("en-US")} more characters)`
    : text;
}
