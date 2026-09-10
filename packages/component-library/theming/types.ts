/*
 * The theme model for content-engine sites.
 *
 * A theme is a small set of *knobs*, not a raw dump of every token. The knobs
 * are derived (see ./derive.ts) into the actual OKLCH token values for light and
 * dark, staying on the contrast-safe curve established in PR 1 so every accent
 * choice keeps WCAG AA. Persisted as JSON (owner default in the editor's
 * settings.json; per-visitor override in localStorage).
 */

export type NeutralKey = "warm" | "cool" | "gray";

export type ColorMode = "system" | "light" | "dark";

export interface Theme {
  /** OKLCH hue (0–360) for the accent. Lightness/chroma are fixed by the curve. */
  accentHue: number;
  /** Bench neutral family — derives background/card/muted/secondary/border. */
  neutral: NeutralKey;
  /** Corner radius in rem → --radius (cascades the whole radius scale). */
  radius: number;
  /** Key into the pre-registered font menu → remaps --ff-display/-body/-mono. */
  fontPairing: string;
  /** Initial color mode for the site (next-themes defaultTheme). */
  defaultMode?: ColorMode;
}

/** A flat map of CSS custom-property names (incl. leading `--`) to values. */
export type TokenMap = Record<string, string>;

/** A theme derived into the concrete tokens for each color mode. */
export interface DerivedTheme {
  light: TokenMap;
  dark: TokenMap;
}

/**
 * An owner-saved, named theme kept alongside the built-in PRESETS.
 *
 * Lives here rather than in a site's settings module because both sites store
 * the same thing, and because `@discontent/cms` — which owns the settings
 * store — cannot reference `Theme` without a dependency cycle (component-library
 * already depends on cms).
 */
export interface NamedPreset {
  id: string;
  name: string;
  theme: Theme;
}

/**
 * The part of a site's owner settings that the theming engine owns.
 *
 * Both sites' `Settings` carried these two fields, declared independently with
 * near-identical comments. The rest of each shape is genuinely per-site
 * (`ytdlpPath` is a recipe tool; `posture` is a portfolio one), but these two
 * are the theming engine's contract with the settings store and should have one
 * definition.
 *
 * It lives here rather than in `@discontent/cms`, which owns the store, because
 * cms cannot name `Theme` without a dependency cycle — component-library
 * already depends on cms.
 */
export interface ThemedSettings {
  /** Owner-persisted site-default theme. */
  theme?: Theme;
  /** Owner-saved named presets, editor-side only (never the built-in PRESETS). */
  presets?: NamedPreset[];
}
