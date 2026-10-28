/**
 * Alternatives: parallel sections the reader picks one of (epic 45e, G1–G4).
 *
 * The data is plain groups and headings with one optional key on top:
 * consecutive instruction groups that carry the same `choice` form one
 * **set** — the value is the set's label ("Then make"), each group's `name`
 * an option's ("Bagels") — and an ingredient heading with the same `choice`
 * and an option's name owns that option's extra lines, up to the next
 * heading. `readChoices` (`readChoices.ts`, on the server: it pairs headings
 * by `sectionKey`) turns a recipe into the `Choices` model here; everything
 * in this module reads only that model, so it is light enough for the
 * browser and never pulls in `ingredientNames`.
 *
 * `shownPath(choices, picks)` is the one answer every reader shares: which
 * steps and ingredient lines are on the path the reader chose, and how they
 * are numbered (G4). A recipe without sets has one path — every step and
 * line, numbered as `stepNumbers` numbers them, with the anchors and timer
 * ids it always had — so old data reads exactly as before.
 */
import slugify from "@sindresorhus/slugify";

/** The pick that shows every option of a set, stacked (G3). */
export const ALL_OPTIONS = "all";

export interface ChoiceOption {
  /** The option's key in a pick and in anchors: `bagels`. */
  slug: string;
  /** The group's name, as written: "Bagels" ("Option 2" for an unnamed one). */
  label: string;
  /** The instruction entries (groups) that make up the option, in order. */
  groupIndexes: number[];
  /** The ingredient lines it owns — its heading included — in order. */
  ingredientLines: number[];
  /** The option's own yield ("8 bagels"), when its group has one. */
  yield?: string;
  /**
   * The option's own times in minutes (46f), when its group has any: the
   * recipe's three when it is chosen, as a block (`OptionTimes`).
   */
  times?: OptionTimes;
}

/**
 * An option's times (46f), in minutes — the whole recipe's when the option
 * is made, as its yield is the recipe's. Only the ones it states; one with
 * any replaces all three of the recipe's on its path (`pathTimes`), so a
 * "Bagels" total never sits beside the dough's own prep time.
 */
export interface OptionTimes {
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
}

export const OPTION_TIME_FIELDS = [
  "prepTime",
  "cookTime",
  "totalTime",
] as const;

/** A group's own times, positive whole minutes only; undefined for none. */
export function optionTimesOf(
  group: Partial<Record<(typeof OPTION_TIME_FIELDS)[number], unknown>>,
): OptionTimes | undefined {
  const times: OptionTimes = {};
  for (const field of OPTION_TIME_FIELDS) {
    const value = group[field];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      times[field] = value;
    }
  }
  return Object.keys(times).length > 0 ? times : undefined;
}

/**
 * The times a path shows (46f): the chosen option's when it states any,
 * else the recipe's own — each read with the page's rule that a missing
 * total is prep plus cook.
 */
export function pathTimes(
  recipe: OptionTimes,
  times: OptionTimes | undefined,
): { prepTime: number; cookTime: number; totalTime: number } {
  const from = times ?? recipe;
  const prepTime = from.prepTime || 0;
  const cookTime = from.cookTime || 0;
  return {
    prepTime,
    cookTime,
    totalTime: from.totalTime || prepTime + cookTime,
  };
}

export interface ChoiceSet {
  /** The set's key in a pick: `then-make`. Unique within the recipe. */
  key: string;
  /** The `choice` value, as written: "Then make". */
  label: string;
  /** Two or more; the first is the default (G2). */
  options: ChoiceOption[];
}

/** Everything a reader needs to work out a path, from the server. */
export interface Choices {
  sets: ChoiceSet[];
  /** Steps per instruction entry: a group's count, or 1 for a bare step. */
  entrySteps: number[];
  /** How many ingredient lines the recipe has (headings included). */
  ingredientCount: number;
}

/** Set key → option slug or `ALL_OPTIONS`. A missing set means its default. */
export type Picks = Record<string, string>;

export const NO_CHOICES: Choices = {
  sets: [],
  entrySteps: [],
  ingredientCount: 0,
};

/**
 * The model of a recipe with nothing to choose, from its lists' shape alone:
 * what a reader falls back to outside a recipe view.
 */
export function plainChoices(
  instructions: readonly ({ instructions?: unknown[] } | object)[] = [],
  ingredientCount = 0,
): Choices {
  return {
    sets: [],
    /* As `stepNumbers` counts: a group's steps, or one for a bare step. */
    entrySteps: instructions.map((entry) =>
      "instructions" in entry
        ? Array.isArray(entry.instructions)
          ? entry.instructions.length
          : 0
        : 1,
    ),
    ingredientCount,
  };
}

/** Whether the recipe has anything to choose. */
export function hasChoices(choices: Choices | undefined): boolean {
  return Boolean(choices && choices.sets.length > 0);
}

/** A label as a key: `Soft pretzels` → `soft-pretzels`. */
export function choiceSlug(text: string): string {
  return slugify(text ?? "");
}

/**
 * Every set's pick, defaults filled in (G2) and anything unknown dropped:
 * an option that is not the set's, or a set the recipe does not have.
 */
export function resolvePicks(
  choices: Choices,
  picks: Picks | undefined = {},
): Picks {
  const out: Picks = {};
  for (const set of choices.sets) {
    const wanted = picks[set.key];
    out[set.key] =
      wanted === ALL_OPTIONS ||
      set.options.some((option) => option.slug === wanted)
        ? wanted
        : set.options[0].slug;
  }
  return out;
}

/** Only the picks that name a set the recipe has and one of its options. */
export function knownPicks(choices: Choices, picks: Picks): Picks {
  const out: Picks = {};
  for (const set of choices.sets) {
    const wanted = picks[set.key];
    if (
      wanted === ALL_OPTIONS ||
      set.options.some((option) => option.slug === wanted)
    ) {
      out[set.key] = wanted;
    }
  }
  return out;
}

/** The same picks with "All" read as the default: one path to cook (G2). */
export function cookPicks(choices: Choices, picks?: Picks): Picks {
  const resolved = resolvePicks(choices, picks);
  for (const set of choices.sets) {
    if (resolved[set.key] === ALL_OPTIONS) {
      resolved[set.key] = set.options[0].slug;
    }
  }
  return resolved;
}

/** Whether every set is on its default option. */
export function isDefaultPicks(choices: Choices, picks?: Picks): boolean {
  const resolved = resolvePicks(choices, picks);
  return choices.sets.every((set) => resolved[set.key] === set.options[0].slug);
}

/* ------------------------------------------------------------------------ */
/* The `?pick=` parameter (G3)                                              */
/* ------------------------------------------------------------------------ */

/** The query parameter that links a pick: `?pick=bagels`. */
export const PICK_PARAM = "pick";

/**
 * `?pick=` read against the recipe's sets. The shapes:
 *
 * - `bagels` — an option slug; it names the first set that has it;
 * - `all` — every set shows all its options;
 * - `crumb:streusel,frosting:cream-cheese` — one `set:option` per set, and
 *   `crumb:all` for one set's "All".
 *
 * Unknown parts are ignored, so a stale link still opens the recipe.
 */
export function parsePickParam(
  value: string | null | undefined,
  choices: Choices,
): Picks {
  const picks: Picks = {};
  if (!value) return picks;
  for (const raw of value.split(",")) {
    const part = raw.trim().toLowerCase();
    if (!part) continue;
    const colon = part.indexOf(":");
    if (colon >= 0) {
      const setKey = part.slice(0, colon);
      const option = part.slice(colon + 1);
      const set = choices.sets.find((each) => each.key === setKey);
      if (
        set &&
        (option === ALL_OPTIONS ||
          set.options.some((each) => each.slug === option))
      ) {
        picks[set.key] = option;
      }
      continue;
    }
    if (part === ALL_OPTIONS) {
      for (const set of choices.sets) picks[set.key] = ALL_OPTIONS;
      continue;
    }
    const set = choices.sets.find((each) =>
      each.options.some((option) => option.slug === part),
    );
    if (set) picks[set.key] = part;
  }
  return picks;
}

/**
 * The `?pick=` value for `picks`, or `undefined` when every set is on its
 * default (the plain address already says that). One set writes the bare
 * option (`bagels`, `all`); several write `set:option` for each set off its
 * default.
 */
export function formatPickParam(
  choices: Choices,
  picks: Picks | undefined,
): string | undefined {
  const resolved = resolvePicks(choices, picks);
  const changed = choices.sets.filter(
    (set) => resolved[set.key] !== set.options[0].slug,
  );
  if (changed.length === 0) return undefined;
  if (choices.sets.length === 1) return resolved[choices.sets[0].key];
  return changed.map((set) => `${set.key}:${resolved[set.key]}`).join(",");
}

/* ------------------------------------------------------------------------ */
/* The remembered pick (G3: per recipe, on the device)                      */
/* ------------------------------------------------------------------------ */

/** The key one recipe's remembered pick lives under in localStorage. */
export function pickStorageKey(slug: string): string {
  return `recipe-pick:${slug}`;
}

/** A remembered pick, or `{}` when none (or unreadable storage). */
export function readStoredPicks(
  storage: Pick<Storage, "getItem"> | undefined,
  slug: string,
): Picks {
  try {
    const raw = storage?.getItem(pickStorageKey(slug));
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

/** Remember a pick; a full or blocked store is ignored. */
export function writeStoredPicks(
  storage: Pick<Storage, "setItem"> | undefined,
  slug: string,
  picks: Picks,
): void {
  try {
    storage?.setItem(pickStorageKey(slug), JSON.stringify(picks));
  } catch {
    /* The pick still holds for this visit. */
  }
}

/* ------------------------------------------------------------------------ */
/* The shown path (G4)                                                      */
/* ------------------------------------------------------------------------ */

/** One step as a path places it. */
export interface PathStep {
  /** Its instruction entry, and its place in that entry (0 for a bare step). */
  entry: number;
  index: number;
  /** Its page number on this path. */
  number: number;
  /** Its anchor: `step-4`, or `step-bagels-6` inside an option. */
  id: string;
  /**
   * What its timers are keyed by: the number for a shared step (`4`, so the
   * ids are `stepTimerId`'s `step-4-0` as before), `bagels-6` inside an
   * option, so two options' sixth steps never share a timer.
   */
  timerKey: number | string;
  /** On the path. False for an option not chosen. */
  shown: boolean;
  /** The option it belongs to, if any. */
  option?: { set: string; slug: string };
}

export interface ShownPath {
  /** Every set's pick, resolved. */
  picks: Picks;
  /** Entry → its steps, numbered. Every step is here; `shown` says which show. */
  steps: PathStep[][];
  /** Entry → whether it shows. */
  entries: boolean[];
  /** Ingredient line → whether it shows. */
  lines: boolean[];
  /** The yield the chosen options name, if any (the last set's that has one). */
  yield?: string;
  /**
   * The times the chosen options state, if any (46f): the last set's whose
   * chosen option has some, as the yield. Absent under "All".
   */
  times?: OptionTimes;
}

/**
 * Where each entry sits: the set and option it belongs to, if any.
 * `undefined` for a shared entry.
 */
function entryOwners(
  choices: Choices,
): Array<{ set: ChoiceSet; option: ChoiceOption } | undefined> {
  const owners: Array<{ set: ChoiceSet; option: ChoiceOption } | undefined> =
    choices.entrySteps.map(() => undefined);
  for (const set of choices.sets) {
    for (const option of set.options) {
      for (const index of option.groupIndexes) owners[index] = { set, option };
    }
  }
  return owners;
}

/**
 * An option's anchor and timer prefix: its slug, or `set-slug` when another
 * set has an option of the same slug.
 */
function optionKeys(choices: Choices): Map<ChoiceOption, string> {
  const counts = new Map<string, number>();
  for (const set of choices.sets) {
    for (const option of set.options) {
      counts.set(option.slug, (counts.get(option.slug) ?? 0) + 1);
    }
  }
  const keys = new Map<ChoiceOption, string>();
  for (const set of choices.sets) {
    for (const option of set.options) {
      keys.set(
        option,
        (counts.get(option.slug) ?? 0) > 1
          ? `${set.key}-${option.slug}`
          : option.slug,
      );
    }
  }
  return keys;
}

/**
 * The path `picks` choose (G4). Shared steps are numbered in order; a set's
 * chosen option continues the count, and the shared steps after the set
 * continue from the option's last. Every option is numbered from where its
 * set starts, as if it were the one chosen, so "All" (and print) shows each
 * with the numbers it would have; after an "All" set the count goes on from
 * the default option (G2).
 */
export function shownPath(choices: Choices, picks?: Picks): ShownPath {
  const resolved = resolvePicks(choices, picks);
  const owners = entryOwners(choices);
  const keys = optionKeys(choices);
  const steps: PathStep[][] = choices.entrySteps.map(() => []);
  const entries = choices.entrySteps.map(() => true);
  let next = 1;
  let i = 0;
  while (i < choices.entrySteps.length) {
    const owner = owners[i];
    if (!owner) {
      steps[i] = Array.from({ length: choices.entrySteps[i] }, (_, j) => {
        const number = next++;
        return {
          entry: i,
          index: j,
          number,
          id: `step-${number}`,
          timerKey: number,
          shown: true,
        };
      });
      i++;
      continue;
    }
    /* A whole set at once: its entries are contiguous by construction. */
    const { set } = owner;
    const start = next;
    let end = i;
    while (end < owners.length && owners[end]?.set === set) end++;
    const pick = resolved[set.key];
    const counted =
      pick === ALL_OPTIONS
        ? set.options[0]
        : set.options.find((option) => option.slug === pick)!;
    let after = start;
    for (const option of set.options) {
      const key = keys.get(option)!;
      const shown = pick === ALL_OPTIONS || option === counted;
      let n = start;
      for (const entry of option.groupIndexes) {
        entries[entry] = shown;
        steps[entry] = Array.from(
          { length: choices.entrySteps[entry] },
          (_, j) => {
            const number = n++;
            return {
              entry,
              index: j,
              number,
              id: `step-${key}-${number}`,
              timerKey: `${key}-${number}`,
              shown,
              option: { set: set.key, slug: option.slug },
            };
          },
        );
      }
      if (option === counted) after = n;
    }
    next = after;
    i = end;
  }

  const lines = Array.from({ length: choices.ingredientCount }, () => true);
  let shownYield: string | undefined;
  let shownTimes: OptionTimes | undefined;
  for (const set of choices.sets) {
    const pick = resolved[set.key];
    for (const option of set.options) {
      const shown = pick === ALL_OPTIONS || option.slug === pick;
      if (!shown) {
        for (const line of option.ingredientLines) lines[line] = false;
      } else if (pick !== ALL_OPTIONS) {
        if (option.yield) shownYield = option.yield;
        if (option.times) shownTimes = option.times;
      }
    }
  }

  return {
    picks: resolved,
    steps,
    entries,
    lines,
    ...(shownYield ? { yield: shownYield } : {}),
    ...(shownTimes ? { times: shownTimes } : {}),
  };
}

/** The set an entry starts, when it is a set's first entry. */
export function setStartingAt(
  choices: Choices,
  entry: number,
): ChoiceSet | undefined {
  return choices.sets.find(
    (set) => Math.min(...set.options.flatMap((o) => o.groupIndexes)) === entry,
  );
}

/** The set an entry belongs to, if any. */
export function setOfEntry(
  choices: Choices,
  entry: number,
): ChoiceSet | undefined {
  return choices.sets.find((set) =>
    set.options.some((option) => option.groupIndexes.includes(entry)),
  );
}

/** The option an ingredient line belongs to, if any. */
export function optionOfLine(
  choices: Choices,
  line: number,
): { set: ChoiceSet; option: ChoiceOption } | undefined {
  for (const set of choices.sets) {
    for (const option of set.options) {
      if (option.ingredientLines.includes(line)) return { set, option };
    }
  }
  return undefined;
}

/** A path's id for storage keys: `then-make=bagels`, sets in order. */
export function pathKey(choices: Choices, picks?: Picks): string {
  const resolved = resolvePicks(choices, picks);
  return choices.sets.map((set) => `${set.key}=${resolved[set.key]}`).join("&");
}
