"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import type { Preset } from "@discontent/component-library/theming";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@discontent/component-library/components/ui/popover";
import { ThemeToggle } from "@discontent/component-library/components/theming/ThemeToggle";
import { PresetPicker } from "@discontent/component-library/components/theming/PresetPicker";

/**
 * A labeled field with the house instrument-panel caption (mono, uppercase,
 * tabular) sitting above its control.
 *
 * Exported so a site's `extraControls` (see {@link AppearanceControls}) wear the
 * same caption as the built-in fields instead of re-deriving the style.
 */
export function AppearanceField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        id={htmlFor}
        className="font-mono text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * The two appearance controls — color mode + palette preset — consolidated into
 * one labeled block. Shared verbatim between a site's desktop Appearance popover
 * and its mobile hamburger sheet so there's a single control pattern.
 *
 * `presets` threads through to {@link PresetPicker}: each site ships its own
 * curated list, and the key has to resolve against the same list that was
 * rendered. Omit it for the built-ins.
 *
 * `extraControls` is a slot for site-specific appearance knobs, rendered after
 * the Preset field. The kit can't own these — a recipe reader's sticky-header
 * preference means nothing on a portfolio — but they belong in this panel and
 * not loose in the masthead, so the panel takes a slot rather than growing a
 * union of every site's knobs. Named for `AppLayout`'s `extraNavItems`
 * convention. Wrap each one in {@link AppearanceField} to match the built-ins.
 */
export function AppearanceControls({
  presets,
  extraControls,
}: {
  presets?: Preset[];
  extraControls?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <AppearanceField label="Theme">
        <ThemeToggle />
      </AppearanceField>
      <AppearanceField label="Preset">
        <PresetPicker className="w-full" presets={presets} />
      </AppearanceField>
      {extraControls}
    </div>
  );
}

/**
 * Desktop Appearance control: a single ghost icon button that opens a popover
 * holding {@link AppearanceControls}. Replaces the empty-looking preset select
 * and the triple theme toggle that used to sit loose in the masthead.
 */
export function AppearanceMenu({
  className,
  presets,
  extraControls,
}: {
  className?: string;
  presets?: Preset[];
  extraControls?: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Appearance"
          className={className}
        >
          <SlidersHorizontalIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <AppearanceControls presets={presets} extraControls={extraControls} />
      </PopoverContent>
    </Popover>
  );
}
