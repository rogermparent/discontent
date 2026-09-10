"use client";

import { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { QueryClientProvider } from "recipe-website-common/context/QueryClientContext";
import { SearchProvider } from "../SearchForm/SearchContext";
import { BookmarksProvider } from "recipe-website-common/context/BookmarksContext";
import type { ColorMode } from "@discontent/component-library/theming";
import { ThemeVarsProvider } from "./ThemeVarsProvider";
import { CommandPalette } from "../CommandPalette";
import { StickyChromeSync } from "./useStickyChrome";

export function AppProviders({
  children,
  defaultMode = "system",
  isOwner = false,
  commandPaletteAuth,
}: {
  children: ReactNode;
  defaultMode?: ColorMode;
  /** Owner (signed-in editor) → the palette shows owner destinations. */
  isOwner?: boolean;
  /** Editor-injected Sign In/Out item for the palette (absent in export). */
  commandPaletteAuth?: ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={defaultMode}
      enableSystem
      disableTransitionOnChange
    >
      <ThemeVarsProvider>
        {/* Mounted here, not beside the toggle — see StickyChromeSync's
            docstring for the Radix-unmount reason. */}
        <StickyChromeSync />
        <QueryClientProvider>
          <SearchProvider>
            <BookmarksProvider>
              {/* Wraps the app so the header's PaletteTrigger can open it via
                  context; the dialog itself renders after `children`. */}
              <CommandPalette isOwner={isOwner} authAction={commandPaletteAuth}>
                {children}
              </CommandPalette>
            </BookmarksProvider>
          </SearchProvider>
        </QueryClientProvider>
      </ThemeVarsProvider>
    </ThemeProvider>
  );
}
