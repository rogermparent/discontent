"use client";

import { useSyncExternalStore } from "react";
import { SearchIcon } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import { useCommandPalette } from ".";

/** Nothing to subscribe to — the platform can't change mid-session. */
const subscribePlatform = () => () => {};

function getModifierSnapshot(): string {
  // Both `platform` and the UA are consulted: `navigator.platform` is deprecated
  // (and absent under some privacy shields), while the UA is what a Playwright
  // `userAgent` override can actually reach.
  const haystack = `${navigator.platform ?? ""} ${navigator.userAgent}`;
  return /mac|iphone|ipad|ipod/i.test(haystack) ? "⌘" : "Ctrl+";
}

/** Apple's ⌘ is the safe pre-hydration guess: it's also the narrower chip. */
const getModifierServerSnapshot = () => "⌘";

/**
 * "⌘" on Apple platforms, "Ctrl+" everywhere else.
 *
 * Read through `useSyncExternalStore` rather than an effect: the server snapshot
 * renders during hydration (no mismatch) and React re-reads the client snapshot
 * immediately after, with no setState in an effect body.
 */
export function useShortcutModifier(): string {
  return useSyncExternalStore(
    subscribePlatform,
    getModifierSnapshot,
    getModifierServerSnapshot,
  );
}

/**
 * The masthead's palette trigger.
 *
 * A real button, not decoration: the shortcut is an accelerator, so the palette
 * has to be reachable by tap and by keyboard-without-shortcuts too. The hint
 * chip says which modifier *this* machine uses rather than hardcoding ⌘ and
 * lying to every Linux and Windows reader.
 */
export function PaletteTrigger({ className }: { className?: string }) {
  const { openPalette } = useCommandPalette();
  const modifier = useShortcutModifier();

  return (
    <button
      type="button"
      onClick={openPalette}
      aria-keyshortcuts="Meta+K Control+K"
      aria-label="Search works"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <SearchIcon className="size-3.5 shrink-0" />
      <kbd
        aria-hidden
        data-testid="palette-shortcut-hint"
        className="rounded border border-border px-1 font-mono text-[0.7rem] leading-normal normal-case"
      >
        {modifier}K
      </kbd>
    </button>
  );
}
