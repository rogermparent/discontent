import type { Preset, Theme } from "@discontent/component-library/theming";

/*
 * Portfolio's palette presets.
 *
 * Every one of these rides the derivation curve in theming/derive.ts, where the
 * accent's lightness and chroma are fixed and only the *hue* moves. That is why
 * a preset here is four numbers and not a token dump: any hue on the curve keeps
 * its ~4.5:1 contrast in both modes, so these are WCAG AA by construction.
 *
 * The alternates are the accents that were considered and rejected as the
 * default — kept because they are the honest set of options for a fork, not
 * decoration.
 */

/**
 * The default. The accent is an *annotation* colour — the reader's mark in the
 * margin — which sets a hard usage rule the components must respect: accent
 * appears only on marks (current row, search match, focus ring, wordmark square)
 * and **never as a large fill**.
 *
 * Cool paper against a deep madder is deliberately distant from both the
 * templated cream/serif/terracotta look and the near-black/acid-accent look.
 * radius 0.25 softens the catalog geometry without going to zero — zero-radius
 * belongs to the broadsheet default being avoided.
 */
export const MARGINALIA: Theme = {
  accentHue: 335, // madder
  neutral: "cool",
  radius: 0.25,
  fontPairing: "marginalia",
  defaultMode: "system",
};

export const PORTFOLIO_PRESETS: Preset[] = [
  { key: "marginalia", label: "Marginalia", theme: MARGINALIA },
  {
    key: "stamp",
    label: "Stamp",
    theme: {
      accentHue: 15, // vermilion
      neutral: "cool",
      radius: 0.25,
      fontPairing: "marginalia",
      defaultMode: "system",
    },
  },
  {
    key: "oxide",
    label: "Oxide",
    theme: {
      accentHue: 195, // verdigris
      neutral: "gray",
      radius: 0.25,
      fontPairing: "bricolage",
      defaultMode: "system",
    },
  },
  {
    key: "botanical",
    label: "Botanical",
    theme: {
      accentHue: 145, // leaf
      neutral: "warm",
      radius: 0.5,
      fontPairing: "plain",
      defaultMode: "system",
    },
  },
];

export const DEFAULT_PORTFOLIO_PRESET = "marginalia";
