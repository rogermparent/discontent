/**
 * Site settings follow the workstation (epic 28, D7).
 *
 * Theme, presets, footer note and contact are site identity, but they live
 * per instance in `SETTINGS_DIRECTORY/settings.json`, outside the content
 * repository, so a mirror's copy froze at setup. After every sync that
 * succeeded, the workstation sends its site keys to the mirror's
 * `PUT /api/settings/site` when they changed since the last send; the hash
 * the mirror accepted is kept in the sync state (`settings` on the mirror's
 * record), so an unchanged set costs no request.
 *
 * Never sent: `ytdlpPath` (a path on this machine) and `mirrors` (the
 * workstation's own list). The mirror route refuses both.
 *
 * - The mirror's URL is its remote's ssh host on :3000 (`uraninite:recipes` →
 *   `http://uraninite:3000`), or `settings.mirrorUrls[<remote>]`.
 * - The token is `MIRROR_SYNC_TOKEN`: a write-scoped API token. Users live in
 *   the content repository, so the Pi's `pi-deploy` token is valid on both.
 *   Without it nothing is sent, and the Mirrors card says why.
 */
import { createHash } from "crypto";
import { parseTheme, type Theme } from "@discontent/component-library/theming";
import {
  readSyncState,
  recordSettingsPush,
  type SettingsPushState,
} from "@discontent/cms/git/syncState";
import type { ContactLinks } from "recipe-website-common/config/site";
import {
  readSettings,
  type NamedPreset,
  type Settings,
} from "../../src/settings";
import { ValidationError } from "../curation/errors";
import type { MirrorTarget } from "./mirrors";

/** The keys that make up a site's identity, and the only ones a mirror takes. */
export const SITE_KEYS = ["theme", "presets", "footerNote", "contact"] as const;

/** The contact keys the footer knows, in display order. */
export const CONTACT_KEYS: (keyof ContactLinks)[] = [
  "email",
  "website",
  "instagram",
  "youtube",
  "twitter",
  "facebook",
  "github",
];

export type SiteSettings = Pick<Settings, (typeof SITE_KEYS)[number]>;

export const MIRROR_PORT = 3000;

/** The site keys of `settings`, absent ones left out. */
export function pickSiteSettings(settings: Settings): SiteSettings {
  const site: SiteSettings = {};
  if (settings.theme) site.theme = settings.theme;
  if (settings.presets?.length) site.presets = settings.presets;
  if (settings.footerNote) site.footerNote = settings.footerNote;
  if (settings.contact && Object.keys(settings.contact).length > 0) {
    site.contact = settings.contact;
  }
  return site;
}

/** JSON with every object's keys sorted, so equal settings hash equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function siteSettingsHash(site: SiteSettings): string {
  return createHash("sha256").update(canonical(site)).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate a body for `PUT /api/settings/site`: the complete set of site
 * keys, so a key left out is a key the workstation cleared. Anything else —
 * `ytdlpPath`, `mirrors`, a typo — is refused rather than ignored.
 */
export function parseSiteSettings(body: unknown): SiteSettings {
  if (!isRecord(body)) {
    throw new ValidationError(
      "The body must be a JSON object of site settings.",
    );
  }
  const unknown = Object.keys(body).filter(
    (key) => !(SITE_KEYS as readonly string[]).includes(key),
  );
  if (unknown.length > 0) {
    throw new ValidationError(
      `Only ${SITE_KEYS.join(", ")} follow the workstation; refused: ${unknown.join(", ")}.`,
    );
  }
  const site: SiteSettings = {};

  if (body.theme != null) {
    const theme = parseTheme(body.theme);
    if (!theme) throw new ValidationError("theme is not a valid theme.");
    site.theme = theme;
  }

  if (body.presets != null) {
    if (!Array.isArray(body.presets)) {
      throw new ValidationError("presets must be a list.");
    }
    site.presets = body.presets.map((preset, index): NamedPreset => {
      const theme: Theme | null = isRecord(preset)
        ? parseTheme(preset.theme)
        : null;
      if (
        !isRecord(preset) ||
        typeof preset.id !== "string" ||
        !preset.id ||
        typeof preset.name !== "string" ||
        !preset.name.trim() ||
        !theme
      ) {
        throw new ValidationError(
          `presets[${index}] needs an id, a name and a valid theme.`,
        );
      }
      return { id: preset.id, name: preset.name.trim(), theme };
    });
    if (site.presets.length === 0) delete site.presets;
  }

  if (body.footerNote != null) {
    if (typeof body.footerNote !== "string") {
      throw new ValidationError("footerNote must be a string.");
    }
    if (body.footerNote.trim()) site.footerNote = body.footerNote.trim();
  }

  if (body.contact != null) {
    if (!isRecord(body.contact)) {
      throw new ValidationError("contact must be an object of links.");
    }
    const contact: ContactLinks = {};
    for (const [key, value] of Object.entries(body.contact)) {
      if (!CONTACT_KEYS.includes(key as keyof ContactLinks)) {
        throw new ValidationError(
          `contact.${key} is not a known contact link.`,
        );
      }
      if (typeof value !== "string") {
        throw new ValidationError(`contact.${key} must be a string.`);
      }
      if (value.trim()) contact[key as keyof ContactLinks] = value.trim();
    }
    if (Object.keys(contact).length > 0) site.contact = contact;
  }

  return site;
}

/** `existing` with its site keys replaced by `site`'s; every other key kept. */
export function applySiteSettings(
  existing: Settings,
  site: SiteSettings,
): Settings {
  const next: Settings = { ...existing };
  for (const key of SITE_KEYS) delete next[key];
  return { ...next, ...site };
}

/** Where a mirror's editor answers: an override, else its ssh host on :3000. */
export function mirrorEditorUrl(
  target: MirrorTarget,
  settings: Settings,
): string | undefined {
  const override = settings.mirrorUrls?.[target.remote];
  if (override) return override.replace(/\/+$/, "");
  return target.sshHost ? `http://${target.sshHost}:${MIRROR_PORT}` : undefined;
}

export type SettingsPushOutcome =
  | { status: "sent"; hash: string }
  | { status: "unchanged" }
  | { status: "skipped"; reason: string }
  | {
      status: "failed";
      error: string;
      /** The same error as the last attempt's: already logged once. */
      repeated: boolean;
    };

/**
 * Send the workstation's site settings to one mirror if they changed since
 * the mirror last accepted them. Never throws: a failure is recorded and
 * retried after the next sync.
 */
export async function pushSiteSettings(
  contentDirectory: string,
  target: MirrorTarget,
  { timeoutMs = 15_000 }: { timeoutMs?: number } = {},
): Promise<SettingsPushOutcome> {
  const settings = await readSettings();
  const previous: SettingsPushState | undefined = (
    await readSyncState(contentDirectory)
  )[target.remote]?.settings;
  const url = mirrorEditorUrl(target, settings);
  const token = process.env.MIRROR_SYNC_TOKEN;
  if (!url || !token) {
    const reason = !url
      ? `no editor URL for ${target.remote} (set mirrorUrls.${target.remote} in settings)`
      : "MIRROR_SYNC_TOKEN is not set on this workstation";
    /* Recorded once, so the Mirrors card can say why; not rewritten per sync. */
    if (previous?.error !== reason) {
      await recordSettingsPush(contentDirectory, target.remote, {
        error: reason,
      });
    }
    return { status: "skipped", reason };
  }

  const site = pickSiteSettings(settings);
  const hash = siteSettingsHash(site);
  if (previous?.hash === hash && !previous.error)
    return { status: "unchanged" };

  let error: string | undefined;
  try {
    const response = await fetch(`${url}/api/settings/site`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(site),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      error = `${response.status}: ${body.error?.message ?? response.statusText}`;
    }
  } catch (caught) {
    error = `${new URL(url).host} not reached: ${
      caught instanceof Error ? caught.message : String(caught)
    }`;
  }
  await recordSettingsPush(
    contentDirectory,
    target.remote,
    error ? { error } : { hash },
  );
  return error
    ? { status: "failed", error, repeated: previous?.error === error }
    : { status: "sent", hash };
}
