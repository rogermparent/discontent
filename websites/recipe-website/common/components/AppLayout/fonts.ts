import localFont from "next/font/local";
import type { FontPairingOption } from "@discontent/component-library/theming";

/*
 * Recipe's font menu — the app-side half of the theming contract.
 *
 * next/font runs at build time, so every pairing a theme can select must be
 * loaded *here*; the theming engine only switches among them by pointing the
 * --ff-display/-body/-mono roles at a pairing's suffixed vars (see
 * packages/component-library/theming/fonts.ts + derive.ts).
 *
 * The files are vendored latin subsets from Google Fonts (all OFL; see
 * fonts/OFL.txt). next/font/google fetched them at build time, so every
 * build, CI shard and Pi image depended on fonts.gstatic.com answering.
 * Variable families are one file with a weight range; IBM Plex Mono is
 * static, one file per weight.
 *
 * The menu used to live in the shared package, which made it a global
 * allow-list: another site's pairing key was silently rewritten to "bench" by
 * parseTheme, and adding that site's keys to the shared array would have left
 * recipe pointing at var()s no next/font call here ever registered. The keys are
 * now validated by shape and the labels live beside the loaders that make them
 * true.
 *
 * Roles: display = condensed grotesque (headings & labels); body = humanist sans
 * (prose & instructions); mono = tabular-figure mono (quantities/durations/
 * timeline times). The "bench" pairing is the Working Bench default; the base
 * binding in styles/theme.css points the roles at it so the no-theme path works.
 */

// --- bench (default): Archivo / Public Sans / Spline Sans Mono ---
const benchDisplay = localFont({
  src: "./fonts/archivo-latin.woff2",
  weight: "500 700",
  variable: "--ff-display-bench",
  display: "swap",
});
const benchBody = localFont({
  src: "./fonts/public-sans-latin.woff2",
  weight: "100 900",
  variable: "--ff-body-bench",
  display: "swap",
});
const benchMono = localFont({
  src: "./fonts/spline-sans-mono-latin.woff2",
  weight: "300 700",
  variable: "--ff-mono-bench",
  display: "swap",
});

// --- grotesk: Space Grotesk / Inter / JetBrains Mono ---
const groteskDisplay = localFont({
  src: "./fonts/space-grotesk-latin.woff2",
  weight: "500 700",
  variable: "--ff-display-grotesk",
  display: "swap",
});
const groteskBody = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
  variable: "--ff-body-grotesk",
  display: "swap",
});
const groteskMono = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  weight: "100 800",
  variable: "--ff-mono-grotesk",
  display: "swap",
});

// --- slab: Bitter / Source Sans 3 / IBM Plex Mono ---
const slabDisplay = localFont({
  src: "./fonts/bitter-latin.woff2",
  weight: "500 700",
  variable: "--ff-display-slab",
  display: "swap",
});
const slabBody = localFont({
  src: "./fonts/source-sans-3-latin.woff2",
  weight: "200 900",
  variable: "--ff-body-slab",
  display: "swap",
});
const slabMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-400-latin.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-mono-500-latin.woff2", weight: "500" },
  ],
  variable: "--ff-mono-slab",
  display: "swap",
});

/**
 * A menu entry plus the loaders that back it. `variable` strings must stay
 * literals — next/font is a compile-time transform and can't read a computed
 * option — so the convention is re-checked below rather than interpolated.
 */
interface LoadedPairing extends FontPairingOption {
  variables: [string, string, string];
}

/** The labeled menu, in display order. Rendered by ThemeEditor's font select. */
export const FONT_PAIRINGS: LoadedPairing[] = [
  {
    key: "bench",
    label: "Working Bench",
    variables: [benchDisplay.variable, benchBody.variable, benchMono.variable],
  },
  {
    key: "grotesk",
    label: "Modern Grotesk",
    variables: [
      groteskDisplay.variable,
      groteskBody.variable,
      groteskMono.variable,
    ],
  },
  {
    key: "slab",
    label: "Editorial Slab",
    variables: [slabDisplay.variable, slabBody.variable, slabMono.variable],
  },
];

/**
 * Class list applying every pairing's font variables; put on the <html>.
 * Derived from the menu so a pairing can't be offered without being loaded.
 */
export const fontVariables = FONT_PAIRINGS.flatMap((p) => p.variables).join(
  " ",
);

/*
 * No runtime check ties a `variable:` literal back to fontPairingVars(key):
 * next/font returns a hashed class name (`__variable_1e4310`), not the custom
 * property it defines, so there is nothing to compare. The convention is
 * enforced by review — keep each pairing's three literals spelled
 * `--ff-{display,body,mono}-{key}`.
 */
