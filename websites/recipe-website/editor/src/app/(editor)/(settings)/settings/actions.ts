"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { parseTheme } from "@discontent/component-library/theming";
import type { ContactLinks } from "recipe-website-common/config/site";
import { auth } from "@/auth";
import {
  readSettings,
  writeSettings,
  type NamedPreset,
  type Settings,
} from "@/settings";

/** The contact keys the Site details form edits, in display order. */
const CONTACT_KEYS: (keyof ContactLinks)[] = [
  "email",
  "website",
  "instagram",
  "youtube",
  "twitter",
  "facebook",
  "github",
];

export interface SettingsActionState {
  message: string;
  success: boolean;
}

export interface PresetActionResult {
  success: boolean;
  message?: string;
}

export async function updateSettings(
  _previousState: SettingsActionState | null,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await auth();
  if (!session?.user?.email) {
    return { message: "Authentication required", success: false };
  }

  // Merge onto existing settings: a given form only submits its own fields, so
  // we preserve every field it doesn't carry (e.g. the Tools form leaves the
  // saved theme untouched, and the Theme editor leaves ytdlpPath untouched).
  const existing = await readSettings();
  const next: Settings = { ...existing };

  if (formData.has("ytdlpPath")) {
    const ytdlpPath = formData.get("ytdlpPath");
    next.ytdlpPath =
      typeof ytdlpPath === "string" && ytdlpPath ? ytdlpPath : undefined;
  }

  if (formData.has("theme")) {
    const raw = formData.get("theme");
    const parsed = typeof raw === "string" ? parseTheme(raw) : null;
    if (typeof raw === "string" && raw && !parsed) {
      return { message: "Invalid theme data.", success: false };
    }
    next.theme = parsed ?? undefined;
  }

  if (formData.has("footerNote")) {
    const note = formData.get("footerNote");
    next.footerNote =
      typeof note === "string" && note.trim() ? note.trim() : undefined;
  }

  // The Site details form namespaces contact inputs as `contact.<key>`; collect
  // the non-empty ones into a ContactLinks object (or clear it entirely).
  if (CONTACT_KEYS.some((key) => formData.has(`contact.${key}`))) {
    const contact: ContactLinks = {};
    for (const key of CONTACT_KEYS) {
      const value = formData.get(`contact.${key}`);
      if (typeof value === "string" && value.trim()) {
        contact[key] = value.trim();
      }
    }
    next.contact = Object.keys(contact).length > 0 ? contact : undefined;
  }

  try {
    await writeSettings(next);
    // The site default is injected in the root layout, so refresh every route.
    revalidatePath("/", "layout");
    return { message: "Settings saved.", success: true };
  } catch {
    return { message: "Failed to save settings.", success: false };
  }
}

/**
 * Save the current theme knobs as a named, owner-side preset. Validates the
 * JSON through `parseTheme` (same whitelist as the site default) and appends it
 * to `settings.presets` with a fresh UUID.
 */
export async function savePreset(
  name: string,
  themeJSON: string,
): Promise<PresetActionResult> {
  const session = await auth();
  if (!session?.user?.email) {
    return { success: false, message: "Authentication required" };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, message: "A preset name is required." };
  }
  const theme = parseTheme(themeJSON);
  if (!theme) {
    return { success: false, message: "Invalid theme data." };
  }

  const existing = await readSettings();
  const preset: NamedPreset = { id: randomUUID(), name: trimmed, theme };
  const next: Settings = {
    ...existing,
    presets: [...(existing.presets ?? []), preset],
  };

  try {
    await writeSettings(next);
    revalidatePath("/", "layout");
    return { success: true };
  } catch {
    return { success: false, message: "Failed to save preset." };
  }
}

/** Delete an owner-saved named preset by id. */
export async function deletePreset(id: string): Promise<PresetActionResult> {
  const session = await auth();
  if (!session?.user?.email) {
    return { success: false, message: "Authentication required" };
  }

  const existing = await readSettings();
  const next: Settings = {
    ...existing,
    presets: (existing.presets ?? []).filter((p) => p.id !== id),
  };

  try {
    await writeSettings(next);
    revalidatePath("/", "layout");
    return { success: true };
  } catch {
    return { success: false, message: "Failed to delete preset." };
  }
}
