/**
 * 49b: the check a `shopping-merge` job's answer goes through before the
 * shopping page sees it — the "AI changes need approval" rule's first half
 * (the second is that only Accept, Merge or Keep apart writes).
 *
 * **revise** (Db1), all or nothing as 47i's Di6: the verdict is `merge` or
 * `apart`; a merge names two or more of the asked rows by number and no
 * other (no item is invented), a name (or "" for the list's own), and a
 * unit (or ""). **49c (Dc1): the model names the unit, the code does the
 * arithmetic** — `mergedAmountInUnit` converts and sums the lines, marks a
 * density's answer estimated and rounds as a cook writes it; a number the
 * model gives anyway is ignored and said in the job log, and a unit the
 * lines can't be given in (cloves in grams; cups in grams with no density
 * on file) is answered plainly. One bad part refuses the answer and says
 * why.
 *
 * **find** (Db2), group by group: an unknown number is dropped, a number in
 * two groups stays in the first, and a group left under two names, with no
 * name, already kept apart, merged or proposed by the table is dropped —
 * each with a line saying why. **49c (Dc3)** adds: more than 3 names; a
 * known-different pair (`SHOPPING_KNOWN_DIFFERENT`, the table's list too);
 * names that share no word; a category for a name ("spices"), or a name that
 * is none of the group's own. What is left are proposals in 49a's shape.
 *
 * Pure: no model, no file.
 */
import {
  normalizeUnit,
  parseAmount,
} from "recipe-website-common/util/ingredientAmount";
import { CLOSE_HEAD_EXCLUDED } from "recipe-website-common/util/ingredientNames";
import {
  ASKABLE_UNITS,
  MERGE_LIMITS,
  knownDifferentPair,
  knownSameKind,
  mergeIdOf,
  normalizeMergeKeys,
  type AskableUnit,
  type ShoppingMerge,
} from "recipe-website-common/util/shoppingMerges";
import {
  mergedAmountInUnit,
  mergedRowIds,
  proposalForKeys,
  type ShoppingProposalRow,
} from "recipe-website-common/util/shoppingConsolidate";
import { shoppingNameOf } from "recipe-website-common/util/shoppingView";
import type {
  ShoppingAskDecision,
  ShoppingAskTarget,
  ShoppingModelProposal,
} from "recipe-website-common/util/shoppingAsk";
import type { ShoppingProposal } from "recipe-website-common/util/shoppingConsolidate";
import type {
  ShoppingItem,
  ShoppingSettings,
} from "recipe-website-common/util/shoppingTypes";

/** How long a reason may be, as the panel shows it. */
export const ASK_REASON_MAX = 300;

/** At most this many groups are read from a find answer. */
export const FIND_MAX_GROUPS = 30;

/** A found group is a pair, or this many names at most (Dc3). */
export const FIND_GROUP_MAX = 3;

/**
 * revise: what the model answers (Ollama `format`, Claude's structured
 * output). 49c (Dc1): a unit from `ASKABLE_UNITS`, never an amount.
 */
export const REVISE_JSON_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["merge", "apart"] },
    items: { type: "array", items: { type: "integer" } },
    name: { type: "string" },
    unit: { type: "string", enum: ["", ...ASKABLE_UNITS] },
    reason: { type: "string" },
  },
  required: ["verdict", "items", "name", "unit", "reason"],
  additionalProperties: false,
} as const;

/** find: groups of numbered names. */
export const FIND_JSON_SCHEMA = {
  type: "object",
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          items: { type: "array", items: { type: "integer" } },
          name: { type: "string" },
          reason: { type: "string" },
        },
        required: ["items", "name", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["groups"],
  additionalProperties: false,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One line, spaces collapsed. */
function oneLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/**
 * The same name, as a person would type it again: case, spacing and
 * hyphens aside ("all purpose flour" for "all-purpose flour"). Not by name
 * key — "plain flour" keys as all-purpose flour, and a person who asks to
 * call it that wants the label.
 */
function sameName(a: string, b: string): boolean {
  const plain = (text: string) =>
    oneLine(text.replace(/[-‐‑]/g, " ")).toLowerCase();
  return plain(a) === plain(b);
}

/** `≈`, `~` or "about" in front of an amount. */
const APPROX = /^(?:≈|~|about\s+|approx(?:\.|imately)?\s+)\s*/i;

/** An amount the list can show: one that `parseAmount` reads a number in. */
export function readableAmount(text: string): boolean {
  const amount = parseAmount(text.replace(APPROX, ""));
  return !!amount && amount.parts.some((part) => part.qty > 0);
}

/** Two amounts that say the same, "≈" aside. */
function sameAmount(a: string, b: string): boolean {
  const left = parseAmount(a.replace(APPROX, ""));
  const right = parseAmount(b.replace(APPROX, ""));
  if (!left || !right) return oneLine(a) === oneLine(b);
  return JSON.stringify(left.parts) === JSON.stringify(right.parts);
}

/** The list a revise reads: its items, switches and decisions. */
export interface AskList {
  items: readonly ShoppingItem[];
  settings: ShoppingSettings;
  merges: readonly ShoppingMerge[];
}

export type ReviseCheck = (
  | {
      status: "merge";
      proposal: ShoppingProposal;
      /** The unit the list converted the amount into (Dc1), when it did. */
      unit?: AskableUnit;
      decision: ShoppingAskDecision;
    }
  | { status: "apart"; reason: string; decision: ShoppingAskDecision }
  | { status: "refused"; problem: string; cannotConvert?: true }
) & {
  /** What the answer said that the check set aside (Dc1): for the job log. */
  ignored?: string[];
};

/** How a unit reads in "can't give it in grams". */
const UNIT_WORDS: Readonly<Record<AskableUnit, string>> = {
  g: "grams",
  kg: "kilograms",
  oz: "ounces",
  lb: "pounds",
  ml: "millilitres",
  l: "litres",
  cup: "cups",
  tbsp: "tablespoons",
  tsp: "teaspoons",
};

/** "990.75 g ", "≈ 2 ½ cups ": a number and a unit in front of a name. */
const LEADING_AMOUNT =
  /^(?:≈|~|about\s+)?\s*[\d¼½¾⅓⅔⅛⅜⅝⅞][\d\s.,/¼½¾⅓⅔⅛⅜⅝⅞-]*\s*([a-z]+(?:\s+oz)?)\.?\s+(?=\S)/i;

/**
 * A name with a number and a unit in front ("990 g all-purpose flour"):
 * the name alone and what was set aside. "00 flour" has no unit after its
 * number, so it stays as it is.
 */
function withoutAmount(name: string): { name: string; amount?: string } {
  const match = LEADING_AMOUNT.exec(name);
  if (!match || !normalizeUnit(match[1])) return { name };
  return { name: name.slice(match[0].length).trim(), amount: match[0].trim() };
}

/**
 * The unit an answer asks for, as one of `ASKABLE_UNITS`: "grams" and "g"
 * alike. A number in front ("890 g") is set aside; `null` for a unit the
 * list can't use.
 */
function askedUnit(raw: string): {
  unit?: AskableUnit;
  number?: string;
  unknown?: string;
} {
  const text = raw.trim();
  if (!text) return {};
  const number = /^[≈~]?\s*[\d¼½¾⅓⅔⅛⅜⅝⅞][\d\s.,/¼½¾⅓⅔⅛⅜⅝⅞-]*/.exec(text)?.[0];
  const word = number ? text.slice(number.length).trim() : text;
  const unit = normalizeUnit(word)?.unit;
  const known = (ASKABLE_UNITS as readonly string[]).includes(unit ?? "")
    ? (unit as AskableUnit)
    : undefined;
  return {
    ...(known ? { unit: known } : { unknown: text }),
    ...(number ? { number: text } : {}),
  };
}

/**
 * A revise answer (Db1), checked against what was asked: the rows by number,
 * the list it was asked over, and the person's note (saved with the
 * decision, if accepted).
 */
export function checkReviseAnswer(
  data: unknown,
  target: ShoppingAskTarget,
  list: AskList,
  note: string,
): ReviseCheck {
  if (!isRecord(data)) {
    return { status: "refused", problem: "the answer is not a JSON object" };
  }
  const ignored: string[] = [];
  const withIgnored = <T extends object>(check: T) =>
    ignored.length > 0 ? { ...check, ignored } : check;
  /* Dc1: an amount is the list's to work out, whatever the answer says. */
  const given = data.amount;
  if (
    (typeof given === "string" && given.trim()) ||
    typeof given === "number"
  ) {
    ignored.push(
      `the model gave an amount (“${String(given).trim().slice(0, 60)}”); the list works amounts out itself`,
    );
  }
  const reason = oneLine(data.reason).slice(0, ASK_REASON_MAX);
  const replaces = (keys: readonly string[]) =>
    target.merged && mergeIdOf(keys) !== target.id
      ? { replaces: target.id }
      : {};
  if (data.verdict === "apart") {
    const keys = normalizeMergeKeys(target.keys);
    return withIgnored({
      status: "apart" as const,
      reason,
      decision: {
        keys,
        status: "apart" as const,
        ...(note ? { note } : {}),
        ...replaces(keys),
      },
    });
  }
  if (data.verdict !== "merge") {
    return {
      status: "refused",
      problem: "it answered neither “merge” nor “apart”",
    };
  }
  const items = Array.isArray(data.items) ? data.items : [];
  const numbers: number[] = [];
  for (const item of items) {
    if (
      typeof item !== "number" ||
      !Number.isInteger(item) ||
      item < 1 ||
      item > target.rows.length
    ) {
      return {
        status: "refused",
        problem: `it names item ${JSON.stringify(item)}, which is not one of the ${target.rows.length} lines asked about`,
      };
    }
    if (!numbers.includes(item)) numbers.push(item);
  }
  if (numbers.length < 2) {
    return {
      status: "refused",
      problem: "a merge needs two or more of the lines asked about",
    };
  }
  const stripped = withoutAmount(oneLine(data.name));
  if (stripped.amount) {
    ignored.push(
      `the model put an amount in the name (“${stripped.amount}”); the list works amounts out itself`,
    );
  }
  let name = stripped.name;
  if (name.length > MERGE_LIMITS.name) {
    return {
      status: "refused",
      problem: `the name is over ${MERGE_LIMITS.name} characters`,
    };
  }
  const quantities = list.settings.features.quantities;
  const asked = quantities ? askedUnit(oneLine(data.unit)) : {};
  if (asked.number) {
    ignored.push(
      `the model gave “${asked.number}” for the unit; only the unit is used`,
    );
  }
  if (asked.unknown) {
    return withIgnored({
      status: "refused" as const,
      problem: `it asked for “${asked.unknown}”, which is not a unit the list can give an amount in`,
    });
  }

  const keys = normalizeMergeKeys(
    numbers.map((number) => target.rows[number - 1].key),
  );
  /* The decision asked about gives way to the answer (it may be narrower). */
  const merges = list.merges.filter((merge) => merge.id !== target.id);
  const plain = proposalForKeys(list.items, list.settings, merges, keys, {
    reason,
  });
  if (!plain) {
    return withIgnored({
      status: "refused" as const,
      problem: "those lines are no longer two names on the list",
    });
  }
  /* "" is the list's own name; a merged row keeps the one it was given. */
  if (!name && target.merged) {
    name = list.merges.find((merge) => merge.id === target.id)?.name ?? "";
  }
  const named = !!name && (target.merged || !sameName(name, plain.name));

  let amount: string | undefined;
  let unit: AskableUnit | undefined;
  if (asked.unit) {
    const label = named ? name : plain.name;
    const converted = mergedAmountInUnit(
      list.items,
      keys,
      asked.unit,
      shoppingNameOf(label).key,
    );
    if (!converted.ok) {
      const words = UNIT_WORDS[asked.unit];
      return withIgnored({
        status: "refused" as const,
        cannotConvert: true as const,
        problem:
          converted.why === "count"
            ? `the list can't give ${label} in ${words}: ${converted.part} is a count, not a weight or a volume`
            : converted.why === "density"
              ? `the list can't give ${label} in ${words}: it has no weight for a cup of ${label} on file, so ${converted.part} can't be converted`
              : `the list can't give ${label} in ${words}: its lines have no amounts`,
      });
    }
    if (!converted.unchanged) {
      const text = converted.estimated ? `≈ ${converted.text}` : converted.text;
      if (!sameAmount(text, plain.amount)) {
        amount = text;
        unit = asked.unit;
      }
    }
  }
  const proposal =
    named || amount
      ? proposalForKeys(list.items, list.settings, merges, keys, {
          ...(named ? { name } : {}),
          ...(amount ? { amount } : {}),
          reason,
        })!
      : plain;
  if (amount && unit) {
    proposal.estimated = amount.startsWith("≈");
  }
  /* The lines the sum was worked out for: a list changed before Accept
   * shows the sum again, and says so (Da4), rather than this amount. */
  const amountFor = amount
    ? mergedRowIds(list.items, list.settings, merges, keys)
    : undefined;
  return withIgnored({
    status: "merge" as const,
    proposal,
    ...(unit ? { unit } : {}),
    decision: {
      keys,
      status: "merged" as const,
      ...(named ? { name } : {}),
      ...(amount ? { amount } : {}),
      ...(amount && amountFor ? { amountFor } : {}),
      ...(note ? { note } : {}),
      ...replaces(keys),
    },
  });
}

/**
 * Words that name a category, not a thing to buy (Dc3): a found group's name
 * with one of them, where none of its rows has that word, is refused —
 * "spices", "leavening agents", "ingredients for recipes".
 */
export const CATEGORY_WORDS: ReadonlySet<string> = new Set([
  "agent",
  "assorted",
  "baking",
  "blend",
  "condiment",
  "dairy",
  "dish",
  "fat",
  "herb",
  "ingredient",
  "item",
  "leavener",
  "leavening",
  "mixed",
  "other",
  "pantry",
  "produce",
  "recipe",
  "seasoning",
  "spice",
  "staple",
  "sweetener",
  "thing",
  "various",
]);

function wordsOf(key: string): string[] {
  return key.split(" ").filter((word) => word.length > 0);
}

/** "Spices" → "spice", "dishes" → "dish": enough to meet `CATEGORY_WORDS`. */
function bareWord(word: string): string {
  const lower = word.toLowerCase().replace(/[^a-z]/g, "");
  if (lower.endsWith("ies")) return `${lower.slice(0, -3)}y`;
  if (/(?:sh|ch|x)es$/.test(lower)) return lower.slice(0, -2);
  if (lower.endsWith("s") && !lower.endsWith("ss")) return lower.slice(0, -1);
  return lower;
}

/** A last word a name may carry or not: "jalapeno" and "jalapeno pepper". */
const TRAILING_HEADS: ReadonlySet<string> = new Set(["pepper", "cheese"]);

/** `words` ends with `tail`. */
function endsWith(words: readonly string[], tail: readonly string[]): boolean {
  return (
    tail.length > 0 &&
    tail.length <= words.length &&
    tail.every(
      (word, index) => words[words.length - tail.length + index] === word,
    )
  );
}

/**
 * Two names that may be one product (Dc3, tightened by the review): the
 * shorter is the longer with words added in front — "buttermilk" and "low
 * fat buttermilk", "kosher salt" and "coarse kosher salt", "bell pepper" and
 * "red bell pepper" — or so once a trailing "pepper" or "cheese" is set
 * aside ("jalapeno" and "jalapeno pepper"); never a bare word that names
 * different things (32j's `CLOSE_HEAD_EXCLUDED`: "salt" and "sea salt",
 * "bean" and "black bean"). Two names one kind of the known-different list
 * holds together are alike too ("salt" and "table salt", heavy and whipping
 * cream). Not "heavy cream" and "sour cream", "chicken broth" and "beef
 * broth", "baking powder" and "baking soda".
 */
function shareHead(a: ShoppingProposalRow, b: ShoppingProposalRow): boolean {
  if (knownSameKind(a.key, b.key)) return true;
  let short = wordsOf(a.key);
  let long = wordsOf(b.key);
  if (short.length > long.length) [short, long] = [long, short];
  if (short.length === long.length) return false;
  if (endsWith(long, short)) {
    return !(short.length === 1 && CLOSE_HEAD_EXCLUDED.has(short[0]));
  }
  const last = long[long.length - 1];
  return (
    TRAILING_HEADS.has(last) &&
    short[short.length - 1] !== last &&
    endsWith(long.slice(0, -1), short)
  );
}

/**
 * Why a found group is not one product under one of its own names, or
 * `undefined` when it may be (Dc3): a known-different pair, two names that
 * share no word, a category for a name, or a name that is none of the
 * group's.
 */
function notOneProduct(
  rows: readonly ShoppingProposalRow[],
  name: string,
): string | undefined {
  const sorted = [...rows].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
  const keys = sorted.map((row) => row.key);
  const different = knownDifferentPair(keys);
  if (different) {
    return `${different.a} and ${different.b} are different things to buy (${different.what})`;
  }
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (!shareHead(sorted[i], sorted[j])) {
        return `neither ${sorted[i].key} nor ${sorted[j].key} is the other with words in front, so they are not one product`;
      }
    }
  }
  const rowWords = new Set(keys.flatMap(wordsOf));
  const category = name
    .split(/[\s,&/-]+/)
    .map(bareWord)
    .find((word) => CATEGORY_WORDS.has(word) && !rowWords.has(word));
  if (category) {
    return `“${name}” is a category, not the name of one of them`;
  }
  const nameKey = shoppingNameOf(name).key;
  const nameWords = new Set(wordsOf(nameKey));
  const own =
    keys.includes(nameKey) ||
    keys.some((key) => wordsOf(key).every((word) => nameWords.has(word)));
  return own ? undefined : `“${name}” is not the name of one of them`;
}

/** The names a find sends, numbered from 1 in this order. */
export type FindNames = readonly ShoppingProposalRow[];

export type FindCheck =
  | {
      status: "found";
      proposals: ShoppingModelProposal[];
      dropped: string[];
      /** What the check set aside (a number in a name): for the job log. */
      ignored?: string[];
    }
  | { status: "refused"; problem: string };

/**
 * A find answer (Db2): the groups the check keeps, as proposals, and a line
 * for each one it drops. `proposed` are the name sets the table proposes
 * now.
 */
export function checkFindAnswer(
  data: unknown,
  names: FindNames,
  list: AskList,
  proposed: readonly (readonly string[])[] = [],
): FindCheck {
  if (!isRecord(data) || !Array.isArray(data.groups)) {
    return { status: "refused", problem: "the answer has no “groups” list" };
  }
  const dropped: string[] = [];
  const ignored: string[] = [];
  const used = new Set<number>();
  const proposals: ShoppingModelProposal[] = [];
  const taken = new Set<string>();
  const proposedIds = new Set(proposed.map((keys) => mergeIdOf(keys)));
  for (const [index, group] of data.groups
    .slice(0, FIND_MAX_GROUPS)
    .entries()) {
    const label = `group ${index + 1}`;
    if (!isRecord(group)) {
      dropped.push(`${label}: not an object`);
      continue;
    }
    const raw = Array.isArray(group.items) ? group.items : [];
    const numbers: number[] = [];
    for (const item of raw) {
      if (
        typeof item !== "number" ||
        !Number.isInteger(item) ||
        item < 1 ||
        item > names.length
      ) {
        dropped.push(
          `${label}: item ${JSON.stringify(item)} is not one of the ${names.length} names`,
        );
        continue;
      }
      if (used.has(item) || numbers.includes(item)) continue;
      numbers.push(item);
    }
    const stripped = withoutAmount(oneLine(group.name));
    if (stripped.amount) {
      ignored.push(
        `${label}: the model put an amount in the name (“${stripped.amount}”); the list works amounts out itself`,
      );
    }
    const name = stripped.name.slice(0, MERGE_LIMITS.name);
    if (numbers.length < 2) {
      dropped.push(`${label}: fewer than two names`);
      continue;
    }
    if (numbers.length > FIND_GROUP_MAX) {
      dropped.push(
        `${label}: ${numbers.length} names — a group is a pair, or ${FIND_GROUP_MAX} at most`,
      );
      continue;
    }
    if (!name) {
      dropped.push(`${label}: no name`);
      continue;
    }
    const keys = normalizeMergeKeys(
      numbers.map((number) => names[number - 1].key),
    );
    const id = mergeIdOf(keys);
    const words = keys.join(" + ");
    if (taken.has(id) || proposedIds.has(id)) {
      dropped.push(`${label} (${words}): already proposed`);
      continue;
    }
    /* A merged name, or a kept-apart set inside the group or around it. */
    const decided = list.merges.find((merge) =>
      merge.status === "merged"
        ? merge.keys.some((key) => keys.includes(key))
        : keys.every((key) => merge.keys.includes(key)) ||
          merge.keys.every((key) => keys.includes(key)),
    );
    if (decided) {
      dropped.push(
        `${label} (${words}): ${decided.status === "merged" ? "merged already" : "kept apart already"}`,
      );
      continue;
    }
    /* 49c (Dc3): only the same product, under a name of its own. */
    const why = notOneProduct(
      numbers.map((number) => names[number - 1]),
      name,
    );
    if (why) {
      dropped.push(`${label} (${words}): ${why}`);
      continue;
    }
    const reason = oneLine(group.reason).slice(0, ASK_REASON_MAX);
    const plain = proposalForKeys(
      list.items,
      list.settings,
      list.merges,
      keys,
      {
        reason,
      },
    );
    if (!plain) {
      dropped.push(`${label} (${words}): not two names on the list`);
      continue;
    }
    const named = !sameName(name, plain.name);
    const proposal = named
      ? proposalForKeys(list.items, list.settings, list.merges, keys, {
          name,
          reason,
        })!
      : plain;
    for (const number of numbers) used.add(number);
    taken.add(id);
    proposals.push({
      proposal,
      decision: { keys, status: "merged", ...(named ? { name } : {}) },
    });
  }
  return {
    status: "found",
    proposals,
    dropped,
    ...(ignored.length > 0 ? { ignored } : {}),
  };
}
