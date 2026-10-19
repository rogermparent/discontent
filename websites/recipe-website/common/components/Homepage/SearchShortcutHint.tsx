"use client";

import { useShortcutModifier } from "../CommandPalette/PaletteTrigger";

/**
 * The palette's shortcut at the end of the homepage search field — the
 * masthead chip's text (`⌘K` on Apple platforms, `Ctrl+K` elsewhere), drawn
 * as generated content for the same reason (41f: no stray words in an
 * accessible name) and hidden from assistive technology: the shortcut is
 * decoration here, and the field's label says what it is. Hidden on a phone,
 * which has no keyboard to press it on.
 */
export function SearchShortcutHint() {
  const modifier = useShortcutModifier();
  return (
    <kbd
      aria-hidden
      data-testid="home-search-shortcut"
      data-shortcut={`${modifier}K`}
      className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 rounded border border-border px-1.5 font-mono text-xs leading-normal text-muted-foreground before:content-[attr(data-shortcut)] sm:inline"
    />
  );
}

export default SearchShortcutHint;
