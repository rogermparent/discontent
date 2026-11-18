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

/** How long a site where learning failed is left alone (47j review). */
export const NOTE_SELECTOR_RETRY_DAYS = 30;

/** A site where learning found no selector, and when. */
export interface NoteSelectorFailure {
  site: string;
  at: string;
  problem: string;
}

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
  await updateSettings((current) => {
    const next = {
      ...current,
      noteSelectors: { ...current.noteSelectors, [site]: entry },
    };
    return withoutFailure(next, site);
  });
  return { site, ...entry };
}

type SettingsShape = Awaited<ReturnType<typeof readSettings>>;

function withoutFailure(settings: SettingsShape, site: string): SettingsShape {
  if (!settings.noteSelectorFailures?.[site]) return settings;
  const rest = { ...settings.noteSelectorFailures };
  delete rest[site];
  const next: SettingsShape = { ...settings, noteSelectorFailures: rest };
  if (Object.keys(rest).length === 0) delete next.noteSelectorFailures;
  return next;
}

/** Remember that learning found nothing for `url`'s site, and why. */
export async function recordNoteSelectorFailure(
  url: string,
  problem: string,
  now: Date = new Date(),
): Promise<void> {
  const site = noteSelectorSite(url);
  if (!site) return;
  await updateSettings((current) => ({
    ...current,
    noteSelectorFailures: {
      ...current.noteSelectorFailures,
      [site]: { at: now.toISOString(), problem: problem.slice(0, 300) },
    },
  }));
}

/**
 * The failure recorded for `url`'s site within the last
 * `NOTE_SELECTOR_RETRY_DAYS`, if any: its imports ask no model meanwhile.
 */
export async function recentNoteSelectorFailure(
  url: string,
  now: Date = new Date(),
): Promise<NoteSelectorFailure | undefined> {
  const site = noteSelectorSite(url);
  if (!site) return undefined;
  const failure = (await readSettings()).noteSelectorFailures?.[site];
  if (!failure) return undefined;
  const age = now.getTime() - Date.parse(failure.at);
  if (!(age < NOTE_SELECTOR_RETRY_DAYS * 86_400_000)) return undefined;
  return { site, ...failure };
}

/** Every recorded failure, the latest first. */
export async function listNoteSelectorFailures(): Promise<
  NoteSelectorFailure[]
> {
  return Object.entries((await readSettings()).noteSelectorFailures ?? {})
    .map(([site, failure]) => ({ site, ...failure }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
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

/** Forget `site`'s selector, or its failure; `false` when there was neither. */
export async function forgetNoteSelector(site: string): Promise<boolean> {
  let had = false;
  await updateSettings((current) => {
    const failed = !!current.noteSelectorFailures?.[site];
    const learned = !!current.noteSelectors?.[site];
    if (!learned && !failed) return undefined;
    had = true;
    let next: SettingsShape = withoutFailure(current, site);
    if (learned) {
      const rest = { ...next.noteSelectors };
      delete rest[site];
      next = { ...next, noteSelectors: rest };
      if (Object.keys(rest).length === 0) delete next.noteSelectors;
    }
    return next;
  });
  return had;
}
