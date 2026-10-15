/**
 * The make panels' secondary group (usability pass, U6): what a list other
 * than this browser's adds, shown apart from — and never counted into — what
 * the visitor's own list can make.
 *
 * The primary list is always the browser's (`localStorage`, in both apps).
 * This helper is the one place a page asks for anything else:
 *
 * - **editor, signed in** — the operator's personal inventory
 *   (the content repo's inventory file), passed in as `readSaved`, because
 *   reading it is editor code that `common/` cannot import;
 * - **export** — nothing. No route, page or payload of the static site may
 *   carry the personal inventory (`test/exportInventoryGuard.test.ts`). An
 *   opt-in option that bakes a snapshot of it into the export, labelled for
 *   visitors ("Also makeable from the house bar"), belongs here when it lands
 *   (U5's branch); off stays the default.
 */
export interface SecondaryInventory {
  /** The group's heading, named for whose list it is. */
  label: string;
  items: string[];
}

/** The editor's group, over the operator's own saved list. */
export const SAVED_INVENTORY_LABEL = "Also makeable with your saved inventory";

/**
 * The secondary group's list, or `undefined` for no group at all. Called with
 * nothing — the export, or a guest in the editor — it answers `undefined`;
 * so does an empty saved list, which could add nothing.
 */
export async function secondaryInventory(
  readSaved?: () => Promise<string[] | undefined>,
): Promise<SecondaryInventory | undefined> {
  if (!readSaved) return undefined;
  const items = await readSaved();
  return items?.length ? { label: SAVED_INVENTORY_LABEL, items } : undefined;
}
