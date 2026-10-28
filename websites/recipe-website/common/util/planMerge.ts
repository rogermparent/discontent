/**
 * "Try to merge" (46h, Roger's 43-Dp1-11 pick: "refuse, then offer a button
 * to attempt to merge (and show diffs with your dirty fields ideally)"): a
 * three-way merge of a meal plan's rows. A plan Save is still refused when
 * the stored rows moved since the page rendered (43p1's `PLAN_CHANGED`);
 * the page then reads the stored rows ("theirs") and merges them with the
 * person's unsaved draft ("mine") over the rows the draft was made over
 * ("base").
 *
 * - **Rows** are matched to the base by what they point at: base rows by
 *   index for mine (the draft only reorders, rescales and removes base
 *   rows), and by recipe or plan slug for theirs — the n-th row naming a
 *   slug is the base's n-th row naming it (a plan may cook one recipe on
 *   two days).
 * - **Fields** (label, note, scale): a field one side changed takes that
 *   side's value; one both sides changed alike takes it; one both changed
 *   differently is a **conflict**, which the person answers.
 * - **Removed** on one side: gone, unless the other side changed that row —
 *   then a conflict: keep it (with that side's changes) or remove it.
 * - **Added** on either side: kept, after the row it follows on its side.
 * - **Order**: one side's reordering wins when the other side kept the
 *   base's order; when both reordered the rows they share differently, a
 *   conflict picks whose order.
 *
 * Pure: plain rows in, plain rows out. The page shows `planMerge`'s lines
 * and conflicts, and writes `resolvePlanMerge`'s rows through the plan's
 * ordinary Save, checked against the stored rows it merged with.
 */
import type { GroupItem } from "../controller/types";
import { scaleBadge, scaleNumber } from "./planPage";

/** Whose value a conflict keeps. */
export type MergeSide = "mine" | "theirs";

/** A row of the person's draft, and the base row it came from. */
export interface MineRow {
  item: GroupItem;
  /** Index into `base`; absent for a row the draft added. */
  base?: number;
}

export interface PlanMergeInput {
  /** The rows the draft was made over (the page as rendered). */
  base: readonly GroupItem[];
  /** The person's unsaved rows, in their order. */
  mine: readonly MineRow[];
  /** The rows stored now. */
  theirs: readonly GroupItem[];
  /** A row's name, for the lines and conflicts. */
  nameOf: (item: GroupItem) => string;
}

export interface PlanConflict {
  /** Stable within one merge: `field:3:scale`, `removed:2`, `order`. */
  id: string;
  kind: "field" | "removed" | "order";
  /** The row's name ("Sugar Cookies"); the plan's for `order`. */
  name: string;
  field?: MergeField;
  /** What keeping each side means, as the page says it. */
  mine: string;
  theirs: string;
}

export interface PlanMerge {
  /** What the person's draft changed, against the base. */
  mine: string[];
  /** What changed in the stored plan meanwhile, against the base. */
  theirs: string[];
  /** What both changed differently: each needs a choice. */
  conflicts: PlanConflict[];
}

const FIELDS = ["label", "note", "scale"] as const;
export type MergeField = (typeof FIELDS)[number];

const FIELD_NAMES: Record<MergeField, string> = {
  label: "label",
  note: "note",
  scale: "scale",
};

function refKey(item: GroupItem): string {
  return item.group !== undefined
    ? `group:${item.group}`
    : `recipe:${item.recipe}`;
}

function text(value: string | undefined): string {
  return (value ?? "").trim();
}

function same(field: MergeField, a: GroupItem, b: GroupItem): boolean {
  return field === "scale"
    ? scaleNumber(a.scale) === scaleNumber(b.scale)
    : text(a[field]) === text(b[field]);
}

/** How a field's value reads in a line: `2×`, `"Mon · Dinner"`, `none`. */
function shown(field: MergeField, item: GroupItem): string {
  if (field === "scale") return scaleBadge(item.scale) ?? "1×";
  const value = text(item[field]);
  return value ? `“${value}”` : "none";
}

/** Each row of `other` → the base index it is, by slug and occurrence. */
function matchToBase(
  base: readonly GroupItem[],
  other: readonly GroupItem[],
): (number | undefined)[] {
  const slots = new Map<string, number[]>();
  base.forEach((item, index) => {
    const key = refKey(item);
    slots.set(key, [...(slots.get(key) ?? []), index]);
  });
  const used = new Map<string, number>();
  return other.map((item) => {
    const key = refKey(item);
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    return slots.get(key)?.[n];
  });
}

/** One side's rows against the base: positions and changed fields. */
interface SideView {
  /** Base index → the side's row. */
  byBase: Map<number, GroupItem>;
  /** The side's sequence: a base index, or a row it added. */
  sequence: ({ base: number } | { added: GroupItem })[];
  /** Did the side reorder the base rows it kept? */
  moved: boolean;
}

function sideView(
  rows: readonly { item: GroupItem; base?: number }[],
): SideView {
  const byBase = new Map<number, GroupItem>();
  const sequence: SideView["sequence"] = [];
  for (const row of rows) {
    if (row.base === undefined || byBase.has(row.base)) {
      sequence.push({ added: row.item });
    } else {
      byBase.set(row.base, row.item);
      sequence.push({ base: row.base });
    }
  }
  const kept = sequence.flatMap((entry) =>
    "base" in entry ? [entry.base] : [],
  );
  const moved = kept.some((index, i) => i > 0 && kept[i - 1] > index);
  return { byBase, sequence, moved };
}

/** The base indices both sides kept, in each side's order — do they agree? */
function sameSharedOrder(a: SideView, b: SideView): boolean {
  const shared = (side: SideView, other: SideView) =>
    side.sequence.flatMap((entry) =>
      "base" in entry && other.byBase.has(entry.base) ? [entry.base] : [],
    );
  const x = shared(a, b);
  const y = shared(b, a);
  return x.length === y.length && x.every((index, i) => index === y[i]);
}

interface Prepared {
  input: PlanMergeInput;
  mine: SideView;
  theirs: SideView;
}

function prepare(input: PlanMergeInput): Prepared {
  const theirsBase = matchToBase(input.base, input.theirs);
  return {
    input,
    mine: sideView(input.mine),
    theirs: sideView(
      input.theirs.map((item, i) => ({ item, base: theirsBase[i] })),
    ),
  };
}

function changedFields(base: GroupItem, row: GroupItem): MergeField[] {
  return FIELDS.filter((field) => !same(field, base, row));
}

/** "scale 1× → 2×; note “Leftovers” → none" — what a side did to a row. */
function fieldChanges(base: GroupItem, row: GroupItem): string {
  return changedFields(base, row)
    .map(
      (field) =>
        `${FIELD_NAMES[field]} ${shown(field, base)} → ${shown(field, row)}`,
    )
    .join("; ");
}

function lines(prepared: Prepared, side: SideView): string[] {
  const { base, nameOf } = prepared.input;
  const out: string[] = [];
  base.forEach((item, index) => {
    const row = side.byBase.get(index);
    if (!row) out.push(`Removed ${nameOf(item)}`);
    else {
      const changes = fieldChanges(item, row);
      if (changes) out.push(`${nameOf(item)}: ${changes}`);
    }
  });
  for (const entry of side.sequence) {
    if ("added" in entry) out.push(`Added ${nameOf(entry.added)}`);
  }
  if (side.moved) out.push("Reordered the rows");
  return out;
}

/** What the two sides ask of each other: the lines and the conflicts. */
export function planMerge(input: PlanMergeInput): PlanMerge {
  const prepared = prepare(input);
  const { mine, theirs } = prepared;
  const { base, nameOf } = input;
  const conflicts: PlanConflict[] = [];
  base.forEach((item, index) => {
    const name = nameOf(item);
    const m = mine.byBase.get(index);
    const t = theirs.byBase.get(index);
    if (!m && !t) return;
    if (!m || !t) {
      const kept = (m ?? t)!;
      const changes = fieldChanges(item, kept);
      if (!changes) return;
      conflicts.push({
        id: `removed:${index}`,
        kind: "removed",
        name,
        mine: m ? `keep it (${changes})` : "remove it",
        theirs: t ? `keep it (${changes})` : "remove it",
      });
      return;
    }
    for (const field of FIELDS) {
      if (same(field, m, item) || same(field, t, item) || same(field, m, t)) {
        continue;
      }
      conflicts.push({
        id: `field:${index}:${field}`,
        kind: "field",
        name,
        field,
        mine: shown(field, m),
        theirs: shown(field, t),
      });
    }
  });
  if (mine.moved && theirs.moved && !sameSharedOrder(mine, theirs)) {
    conflicts.push({
      id: "order",
      kind: "order",
      name: "the order",
      mine: "your order",
      theirs: "the stored order",
    });
  }
  return {
    mine: lines(prepared, mine),
    theirs: lines(prepared, theirs),
    conflicts,
  };
}

/**
 * The merged rows, with each conflict answered (`choices`, by conflict id;
 * an unanswered one keeps the stored side — the page asks for every one
 * before it offers Save merged).
 */
export function resolvePlanMerge(
  input: PlanMergeInput,
  choices: Readonly<Record<string, MergeSide>> = {},
): GroupItem[] {
  const prepared = prepare(input);
  const { mine, theirs } = prepared;
  const { base } = input;
  const pick = (id: string): MergeSide => choices[id] ?? "theirs";

  /* Each base row: dropped, or its merged fields. */
  const merged = new Map<number, GroupItem>();
  base.forEach((item, index) => {
    const m = mine.byBase.get(index);
    const t = theirs.byBase.get(index);
    if (!m && !t) return;
    if (!m || !t) {
      const kept = (m ?? t)!;
      if (changedFields(item, kept).length === 0) return;
      const side: MergeSide = m ? "mine" : "theirs";
      if (pick(`removed:${index}`) === side) merged.set(index, kept);
      return;
    }
    let row: GroupItem = { ...t };
    for (const field of FIELDS) {
      const value = same(field, m, item)
        ? t[field]
        : same(field, t, item) || same(field, m, t)
          ? m[field]
          : pick(`field:${index}:${field}`) === "mine"
            ? m[field]
            : t[field];
      const { [field]: _old, ...rest } = row;
      void _old;
      row = (
        value !== undefined && value !== "" ? { ...rest, [field]: value } : rest
      ) as GroupItem;
    }
    merged.set(index, row);
  });

  /* Whose sequence leads: the side that reordered, or the choice. */
  const lead: SideView =
    mine.moved && theirs.moved
      ? sameSharedOrder(mine, theirs) || pick("order") === "theirs"
        ? theirs
        : mine
      : mine.moved
        ? mine
        : theirs;
  const other = lead === mine ? theirs : mine;

  type Entry = { base: number } | { added: GroupItem };
  const out: Entry[] = lead.sequence.filter(
    (entry) => !("base" in entry) || merged.has(entry.base),
  );
  const placed = new Set(
    out.flatMap((entry) => ("base" in entry ? [entry.base] : [])),
  );
  /*
   * The other side's added rows, and base rows only it kept: each after the
   * row it follows on that side (after anything already put there), or first.
   */
  let anchor = -1;
  for (const entry of other.sequence) {
    if ("base" in entry && placed.has(entry.base)) {
      anchor = out.findIndex(
        (each) => "base" in each && each.base === entry.base,
      );
      continue;
    }
    const keep =
      "added" in entry || (merged.has(entry.base) && !placed.has(entry.base));
    if (!keep) continue;
    out.splice(anchor + 1, 0, entry);
    anchor += 1;
    if ("base" in entry) placed.add(entry.base);
  }
  return out.map((entry) =>
    "added" in entry ? entry.added : merged.get(entry.base)!,
  );
}
