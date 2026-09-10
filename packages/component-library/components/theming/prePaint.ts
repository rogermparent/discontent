import {
  THEME_VARS_STORAGE_KEY,
  MODE_STORAGE_KEY,
  type ColorMode,
} from "@discontent/component-library/theming";

/**
 * Blocking pre-paint script: mirror ThemeVarsProvider before first paint so a
 * visitor's saved theme override applies without a flash. Reads the resolved
 * {light,dark} var maps and the next-themes mode from localStorage, then sets
 * the resolved mode's tokens as inline CSS vars on <html> (inline beats the SSR
 * <style> default and the .dark class). No override → does nothing, and the
 * site-default <style> shows through.
 *
 * Returns source to inline in a <script>, so it must stay dependency-free and
 * swallow every error: it runs before hydration, and a throw here would block
 * paint on a page that would otherwise render fine with the default theme.
 */
export function themePrePaintScript(defaultMode: ColorMode): string {
  return `(function(){try{var raw=localStorage.getItem(${JSON.stringify(
    THEME_VARS_STORAGE_KEY,
  )});if(!raw)return;var maps=JSON.parse(raw);var mode=localStorage.getItem(${JSON.stringify(
    MODE_STORAGE_KEY,
  )})||${JSON.stringify(
    defaultMode,
  )};if(mode==="system"){mode=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}var map=maps[mode==="dark"?"dark":"light"];if(!map)return;var el=document.documentElement;for(var k in map){el.style.setProperty(k,map[k]);}}catch(e){}})();`;
}
