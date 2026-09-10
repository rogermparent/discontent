import { cache } from "react";
import {
  getSettingsDirectory,
  readSettings as readSettingsGeneric,
  writeSettings as writeSettingsGeneric,
} from "@discontent/cms/settings";
import type {
  NamedPreset,
  ThemedSettings,
} from "@discontent/component-library/theming";
import type {
  ContactLink,
  Posture,
} from "portfolio-website-common/config/site";

/**
 * Portfolio's owner settings.
 *
 * The store lives in `@discontent/cms/settings`; this is just portfolio's shape
 * bound to it. Note what is *not* here: `ytdlpPath`, which was the only
 * recipe-specific field in the module this was promoted from.
 *
 * `posture` is the one addition. Until now `SITE_LAYOUT` was read-only, so the
 * owner could not change posture without editing the environment — which made
 * the three postures a developer feature rather than a site feature.
 *
 * `theme` and `presets` come from `ThemedSettings` — the theming engine's
 * contract with the settings store, shared with recipe, which both sites used
 * to declare independently.
 */
export interface Settings extends ThemedSettings {
  /** Which layout posture the site renders in. Baked into the export. */
  posture?: Posture;
  /** The statement above the index — two lines at most. */
  statement?: string;
  /** The wordmark. */
  title?: string;
  description?: string;
  /**
   * Owner contact links, rendered in the footer.
   *
   * This is where `homepage.json`'s `contactLinks` landed — deliberately without
   * its `icon`/`iconType` fields. Those were the whole vulnerability: the icon
   * name was a form-supplied value that `ContactSection` passed to
   * `readFile(join(contentDirectory, "icons", icon))` and then injected with
   * `dangerouslySetInnerHTML`. That is an arbitrary file read *and* a stored-XSS
   * sink in one expression (an SVG can carry a `<script>`), so the field does not
   * come back.
   */
  contactLinks?: ContactLink[];
}

// `ContactLink` was declared here *and* in `common/config/site.ts`,
// byte-identical, while this file already imported `Posture` from that module
// on the same line. Re-exported rather than redeclared so both import paths
// keep resolving.
export type { ContactLink, NamedPreset };

export { getSettingsDirectory };

/**
 * Read the owner's settings, bypassing the per-request cache.
 *
 * This is the one server actions want. An action that reads, mutates and writes
 * shares a request scope with the re-render Next runs afterwards, so a cached
 * read taken *before* the write would hand that render the pre-write value.
 */
export async function readSettingsFresh(): Promise<Settings> {
  return readSettingsGeneric<Settings>();
}

/**
 * Read the owner's settings, once per request.
 *
 * `cache()` is not a nicety here: `(portfolio)/layout.tsx` and
 * `(portfolio)/page.tsx` both call this while rendering the same homepage, and
 * the settings store opens and closes its file on every call. React dedupes
 * them for the lifetime of one request; the next request gets a fresh cache.
 */
export const readSettings = cache(readSettingsFresh);

export async function writeSettings(settings: Settings): Promise<void> {
  return writeSettingsGeneric(settings);
}
