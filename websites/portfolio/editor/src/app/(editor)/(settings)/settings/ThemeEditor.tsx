"use client";

import { ThemeEditor as SharedThemeEditor } from "@discontent/component-library/components/theming/ThemeEditor";
import type { NamedPreset, Theme } from "@discontent/component-library/theming";
import { FONT_PAIRINGS } from "portfolio-website-common/components/AppLayout/fonts";
import { PORTFOLIO_PRESETS } from "portfolio-website-common/theme/presets";
import { MARGINALIA } from "portfolio-website-common/theme/presets";
import { updateSettings, savePreset, deletePreset } from "./actions";

/**
 * Portfolio's theme editor.
 *
 * Both overrides matter. `builtInPresets` are portfolio's, not the engine's —
 * the engine's palette set belongs to recipe. And `defaultTheme` is
 * `MARGINALIA`, not the engine's Working Bench: Working Bench names the `bench`
 * font pairing, which this app never registers, so falling back to it would
 * silently drop every heading to system fonts through the --ff-*-fallback chain.
 */
export function ThemeEditor({
  theme,
  presets,
}: {
  theme?: Theme;
  presets?: NamedPreset[];
}) {
  return (
    <SharedThemeEditor
      theme={theme}
      presets={presets}
      fontPairings={FONT_PAIRINGS}
      builtInPresets={PORTFOLIO_PRESETS}
      defaultTheme={MARGINALIA}
      updateSettings={updateSettings}
      savePreset={savePreset}
      deletePreset={deletePreset}
    />
  );
}
