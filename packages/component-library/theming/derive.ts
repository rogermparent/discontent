/*
 * Theme → concrete OKLCH tokens for light and dark.
 *
 * Everything here rides the contrast curve fixed in PR 1: the accent's lightness
 * and chroma are constant (light --primary L≈0.53, dark L≈0.70) and only the
 * *hue* moves, so any accent choice keeps its ~4.5:1 against its foreground. The
 * neutral family only shifts hue/chroma at fixed lightnesses, so backgrounds and
 * text keep their contrast too. That's the guarantee the accessibility suite
 * leans on — change these lightnesses and you must re-check WCAG in both modes.
 *
 * derive() returns a *partial* token map per mode: only the tokens a knob owns.
 * Un-owned tokens (destructive, chart-*) fall through to styles/theme.css.
 */

import { fontPairingVars } from "./fonts";
import type { DerivedTheme, NeutralKey, Theme, TokenMap } from "./types";

/** Format an OKLCH triple, trimming float noise. */
function ok(l: number, c: number, h: number): string {
  const n = (x: number) => String(Number(x.toFixed(4)));
  return `oklch(${n(l)} ${n(c)} ${n(h)})`;
}

/** Wrap a raw hue into [0, 360). */
export function normalizeHue(hue: number): number {
  const h = hue % 360;
  return h < 0 ? h + 360 : h;
}

interface NeutralSpec {
  /** Hue for backgrounds/cards/text/borders. */
  mainHue: number;
  /** Hue for secondary/muted (bench pairs a cool steel against warm paper). */
  secondaryHue: number;
  /** Chroma scale: 1 = full bench saturation, 0 = true gray. */
  chroma: number;
}

const NEUTRALS: Record<NeutralKey, NeutralSpec> = {
  warm: { mainHue: 78, secondaryHue: 250, chroma: 1 },
  cool: { mainHue: 255, secondaryHue: 255, chroma: 1 },
  gray: { mainHue: 0, secondaryHue: 0, chroma: 0 },
};

/** Neutral (bench) tokens for one mode, from a neutral family. */
function deriveNeutral(spec: NeutralSpec, mode: "light" | "dark"): TokenMap {
  const { mainHue: h, secondaryHue: sh, chroma: s } = spec;
  if (mode === "light") {
    return {
      "--background": ok(0.98, 0.006 * s, h),
      "--foreground": ok(0.22, 0.02 * s, h),
      "--card": ok(1, 0.002 * s, h),
      "--card-foreground": ok(0.22, 0.02 * s, h),
      "--popover": ok(1, 0.002 * s, h),
      "--popover-foreground": ok(0.22, 0.02 * s, h),
      "--secondary": ok(0.94, 0.008 * s, sh),
      "--secondary-foreground": ok(0.3, 0.03 * s, sh),
      "--muted": ok(0.955, 0.006 * s, sh),
      "--muted-foreground": ok(0.5, 0.02 * s, sh),
      "--border": ok(0.9, 0.008 * s, h),
      "--input": ok(0.9, 0.008 * s, h),
      "--sidebar": ok(0.985, 0.005 * s, h),
      "--sidebar-foreground": ok(0.22, 0.02 * s, h),
      "--sidebar-border": ok(0.9, 0.008 * s, h),
    };
  }
  return {
    "--background": ok(0.185, 0.008 * s, h),
    "--foreground": ok(0.96, 0.006 * s, h),
    "--card": ok(0.225, 0.009 * s, h),
    "--card-foreground": ok(0.96, 0.006 * s, h),
    "--popover": ok(0.225, 0.009 * s, h),
    "--popover-foreground": ok(0.96, 0.006 * s, h),
    "--secondary": ok(0.27, 0.01 * s, sh),
    "--secondary-foreground": ok(0.92, 0.006 * s, h),
    "--muted": ok(0.27, 0.008 * s, sh),
    "--muted-foreground": ok(0.7, 0.02 * s, sh),
    // Translucent hairlines read better than opaque ones on dark; kept constant.
    "--border": "oklch(1 0 0 / 12%)",
    "--input": "oklch(1 0 0 / 15%)",
    "--sidebar": ok(0.225, 0.009 * s, h),
    "--sidebar-foreground": ok(0.96, 0.006 * s, h),
    "--sidebar-border": "oklch(1 0 0 / 12%)",
  };
}

/** Accent tokens for one mode, from a hue. L/C are fixed by the contrast curve. */
function deriveAccent(hue: number, mode: "light" | "dark"): TokenMap {
  const h = normalizeHue(hue);
  if (mode === "light") {
    const primary = ok(0.53, 0.16, h);
    const primaryFg = ok(0.99, 0.01, 85); // warm near-white, constant
    const ring = ok(0.58, 0.13, h);
    const accent = ok(0.95, 0.03, h);
    const accentFg = ok(0.3, 0.04, h);
    return {
      "--primary": primary,
      "--primary-foreground": primaryFg,
      "--ring": ring,
      "--accent": accent,
      "--accent-foreground": accentFg,
      "--sidebar-primary": primary,
      "--sidebar-primary-foreground": primaryFg,
      "--sidebar-accent": accent,
      "--sidebar-accent-foreground": accentFg,
      "--sidebar-ring": ring,
    };
  }
  const primary = ok(0.7, 0.16, h);
  const primaryFg = ok(0.2, 0.03, h);
  const ring = ok(0.7, 0.14, h);
  const accent = ok(0.32, 0.035, h);
  const accentFg = ok(0.95, 0.01, 85); // near-white, constant
  return {
    "--primary": primary,
    "--primary-foreground": primaryFg,
    "--ring": ring,
    "--accent": accent,
    "--accent-foreground": accentFg,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": primaryFg,
    "--sidebar-accent": accent,
    "--sidebar-accent-foreground": accentFg,
    "--sidebar-ring": ring,
  };
}

/**
 * Font-role overrides pointing at the pairing's variables.
 *
 * Each `var()` carries a `--ff-{role}-fallback` fallback (declared in
 * styles/theme.css) so a key this app never registered degrades to system fonts.
 * Without it an unregistered key makes the whole --font-display chain
 * invalid-at-computed-value and headings drop to the browser default — the
 * failure mode that used to force every site to share one font menu.
 */
function deriveFonts(fontPairing: string): TokenMap {
  const v = fontPairingVars(fontPairing);
  return {
    "--ff-display": `var(${v.display}, var(--ff-display-fallback))`,
    "--ff-body": `var(${v.body}, var(--ff-body-fallback))`,
    "--ff-mono": `var(${v.mono}, var(--ff-mono-fallback))`,
  };
}

function deriveMode(theme: Theme, mode: "light" | "dark"): TokenMap {
  const neutral = NEUTRALS[theme.neutral] ?? NEUTRALS.warm;
  return {
    ...deriveNeutral(neutral, mode),
    ...deriveAccent(theme.accentHue, mode),
    ...deriveFonts(theme.fontPairing),
    "--radius": `${theme.radius}rem`,
  };
}

/** Derive a theme into concrete light + dark token maps. */
export function deriveTheme(theme: Theme): DerivedTheme {
  return {
    light: deriveMode(theme, "light"),
    dark: deriveMode(theme, "dark"),
  };
}
