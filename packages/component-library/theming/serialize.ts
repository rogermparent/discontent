/*
 * Turn a derived theme into the two forms the injection layer needs:
 *   - a `:root{…}.dark{…}` CSS string for the SSR <style> (site default), and
 *   - a flat resolved-mode token map for inline vars on <html> (user override
 *     + live preview + the pre-paint script).
 */

import { deriveTheme } from "./derive";
import type { DerivedTheme, Theme, TokenMap } from "./types";

function tokensToDeclarations(tokens: TokenMap): string {
  return Object.entries(tokens)
    .map(([k, v]) => `${k}: ${v};`)
    .join("");
}

/**
 * Serialize a theme to a `:root{}` / `.dark{}` override block. Injected as the
 * first child of <body> so it wins over styles/theme.css (same specificity,
 * later in source order) for both modes without any JS.
 */
export function serializeThemeCss(theme: Theme): string {
  const { light, dark } = deriveTheme(theme);
  return `:root{${tokensToDeclarations(light)}}.dark{${tokensToDeclarations(dark)}}`;
}

/** The resolved token map for a single mode — for inline vars on <html>. */
export function resolveThemeVars(
  theme: Theme,
  mode: "light" | "dark",
): TokenMap {
  return deriveTheme(theme)[mode];
}

/** Both resolved maps — what the client stores in localStorage for the script. */
export function resolveThemeVarMaps(theme: Theme): DerivedTheme {
  return deriveTheme(theme);
}
