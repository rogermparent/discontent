/**
 * Site-wide configuration shared by the editor and export apps.
 *
 * Read from build-time env vars so a fork can be rebranded without editing
 * shared components — the whole point of "fork-and-configure". The editor→export
 * build injects the non-`NEXT_PUBLIC_` ones (see the export action).
 */
import { parseTheme, type Theme } from "@discontent/component-library/theming";
import { MARGINALIA } from "../theme/presets";

export interface SiteConfig {
  /** The wordmark. */
  title: string;
  description: string;
  /**
   * The statement above the index — two lines at most, in display type.
   * Deliberately not a "hero": the works are the hero.
   */
  statement?: string;
}

const DEFAULT_TITLE = "Portfolio";
const DEFAULT_DESCRIPTION = "A portfolio built on Discontent.";

export function getSiteConfig(): SiteConfig {
  return {
    title: process.env.NEXT_PUBLIC_SITE_TITLE || DEFAULT_TITLE,
    description:
      process.env.NEXT_PUBLIC_SITE_DESCRIPTION || DEFAULT_DESCRIPTION,
    statement: process.env.NEXT_PUBLIC_SITE_STATEMENT || undefined,
  };
}

/**
 * The owner's baked-in site-default theme from `SITE_THEME` (JSON of a Theme).
 *
 * Falls back to portfolio's own `marginalia`, **not** the engine's Working
 * Bench: the engine's default names the `bench` font pairing, which this app
 * never registers, so falling back to it would drop every heading to system
 * fonts via the --ff-*-fallback chain.
 */
export function getSiteTheme(): Theme {
  const raw = process.env.SITE_THEME;
  if (!raw) return MARGINALIA;
  return parseTheme(raw) ?? MARGINALIA;
}

/** The three layout postures. Baked into the export via `SITE_LAYOUT`. */
export type Posture = "index" | "studio" | "resume";

const POSTURES: Posture[] = ["index", "studio", "resume"];

/** Labeled posture menu, so the picker and the validator cannot drift apart. */
export const POSTURE_OPTIONS: {
  value: Posture;
  label: string;
  hint: string;
}[] = [
  {
    value: "index",
    label: "Index",
    hint: "A catalog of works, newest first. Neutral — works for anyone.",
  },
  {
    value: "studio",
    label: "Studio",
    hint: "Plates lead as a grid. Image-forward.",
  },
  {
    value: "resume",
    label: "Résumé",
    hint: "Statement, roles and a compact works list. Credentials-forward.",
  },
];

export function isPosture(value: string): value is Posture {
  return POSTURES.includes(value as Posture);
}

/**
 * Which posture the site renders in. Same components, different order and
 * weight — this is what lets one template serve a developer, a designer and a
 * job-seeker without a fork.
 */
export function getSitePosture(): Posture {
  const raw = process.env.SITE_LAYOUT;
  return POSTURES.includes(raw as Posture) ? (raw as Posture) : "index";
}

/** A labelled outbound link, shown in the footer. */
export interface ContactLink {
  label: string;
  url: string;
}

/**
 * The owner's contact links, baked into the export via `SITE_CONTACT`.
 *
 * This is what `homepage.json`'s `contactLinks` became — minus the `icon` field,
 * which was an arbitrary-file-read and stored-XSS sink (a form-supplied filename
 * read off disk and injected with `dangerouslySetInnerHTML`).
 *
 * Parsed defensively and *shape-checked*, not trusted: it arrives as an
 * environment string, and a malformed one should degrade to "no links" rather
 * than throw during layout render on every request.
 */
export function getSiteContactLinks(): ContactLink[] {
  const raw = process.env.SITE_CONTACT;
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ContactLink =>
        !!item &&
        typeof item === "object" &&
        typeof (item as ContactLink).label === "string" &&
        typeof (item as ContactLink).url === "string",
    );
  } catch {
    return [];
  }
}
