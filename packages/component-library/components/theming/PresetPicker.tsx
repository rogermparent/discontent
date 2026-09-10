"use client";

import { PaletteIcon } from "lucide-react";
import {
  PRESETS,
  getPreset,
  type Preset,
  type Theme,
} from "@discontent/component-library/theming";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@discontent/component-library/components/ui/select";
import { useThemeVars } from "@discontent/component-library/components/theming/ThemeVarsProvider";

const SITE_DEFAULT = "__default__";

/**
 * Visitor-facing theme switch: pick a built-in preset (persisted to localStorage
 * via ThemeVarsProvider) or fall back to the site default. Unlike the owner's
 * full editor, this is just the curated preset list. Lives in `common` so the
 * export app (PR 2b) inherits it. Left uncontrolled so its markup is identical
 * on server and client — no hydration mismatch, no mount gate needed.
 *
 * `presets` defaults to the built-ins but is a prop because each site ships its
 * own curated set; the key must be resolved against the same list that was
 * rendered, so passing one without the other would silently pick a stranger.
 */
export function PresetPicker({
  className,
  presets = PRESETS,
}: {
  className?: string;
  presets?: Preset[];
}) {
  const { previewTheme } = useThemeVars();

  function onValueChange(value: string) {
    if (value === SITE_DEFAULT) {
      previewTheme(null);
      return;
    }
    const theme: Theme = { ...getPreset(value, presets).theme };
    previewTheme(theme);
  }

  return (
    <Select onValueChange={onValueChange}>
      <SelectTrigger size="sm" aria-label="Theme preset" className={className}>
        <PaletteIcon className="size-4" />
        <SelectValue placeholder="Theme" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SITE_DEFAULT}>Site default</SelectItem>
        {presets.map((p) => (
          <SelectItem key={p.key} value={p.key}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
