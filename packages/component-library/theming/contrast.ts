/*
 * WCAG 2 contrast for the OKLCH colours the theme derives.
 *
 * Nothing else in the repo computes contrast — axe checks the rendered page —
 * so this is what lets `derive.ts` choose lightnesses against a target ratio
 * and lets a unit test sweep every hue, rather than leaving a failing hue to be
 * found by whichever theme a Playwright run happens to render.
 *
 * OKLCH → OKLab → linear sRGB (Björn Ottosson's matrices), clipped to the sRGB
 * gamut per channel the way browsers render an out-of-gamut colour today, then
 * WCAG relative luminance. Linear sRGB *is* the luminance basis, so there is no
 * gamma round trip.
 */

/** An OKLCH triple: lightness 0–1, chroma, hue in degrees. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** Parse `oklch(L C H)` / `oklch(L C H / A)` as `ok()` in `derive.ts` writes it. */
export function parseOklch(value: string): Oklch {
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(value.trim());
  if (!match) throw new Error(`Not an oklch() colour: ${value}`);
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
}

const clip = (x: number) => Math.min(1, Math.max(0, x));

/** Linear-light sRGB channels, each clipped to [0, 1]. */
export function oklchToLinearSrgb({
  l,
  c,
  h,
}: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    clip(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    clip(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    clip(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}

/** WCAG relative luminance. */
export function relativeLuminance(color: Oklch | string): number {
  const [r, g, b] = oklchToLinearSrgb(
    typeof color === "string" ? parseOklch(color) : color,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1–21, order-independent. */
export function contrastRatio(fg: Oklch | string, bg: Oklch | string): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
