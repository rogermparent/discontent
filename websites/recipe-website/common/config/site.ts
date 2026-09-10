/**
 * Site-wide configuration shared by the editor and export apps.
 *
 * The title/description come from build-time env vars so both apps (and any
 * future deployment) can be branded without prop-drilling through layouts or
 * hardcoding strings in shared components. Falls back to neutral defaults.
 */
import { parseTheme, type Theme } from "@discontent/component-library/theming";

export interface SiteConfig {
  title: string;
  description: string;
}

/**
 * Owner-configured social/contact links for the footer. Known keys map to known
 * lucide icons in the footer (see AppLayout), so the model stays a flat, typed
 * record rather than free-form {label, url, icon} triples the owner must style.
 */
export interface ContactLinks {
  email?: string;
  website?: string;
  instagram?: string;
  youtube?: string;
  twitter?: string;
  facebook?: string;
  github?: string;
}

/** Owner-configurable footer content shared by both apps. */
export interface SiteFooterConfig {
  note?: string;
  contact?: ContactLinks;
}

const DEFAULT_TITLE = "Recipe Book";
const DEFAULT_DESCRIPTION = "A recipe book built with Next.js.";

export function getSiteConfig(): SiteConfig {
  return {
    title: process.env.NEXT_PUBLIC_SITE_TITLE || DEFAULT_TITLE,
    description:
      process.env.NEXT_PUBLIC_SITE_DESCRIPTION || DEFAULT_DESCRIPTION,
  };
}

/**
 * The owner's baked-in site-default theme, read from the build-time `SITE_THEME`
 * env var (JSON of a Theme). The editor→export build injects it (see
 * exportAction). Non-`NEXT_PUBLIC_` so it's server/build-time only. Returns
 * `undefined` when absent or invalid, so the layout falls back to the built-in
 * default. Sync + env-only, mirroring `getSiteConfig`.
 */
export function getSiteTheme(): Theme | undefined {
  const raw = process.env.SITE_THEME;
  if (!raw) return undefined;
  return parseTheme(raw) ?? undefined;
}

/**
 * The owner's baked-in footer content (note + contact links), read from the
 * build-time `SITE_FOOTER_NOTE` / `SITE_CONTACT` env vars. Mirrors
 * `getSiteTheme()`: the editor→export build injects it (see exportAction), it's
 * server/build-time only, and it returns `undefined` when nothing is
 * configured so the layout renders a reader-only default footer. Sync + env-only.
 */
export function getSiteFooter(): SiteFooterConfig | undefined {
  const note = process.env.SITE_FOOTER_NOTE || undefined;
  let contact: ContactLinks | undefined;
  const rawContact = process.env.SITE_CONTACT;
  if (rawContact) {
    try {
      const parsed = JSON.parse(rawContact) as ContactLinks;
      if (parsed && typeof parsed === "object") contact = parsed;
    } catch {
      contact = undefined;
    }
  }
  if (!note && !contact) return undefined;
  return { note, contact };
}
