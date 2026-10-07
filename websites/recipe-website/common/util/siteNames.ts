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
 * What a known site's markup gets wrong, by bare hostname (27c).
 *
 * `bareYield`: the site's JSON-LD `recipeYield` is a bare number that does not
 * describe the recipe. Imbibe's is a CMS default ("10", "4") on drinks that
 * make one — 25e and 25f imported several "Yield: 10" cocktails before
 * anyone noticed. A yield with words in it ("2 drinks") is still kept.
 */
export const SITE_QUIRKS: Readonly<Record<string, { bareYield?: "drop" }>> = {
  "imbibemagazine.com": { bareYield: "drop" },
};

/** Does this URL's site send a bare-number `recipeYield` that should be ignored? */
export function dropsBareYield(url: string): boolean {
  const host = hostnameLabel(url);
  return !!host && SITE_QUIRKS[host]?.bareYield === "drop";
}

/**
 * The human label for a URL when the page itself named nothing: a known
 * site's proper name, else the bare hostname. Undefined for a non-URL.
 */
export function siteLabel(url: string): string | undefined {
  const host = hostnameLabel(url);
  return (host && KNOWN_SITES[host]) || host;
}
