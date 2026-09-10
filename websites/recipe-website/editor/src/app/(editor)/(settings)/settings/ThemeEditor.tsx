"use client";

import { ThemeEditor as SharedThemeEditor } from "@discontent/component-library/components/theming/ThemeEditor";
import type { NamedPreset, Theme } from "@discontent/component-library/theming";
import { FONT_PAIRINGS } from "recipe-website-common/components/AppLayout/fonts";
import { updateSettings, savePreset, deletePreset } from "./actions";

/**
 * Recipe's theme editor.
 *
 * The editor itself was promoted to `@discontent/component-library` when
 * portfolio needed one too (portfolio rebuild PR C) — it is ~490 lines with
 * exactly four site-specific couplings, so copying it would have been the worst
 * of the options. What stays here is those four: the labeled font menu (which
 * lives beside the `next/font` loaders that make it real), and the three server
 * actions, which need this app's `auth`.
 *
 * Recipe takes the engine's built-in PRESETS and Working Bench default, so
 * neither is passed.
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
      updateSettings={updateSettings}
      savePreset={savePreset}
      deletePreset={deletePreset}
    />
  );
}
