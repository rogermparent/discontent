/**
 * Step groups that look like alternatives (45e2, G5): sibling sections that
 * are parallel endings of shared work — a dough, then "Large Loaf",
 * "Baguettes", "Pizza", "Bagels", "Soft Pretzels" — proposed as one set of
 * alternatives the person may accept in the form.
 *
 * **A suggestion only.** Nothing here writes `choice`: an import carries the
 * answer as `suggestedChoices` beside the recipe, the form shows it as a
 * marked card, and only the person's "Make it a choice" and Save store it.
 * CLI and MCP imports return it for the curator to apply with
 * `recipe_update`.
 *
 * Deterministic and pure (no model, browser-safe), so the form can run it
 * over its own values after a fill. A run of consecutive named groups
 * (none already a choice) is cut into sets whose names read as variants:
 *
 * - **one head noun** with different words before it ("Vanilla crumb",
 *   "Chocolate crumb" → "Crumb");
 * - **one prefix** before a colon or dash ("Frosting: cream cheese",
 *   "Frosting: chocolate" → "Frosting");
 * - **every name a form of one kind, or a method** ("Large Loaf",
 *   "Baguettes", "For bagels"; "Dutch oven", "Slow cooker" → "Then make" or
 *   "Method") — not a form and a dish made from another ("Tortillas",
 *   "Tacos");
 * - **every name an option or a version** ("Option 1", "Vegan version").
 *
 * A set is proposed only when it has ≥ 2 options, follows something shared
 * (a step, a group or another set before it), its options' step counts are
 * of a size (none more than three times another, give or take three), and
 * nothing cross-refers: no option's steps name another option, and no later
 * step names two of them ("layer the meat sauce and the béchamel" — both
 * are used, so neither is a choice). Names that count or stage ("First
 * rise", "Day 2", "Part 1") or that start with a verb ("Make the dough",
 * "Shape the dough") never read as variants, and neither do sequential
 * parts ("Dough", "Filling", "Assembly"; "For the sauce", "For the pasta").
 */
import type { InstructionEntry, InstructionGroup } from "../controller/types";

/** A proposed set: its label, and the top-level entries that are its options. */
export interface SuggestedChoice {
  /** The set's label as proposed ("Then make", "Crumb", "Frosting"). */
  label: string;
  /** Indexes into the recipe's `instructions`, consecutive, ≥ 2. */
  groups: number[];
}

/* The curation input may hold prose strings beside objects (45d's trap). */
function isGroup(entry: unknown): entry is InstructionGroup {
  return (
    typeof entry === "object" &&
    entry !== null &&
    Array.isArray((entry as InstructionGroup).instructions)
  );
}

/** A step's text, a prose string or an object. */
function textOf(step: unknown): string {
  if (typeof step === "string") return step;
  const text = (step as { text?: unknown } | null)?.text;
  return typeof text === "string" ? text : "";
}

/** Lowercase words, accents and punctuation off. */
function words(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

const IE_PLURALS = new Set([
  "cookies",
  "pies",
  "brownies",
  "smoothies",
  "pasties",
  "hoagies",
]);

/** A word's singular, roughly: "loaves" loaf, "pretzels" pretzel. */
export function singular(word: string): string {
  if (word.length <= 3) return word;
  if (IE_PLURALS.has(word)) return word.slice(0, -1);
  if (word.endsWith("ves")) return `${word.slice(0, -3)}f`;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (/(?:ss|sh|ch|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("ss") || word.endsWith("us")) return word;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** Words a name may start with that say nothing ("For the", "To make a"). */
const LEAD_WORDS = new Set(["for", "the", "a", "an", "to", "as", "with"]);

/** Size, texture and kind words a form's name may carry ("Large Loaf"). */
const FORM_ADJECTIVES = new Set([
  "large",
  "small",
  "big",
  "mini",
  "little",
  "giant",
  "soft",
  "hard",
  "crusty",
  "crisp",
  "crispy",
  "chewy",
  "thin",
  "thick",
  "classic",
  "round",
  "square",
  "long",
  "individual",
  "whole",
  "one",
  "two",
  "single",
  "free",
  "form",
  "freeform",
  "rustic",
  "sandwich",
  "dinner",
  "new",
  "york",
  "style",
  "deep",
  "dish",
]);

/**
 * Breads, bakes and dishes a shared dough or batter is made into, by kind:
 * options are forms of one kind — a dough made into a loaf or bagels, a
 * batter into cupcakes or a layer cake — never one form and a dish built
 * from another ("Tortillas" and "Tacos", "Burger buns" and "Burgers",
 * "Pastry" and "Tart": the second uses the first).
 */
const FORM_KINDS: Record<string, readonly string[]> = {
  dough: [
    "loaf",
    "boule",
    "batard",
    "baguette",
    "ficelle",
    "epi",
    "pizza",
    "bagel",
    "bialy",
    "pretzel",
    "roll",
    "bun",
    "knot",
    "focaccia",
    "flatbread",
    "naan",
    "pita",
    "calzone",
    "stromboli",
    "ciabatta",
    "breadstick",
    "tortilla",
    "croissant",
    "danish",
    "pastry",
    "doughnut",
    "donut",
    "dumpling",
    "bao",
    "empanada",
  ],
  batter: ["muffin", "cupcake", "cake", "bundt", "waffle", "pancake", "crepe"],
  pie: ["tart", "tartlet", "pie", "galette"],
  cookie: ["cookie", "bar", "brownie", "scone", "biscuit"],
  shaped: ["burger", "patty", "meatball", "skewer", "kebab"],
  dish: ["taco", "burrito", "quesadilla", "sandwich", "casserole"],
};

const FORM_KIND = new Map<string, string>(
  Object.entries(FORM_KINDS).flatMap(([kind, list]) =>
    list.map((word) => [word, kind] as const),
  ),
);

/** Ways to cook the same thing ("Oven", "Dutch oven", "Slow cooker"). */
const METHOD_WORDS = new Set([
  "oven",
  "stovetop",
  "stove",
  "grill",
  "grilled",
  "smoker",
  "smoked",
  "microwave",
  "skillet",
  "pan",
  "baked",
  "fried",
  "roasted",
  "steamed",
  "poached",
  "broiled",
  "braised",
  "cooker",
  "pot",
  "fryer",
  "vide",
  "sous",
  "iron",
  "cast",
  "dutch",
  "sheet",
  "slow",
  "pressure",
  "instant",
  "air",
  "campfire",
  "stand",
  "mixer",
  "hand",
  "food",
  "processor",
  "blender",
  "machine",
  "method",
  "way",
]);

/** Words that count or stage: such names are steps of one thing, not options. */
const SEQUENCE_WORDS = new Set([
  "first",
  "second",
  "third",
  "fourth",
  "final",
  "last",
  "next",
  "then",
  "1st",
  "2nd",
  "3rd",
  "day",
  "stage",
  "step",
  "part",
  "phase",
  "round",
  "night",
  "morning",
  "evening",
  "before",
  "after",
  "later",
  "ahead",
]);

/** Heads two sequential parts share: "Dry ingredients", "Bottom layer". */
const SEQUENCE_HEADS = new Set([
  "ingredient",
  "mixture",
  "mix",
  "layer",
  "rise",
  "proof",
  "prep",
  "time",
  "component",
  "element",
  "item",
  "note",
  "tip",
  "serving",
]);

/** Verbs a section name starts with: "Make the dough", "Shape the dough". */
const VERBS = new Set([
  "make",
  "prepare",
  "prep",
  "shape",
  "bake",
  "mix",
  "assemble",
  "cook",
  "form",
  "roll",
  "knead",
  "rest",
  "finish",
  "serve",
  "fill",
  "frost",
  "glaze",
  "top",
  "decorate",
  "boil",
  "fry",
  "grill",
  "roast",
  "chill",
  "cool",
  "store",
  "freeze",
  "reheat",
  "divide",
  "stretch",
  "proof",
  "stir",
  "whisk",
  "combine",
  "season",
]);

const OPTION_RE = /^(?:option|variation|variant|version|alternative|alt)\b/i;
const VERSION_RE = /\b(?:option|variation|variant|version)\s*\d*$/i;

/** A group name's words, the say-nothing lead words off. */
function nameWords(name: string): string[] {
  const all = words(name);
  let start = 0;
  while (start < all.length - 1 && LEAD_WORDS.has(all[start])) start++;
  return all.slice(start).map(singular);
}

/** A name with its leading verb off, for the form rule ("Shape bagels"). */
function withoutVerb(list: string[]): string[] {
  if (list.length < 2 || !VERBS.has(list[0])) return list;
  let start = 1;
  while (start < list.length - 1 && LEAD_WORDS.has(list[start])) start++;
  return list.slice(start);
}

function counts(name: string): boolean {
  return words(name).some((word) => SEQUENCE_WORDS.has(word));
}

/** "Large Loaf" → `loaf`; the words that name what it makes. */
function formCore(list: string[]): string[] {
  const core = withoutVerb(list).filter((word) => !FORM_ADJECTIVES.has(word));
  return core.length ? core : list;
}

/** The kind of form a name makes ("Large Loaf": dough), if it is one. */
function formKind(list: string[]): string | undefined {
  const core = formCore(list);
  return FORM_KIND.get(core[core.length - 1]);
}

function isMethod(list: string[]): boolean {
  const core = withoutVerb(list);
  return core.length > 0 && core.every((word) => METHOD_WORDS.has(word));
}

/** A name's prefix before a colon or a dash: "Frosting: cream cheese". */
function prefixOf(name: string): { prefix: string; rest: string } | undefined {
  const match = /^\s*([^:–—-]{2,40}?)\s*(?::|\s[–—-]\s)\s*(\S.*)$/.exec(name);
  if (!match) return undefined;
  return { prefix: match[1].trim(), rest: match[2].trim() };
}

function capitalized(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

type Rule = "head" | "prefix" | "form" | "method" | "version";

/** How `names` read as variants, if they do, and the set's label. */
function variantRule(
  names: readonly string[],
): { rule: Rule; label: string } | undefined {
  if (names.length < 2) return undefined;
  const lists = names.map(nameWords);
  if (lists.some((list) => list.length === 0)) return undefined;

  if (
    names.every(
      (name) => OPTION_RE.test(name.trim()) || VERSION_RE.test(name.trim()),
    )
  ) {
    return { rule: "version", label: "Version" };
  }
  if (names.some(counts)) return undefined;

  /* One prefix before a colon or a dash, different words after it. */
  const prefixes = names.map(prefixOf);
  if (prefixes.every(Boolean)) {
    const keys = prefixes.map((p) => words(p!.prefix).map(singular).join(" "));
    const rests = new Set(
      prefixes.map((p) => words(p!.rest).map(singular).join(" ")),
    );
    if (
      keys.every((key) => key && key === keys[0]) &&
      rests.size === names.length
    ) {
      return { rule: "prefix", label: prefixes[0]!.prefix };
    }
  }

  /* Every name a method: "Oven", "Stovetop", "Slow cooker". */
  if (lists.every(isMethod)) {
    return { rule: "method", label: "Method" };
  }

  /* One head noun, a different word before it, no verb leading. */
  const heads = lists.map((list) => list[list.length - 1]);
  if (
    heads.every((head) => head === heads[0]) &&
    !SEQUENCE_HEADS.has(heads[0]) &&
    lists.every((list) => list.length >= 2 && !VERBS.has(list[0]))
  ) {
    const modifiers = new Set(lists.map((list) => list.slice(0, -1).join(" ")));
    if (modifiers.size === lists.length) {
      const original = words(names[0]);
      return {
        rule: "head",
        label: capitalized(original[original.length - 1] ?? heads[0]),
      };
    }
  }

  /* Every name a form the shared work is made into, all of one kind. */
  const kinds = lists.map(formKind);
  if (kinds[0] && kinds.every((kind) => kind === kinds[0])) {
    const cores = new Set(lists.map((list) => formCore(list).join(" ")));
    if (cores.size === lists.length)
      return { rule: "form", label: "Then make" };
  }
  return undefined;
}

/** The words an option is known by in another's steps ("pizza", "sauce"). */
function mentionKey(name: string, rule: Rule): string[] {
  const list = nameWords(name);
  if (rule === "form") return formCore(list);
  if (rule === "prefix") {
    const parts = prefixOf(name);
    return parts ? words(parts.rest).map(singular) : list;
  }
  return withoutVerb(list);
}

/** Does `text` hold the words of `key` in a row? */
function mentions(text: string[], key: readonly string[]): boolean {
  if (key.length === 0) return false;
  for (let i = 0; i + key.length <= text.length; i++) {
    if (key.every((word, offset) => text[i + offset] === word)) return true;
  }
  return false;
}

function stepWords(entry: InstructionEntry): string[] {
  const texts = isGroup(entry)
    ? (entry.instructions ?? []).map(textOf)
    : [textOf(entry)];
  return texts.flatMap((text) => words(text)).map(singular);
}

function stepTotal(group: InstructionGroup): number {
  return (group.instructions ?? []).filter((step) => textOf(step).trim())
    .length;
}

/** Parallel shapes: no option's steps more than ~3× another's. */
function parallel(groups: readonly InstructionGroup[]): boolean {
  const sizes = groups.map(stepTotal);
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  return min >= 1 && max <= Math.max(3 * min, min + 3);
}

/** No option names a sibling, and no later step names two of them. */
function crossReferenced(
  instructions: readonly InstructionEntry[],
  start: number,
  end: number,
  rule: Rule,
): boolean {
  const keys: string[][] = [];
  for (let i = start; i < end; i++) {
    keys.push(mentionKey((instructions[i] as InstructionGroup).name, rule));
  }
  for (let i = start; i < end; i++) {
    const text = stepWords(instructions[i]);
    const own = keys[i - start];
    for (let other = 0; other < keys.length; other++) {
      if (other === i - start) continue;
      /* "Pizza" naming "pizza" is itself; a sibling's words that are also
       * in this option's own name say nothing either. */
      if (keys[other].every((word) => own.includes(word))) continue;
      if (mentions(text, keys[other])) return true;
    }
  }
  const later = instructions.slice(end).flatMap(stepWords);
  return keys.filter((key) => mentions(later, key)).length >= 2;
}

/** How two labels are one for `freeLabel`: their words. */
export function labelKey(text: string): string {
  return words(text).join(" ");
}

/** A label not yet used by the recipe or another suggestion: "Then make 2". */
export function freeLabel(label: string, taken: Set<string>): string {
  const key = labelKey;
  let candidate = label;
  for (let n = 2; taken.has(key(candidate)); n++) candidate = `${label} ${n}`;
  taken.add(key(candidate));
  return candidate;
}

/**
 * The sets `instructions` look like they hold, best first by place: none
 * when nothing reads as alternatives. Groups already in a set (a `choice`)
 * are left out, and so is a recipe with nothing to choose between.
 */
export function suggestChoices(
  instructions: readonly (InstructionEntry | string)[] | undefined,
): SuggestedChoice[] {
  const entries = (instructions ?? []) as readonly InstructionEntry[];
  const out: SuggestedChoice[] = [];
  const taken = new Set<string>();
  for (const entry of entries) {
    if (isGroup(entry) && entry.choice?.trim()) {
      taken.add(words(entry.choice).join(" "));
    }
  }
  const candidate = (entry: InstructionEntry | undefined) =>
    isGroup(entry) &&
    entry.choice === undefined &&
    typeof entry.name === "string" &&
    Boolean(entry.name.trim());

  let i = 0;
  while (i < entries.length) {
    if (!candidate(entries[i])) {
      i++;
      continue;
    }
    let runEnd = i;
    while (runEnd < entries.length && candidate(entries[runEnd])) runEnd++;
    /* Within the run: the longest stretch from each start that reads as
     * variants and passes the structural checks. */
    let start = i;
    while (start < runEnd - 1) {
      /* Something shared comes first: a set never opens the recipe. */
      if (start === 0) {
        start++;
        continue;
      }
      let found: { end: number; label: string } | undefined;
      for (let end = runEnd; end >= start + 2; end--) {
        const groups = entries.slice(start, end) as InstructionGroup[];
        const reading = variantRule(groups.map((group) => group.name));
        if (!reading) continue;
        if (!parallel(groups)) continue;
        if (crossReferenced(entries, start, end, reading.rule)) continue;
        found = { end, label: reading.label };
        break;
      }
      if (found) {
        out.push({
          label: freeLabel(found.label, taken),
          groups: Array.from(
            { length: found.end - start },
            (_, offset) => start + offset,
          ),
        });
        start = found.end;
      } else {
        start++;
      }
    }
    i = runEnd;
  }
  return out;
}
