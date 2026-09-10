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
