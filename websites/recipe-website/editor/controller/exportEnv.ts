/**
 * The environment the editor's export build runs with: the owner's settings,
 * baked into the static site at build time (PR 2b `SITE_THEME`, PR 13
 * `SITE_FOOTER_NOTE` / `SITE_CONTACT`, U6 `SITE_HOUSE_INVENTORY`). The
 * export layout and pages read these through `common/config/site.ts` and
 * `common/controller/secondaryInventory.ts`; absent, each falls back to its
 * built-in default.
 *
 * Pure apart from `readSavedInventory`, so the guard test can pin the U6 rule
 * both ways: with `shareInventoryOnExport` off — the default — the saved
 * inventory is never even read, and the variable is set empty; on, the
 * snapshot is exactly the saved list.
 */
import type { Theme } from "@discontent/component-library/theming";
import type { ContactLinks } from "recipe-website-common/config/site";
import { HOUSE_INVENTORY_ENV } from "recipe-website-common/controller/secondaryInventory";

export interface ExportEnvSettings {
  theme?: Theme;
  footerNote?: string;
  contact?: ContactLinks;
  /** U6: share the operator's saved inventory on the export (off by default). */
  shareInventoryOnExport?: boolean;
}

export async function exportBuildEnv(
  settings: ExportEnvSettings,
  readSavedInventory: () => Promise<string[]>,
): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  if (settings.theme) env.SITE_THEME = JSON.stringify(settings.theme);
  if (settings.footerNote) env.SITE_FOOTER_NOTE = settings.footerNote;
  if (settings.contact) env.SITE_CONTACT = JSON.stringify(settings.contact);
  /*
   * Always set, so off is off: the build inherits the editor's environment
   * (execa extends `process.env`), and an empty value reads as no snapshot.
   */
  env[HOUSE_INVENTORY_ENV] = "";
  if (settings.shareInventoryOnExport === true) {
    const items = await readSavedInventory();
    if (items.length > 0) env[HOUSE_INVENTORY_ENV] = JSON.stringify(items);
  }
  return env;
}
