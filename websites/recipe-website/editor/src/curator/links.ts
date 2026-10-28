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

/** A page of this site a model may link: a recipe, a term, a plan. */
const SITE_PAGE = /^\/(recipe|tags|group)\/[^/]+\/?$/;

/**
 * 46d: a model sometimes writes this site's page on a host it made up —
 * `https://roger.recipe/recipe/<slug>`, `https://your-site.com/…` (44e). Such
 * a link — http(s), a host that is not this page's and that the
 * conversation never saw (`knownHosts`: what the person, a tool or a search
 * gave), a path that is `/recipe/<slug>`, `/tags/<slug>` or `/group/<slug>`
 * — is answered as its in-app path, to be marked "link fixed". A real
 * site's `/recipe/<slug>` that a search or a fetch found stays as it is.
 * Anything else is `undefined`.
 */
export function fixedSitePath(
  href: string | undefined,
  knownHosts: ReadonlySet<string>,
  origin: string | undefined = typeof window === "undefined"
    ? undefined
    : window.location.origin,
): string | undefined {
  if (!href || !/^https?:\/\//i.test(href.trim())) return undefined;
  let url: URL;
  try {
    url = new URL(href.trim());
  } catch {
    return undefined;
  }
  if (origin && url.origin === origin) return undefined;
  if (knownHosts.has(url.hostname.toLowerCase())) return undefined;
  if (!SITE_PAGE.test(url.pathname)) return undefined;
  return `${url.pathname}${url.hash}`;
}

/** The hosts of a list of URLs, lowercased (what `fixedSitePath` leaves alone). */
export function hostsOf(urls: readonly string[]): Set<string> {
  const hosts = new Set<string>();
  for (const url of urls) {
    try {
      hosts.add(new URL(url).hostname.toLowerCase());
    } catch {
      /* Not a URL a link could be compared with. */
    }
  }
  return hosts;
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
