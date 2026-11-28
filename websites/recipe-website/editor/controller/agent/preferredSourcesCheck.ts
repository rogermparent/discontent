/**
 * The preferred recipe sources' shape and check (51g, b03), browser-safe so
 * the Settings card checks a site as it is added; the store is
 * `preferredSources.ts`.
 */
import { paceKey } from "recipe-website-common/util/roundupPage";

/** Sites asked first when nothing is saved (Sally's, 2026-10-13). */
export const DEFAULT_PREFERRED_SOURCES: readonly string[] = [
  "sallysbakingaddiction.com",
];

/** At most this many sites (each costs one more web search). */
export const PREFERRED_SOURCES_MAX = 10;

/** A list that is not a list of sites; the message says what is wrong. */
export class PreferredSourcesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreferredSourcesError";
  }
}

/**
 * One site as the person typed it ("https://www.Example.com/recipes",
 * "example.com") → its registrable domain, or `undefined` when it is not a
 * site.
 */
export function preferredSourceKey(raw: string): string | undefined {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return undefined;
  return paceKey(
    /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`,
  );
}

/**
 * Check a list of sites: each a registrable domain (a page's URL is cut to
 * its site), deduped keeping the first, at most `PREFERRED_SOURCES_MAX`.
 * Throws `PreferredSourcesError` naming the first thing wrong.
 */
export function parsePreferredSources(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new PreferredSourcesError(
      "Preferred sources must be a list of sites.",
    );
  }
  const sites: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      throw new PreferredSourcesError(
        "Each preferred source must be a site name.",
      );
    }
    if (!item.trim()) continue;
    const key = preferredSourceKey(item);
    if (!key) {
      throw new PreferredSourcesError(
        `“${item.trim().slice(0, 60)}” is not a site (use a name like example.com).`,
      );
    }
    if (!sites.includes(key)) sites.push(key);
  }
  if (sites.length > PREFERRED_SOURCES_MAX) {
    throw new PreferredSourcesError(
      `At most ${PREFERRED_SOURCES_MAX} preferred sources (you gave ${sites.length}).`,
    );
  }
  return sites;
}
