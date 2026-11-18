/**
 * A conflicted record as a choice (48d, B's "a conflict as a recipe
 * choice"): keep both changes, keep only this editor's, or keep only the
 * other side's.
 *
 * The smallest honest "keep both" (Dd4): a three-way merge of the record's
 * JSON by **top-level field**, from git's three stages of the file — the
 * common ancestor (`:1:`), this side (`:2:`, ours) and the other (`:3:`,
 * theirs). A field only one side changed takes that side's value; a field
 * both changed to the same value takes it; tags or aliases both changed
 * merge as a set — what either side added, less what either side
 * removed. A field both changed differently is the one line that asks: the
 * person picks a side for it, and nothing is guessed. A file that is not a
 * JSON object on all three sides (an image, a record added or deleted on one
 * side) offers only the two whole-file choices.
 *
 * Pure: `resolveConflict` reads the stages and writes the result.
 */

export type Side = "ours" | "theirs";

type Json = unknown;
type JsonObject = Record<string, Json>;

function isObject(value: Json): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWordList(value: Json): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

/**
 * The fields whose lists are sets of words, whose order means nothing:
 * a recipe's or group's tags, a term's aliases. Any other list — notes
 * (numbered), a term's pinned recipes (ordered), ingredients — that both
 * sides changed differently is a clash for the person to pick.
 */
const SET_FIELDS = new Set(["tags", "aliases"]);

function isSetField(field: string): boolean {
  return SET_FIELDS.has(field);
}

/** Deep equality for JSON values (key order does not matter). */
export function sameJson(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((entry, index) => sameJson(entry, b[index]));
  }
  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!sameJson(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

/** What one side did to one field, for the page to say. */
export interface FieldChange {
  field: string;
  before: Json;
  after: Json;
  /** For a list of words: what this side added and removed. */
  added?: string[];
  removed?: string[];
}

export interface FieldClash {
  field: string;
  ours: Json;
  theirs: Json;
}

export interface ConflictPlan {
  /** All three stages parsed as objects: "keep both" is possible. */
  mergeable: boolean;
  ours: FieldChange[];
  theirs: FieldChange[];
  /** Fields both sides changed differently: each needs a pick. */
  clashes: FieldClash[];
}

function wordDiff(before: string[], after: string[]) {
  const was = new Set(before);
  const now = new Set(after);
  return {
    added: after.filter((word) => !was.has(word)),
    removed: before.filter((word) => !now.has(word)),
  };
}

function changesOf(base: JsonObject, side: JsonObject): FieldChange[] {
  const keys = new Set([...Object.keys(base), ...Object.keys(side)]);
  const changed: FieldChange[] = [];
  for (const field of keys) {
    if (sameJson(base[field], side[field])) continue;
    const change: FieldChange = {
      field,
      before: base[field],
      after: side[field],
    };
    const before = base[field] ?? [];
    const after = side[field] ?? [];
    if (isSetField(field) && isWordList(before) && isWordList(after)) {
      Object.assign(change, wordDiff(before, after));
    }
    changed.push(change);
  }
  return changed;
}

/** A three-way set merge of two edits of one list of words, in a stable order. */
export function mergeWords(
  base: string[],
  ours: string[],
  theirs: string[],
): string[] {
  const removed = new Set([
    ...wordDiff(base, ours).removed,
    ...wordDiff(base, theirs).removed,
  ]);
  const result: string[] = [];
  for (const word of [...ours, ...theirs]) {
    if (removed.has(word) || result.includes(word)) continue;
    result.push(word);
  }
  return result;
}

function parseObject(text: string | undefined): JsonObject | undefined {
  if (text === undefined) return undefined;
  try {
    const value: Json = JSON.parse(text);
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What each side changed, and which fields clash. `base`/`ours`/`theirs`
 * are the file's text at git's stages 1–3, `undefined` where a stage is
 * missing (added on both sides, or deleted on one).
 */
export function planConflict(
  base: string | undefined,
  ours: string | undefined,
  theirs: string | undefined,
): ConflictPlan {
  const [b, o, t] = [parseObject(base), parseObject(ours), parseObject(theirs)];
  if (!b || !o || !t) {
    return { mergeable: false, ours: [], theirs: [], clashes: [] };
  }
  const oursChanged = changesOf(b, o);
  const theirsChanged = changesOf(b, t);
  const theirsByField = new Map(
    theirsChanged.map((change) => [change.field, change]),
  );
  const clashes: FieldClash[] = [];
  for (const mine of oursChanged) {
    const other = theirsByField.get(mine.field);
    if (!other || sameJson(mine.after, other.after)) continue;
    const before = b[mine.field] ?? [];
    if (
      isSetField(mine.field) &&
      isWordList(before) &&
      isWordList(mine.after ?? []) &&
      isWordList(other.after ?? [])
    ) {
      continue;
    }
    clashes.push({ field: mine.field, ours: mine.after, theirs: other.after });
  }
  return {
    mergeable: true,
    ours: oursChanged,
    theirs: theirsChanged,
    clashes,
  };
}

export class ConflictChoiceError extends Error {}

/**
 * The record with both sides' changes: `picks` names a side for each
 * clashing field. Throws `ConflictChoiceError` when the file cannot be
 * merged by field, or a clash has no pick — the page asks for every one.
 */
export function mergeBoth(
  base: string | undefined,
  ours: string | undefined,
  theirs: string | undefined,
  picks: Record<string, Side>,
): JsonObject {
  const plan = planConflict(base, ours, theirs);
  if (!plan.mergeable) {
    throw new ConflictChoiceError(
      "This file can't be merged field by field: keep one side's.",
    );
  }
  const missing = plan.clashes.filter(
    (clash) => picks[clash.field] !== "ours" && picks[clash.field] !== "theirs",
  );
  if (missing.length > 0) {
    throw new ConflictChoiceError(
      `Both sides changed ${missing.map((clash) => fieldLabel(clash.field)).join(", ")}: choose which to keep.`,
    );
  }
  const b = parseObject(base)!;
  const o = parseObject(ours)!;
  const t = parseObject(theirs)!;
  const clashing = new Set(plan.clashes.map((clash) => clash.field));
  /* Ours' key order first, then any field only theirs has. */
  const fields = [
    ...new Set([...Object.keys(o), ...Object.keys(t), ...Object.keys(b)]),
  ];
  const result: JsonObject = {};
  for (const field of fields) {
    let value: Json;
    if (clashing.has(field)) {
      value = picks[field] === "ours" ? o[field] : t[field];
    } else if (sameJson(b[field], o[field])) {
      value = t[field];
    } else if (sameJson(b[field], t[field]) || sameJson(o[field], t[field])) {
      value = o[field];
    } else {
      /* Both changed a list of words: planConflict let it through as a set. */
      value = mergeWords(
        (b[field] as string[] | undefined) ?? [],
        (o[field] as string[] | undefined) ?? [],
        (t[field] as string[] | undefined) ?? [],
      );
      /* Both emptied a list neither had to begin with: leave it out. */
      if (
        (value as string[]).length === 0 &&
        (b[field] === undefined ||
          o[field] === undefined ||
          t[field] === undefined)
      ) {
        value = undefined;
      }
    }
    if (value !== undefined) result[field] = value;
  }
  return result;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  description: "Description",
  ingredients: "Ingredients",
  instructions: "Steps",
  tags: "Tags",
  servings: "Servings",
  yield: "Yield",
  prepTime: "Prep time",
  cookTime: "Cook time",
  totalTime: "Total time",
  notes: "Notes",
  image: "Picture",
  source: "Source",
  drink: "Drink",
  date: "Date",
  label: "Label",
  items: "Items",
  pinned: "Pinned recipes",
  aliases: "Aliases",
  parent: "Parent",
};

/** "Servings", "Prep time"; an unknown field split from its camelCase. */
export function fieldLabel(field: string): string {
  const known = FIELD_LABELS[field];
  if (known) return known;
  const words = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A value short enough for a line: a number, a short string, a count. */
export function valueWords(value: Json): string {
  if (value === undefined || value === null) return "nothing";
  if (typeof value === "string") {
    const flat = value.replace(/\s+/g, " ").trim();
    return flat.length > 60 ? `“${flat.slice(0, 57)}…”` : `“${flat}”`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length === 1 ? "1 entry" : `${value.length} entries`;
  }
  return "changed";
}

/** One side's change to one field, in a line: "8 → 12", "+ Punch, − Cider". */
export function changeWords(change: FieldChange): string {
  if (change.added || change.removed) {
    const parts = [
      ...(change.added ?? []).map((word) => `+ ${word}`),
      ...(change.removed ?? []).map((word) => `− ${word}`),
    ];
    if (parts.length > 0) return parts.join(", ");
  }
  if (change.before === undefined) return `added ${valueWords(change.after)}`;
  if (change.after === undefined) return "removed";
  const before = valueWords(change.before);
  const after = valueWords(change.after);
  if (before === after) return "changed";
  return `${before} → ${after}`;
}
