/**
 * Which URLs are videos (moved out of `importRecipeData` in 36d).
 *
 * No imports, on purpose: the `/new-recipe` form runs `isVideoUrl` in the
 * browser to say what a video import will do, and `importRecipeData` would
 * bring the page parsers (hast and friends) into the client bundle with it.
 */

/** The video platforms, with the name the import form shows for each. */
const VIDEO_HOSTS: [host: string, name: string][] = [
  ["youtube.com", "YouTube"],
  ["youtu.be", "YouTube"],
  ["vimeo.com", "Vimeo"],
  ["twitch.tv", "Twitch"],
  ["dailymotion.com", "Dailymotion"],
  ["facebook.com", "Facebook"],
  ["soundcloud.com", "SoundCloud"],
  ["streamable.com", "Streamable"],
  ["wistia.com", "Wistia"],
  ["mixcloud.com", "Mixcloud"],
];

function hostname(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/**
 * The video platform `url` is on — "YouTube", "Vimeo" — or `undefined` for
 * anything else, including text that is not a URL.
 */
export function videoHostName(url: string): string | undefined {
  const host = hostname(url.trim());
  if (!host) return undefined;
  return VIDEO_HOSTS.find(([videoHost]) => host.includes(videoHost))?.[1];
}

/** A video platform: imported through yt-dlp where it is available. */
export function isVideoUrl(url: string): boolean {
  return videoHostName(url) !== undefined;
}

/** YouTube itself (`youtube.com`, `youtu.be` and their subdomains). */
export function isYouTubeUrl(url: string): boolean {
  const host = hostname(url);
  return !!host && /(^|\.)(youtube\.com|youtu\.be)$/.test(host);
}

/**
 * A YouTube URL that starts playing at `seconds` (36e: each recipe of a
 * several-recipe video cites its chapter): `t=<seconds>s`, as YouTube's own
 * "copy video URL at current time" writes it. Any other URL is returned as
 * it is — other hosts spell a start differently, or not at all.
 */
export function withVideoStart(url: string, seconds: number): string {
  if (!isYouTubeUrl(url)) return url;
  const parsed = new URL(url);
  /* No start (0, or no chapter): none — not the `&t=32s` the person
   * happened to paste, which belongs to one recipe at most (36e review). */
  if (seconds > 0) parsed.searchParams.set("t", `${Math.floor(seconds)}s`);
  else if (parsed.searchParams.has("t")) parsed.searchParams.delete("t");
  else return url;
  return parsed.href;
}

/**
 * Where a YouTube URL starts, in seconds: `t=652s`, `t=652`, `t=10m52s`,
 * `start=652`. `undefined` for none, or for another host (36e: the recipe
 * page's player starts there).
 */
export function videoStartSeconds(url: string | undefined): number | undefined {
  if (!url || !isYouTubeUrl(url)) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const raw = parsed.searchParams.get("t") ?? parsed.searchParams.get("start");
  if (!raw) return undefined;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(raw.trim());
  if (!match || (!match[1] && !match[2] && !match[3])) return undefined;
  const seconds =
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0);
  return seconds > 0 ? seconds : undefined;
}
