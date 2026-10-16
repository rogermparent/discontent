/**
 * One recipe link out of a video's description (38c; the 36d backlog row).
 *
 * Chinese Cooking Demystified's danhonggao says "FULL, WRITTEN RECIPE … is
 * over on Substack!" and links it; the description itself holds no recipe,
 * so the model reads `found: false` and the import is a bare video. When
 * that happens — **the model was asked and the video yields no recipe** —
 * and the description (or the creator's comment the model read) links
 * **exactly one** page that looks like a recipe, that page is imported
 * through the URL path (`importPage`: its site's queue and polite gap,
 * 30-D5; its own schema, or its own model reading and D4 grounding), and the
 * video stays the recipe's `video`. One hop, never more: the followed page's
 * own links are never followed.
 *
 * A link looks like a recipe (38-Dc5) when its path says "recipe", or its
 * line, or one of the two lines before it (up to another link), does —
 * "FULL, WRITTEN RECIPE" two lines above the Substack link. Any host, since
 * a creator's recipes live on their own site, never the video's host — but
 * not a host that is never a recipe page: video and social sites, shops and
 * affiliate links, tip jars, link shorteners (where they lead is unknown
 * until fetched), music credits. Two candidates or more: none is followed,
 * and the log says so.
 */
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import { isPrivateHost } from "recipe-website-common/util/roundupPage";
import { jobContext, type JobRun } from "../jobs/context";
import {
  recipeComments,
  type ApplyLlmResult,
  type LlmMode,
} from "../llm/importWithLlm";
import type { YtdlpMetadata } from "../ytdlp";

/** Hosts (and their subdomains) a recipe link never points at. */
const NOT_RECIPE_HOSTS = [
  /* Video and social. */
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "twitch.tv",
  "tiktok.com",
  "instagram.com",
  "facebook.com",
  "fb.com",
  "fb.me",
  "twitter.com",
  "x.com",
  "threads.net",
  "bsky.app",
  "pinterest.com",
  "reddit.com",
  "snapchat.com",
  "linkedin.com",
  "tumblr.com",
  "discord.gg",
  "discord.com",
  "spotify.com",
  "apple.com",
  /* Tip jars and memberships. */
  "patreon.com",
  "ko-fi.com",
  "buymeacoffee.com",
  "paypal.com",
  "paypal.me",
  "venmo.com",
  /* Shops, affiliate and link pages. */
  "amzn.to",
  "amzn.com",
  "a.co",
  "geni.us",
  "kit.co",
  "shopmy.us",
  "liketoknow.it",
  "rstyle.me",
  "linktr.ee",
  "beacons.ai",
  "creator-spring.com",
  "teespring.com",
  /* Shorteners: where they lead is unknown until fetched. */
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "t.co",
  "ow.ly",
  "rebrand.ly",
  "forms.gle",
  /* Music credits. */
  "bensound.com",
  "epidemicsound.com",
  "artlist.io",
  "soundcloud.com",
];

function notRecipeHost(host: string): boolean {
  const bare = host.toLowerCase().replace(/^www\./, "");
  return (
    /(^|\.)amazon\.[a-z.]+$/.test(bare) ||
    NOT_RECIPE_HOSTS.some((name) => bare === name || bare.endsWith(`.${name}`))
  );
}

/** A URL in text, without the punctuation a sentence puts after it. */
const URL_IN_TEXT = /https?:\/\/[^\s<>"'()[\]]+/gi;

/** The link as compared: no fragment, no tracking parameters, no trailing slash. */
function linkKey(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = "";
  for (const key of [...copy.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|si$|ref$)/i.test(key)) {
      copy.searchParams.delete(key);
    }
  }
  return copy.href.replace(/\/+(?=$|\?)/, "");
}

const HAS_URL = /https?:\/\//i;

const SAYS_RECIPE = /\brecipes?\b/i;

/**
 * The links in `text` that look like a recipe page (see the module
 * comment), each once, in the order the text gives them.
 */
export function recipeLinks(text: string): string[] {
  const lines = text.split("\n");
  const found = new Map<string, string>();
  lines.forEach((line, index) => {
    for (const match of line.matchAll(URL_IN_TEXT)) {
      const raw = match[0].replace(/[.,;:!?]+$/, "");
      let parsed: URL;
      try {
        parsed = new URL(raw);
      } catch {
        continue;
      }
      if (notRecipeHost(parsed.hostname)) continue;
      /* SSRF (38c review): never a loopback or private-network address,
       * even though its host is not on the deny list above. */
      if (isPrivateHost(parsed.href)) continue;
      const before: string[] = [];
      for (let back = index - 1; back >= 0 && before.length < 2; back -= 1) {
        const previous = lines[back].trim();
        if (!previous) continue;
        if (HAS_URL.test(previous)) break;
        before.push(previous);
      }
      let path = parsed.pathname;
      try {
        path = decodeURIComponent(path);
      } catch {
        /* A malformed escape: the path as it is. */
      }
      const says =
        SAYS_RECIPE.test(path.replace(/[-_/]+/g, " ")) ||
        SAYS_RECIPE.test(line.replace(URL_IN_TEXT, " ")) ||
        before.some((previous) => SAYS_RECIPE.test(previous));
      if (!says) continue;
      const key = linkKey(parsed);
      if (!found.has(key)) found.set(key, parsed.href);
    }
  });
  return [...found.values()];
}

/** A recipe body: an ingredient line or a step. */
function hasBody(recipe: Partial<ImportedRecipe> | undefined): boolean {
  return (
    (recipe?.ingredients ?? []).some((entry) => entry.type !== "heading") ||
    (recipe?.instructions?.length ?? 0) > 0
  );
}

/** The followed page's recipe, with the video kept as its video. */
function withVideo(
  recipe: Partial<ImportedRecipe>,
  video: Partial<ImportedRecipe> | undefined,
  videoUrl: string,
): Partial<ImportedRecipe> {
  return {
    ...recipe,
    videoImportUrl: video?.videoImportUrl ?? videoUrl,
    ...(!recipe.imageImportUrl && video?.imageImportUrl
      ? { imageImportUrl: video.imageImportUrl }
      : {}),
    ...(!recipe.suggestedTags?.length && video?.suggestedTags?.length
      ? { suggestedTags: video.suggestedTags }
      : {}),
  };
}

export interface FollowInput {
  /** The video. */
  url: string;
  metadata: YtdlpMetadata;
  /** The video's reading (`applyLlm` over its description). */
  applied: ApplyLlmResult;
  mode?: LlmMode;
  /** Passed on: a followed page with several recipes reads its first. */
  asOne?: boolean;
  job?: JobRun;
}

/**
 * The recipe a video's description links, when the video yields none (see
 * the module comment): the page's reading with the video as its `video`,
 * or `undefined` to keep the video's own result. A page that cannot be
 * fetched, or holds no recipe either, keeps the video's result with a
 * warning saying what was tried. A `follow` step logs the link.
 */
export async function followRecipeLink({
  url,
  metadata,
  applied,
  mode,
  asOne,
  job: run,
}: FollowInput): Promise<ApplyLlmResult | undefined> {
  const job = jobContext(run);
  const { log } = job;
  /* Only when the model read the video and found no recipe in it. */
  if (!applied.llm || applied.llm.error || applied.recipes) return undefined;
  if (hasBody(applied.recipe)) return undefined;
  const text = [
    metadata.description,
    ...recipeComments(metadata).map((comment) => comment.text),
  ].join("\n\n");
  const links = recipeLinks(text);
  if (links.length !== 1) {
    if (links.length > 1) {
      log.info(
        "follow",
        `${links.length} recipe links in the description — none followed`,
        { links: links.length },
      );
    }
    return undefined;
  }
  const [link] = links;
  const { importPage } = await import("./importRecipe");
  const page = await log.step(
    "follow",
    { host: new URL(link).hostname, url: link },
    async (step) => {
      try {
        return await importPage(link, { llm: mode, asOne }, job);
      } catch (error) {
        /* A cancel is the job's; a page that fails is a note, not a failure. */
        if (job.signal?.aborted) throw error;
        const why = error instanceof Error ? error.message : String(error);
        step.fail(why);
        return { failed: why };
      }
    },
  );
  if ("failed" in page) {
    return {
      ...applied,
      warnings: [
        ...applied.warnings,
        `the video's description links a recipe page, ${link}, which could not be read: ${page.failed}`,
      ],
      /* 38c review: a transient failure (403, timeout) must refetch on
       * retry — never kept in the reading cache. */
      followFailed: true,
    };
  }
  if (!page.recipes && !hasBody(page.recipe)) {
    return {
      ...applied,
      warnings: [
        ...applied.warnings,
        `the video's description links ${link}, but no recipe was found there either`,
      ],
    };
  }
  const note = `the video's description holds no recipe; read the recipe page it links, ${link}`;
  const recipes = page.recipes?.map((reading) => ({
    ...reading,
    recipe: withVideo(reading.recipe, applied.recipe, url),
  }));
  return {
    ...page,
    recipe: recipes
      ? recipes[0].recipe
      : page.recipe && withVideo(page.recipe, applied.recipe, url),
    /*
     * 38c review: the followed page may hold its own schema and no `llm`
     * (`mapRecipeNodes`/`schemaReadings`), but the video's description was
     * still read by the model — keep that so the reading is cached and a
     * `--pick` retry does not ask the model again.
     */
    llm: page.llm ?? applied.llm,
    warnings: [note, ...page.warnings, ...applied.warnings],
    ...(recipes ? { recipes } : {}),
    followed: link,
  };
}
