/**
 * The words for a shopping list's layers (epic 50, 50a), shared by the
 * page's "Changes" panel, the CLI's `shopping changes` and the seat's
 * commit subjects — and the compact rows 50b's model reads.
 *
 * Pure, and safe in the browser.
 */
import { AISLE_LABELS } from "./aisles";
import {
  isStaleLayer,
  sortLayers,
  type ShoppingLayer,
  type ShoppingLayerOp,
} from "./shoppingLayers";
import type { ShoppingItem } from "./shoppingTypes";
import {
  shoppingNameOf,
  type ShoppingRow,
  type ShoppingView,
} from "./shoppingView";

/** A layer as the Changes panel lists it. */
export interface ShoppingLayerListing {
  layer: ShoppingLayer;
  /** "Leave off strained pear poaching liquid", one per op. */
  ops: string[];
  /** The ops joined, and the reason: what a commit subject or a line says. */
  text: string;
  /** None of its items is on the list: hidden, applied to nothing (Da4). */
  stale: boolean;
}

/** The names an op's items are, as the list labels them, in order, once each. */
function namesOf(op: ShoppingLayerOp, byId: Map<string, ShoppingItem>): string {
  const names = [
    ...new Set(
      op.ids.flatMap((id) => {
        const item = byId.get(id);
        if (!item) return [];
        const { key, label } = shoppingNameOf(item.text);
        return [key.startsWith("text:") ? item.text.trim() : label];
      }),
    ),
  ];
  if (names.length === 0) return "lines no longer on the list";
  return names.length <= 2
    ? names.join(" and ")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** One op in words: "Merge cinnamon and granulated sugar as cinnamon sugar". */
export function describeOp(
  op: ShoppingLayerOp,
  byId: Map<string, ShoppingItem>,
): string {
  const names = namesOf(op, byId);
  switch (op.op) {
    case "merge":
      return [
        `Merge ${names}`,
        op.name ? ` as ${op.name}` : "",
        op.amount ? ` (${op.amount})` : "",
      ].join("");
    case "rename":
      return `Rename ${names} to ${op.name}`;
    case "drop":
      return `Leave off ${names}: ${op.reason}`;
    case "amount":
      return op.amount ? `${names}: ${op.amount}` : `${names} in ${op.unit}`;
    case "note":
      return `Note on ${names}: ${op.text}`;
    case "aisle":
      return `${names} in ${AISLE_LABELS[op.aisle]}`;
  }
}

/** Each layer in the order it applies, in words, with whether it is stale. */
export function listLayers(
  layers: readonly ShoppingLayer[],
  items: readonly ShoppingItem[],
): ShoppingLayerListing[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const present = new Set(byId.keys());
  return sortLayers(layers).map((layer) => {
    const ops = layer.ops.map((op) => describeOp(op, byId));
    const joined = ops.join("; ");
    return {
      layer,
      ops,
      text:
        layer.reason && !layer.ops.every((op) => op.op === "drop")
          ? `${joined} (${layer.reason})`
          : joined,
      stale: isStaleLayer(layer, present),
    };
  });
}

// --- for the model (50b) -----------------------------------------------------

/** One row as a prompt reads it: compact, and only what a judgement needs. */
export interface ShoppingPromptRow {
  /** The row's key: what a suggestion names it by. */
  key: string;
  /** As the list writes it: "≈ 2⅜ cups heavy cream". */
  label: string;
  name: string;
  /** The row's amount, when one was read. */
  amount?: string;
  aisle?: string;
  /** The lines behind it, as written, each with its recipe's name. */
  lines: { text: string; recipe?: string }[];
}

/**
 * The composed list's rows to buy, compact (Da9): what 50b's "Tidy with the
 * model" sends — key, label, name, amount, aisle and the source lines with
 * their recipes. The recipes' step text, which 50b also needs ("the recipe
 * makes it"), is the seat's to read (`readRecipe`'s `instructions`); it is
 * not here.
 */
export function promptRowsOf(view: ShoppingView): ShoppingPromptRow[] {
  const rows: ShoppingRow[] = [
    ...view.stores.flatMap((list) =>
      list.sections.flatMap((section) => section.rows),
    ),
    ...view.onHand,
  ];
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    name: row.name,
    ...(row.quantity ? { amount: row.quantity } : {}),
    ...(row.aisle ? { aisle: AISLE_LABELS[row.aisle] } : {}),
    lines: (row.sources ?? [])
      .filter((source) => !source.alternative)
      .map((source) => ({
        text: source.scale ? `${source.text} (×${source.scale})` : source.text,
        ...(source.recipeName || source.recipe
          ? { recipe: source.recipeName ?? source.recipe }
          : {}),
      })),
  }));
}
