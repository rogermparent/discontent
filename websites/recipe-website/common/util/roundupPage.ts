/**
 * Read a roundup ("meta-list") page: which recipes it lists (epic 34, D11).
 *
 * A roundup — "40+ Thanksgiving Pie Recipes", "Top Christmas Cookies" — is an
 * article whose body is a list of links to recipe pages. This module turns its
 * HTML into `{title, items: [{url, name, image?}]}` and fetches nothing; the
 * curation layer's `inspectList` / `importList` (`editor/controller/curation/
 * importList.ts`) fetch, mark what the corpus already has and import.
 *
 * Two sources, in order:
 *
 * 1. **schema.org `ItemList` JSON-LD** — what WP Recipe Maker and Tasty
 *    Roundups emit for a roundup, in a Yoast `@graph` or on its own. Its order
 *    is the list's order. It often carries only URLs (Sally's does), so names
 *    and pictures still come from the body.
 * 2. **Recipe links in the article body**, when there is no ItemList: links in
 *    the article's content (`.entry-content`, else `<article>`, `<main>`,
 *    `<body>`), with navigation, category/tag/author, comment, share,
 *    pagination, print and affiliate links dropped and every URL deduped by
 *    its canonical form. When at least three of them look like list entries —
 *    a picture inside the link, or a heading of their own — only those are
 *    kept: a roundup presents its items, and the inline "my favourite pie
 *    crust" links in its prose are not items. Same-site links come first.
 *
 * Pure, Node-safe and fixture-tested (`test/roundupPage.test.ts`): the hast
 * parser `pageMetadata.ts` uses, and no I/O.
 */
import { fromHtml } from "hast-util-from-html";
import type { Element, Root } from "hast";
import { getDomain } from "tldts";
import { parseJsonLd } from "./pageMetadata";
import { isPrivateHost } from "./privateHost";
import { youTubeSourceKey } from "./videoUrl";
import {
  articleRoot,
  attr,
  classes,
  elements,
  textOf,
  walk,
  type Parent,
} from "./hastQuery";

export interface RoundupLink {
  /** The canonical URL: no query, no fragment, no `comment-page-N`. */
  url: string;
  name: string;
  image?: string;
}

/** Where `items` came from. */
export type RoundupSource = "itemlist" | "links";

export interface ParsedRoundup {
  /** The roundup's own title: its `<h1>`, else `og:title`, else `<title>`. */
  title?: string;
  canonical?: string;
  source?: RoundupSource;
  items: RoundupLink[];
  /** Why `items` is empty, when it is. */
  reason?: string;
  /** The page has a schema.org Recipe node of its own. */
  hasRecipe: boolean;
}

/** Fewer body links than this is not a list. */
export const MIN_LINK_ITEMS = 3;

/* ------------------------------------------------------------------ */
/* URLs                                                                */
/* ------------------------------------------------------------------ */

const COMMENT_PAGE = /\/comment-page-\d+(?=\/|$)/i;

/**
 * The URL a list item is known by: absolute http(s), no query string, no
 * fragment and no `comment-page-N` segment. `undefined` for anything else
 * (`mailto:`, `javascript:`, a bare `#…`).
 */
export function canonicalItemUrl(
  raw: string | undefined,
  base: string,
): string | undefined {
  if (!raw) return;
  let url: URL;
  try {
    url = new URL(raw.trim(), base);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(COMMENT_PAGE, "") || "/";
  return url.href;
}

/**
 * Two URLs name the same page when their keys match: the host without `www.`,
 * the path without a trailing slash, the scheme, query and fragment ignored.
 * How `existing` matches a list item to a recipe's `source.url`.
 *
 * A YouTube video is the exception (46b): its id is in the query
 * (`watch?v=…`) or the path (`youtu.be/…`, `shorts/…`), so every spelling
 * keys as `youtube.com/watch/<id>` — dropping the query had keyed every
 * `watch?v=` link as `youtube.com/watch`, one duplicate of all the others.
 */
export function sourceUrlKey(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  const video = youTubeSourceKey(url.href);
  if (video) return video;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.replace(COMMENT_PAGE, "").replace(/\/+$/, "");
  return `${host}${path}`;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Registrable domains that are shared hosting: each subdomain is someone
 * else's site (a Jetpack image CDN host, a wordpress.com blog), and the
 * public-suffix list does not say so. `paceKey` keys such a host by itself.
 */
const SHARED_HOSTS = new Set(["wp.com", "wordpress.com"]);

/**
 * `url`'s host, lowercased and without a trailing dot — or, when it is not
 * a name a public-suffix list can read (an IP address, a single label like
 * `localhost`), the host *with its port*, which keeps two local fixture
 * servers apart. `undefined` for something that is not a URL.
 */
function hostOf(
  raw: string,
): { name: string } | { literal: string } | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    IPV4.test(host) ||
    host.includes(":") ||
    host.startsWith("[") ||
    !host.includes(".")
  ) {
    return { literal: url.host.toLowerCase() };
  }
  return { name: host };
}

/**
 * The site a host belongs to, for the page parsers (share targets, a
 * roundup's same-site-first order): its registrable domain by the
 * public-suffix list's ICANN section (`tldts`, 39e De1), so
 * `cdn.example.com` and `www.example.com` are one site and
 * `bbcgoodfood.co.uk` is not `co.uk`. A CDN on a shared suffix
 * (`*.cloudfront.net`) is still one site here — which only the pacer must
 * not do (`paceKey`). An IP address or a single-label host (`localhost`) is
 * its own site, port included.
 */
export function siteKey(raw: string): string | undefined {
  const host = hostOf(raw);
  if (!host) return;
  if ("literal" in host) return host.literal;
  return getDomain(host.name, { extractHostname: false }) ?? host.name;
}

/**
 * The site a request is paced and dropped under (30-D5; 38-Db6; 39e De1):
 * its **registrable domain**, by the whole public-suffix list (`tldts`,
 * private section included) — so `a.example.co.uk` ≡ `b.example.co.uk` ≡
 * `example.co.uk`, and `www.x.com` ≡ `cdn.x.com` ≡ `x.com`, but
 * `example.co.uk` ≢ `other.co.uk`, and `d1.cloudfront.net`,
 * `me.github.io` or `me.blogspot.com` are each their own. A host on a
 * shared host the list doesn't know (`SHARED_HOSTS`: `i0.wp.com`, a
 * wordpress.com blog) is keyed by the host itself, less a leading `www.`,
 * as is a host that is itself a public suffix. An IP address or a
 * single-label host keeps its port.
 *
 * Why it matters (38b): a drop is the machine's and outlives the process,
 * so a key that reaches too far (every `.co.uk` site, every Jetpack image)
 * stops sites that never refused anything; one that reaches too little
 * paces one site's hosts apart.
 */
export function paceKey(raw: string): string | undefined {
  const host = hostOf(raw);
  if (!host) return;
  if ("literal" in host) return host.literal;
  const domain = getDomain(host.name, {
    allowPrivateDomains: true,
    extractHostname: false,
  });
  if (domain && !SHARED_HOSTS.has(domain)) return domain;
  return host.name.replace(/^www\.(?=[^.]+\.)/, "");
}

/** Path segments that name an archive, an account page or a utility, not a recipe. */
const SKIP_SEGMENTS = new Set([
  "about",
  "about-us",
  "accessibility",
  "accessibility-statement",
  "account",
  "author",
  "authors",
  "cart",
  "categories",
  "category",
  "checkout",
  "comments",
  "contact",
  "contact-us",
  "disclosure",
  "disclosure-policy",
  "feed",
  "ingredient-index",
  "login",
  "my-account",
  "newsletter",
  "page",
  "print",
  "privacy",
  "privacy-policy",
  "recipe-index",
  "search",
  "shop",
  "subscribe",
  "tag",
  "tags",
  "terms",
  "wp-admin",
  "wp-content",
  "wp-json",
  "wp-login.php",
  "wprm_print",
]);

const FILE_EXTENSION = /\.(jpe?g|png|gif|webp|avif|svg|pdf|mp4|zip)$/i;

/** Share targets, social sites and affiliate redirectors, by `siteKey`. */
const SKIP_SITES = new Set([
  "a.co",
  "akismet.com",
  "amzn.com",
  "amzn.to",
  "anrdoezrs.net",
  "awin1.com",
  "bit.ly",
  "ck.page",
  "dpbolvw.net",
  "facebook.com",
  "flipboard.com",
  "google.com",
  "gravatar.com",
  "instagram.com",
  "jdoqocy.com",
  "kqzyfj.com",
  "liketk.it",
  "linkedin.com",
  "linksynergy.com",
  "pin.it",
  "pinterest.com",
  "reddit.com",
  "rstyle.me",
  "shareasale.com",
  "shopstyle.com",
  "skimresources.com",
  "t.co",
  "threads.net",
  "tiktok.com",
  "tkqlhce.com",
  "twitter.com",
  "whatsapp.com",
  "wordpress.org",
  "x.com",
  "youtu.be",
  "youtube.com",
  "yummly.com",
]);

/* `isPrivateHost` lives in `privateHost.ts` since 46a, so the SSRF guard
 * can load it without the page parsers; it is re-exported here. */
export { isPrivateHost };

interface SkipContext {
  /** The page's own keys (its URL, its canonical): self-links. */
  pageKeys: Set<string>;
  /** Private links are kept: a test's fixture page (46a; see below). */
  allowPrivate: boolean;
}

/** `true` when `url` is certainly not a recipe: the page itself, a share target, an archive. */
function skipUrl(url: string, context: SkipContext): boolean {
  const parsed = new URL(url);
  const key = sourceUrlKey(url);
  if (!key || context.pageKeys.has(key)) return true;
  if (!context.allowPrivate && isPrivateHost(url)) return true;
  const site = siteKey(url) ?? "";
  if (SKIP_SITES.has(site) || /(^|\.)amazon\.[a-z.]+$/.test(parsed.hostname)) {
    return true;
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return true;
  if (FILE_EXTENSION.test(parsed.pathname)) return true;
  return segments.some((segment) => SKIP_SEGMENTS.has(segment.toLowerCase()));
}

/* ------------------------------------------------------------------ */
/* hast helpers (the shared ones are in `hastQuery.ts`)                */
/* ------------------------------------------------------------------ */

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed || undefined;
}

const HEADING = /^h[1-6]$/;
const CARD_HEADING = /^h[2-5]$/;

/* ------------------------------------------------------------------ */
/* The article body                                                    */
/* ------------------------------------------------------------------ */

/**
 * Regions whose links are never list items, by class or id: comments, share
 * bars, related posts, breadcrumbs, menus, sidebars, pagination, the
 * affiliate disclosure, and an embedded recipe card's own links (its
 * equipment and ingredient shopping links).
 */
const EXCLUDED_REGION =
  /\b(comments?|comment-list|respond|share|sharing|social|related|breadcrumbs?|navigation|nav|menu|sidebar|widget|pagination|pager|byline|jump|subscribe|newsletter|disclosure|tasty-recipes|wprm-recipe-container|post-meta)\b/i;

const EXCLUDED_TAGS = new Set([
  "nav",
  "aside",
  "form",
  "button",
  "script",
  "style",
  "noscript",
  "template",
]);

/* ------------------------------------------------------------------ */
/* Names and pictures                                                  */
/* ------------------------------------------------------------------ */

/** "View the recipe", "Get it here" — link text that names nothing. */
const GENERIC_TEXT =
  /^(get|view|see|read|grab|find|click|print|jump|go|try|make|check)\b|^(here|this|link|recipe|the recipe|full recipe|this recipe|more|continue|continue reading)$/i;

/** `1. Pecan Pie`, `#2 – Apple Pie`, `3) Tart` → the name alone. */
function cleanName(value: string | undefined): string | undefined {
  const text = clean(value)
    ?.replace(/^#?\d{1,3}\s*[.):\-–—]\s*/, "")
    .replace(/^#\d{1,3}\s+/, "");
  if (!text || text.length < 2) return;
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

/** `the-great-pumpkin-pie-recipe` → `The Great Pumpkin Pie Recipe`. */
export function nameFromUrl(url: string): string {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  const last = decodeURIComponent(segments.at(-1) ?? "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!last) return new URL(url).hostname;
  return last.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

/** The largest `w` candidate in a `srcset`. */
function largestFromSrcset(srcset: string): string | undefined {
  let best: { url: string; width: number } | undefined;
  for (const part of srcset.split(",")) {
    const [url, descriptor] = part.trim().split(/\s+/);
    const width = descriptor?.endsWith("w") ? parseInt(descriptor, 10) : 0;
    if (url && (!best || width > best.width)) best = { url, width };
  }
  return best?.url;
}

/** An `<img>`'s real picture: lazy-loading attributes first, never a `data:` placeholder. */
function imageUrl(img: Element, base: string): string | undefined {
  const srcset = attr(img, "dataLazySrcset") ?? attr(img, "dataSrcset");
  const candidates = [
    attr(img, "dataLazySrc"),
    attr(img, "dataSrc"),
    srcset ? largestFromSrcset(srcset) : undefined,
    attr(img, "src"),
    attr(img, "srcSet") ? largestFromSrcset(attr(img, "srcSet")!) : undefined,
  ];
  for (const candidate of candidates) {
    if (!candidate || candidate.startsWith("data:")) continue;
    try {
      const url = new URL(candidate, base);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.href;
      }
    } catch {
      /* not a URL */
    }
  }
  return;
}

/** What the body says about one URL, gathered across every link to it. */
interface Evidence {
  url: string;
  /** First appearance in document order. */
  order: number;
  linkInHeading?: string;
  cardHeading?: string;
  precedingHeading?: string;
  texts: string[];
  image?: string;
  /** A picture inside a link to it, or a heading of its own: a list entry. */
  strong: boolean;
  /**
   * When it first looked like a list entry. A roundup's intro often names a
   * few of its recipes in prose before the list starts; the list's order is
   * the entries', not the first mentions'.
   */
  strongAt?: number;
}

/**
 * Every candidate link in `root`, grouped by canonical URL.
 *
 * A **card** is the nearest ancestor of a link that holds exactly one heading
 * (h2–h5): a Tasty Roundups or WPRM roundup item, or a theme's post card. Its
 * heading names the card's *primary* URL — the one its heading links to, or
 * else the one its picture links to, or else its only URL — and nothing else
 * in it; Sally's cards also link her cookbook, which must not take the card's
 * name. A link with no card takes the nearest heading before it in document
 * order, if no other URL has claimed that heading first.
 */
function gatherEvidence(
  root: Element | Root,
  base: string,
  context: SkipContext,
): Map<string, Evidence> {
  const evidence = new Map<string, Evidence>();
  const parents = new Map<Element, Parent>();
  const cardCache = new Map<Element, { heading?: string; primary?: string }>();
  let lastHeading: { element: Element; claimedBy?: string } | undefined;
  let order = 0;
  let strongOrder = 0;

  const hrefOf = (anchor: Element) =>
    canonicalItemUrl(attr(anchor, "href"), base);

  const isCandidate = (url: string | undefined): url is string =>
    url !== undefined && !skipUrl(url, context);
  /* Two spellings of one page (`www.`, a trailing slash) are one item. */
  const keyOf = (url: string) => sourceUrlKey(url) ?? url;

  /* The card around `anchor` and its primary URL, or `undefined`. */
  const cardOf = (anchor: Element) => {
    let node: Parent | undefined = parents.get(anchor);
    while (node && node !== root && node.type === "element") {
      const cached = cardCache.get(node);
      if (cached) return cached;
      const headings = elements(node, (element) =>
        CARD_HEADING.test(element.tagName),
      );
      if (headings.length > 1) return;
      if (headings.length === 1) {
        const card = describeCard(node, headings[0]);
        cardCache.set(node, card);
        return card;
      }
      node = parents.get(node);
    }
    return;
  };

  const describeCard = (card: Element, heading: Element) => {
    const anchors = elements(card, (element) => element.tagName === "a");
    const urls = anchors.map(hrefOf).filter(isCandidate);
    const distinct = [...new Set(urls)];
    const headingLink = elements(heading, (element) => element.tagName === "a")
      .map(hrefOf)
      .find(isCandidate);
    const pictureLink = anchors
      .filter((anchor) =>
        elements(anchor, (element) => element.tagName === "img").some((img) =>
          imageUrl(img, base),
        ),
      )
      .map(hrefOf)
      .find(isCandidate);
    const primary =
      headingLink ??
      pictureLink ??
      (distinct.length === 1 ? distinct[0] : undefined);
    return { heading: cleanName(textOf(heading)), primary };
  };

  walk(root, (element, parent) => {
    parents.set(element, parent);
    if (EXCLUDED_TAGS.has(element.tagName)) return "skip";
    if (
      (element.tagName === "header" || element.tagName === "footer") &&
      (parent === root ||
        (parent.type === "element" && parent.tagName === "body"))
    ) {
      return "skip";
    }
    if (EXCLUDED_REGION.test(classes(element))) return "skip";

    if (HEADING.test(element.tagName)) {
      lastHeading = { element };
      return;
    }
    if (element.tagName !== "a") return;

    const url = hrefOf(element);
    if (!isCandidate(url)) return "skip";
    if (/\bsponsored\b/i.test(attr(element, "rel") ?? "")) return "skip";

    /* The anchor's subtree is read here, so the walk need not descend. */
    const key = keyOf(url);
    const entry: Evidence = evidence.get(key) ?? {
      url,
      order: order++,
      texts: [],
      strong: false,
    };
    evidence.set(key, entry);

    const text = cleanName(textOf(element));
    if (text) entry.texts.push(text);
    const markStrong = () => {
      entry.strong = true;
      entry.strongAt ??= strongOrder++;
    };

    /* `<h3><a>Name</a></h3>`, or a card theme's `<a><h3>Name</h3></a>`. */
    let ancestor: Parent | undefined = parent;
    while (ancestor && ancestor !== root && ancestor.type === "element") {
      if (HEADING.test(ancestor.tagName)) {
        entry.linkInHeading ??= text;
        markStrong();
        break;
      }
      ancestor = parents.get(ancestor);
    }
    const [inner] = elements(element, (child) => HEADING.test(child.tagName));
    if (inner) {
      entry.linkInHeading ??= cleanName(textOf(inner));
      markStrong();
    }

    const picture = elements(element, (child) => child.tagName === "img")
      .map((img) => imageUrl(img, base))
      .find(Boolean);
    if (picture) {
      entry.image ??= picture;
      markStrong();
    }

    const card = cardOf(element);
    if (card?.primary && keyOf(card.primary) === key && card.heading) {
      entry.cardHeading ??= card.heading;
      markStrong();
    }

    if (
      lastHeading &&
      (!lastHeading.claimedBy || lastHeading.claimedBy === key)
    ) {
      lastHeading.claimedBy = key;
      entry.precedingHeading ??= cleanName(textOf(lastHeading.element));
    }
    return "skip";
  });

  /* A card's picture names its primary URL even when the link holding it is
   * a different element from the heading's. */
  for (const [card, { primary }] of cardCache) {
    if (!primary) continue;
    const entry = evidence.get(keyOf(primary));
    if (!entry || entry.image) continue;
    entry.image = elements(card, (element) => element.tagName === "img")
      .map((img) => imageUrl(img, base))
      .find(Boolean);
  }

  return evidence;
}

/**
 * A heading beats link text, and link text beats the URL. A list entry's
 * own heading (`1. Gingerbread Cookies` above its picture) beats what the
 * intro called it in passing; a prose link's text beats a section heading
 * that happens to precede it.
 */
function nameFor(entry: Evidence | undefined, url: string): string {
  if (!entry) return nameFromUrl(url);
  const text = entry.texts.find((value) => !GENERIC_TEXT.test(value));
  return (
    entry.linkInHeading ??
    entry.cardHeading ??
    (entry.strong ? entry.precedingHeading : undefined) ??
    text ??
    entry.precedingHeading ??
    nameFromUrl(url)
  );
}

/* ------------------------------------------------------------------ */
/* JSON-LD                                                             */
/* ------------------------------------------------------------------ */

type JsonNode = Record<string, unknown>;

function hasType(node: JsonNode, type: string): boolean {
  const value = node["@type"];
  return Array.isArray(value) ? value.includes(type) : value === type;
}

/** Every node of the page's JSON-LD, depth first, through `@graph` and arrays. */
function jsonLdNodes(tree: Root): JsonNode[] {
  const nodes: JsonNode[] = [];
  const collect = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as JsonNode;
    nodes.push(node);
    /* A Recipe's children are its fields; an ItemList's are its entries. */
    if (hasType(node, "Recipe") || hasType(node, "ItemList")) return;
    Object.values(node).forEach(collect);
  };
  walk(tree, (element) => {
    if (element.tagName !== "script") return;
    if (!(attr(element, "type") ?? "").toLowerCase().includes("ld+json")) {
      return "skip";
    }
    collect(parseJsonLd(textOf(element)));
    return "skip";
  });
  return nodes;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry);
      if (found) return found;
    }
    return;
  }
  if (value && typeof value === "object") {
    const node = value as JsonNode;
    return firstString(node.url ?? node.contentUrl ?? node["@id"]);
  }
  return;
}

interface ListEntry {
  url: string;
  name?: string;
  image?: string;
}

/** An `ItemList`'s entries in `position` order: `url`, or `item` as a string or a node. */
function itemListEntries(list: JsonNode, base: string): ListEntry[] {
  const raw = list.itemListElement;
  const elementsList = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const entries = elementsList
    .map((value, index) => {
      if (typeof value === "string") {
        return { index, position: index, url: value } as const;
      }
      if (!value || typeof value !== "object") return;
      const element = value as JsonNode;
      const item =
        element.item && typeof element.item === "object"
          ? (element.item as JsonNode)
          : undefined;
      const url =
        firstString(element.url) ??
        (typeof element.item === "string" ? element.item : undefined) ??
        firstString(item?.url ?? item?.["@id"]);
      const position = Number(element.position);
      return {
        index,
        position: Number.isFinite(position) ? position : index,
        url,
        name:
          typeof element.name === "string"
            ? element.name
            : typeof item?.name === "string"
              ? item.name
              : undefined,
        image: firstString(element.image ?? item?.image),
      };
    })
    .filter((entry) => entry !== undefined)
    .sort((a, b) => a.position - b.position || a.index - b.index);

  const out: ListEntry[] = [];
  for (const entry of entries) {
    const url = canonicalItemUrl(entry.url, base);
    if (!url) continue;
    out.push({
      url,
      ...("name" in entry && entry.name ? { name: entry.name } : {}),
      ...("image" in entry && entry.image
        ? { image: canonicalImage(entry.image, base) }
        : {}),
    });
  }
  return out;
}

function canonicalImage(raw: string, base: string): string | undefined {
  try {
    const url = new URL(raw, base);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return;
  }
}

/* ------------------------------------------------------------------ */
/* Title                                                               */
/* ------------------------------------------------------------------ */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pageTitle(tree: Root): string | undefined {
  let ogTitle: string | undefined;
  let siteName: string | undefined;
  let title: string | undefined;
  let h1: string | undefined;
  let fallbackH1: string | undefined;
  const inArticle = new Set<Element>();
  walk(tree, (element) => {
    if (element.tagName === "article" || element.tagName === "main") {
      for (const heading of elements(element, (e) => e.tagName === "h1")) {
        inArticle.add(heading);
      }
    }
    switch (element.tagName) {
      case "title":
        title ??= clean(textOf(element));
        return;
      case "meta": {
        const key = (attr(element, "property") ?? attr(element, "name") ?? "")
          .toLowerCase()
          .trim();
        if (key === "og:title") ogTitle ??= clean(attr(element, "content"));
        if (key === "og:site_name") {
          siteName ??= clean(attr(element, "content"));
        }
        return;
      }
      case "h1": {
        if (/\b(site-title|logo)\b/i.test(classes(element))) return;
        const text = clean(textOf(element));
        if (!text) return;
        if (inArticle.has(element)) h1 ??= text;
        else fallbackH1 ??= text;
        return;
      }
    }
  });
  if (h1) return h1;
  if (ogTitle) return ogTitle;
  if (title && siteName) {
    return (
      clean(
        title.replace(
          new RegExp(`\\s*[-|–—:·]\\s*${escapeRegExp(siteName)}.*$`, "i"),
          "",
        ),
      ) ?? title
    );
  }
  return title ?? fallbackH1;
}

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

/**
 * `allowPrivateLinks` (46a): keep links to local and private hosts. Off by
 * default — before 46a a list page on a private host kept them (a LAN wiki,
 * a fixture); now the importer refuses to fetch such a page at all, and only
 * a test's allowed fixture host turns this on (`isTestAllowedUrl`).
 */
export function parseRoundupPage(
  html: string,
  pageUrl: string,
  { allowPrivateLinks = false }: { allowPrivateLinks?: boolean } = {},
): ParsedRoundup {
  const tree = fromHtml(html);
  const nodes = jsonLdNodes(tree);
  const hasRecipe = nodes.some((node) => hasType(node, "Recipe"));

  let canonical: string | undefined;
  walk(tree, (element) => {
    if (canonical || element.tagName !== "link") return;
    const rel = (attr(element, "rel") ?? "").toLowerCase().split(/\s+/);
    if (rel.includes("canonical")) {
      canonical = canonicalItemUrl(attr(element, "href"), pageUrl);
    }
  });
  /*
   * Relative links resolve against the page's own URL (or its `<base>`), as a
   * browser would; the canonical only says which links are the page itself.
   */
  let baseHref: string | undefined;
  walk(tree, (element) => {
    if (baseHref === undefined && element.tagName === "base") {
      baseHref = attr(element, "href");
    }
  });
  const base =
    baseHref && URL.canParse(baseHref, pageUrl)
      ? new URL(baseHref, pageUrl).href
      : pageUrl;
  /* Self-links (`#respond`, the canonical) are never items. */
  const pageKeys = new Set(
    [sourceUrlKey(pageUrl), canonical && sourceUrlKey(canonical)].filter(
      (key): key is string => Boolean(key),
    ),
  );
  const context: SkipContext = {
    pageKeys,
    allowPrivate: allowPrivateLinks,
  };

  const root = articleRoot(tree);
  const evidence = gatherEvidence(root, base, context);
  const title = pageTitle(tree);

  /* 1. The ItemList, when the page has one. */
  const listed: ListEntry[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    if (!hasType(node, "ItemList")) continue;
    for (const entry of itemListEntries(node, base)) {
      const key = sourceUrlKey(entry.url);
      if (!key || seen.has(key)) continue;
      if (skipUrl(entry.url, context)) continue;
      seen.add(key);
      listed.push(entry);
    }
  }
  if (listed.length > 0) {
    return {
      ...(title ? { title } : {}),
      ...(canonical ? { canonical } : {}),
      source: "itemlist",
      hasRecipe,
      items: listed.map((entry) => {
        const found = evidence.get(sourceUrlKey(entry.url) ?? entry.url);
        const name = cleanName(entry.name) ?? nameFor(found, entry.url);
        const image = entry.image ?? found?.image;
        return { url: entry.url, name, ...(image ? { image } : {}) };
      }),
    };
  }

  /* 2. The body's links. */
  const all = [...evidence.values()].filter(
    (entry) => !pageKeys.has(sourceUrlKey(entry.url) ?? ""),
  );
  const strong = all
    .filter((entry) => entry.strong)
    .sort((a, b) => (a.strongAt ?? 0) - (b.strongAt ?? 0));
  const chosen = strong.length >= MIN_LINK_ITEMS ? strong : all;
  if (chosen.length < MIN_LINK_ITEMS) {
    const found =
      chosen.length === 0
        ? "no recipe links"
        : `only ${chosen.length} candidate link${chosen.length === 1 ? "" : "s"}`;
    return {
      ...(title ? { title } : {}),
      ...(canonical ? { canonical } : {}),
      hasRecipe,
      items: [],
      reason:
        `No schema.org ItemList and ${found} in the article body — this does not look like a roundup.` +
        (hasRecipe
          ? " The page has a Recipe of its own: inspect or import it as one recipe."
          : ""),
    };
  }

  const pageSite = siteKey(pageUrl);
  const ordered = [
    ...chosen.filter((entry) => siteKey(entry.url) === pageSite),
    ...chosen.filter((entry) => siteKey(entry.url) !== pageSite),
  ];
  return {
    ...(title ? { title } : {}),
    ...(canonical ? { canonical } : {}),
    source: "links",
    hasRecipe,
    items: ordered.map((entry) => ({
      url: entry.url,
      name: nameFor(entry, entry.url),
      ...(entry.image ? { image: entry.image } : {}),
    })),
  };
}
