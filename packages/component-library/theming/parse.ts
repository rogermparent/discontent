/*
 * Validate untrusted theme JSON (from a form field or localStorage) into a
 * well-formed Theme, clamping/normalizing every knob. Never throws — returns
 * null when the input isn't usable so callers can fall back to the default.
 */

import { normalizeHue } from "./derive";
import { DEFAULT_FONT_PAIRING, isFontPairingKey } from "./fonts";
import type { ColorMode, NeutralKey, Theme } from "./types";

const NEUTRALS: NeutralKey[] = ["warm", "cool", "gray"];
const MODES: ColorMode[] = ["system", "light", "dark"];

const MIN_RADIUS = 0;
const MAX_RADIUS = 2;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Parse a raw value (object or JSON string) into a validated Theme, or null. */
export function parseTheme(input: unknown): Theme | null {
  let obj: unknown = input;
  if (typeof input === "string") {
    try {
      obj = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const r = obj as Record<string, unknown>;

  const accentHue =
    typeof r.accentHue === "number" && Number.isFinite(r.accentHue)
      ? normalizeHue(r.accentHue)
      : null;
  const radius =
    typeof r.radius === "number" && Number.isFinite(r.radius)
      ? clamp(r.radius, MIN_RADIUS, MAX_RADIUS)
      : null;
  const neutral =
    typeof r.neutral === "string" && NEUTRALS.includes(r.neutral as NeutralKey)
      ? (r.neutral as NeutralKey)
      : null;
  if (accentHue === null || radius === null || neutral === null) return null;

  /*
   * Validate the *shape* of the pairing key, not its membership in a list.
   *
   * This function runs on both the settings-save path and the SITE_THEME
   * export-bake path, and it is shared by every content-engine site. A
   * membership check against one global menu silently rewrote any site-specific
   * pairing to the default, so a site would bake its theme and ship someone
   * else's typefaces. A well-formed key this app didn't register is safe now:
   * derive.ts gives each var() a system-font fallback.
   */
  const fontPairing = isFontPairingKey(r.fontPairing)
    ? r.fontPairing
    : DEFAULT_FONT_PAIRING;

  const defaultMode =
    typeof r.defaultMode === "string" &&
    MODES.includes(r.defaultMode as ColorMode)
      ? (r.defaultMode as ColorMode)
      : undefined;

  return { accentHue, neutral, radius, fontPairing, defaultMode };
}
