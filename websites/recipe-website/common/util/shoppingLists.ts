/**
 * 50d: saved shopping lists. The list a person has today stays the **main**
 * list, where it always was; every other list is a record — its name, when
 * it was made, the meal plan it was made from — beside its own items,
 * changes and tidy runs. What a list is made of is the seat's
 * (the editor's seat); this module is the record's shape, read and
 * written the same way on every device, and the words the page and the CLI
 * use for it. Pure: the browser reads it too.
 */

/** The main list's id: the list a person had before 50d, at its old paths. */
export const MAIN_SHOPPING_LIST = "main";

/** What the switcher and the CLI call the main list. */
export const MAIN_SHOPPING_LIST_NAME = "Main list";

/** A saved list's id: a lowercase ULID, its directory's name. */
export const SHOPPING_LIST_ID_PATTERN = /^[0-9a-hjkmnp-tv-z]{26}$/;

/** Bounds on a list's name. */
export const SHOPPING_LIST_NAME_MAX = 80;

/** Lists a content repository may hold, deleted ones included. */
export const MAX_SHOPPING_LISTS = 200;

/** A saved list, as stored (`list.json` in its directory). */
export interface ShoppingListRecord {
  id: string;
  name: string;
  /** ISO time it was made. */
  created: string;
  /** The meal plan (a group's slug) it was made from. */
  plan?: string;
  /** Deleted: hidden from the switcher, its files kept (Dd4). */
  archived?: boolean;
}

/**
 * A list as the switcher, the CLI and `shopping_get` show it: the main list
 * too (`main: true`, no record), with its counts.
 */
export interface ShoppingListSummary {
  id: string;
  name: string;
  main?: true;
  created?: string;
  plan?: string;
  /** The plan's name, when it still exists. */
  planName?: string;
  archived?: true;
  /** Lines on the list. */
  items: number;
  /** Lines not ticked yet. */
  left: number;
}

/** A name as stored: one line, trimmed, inner runs of space as one. */
export function cleanListName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A name that would be read as the main list's ("main", "Main list"). */
export function isMainListName(name: string): boolean {
  const folded = cleanListName(name).toLowerCase();
  return (
    folded === MAIN_SHOPPING_LIST ||
    folded === MAIN_SHOPPING_LIST_NAME.toLowerCase()
  );
}

/**
 * A stored record, read leniently: the directory's name is the id whatever
 * the file says; a record with no name or time is no record.
 */
export function parseShoppingListRecord(
  raw: unknown,
  id: string,
): ShoppingListRecord | null {
  if (!SHOPPING_LIST_ID_PATTERN.test(id)) return null;
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const name =
    typeof value.name === "string"
      ? cleanListName(value.name).slice(0, SHOPPING_LIST_NAME_MAX)
      : "";
  if (!name || typeof value.created !== "string") return null;
  return canonicalShoppingListRecord({
    id,
    name,
    created: value.created,
    ...(typeof value.plan === "string" && value.plan
      ? { plan: value.plan }
      : {}),
    ...(value.archived === true ? { archived: true } : {}),
  });
}

/** Keys in the record's order; a falsy flag is no key (35c's choice 2). */
export function canonicalShoppingListRecord(
  record: ShoppingListRecord,
): ShoppingListRecord {
  return {
    id: record.id,
    name: record.name,
    created: record.created,
    ...(record.plan ? { plan: record.plan } : {}),
    ...(record.archived ? { archived: true } : {}),
  };
}

/** The main list first, then the others newest first; deleted ones last. */
export function sortListSummaries(
  lists: readonly ShoppingListSummary[],
): ShoppingListSummary[] {
  return [...lists].sort((a, b) => {
    if (a.main !== b.main) return a.main ? -1 : 1;
    if (Boolean(a.archived) !== Boolean(b.archived)) {
      return a.archived ? 1 : -1;
    }
    return (
      (b.created ?? "").localeCompare(a.created ?? "") ||
      b.id.localeCompare(a.id)
    );
  });
}

/** "Main list · 12 items", "Thanksgiving · 3 of 40 left · Thanksgiving menu". */
export function listSummaryText(list: ShoppingListSummary): string {
  const parts = [list.name];
  parts.push(
    list.left === list.items
      ? `${list.items} ${list.items === 1 ? "item" : "items"}`
      : `${list.left} of ${list.items} left`,
  );
  if (list.planName && list.planName !== list.name) parts.push(list.planName);
  if (list.archived) parts.push("deleted");
  return parts.join(" · ");
}

/** `/shopping`'s address for one list; the main list's is `?list=main`. */
export function shoppingListHref(id: string): string {
  return `/shopping?list=${encodeURIComponent(id)}`;
}

/**
 * The device's last-used list (Dd5), per browser: a convenience only, so
 * every read and write is wrapped — a private window keeps nothing and the
 * main list is the answer.
 */
export const CURRENT_LIST_STORAGE_KEY = "shopping-list";

const currentListeners = new Set<() => void>();

export function readCurrentShoppingList(): string {
  try {
    return (
      window.localStorage.getItem(CURRENT_LIST_STORAGE_KEY) ??
      MAIN_SHOPPING_LIST
    );
  } catch {
    return MAIN_SHOPPING_LIST;
  }
}

export function saveCurrentShoppingList(id: string): void {
  try {
    if (readCurrentShoppingList() === id) return;
    window.localStorage.setItem(CURRENT_LIST_STORAGE_KEY, id);
  } catch {
    /* A per-viewer convenience only. */
  }
  for (const listener of currentListeners) listener();
}

export function subscribeCurrentShoppingList(listener: () => void): () => void {
  currentListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === CURRENT_LIST_STORAGE_KEY || event.key === null) {
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    currentListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The browser storage key a list's ticks live under: the main list keeps
 * the key it always had (no ticks lost on the update), another list adds
 * its id (Dd3).
 */
export function listStorageKey(base: string, list: string): string {
  return list === MAIN_SHOPPING_LIST ? base : `${base}:${list}`;
}
