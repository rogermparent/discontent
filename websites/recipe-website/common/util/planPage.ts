/**
 * The meal-plan page's view model (43p1): the rows as the server hands them
 * to the page, and the pure pieces the page builds from them — label runs
 * (a label that starts with a day is a day), each row's caption and heads-up
 * line, the draft the Save writes (reorder, scale, remove — D5's one
 * commit), and the keys the browser's "made" ticks are stored under.
 *
 * Pure, and safe in the browser. Nothing here reads or writes storage.
 */
import type { GroupItem, GroupKind } from "../controller/types";
import { formatScale, parseScale } from "./scale";
import {
  formatBake,
  formatChill,
  formatExtra,
  formatKeeps,
  formatOven,
  formatYield,
  type PlanTimes,
} from "./planTimes";

/** One recipe row's recipe, as the page shows it. */
export interface PlanRecipeView {
  slug: string;
  name: string;
  date: number;
  image?: string;
  /** Minutes, from the record's `totalTime`. */
  totalTime?: number;
  /** `recipeYield` as stored. */
  yieldText?: string;
  /** Lines, headings not counted. */
  ingredientCount: number;
  drink: boolean;
  times: PlanTimes;
}

/** A sub-plan row: the child plan, with its own recipes walked. */
export interface PlanSubPlanView {
  slug: string;
  name: string;
  image?: string;
  /** Every recipe it cooks, through its own sub-plans, in its order. */
  recipes: Array<{ slug: string; name: string; found: boolean }>;
  /** Up to four member photos, for the row's mosaic. */
  thumbs: Array<{ slug: string; image: string }>;
  /** The walk stopped at its cap. */
  truncated?: true;
}

/** One row of the plan, in the plan's order. */
export interface PlanRowView {
  /** The item as stored — what a Save writes back. */
  item: GroupItem;
  recipe?: PlanRecipeView;
  group?: PlanSubPlanView;
  /** "Recipe not found: x" — a dangling row keeps its slot. */
  missing?: string;
}

/** The holiday a plan is for, from its tags. */
export interface PlanHoliday {
  slug: string;
  label: string;
  /** The `HOLIDAY_RULES` key that dates it; absent for an undated holiday. */
  rule?: string;
}

export interface PlanPageData {
  slug: string;
  name: string;
  kind: GroupKind;
  date: number;
  tags?: string[];
  holiday?: PlanHoliday;
  rows: PlanRowView[];
}

// --- labels ----------------------------------------------------------------

const DAY_RE =
  /^(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b\.?\s*(?:[·•:,|/–—-]\s*)?(.*)$/i;

const DAY_NAMES: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/**
 * A label read for its heading: "Wed · dinner" → day "Wed", rest "dinner";
 * "Starter" → no day, rest "Starter". A label that starts with a day is a
 * day (the B board's note); any other label still works.
 */
export function readLabel(label: string): { day?: string; rest: string } {
  const trimmed = label.trim();
  const match = DAY_RE.exec(trimmed);
  if (!match) return { rest: trimmed };
  return {
    day: DAY_NAMES[match[1].slice(0, 3).toLowerCase()],
    rest: match[2].trim(),
  };
}

/** A run of rows sharing one label (or none), in order. */
export interface LabelRun<T> {
  label?: string;
  rows: Array<{ row: T; index: number }>;
}

/**
 * The rows cut into runs of the same label, consecutive only: rows that
 * share a label share one heading, and a label met again later is a new
 * heading, because the order is the plan.
 */
export function labelRuns<T extends { item: GroupItem }>(
  rows: readonly T[],
): LabelRun<T>[] {
  const runs: LabelRun<T>[] = [];
  rows.forEach((row, index) => {
    const label = row.item.label?.trim() || undefined;
    const last = runs.at(-1);
    if (last && last.label === label) last.rows.push({ row, index });
    else runs.push({ label, rows: [{ row, index }] });
  });
  return runs;
}

/** Does any row carry a label? Then the cook view goes by label. */
export function hasLabels(rows: readonly { item: GroupItem }[]): boolean {
  return rows.some((row) => Boolean(row.item.label?.trim()));
}

// --- what a row says ---------------------------------------------------------

/** 270 → "4 h 30 m", 60 → "1 h", 45 → "45 m" (the card meta's short form). */
export function formatTotalTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} m`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`;
}

/** A row's multiplier: a number, 1 when unset or unreadable. */
export function scaleNumber(scale: string | undefined): number {
  const parsed = parseScale(scale);
  return parsed ? parsed.valueOf() : 1;
}

/** "2×", or `undefined` at 1× (no badge). */
export function scaleBadge(scale: string | undefined): string | undefined {
  const parsed = parseScale(scale);
  if (!parsed || parsed.equals(1)) return undefined;
  return formatScale(parsed);
}

/** The recipe's yield at the row's scale: "16 servings at 2×", or as stored. */
export function yieldLine(
  recipe: PlanRecipeView,
  scale?: string,
): string | undefined {
  const value = recipe.times.yield;
  const badge = scaleBadge(scale);
  if (value) {
    const text = formatYield(value, scaleNumber(scale));
    return badge ? `${text} at ${badge}` : text;
  }
  return recipe.yieldText;
}

/**
 * The row's caption: "1 h · 84 bite-size cookies · 8 ingredients", or
 * "14 ingredients · no time or yield set".
 */
export function rowCaption(recipe: PlanRecipeView, scale?: string): string {
  const time = recipe.totalTime ? formatTotalTime(recipe.totalTime) : undefined;
  const made = yieldLine(recipe, scale);
  const lines = `${recipe.ingredientCount} ${recipe.ingredientCount === 1 ? "ingredient" : "ingredients"}`;
  if (!time && !made) return `${lines} · no time or yield set`;
  return [time, made, lines].filter(Boolean).join(" · ");
}

/**
 * The row's heads-up line, from the steps: "Chill at least 3 h (keeps 3
 * days) · 9–10 min a batch at 350°F · then 10 min in the freezer" — or
 * `undefined` when the steps say none of it. Nothing claims an absence: a
 * recipe with no chill found says nothing about chilling.
 */
export function headsUpLine(times: PlanTimes): string | undefined {
  const parts: string[] = [];
  if (times.chill) {
    const chill = formatChill(times.chill.value);
    const keeps = times.keeps
      ? ` (keeps ${formatKeeps(times.keeps.value)})`
      : "";
    parts.push(`Chill ${chill}${keeps}`);
  } else if (times.keeps) {
    parts.push(`Keeps ${formatKeeps(times.keeps.value)}`);
  }
  if (times.bake) {
    const oven = times.oven ? ` at ${formatOven(times.oven.value)}` : "";
    parts.push(`${formatBake(times.bake.value)}${oven}`);
  } else if (times.oven) {
    parts.push(`oven at ${formatOven(times.oven.value)}`);
  }
  for (const { value } of times.extras) parts.push(formatExtra(value));
  if (parts.length === 0) return undefined;
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** The cook list's short line: "chill ≥ 1 h · then the freezer". */
export function cookCaption(recipe: PlanRecipeView, scale?: string): string {
  const { times } = recipe;
  const parts: string[] = [];
  if (times.chill) parts.push(`chill ${formatChill(times.chill.value)}`);
  if (times.bake) parts.push(formatBake(times.bake.value));
  for (const { value } of times.extras) parts.push(formatExtra(value));
  if (parts.length === 0) {
    const made = yieldLine(recipe, scale);
    if (made) parts.push(made);
  }
  return parts.join(" · ");
}

/**
 * The sentences behind a recipe's chill and rest, each once: what the cook
 * view's "Up next" card quotes, so the note is the recipe's own words.
 */
export function aheadNotes(
  times: PlanTimes,
): Array<{ sentence: string; step: number }> {
  const seen = new Set<string>();
  const out: Array<{ sentence: string; step: number }> = [];
  for (const fact of [times.chill, times.rest, times.keeps]) {
    if (!fact || seen.has(fact.sentence)) continue;
    seen.add(fact.sentence);
    out.push({ sentence: fact.sentence, step: fact.step });
  }
  return out;
}

// --- the draft (D5: one Save) ------------------------------------------------

/** What the plan list has changed since it was read, before a Save. */
export interface PlanDraft {
  /** Indices into the rows as read, in the new order; removed rows absent. */
  order: number[];
  /** Index → the new scale ("" clears it back to 1×). */
  scales: Record<number, string>;
}

export function initialDraft(count: number): PlanDraft {
  return { order: Array.from({ length: count }, (_, i) => i), scales: {} };
}

/** Move the row at draft position `from` to position `to`. */
export function moveRow(draft: PlanDraft, from: number, to: number): PlanDraft {
  if (from === to || from < 0 || from >= draft.order.length) return draft;
  const order = [...draft.order];
  const [moved] = order.splice(from, 1);
  order.splice(Math.max(0, Math.min(to, order.length)), 0, moved);
  return { ...draft, order };
}

export function removeRow(draft: PlanDraft, position: number): PlanDraft {
  return {
    ...draft,
    order: draft.order.filter((_, i) => i !== position),
  };
}

export function setRowScale(
  draft: PlanDraft,
  index: number,
  scale: string,
): PlanDraft {
  return { ...draft, scales: { ...draft.scales, [index]: scale } };
}

/** The row's scale in the draft: its new one, else the stored one. */
export function draftScale(
  draft: PlanDraft,
  index: number,
  item: GroupItem,
): string | undefined {
  const changed = draft.scales[index];
  if (changed !== undefined) return changed || undefined;
  return item.scale;
}

/** Same multiplier? ("2" and "2.0" are; unset and "1" are.) */
function sameScale(a: string | undefined, b: string | undefined): boolean {
  return scaleNumber(a) === scaleNumber(b);
}

/** The items a Save writes: the new order, each with its draft scale. */
export function draftItems(
  draft: PlanDraft,
  items: readonly GroupItem[],
): GroupItem[] {
  return draft.order.map((index) => {
    const item = items[index];
    const changed = draft.scales[index];
    /* Untouched, or set back to what it was: the item exactly as stored. */
    if (
      item.recipe === undefined ||
      changed === undefined ||
      sameScale(changed || undefined, item.scale)
    ) {
      return item;
    }
    const { scale: _old, ...rest } = item;
    void _old;
    return changed && scaleNumber(changed) !== 1
      ? ({ ...rest, scale: changed } as GroupItem)
      : (rest as GroupItem);
  });
}

/** What a Save answers when the stored rows are not the ones it was made over. */
export const PLAN_CHANGED = "The plan changed — reload to see it.";

/** A JSON value with its object keys sorted and `undefined` fields dropped. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, field]) => field !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, field]) => [key, stable(field)]),
    );
  }
  return value;
}

/**
 * The rows a draft was made over, as a key (43p1 review): the page sends it
 * with a Save, and the action refuses the Save when the stored rows' key
 * differs — another tab, the API or an agent wrote in between — rather than
 * writing the draft over that change. Key order and absent fields don't
 * count; the rows' order and every value do.
 */
export function planItemsKey(items: readonly GroupItem[]): string {
  return JSON.stringify(stable(items));
}

/** How many changes the draft holds: moves, scales and removals, each once. */
export function draftChanges(
  draft: PlanDraft,
  items: readonly GroupItem[],
): number {
  const removed = items.length - draft.order.length;
  const kept = draft.order;
  const sorted = [...kept].sort((a, b) => a - b);
  const moved = kept.some((index, position) => sorted[position] !== index);
  let scaled = 0;
  for (const [key, scale] of Object.entries(draft.scales)) {
    const index = Number(key);
    if (!kept.includes(index)) continue;
    if (!sameScale(scale || undefined, items[index]?.scale)) scaled += 1;
  }
  return removed + (moved ? 1 : 0) + scaled;
}

/** The scale presets the row's select offers, as stored values. */
export const SCALE_PRESETS = ["1/2", "1", "1.5", "2", "3", "4"] as const;

/** The select's options: the presets, plus the row's own when it is not one. */
export function scaleOptions(
  current: string | undefined,
): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = SCALE_PRESETS.map(
    (value) => ({
      value,
      label: formatScale(parseScale(value)!),
    }),
  );
  const parsed = parseScale(current);
  if (
    parsed &&
    !options.some((option) => parseScale(option.value)!.equals(parsed))
  ) {
    options.push({ value: current!.trim(), label: formatScale(parsed) });
    options.sort(
      (a, b) => parseScale(a.value)!.valueOf() - parseScale(b.value)!.valueOf(),
    );
  }
  return options;
}

/** The option a stored scale selects ("1" for none). */
export function scaleOptionValue(current: string | undefined): string {
  const parsed = parseScale(current);
  if (!parsed) return "1";
  const preset = SCALE_PRESETS.find((value) =>
    parseScale(value)!.equals(parsed),
  );
  return preset ?? current!.trim();
}

// --- ticks ("made", per browser) ----------------------------------------------

/** Where a plan's "made" ticks live in the browser (D5). */
export function madeStorageKey(slug: string): string {
  return `plan-made:${slug}`;
}

/**
 * Each row's tick key: `recipe:<slug>` or `group:<slug>`, with `#n` for its
 * n-th appearance — so a plan that cooks the same thing twice ticks each
 * once, and a reorder keeps a tick on its recipe rather than its slot.
 */
export function tickKeys(items: readonly GroupItem[]): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base =
      item.group !== undefined
        ? `group:${item.group}`
        : `recipe:${item.recipe}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}

/** The stored ticks, read tolerantly: anything unreadable is no ticks. */
export function parseTicks(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

/** "2 of 6 made". */
export function madeLine(made: number, total: number): string {
  return `${made} of ${total} made`;
}
