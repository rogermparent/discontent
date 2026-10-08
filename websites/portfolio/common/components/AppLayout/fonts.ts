import localFont from "next/font/local";
import type { FontPairingOption } from "@discontent/component-library/theming";

/*
 * Portfolio's font menu — the app-side half of the theming contract.
 *
 * next/font runs at build time, so every pairing a theme can select must be
 * loaded here; the theming engine only switches among them by pointing the
 * --ff-display/-body/-mono roles at a pairing's `--ff-{role}-{key}` variables
 * (see packages/component-library/theming/fonts.ts).
 *
 * The files are vendored latin subsets from Google Fonts (all OFL; see
 * fonts/OFL.txt), so a build never depends on fonts.gstatic.com. Variable
 * families are one file with a weight range (Fraunces keeps its SOFT, WONK
 * and opsz axes); DM Mono and IBM Plex Mono are static, one file per weight.
 *
 * These keys are portfolio's alone. The engine validates a key's *shape*, not
 * its membership in a shared list, which is what lets this site have its own
 * typefaces without recipe inheriting them (or vice versa).
 *
 * Roles: display = the index entries, set large; body = case-study prose;
 * mono = the year rail, counts, tags and eyebrow labels.
 */

// --- marginalia (default): Fraunces / Instrument Sans / DM Mono ---
// Fraunces is a warm, idiosyncratic old-style with SOFT and WONK axes — chosen
// against the high-contrast Didone that templated portfolio work reaches for.
const marginaliaDisplay = localFont({
  src: "./fonts/fraunces-latin.woff2",
  weight: "100 900",
  variable: "--ff-display-marginalia",
  display: "swap",
});
const marginaliaBody = localFont({
  src: "./fonts/instrument-sans-latin.woff2",
  weight: "400 700",
  variable: "--ff-body-marginalia",
  display: "swap",
});
const marginaliaMono = localFont({
  src: [
    { path: "./fonts/dm-mono-300-latin.woff2", weight: "300" },
    { path: "./fonts/dm-mono-400-latin.woff2", weight: "400" },
    { path: "./fonts/dm-mono-500-latin.woff2", weight: "500" },
  ],
  variable: "--ff-mono-marginalia",
  display: "swap",
});

// --- bricolage: all-sans, for someone whose work is the serif ---
const bricolageDisplay = localFont({
  src: "./fonts/bricolage-grotesque-latin.woff2",
  weight: "200 800",
  variable: "--ff-display-bricolage",
  display: "swap",
});
const bricolageBody = localFont({
  src: "./fonts/instrument-sans-latin.woff2",
  weight: "400 700",
  variable: "--ff-body-bricolage",
  display: "swap",
});
const bricolageMono = localFont({
  src: [
    { path: "./fonts/dm-mono-300-latin.woff2", weight: "300" },
    { path: "./fonts/dm-mono-400-latin.woff2", weight: "400" },
    { path: "./fonts/dm-mono-500-latin.woff2", weight: "500" },
  ],
  variable: "--ff-mono-bricolage",
  display: "swap",
});

// --- plain: quiet and unopinionated, for a fork that wants no personality ---
const plainDisplay = localFont({
  src: "./fonts/public-sans-latin.woff2",
  weight: "100 900",
  variable: "--ff-display-plain",
  display: "swap",
});
const plainBody = localFont({
  src: "./fonts/public-sans-latin.woff2",
  weight: "100 900",
  variable: "--ff-body-plain",
  display: "swap",
});
const plainMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-400-latin.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-mono-500-latin.woff2", weight: "500" },
  ],
  variable: "--ff-mono-plain",
  display: "swap",
});

interface LoadedPairing extends FontPairingOption {
  variables: [string, string, string];
}

/**
 * The labeled menu, in display order. Three real options, so the theme editor's
 * pairing picker is not a dead control.
 */
export const FONT_PAIRINGS: LoadedPairing[] = [
  {
    key: "marginalia",
    label: "Marginalia",
    variables: [
      marginaliaDisplay.variable,
      marginaliaBody.variable,
      marginaliaMono.variable,
    ],
  },
  {
    key: "bricolage",
    label: "Bricolage",
    variables: [
      bricolageDisplay.variable,
      bricolageBody.variable,
      bricolageMono.variable,
    ],
  },
  {
    key: "plain",
    label: "Plain",
    variables: [plainDisplay.variable, plainBody.variable, plainMono.variable],
  },
];

/**
 * Class list applying every pairing's font variables; goes on the <html>.
 * Derived from the menu so a pairing can't be offered without being loaded.
 */
export const fontVariables = FONT_PAIRINGS.flatMap((p) => p.variables).join(
  " ",
);

/**
 * Portfolio's default pairing. Note this is *not* the engine's
 * DEFAULT_FONT_PAIRING ("bench") — that key belongs to recipe and portfolio
 * never registers it, so a theme naming it degrades to system fonts.
 */
export const DEFAULT_PAIRING = "marginalia";
