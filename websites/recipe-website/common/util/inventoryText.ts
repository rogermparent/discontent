/**
 * An inventory as text (25c/D10): what Export prints, what Import reads, and
 * the browser's stored list — with the pre-U6 overlay form it migrates from.
 *
 * Text, because it is the one format that crosses every boundary the
 * inventory has to — the editor and the static export, two browsers, a note
 * on a phone, the agent's `inventory_set --file` — without either side
 * knowing about the other.
 */
import { fold } from "../components/SearchForm/queryLanguage";

/** Longest item kept; past this a line is prose, not a bottle. */
export const MAX_ITEM_LENGTH = 80;
/** Most items kept from one import. */
export const MAX_ITEMS = 500;

/** Two entries are the same item when their keys match: case, accents and spacing aside. */
export function inventoryKey(item: string): string {
  return fold(item).replace(/\s+/g, " ").trim();
}

/** `items` without repeats (the first spelling wins), blanks dropped. */
export function dedupeItems(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.replace(/\s+/g, " ").trim();
    const key = inventoryKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** One item per line, sorted — what Export shows and Copy copies. */
export function exportInventory(items: string[]): string {
  return [...dedupeItems(items)]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .join("\n");
}

export interface ParsedInventoryText {
  items: string[];
  /** Entries dropped as too long or past the cap. */
  skipped: number;
}

function fromJson(text: string): string[] | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && "items" in parsed
        ? (parsed as { items: unknown }).items
        : undefined;
    if (!Array.isArray(list)) return undefined;
    return list.filter((item): item is string => typeof item === "string");
  } catch {
    return undefined;
  }
}

/** Bullets, numbering, checkboxes and `#` comments off one line. */
function cleanLine(line: string): string {
  return line
    .replace(/(?:^|\s)#.*$/, "")
    .replace(/^\s*(?:[-*•▪+]\s+|\d+[.)]\s+)?/, "")
    .replace(/^\[[ xX✓]?\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Read pasted text as items, tolerantly: one per line, or one line split on
 * commas or semicolons; list markup stripped; a JSON array or `{items}`
 * accepted as is.
 */
export function parseInventoryText(text: string): ParsedInventoryText {
  const trimmed = text.trim();
  let raw: string[];
  const json = /^[[{]/.test(trimmed) ? fromJson(trimmed) : undefined;
  if (json) {
    raw = json;
  } else {
    const lines = trimmed.split(/\r?\n/).map(cleanLine).filter(Boolean);
    raw =
      lines.length === 1 && /[,;]/.test(lines[0])
        ? lines[0].split(/[,;]/)
        : lines;
  }
  let skipped = 0;
  const kept = raw
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => {
      if (item.length <= MAX_ITEM_LENGTH) return true;
      skipped += 1;
      return false;
    });
  const items = dedupeItems(kept);
  if (items.length > MAX_ITEMS) skipped += items.length - MAX_ITEMS;
  return { items: items.slice(0, MAX_ITEMS), skipped };
}

export type ImportMode = "add" | "replace";

/** What the list becomes after an import. */
export function applyImport(
  current: string[],
  incoming: string[],
  mode: ImportMode,
): string[] {
  return mode === "replace"
    ? dedupeItems(incoming)
    : dedupeItems([...current, ...incoming]);
}

/**
 * The stored shape: before U6, one browser's changes on top of the editor's
 * shared list; since, `added` is the whole list (`storedList`). Both hold
 * items as written; they are compared by `inventoryKey`.
 */
export interface InventoryOverlay {
  added: string[];
  removed: string[];
}

export const EMPTY_OVERLAY: InventoryOverlay = { added: [], removed: [] };

/** What this browser has: (shared − removed) ∪ added. */
export function applyOverlay(
  shared: string[],
  overlay: InventoryOverlay,
): string[] {
  const removed = new Set(overlay.removed.map(inventoryKey));
  return dedupeItems([
    ...shared.filter((item) => !removed.has(inventoryKey(item))),
    ...overlay.added,
  ]);
}

/**
 * The stored list's format since U6 (usability pass, 2026-10-15): the same
 * `{added, removed}` shape under the same key — so a reader that takes
 * `added` (the homepage tile, `/drinks`) reads it unchanged — with `added`
 * now this browser's **whole** list, `removed` empty, and `version: 2`.
 *
 * Before U6 the editor stored an overlay on its shared list: the browser's
 * list was (shared − removed) ∪ added, and `added` alone was only part of
 * it. A value without the version is that old form, and `migrateOverlay`
 * turns it into the new one once.
 */
export const OVERLAY_VERSION = 2;

/** The stored value for a whole browser list (U6). */
export function storedList(items: string[]): string {
  return JSON.stringify({
    added: dedupeItems(items),
    removed: [],
    version: OVERLAY_VERSION,
  });
}

/** A stored value in the pre-U6 overlay form: an object with no `version: 2`. */
export function isLegacyOverlay(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return (
      !!parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      (parsed as { version?: unknown }).version !== OVERLAY_VERSION
    );
  } catch {
    return false;
  }
}

/**
 * The browser's whole list from a pre-U6 overlay: (shared − removed) ∪
 * added, given the shared list it was made over — the signed-in editor's
 * saved inventory — or just `added` where there never was one (the export).
 */
export function migrateOverlay(
  raw: string | null,
  shared: string[] = [],
): string[] {
  return applyOverlay(shared, parseOverlay(raw));
}

/** Read a stored overlay, forgiving anything malformed. */
export function parseOverlay(raw: string | null): InventoryOverlay {
  if (!raw) return EMPTY_OVERLAY;
  try {
    const parsed = JSON.parse(raw) as Partial<InventoryOverlay>;
    const strings = (value: unknown) =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
    return {
      added: dedupeItems(strings(parsed.added)),
      removed: dedupeItems(strings(parsed.removed)),
    };
  } catch {
    return EMPTY_OVERLAY;
  }
}
