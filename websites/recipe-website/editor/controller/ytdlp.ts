/**
 * yt-dlp, server-side and Next-free (26a).
 *
 * This was `src/app/(recipes)/new-recipe/ytdlp.ts`, reachable only from the
 * `/new-recipe` form. It lives here now so the curation layer — the CLI, the
 * MCP server and the JSON API — imports a video page the same way the form
 * does: one fetch (`fetchYtdlpMetadata`) and one mapper (`ytdlpToRecipe`), so
 * the two cannot disagree about what a video import contains.
 *
 * Node-safe on purpose (D8): it reads settings through
 * `@discontent/cms/settings`, not the editor's `@/settings` alias, which a
 * plain `tsx` process cannot resolve.
 */
import { readSettings } from "@discontent/cms/settings";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { siteLabel } from "recipe-website-common/util/siteNames";
import { isYouTubeUrl } from "recipe-website-common/util/videoUrl";
import {
  suggestTags,
  type ImportedRecipe,
} from "recipe-website-common/util/importRecipeData";

export interface YtdlpThumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface YtdlpChapter {
  title: string;
  start_time: number;
  end_time?: number;
}

/**
 * A top-level comment worth reading for a recipe (36d): the one the channel
 * pinned, or one its uploader wrote. Every other comment is dropped at
 * `pickYtdlpMetadata` — viewers' comments are noise, and untrusted.
 */
export interface YtdlpComment {
  /** Capped at `COMMENT_MAX_CHARS`. */
  text: string;
  author?: string;
  pinned: boolean;
  /** Written by the video's uploader (`author_is_uploader`). */
  byUploader: boolean;
}

export interface YtdlpMetadata {
  title: string;
  description: string;
  /** yt-dlp's own pick; `bestThumbnail` usually agrees. */
  thumbnail: string;
  thumbnails: YtdlpThumbnail[];
  webpage_url: string;
  duration: number;
  channel: string;
  uploader?: string;
  /** `YYYYMMDD`, as yt-dlp reports it. */
  upload_date?: string;
  chapters: YtdlpChapter[];
  tags: string[];
  /** `youtube`, `vimeo`, … */
  extractor?: string;
  /** `Youtube`, `Vimeo`, … */
  extractor_key?: string;
  /**
   * The pinned and the uploader's own comments, pinned first; empty unless
   * the fetch asked for comments (`{comments: true}`, 36d).
   */
  comments: YtdlpComment[];
}

export type YtdlpResult =
  | { status: "success"; metadata: YtdlpMetadata }
  | { status: "not-found" }
  | { status: "error"; message: string };

/**
 * Which binary to run: `YTDLP_PATH`, then the Settings page's `ytdlpPath`,
 * then `yt-dlp` on the `PATH`.
 *
 * The environment variable comes first because the CLI and the MCP server run
 * from wherever they were started, and `readSettings` resolves `settings/`
 * against the working directory — so a CLI run from the repo root never sees
 * the editor's settings file.
 */
export async function resolveYtdlpBinary(): Promise<string> {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  const settings = await readSettings<{ ytdlpPath?: string }>();
  return settings.ytdlpPath || "yt-dlp";
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/** The fields this app keeps out of yt-dlp's (very large) `-J` dump. */
export function pickYtdlpMetadata(
  data: Record<string, unknown>,
  url: string,
): YtdlpMetadata {
  const thumbnails = Array.isArray(data.thumbnails)
    ? data.thumbnails.flatMap((entry): YtdlpThumbnail[] => {
        if (!entry || typeof entry !== "object") return [];
        const {
          url: thumbUrl,
          width,
          height,
        } = entry as Record<string, unknown>;
        const href = asString(thumbUrl);
        return href
          ? [{ url: href, width: asNumber(width), height: asNumber(height) }]
          : [];
      })
    : [];
  const chapters = Array.isArray(data.chapters)
    ? data.chapters.flatMap((entry): YtdlpChapter[] => {
        if (!entry || typeof entry !== "object") return [];
        const { title, start_time, end_time } = entry as Record<
          string,
          unknown
        >;
        const start = asNumber(start_time);
        return typeof title === "string" && start !== undefined
          ? [{ title, start_time: start, end_time: asNumber(end_time) }]
          : [];
      })
    : [];
  return {
    title: asString(data.title) ?? "",
    description: asString(data.description) ?? "",
    thumbnail: asString(data.thumbnail) ?? "",
    thumbnails,
    webpage_url: asString(data.webpage_url) ?? url,
    duration: asNumber(data.duration) ?? 0,
    channel: asString(data.channel) ?? "",
    uploader: asString(data.uploader),
    upload_date: asString(data.upload_date),
    chapters,
    tags: Array.isArray(data.tags)
      ? data.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    extractor: asString(data.extractor),
    extractor_key: asString(data.extractor_key),
    comments: pickComments(data.comments),
  };
}

/** A comment's text is cut here: it goes to the model, and it is untrusted. */
export const COMMENT_MAX_CHARS = 6_000;

/** At most this many comments are kept (the pinned one first). */
const COMMENTS_KEPT = 3;

/**
 * The comments worth reading out of yt-dlp's `comments`: top-level ones the
 * channel pinned or its uploader wrote, pinned first, each capped.
 */
function pickComments(value: unknown): YtdlpComment[] {
  if (!Array.isArray(value)) return [];
  const kept = value.flatMap((entry): YtdlpComment[] => {
    if (!entry || typeof entry !== "object") return [];
    const { text, author, parent, is_pinned, author_is_uploader } =
      entry as Record<string, unknown>;
    const body = asString(text)?.trim();
    /* A reply is never the recipe; yt-dlp marks top-level ones "root". */
    if (!body || (parent !== undefined && parent !== "root")) return [];
    const pinned = is_pinned === true;
    const byUploader = author_is_uploader === true;
    if (!pinned && !byUploader) return [];
    return [
      {
        text: body.slice(0, COMMENT_MAX_CHARS),
        author: asString(author),
        pinned,
        byUploader,
      },
    ];
  });
  /* Stable: the pinned one first, then the uploader's in yt-dlp's order. */
  return [
    ...kept.filter((comment) => comment.pinned),
    ...kept.filter((comment) => !comment.pinned),
  ].slice(0, COMMENTS_KEPT);
}

/**
 * yt-dlp's arguments for a small comment fetch (36d): ten top-level comments
 * in "top" order and no replies — the pinned comment is listed first, and the
 * uploader's own are usually near the top. Measured on the workstation at
 * about +0–1 s over a plain `-J`. YouTube only: the `youtube:` extractor
 * arguments bound it, and another extractor would fetch every comment.
 */
export const YTDLP_COMMENT_ARGS = [
  "--write-comments",
  "--extractor-args",
  "youtube:max_comments=10,10,0,0;comment_sort=top",
] as const;

export interface FetchYtdlpOptions {
  /**
   * Also fetch the pinned and the uploader's comments (YouTube only): the
   * import asks for them only when a local model will read the video (36d).
   */
  comments?: boolean;
}

const run = promisify(execFile);

/**
 * `execFile`, not `execa`: execa is ESM-only, and the CLI runs under `tsx` as
 * CommonJS, where requiring it fails on a transitive dependency's `exports`.
 * yt-dlp's `-J` dump runs to megabytes (every format), hence the buffer.
 *
 * With `comments`, a failed run is tried once more without them: the
 * comments are extra, and must not cost an import that worked without.
 */
export async function fetchYtdlpMetadata(
  url: string,
  { comments = false }: FetchYtdlpOptions = {},
): Promise<YtdlpResult> {
  const withComments = comments && isYouTubeUrl(url);
  const result = await runYtdlp(url, withComments);
  if (withComments && result.status === "error") {
    return runYtdlp(url, false);
  }
  return result;
}

async function runYtdlp(
  url: string,
  withComments: boolean,
): Promise<YtdlpResult> {
  try {
    const binary = await resolveYtdlpBinary();
    const { stdout } = await run(
      binary,
      [...(withComments ? YTDLP_COMMENT_ARGS : []), "-J", url],
      {
        timeout: withComments ? 45_000 : 30_000,
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    return {
      status: "success",
      metadata: pickYtdlpMetadata(JSON.parse(stdout), url),
    };
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { status: "not-found" };
    }
    const message =
      error instanceof Error ? error.message : "Unknown yt-dlp error";
    return { status: "error", message };
  }
}

/**
 * The video's tags as `suggestedTags` (36d), through the same `suggestTags`
 * a page's keywords take (and its limit). Tags naming the channel itself
 * ("brian lagerstrom pasta salad") are dropped: they say who, not what.
 */
export function videoSuggestedTags(meta: YtdlpMetadata): string[] {
  const channel = (meta.channel || meta.uploader || "").trim().toLowerCase();
  return suggestTags({
    keywords: meta.tags.filter(
      (tag) => !channel || !tag.toLowerCase().includes(channel),
    ),
  });
}

/**
 * The largest thumbnail by area. On a tie yt-dlp's own `thumbnail` wins, then
 * a non-WebP one (YouTube lists `maxresdefault` as both JPEG and WebP).
 */
export function bestThumbnail(meta: YtdlpMetadata): string | undefined {
  let best: { url: string; area: number; rank: number } | undefined;
  for (const thumb of meta.thumbnails) {
    if (!thumb.width || !thumb.height) continue;
    const area = thumb.width * thumb.height;
    const rank =
      thumb.url === meta.thumbnail ? 2 : /\.webp(\?|$)/.test(thumb.url) ? 0 : 1;
    if (!best || area > best.area || (area === best.area && rank > best.rank)) {
      best = { url: thumb.url, area, rank };
    }
  }
  return best?.url || meta.thumbnail || undefined;
}

/**
 * The `*Imported from [url](url)*` line this used to open with is gone (D7):
 * the citation is carried by `source` instead, which the detail page renders
 * and the form can edit. What the prefix never covered — the channel and the
 * video's own description — still belongs here.
 */
export function formatYouTubeDescription(
  description?: string,
  channel?: string,
): string | undefined {
  const segments: string[] = [];
  if (channel) {
    segments.push(`Channel: ${channel}`);
  }
  if (description) {
    segments.push(description);
  }
  if (segments.length === 0) {
    return undefined;
  }
  return segments.join("\n\n---\n\n");
}

/** Display names yt-dlp's extractor keys get wrong. */
const SITE_NAMES: Record<string, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  dailymotion: "Dailymotion",
  twitch: "Twitch",
  facebook: "Facebook",
};

function videoSiteName(meta: YtdlpMetadata, url: string): string {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (isYouTubeUrl(url)) return SITE_NAMES.youtube;
  const extractor = meta.extractor?.split(":")[0]?.toLowerCase();
  if (extractor && SITE_NAMES[extractor]) return SITE_NAMES[extractor];
  return meta.extractor_key || siteLabel(url) || host;
}

/**
 * A video page as an import: the one mapping the form and the curation layer
 * share. `url` is what the caller asked for, and is what `source` cites.
 */
export function ytdlpToRecipe(
  meta: YtdlpMetadata,
  url: string,
): Partial<ImportedRecipe> {
  const image = bestThumbnail(meta);
  const author = meta.channel || meta.uploader || undefined;
  const suggestedTags = videoSuggestedTags(meta);
  return {
    name: meta.title || undefined,
    description: formatYouTubeDescription(meta.description, author),
    source: {
      url,
      name: videoSiteName(meta, url),
      author,
    },
    videoImportUrl: meta.webpage_url || url,
    ...(image ? { imageImportUrl: image } : {}),
    ...(suggestedTags.length > 0 ? { suggestedTags } : {}),
  };
}
