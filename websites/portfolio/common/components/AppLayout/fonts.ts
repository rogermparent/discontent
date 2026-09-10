import {
  Fraunces,
  Instrument_Sans,
  DM_Mono,
  Bricolage_Grotesque,
  Public_Sans,
  IBM_Plex_Mono,
} from "next/font/google";
import type { FontPairingOption } from "@discontent/component-library/theming";

/*
 * Portfolio's font menu — the app-side half of the theming contract.
 *
 * next/font runs at build time, so every pairing a theme can select must be
 * loaded here; the theming engine only switches among them by pointing the
 * --ff-display/-body/-mono roles at a pairing's `--ff-{role}-{key}` variables
 * (see packages/component-library/theming/fonts.ts).
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
const marginaliaDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--ff-display-marginalia",
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});
const marginaliaBody = Instrument_Sans({
  subsets: ["latin"],
  variable: "--ff-body-marginalia",
  display: "swap",
});
const marginaliaMono = DM_Mono({
  subsets: ["latin"],
  variable: "--ff-mono-marginalia",
  weight: ["300", "400", "500"],
  display: "swap",
});

// --- bricolage: all-sans, for someone whose work is the serif ---
const bricolageDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--ff-display-bricolage",
  display: "swap",
});
const bricolageBody = Instrument_Sans({
  subsets: ["latin"],
  variable: "--ff-body-bricolage",
  display: "swap",
});
const bricolageMono = DM_Mono({
  subsets: ["latin"],
  variable: "--ff-mono-bricolage",
  weight: ["300", "400", "500"],
  display: "swap",
});

// --- plain: quiet and unopinionated, for a fork that wants no personality ---
const plainDisplay = Public_Sans({
  subsets: ["latin"],
  variable: "--ff-display-plain",
  display: "swap",
});
const plainBody = Public_Sans({
  subsets: ["latin"],
  variable: "--ff-body-plain",
  display: "swap",
});
const plainMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--ff-mono-plain",
  weight: ["400", "500"],
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
