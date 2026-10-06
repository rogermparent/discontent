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
import { hostnameLabel } from "recipe-website-common/util/hostnameLabel";
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";

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
  };
}

const run = promisify(execFile);

/**
 * `execFile`, not `execa`: execa is ESM-only, and the CLI runs under `tsx` as
 * CommonJS, where requiring it fails on a transitive dependency's `exports`.
 * yt-dlp's `-J` dump runs to megabytes (every format), hence the buffer.
 */
export async function fetchYtdlpMetadata(url: string): Promise<YtdlpResult> {
  try {
    const binary = await resolveYtdlpBinary();
    const { stdout } = await run(binary, ["-J", url], {
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
    });
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
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return SITE_NAMES.youtube;
  const extractor = meta.extractor?.split(":")[0]?.toLowerCase();
  if (extractor && SITE_NAMES[extractor]) return SITE_NAMES[extractor];
  return meta.extractor_key || hostnameLabel(url) || host;
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
  };
}
