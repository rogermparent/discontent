import {
  Ingredient,
  Instruction,
  InstructionEntry,
  InstructionGroup,
  Recipe,
  RecipeSource,
} from "../controller/types";
import { createIngredient } from "./parseIngredients";
import { hostnameLabel } from "./hostnameLabel";
import {
  parseRecipePage,
  TOP_IMAGES,
  type ImageCandidate,
  type JsonLdNode,
  type PageMeta,
  type ParsedRecipePage,
} from "./pageMetadata";
import { fromHtml } from "hast-util-from-html";
import { toMdast } from "hast-util-to-mdast";
import { toMarkdown } from "mdast-util-to-markdown";

import { decodeHTML } from "entities";

function decodeText(html: string) {
  const hast = fromHtml(decodeHTML(html), { fragment: true });
  const mdast = toMdast(hast);
  const markdown = toMarkdown(mdast);
  return markdown.trim();
}

/**
 * schema.org lets `author` be a bare string, a Person/Organization object, or
 * an array of either — all three occur in the wild on recipe sites.
 */
type AuthorLD = string | { name?: string } | (string | { name?: string })[];

type InstructionLD =
  | string
  | {
      text?: string;
      itemListElement?: ({ name?: string; text?: string } | string)[];
      name?: string;
    };

/**
 * What the mapper reads off a Recipe node. Every field is checked before use:
 * the node is whatever the page published (`JsonLdNode`), not this shape.
 */
interface RecipeLD {
  name?: string;
  description?: string;
  /** Strings per schema.org — but see `ingredientText` for what sites send. */
  recipeIngredient?: unknown[];
  video?: string | { contentUrl?: string; embedUrl?: string; url?: string };
  /** An array per schema.org; one string on some sites (Imbibe, 26a). */
  recipeInstructions?: InstructionLD[] | InstructionLD;
  recipeYield?: unknown;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  author?: AuthorLD;
  publisher?: { name?: string };
}

/** Entities only — the value is rendered as plain text, never as markdown. */
function decodeName(value: string): string | undefined {
  return decodeHTML(value).trim() || undefined;
}

/**
 * The first usable name out of a schema.org `author`, in any of its three
 * shapes. Exported for the unit tests, which pin each shape.
 */
export function extractAuthorName(author?: AuthorLD): string | undefined {
  if (!author) return undefined;
  if (typeof author === "string") return decodeName(author);
  if (Array.isArray(author)) {
    for (const entry of author) {
      const name = extractAuthorName(entry);
      if (name) return name;
    }
    return undefined;
  }
  if (typeof author === "object" && typeof author.name === "string") {
    return decodeName(author.name);
  }
  return undefined;
}

/**
 * The citation carried by every import (D6/22a). It replaces the
 * `*Imported from [url](url)*` description prefix this importer used to write
 * (D7): the same fact, in a field the site can render and a query can read,
 * rather than prose glued to the front of the user's own description.
 */
export function buildSource(
  url: string,
  publisherName?: string,
  author?: string,
): RecipeSource {
  return {
    url,
    name: publisherName || hostnameLabel(url),
    author,
  };
}

export interface ImportedRecipe extends Recipe {
  imageImportUrl?: string;
  videoImportUrl?: string;
  /**
   * The page had no Recipe node, so this is its title, description and best
   * image only — the SEO fallback (26a). A form can start from it; the
   * curation layer refuses to *create* from it without `allowPartial`.
   */
  partial?: boolean;
  /** The page's top image candidates, best first (`imageImportUrl` is `[0]`). */
  images?: ImageCandidate[];
}

function createStep({
  name,
  text = "",
}: {
  name?: string;
  text?: string;
}): Instruction {
  const cleanedName = name
    ? decodeText(name).replaceAll(/ +/g, " ")
    : undefined;
  const cleanedText = decodeText(text).replaceAll(/ +/g, " ");
  const nameIsNotRedundant =
    cleanedName &&
    cleanedText &&
    !cleanedText.startsWith(cleanedName.replace(/\.\.\.$/, ""));
  return {
    name: nameIsNotRedundant ? cleanedName : undefined,
    text: cleanedText,
  };
}

function getVideoUrl(
  input: string | { contentUrl?: string; embedUrl?: string; url?: string },
) {
  if (typeof input === "string") return input;
  return input.contentUrl || input.embedUrl || input.url;
}

// Function to parse ISO 8601 duration strings to minutes
const parseDurationToMinutes = (
  duration: string | undefined,
): number | undefined => {
  if (!duration || typeof duration !== "string") return undefined;
  const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!matches) return undefined;
  const hours = matches[1] ? parseInt(matches[1], 10) : 0;
  const minutes = matches[2] ? parseInt(matches[2], 10) : 0;
  return hours * 60 + minutes;
};

/** A video platform: imported through yt-dlp where it is available. */
export function isVideoUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const videoHosts = [
      "youtube.com",
      "youtu.be",
      "vimeo.com",
      "twitch.tv",
      "dailymotion.com",
      "facebook.com",
      "soundcloud.com",
      "streamable.com",
      "wistia.com",
      "mixcloud.com",
    ];
    return videoHosts.some((host) => urlObj.hostname.includes(host));
  } catch {
    return false;
  }
}

/**
 * One `recipeIngredient` entry as text.
 *
 * schema.org says each is a string, and nearly every site agrees. Imbibe's
 * plugin publishes `{"ingredient": "1 ½ oz. white rum", "ingredient_link": ""}`
 * instead, which reached `decodeHTML` as an object and threw — so an object
 * with a string `ingredient`, `text` or `name` is read for that, and anything
 * else is skipped rather than failing the whole import.
 */
export function ingredientText(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    for (const key of ["ingredient", "text", "name"] as const) {
      const value = (entry as Record<string, unknown>)[key];
      if (typeof value === "string") return value;
    }
  }
  return undefined;
}

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

export interface FetchedPage {
  html: string;
  status: number;
  ok: boolean;
  /** Where the page ended up after redirects. */
  finalUrl: string;
}

/**
 * Fetch a recipe page as Node first, and as a browser only after a 403.
 *
 * Neither identity works everywhere. Imbibe 403s Node's default agent, while
 * Cloudflare-fronted sites (A Couple Cooks) serve Node and answer a Chrome
 * `User-Agent` with a 403 "Just a moment…" challenge, since the request's TLS
 * fingerprint is not Chrome's. Asking plainly first keeps every site that
 * worked before the browser headers did.
 */
export async function fetchRecipePage(url: string): Promise<FetchedPage> {
  let response = await fetch(url, { next: { revalidate: 300 } });
  if (response.status === 403) {
    response = await fetch(url, {
      headers: RECIPE_FETCH_HEADERS,
      next: { revalidate: 300 },
    });
  }
  /* Test stubs (and nothing real) omit `status`: read that as a 200. */
  const status = response.status ?? 200;
  return {
    html: await response.text(),
    status,
    ok: status >= 200 && status < 300,
    finalUrl: response.url || url,
  };
}

export { parseRecipePage };
export type { ImageCandidate, ParsedRecipePage };

/**
 * `recipeYield` in any of its shapes, as the one string the form shows.
 *
 * Sites send a number (`10`), a string (`"8 flatbreads"`) or an array that
 * repeats itself with and without the unit (`["8", "8 flatbreads"]`). The
 * array's first entry that says more than a bare number is the useful one.
 */
export function yieldText(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return decodeName(value);
  if (Array.isArray(value)) {
    const entries = value
      .map(yieldText)
      .filter((entry): entry is string => !!entry);
    return entries.find((entry) => !/^[\d\s./-]+$/.test(entry)) ?? entries[0];
  }
  return undefined;
}

/**
 * Instructions published as one string (Imbibe's alcohol-free negroni) as
 * steps: one per line if it has lines, else one per sentence.
 */
export function splitInstructionText(text: string): Instruction[] {
  const decoded = decodeText(text).replaceAll(/ +/g, " ");
  let parts = decoded
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    parts = decoded
      .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
  }
  return parts.map((part) => ({ text: part }));
}

function mapInstructions(
  recipeInstructions: RecipeLD["recipeInstructions"],
): InstructionEntry[] | undefined {
  if (!recipeInstructions) return undefined;
  if (typeof recipeInstructions === "string") {
    return splitInstructionText(recipeInstructions);
  }
  const entries = Array.isArray(recipeInstructions)
    ? recipeInstructions
    : [recipeInstructions];
  return entries.flatMap((entry): InstructionEntry[] => {
    // Handle string-based instructions
    if (typeof entry === "string") {
      return [createStep({ text: entry })];
    }
    if (!entry || typeof entry !== "object") return [];
    // Handle instruction groups with itemListElement
    if (Array.isArray(entry.itemListElement)) {
      const { name, itemListElement } = entry;
      return [
        {
          name: name && decodeText(name),
          instructions: itemListElement.map((item) =>
            typeof item === "string"
              ? createStep({ text: item }) // Handle nested string-based instructions
              : createStep(item),
          ),
        } as InstructionGroup,
      ];
    }
    // Handle standard instruction objects
    return [createStep(entry)];
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The page's own best guess at a title, without the " | Site Name" tail —
 * which sites put on `og:title` as often as on `<title>` (PUNCH: "Paper Plane
 * Cocktail Recipe | PUNCH").
 */
function seoName(meta: PageMeta): string | undefined {
  const raw = meta.ogTitle ?? meta.title;
  if (!raw) return undefined;
  const title = meta.siteName
    ? raw.replace(
        new RegExp(`\\s*[|·–—-]\\s*${escapeRegExp(meta.siteName)}\\s*$`, "i"),
        "",
      )
    : raw;
  return decodeName(title) ?? decodeName(raw);
}

/**
 * The mapping, separated from the fetch so `inspect` (26b) can run it over a
 * page it has already parsed.
 *
 * With no Recipe node this is the SEO fallback: the page's title, description
 * and best image, marked `partial` — or `undefined` when the page offers none
 * of the three, or answered with an error status (a 404 page's title is not a
 * recipe name).
 */
export function mapRecipePage(
  url: string,
  page: ParsedRecipePage,
  { ok = true }: { ok?: boolean } = {},
): Partial<ImportedRecipe> | undefined {
  const { recipeNodes, meta, images } = page;
  const recipeObject = recipeNodes[0] as RecipeLD | undefined;
  const topImages = images.slice(0, TOP_IMAGES);
  const bestImage = topImages[0]?.url;

  if (!recipeObject) {
    if (!ok) return undefined;
    const name = seoName(meta);
    const rawDescription = meta.ogDescription ?? meta.description;
    const description = rawDescription ? decodeName(rawDescription) : undefined;
    if (!name && !description && !bestImage) return undefined;
    return {
      partial: true,
      name,
      description,
      imageImportUrl: bestImage,
      images: topImages,
      source: buildSource(
        url,
        meta.siteName ? decodeName(meta.siteName) : undefined,
        meta.author ? decodeName(meta.author) : undefined,
      ),
    };
  }

  const {
    name,
    description,
    recipeIngredient,
    recipeInstructions,
    recipeYield,
    video,
    prepTime,
    cookTime,
    totalTime,
    author,
    publisher,
  } = recipeObject;

  const videoURL = video ? getVideoUrl(video) : undefined;

  const newDescription =
    typeof description === "string" && description
      ? decodeText(description)
      : undefined;

  return {
    name: typeof name === "string" ? decodeText(name) : seoName(meta),
    imageImportUrl: bestImage,
    images: topImages,
    videoImportUrl: videoURL,
    description: newDescription,
    source: buildSource(
      url,
      typeof publisher?.name === "string"
        ? decodeName(publisher.name)
        : undefined,
      extractAuthorName(author),
    ),
    prepTime: parseDurationToMinutes(prepTime),
    cookTime: parseDurationToMinutes(cookTime),
    totalTime: parseDurationToMinutes(totalTime),
    recipeYield: yieldText(recipeYield),
    ingredients: Array.isArray(recipeIngredient)
      ? (recipeIngredient
          .map(ingredientText)
          .filter((line): line is string => !!line)
          .map((ingredientLine) => createIngredient(decodeText(ingredientLine)))
          .filter(Boolean) as Ingredient[])
      : undefined,
    instructions: mapInstructions(recipeInstructions),
  };
}

/** Re-exported so a caller holding parsed nodes needs no second import. */
export type { JsonLdNode };

export async function importRecipeData(
  rawUrl: string,
): Promise<Partial<ImportedRecipe> | undefined> {
  // Trim hash from URL if it exists
  const url = rawUrl?.split("#")[0];

  // Check if the URL is a video platform URL
  if (isVideoUrl(url)) {
    /*
     * The bare link. yt-dlp runs server-side (`editor/controller/ytdlp.ts`),
     * and both of its callers try it before falling back to this.
     */
    return {
      videoImportUrl: url,
      source: buildSource(url),
    };
  }

  const { html, ok } = await fetchRecipePage(url);
  return mapRecipePage(url, parseRecipePage(html, url), { ok });
}
