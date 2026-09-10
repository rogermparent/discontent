import { ReactNode } from "react";
import { ThemeShell } from "portfolio-website-common/components/AppLayout/ThemeShell";
import { readSettings } from "@/settings";

/**
 * The editor's theming layer.
 *
 * This is not the old `(editor)/layout.tsx`, which rendered a footer nav on
 * every editor route — that nav is now the settings sidebar, and the new/edit
 * forms carry their own "Back to …" link.
 *
 * What it does instead is supply the theme context. `ThemeEditor` calls
 * `useThemeVars`, and the provider used to exist only inside the reader-facing
 * `(portfolio)` group — so the appearance page threw
 * "useThemeVars must be used within a ThemeVarsProvider" the moment it rendered.
 * Every editor route also wants the owner's tokens, not the stylesheet defaults.
 */
export default async function EditorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { theme } = await readSettings();
  return <ThemeShell theme={theme}>{children}</ThemeShell>;
}
