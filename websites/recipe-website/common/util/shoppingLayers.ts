/**
 * The shopping list as layers (epic 50, 50a): what a person — or, from 50b,
 * a model — changed about **this** list, over the rows the items make.
 *
 * The list is composed in three steps (`buildShoppingView` with a
 * `compose`, `shoppingView.ts`):
 *
 * 1. **Base** — the rows as the items make them: each line parsed, one row
 *    per ingredient name (35-D3). What "As written" shows.
 * 2. **Rules** — what applies to every list, matched by name: 49a's merge
 *    decisions (`shoppingMerges.ts`, stored as they were), and **leave
 *    off**, for things never bought. A small built-in set covers water;
 *    a rule can leave off another name, or bring a built-in one back.
 * 3. **Layers** — this list's own changes, an ordered stack tied to item
 *    ids, never to names: merge, rename, drop, an amount (or a unit to
 *    convert into), a note, an aisle. A layer is one or more of those
 *    applied together, with one reason; it can be turned off (undo) and on
 *    again, or removed.
 *
 * Nothing composed is stored (35-D3): a layer and a rule are each one file,
 * written by the editor's seat; the rows they make are worked out on every
 * read, like every other row.
 *
 * Pure, and safe in the browser: nothing here names a file.
 */
import { isAisle, type Aisle } from "./aisles";
import { nameKey, toName } from "./ingredientNames";
import { ASKABLE_UNITS, mergeIdOf, type AskableUnit } from "./shoppingMerges";

// --- layers ------------------------------------------------------------------

/** Who made a change: the person, or a model (50b) and which. */
export interface ShoppingLayerBy {
  kind: "you" | "model";
  /** The model's label, for a model's change ("qwen3:8b"). */
  model?: string;
}

/** The rows these item ids are in, as one row: its name and amount, if given. */
export interface ShoppingMergeOp {
  op: "merge";
  ids: string[];
  name?: string;
  amount?: string;
}

/** The rows these ids are in, called `name`. */
export interface ShoppingRenameOp {
  op: "rename";
  ids: string[];
  name: string;
}

/** The rows these ids are in, off this list: "the recipe makes it". */
export interface ShoppingDropOp {
  op: "drop";
  ids: string[];
  reason: string;
}

/**
 * The rows' amount: the person's own (`amount`), or the list's sum in
 * another unit (`unit`, converted by the code — 49c's `amountInUnit`).
 */
export interface ShoppingAmountOp {
  op: "amount";
  ids: string[];
  amount?: string;
  unit?: AskableUnit;
}

/** A line under the row: "or make from ~4 pears". */
export interface ShoppingNoteOp {
  op: "note";
  ids: string[];
  text: string;
}

/** The rows' aisle on this list. */
export interface ShoppingAisleOp {
  op: "aisle";
  ids: string[];
  aisle: Aisle;
}

export type ShoppingLayerOp =
  | ShoppingMergeOp
  | ShoppingRenameOp
  | ShoppingDropOp
  | ShoppingAmountOp
  | ShoppingNoteOp
  | ShoppingAisleOp;

export type ShoppingLayerOpKind = ShoppingLayerOp["op"];

export const SHOPPING_LAYER_OPS = [
  "merge",
  "rename",
  "drop",
  "amount",
  "note",
  "aisle",
] as const satisfies readonly ShoppingLayerOpKind[];

/**
 * One change to this list (Da2), stored as one file named by its id. Its
 * ops apply together, in order; layers apply in id order (ULIDs sort by
 * when they were made).
 */
export interface ShoppingLayer {
  /** A lowercase ULID. */
  id: string;
  ops: ShoppingLayerOp[];
  /** Why, in a few words: "the recipe makes it". */
  reason?: string;
  /** The person's note to the model (50c): stored, not read here. */
  note?: string;
  by: ShoppingLayerBy;
  /** ISO time it was made. */
  at: string;
  /** Off keeps the file: undo is turning it back on. */
  on: boolean;
  /** The suggestion it came from (50b), when a model's. */
  from?: string;
}

export const SHOPPING_LAYER_KEYS = [
  "id",
  "ops",
  "reason",
  "note",
  "by",
  "at",
  "on",
  "from",
] as const satisfies readonly (keyof ShoppingLayer)[];

/** A layer's id: a ULID, lower case (Crockford base32). */
export const LAYER_ID_PATTERN = /^[0-9a-hjkmnp-tv-z]{26}$/;

/** An item id a layer may name: what the seat writes, or close enough. */
export const LAYER_ITEM_ID_PATTERN = /^[0-9a-z]{10,64}$/;

/** Bounds a layer is read within (and the seat's schema writes). */
export const LAYER_LIMITS = {
  ops: 20,
  ids: 500,
  name: 120,
  amount: 60,
  reason: 300,
  text: 500,
  note: 2000,
  model: 80,
  from: 64,
} as const;

/** Layers a list may hold: far more than a person or a pass ever makes. */
export const MAX_SHOPPING_LAYERS = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text && text.length <= max ? text : undefined;
}

function itemIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim().toLowerCase())
    .filter((id) => LAYER_ITEM_ID_PATTERN.test(id));
  return [...new Set(ids)].slice(0, LAYER_LIMITS.ids);
}

/** One op, read leniently: `null` when it is not one the list knows. */
export function parseShoppingLayerOp(raw: unknown): ShoppingLayerOp | null {
  if (!isRecord(raw)) return null;
  const ids = itemIds(raw.ids);
  if (ids.length === 0) return null;
  switch (raw.op) {
    case "merge": {
      if (ids.length < 2) return null;
      const name = boundedText(raw.name, LAYER_LIMITS.name);
      const amount = boundedText(raw.amount, LAYER_LIMITS.amount);
      return {
        op: "merge",
        ids,
        ...(name ? { name } : {}),
        ...(amount ? { amount } : {}),
      };
    }
    case "rename": {
      const name = boundedText(raw.name, LAYER_LIMITS.name);
      return name ? { op: "rename", ids, name } : null;
    }
    case "drop": {
      const reason = boundedText(raw.reason, LAYER_LIMITS.reason);
      return reason ? { op: "drop", ids, reason } : null;
    }
    case "amount": {
      const amount = boundedText(raw.amount, LAYER_LIMITS.amount);
      const unit = (ASKABLE_UNITS as readonly unknown[]).includes(raw.unit)
        ? (raw.unit as AskableUnit)
        : undefined;
      /* Exactly one: an amount of the person's, or a unit to convert into. */
      if (amount && !unit) return { op: "amount", ids, amount };
      if (unit && !amount) return { op: "amount", ids, unit };
      return null;
    }
    case "note": {
      const text = boundedText(raw.text, LAYER_LIMITS.text);
      return text ? { op: "note", ids, text } : null;
    }
    case "aisle":
      return isAisle(raw.aisle) ? { op: "aisle", ids, aisle: raw.aisle } : null;
    default:
      return null;
  }
}

/** A layer as stored: known keys only, in `SHOPPING_LAYER_KEYS` order. */
export function canonicalShoppingLayer(layer: ShoppingLayer): ShoppingLayer {
  const out: Record<string, unknown> = {};
  for (const key of SHOPPING_LAYER_KEYS) {
    const value = layer[key];
    if (value === undefined || value === null) continue;
    if (value === "" && key !== "at") continue;
    out[key] = value;
  }
  return out as unknown as ShoppingLayer;
}

/**
 * A stored layer, read leniently as an item is: `null` without a usable id
 * or any op it knows. The file name is the id, whatever the file says
 * (`fallbackId`). An unknown op is dropped, the rest kept.
 */
export function parseShoppingLayer(
  raw: unknown,
  fallbackId?: string,
): ShoppingLayer | null {
  if (!isRecord(raw)) return null;
  const id = (
    fallbackId ?? (typeof raw.id === "string" ? raw.id : "")
  ).toLowerCase();
  if (!LAYER_ID_PATTERN.test(id)) return null;
  const ops = (Array.isArray(raw.ops) ? raw.ops : [])
    .slice(0, LAYER_LIMITS.ops)
    .map(parseShoppingLayerOp)
    .filter((op): op is ShoppingLayerOp => op !== null);
  if (ops.length === 0) return null;
  const by: ShoppingLayerBy =
    isRecord(raw.by) && raw.by.kind === "model"
      ? {
          kind: "model",
          ...(boundedText(raw.by.model, LAYER_LIMITS.model)
            ? { model: boundedText(raw.by.model, LAYER_LIMITS.model) }
            : {}),
        }
      : { kind: "you" };
  const reason = boundedText(raw.reason, LAYER_LIMITS.reason);
  const note =
    typeof raw.note === "string" &&
    raw.note.trim() &&
    raw.note.trim().length <= LAYER_LIMITS.note
      ? raw.note.trim()
      : undefined;
  const from = boundedText(raw.from, LAYER_LIMITS.from);
  return canonicalShoppingLayer({
    id,
    ops,
    ...(reason ? { reason } : {}),
    ...(note ? { note } : {}),
    by,
    at: typeof raw.at === "string" ? raw.at : "",
    /* Only an explicit `false` is off: a hand-written layer is on. */
    on: raw.on !== false,
    ...(from ? { from } : {}),
  });
}

/** Every item id a layer's ops name. */
export function layerItemIds(layer: ShoppingLayer): string[] {
  return [...new Set(layer.ops.flatMap((op) => op.ids))];
}

/**
 * A layer none of whose ids is on the list any more (Da4): hidden, and
 * applied to nothing. The seat deletes such layers when it removes their
 * last items.
 */
export function isStaleLayer(
  layer: ShoppingLayer,
  present: ReadonlySet<string>,
): boolean {
  return !layerItemIds(layer).some((id) => present.has(id));
}

/** Layers in the order they apply: by id. */
export function sortLayers(layers: readonly ShoppingLayer[]): ShoppingLayer[] {
  return [...layers].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// --- rules -------------------------------------------------------------------

/**
 * A rule for every list, by name (Da3). 50a has one kind: **leave off** —
 * a name never bought (`leaveOff: true`), or a built-in one bought after
 * all (`leaveOff: false`, what Restore writes for water).
 */
export interface ShoppingRule {
  /** `ruleIdOf(kind, key)`: 16 hex characters. Names the file. */
  id: string;
  kind: "leave-off";
  /** The name key it matches (`shoppingNameOf(...).key`). */
  key: string;
  /** The name as the person gave it, for reading back. */
  name?: string;
  leaveOff: boolean;
  /** Why, shown beside a row it leaves off. */
  reason?: string;
  /** ISO time of the decision. */
  decidedAt: string;
}

export const SHOPPING_RULE_KEYS = [
  "id",
  "kind",
  "key",
  "name",
  "leaveOff",
  "reason",
  "decidedAt",
] as const satisfies readonly (keyof ShoppingRule)[];

export const RULE_ID_PATTERN = /^[0-9a-f]{16}$/;

/** A rule's stable id: the same name, the same file on every device. */
export function ruleIdOf(kind: ShoppingRule["kind"], key: string): string {
  return mergeIdOf([`${kind}:${key}`]);
}

/** A rule as stored: known keys only, in order. */
export function canonicalShoppingRule(rule: ShoppingRule): ShoppingRule {
  const out: Record<string, unknown> = {};
  for (const key of SHOPPING_RULE_KEYS) {
    const value = rule[key];
    if (value === undefined || value === null) continue;
    if (value === "" && key !== "decidedAt") continue;
    out[key] = value;
  }
  return out as unknown as ShoppingRule;
}

/** A stored rule, read leniently: `null` without a key or a kind it knows. */
export function parseShoppingRule(
  raw: unknown,
  fallbackId?: string,
): ShoppingRule | null {
  if (!isRecord(raw) || raw.kind !== "leave-off") return null;
  const key = boundedText(raw.key, 160);
  if (!key || typeof raw.leaveOff !== "boolean") return null;
  const id = ruleIdOf("leave-off", key);
  /* A file whose name is not its key's id is a hand edit gone wrong. */
  if (fallbackId !== undefined && fallbackId.toLowerCase() !== id) return null;
  const name = boundedText(raw.name, LAYER_LIMITS.name);
  const reason = boundedText(raw.reason, LAYER_LIMITS.reason);
  return canonicalShoppingRule({
    id,
    kind: "leave-off",
    key,
    ...(name ? { name } : {}),
    leaveOff: raw.leaveOff,
    ...(reason ? { reason } : {}),
    decidedAt: typeof raw.decidedAt === "string" ? raw.decidedAt : "",
  });
}

/** Water, as recipes write it (Da3): from the tap, never bought. */
export const BUILT_IN_LEAVE_OFF_NAMES = [
  "water",
  "cold water",
  "warm water",
  "hot water",
  "boiling water",
  "tap water",
  "ice water",
] as const;

/** The reason a built-in leave-off reads with. */
export const BUILT_IN_LEAVE_OFF_REASON = "tap water";

/** The built-in set by name key ("cold water" keys as `water`). */
export const BUILT_IN_LEAVE_OFF: ReadonlySet<string> = new Set(
  BUILT_IN_LEAVE_OFF_NAMES.map((name) => nameKey(toName(name))),
);

/** Why a name key is left off every list, if it is. */
export interface LeaveOffVerdict {
  reason: string;
  /** The built-in set's, not a rule's. */
  builtIn: boolean;
  /** The rule that says so (none for a built-in). */
  rule?: string;
}

/**
 * Name key → why it is left off, for the built-ins and the rules: a rule
 * wins over a built-in either way (Restore of water writes `leaveOff:
 * false`).
 */
export function leaveOffVerdicts(
  rules: readonly ShoppingRule[],
): Map<string, LeaveOffVerdict> {
  const out = new Map<string, LeaveOffVerdict>();
  for (const key of BUILT_IN_LEAVE_OFF) {
    out.set(key, { reason: BUILT_IN_LEAVE_OFF_REASON, builtIn: true });
  }
  for (const rule of rules) {
    if (rule.kind !== "leave-off") continue;
    if (!rule.leaveOff) out.delete(rule.key);
    else {
      out.set(rule.key, {
        reason: rule.reason ?? "never bought",
        builtIn: false,
        rule: rule.id,
      });
    }
  }
  return out;
}
