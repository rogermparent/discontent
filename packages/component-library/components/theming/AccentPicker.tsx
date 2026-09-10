"use client";

import * as React from "react";

import { cn } from "@discontent/component-library/lib/utils";
import { Slider } from "@discontent/component-library/components/ui/slider";
import { normalizeHue } from "@discontent/component-library/theming";

/**
 * Accent control: a row of curated hue swatches plus a fine hue slider. Only the
 * hue is user-facing — lightness/chroma are fixed by the contrast curve (see
 * theming/derive.ts), so the swatch preview uses the light-mode --primary L/C.
 */

interface Swatch {
  label: string;
  hue: number;
}

const SWATCHES: Swatch[] = [
  { label: "Ember", hue: 50 },
  { label: "Amber", hue: 80 },
  { label: "Pine", hue: 150 },
  { label: "Teal", hue: 195 },
  { label: "Steel", hue: 250 },
  { label: "Indigo", hue: 265 },
  { label: "Orchid", hue: 320 },
  { label: "Rose", hue: 15 },
];

/** The swatch fill for a hue, matching light-mode --primary (L 0.53, C 0.16). */
function swatchColor(hue: number): string {
  return `oklch(0.53 0.16 ${hue})`;
}

export function AccentPicker({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (hue: number) => void;
  className?: string;
}) {
  const hue = normalizeHue(value);
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-row flex-wrap gap-2">
        {SWATCHES.map((s) => {
          const active = Math.round(hue) === s.hue;
          return (
            <button
              key={s.label}
              type="button"
              aria-label={s.label}
              aria-pressed={active}
              title={s.label}
              onClick={() => onChange(s.hue)}
              className={cn(
                "size-8 rounded-full border transition-[box-shadow,transform] outline-none",
                "focus-visible:ring-ring/50 focus-visible:ring-[3px] hover:scale-105",
                active
                  ? "border-foreground ring-ring/50 ring-2"
                  : "border-border",
              )}
              style={{ backgroundColor: swatchColor(s.hue) }}
            />
          );
        })}
      </div>
      <div className="flex flex-row items-center gap-3">
        <Slider
          aria-label="Accent hue"
          min={0}
          max={360}
          step={1}
          value={[hue]}
          onValueChange={([h]) => onChange(h)}
          className="max-w-xs"
        />
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {Math.round(hue)}°
        </span>
        <span
          aria-hidden
          className="border-border size-6 shrink-0 rounded-full border"
          style={{ backgroundColor: swatchColor(hue) }}
        />
      </div>
    </div>
  );
}
