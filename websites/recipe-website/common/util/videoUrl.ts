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
 * anything else, including text that is not a URL. The platform's host or a
 * subdomain of it (`www.`, `m.`, `player.`), never a host that merely
 * contains its name (46a review: `vimeo.com.attacker.example` is not Vimeo,
 * and yt-dlp would fetch it).
 */
export function videoHostName(url: string): string | undefined {
  const host = hostname(url.trim())?.toLowerCase().replace(/\.$/, "");
  if (!host) return undefined;
  return VIDEO_HOSTS.find(
    ([videoHost]) => host === videoHost || host.endsWith(`.${videoHost}`),
  )?.[1];
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

/** Vimeo itself (`vimeo.com`, `player.vimeo.com`). */
export function isVimeoUrl(url: string): boolean {
  const host = hostname(url);
  return !!host && /(^|\.)vimeo\.com$/.test(host);
}

/** A start in Vimeo's fragment, `#t=1m30s`: the `t` value, or none. */
function vimeoFragmentStart(parsed: URL): string | undefined {
  return (
    new URLSearchParams(parsed.hash.replace(/^#/, "")).get("t") ?? undefined
  );
}

/**
 * A video URL that starts playing at `seconds` (36e: each recipe of a
 * several-recipe video cites its chapter): on YouTube `t=<seconds>s`, as its
 * own "copy video URL at current time" writes it; on Vimeo the fragment,
 * `#t=<seconds>s`, as its share link writes it (38c). Any other URL is
 * returned as it is — other hosts spell a start differently, or not at all.
 */
export function withVideoStart(url: string, seconds: number): string {
  const youTube = isYouTubeUrl(url);
  if (!youTube && !isVimeoUrl(url)) return url;
  const parsed = new URL(url);
  const start = Math.floor(seconds);
  /* No start (0, or no chapter): none — not the `&t=32s` the person
   * happened to paste, which belongs to one recipe at most (36e review). */
  if (youTube) {
    if (start > 0) parsed.searchParams.set("t", `${start}s`);
    else if (parsed.searchParams.has("t")) parsed.searchParams.delete("t");
    else return url;
    return parsed.href;
  }
  if (start > 0) parsed.hash = `t=${start}s`;
  else if (vimeoFragmentStart(parsed) !== undefined) parsed.hash = "";
  else return url;
  return parsed.href;
}

/**
 * Where a video URL starts, in seconds: on YouTube `t=652s`, `t=652`,
 * `t=10m52s`, `start=652`; on Vimeo the fragment's `#t=` (or a `?t=`) in
 * the same spellings (38c). `undefined` for none, or for another host (36e:
 * the recipe page's player starts there).
 */
export function videoStartSeconds(url: string | undefined): number | undefined {
  if (!url) return undefined;
  const youTube = isYouTubeUrl(url);
  if (!youTube && !isVimeoUrl(url)) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const raw = youTube
    ? (parsed.searchParams.get("t") ?? parsed.searchParams.get("start"))
    : (vimeoFragmentStart(parsed) ?? parsed.searchParams.get("t"));
  if (!raw) return undefined;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(raw.trim());
  if (!match || (!match[1] && !match[2] && !match[3])) return undefined;
  const seconds =
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0);
  return seconds > 0 ? seconds : undefined;
}
