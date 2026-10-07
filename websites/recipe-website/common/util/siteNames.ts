import { hostnameLabel } from "./hostnameLabel";

/**
 * Proper names for the hosts this site imports from most, keyed by bare
 * hostname (no `www.`). The spellings are the ones the content repo already
 * carries — 25e's normalizers wrote them by hand — so a fresh import of a page
 * with neither a publisher nor `og:site_name` lands on the same name (26d).
 */
export const KNOWN_SITES: Readonly<Record<string, string>> = {
  "acouplecooks.com": "A Couple Cooks",
  "imbibemagazine.com": "Imbibe",
  "loveandlemons.com": "Love and Lemons",
  "thekitchn.com": "The Kitchn",
  "punchdrink.com": "PUNCH",
  "youtube.com": "YouTube",
  "m.youtube.com": "YouTube",
  "youtu.be": "YouTube",
};

/**
 * The human label for a URL when the page itself named nothing: a known
 * site's proper name, else the bare hostname. Undefined for a non-URL.
 */
export function siteLabel(url: string): string | undefined {
  const host = hostnameLabel(url);
  return (host && KNOWN_SITES[host]) || host;
}
