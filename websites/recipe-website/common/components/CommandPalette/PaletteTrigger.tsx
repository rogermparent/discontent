"use client";

import { useSyncExternalStore } from "react";
import { SearchIcon } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import { useCommandPalette } from ".";

// --- platform-aware shortcut hint ---
// The palette's own handler accepts `metaKey || ctrlKey`, so the chip has to say
// which one *this* machine uses; it hardcoded ⌘ and lied to every Linux/Windows
// reader. Read through useSyncExternalStore rather than an effect: the server
// snapshot renders during hydration (no mismatch) and React re-reads the client
// snapshot right after, with no setState in an effect body to trip
// eslint-plugin-react-hooks@7's `set-state-in-effect`.

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

/** "⌘" on Apple platforms, "Ctrl+" everywhere else. */
export function useShortcutModifier(): string {
  return useSyncExternalStore(
    subscribePlatform,
    getModifierSnapshot,
    getModifierServerSnapshot,
  );
}

/**
 * The masthead's Search affordance, now a trigger for the ⌘K command palette
 * rather than a plain link to `/search`. Usable with no keyboard (it's a tap
 * target); the ⌘K hint chip is desktop-only decoration.
 *
 * - `desktop` — inline in the header's right cluster, with a `⌘K` hint.
 * - `mobile` — full-width row in the nav `Sheet`, no hint. Pass `onNavigate` to
 *   close the sheet first, so the palette dialog doesn't stack atop the sheet's.
 */
export function PaletteTrigger({
  variant = "desktop",
  onNavigate,
  className,
}: {
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
  className?: string;
}) {
  const { openPalette } = useCommandPalette();
  const modifier = useShortcutModifier();

  const handleClick = () => {
    onNavigate?.();
    openPalette();
  };

  if (variant === "mobile") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "flex items-center gap-1.5 rounded-md p-2 text-left hover:text-primary",
          className,
        )}
      >
        <SearchIcon className="size-4 shrink-0" />
        Search
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 font-medium hover:text-primary",
        className,
      )}
    >
      <SearchIcon className="size-4 shrink-0" />
      Search
      <kbd
        aria-hidden
        data-testid="palette-shortcut-hint"
        className="ml-1 rounded border border-border px-1 font-mono text-[0.7rem] leading-normal text-muted-foreground"
      >
        {modifier}K
      </kbd>
    </button>
  );
}
