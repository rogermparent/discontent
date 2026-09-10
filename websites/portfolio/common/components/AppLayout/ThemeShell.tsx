import { ReactNode } from "react";
import {
  serializeThemeCss,
  type Theme,
} from "@discontent/component-library/theming";
import { themePrePaintScript } from "@discontent/component-library/components/theming/prePaint";
import { getSiteTheme } from "../../config/site";
import { AppProviders } from "./AppProviders";

/**
 * The theming layer, without any chrome.
 *
 * Factored out of AppLayout because the *editor* routes need it too and must
 * not have a masthead: they are the settings area and the edit forms, which
 * render inside their own sidebar. Before this, the editor's theme pages threw
 * outright — `ThemeEditor` calls `useThemeVars`, and the provider only existed
 * inside the reader-facing `(portfolio)` group.
 *
 * The theme is injected twice on purpose: an SSR <style> carrying the owner's
 * default so the first paint is already correct, and a blocking pre-paint script
 * that applies a *visitor's* saved override before paint. Without the script the
 * page paints the owner's theme and then flips.
 */
export function ThemeShell({
  children,
  theme: themeOverride,
}: {
  children: ReactNode;
  theme?: Theme;
}) {
  const theme: Theme = themeOverride ?? getSiteTheme();
  const defaultMode = theme.defaultMode ?? "system";

  return (
    <>
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: serializeThemeCss(theme) }}
      />
      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: themePrePaintScript(defaultMode) }}
      />
      <AppProviders defaultMode={defaultMode}>{children}</AppProviders>
    </>
  );
}

export default ThemeShell;
