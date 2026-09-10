/*
 * The font-pairing *contract* — deliberately not a menu.
 *
 * next/font runs at build time and can only switch among a pre-registered set,
 * so the actual typefaces are loaded in each app's AppLayout/fonts.ts onto CSS
 * variables named `--ff-{role}-{key}`. That naming is pure convention, which is
 * the whole point: this module never needs to know which keys exist.
 *
 * Why it used to, and why that broke multi-site:
 *
 *   The old FONT_PAIRINGS array was a shared allow-list, and parse.ts used it as
 *   a *membership validator* — an unknown key was silently rewritten to "bench".
 *   parseTheme runs on both the settings-save path and the SITE_THEME export-bake
 *   path, so a site with its own typefaces would have had its pairing quietly
 *   replaced and would have shipped some other site's fonts. Adding every site's
 *   keys to the shared array instead breaks the other direction: a key whose
 *   var()s no next/font call ever registered makes the whole --font-display
 *   chain invalid-at-computed-value, and headings fall back to the browser
 *   default.
 *
 * So: validate the *shape* of a key here, derive its variable names by
 * convention, and let derive.ts supply a `--ff-{role}-fallback` so an
 * unregistered-but-well-formed key degrades to system fonts instead of nothing.
 * The labeled menu lives in each app, beside the next/font loaders that make it
 * true.
 */

/** The `--ff-{role}-{key}` variable names (with leading `--`) for one pairing. */
export interface FontPairingVars {
  display: string;
  body: string;
  mono: string;
}

/**
 * A labeled entry in an app's font menu. Apps declare these next to their
 * next/font loaders; the theming engine only ever sees the `key`.
 */
export interface FontPairingOption {
  key: string;
  label: string;
}

export const DEFAULT_FONT_PAIRING = "bench";

/**
 * Keys become CSS custom-property name segments, so they're restricted to a
 * conservative slug: lowercase alnum plus dashes, leading letter, ≤32 chars.
 * Anything else could smuggle syntax into `var(--ff-display-…)`.
 */
const FONT_PAIRING_KEY = /^[a-z][a-z0-9-]{0,31}$/;

/** True when `key` is a well-formed pairing key (not that any app registered it). */
export function isFontPairingKey(key: unknown): key is string {
  return typeof key === "string" && FONT_PAIRING_KEY.test(key);
}

/**
 * The CSS variable names a pairing binds. Malformed keys fall back to the
 * default pairing rather than producing an unusable var name.
 */
export function fontPairingVars(key: string): FontPairingVars {
  const k = isFontPairingKey(key) ? key : DEFAULT_FONT_PAIRING;
  return {
    display: `--ff-display-${k}`,
    body: `--ff-body-${k}`,
    mono: `--ff-mono-${k}`,
  };
}
