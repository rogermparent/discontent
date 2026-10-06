/**
 * Everything a recipe page says about itself, beyond the mapped recipe (26a).
 *
 * `importRecipeData` used to read one thing out of a page — the first JSON-LD
 * `Recipe` node — and take `image[0]` as the picture. 25e showed what that
 * misses: on WordPress recipe sites `image[0]` is a 225×225 crop, a page with
 * no Recipe node failed outright, and a malformed `<script>` block threw. This
 * module parses the page once, with the same hast parser `decodeText` uses,
 * and returns the raw material: every Recipe node, the OpenGraph/SEO metadata,
 * and the page's images ranked best first. The importer maps from it; the
 * curation layer's `inspect` (26b) returns it whole.
 */
import { fromHtml } from "hast-util-from-html";
import type { Element, Root, RootContent } from "hast";

/** A JSON-LD node as parsed: shape unknown until something checks it. */
export type JsonLdNode = Record<string, unknown>;

export interface PageMeta {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImages: string[];
  twitterImage?: string;
  siteName?: string;
  author?: string;
  canonical?: string;
}

export type ImageSource = "jsonld" | "og" | "twitter" | "img" | "ytdlp";

export interface ImageCandidate {
  url: string;
  width?: number;
  height?: number;
  /** Where the page named it; the first source wins when two name one URL. */
  from: ImageSource;
}

export interface ParsedRecipePage {
  recipeNodes: JsonLdNode[];
  meta: PageMeta;
  images: ImageCandidate[];
}

/* ------------------------------------------------------------------ */
/* hast helpers                                                        */
/* ------------------------------------------------------------------ */

function walk(node: Root | RootContent, visit: (element: Element) => void) {
  if (node.type === "element") visit(node);
  if ("children" in node) {
    for (const child of node.children) walk(child, visit);
  }
}

function textOf(node: Root | RootContent): string {
  if (node.type === "text") return node.value;
  if ("children" in node) return node.children.map(textOf).join("");
  return "";
}

function attr(element: Element, name: string): string | undefined {
  const value = element.properties?.[name];
  if (value === undefined || value === null || value === false) return;
  if (Array.isArray(value)) return value.join(" ");
  return String(value);
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed || undefined;
}

function absolute(url: string | undefined, base: string): string | undefined {
  if (!url) return;
  try {
    const resolved = new URL(url.trim(), base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return;
    }
    return resolved.href;
  } catch {
    return;
  }
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  /* schema.org's QuantitativeValue: `{"@type": "QuantitativeValue", value}`. */
  if (value && typeof value === "object" && "value" in value) {
    return toNumber((value as { value: unknown }).value);
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* JSON-LD                                                             */
/* ------------------------------------------------------------------ */

/**
 * `JSON.parse`, guarded: a bad block is skipped, never thrown.
 *
 * The one repair attempted is the common one — raw newlines and tabs inside
 * string values, which some plugins emit and `JSON.parse` rejects. Anything
 * else that does not parse is somebody else's broken block on a page that may
 * well have a good one further down.
 */
export function parseJsonLd(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(text.replace(/[\u0000-\u001f]+/g, " "));
    } catch {
      return undefined;
    }
  }
}

function isRecipeType(type: unknown): boolean {
  return Array.isArray(type) ? type.includes("Recipe") : type === "Recipe";
}

/** Every Recipe node, depth first — through `@graph`, arrays and nesting. */
function collectNodes(
  value: unknown,
  recipes: JsonLdNode[],
  byId: Map<string, JsonLdNode>,
) {
  if (Array.isArray(value)) {
    for (const child of value) collectNodes(child, recipes, byId);
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as JsonLdNode;
  if (typeof node["@id"] === "string" && Object.keys(node).length > 1) {
    byId.set(node["@id"], node);
  }
  if (isRecipeType(node["@type"])) {
    recipes.push(node);
    /* A Recipe's own children are its fields, not more recipes. */
    return;
  }
  for (const child of Object.values(node)) collectNodes(child, recipes, byId);
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

/** WordPress's crop suffix: `name-500x375.jpg`. */
const WP_CROP = /-(\d{2,5})x(\d{2,5})(\.[a-z0-9]+)$/i;

/**
 * The full-size URL a crop was made from, or `undefined` for a URL that is not
 * a crop: `…/Katsudon-500x375.jpg` → `…/Katsudon.jpg`.
 */
export function fullSizeUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(WP_CROP);
    if (!match) return;
    parsed.pathname = parsed.pathname.replace(WP_CROP, "$3");
    return parsed.href;
  } catch {
    return;
  }
}

/**
 * Dimensions written into the URL itself: a WordPress `-WxH` suffix, or
 * Cloudinary-style `w_1500,h_844` / `w_1500,ar_16:9` transformations.
 */
export function urlDimensions(
  url: string,
): { width: number; height?: number } | undefined {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return;
  }
  const crop = pathname.match(WP_CROP);
  if (crop) return { width: Number(crop[1]), height: Number(crop[2]) };
  const width = pathname.match(/(?:^|[/,])w_(\d{2,5})(?=[,/]|$)/);
  if (width) {
    const w = Number(width[1]);
    const height = pathname.match(/(?:^|[/,])h_(\d{2,5})(?=[,/]|$)/);
    if (height) return { width: w, height: Number(height[1]) };
    const ratio = pathname.match(
      /(?:^|[/,])ar_(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)(?=[,/]|$)/,
    );
    if (ratio) {
      return {
        width: w,
        height: Math.round((w * Number(ratio[2])) / Number(ratio[1])),
      };
    }
    return { width: w };
  }
  return;
}

/**
 * What an image with no stated or encoded size is assumed to measure.
 *
 * A URL that carries no dimensions is, on recipe sites, almost always an
 * original upload rather than a thumbnail — thumbnails are the ones that get
 * named for their size. So it is ranked as a typical full-size photo: above
 * the 225×225 and 500×500 crops 25e kept getting, below anything that *says*
 * it is bigger.
 */
const UNKNOWN_AREA = 1200 * 900;

function area(width?: number, height?: number): number | undefined {
  if (!width) return;
  /* A width with no height: assume a 4:3 photo, which is what recipe sites
   * mostly publish, so it ranks near its true size. */
  return width * (height ?? Math.round(width * 0.75));
}

/** The JSON-LD `image` value in any of its shapes, as candidates. */
function jsonLdImages(
  value: unknown,
  base: string,
  byId: Map<string, JsonLdNode>,
  out: ImageCandidate[],
) {
  if (Array.isArray(value)) {
    for (const entry of value) jsonLdImages(entry, base, byId, out);
    return;
  }
  if (typeof value === "string") {
    const url = absolute(value, base);
    if (url) out.push({ url, from: "jsonld" });
    return;
  }
  if (!value || typeof value !== "object") return;
  let node = value as JsonLdNode;
  /* `{"@id": "…#primaryimage"}` — a reference to a node elsewhere in the graph. */
  if (typeof node["@id"] === "string" && !node.url && !node.contentUrl) {
    node = byId.get(node["@id"]) ?? node;
  }
  const raw =
    typeof node.url === "string"
      ? node.url
      : typeof node.contentUrl === "string"
        ? node.contentUrl
        : undefined;
  const url = absolute(raw, base);
  if (!url) return;
  out.push({
    url,
    width: toNumber(node.width),
    height: toNumber(node.height),
    from: "jsonld",
  });
}

/** The largest `w` descriptor in a `srcset`, with its URL. */
function largestFromSrcset(
  srcset: string,
  base: string,
): { url: string; width: number } | undefined {
  let best: { url: string; width: number } | undefined;
  for (const part of srcset.split(",")) {
    const [rawUrl, descriptor] = part.trim().split(/\s+/);
    const width = descriptor?.endsWith("w") ? parseInt(descriptor, 10) : NaN;
    const url = absolute(rawUrl, base);
    if (url && Number.isFinite(width) && (!best || width > best.width)) {
      best = { url, width };
    }
  }
  return best;
}

/** The smallest `width` attribute a body `<img>` needs to be a candidate. */
const MIN_IMG_WIDTH = 400;

/** How many candidates `importRecipeData` hands back as `images`. */
export const TOP_IMAGES = 10;

/**
 * Rank every image the page names, best first, one entry per picture.
 *
 * - **Sources**, in the order they are trusted: the Recipe node's `image`,
 *   `og:image`, `twitter:image`, then large body `<img>`s. Body images only
 *   ever rank below the page's metadata — a related-recipes grid or an ad can
 *   be bigger than the dish, and the metadata is the site saying which
 *   picture is this page's.
 * - **Size**: a stated width/height first, then the size written into the URL
 *   (`-500x375`, `w_1500`), then `UNKNOWN_AREA`.
 * - **Crops collapse**: a WordPress `-WxH` URL whose full-size original is
 *   also on the list is dropped, and the original ranks above its biggest
 *   crop. An original that the page never names is not invented — a guessed
 *   URL that 404s would fail the whole import.
 */
export function rankImages(candidates: ImageCandidate[]): ImageCandidate[] {
  /* Exact duplicates: first sighting wins, but keep any size a later one states. */
  const byUrl = new Map<string, ImageCandidate>();
  for (const candidate of candidates) {
    const existing = byUrl.get(candidate.url);
    if (!existing) {
      byUrl.set(candidate.url, { ...candidate });
    } else if (!existing.width && candidate.width) {
      existing.width = candidate.width;
      existing.height = candidate.height;
    }
  }

  /* Crops whose original is present fold into it. */
  const familyArea = new Map<string, number>();
  for (const candidate of byUrl.values()) {
    const full = fullSizeUrl(candidate.url);
    if (full && byUrl.has(full)) {
      const dims = urlDimensions(candidate.url);
      const size =
        area(candidate.width, candidate.height) ??
        area(dims?.width, dims?.height) ??
        0;
      familyArea.set(full, Math.max(familyArea.get(full) ?? 0, size));
      byUrl.delete(candidate.url);
    }
  }

  const order = [...byUrl.values()];
  const score = (candidate: ImageCandidate): number => {
    const stated = area(candidate.width, candidate.height);
    if (stated) return stated;
    const family = familyArea.get(candidate.url);
    const dims = urlDimensions(candidate.url);
    const encoded = area(dims?.width, dims?.height);
    if (family !== undefined) {
      return Math.max(family + 1, encoded ?? UNKNOWN_AREA);
    }
    return encoded ?? UNKNOWN_AREA;
  };
  const tier = (candidate: ImageCandidate) =>
    candidate.from === "img" ? 1 : 0;

  return order
    .map((candidate, index) => ({ candidate, index, score: score(candidate) }))
    .sort(
      (a, b) =>
        tier(a.candidate) - tier(b.candidate) ||
        b.score - a.score ||
        a.index - b.index,
    )
    .map(({ candidate }) => {
      if (candidate.width) return candidate;
      const dims = urlDimensions(candidate.url);
      return dims
        ? { ...candidate, width: dims.width, height: dims.height }
        : candidate;
    });
}

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

export function parseRecipePage(html: string, url: string): ParsedRecipePage {
  const tree = fromHtml(html);
  const recipeNodes: JsonLdNode[] = [];
  const byId = new Map<string, JsonLdNode>();
  const meta: PageMeta = { ogImages: [] };
  const ogCandidates: ImageCandidate[] = [];
  const imgCandidates: ImageCandidate[] = [];
  let twitterImage: string | undefined;

  walk(tree, (element) => {
    switch (element.tagName) {
      case "script": {
        const type = attr(element, "type")?.toLowerCase() ?? "";
        if (type.includes("ld+json")) {
          collectNodes(parseJsonLd(textOf(element)), recipeNodes, byId);
        }
        return;
      }
      case "title":
        meta.title ??= clean(textOf(element));
        return;
      case "link": {
        const rel = attr(element, "rel")?.toLowerCase().split(/\s+/) ?? [];
        if (rel.includes("canonical")) {
          meta.canonical ??= absolute(attr(element, "href"), url);
        }
        return;
      }
      case "meta": {
        const key = (attr(element, "property") ?? attr(element, "name") ?? "")
          .toLowerCase()
          .trim();
        const content = clean(attr(element, "content"));
        if (!key || !content) return;
        switch (key) {
          case "description":
            meta.description ??= content;
            return;
          case "og:title":
            meta.ogTitle ??= content;
            return;
          case "og:description":
            meta.ogDescription ??= content;
            return;
          case "og:site_name":
            meta.siteName ??= content;
            return;
          case "author":
          case "article:author":
            /* `article:author` is often a profile URL rather than a name. */
            if (!/^https?:\/\//.test(content)) meta.author ??= content;
            return;
          case "og:image":
          case "og:image:url":
          case "og:image:secure_url": {
            const image = absolute(content, url);
            if (image && !meta.ogImages.includes(image)) {
              meta.ogImages.push(image);
              ogCandidates.push({ url: image, from: "og" });
            }
            return;
          }
          /* Width/height describe the `og:image` just before them. */
          case "og:image:width": {
            const last = ogCandidates.at(-1);
            if (last) last.width ??= toNumber(content);
            return;
          }
          case "og:image:height": {
            const last = ogCandidates.at(-1);
            if (last) last.height ??= toNumber(content);
            return;
          }
          case "twitter:image":
          case "twitter:image:src":
            twitterImage ??= absolute(content, url);
            return;
        }
        return;
      }
      case "img": {
        const srcset = attr(element, "srcSet") ?? attr(element, "dataSrcset");
        const fromSrcset = srcset ? largestFromSrcset(srcset, url) : undefined;
        const src = absolute(
          attr(element, "dataLazySrc") ??
            attr(element, "dataSrc") ??
            attr(element, "src"),
          url,
        );
        const width = toNumber(attr(element, "width"));
        const height = toNumber(attr(element, "height"));
        if (fromSrcset && fromSrcset.width >= MIN_IMG_WIDTH) {
          imgCandidates.push({
            url: fromSrcset.url,
            width: fromSrcset.width,
            height:
              width && height
                ? Math.round((fromSrcset.width * height) / width)
                : undefined,
            from: "img",
          });
        } else if (src && width && width >= MIN_IMG_WIDTH) {
          imgCandidates.push({ url: src, width, height, from: "img" });
        }
        return;
      }
    }
  });

  if (twitterImage) meta.twitterImage = twitterImage;

  const jsonLdCandidates: ImageCandidate[] = [];
  for (const node of recipeNodes) {
    jsonLdImages(node.image, url, byId, jsonLdCandidates);
  }

  const images = rankImages([
    ...jsonLdCandidates,
    ...ogCandidates,
    ...(twitterImage ? [{ url: twitterImage, from: "twitter" as const }] : []),
    ...imgCandidates,
  ]);

  return { recipeNodes, meta, images };
}
