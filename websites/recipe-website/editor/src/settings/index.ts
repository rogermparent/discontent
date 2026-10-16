import {
  getSettingsDirectory,
  readSettings as readSettingsGeneric,
  writeSettings as writeSettingsGeneric,
} from "@discontent/cms/settings";
import type {
  NamedPreset,
  ThemedSettings,
} from "@discontent/component-library/theming";
import type { ContactLinks } from "recipe-website-common/config/site";

/**
 * Recipe's owner settings.
 *
 * The store itself — where settings.json lives, and reading/writing it — was
 * promoted to `@discontent/cms/settings` when portfolio needed the same thing.
 * This file is now just recipe's *shape* bound to it. The shape stays per-site
 * because it is genuinely per-site: `ytdlpPath` is a recipe tool, and cms
 * cannot name `Theme` at all without a dependency cycle (component-library
 * already depends on cms).
 *
 * `theme` and `presets` are not per-site, though, so they come from
 * `ThemedSettings` — the theming engine's contract with the settings store.
 * Both sites used to declare them independently.
 */
export interface Settings extends ThemedSettings {
  ytdlpPath?: string;
  /** Optional owner footer note, shown in the footer colophon (PR 13). */
  footerNote?: string;
  /** Owner social/contact links rendered in the footer brand block (PR 13). */
  contact?: ContactLinks;
  /**
   * The content repository's remotes that are mirrors this workstation syncs
   * (epic 28, D4/D6), e.g. `["uraninite"]`. Empty or absent: no automatic
   * sync. Per instance, like the rest of this file; a mirror ignores it.
   */
  mirrors?: string[];
  /**
   * Where each mirror's editor answers, by remote name, when its remote's ssh
   * host on :3000 is wrong (D7: site settings are sent there after a sync).
   */
  mirrorUrls?: Record<string, string>;
  /**
   * Usability pass, U6: bake a snapshot of the saved inventory into the
   * static export, where visitors see what it adds as "Also makeable from
   * the house inventory". Off (absent) by default: nothing about the list
   * reaches the export. Per instance, like `mirrors` — the workstation is
   * where exports are built — so it is never sent to a mirror.
   */
  shareInventoryOnExport?: boolean;
  /**
   * 38a: `/make`'s "Assume I always have" list as the signed-in owner last
   * saved it (`make-settings-v1.staples` in the browser), so a new browser
   * starts from it. Absent: nothing saved, each browser has the default.
   * Per instance, like `mirrors`, and never read by the export.
   */
  makeStaples?: string[];
}

export type { NamedPreset };

export { getSettingsDirectory };

export async function readSettings(): Promise<Settings> {
  return readSettingsGeneric<Settings>();
}

export async function writeSettings(settings: Settings): Promise<void> {
  return writeSettingsGeneric(settings);
}
