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
 * The masthead's Search affordance: a trigger for the ⌘K command palette
 * rather than a link to `/search` (which the palette's "Go to" still reaches).
 * Usable with no keyboard — it's a tap target; the shortcut chip is
 * decoration.
 *
 * - `field` — the desktop masthead (usability pass, U2): drawn as a search
 *   field, "Search N recipes" with the shortcut at its end, so a reader who
 *   has never heard of ⌘K still sees where search is. Below `lg` it narrows
 *   to its magnifier, and the accessible name stays the same.
 * - `icon` — the phone masthead, beside the menu button.
 *
 * `count` is the corpus size the masthead read on the server; without it
 * the field just says "Search recipes".
 */
export function PaletteTrigger({
  variant = "field",
  count,
  className,
}: {
  variant?: "field" | "icon";
  count?: number;
  className?: string;
}) {
  const { openPalette } = useCommandPalette();
  const modifier = useShortcutModifier();
  const label =
    count === undefined ? "Search recipes" : `Search ${count} recipes`;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={openPalette}
        aria-label={label}
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-md hover:bg-accent hover:text-primary",
          className,
        )}
      >
        <SearchIcon className="size-5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openPalette}
      aria-label={label}
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground shadow-xs transition-colors hover:border-ring hover:text-foreground lg:w-64",
        className,
      )}
    >
      <SearchIcon className="size-4 shrink-0" />
      <span className="hidden truncate lg:inline">
        {count === undefined ? (
          "Search recipes"
        ) : (
          <>
            Search <span className="font-mono tabular-nums">{count}</span>{" "}
            recipes
          </>
        )}
      </span>
      <kbd
        aria-hidden
        data-testid="palette-shortcut-hint"
        className="ml-auto hidden rounded border border-border px-1 font-mono text-[0.7rem] leading-normal lg:inline"
      >
        {modifier}K
      </kbd>
    </button>
  );
}
