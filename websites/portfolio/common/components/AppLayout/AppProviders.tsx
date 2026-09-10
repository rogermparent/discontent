"use client";

import { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import type { ColorMode } from "@discontent/component-library/theming";
import { ThemeVarsProvider } from "@discontent/component-library/components/theming/ThemeVarsProvider";

/**
 * Client providers. Deliberately thin compared to recipe's — portfolio has no
 * react-query, no bookmarks, and (by decision) no FlexSearch/IndexedDB search
 * stack. `disableTransitionOnChange` keeps the mode flip from animating every
 * transition on the page at once.
 */
export function AppProviders({
  children,
  defaultMode = "system",
}: {
  children: ReactNode;
  defaultMode?: ColorMode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={defaultMode}
      enableSystem
      disableTransitionOnChange
    >
      <ThemeVarsProvider>{children}</ThemeVarsProvider>
    </ThemeProvider>
  );
}
