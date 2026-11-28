/**
 * 51b's small readings, pure: how many an ask wants, a web page's title as
 * a dish name, which results are not single recipes, a dish named in an ask
 * found among the recipes, a yield as a number, and servings as a scale.
 * Everything here is code, never a model's say (the brief: "never trust
 * model output"), and each is unit-tested on its own.
 */
import {
  closeRecipeName,
  nameWords,
} from "recipe-website-common/util/closeRecipeName";
import { fold } from "recipe-website-common/util/fold";

/** The most of anything an ask may ask for (the brief: N ≤ 10). */
export const INTENT_COUNT_MAX = 10;

/** The most people a plan scales for. */
export const SERVINGS_MAX = 50;

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  a: 1,
  two: 2,
  couple: 2,
  three: 3,
  few: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** A whole number from 1 to `max`, else `undefined`. */
export function boundedCount(
  value: unknown,
  max = INTENT_COUNT_MAX,
): number | undefined {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" &&
    Number.isInteger(number) &&
    number >= 1 &&
    number <= max
    ? number
    : undefined;
}

/**
 * How many recipes an ask names ("3 pulled pork recipes", "five new soups"),
 * read from its words: a number, or a number word before "recipes",
 * "ones", "dishes" or the like, within a few words. `undefined` when it names
 * none (or more than `INTENT_COUNT_MAX`).
 */
export function askedCount(text: string): number | undefined {
  const words = fold(text)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ");
  const nouns = /^(recipes?|ones?|dishes|dish|ideas?|kinds?|versions?|ways?)$/;
  for (const [index, word] of words.entries()) {
    const value = /^\d+$/.test(word)
      ? Number(word)
      : word in NUMBER_WORDS && word !== "a"
        ? NUMBER_WORDS[word]
        : undefined;
    if (value === undefined) continue;
    const ahead = words.slice(index + 1, index + 6);
    if (ahead.some((next) => nouns.test(next))) {
      return boundedCount(value);
    }
  }
  return undefined;
}

/**
 * A search result's title as a dish name: the site's name after a dash or
 * bar dropped ("Pulled Pork Recipe - The Modern Proper" → "Pulled Pork
 * Recipe"). `closeRecipeName` drops "recipe" itself.
 */
export function titleDish(title: string): string {
  const parts = title.split(/\s+[|–—-]\s+|\s+[|]\s*/);
  return (parts[0] ?? title).trim() || title.trim();
}

/** "25 Best Pulled Pork Recipes", "Pulled pork recipes": a list, not a recipe. */
export function looksLikeRoundup(title: string): boolean {
  const text = fold(title);
  return (
    /^\s*(?:the\s+)?\d+\+?\s/.test(text) ||
    /\b\d+\+?\s+(?:\w+\s+){0,4}(?:recipes|ideas|ways|dishes)\b/.test(text) ||
    /\b(?:recipes|ideas)\s*$/.test(titleDish(text)) ||
    /\b(?:roundup|round-up|collection of)\b/.test(text)
  );
}

/**
 * Hosts whose pages are not a recipe to import (a forum, a pin, a shop, an
 * encyclopedia): skipped before any page is read.
 */
const NOT_RECIPE_HOSTS = [
  "pinterest.",
  "reddit.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "amazon.",
  "wikipedia.org",
  "quora.com",
  "yelp.com",
];

/**
 * The site a URL is on: its host without `www.` (with a port only when the
 * URL names one); `undefined` for a bad URL.
 */
export function hostOf(url: string): string | undefined {
  if (!URL.canParse(url)) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return undefined;
  }
  return parsed.host.replace(/^www\./, "").toLowerCase() || undefined;
}

/** Whether a URL is on a host whose pages are never a recipe. */
export function notRecipeHost(url: string): boolean {
  const host = hostOf(url);
  if (!host) return true;
  return NOT_RECIPE_HOSTS.some(
    (skip) => host === skip.replace(/\.$/, "") || host.includes(skip),
  );
}

/** A recipe row as the plans read it. */
export interface NamedRecipe {
  slug: string;
  name: string;
  tags?: string[];
}

/**
 * One of `recipes` whose name is close to `name` (`closeRecipeName`), if
 * any: D2's "Close to yours".
 */
export function closeTo(
  name: string,
  recipes: readonly NamedRecipe[],
): NamedRecipe | undefined {
  return recipes.find((recipe) => closeRecipeName(name, recipe.name));
}

/** How a dish named in an ask was found among the recipes. */
export interface ResolvedDish {
  slug: string;
  name: string;
  how: "name" | "words" | "close";
  /**
   * The other recipes that answered the dish as well, when nothing settled
   * which one it is (the menu, the dish's course): the plan says so in a
   * Heads up rather than picking silently (51b review 2).
   */
  others?: NamedRecipe[];
}

/** What a dish's resolution may prefer: the menu's recipes, its course. */
export interface ResolvePreference {
  /** The holiday menu's recipe slugs. */
  menu?: ReadonlySet<string>;
  /** The course the dish is ("dessert"), when the ask or its words say. */
  course?: string;
  /** A recipe's course (the menu's grouping, else its course tag). */
  courseOf?: (recipe: NamedRecipe) => string | undefined;
}

/**
 * Among recipes that all answer a dish, the one to take: the one recipe on
 * the menu of the dish's course, else the one on the menu, else the one of
 * its course — `settled` when one of those singles one out. Otherwise the
 * best guess, flagged: a name whose last word is the dish's ("the turkey"
 * is "Roast Turkey", not "Turkey Gravy"), then fewer extra words, then the
 * shorter name, then the order given.
 */
function pickAmong(
  list: readonly NamedRecipe[],
  wanted: readonly string[],
  { menu = new Set(), course, courseOf }: ResolvePreference,
): { pick: NamedRecipe; others: NamedRecipe[]; settled: boolean } {
  const others = (pick: NamedRecipe) =>
    list.filter((recipe) => recipe.slug !== pick.slug);
  if (list.length === 1) return { pick: list[0], others: [], settled: true };
  const onMenu = (recipe: NamedRecipe) => menu.has(recipe.slug);
  const ofCourse = (recipe: NamedRecipe) =>
    course !== undefined && courseOf?.(recipe) === course;
  const narrowings = [
    ...(course ? [list.filter((r) => onMenu(r) && ofCourse(r))] : []),
    list.filter(onMenu),
    ...(course ? [list.filter(ofCourse)] : []),
  ];
  for (const narrowed of narrowings) {
    if (narrowed.length === 1) {
      return { pick: narrowed[0], others: others(narrowed[0]), settled: true };
    }
  }
  const pool = narrowings.find((narrowed) => narrowed.length > 1) ?? list;
  const head = wanted[wanted.length - 1];
  const score = (recipe: NamedRecipe) => {
    const words = nameWords(recipe.name);
    return {
      head: words[words.length - 1] === head ? 0 : 1,
      extra: words.length - wanted.length,
      length: recipe.name.length,
    };
  };
  const ranked = [...pool].sort((a, b) => {
    const left = score(a);
    const right = score(b);
    return (
      left.head - right.head ||
      left.extra - right.extra ||
      left.length - right.length
    );
  });
  return { pick: ranked[0], others: others(ranked[0]), settled: false };
}

/**
 * The recipe a dish named in an ask is (the plan's "named dishes are
 * resolved by name in code", 51b): the folded name itself first; then a
 * recipe whose name holds every word of the dish ("the pernil" → "Pernil
 * (Puerto Rican Roast Pork)"); then `closeRecipeName`. Several at one stage
 * go to `pickAmong`, and when nothing settles which, the result carries
 * the `others`. `undefined` when none is.
 */
export function resolveDish(
  dish: string,
  recipes: readonly NamedRecipe[],
  prefer: ResolvePreference = {},
): ResolvedDish | undefined {
  const wanted = nameWords(dish);
  if (wanted.length === 0) return undefined;
  const key = wanted.join(" ");
  const stages: [ResolvedDish["how"], NamedRecipe[]][] = [
    [
      "name",
      recipes.filter((recipe) => nameWords(recipe.name).join(" ") === key),
    ],
    [
      "words",
      recipes.filter((recipe) => {
        const words = new Set(nameWords(recipe.name));
        return wanted.every((word) => words.has(word));
      }),
    ],
    ["close", recipes.filter((recipe) => closeRecipeName(dish, recipe.name))],
  ];
  for (const [how, list] of stages) {
    if (list.length === 0) continue;
    const { pick, others, settled } = pickAmong(list, wanted, prefer);
    return {
      slug: pick.slug,
      name: pick.name,
      how,
      ...(!settled && others.length > 0 ? { others } : {}),
    };
  }
  return undefined;
}

/** Number words a yield may spell ("Serves four"). */
const YIELD_NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
};

const YIELD_NUMBER = `(\\d+(?:\\.\\d+)?|${Object.keys(YIELD_NUMBER_WORDS).join("|")})`;
const YIELD_RANGE = `(?:\\s*(?:-|–|to)\\s*\\d+(?:\\.\\d+)?)?`;

/** "8 servings", "6-8 people", "8 slices": a count of servings. */
const COUNTED = new RegExp(
  `\\b${YIELD_NUMBER}${YIELD_RANGE}\\s*(?:servings?|people|persons?|portions?|slices?|pieces?)\\b`,
);
/** "Serves 6", "feeds 8", "Servings: 4". */
const SERVES = new RegExp(
  `\\b(?:serves|feeds|servings?:?)\\s+${YIELD_NUMBER}\\b`,
);
/** A yield that is only a number ("8", "Yield: 8"): schema.org's servings. */
const BARE = new RegExp(`^(?:yields?:?\\s*)?${YIELD_NUMBER}${YIELD_RANGE}$`);

/**
 * A yield's count of **servings** (51b review 1): "Serves 6–8" → 6, "8
 * servings" → 8, "1 (9-inch) tart, 8 slices" → 8, a bare "8" → 8. Only a
 * number tied to servings, people, portions, slices or pieces, or after
 * "serves" or "feeds", counts: "1 9x13-inch pan", "4 dozen cookies",
 * "Makes 2 loaves" and "One 9-inch pie" are what a recipe makes, not how
 * many it serves, so they read as `undefined` and the plan does not scale
 * them. A range reads as its low end. `undefined` too for 0 or past 200.
 */
export function yieldCount(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const plain = fold(text)
    .replace(/\(.*?\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match =
    plain.match(COUNTED) ?? plain.match(SERVES) ?? plain.match(BARE);
  if (!match) return undefined;
  const value = YIELD_NUMBER_WORDS[match[1]] ?? Number(match[1]);
  return Number.isFinite(value) && value > 0 && value <= 200
    ? value
    : undefined;
}

/** The scales under one a plan writes, as the group page reads them. */
const SMALL_SCALES: readonly [number, string][] = [
  [1 / 8, "1/8"],
  [1 / 6, "1/6"],
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [1 / 2, "1/2"],
  [2 / 3, "2/3"],
  [3 / 4, "3/4"],
];

/**
 * A group item's `scale` for `servings` of a recipe that yields
 * `yieldServings`: under one, the nearest of 1/8 … 3/4; from one, the
 * nearest quarter ("1.5", "2"), at most 10. `undefined` when it is about
 * one (within 10%), or either number is missing or not sane.
 */
export function servingsScale(
  servings: number | undefined,
  yieldServings: number | undefined,
): string | undefined {
  if (
    servings === undefined ||
    yieldServings === undefined ||
    !(servings > 0) ||
    !(yieldServings > 0)
  ) {
    return undefined;
  }
  const ratio = servings / yieldServings;
  if (Math.abs(ratio - 1) <= 0.1) return undefined;
  if (ratio < 1) {
    let best = SMALL_SCALES[0];
    for (const candidate of SMALL_SCALES) {
      if (Math.abs(candidate[0] - ratio) < Math.abs(best[0] - ratio)) {
        best = candidate;
      }
    }
    return best[1];
  }
  const quarter = Math.min(10, Math.round(ratio * 4) / 4);
  return quarter === 1 ? undefined : String(quarter);
}

/** A model's string, trimmed and cut to `max`, or `undefined` when blank. */
export function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** A model's list of strings, each cleaned, deduped (folded), at most `count`. */
export function cleanList(
  value: unknown,
  { count, max }: { count: number; max: number },
): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = cleanText(item, max);
    if (!text) continue;
    const key = fold(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= count) break;
  }
  return out;
}
