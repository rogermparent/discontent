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
