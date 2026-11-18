import { tagSlug } from "../../controller/tagSlug";
import type { FacetModel } from "../../util/facets";
import {
  HOLIDAYS_ROOT,
  holidayRuleKey,
  orderByNextOccurrence,
  withinComingUpWindow,
  type CalendarDay,
} from "../../util/holidays";
import { fold } from "../SearchForm/queryLanguage";

/**
 * The ⌘K palette's holiday rows (46e): the next holidays on an empty or
 * short input ("Halloween · in 13 days", to `/holidays/<slug>`), and while
 * typing, the holidays the words name. Pure, so the selection is tested on
 * its own; the palette supplies the facet model and term counts it already
 * holds (`useFacetModel`, `/search/terms`) and the browser's day — nothing
 * here fetches, so the export's palette has the rows too.
 */

/** One holiday the palette may offer. */
export interface PaletteHoliday {
  slug: string;
  label: string;
  /** The `HOLIDAY_RULES` key that dates it (`holidayRuleKey`); absent when undated. */
  rule?: string;
  /** Folded words of its label, slug and aliases — what typed words match. */
  words: string[];
  /**
   * Its label, slug and aliases, each as its folded words joined by a space
   * ("christmas eve") — a typed name that is one of them leads (48a).
   */
  names?: string[];
}

/** How many Coming up rows an empty palette shows (46e: "the next 1–2"). */
export const PALETTE_HOLIDAY_LIMIT = 2;

/**
 * How many holiday rows a typed search shows (48a, Roger's pick 46-e-rows:
 * "prioritise individual matches and tags for search while still keeping
 * holidays as a secondary option"): one, after the recipes, groups and the
 * tag rows.
 */
export const PALETTE_HOLIDAY_MATCH_LIMIT = 1;

/**
 * Below this many characters the input is "short": it names nothing yet, so
 * the rows are the coming-up ones rather than matches (a one-letter `c`
 * would otherwise match Christmas, Christmas Eve and every other C).
 */
export const HOLIDAY_MATCH_MIN = 3;

const wordsOf = (text: string): string[] =>
  fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * The `holidays` root's children that lead somewhere — the term, or one
 * under it, carries a recipe or a group — in the vocabulary's order. A
 * holiday nothing is tagged with is left out, as the homepage leaves it
 * out (`comingUpEntries`): a row that opens an empty menu is a dead end.
 * `count` is a term's own carriers (`SearchTerm.count`).
 */
export function paletteHolidays(
  model: FacetModel,
  count: (slug: string) => number,
): PaletteHoliday[] {
  if (!model.terms.has(HOLIDAYS_ROOT)) return [];
  const carried = (slug: string, seen: Set<string>): boolean => {
    if (seen.has(slug)) return false;
    seen.add(slug);
    return (
      count(slug) > 0 ||
      model.children(slug).some((child) => carried(child, seen))
    );
  };
  return model.children(HOLIDAYS_ROOT).flatMap((slug): PaletteHoliday[] => {
    const term = model.terms.get(slug);
    if (!term || !carried(slug, new Set([HOLIDAYS_ROOT]))) return [];
    const aliases = term.aliases ?? [];
    const rule = holidayRuleKey(
      slug,
      aliases.map((alias) => tagSlug(alias)),
    );
    const named = [term.label, slug, ...aliases];
    return [
      {
        slug,
        label: term.label,
        ...(rule ? { rule } : {}),
        words: [...new Set(named.flatMap(wordsOf))],
        names: [...new Set(named.map((name) => wordsOf(name).join(" ")))],
      },
    ];
  });
}

/**
 * The words a reader typed *for* something: not a filter term (`tag:x`,
 * anything with a colon), not a negated word (`-cookie`), and not the word
 * after a NOT, in any case ("not christmas" asks for anything but).
 */
function positiveWords(input: string): string[] {
  const words: string[] = [];
  let negate = false;
  for (const token of input.split(/\s+/)) {
    if (!token) continue;
    if (token.toLowerCase() === "not") {
      negate = true;
      continue;
    }
    const skip = negate || token.startsWith("-") || token.includes(":");
    negate = false;
    if (!skip) words.push(token.replace(/[()"]/g, ""));
  }
  return words;
}

/**
 * Whether every typed word starts a word of the holiday's — "thanks",
 * "christmas eve", "xmas" (an alias) — so a query that also says something
 * else ("halloween punch") is a recipe search, not a holiday.
 */
function matches(holiday: PaletteHoliday, typed: readonly string[]): boolean {
  return typed.every((word) =>
    holiday.words.some((own) => own.startsWith(word)),
  );
}

export interface PaletteHolidayRows {
  /** `coming-up` on an empty or short input; `match` while typing. */
  mode: "coming-up" | "match";
  /** Soonest first; `days` is absent for an undated holiday (a match only). */
  rows: Array<PaletteHoliday & { days?: number }>;
}

/**
 * The rows for `input` on `today`:
 *
 * - an empty or short input (`HOLIDAY_MATCH_MIN`): the next
 *   `PALETTE_HOLIDAY_LIMIT` dated holidays within the homepage's coming-up
 *   window (`withinComingUpWindow`, 180 days);
 * - otherwise: the holidays every typed word names (`positiveWords`:
 *   filter terms, negated words and a NOT's word are not words), one whose
 *   name is what was typed first ("christmas" is Christmas, not Christmas
 *   Eve), then soonest, undated ones after — a match is offered however far
 *   off it is, since the reader asked for it — at most `matchLimit` (48a:
 *   one, a secondary option beside the recipes and tags).
 */
export function paletteHolidayRows(
  holidays: readonly PaletteHoliday[],
  input: string,
  today: CalendarDay,
  limit: number = PALETTE_HOLIDAY_LIMIT,
  matchLimit: number = PALETTE_HOLIDAY_MATCH_LIMIT,
): PaletteHolidayRows {
  const trimmed = input.trim();
  if (trimmed.length < HOLIDAY_MATCH_MIN) {
    return {
      mode: "coming-up",
      rows: withinComingUpWindow([...holidays], today).slice(0, limit),
    };
  }
  const typed = wordsOf(positiveWords(trimmed).join(" "));
  if (typed.length === 0) return { mode: "match", rows: [] };
  const name = typed.join(" ");
  const ordered = orderByNextOccurrence(
    holidays.filter((holiday) => matches(holiday, typed)),
    today,
  );
  const named = (holiday: PaletteHoliday) =>
    (holiday.names ?? []).includes(name);
  return {
    mode: "match",
    rows: [
      ...ordered.filter(named),
      ...ordered.filter((holiday) => !named(holiday)),
    ].slice(0, matchLimit),
  };
}
