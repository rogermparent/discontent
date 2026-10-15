/**
 * The make pages' secondary group (usability pass, U6): what a list other
 * than this browser's adds, shown apart from — and never counted into — what
 * the visitor's own list can make.
 *
 * The primary list is always the browser's (`localStorage`, in both apps).
 * This helper is the one place a page asks for anything else:
 *
 * - **editor, signed in** — the operator's personal inventory (the content
 *   repo's inventory file), passed in as `readSaved`, because reading it is
 *   editor code that `common/` cannot import;
 * - **export, and a guest in the editor** — the house snapshot, and only when
 *   the operator opted in: "Share my saved inventory on the export" (Export
 *   settings, off by default) makes the editor's export build bake the list
 *   into `SITE_HOUSE_INVENTORY`, which `houseInventory()` reads at build time,
 *   as `getSiteTheme()` reads `SITE_THEME`. With the option off the variable
 *   is never set, so no route, page or payload of the static site carries the
 *   personal inventory (`test/exportHouseInventory.test.ts`).
 */
import { dedupeItems, MAX_ITEMS } from "../util/inventoryText";

export interface SecondaryInventory {
  /** The group's heading, named for whose list it is. */
  label: string;
  items: string[];
}

/** The editor's group, over the operator's own saved list. */
export const SAVED_INVENTORY_LABEL = "Also makeable with your saved inventory";

/** The export's group, over the snapshot the operator chose to share. */
export const HOUSE_INVENTORY_LABEL = "Also makeable from the house inventory";

/**
 * The build-time variable that carries the shared snapshot: a JSON array of
 * items. Server/build only (no `NEXT_PUBLIC_`): the page that uses it passes
 * the items down, so a build without it has nothing to pass.
 */
export const HOUSE_INVENTORY_ENV = "SITE_HOUSE_INVENTORY";

/**
 * The shared house snapshot, or `undefined` when the build carries none —
 * the default. A malformed value is ignored rather than fatal: the page then
 * renders as if the option were off.
 */
export function houseInventory(
  env: Record<string, string | undefined> = process.env,
): SecondaryInventory | undefined {
  const raw = env[HOUSE_INVENTORY_ENV];
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const items = dedupeItems(
    parsed.filter((item): item is string => typeof item === "string"),
  ).slice(0, MAX_ITEMS);
  return items.length > 0 ? { label: HOUSE_INVENTORY_LABEL, items } : undefined;
}

/**
 * The secondary group's list, or `undefined` for no group at all.
 *
 * With `readSaved` (a signed-in editor) it is the saved list — an empty one
 * could add nothing, so that is no group either. Without it (the export, or a
 * guest in the editor) it is the house snapshot when the build carries one,
 * which by default it does not.
 */
export async function secondaryInventory(
  readSaved?: () => Promise<string[] | undefined>,
): Promise<SecondaryInventory | undefined> {
  if (!readSaved) return houseInventory();
  const items = await readSaved();
  return items?.length ? { label: SAVED_INVENTORY_LABEL, items } : undefined;
}
