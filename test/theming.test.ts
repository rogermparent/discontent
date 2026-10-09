import { describe, expect, it } from "vitest";
import {
  DEFAULT_FONT_PAIRING,
  deriveTheme,
  fontPairingVars,
  getPreset,
  isFontPairingKey,
  parseTheme,
  PRESETS,
  WORKING_BENCH,
  type Preset,
} from "@discontent/component-library/theming";
import { contrastRatio } from "@discontent/component-library/theming/contrast";

/*
 * The multi-site font contract (PR 01a of the portfolio rebuild).
 *
 * These pin the behaviour that lets two sites in this monorepo have different
 * typefaces while sharing one theming engine. The old design used a single
 * global FONT_PAIRINGS allow-list, and parseTheme treated an unknown key as
 * invalid — silently rewriting it to "bench". Since parseTheme runs on both the
 * settings-save path and the SITE_THEME export-bake path, a site with its own
 * typefaces would have shipped someone else's.
 */

describe("isFontPairingKey", () => {
  it("accepts conservative slugs", () => {
    expect(isFontPairingKey("bench")).toBe(true);
    expect(isFontPairingKey("marginalia")).toBe(true);
    expect(isFontPairingKey("a-b-2")).toBe(true);
  });

  it("rejects anything that could smuggle syntax into a var() name", () => {
    // These matter: the key is interpolated into `var(--ff-display-${key})`.
    expect(isFontPairingKey("bench)")).toBe(false);
    expect(isFontPairingKey("a b")).toBe(false);
    expect(isFontPairingKey("--evil")).toBe(false);
    expect(isFontPairingKey("Bench")).toBe(false);
    expect(isFontPairingKey("2bench")).toBe(false);
    expect(isFontPairingKey("")).toBe(false);
    expect(isFontPairingKey("x".repeat(33))).toBe(false);
    expect(isFontPairingKey(undefined)).toBe(false);
    expect(isFontPairingKey(42)).toBe(false);
  });
});

describe("fontPairingVars", () => {
  it("derives the --ff-{role}-{key} names by convention", () => {
    expect(fontPairingVars("marginalia")).toEqual({
      display: "--ff-display-marginalia",
      body: "--ff-body-marginalia",
      mono: "--ff-mono-marginalia",
    });
  });

  it("falls back to the default pairing for a malformed key", () => {
    expect(fontPairingVars("nope!").display).toBe(
      `--ff-display-${DEFAULT_FONT_PAIRING}`,
    );
  });
});

describe("parseTheme", () => {
  const base = { accentHue: 335, neutral: "cool", radius: 0.25 };

  it("preserves a well-formed pairing key this app never registered", () => {
    // The regression the whole PR exists to prevent.
    const theme = parseTheme({ ...base, fontPairing: "marginalia" });
    expect(theme?.fontPairing).toBe("marginalia");
  });

  it("coerces a malformed pairing key to the default", () => {
    expect(parseTheme({ ...base, fontPairing: "not a key" })?.fontPairing).toBe(
      DEFAULT_FONT_PAIRING,
    );
    expect(parseTheme({ ...base, fontPairing: 7 })?.fontPairing).toBe(
      DEFAULT_FONT_PAIRING,
    );
  });

  it("still rejects unusable input outright", () => {
    expect(parseTheme(null)).toBeNull();
    expect(parseTheme("not json")).toBeNull();
    expect(parseTheme({ ...base, neutral: "chartreuse" })).toBeNull();
  });

  it("round-trips through a JSON string, as the export bake does", () => {
    const theme = parseTheme(
      JSON.stringify({ ...base, fontPairing: "marginalia" }),
    );
    expect(theme?.fontPairing).toBe("marginalia");
    expect(theme?.accentHue).toBe(335);
  });
});

describe("deriveTheme fonts", () => {
  it("gives every font role a system fallback", () => {
    // Without the fallback an unregistered key makes the --font-display chain
    // invalid-at-computed-value and headings drop to the browser default.
    const { light } = deriveTheme({
      ...WORKING_BENCH,
      fontPairing: "marginalia",
    });
    expect(light["--ff-display"]).toBe(
      "var(--ff-display-marginalia, var(--ff-display-fallback))",
    );
    expect(light["--ff-body"]).toBe(
      "var(--ff-body-marginalia, var(--ff-body-fallback))",
    );
    expect(light["--ff-mono"]).toBe(
      "var(--ff-mono-marginalia, var(--ff-mono-fallback))",
    );
  });
});

describe("getPreset", () => {
  const sitePresets: Preset[] = [
    { key: "marginalia", label: "Marginalia", theme: WORKING_BENCH },
    { key: "stamp", label: "Stamp", theme: WORKING_BENCH },
  ];

  it("defaults to the built-in list", () => {
    expect(getPreset("cool-steel").key).toBe("cool-steel");
    expect(getPreset(PRESETS[0].key).key).toBe(PRESETS[0].key);
  });

  it("resolves against a site's own list when given one", () => {
    expect(getPreset("stamp", sitePresets).key).toBe("stamp");
  });

  it("falls back within the supplied list, not the built-ins", () => {
    // A site list has no "working-bench", so an unknown key must land on that
    // list's first entry — never on a preset the picker never rendered.
    expect(getPreset("no-such-key", sitePresets).key).toBe("marginalia");
  });
});

/*
 * Accent contrast across every hue (epic 30b).
 *
 * The derivation promises any accent hue stays WCAG AA against its foreground,
 * and until 30b nothing checked that outside the handful of hues the axe
 * suite renders: the light --primary fell to ~4.31:1 in the cyan/teal band,
 * where portfolio's shipped "oxide" preset (hue 195) sits. These sweep all 360
 * integer hues, in both modes and over every neutral, with the same WCAG maths
 * axe applies.
 */
describe("accent contrast", () => {
  const HUES = Array.from({ length: 360 }, (_, hue) => hue);
  const NEUTRALS = ["warm", "cool", "gray"] as const;
  const themeAt = (accentHue: number, neutral: (typeof NEUTRALS)[number]) =>
    deriveTheme({ ...WORKING_BENCH, accentHue, neutral });

  /** The hues (as a list) where a token pair falls under `min`. */
  function failing(
    pick: (tokens: Record<string, string>) => [string, string],
    mode: "light" | "dark",
    min: number,
  ): string[] {
    const failures: string[] = [];
    for (const neutral of NEUTRALS) {
      for (const hue of HUES) {
        const [fg, bg] = pick(themeAt(hue, neutral)[mode]);
        const ratio = contrastRatio(fg, bg);
        if (ratio < min)
          failures.push(`${neutral}@${hue}: ${ratio.toFixed(2)}`);
      }
    }
    return failures;
  }

  for (const mode of ["light", "dark"] as const) {
    it(`keeps --primary-foreground on --primary at AA in ${mode} mode`, () => {
      expect(
        failing((t) => [t["--primary-foreground"], t["--primary"]], mode, 4.5),
      ).toEqual([]);
    });

    it(`keeps --accent-foreground on --accent at AA in ${mode} mode`, () => {
      expect(
        failing((t) => [t["--accent-foreground"], t["--accent"]], mode, 4.5),
      ).toEqual([]);
    });

    /* Non-text contrast (1.4.11): the focus ring against the page. */
    it(`keeps --ring at 3:1 against --background in ${mode} mode`, () => {
      expect(failing((t) => [t["--ring"], t["--background"]], mode, 3)).toEqual(
        [],
      );
    });
  }

  it("fixes the band with margin: every light --primary reaches 4.6:1", () => {
    expect(
      failing((t) => [t["--primary-foreground"], t["--primary"]], "light", 4.6),
    ).toEqual([]);
  });

  /*
   * The band moves nothing else. Hue 50 is the default (Working Bench) and
   * mirrored in the static `styles/theme.css`, and every recipe visual
   * baseline renders it — so its accent tokens are pinned byte for byte.
   */
  it("leaves the default hue's accent tokens exactly as they were", () => {
    const { light, dark } = deriveTheme(WORKING_BENCH);
    const accentKeys = [
      "--primary",
      "--primary-foreground",
      "--ring",
      "--accent",
      "--accent-foreground",
      "--sidebar-primary",
      "--sidebar-primary-foreground",
      "--sidebar-accent",
      "--sidebar-accent-foreground",
      "--sidebar-ring",
    ];
    const pick = (tokens: Record<string, string>) =>
      Object.fromEntries(accentKeys.map((key) => [key, tokens[key]]));
    expect(pick(light)).toEqual({
      "--primary": "oklch(0.53 0.16 50)",
      "--primary-foreground": "oklch(0.99 0.01 85)",
      "--ring": "oklch(0.58 0.13 50)",
      "--accent": "oklch(0.95 0.03 50)",
      "--accent-foreground": "oklch(0.3 0.04 50)",
      "--sidebar-primary": "oklch(0.53 0.16 50)",
      "--sidebar-primary-foreground": "oklch(0.99 0.01 85)",
      "--sidebar-accent": "oklch(0.95 0.03 50)",
      "--sidebar-accent-foreground": "oklch(0.3 0.04 50)",
      "--sidebar-ring": "oklch(0.58 0.13 50)",
    });
    expect(pick(dark)).toEqual({
      "--primary": "oklch(0.7 0.16 50)",
      "--primary-foreground": "oklch(0.2 0.03 50)",
      "--ring": "oklch(0.7 0.14 50)",
      "--accent": "oklch(0.32 0.035 50)",
      "--accent-foreground": "oklch(0.95 0.01 85)",
      "--sidebar-primary": "oklch(0.7 0.16 50)",
      "--sidebar-primary-foreground": "oklch(0.2 0.03 50)",
      "--sidebar-accent": "oklch(0.32 0.035 50)",
      "--sidebar-accent-foreground": "oklch(0.95 0.01 85)",
      "--sidebar-ring": "oklch(0.7 0.14 50)",
    });
  });

  /* Outside the band nothing moves at all; inside, only light --primary. */
  it("moves light --primary only between hues 150 and 232", () => {
    const at = (hue: number) =>
      deriveTheme({ ...WORKING_BENCH, accentHue: hue }).light["--primary"];
    for (const hue of HUES) {
      if (hue <= 150 || hue >= 232) {
        expect(at(hue)).toBe(`oklch(0.53 0.16 ${hue})`);
      }
    }
    expect(at(191)).toBe("oklch(0.5 0.16 191)");
    for (const preset of PRESETS) {
      expect(deriveTheme(preset.theme).light["--primary"]).toBe(
        `oklch(0.53 0.16 ${preset.theme.accentHue})`,
      );
    }
  });

  it("computes WCAG ratios the way axe does", () => {
    expect(contrastRatio("oklch(1 0 0)", "oklch(0 0 0)")).toBeCloseTo(21, 5);
    expect(contrastRatio("oklch(0.5 0 0)", "oklch(0.5 0 0)")).toBe(1);
    // The pre-30b worst case, which the band exists to fix.
    expect(
      contrastRatio("oklch(0.99 0.01 85)", "oklch(0.53 0.16 189)"),
    ).toBeCloseTo(4.31, 2);
  });
});
