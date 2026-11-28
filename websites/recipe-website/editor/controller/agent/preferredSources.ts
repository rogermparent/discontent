/**
 * The preferred recipe sources (51g, b03): the sites the online plan asks
 * first, in this order, before the open web (Roger 2026-10-13: Sally's
 * Baking Addiction; 2026-11-28: "this should be configurable"). An ordered
 * list of registrable domains in this editor's `settings.json`
 * (`preferredSources`), never in the content repository. Absent means the
 * default, today's one site; an empty list is allowed and means no
 * preferred site. The shape and check are `preferredSourcesCheck.ts`.
 */
import { readSettings, updateSettings } from "../../src/settings";
import { ValidationError } from "../curation/errors";
import {
  DEFAULT_PREFERRED_SOURCES,
  PreferredSourcesError,
  parsePreferredSources,
} from "./preferredSourcesCheck";

export {
  DEFAULT_PREFERRED_SOURCES,
  PREFERRED_SOURCES_MAX,
  parsePreferredSources,
  preferredSourceKey,
} from "./preferredSourcesCheck";

/** The saved list, or the default when none is saved (or it is unreadable). */
export async function readPreferredSources(): Promise<string[]> {
  try {
    const { preferredSources } = await readSettings();
    if (Array.isArray(preferredSources)) {
      return parsePreferredSources(preferredSources);
    }
  } catch {
    /* an unreadable setting reads as unset */
  }
  return [...DEFAULT_PREFERRED_SOURCES];
}

/** Save the list (checked) under the settings lock; answers what was saved. */
export async function writePreferredSources(value: unknown): Promise<string[]> {
  let sites: string[];
  try {
    sites = parsePreferredSources(value);
  } catch (error) {
    if (error instanceof PreferredSourcesError) {
      throw new ValidationError(error.message);
    }
    throw error;
  }
  await updateSettings((current) => ({ ...current, preferredSources: sites }));
  return sites;
}
