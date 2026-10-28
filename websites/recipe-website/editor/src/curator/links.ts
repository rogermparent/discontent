/**
 * The curator page's small pure helpers (44d): which links stay in the
 * app, and how a tool's input or result reads in its disclosure.
 */
import type { AgentMessage } from "recipe-editor/controller/agent/types";

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
const SITE_PAGE = /^\/(recipe|tags|group)\/([^/]+)\/?$/;

/**
 * What a conversation tells a link of: the hosts it has seen (`hostsOf`
 * over `conversationUrls`), and the slugs of this site its own tools
 * answered with (`siteSlugsOf`).
 */
export interface LinkKnown {
  hosts: ReadonlySet<string>;
  slugs: ReadonlySet<string>;
}

export const NOTHING_KNOWN: LinkKnown = {
  hosts: new Set(),
  slugs: new Set(),
};

/**
 * 46d: a model sometimes writes this site's page on a host it made up —
 * `https://roger.recipe/recipe/<slug>`, `https://your-site.com/…` (44e). Such
 * a link is answered as its in-app path, to be marked "link fixed", only
 * when all of these hold: it is http(s); its host is not this page's and
 * not one the conversation saw (`known.hosts`: what the person, a tool or a
 * search gave); its path is `/recipe/<slug>`, `/tags/<slug>` or
 * `/group/<slug>`; and that slug is one this site's tools answered with
 * this conversation (`known.slugs`) — a recipe, term or plan of this site.
 * A real site's `/recipe/<slug>` (`bonappetit.com/recipe/x`) stays as it
 * is. Anything else is `undefined`.
 */
export function fixedSitePath(
  href: string | undefined,
  known: LinkKnown,
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
  if (known.hosts.has(url.hostname.toLowerCase())) return undefined;
  const page = SITE_PAGE.exec(url.pathname);
  if (!page) return undefined;
  let slug: string;
  try {
    slug = decodeURIComponent(page[2]);
  } catch {
    return undefined;
  }
  if (!known.slugs.has(slug)) return undefined;
  return `${url.pathname}${url.hash}`;
}

const SLUG_FIELD = /"slug"\s*:\s*"([^"\\]+)"/g;

/**
 * The slugs of this site the conversation's own tools answered with (46d):
 * every `"slug": "…"` in a tool's result (a recipe row, a term, a plan, an
 * import's new recipe — read as text, so a result cut for the context still
 * counts), and the recipes, terms and plans a write's summary names. A
 * result wrapped as a web page's text (E7) is a page's words, not this
 * site's, and is skipped.
 */
export function siteSlugsOf(messages: readonly AgentMessage[]): Set<string> {
  const slugs = new Set<string>();
  for (const message of messages) {
    if (message.role !== "tool" || message.isError) continue;
    if (!message.content.trimStart().startsWith("<untrusted")) {
      for (const match of message.content.matchAll(SLUG_FIELD)) {
        slugs.add(match[1]);
      }
    }
    const summary = message.summary;
    if (summary) {
      for (const recipe of summary.recipes ?? []) slugs.add(recipe.slug);
      for (const slug of summary.terms ?? []) slugs.add(slug);
      for (const slug of summary.groups ?? []) slugs.add(slug);
    }
  }
  return slugs;
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
