/**
 * The run sheet (epic 43, 43p2 — canvas C, "The run sheet", on 43p1's plan
 * page): a baking day as a production schedule. The plan's recipes as a
 * table you work down — what to mix and chill the day before, each bake's
 * minutes drawn to scale on baking day, what each makes — over a hero of
 * counts and a docket of what is on the shopping list.
 *
 * Every number is read: the clock from `planTimes` (each recipe's steps,
 * D5), the yields from `recipeYield`, the docket from `buildShoppingView`'s
 * rows (read-only — its outputs are 42g's). Where nothing is found the sheet
 * says "not set"; it never claims an absence ("no chill") the steps don't
 * state.
 *
 * Pure, and safe in the browser.
 */
import { AISLES, AISLE_LABELS, type Aisle } from "./aisles";
import {
  formatBake,
  formatChillShort,
  formatDays,
  formatExtra,
  formatKeeps,
  formatOven,
  formatSpan,
  summarizeMakeAhead,
  type MakeAhead,
  type PlanOven,
  type PlanRest,
  type PlanYield,
} from "./planTimes";
import { scaleNumber, tickKeys, type PlanRowView } from "./planPage";
import type { ShoppingRow, ShoppingView } from "./shoppingView";

/** Where a plan's "mixed" ticks live in the browser (D5), apart from "made". */
export function mixedStorageKey(slug: string): string {
  return `plan-mixed:${slug}`;
}

/**
 * Does the plan have a run sheet? When at least one recipe's steps give a
 * bake or a chill — the sheet's two columns. A week of dinners with neither
 * keeps to Plan and Cook (Dp2-1).
 */
export function hasRunSheet(rows: readonly PlanRowView[]): boolean {
  return rows.some((row) => row.recipe?.times.bake || row.recipe?.times.chill);
}

/** "rest 20 min", "rest 5–10 min", "rest overnight". */
export function formatRest(rest: PlanRest): string {
  if (rest.min === undefined) return "rest overnight";
  return `rest ${formatSpan({ min: rest.min, max: rest.max })}`;
}

// --- numbers ----------------------------------------------------------------

/** 24 → "24", 1.5 → "1.5", 37.5 → "37.5" (a yield's number at a scale). */
function numberText(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(1)));
}

/** A yield's number at a scale: "84", "20–22", "48" (24 at 2×). */
export function yieldNumber(value: PlanYield, scale = 1): string {
  const min = numberText(value.min * scale);
  return value.max === undefined
    ? min
    : `${min}–${numberText(value.max * scale)}`;
}

/**
 * The word a yield counts, as written: the unit's last word before any
 * aside — "cookies" from "bite-size cookies", "cookies (2 dozen)" or
 * "cookies, 3 inches"; "loaf" from "loaf (10 slices)". `""` for no unit.
 */
export function yieldWord(unit: string): string {
  const head = unit.split(/[(,]/)[0].trim();
  return (
    head
      .split(/\s+/)
      .at(-1)
      ?.replace(/[^\p{L}-]/gu, "") ?? ""
  );
}

/**
 * What a yield counts, as a key — `yieldWord`, lower-cased and singular-ish
 * (review): "-es" after s, x, ch or sh, "-ves" → "-f", else "-s"; then a
 * final "ie" or "y" becomes "i", so cookie/cookies, glass/glasses,
 * loaf/loaves, batch/batches, pastry/pastries each meet, and servings never
 * meet cookies. `""` when the yield names no unit ("Makes about 24").
 */
export function yieldNoun(unit: string): string {
  const word = yieldWord(unit).toLowerCase();
  let single = word;
  if (/ves$/.test(word)) single = `${word.slice(0, -3)}f`;
  else if (/(?:s|x|ch|sh)es$/.test(word)) single = word.slice(0, -2);
  else if (/[^s]s$/.test(word)) single = word.slice(0, -1);
  return single.replace(/(?:ie|y)$/, "i");
}

/** The plan's yields added up, where they count the same thing. */
export interface YieldSum {
  min: number;
  max?: number;
  /** The unit's last word as the recipes write it: "cookies". */
  noun: string;
  /** Recipes added in. */
  counted: number;
  /**
   * Rows left out: a recipe with no yield read or one counting something
   * else, and every sub-plan (its yields are its own page's).
   */
  more: number;
}

/**
 * The hero's yield (canvas C, "188–190 cookies + sugar"): each recipe's
 * yield at its row's scale, summed over the commonest thing counted — 84
 * bite-size cookies and 20–22 cookies are both cookies — with the rows left
 * out counted as "more" (no yield read, servings among cookies, a
 * sub-plan). Never adds a serving to a cookie. `undefined` when no recipe's yield reads.
 */
export function sumYields(rows: readonly PlanRowView[]): YieldSum | undefined {
  const recipes = rows.filter((row) => row.recipe);
  const plans = rows.filter((row) => row.group).length;
  type Tally = {
    min: number;
    max: number;
    ranged: boolean;
    word: string;
    n: number;
  };
  const byNoun = new Map<string, Tally>();
  for (const row of recipes) {
    const value = row.recipe!.times.yield;
    if (!value) continue;
    const scale = scaleNumber(row.item.scale);
    const noun = yieldNoun(value.unit);
    const entry = byNoun.get(noun) ?? {
      min: 0,
      max: 0,
      ranged: false,
      word: yieldWord(value.unit),
      n: 0,
    };
    entry.min += value.min * scale;
    entry.max += (value.max ?? value.min) * scale;
    entry.ranged ||= value.max !== undefined;
    entry.n += 1;
    byNoun.set(noun, entry);
  }
  /* The commonest; a tie goes to the first met, in the plan's order. */
  let entry: Tally | undefined;
  for (const tally of byNoun.values()) {
    if (!entry || tally.n > entry.n) entry = tally;
  }
  if (!entry) return undefined;
  const min = Number(entry.min.toFixed(1));
  const max = Number(entry.max.toFixed(1));
  return {
    min,
    ...(entry.ranged && max > min ? { max } : {}),
    noun: entry.word,
    counted: entry.n,
    more: recipes.length - entry.n + plans,
  };
}

/** "188–190". */
export function formatYieldSum(sum: YieldSum): string {
  return sum.max === undefined
    ? numberText(sum.min)
    : `${numberText(sum.min)}–${numberText(sum.max)}`;
}

/** "cookies + 1 more", "cookies", "made + 2 more" (a yield with no unit). */
export function yieldSumLabel(sum: YieldSum): string {
  const noun = sum.noun || "made";
  return sum.more > 0 ? `${noun} + ${sum.more} more` : noun;
}

// --- the oven bars ------------------------------------------------------------

/** Steps the baking day's scale may count in, in minutes. */
const SCALE_STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 240];

/**
 * The baking day's scale: the plan's longest bake (its range's top), and
 * the round steps under it — "0 · 5 · 10 · 15 min" when the longest lands on
 * a step, else "0–13 min" — so the caption never draws a tick the bars
 * don't reach.
 */
export function bakeScale(max: number): { max: number; caption: string } {
  if (!(max > 0)) return { max: 0, caption: "" };
  const step =
    SCALE_STEPS.find((each) => max / each <= 4) ?? SCALE_STEPS.at(-1)!;
  if (max % step !== 0 || max / step < 2) {
    return { max, caption: `0–${max} min` };
  }
  const ticks: number[] = [];
  for (let at = 0; at <= max; at += step) ticks.push(at);
  return { max, caption: `${ticks.join(" · ")} min` };
}

/** A width along the scale, as a percentage with one decimal. */
function percent(minutes: number, max: number): number {
  return max > 0 ? Math.min(100, Math.round((minutes / max) * 1000) / 10) : 0;
}

// --- the sheet ------------------------------------------------------------------

/** One row of the run sheet: a recipe, a sub-plan, or a missing recipe. */
export interface SheetRow {
  /** 1-based, as the plan orders it. */
  position: number;
  /** "01". */
  number: string;
  /** The row's tick key (`tickKeys`): made and mixed ticks both use it. */
  tick: string;
  row: PlanRowView;
  /** The day before: the chill, short ("≥ 3 h", "1–2 h", "overnight"). */
  chill?: string;
  /** It bakes: its dough is mixed the day before (a "dough"), else "recipe". */
  dough: boolean;
  /**
   * The day before's small print on a wide screen: "keeps 3 days", "rest
   * 20 min", "icing sets in 24 h" (`keeps`, then `rest`, then `sets`).
   */
  ahead: string[];
  /** "keeps 3 days": a phone says it once, under Day before. */
  keeps?: string;
  /** "rest 20 min": a phone's baking-day caption (C-phone). */
  rest?: string;
  /** "icing sets in 24 h": a phone's baking-day caption (C-phone). */
  sets: string[];
  /** Baking day: the bar and its caption, when the steps give a bake. */
  bake?: {
    /** The solid bar: the range's low end (or the only time), % of the scale. */
    low: number;
    /** The pale bar behind it: the range's top, % of the scale. */
    high: number;
    /** "7–9 min a batch", "about 15 min a batch". */
    text: string;
    /** The row's own oven, when the plan's ovens differ ("at 375°F"). */
    oven?: string;
  };
  /** After the oven: "then 10 min in the freezer". */
  after: string[];
  /** What it makes, at the row's scale: big number and its unit. */
  makes?: { number: string; unit: string };
}

/** The whole sheet over a plan's rows. */
export interface PlanSheet {
  rows: SheetRow[];
  summary: MakeAhead;
  /** Recipe rows (not sub-plans, not missing). */
  recipes: number;
  /** Sub-plan rows: the hero says "+ 1 plan" (review). */
  plans: number;
  /** The one oven every recipe that says uses, when there is one. */
  oven?: PlanOven;
  scale: { max: number; caption: string };
  yields?: YieldSum;
  /** Recipe rows whose steps give no chill, by name, in order. */
  noChill: string[];
  /** Recipe rows whose yield doesn't read, by name, in order. */
  noYield: string[];
}

/** The run sheet for a plan's rows (see the module note). */
export function buildPlanSheet(rows: readonly PlanRowView[]): PlanSheet {
  const summary = summarizeMakeAhead(
    rows.flatMap((row) =>
      row.recipe ? [{ name: row.recipe.name, times: row.recipe.times }] : [],
    ),
  );
  const oven = summary.ovens.length === 1 ? summary.ovens[0].oven : undefined;
  const longest = Math.max(
    0,
    ...rows.map((row) => {
      const bake = row.recipe?.times.bake?.value;
      return bake ? (bake.max ?? bake.min) : 0;
    }),
  );
  const scale = bakeScale(longest);
  const keys = tickKeys(rows.map((row) => row.item));
  const yields = sumYields(rows);
  const noChill: string[] = [];
  const noYield: string[] = [];

  const sheetRows = rows.map((row, index): SheetRow => {
    const base: SheetRow = {
      position: index + 1,
      number: String(index + 1).padStart(2, "0"),
      tick: keys[index],
      row,
      dough: false,
      ahead: [],
      sets: [],
      after: [],
    };
    const recipe = row.recipe;
    if (!recipe) return base;
    const { times } = recipe;
    if (!times.chill) noChill.push(recipe.name);
    if (!times.yield) noYield.push(recipe.name);
    const keeps = times.keeps
      ? `keeps ${formatKeeps(times.keeps.value)}`
      : undefined;
    const rest = times.rest ? formatRest(times.rest.value) : undefined;
    const sets: string[] = [];
    const after: string[] = [];
    for (const { value } of times.extras) {
      if (value.kind === "set") sets.push(formatExtra(value));
      else after.push(formatExtra(value));
    }
    const ahead = [keeps, rest, ...sets].filter((each): each is string =>
      Boolean(each),
    );
    const bake = times.bake?.value;
    const rowOven = times.oven?.value;
    return {
      ...base,
      ...(times.chill ? { chill: formatChillShort(times.chill.value) } : {}),
      dough: Boolean(bake),
      ahead,
      ...(keeps ? { keeps } : {}),
      ...(rest ? { rest } : {}),
      sets,
      after,
      ...(bake
        ? {
            bake: {
              low: percent(bake.min, scale.max),
              high: percent(bake.max ?? bake.min, scale.max),
              text: formatBake(bake),
              ...(rowOven && !oven
                ? { oven: `at ${formatOven(rowOven)}` }
                : {}),
            },
          }
        : {}),
      ...(times.yield
        ? {
            makes: {
              number: yieldNumber(times.yield, scaleNumber(row.item.scale)),
              unit: times.yield.unit || "made",
            },
          }
        : {}),
    };
  });

  return {
    rows: sheetRows,
    summary,
    recipes: rows.filter((row) => row.recipe).length,
    plans: rows.filter((row) => row.group).length,
    ...(oven ? { oven } : {}),
    scale,
    ...(yields ? { yields } : {}),
    noChill,
    noYield,
  };
}

/**
 * The day before's footnote on a phone: "Doughs keep 3 days. Chill not
 * set: Spritz Cookies." — the keeps from the steps, and the recipes the
 * steps give no chill for, named (never "needs no chill").
 */
export function dayBeforeNote(sheet: PlanSheet): string {
  const parts: string[] = [];
  const { summary } = sheet;
  if (summary.keepsDays && summary.chilling.length > 0) {
    parts.push(
      `${summary.doughs ? "Doughs" : "They"} keep ${formatDays(summary.keepsDays)}.`,
    );
  }
  if (sheet.noChill.length > 0 && summary.chilling.length > 0) {
    parts.push(`Chill not set: ${sheet.noChill.join(", ")}.`);
  }
  return parts.join(" ");
}

// --- the shopping docket ----------------------------------------------------------

/** What the docket says about the plan's lines on the shopping list. */
export interface PlanDocket {
  /** Rows per aisle, most first (aisles on); empty when aisles are off. */
  aisles: Array<{ aisle: Aisle; label: string; rows: number }>;
  /**
   * The big ones: the rows that merge the most lines — what every recipe
   * calls for — with their amounts, as /shopping labels them; at most five,
   * only rows that merge two lines or more, and never a ticked row (it is
   * bought; review, Dp2-4).
   */
  big: string[];
}

/** Every row of a view: the store lists' sections, on hand and ticked. */
function allRows(view: ShoppingView): ShoppingRow[] {
  return [
    ...view.stores.flatMap((list) =>
      list.sections.flatMap((section) => section.rows),
    ),
    ...view.onHand,
    ...view.checked,
  ];
}

/**
 * The docket (canvas C's "On the list") from `buildShoppingView` over the
 * plan's lines — read-only: the view is /shopping's, unchanged.
 */
export function planDocket(view: ShoppingView, limit = 5): PlanDocket {
  const rows = allRows(view);
  const counts = new Map<Aisle, number>();
  for (const row of rows) {
    if (row.aisle) counts.set(row.aisle, (counts.get(row.aisle) ?? 0) + 1);
  }
  const aisles = [...counts]
    .sort(([a, n], [b, m]) => m - n || AISLES.indexOf(a) - AISLES.indexOf(b))
    .map(([aisle, count]) => ({
      aisle,
      label: AISLE_LABELS[aisle],
      rows: count,
    }));
  /* Still to buy: the store lists and the on-hand fold, not the ticked. */
  const big = rows
    .filter((row) => !row.checked)
    .map((row, order) => ({ row, order }))
    .filter(({ row }) => row.quantity && row.total >= 2)
    .sort((a, b) => b.row.total - a.row.total || a.order - b.order)
    .slice(0, limit)
    .map(({ row }) => row.label);
  return { aisles, big };
}
