/**
 * The learned notes selectors (47j): where a site with no known card plugin
 * keeps a recipe's notes, as a CSS selector a model picked once — stored per
 * registrable domain (`paceKey`, 39e's key: `www.x.com` ≡ `x.com`) in this
 * editor's `settings.json`, never in the content repository. Each records
 * when and by whom it was learned, and how often it has found notes since
 * (`hits`) and not (`misses`). Settings → Tools lists them with Forget.
 *
 * Every write is a read-modify-write under the settings lock
 * (`updateSettings`), so two imports finishing together keep both counts.
 */
import { paceKey } from "recipe-website-common/util/roundupPage";
import {
  readSettings,
  updateSettings,
  type LearnedNoteSelector,
} from "../../src/settings";

export type { LearnedNoteSelector };

/** A stored selector with its site. */
export interface NoteSelectorRow extends LearnedNoteSelector {
  site: string;
}

/** The site a page's selector is kept under, or `undefined` for no host. */
export function noteSelectorSite(url: string): string | undefined {
  return paceKey(url);
}

/** Every learned selector, the most recently learned first. */
export async function listNoteSelectors(): Promise<NoteSelectorRow[]> {
  const settings = await readSettings();
  return Object.entries(settings.noteSelectors ?? {})
    .map(([site, entry]) => ({ site, ...entry }))
    .sort((a, b) =>
      a.learned < b.learned ? 1 : a.learned > b.learned ? -1 : 0,
    );
}

/** The selector learned for `url`'s site, if any. */
export async function noteSelectorFor(
  url: string,
): Promise<NoteSelectorRow | undefined> {
  const site = noteSelectorSite(url);
  if (!site) return undefined;
  const settings = await readSettings();
  const entry = settings.noteSelectors?.[site];
  return entry ? { site, ...entry } : undefined;
}

/** Keep a newly learned (or re-learned) selector for `url`'s site. */
export async function storeNoteSelector(
  url: string,
  { selector, model }: { selector: string; model: string },
  now: Date = new Date(),
): Promise<NoteSelectorRow | undefined> {
  const site = noteSelectorSite(url);
  if (!site) return undefined;
  const entry: LearnedNoteSelector = {
    selector,
    learned: now.toISOString(),
    model,
    url,
    hits: 0,
    misses: 0,
  };
  await updateSettings((current) => ({
    ...current,
    noteSelectors: { ...current.noteSelectors, [site]: entry },
  }));
  return { site, ...entry };
}

/**
 * Count a use of `site`'s selector: a hit (it found notes) or a miss (it
 * found none, or the wrong thing). A selector forgotten meanwhile is left
 * forgotten.
 */
export async function recordNoteSelectorUse(
  site: string,
  hit: boolean,
  now: Date = new Date(),
): Promise<void> {
  await updateSettings((current) => {
    const entry = current.noteSelectors?.[site];
    if (!entry) return undefined;
    const at = now.toISOString();
    return {
      ...current,
      noteSelectors: {
        ...current.noteSelectors,
        [site]: hit
          ? { ...entry, hits: entry.hits + 1, lastHit: at }
          : { ...entry, misses: entry.misses + 1, lastMiss: at },
      },
    };
  });
}

/** Forget `site`'s selector; `false` when there was none. */
export async function forgetNoteSelector(site: string): Promise<boolean> {
  let had = false;
  await updateSettings((current) => {
    if (!current.noteSelectors?.[site]) return undefined;
    had = true;
    const rest = { ...current.noteSelectors };
    delete rest[site];
    if (Object.keys(rest).length > 0) {
      return { ...current, noteSelectors: rest };
    }
    const next = { ...current };
    delete next.noteSelectors;
    return next;
  });
  return had;
}
