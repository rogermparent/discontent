/*
 * The content-engine theming engine: a small set of theme *knobs* derived into
 * contrast-safe OKLCH tokens, plus the serializers the injection layer uses to
 * apply them flash-free. See ./types.ts for the model and the durable doc
 * websites/recipe-website/docs/ui-overhaul.md for the roadmap.
 */

export type {
  Theme,
  DerivedTheme,
  TokenMap,
  NeutralKey,
  ColorMode,
  NamedPreset,
  ThemedSettings,
} from "./types";
export { deriveTheme, normalizeHue } from "./derive";
export {
  serializeThemeCss,
  resolveThemeVars,
  resolveThemeVarMaps,
} from "./serialize";
export { parseTheme } from "./parse";
export {
  PRESETS,
  WORKING_BENCH,
  DEFAULT_PRESET_KEY,
  getPreset,
  type Preset,
} from "./presets";
export {
  DEFAULT_FONT_PAIRING,
  isFontPairingKey,
  fontPairingVars,
  type FontPairingVars,
  type FontPairingOption,
} from "./fonts";

/** localStorage key holding the resolved {light,dark} var maps for a visitor. */
export const THEME_VARS_STORAGE_KEY = "ce-theme-vars";
/** localStorage key holding the visitor's full Theme knobs (for re-editing). */
export const THEME_STORAGE_KEY = "ce-theme";
/** next-themes storageKey — the pre-paint script reads it to resolve the mode. */
export const MODE_STORAGE_KEY = "theme";
