/**
 * 50c: the walkthrough — one suggestion at a time, a model's (50b's tidy
 * runs) or the list's own (49a's "same thing, different names"), with what
 * the list reads now and after; an edit of a model's suggestion before it
 * is accepted; and a change of this list said again as a rule for every
 * list ("Always do this"). Pure, and safe in the browser.
 *
 * - **After is composed, not guessed** (Dc2): the list with the
 *   suggestion's ops added as one more layer, through 50a's own
 *   `buildShoppingView` — the same composition the list itself is.
 * - **Edits keep the suggestion's shape** (Dc4): names, amounts and notes
 *   may change; the ops, their rows and the rest may not.
 * - **A rule can be said by names** (Dc5): a merge, a rename, a leave-off
 *   and an aisle; an amount or a note belongs to this list's lines.
 */
import { AISLE_LABELS, type Aisle } from "./aisles";
import { DEFAULT_STAPLES } from "./makeable";
import { namesOf } from "./shoppingChanges";
import type { ShoppingProposal } from "./shoppingConsolidate";
import {
  BUILT_IN_LEAVE_OFF,
  BUILT_IN_LEAVE_OFF_REASON,
  ruleIsOn,
  type ShoppingLayer,
  type ShoppingLayerOp,
  type ShoppingRule,
} from "./shoppingLayers";
import type { ShoppingMerge } from "./shoppingMerges";
import { type TidyRunView, type TidySuggestionView } from "./shoppingTidy";
import type { ShoppingItem, ShoppingSettings } from "./shoppingTypes";
import {
  buildShoppingView,
  orParents,
  shoppingNameOf,
  type ShoppingRow,
  type ShoppingView,
} from "./shoppingView";

// --- Now → After ---------------------------------------------------------------

/** What the list is composed from: the page's state. */
export interface WalkCompose {
  items: readonly ShoppingItem[];
  settings: ShoppingSettings;
  inventory?: readonly string[];
  staples?: readonly string[];
  merges?: readonly ShoppingMerge[];
  layers?: readonly ShoppingLayer[];
  rules?: readonly ShoppingRule[];
}

/** One line of a card's Now or After. */
export interface WalkLine {
  key: string;
  label: string;
  /** After: off the list, and why. */
  leftOff?: string;
  /** Lines the row carries under it ("≈ 2⅜ cups needed"). */
  notes?: string[];
  /** After: the aisle it moved to, when the suggestion moves it. */
  movedTo?: string;
}

export interface WalkDiff {
  now: WalkLine[];
  after: WalkLine[];
}

/** The candidate layer's id: sorts after every ULID, so it applies last. */
const CANDIDATE_ID = "zzzzzzzzzzzzzzzzzzzzzzzzzz";

/** The list as the page composes it, with `extra` layers on top. */
export function composeWalk(
  input: WalkCompose,
  extra: readonly ShoppingLayer[] = [],
): ShoppingView {
  return buildShoppingView(
    [...input.items],
    input.settings,
    [...(input.inventory ?? [])],
    [...(input.staples ?? DEFAULT_STAPLES)],
    input.merges ?? [],
    { layers: [...(input.layers ?? []), ...extra], rules: input.rules ?? [] },
  );
}

/** Every row of a view a person reads: to buy, probably on hand, ticked. */
function rowsOf(view: ShoppingView): ShoppingRow[] {
  return [
    ...view.stores.flatMap((list) =>
      list.sections.flatMap((section) => section.rows),
    ),
    ...view.onHand,
    ...view.checked,
  ];
}

function lineOf(row: ShoppingRow): WalkLine {
  return {
    key: row.key,
    label: row.label,
    ...(row.notes && row.notes.length > 0 ? { notes: [...row.notes] } : {}),
  };
}

/**
 * Now → After for a set of ops (Dc2): the rows the ops' items are in on the
 * list as composed now, and the same items' rows — or what was left off,
 * and why — with the ops added as the last layer. Through `composeWalk`,
 * so After is exactly what Accept would make.
 */
export function suggestionDiff(
  input: WalkCompose,
  ops: readonly ShoppingLayerOp[],
): WalkDiff {
  const ids = new Set(ops.flatMap((op) => op.ids));
  const touches = (row: ShoppingRow) => row.ids.some((id) => ids.has(id));
  const before = composeWalk(input);
  const after = composeWalk(input, [
    {
      id: CANDIDATE_ID,
      ops: [...ops],
      by: { kind: "model" },
      at: "",
      on: true,
    },
  ]);
  const beforeRows = rowsOf(before).filter(touches);
  const aisleOf = new Map<string, Aisle | undefined>();
  for (const row of beforeRows) {
    for (const id of row.ids) aisleOf.set(id, row.aisle);
  }
  const now = beforeRows.map(lineOf);
  const afterLines: WalkLine[] = rowsOf(after)
    .filter(touches)
    .map((row) => {
      const was = row.ids.map((id) => aisleOf.get(id)).find(Boolean);
      return {
        ...lineOf(row),
        ...(row.aisle && was && row.aisle !== was
          ? { movedTo: AISLE_LABELS[row.aisle] }
          : {}),
      };
    });
  for (const off of after.leftOff) {
    if (off.id !== CANDIDATE_ID || !touches(off.row)) continue;
    afterLines.push({ ...lineOf(off.row), leftOff: off.reason });
  }
  return { now, after: afterLines };
}

// --- Edit before Accept ----------------------------------------------------------

/** One field Edit offers: an op's name, amount, added amount or note. */
export interface WalkField {
  /** `<op index>:<field>`: what `applyWalkEdits` reads. */
  id: string;
  op: number;
  field: "name" | "amount" | "add" | "text";
  /** "Name for cinnamon and granulated sugar". */
  label: string;
  value: string;
  /** Empty is allowed (a merge's name or amount: the list's own). */
  optional?: true;
}

/** The fields a suggestion's ops let a person change (Dc4). */
export function walkFields(
  ops: readonly ShoppingLayerOp[],
  items: readonly ShoppingItem[],
): WalkField[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ops.flatMap((op, index): WalkField[] => {
    const names = namesOf(op, byId);
    const field = (
      name: WalkField["field"],
      label: string,
      value: string,
      optional?: true,
    ): WalkField => ({
      id: `${index}:${name}`,
      op: index,
      field: name,
      label,
      value,
      ...(optional ? { optional } : {}),
    });
    switch (op.op) {
      case "merge":
        return [
          field("name", `Name for ${names}`, op.name ?? "", true),
          field("amount", `Amount for ${names}`, op.amount ?? "", true),
        ];
      case "rename":
        return [field("name", `Name for ${names}`, op.name)];
      case "amount":
        if (op.amount)
          return [field("amount", `Amount for ${names}`, op.amount)];
        if (op.add) return [field("add", `More ${names}`, op.add)];
        return [];
      case "note":
        return [field("text", `Note on ${names}`, op.text)];
      default:
        return [];
    }
  });
}

/**
 * The ops with a person's values (field id → text): `{ops}` or `{error}`.
 * An optional field left empty drops it (a merge reads its own name and
 * sum); any other empty field is refused.
 */
export function applyWalkEdits(
  ops: readonly ShoppingLayerOp[],
  values: Readonly<Record<string, string>>,
): { ops: ShoppingLayerOp[] } | { error: string } {
  const out: ShoppingLayerOp[] = [];
  for (const [index, op] of ops.entries()) {
    const value = (field: string) => {
      const typed = values[`${index}:${field}`];
      return typed === undefined
        ? undefined
        : typed.replace(/\s+/g, " ").trim();
    };
    switch (op.op) {
      case "merge": {
        const name = value("name") ?? op.name ?? "";
        const amount = value("amount") ?? op.amount ?? "";
        const { name: _n, amount: _a, ...rest } = op;
        void _n;
        void _a;
        out.push({
          ...rest,
          ...(name ? { name } : {}),
          ...(amount ? { amount } : {}),
        });
        break;
      }
      case "rename": {
        const name = value("name") ?? op.name;
        if (!name) return { error: "A new name can't be empty." };
        out.push({ ...op, name });
        break;
      }
      case "amount": {
        if (op.amount !== undefined) {
          const amount = value("amount") ?? op.amount;
          if (!amount) return { error: "An amount can't be empty." };
          out.push({ ...op, amount });
        } else if (op.add !== undefined) {
          const add = value("add") ?? op.add;
          if (!add) return { error: "An amount to add can't be empty." };
          out.push({ ...op, add });
        } else out.push({ ...op });
        break;
      }
      case "note": {
        const text = value("text") ?? op.text;
        if (!text) return { error: "A note can't be empty." };
        out.push({ ...op, text });
        break;
      }
      default:
        out.push({ ...op });
    }
  }
  return { ops: out };
}

/** The parts of an op Edit may not change: its kind, rows and the rest. */
function shapeOf(op: ShoppingLayerOp): string {
  const ids = [...op.ids].sort();
  switch (op.op) {
    case "merge":
    case "rename":
    case "note":
      return JSON.stringify({ op: op.op, ids });
    case "amount":
      return JSON.stringify({
        op: op.op,
        ids,
        mode:
          op.amount !== undefined
            ? "amount"
            : op.add !== undefined
              ? "add"
              : `unit:${op.unit}`,
      });
    case "drop":
      return JSON.stringify({ op: op.op, ids, reason: op.reason });
    case "aisle":
      return JSON.stringify({ op: op.op, ids, aisle: op.aisle });
  }
}

/** An edit of these ops changes only names, amounts and notes (Dc4). */
export function sameShape(
  original: readonly ShoppingLayerOp[],
  edited: readonly ShoppingLayerOp[],
): boolean {
  return (
    original.length === edited.length &&
    original.every((op, index) => shapeOf(op) === shapeOf(edited[index]))
  );
}

/** The edit changed something. */
export function isEdited(
  original: readonly ShoppingLayerOp[],
  edited: readonly ShoppingLayerOp[],
): boolean {
  /* Review 1: by every field — a signature leaves a note's text out. */
  const full = (ops: readonly ShoppingLayerOp[]) =>
    JSON.stringify(ops.map((op) => ({ ...op, ids: [...op.ids].sort() })));
  return full(original) !== full(edited);
}

// --- "Always do this" ------------------------------------------------------------

/** A rule a change of this list becomes (Dc5), by name keys. */
export type PromotedRule =
  | { kind: "merge"; keys: string[]; name?: string }
  | { kind: "rename"; key: string; name: string; label: string }
  | { kind: "leave-off"; key: string; name: string; reason: string }
  | { kind: "aisle"; key: string; name: string; aisle: Aisle };

export type Promotion =
  { ok: true; rules: PromotedRule[] } | { ok: false; why: string };

/** Why an amount or a note stays this list's: the disabled button says it. */
export const LIST_ONLY_WHY =
  "Amounts and notes stay on this list: they follow its recipes, and another list's lines differ.";

/**
 * A change of this list as rules for every list (Dc5): each op said by the
 * names of its items — a merge of two or more names (49a's decision), a
 * rename, a leave-off and an aisle for each name. An amount, a note, a
 * merge with its own amount and "Check at home first" (a cupboard check of
 * this list, 50b's review 4) are refused, and so is the whole change.
 */
export function promoteLayer(
  layer: Pick<ShoppingLayer, "ops"> & { on?: boolean },
  items: readonly ShoppingItem[],
): Promotion {
  /* Review 5: an undone change is not made a rule for every list. */
  if (layer.on === false) {
    return { ok: false, why: "It is switched off: switch it on first." };
  }
  const parents = orParents(items);
  const byId = new Map(items.map((item) => [item.id, item]));
  const namesFor = (ids: readonly string[]) => {
    const out = new Map<string, string>();
    for (const id of ids) {
      const item = byId.get(id);
      if (!item || parents.has(id)) continue;
      const { key, label } = shoppingNameOf(item.text);
      if (!out.has(key)) {
        out.set(key, key.startsWith("text:") ? item.text.trim() : label);
      }
    }
    return out;
  };
  const rules: PromotedRule[] = [];
  for (const op of layer.ops) {
    const names = namesFor(op.ids);
    if (names.size === 0) {
      return { ok: false, why: "Its lines are no longer on the list." };
    }
    switch (op.op) {
      case "amount":
      case "note":
        return { ok: false, why: LIST_ONLY_WHY };
      case "merge":
        if (op.amount) return { ok: false, why: LIST_ONLY_WHY };
        if (names.size < 2) {
          return {
            ok: false,
            why: "Its lines are one name already: there is nothing to merge by name.",
          };
        }
        rules.push({
          kind: "merge",
          keys: [...names.keys()],
          ...(op.name ? { name: op.name } : {}),
        });
        break;
      case "rename":
        /* Review 2: one name only — a row of several reads its merge's. */
        if (names.size > 1) {
          return {
            ok: false,
            why: "Its row has several names: a rule renames one name, so merge them by name first.",
          };
        }
        for (const [key, name] of names) {
          rules.push({ kind: "rename", key, name, label: op.name });
        }
        break;
      case "drop":
        for (const [key, name] of names) {
          rules.push({ kind: "leave-off", key, name, reason: op.reason });
        }
        break;
      case "aisle":
        if (op.aisle === "check") {
          return {
            ok: false,
            why: "Check at home first is this list's cupboard check, not an aisle by name.",
          };
        }
        for (const [key, name] of names) {
          rules.push({ kind: "aisle", key, name, aisle: op.aisle });
        }
        break;
    }
  }
  return { ok: true, rules };
}

// --- the Rules tier ----------------------------------------------------------------

/** One rule as Changes' "Rules · every list" lists it. */
export interface RuleListing {
  /** What it is, and so what its switch and Remove write. */
  source: "built-in" | "leave-off" | "rename" | "merge" | "apart" | "aisle";
  /** The rule's or decision's id; a built-in's or an aisle's name key. */
  id: string;
  text: string;
  /** Who and why, in a few words. */
  detail: string;
  on: boolean;
  /** A switch: every kind but an aisle (a setting: Remove, or set it again). */
  switchable: boolean;
  /** Remove: every kind but a built-in (switch it off instead). */
  removable: boolean;
  /** The name key a built-in matches: what its switch writes. */
  key?: string;
}

/**
 * The rules for every list, in a fixed order (Dc7): the built-in
 * leave-offs, a person's leave-offs, renames, 49a's merges and kept-apart
 * names, then aisles by name.
 */
export function listRules(
  rules: readonly ShoppingRule[],
  merges: readonly ShoppingMerge[],
  settings: Pick<ShoppingSettings, "aisleOverrides">,
): RuleListing[] {
  const out: RuleListing[] = [];
  const restored = new Set(
    rules
      .filter(
        (rule) => rule.kind === "leave-off" && !rule.leaveOff && ruleIsOn(rule),
      )
      .map((rule) => rule.key),
  );
  for (const key of BUILT_IN_LEAVE_OFF) {
    out.push({
      source: "built-in",
      id: key,
      key,
      text: `Leave off ${key}`,
      detail: `built in · ${BUILT_IN_LEAVE_OFF_REASON}`,
      on: !restored.has(key),
      switchable: true,
      removable: false,
    });
  }
  for (const rule of rules) {
    if (rule.kind !== "leave-off" || !rule.leaveOff) continue;
    out.push({
      source: "leave-off",
      id: rule.id,
      text: `Leave off ${rule.name ?? rule.key}`,
      detail: `yours · ${rule.reason ?? "never bought"}`,
      on: ruleIsOn(rule),
      switchable: true,
      removable: true,
    });
  }
  for (const rule of rules) {
    if (rule.kind !== "rename") continue;
    out.push({
      source: "rename",
      id: rule.id,
      text: `Call ${rule.name ?? rule.key} “${rule.label}”`,
      detail: "yours",
      on: ruleIsOn(rule),
      switchable: true,
      removable: true,
    });
  }
  for (const merge of merges) {
    const merged = merge.status === "merged";
    out.push({
      source: merged ? "merge" : "apart",
      id: merge.id,
      text: merged
        ? `Merge ${merge.keys.join(" + ")}${merge.name ? ` as ${merge.name}` : ""}`
        : `Keep ${merge.keys.join(" and ")} apart`,
      detail: merged ? "same thing, different names" : "not one thing to buy",
      on: merge.on !== false,
      switchable: true,
      removable: true,
    });
  }
  for (const [key, aisle] of Object.entries(settings.aisleOverrides).sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  )) {
    out.push({
      source: "aisle",
      id: key,
      text: `${key.startsWith("text:") ? key.slice(5) : key} in ${AISLE_LABELS[aisle]}`,
      detail: "an aisle for every list",
      on: true,
      switchable: false,
      removable: true,
    });
  }
  return out;
}

// --- the queue -------------------------------------------------------------------

/** Where a card is in the walkthrough. */
export type WalkStatus = "pending" | "accepted" | "skipped" | "apart";

/** One card: a built-in proposal (49a) or a model's suggestion (50b). */
export type WalkCard =
  | {
      source: "built-in";
      id: string;
      status: WalkStatus;
      proposal: ShoppingProposal;
    }
  | {
      source: "model";
      id: string;
      status: WalkStatus;
      suggestion: TidySuggestionView;
      model: string;
    };

/** A built-in card this page answered (it has left the open proposals). */
export interface WalkAnswered {
  status: "accepted" | "apart" | "skipped";
  proposal: ShoppingProposal;
}

/**
 * The cards, in order (Dc3): the built-in proposals first — open ones, and
 * the ones answered on this page — then the picked run's suggestions that
 * still fit the list (a stale one is left out and counted).
 */
export function walkCards(input: {
  proposals: readonly ShoppingProposal[];
  /** Built-in cards answered on this page, in the order they were. */
  answered: ReadonlyMap<string, WalkAnswered>;
  run?: TidyRunView;
  /** Review 4: the list's item ids now — a card naming one gone is no card. */
  present?: ReadonlySet<string>;
}): WalkCard[] {
  const out: WalkCard[] = [];
  const open = new Set(input.proposals.map((proposal) => proposal.id));
  const order = [
    ...input.proposals.map((proposal) => proposal.id),
    ...[...input.answered.keys()].filter((id) => !open.has(id)),
  ];
  const byId = new Map(
    input.proposals.map((proposal) => [proposal.id, proposal]),
  );
  for (const id of order) {
    const answered = input.answered.get(id);
    const proposal = byId.get(id) ?? answered?.proposal;
    if (!proposal) continue;
    out.push({
      source: "built-in",
      id,
      status:
        answered && (!open.has(id) || answered.status === "skipped")
          ? answered.status
          : "pending",
      proposal,
    });
  }
  for (const suggestion of input.run?.suggestions ?? []) {
    if (suggestion.status === "stale") continue;
    if (
      input.present &&
      suggestion.status === "pending" &&
      suggestion.ops.some((op) => op.ids.some((id) => !input.present!.has(id)))
    ) {
      continue;
    }
    out.push({
      source: "model",
      id: suggestion.id,
      status: suggestion.status,
      suggestion,
      model: input.run!.model,
    });
  }
  return out;
}

/** "N accepted · N skipped · N to go" (kept apart counts as skipped). */
export function walkCounts(cards: readonly WalkCard[]): {
  accepted: number;
  skipped: number;
  pending: number;
} {
  let accepted = 0;
  let skipped = 0;
  let pending = 0;
  for (const card of cards) {
    if (card.status === "accepted") accepted += 1;
    else if (card.status === "pending") pending += 1;
    else skipped += 1;
  }
  return { accepted, skipped, pending };
}

/**
 * The card after `current` (an action's): the next pending one after it,
 * else the first pending one, else none — the done state.
 */
export function nextCard(
  cards: readonly WalkCard[],
  current?: string,
): WalkCard | undefined {
  const at = current ? cards.findIndex((card) => card.id === current) : -1;
  return (
    cards.find((card, index) => index > at && card.status === "pending") ??
    cards.find((card) => card.status === "pending")
  );
}

// --- earlier runs ------------------------------------------------------------------

/** One run as "Earlier runs" lists it. */
export interface RunHistoryEntry {
  id: string;
  model: string;
  at: string;
  on: TidyRunView["on"];
  accepted: number;
  skipped: number;
  pending: number;
  stale: number;
}

/** The runs, newest first, with their counts now. */
export function runHistory(runs: readonly TidyRunView[]): RunHistoryEntry[] {
  return [...runs]
    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .map((run) => ({
      id: run.id,
      model: run.model,
      at: run.at,
      on: run.on,
      accepted: run.counts.accepted,
      skipped: run.counts.skipped,
      pending: run.counts.pending,
      stale: run.counts.stale,
    }));
}

/** The run the cards come from: the one picked, else the newest. */
export function pickRun(
  runs: readonly TidyRunView[],
  picked?: string,
): TidyRunView | undefined {
  const sorted = [...runs].sort((a, b) =>
    a.id < b.id ? 1 : a.id > b.id ? -1 : 0,
  );
  return (
    (picked ? sorted.find((run) => run.id === picked) : undefined) ?? sorted[0]
  );
}
