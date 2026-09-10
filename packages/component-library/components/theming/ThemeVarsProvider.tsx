"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";
import {
  parseTheme,
  resolveThemeVarMaps,
  THEME_STORAGE_KEY,
  THEME_VARS_STORAGE_KEY,
  type DerivedTheme,
  type Theme,
} from "@discontent/component-library/theming";

/*
 * Per-visitor theme override + live preview.
 *
 * The site default is injected flash-free by AppLayout (SSR <style> + a pre-paint
 * script). This provider layers a *visitor* override on top: it reads the saved
 * Theme from localStorage and, keyed on next-themes' resolvedTheme, applies that
 * mode's token values as inline CSS vars on <html>. Inline vars beat any
 * stylesheet rule (including the .dark class), so one map works for both modes
 * and re-applies when the mode flips. The pre-paint script in AppLayout mirrors
 * this before first paint so there's no flash.
 *
 * The editor's ThemeEditor and the header PresetPicker call previewTheme() to
 * preview instantly across the real UI (it also persists to localStorage).
 */

interface ThemeVarsContextValue {
  /** Apply + persist a visitor theme override; null clears it. */
  previewTheme: (theme: Theme | null) => void;
  /** The visitor's current override knobs, if any. */
  userTheme: Theme | null;
}

const ThemeVarsContext = createContext<ThemeVarsContextValue | null>(null);

function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw ? parseTheme(raw) : null;
  } catch {
    return null;
  }
}

export function ThemeVarsProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [userTheme, setUserTheme] = useState<Theme | null>(() =>
    readStoredTheme(),
  );
  // Keys we last wrote, so we can clear them cleanly when the override changes.
  const appliedKeys = useRef<string[]>([]);

  const maps: DerivedTheme | null = useMemo(
    () => (userTheme ? resolveThemeVarMaps(userTheme) : null),
    [userTheme],
  );

  useEffect(() => {
    const el = document.documentElement;
    for (const key of appliedKeys.current) el.style.removeProperty(key);
    appliedKeys.current = [];
    if (!maps) return;
    const mode = resolvedTheme === "dark" ? "dark" : "light";
    const entries = Object.entries(maps[mode]);
    for (const [key, value] of entries) {
      el.style.setProperty(key, value);
      appliedKeys.current.push(key);
    }
  }, [maps, resolvedTheme]);

  const previewTheme = useCallback((theme: Theme | null) => {
    setUserTheme(theme);
    try {
      if (theme) {
        window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
        window.localStorage.setItem(
          THEME_VARS_STORAGE_KEY,
          JSON.stringify(resolveThemeVarMaps(theme)),
        );
      } else {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
        window.localStorage.removeItem(THEME_VARS_STORAGE_KEY);
      }
    } catch {
      // localStorage unavailable (private mode etc.) — preview still applies.
    }
  }, []);

  const value = useMemo(
    () => ({ previewTheme, userTheme }),
    [previewTheme, userTheme],
  );

  return (
    <ThemeVarsContext.Provider value={value}>
      {children}
    </ThemeVarsContext.Provider>
  );
}

export function useThemeVars(): ThemeVarsContextValue {
  const ctx = useContext(ThemeVarsContext);
  if (!ctx) {
    throw new Error("useThemeVars must be used within a ThemeVarsProvider");
  }
  return ctx;
}
