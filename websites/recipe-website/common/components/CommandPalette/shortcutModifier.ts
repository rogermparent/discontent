"use client";

import { useSyncExternalStore } from "react";

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
