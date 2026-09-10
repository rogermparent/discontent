"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { parseTheme } from "@discontent/component-library/theming";
import type { NamedPreset } from "@discontent/component-library/theming";
import { isPosture } from "portfolio-website-common/config/site";
import { auth } from "@/auth";
import {
  readSettingsFresh,
  writeSettings,
  type ContactLink,
  type Settings,
} from "@/settings";

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
  // every field it does not carry is preserved — the theme editor must not
  // clear the posture, and the site-details form must not clear the theme.
  const existing = await readSettingsFresh();
  const next: Settings = { ...existing };

  if (formData.has("theme")) {
    const raw = formData.get("theme");
    const parsed = typeof raw === "string" ? parseTheme(raw) : null;
    if (typeof raw === "string" && raw && !parsed) {
      return { message: "Invalid theme data.", success: false };
    }
    next.theme = parsed ?? undefined;
  }

  if (formData.has("posture")) {
    const raw = formData.get("posture");
    if (typeof raw !== "string" || !isPosture(raw)) {
      return { message: "Unknown posture.", success: false };
    }
    next.posture = raw;
  }

  // Contact links arrive as parallel indexed inputs (contactLinks[0].label,
  // contactLinks[0].url, …). An empty list is meaningful — the owner removing
  // their last link — so the form submits a sentinel and its presence, not the
  // rows', is what marks the field as edited.
  if (formData.has("contactLinks")) {
    const links: ContactLink[] = [];
    for (let i = 0; formData.has(`contactLinks[${i}].label`); i += 1) {
      const label = formData.get(`contactLinks[${i}].label`);
      const url = formData.get(`contactLinks[${i}].url`);
      if (
        typeof label === "string" &&
        typeof url === "string" &&
        label.trim() &&
        url.trim()
      ) {
        links.push({ label: label.trim(), url: url.trim() });
      }
    }
    next.contactLinks = links.length > 0 ? links : undefined;
  }

  for (const key of ["title", "description", "statement"] as const) {
    if (formData.has(key)) {
      const value = formData.get(key);
      next[key] =
        typeof value === "string" && value.trim() ? value.trim() : undefined;
    }
  }

  try {
    await writeSettings(next);
    // The theme and the posture are both read during layout render.
    revalidatePath("/", "layout");
    return { message: "Settings saved.", success: true };
  } catch {
    return { message: "Failed to save settings.", success: false };
  }
}

/** Save the current theme knobs as a named, owner-side preset. */
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

  const existing = await readSettingsFresh();
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

  const existing = await readSettingsFresh();
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
