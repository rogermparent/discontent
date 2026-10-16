/**
 * Several recipes in one text (epic 36, 36e, D10): a video that makes three
 * side dishes, a pasted description with a cake and its separate sauce.
 *
 * Two stages, measured against one call that returns `recipes[]` (D10):
 *
 * 1. **A gate, then a list.** `mayHoldSeveral` is deterministic and free: the
 *    text must hold at least two ingredient blocks with prose between them
 *    (a method paragraph, a link list). Only then does the model get a cheap
 *    first call (`listRecipes`, ~3–8 s on qwen3:8b) that names the separate
 *    recipes and copies the line each one starts at. Most texts — one recipe,
 *    sections and all — never reach it, so their reading is byte for byte
 *    what it was before 36e. A list of two or more gets one more short
 *    question (`isOneDish`, ~0.3–4 s): parts combined into one dish (a
 *    chicken, its sauce, its rice) are read as one recipe after all.
 * 2. **One D7 reading per slice.** `locateRecipes` finds each listed start in
 *    the text; the text is cut there (`sliceText`), every line in exactly one
 *    slice, and each slice goes through the unchanged extractor. Grounding is
 *    per slice, so a line of one recipe cannot be counted for another, and no
 *    line falls between two recipes.
 *
 * What the batch knows that a single reading does not: which ingredient line
 * names another recipe of the batch (`findComponents` — "Crispy fried
 * shallots (or onions) - see recipe below"), and, for a video, the chapter
 * each recipe starts in (`chapterFor`; a component with no chapter of its own
 * takes the chapter of the recipe that uses it).
 *
 * Loaded lazily with the extractor (35q): nothing here runs without a model.
 */
import type { ChapterRef } from "./chapterTime";
import { chatJson, type LlmApi, type LlmConfig } from "./client";
import { jobContext, type JobRun } from "../jobs/context";
import {
  buildRecipeUserPrompt,
  normaliseForGrounding,
  type ExtractMeta,
} from "./extractRecipe";

export { formatStart, type ChapterRef } from "./chapterTime";
export { linkLine } from "./mergeReadings";

/* ------------------------------------------------------------------ */
/* The gate                                                            */
/* ------------------------------------------------------------------ */

/** A line that leads with an amount: "250g", "1 1/2 cups", "½ tsp". */
const AMOUNT_LED = /^(\d|[¼-¾⅐-⅞])/;

/** Words, as the gate counts them. */
function wordCount(line: string): number {
  return line.split(/\s+/).filter(Boolean).length;
}

/** "Salt", "POTATO PUREE", "Dressing:", "canola oil" — a heading or a bare item. */
const SHORT_LINE_MAX_WORDS = 6;

type GateLine = "amount" | "short" | "prose";

function gateLine(raw: string): GateLine {
  const line = raw.replace(/^[\s*•▪-]+/, "").trim();
  if (/https?:\/\/|www\./i.test(line)) return "prose";
  if (
    AMOUNT_LED.test(line) &&
    !/^\d{1,2}:\d{2}/.test(line) &&
    !/^\d{1,2}\s*[.):]\s/.test(line) &&
    line.length <= 160 &&
    !/[.!?]\s+\p{Lu}/u.test(line)
  ) {
    return "amount";
  }
  return wordCount(line) <= SHORT_LINE_MAX_WORDS && !/[.!?]$/.test(line)
    ? "short"
    : "prose";
}

/**
 * How many ingredient blocks the text holds: runs of at least two
 * amount-led lines (headings and bare items like "Salt" inside a run
 * keep it going), ended by a prose line — a method paragraph, a sentence, a
 * link. A recipe in sections ("Dough:", "Sauce:") is one block; three dishes,
 * each list followed by its method, are three.
 */
export function ingredientBlocks(text: string): number {
  let blocks = 0;
  let amounts = 0;
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    const kind = gateLine(raw);
    if (kind === "amount") {
      amounts += 1;
    } else if (kind === "prose") {
      if (amounts >= 2) blocks += 1;
      amounts = 0;
    }
  }
  if (amounts >= 2) blocks += 1;
  return blocks;
}

/** The deterministic gate before the model is asked to list recipes. */
export function mayHoldSeveral(text: string): boolean {
  return ingredientBlocks(text) >= 2;
}

/* ------------------------------------------------------------------ */
/* Stage 1: the list                                                    */
/* ------------------------------------------------------------------ */

export const LLM_LIST_SCHEMA = {
  type: "object",
  properties: {
    recipes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          heading: { type: "string" },
          firstIngredient: { type: "string" },
        },
        required: ["name", "heading", "firstIngredient"],
      },
    },
  },
  required: ["recipes"],
} as const;

export const LLM_LIST_SCHEMA_NAME = "recipes";

export const LLM_LIST_SYSTEM_PROMPT = `You find the separate recipes in a text and list them. You do not copy the recipes, you only name them and say where each one starts.

The text may be a video description, a web page, an email or a note. Most texts hold one recipe. Some hold several, e.g. a video that makes three side dishes.

A separate recipe has its own ingredient list and its own instructions, and it is a dish of its own, or something the text itself calls a recipe of its own (e.g. "see recipe below").
Parts of one dish are not separate recipes: a dough, sauce, filling, dressing, marinade, topping, frosting, rice or garnish that the text combines into one finished dish stays part of that dish, even when it has its own heading and its own steps — unless the text calls it a separate recipe.

Ignore links, sponsor messages, equipment and gear lists, chapter lists and timestamps.

For each separate recipe, in the order the text has them, return:
- "name": the recipe's name;
- "heading": the line that starts it — its title or heading, just above its ingredient list — copied exactly as the text writes it; "" when it has none;
- "firstIngredient": its first ingredient line, copied exactly.

When the text holds one recipe, return one entry. When it holds no recipe, return "recipes": [].`;

export interface ListedRecipe {
  name: string;
  heading: string;
  firstIngredient: string;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** The model's list, read defensively: anything malformed is no entry. */
export function readListAnswer(data: unknown): ListedRecipe[] {
  const recipes =
    data && typeof data === "object"
      ? (data as Record<string, unknown>).recipes
      : undefined;
  if (!Array.isArray(recipes)) return [];
  return recipes.flatMap((entry): ListedRecipe[] => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const listed = {
      name: str(record.name),
      heading: str(record.heading),
      firstIngredient: str(record.firstIngredient),
    };
    return listed.name || listed.heading || listed.firstIngredient
      ? [listed]
      : [];
  });
}

/** Ask the model which separate recipes the text holds (stage 1). */
export function listRecipes({
  text,
  url,
  meta,
  config,
  signal,
  job,
}: {
  text: string;
  url?: string;
  meta?: ExtractMeta;
  config?: LlmConfig;
  signal?: AbortSignal;
  /** The job (epic 37): an `llm.list` step. */
  job?: JobRun;
}): Promise<{
  recipes: ListedRecipe[];
  model: string;
  /** The API that answered (39a). */
  api?: LlmApi;
  durationMs: number;
}> {
  const { log } = jobContext(job);
  return log.step("llm.list", { chars: text.length }, async (step) => {
    const result = await chatJson({
      system: LLM_LIST_SYSTEM_PROMPT,
      user: buildRecipeUserPrompt({ text, url, meta }).replace(
        /^Extract the recipe from this text\./,
        "List the separate recipes in this text.",
      ),
      schema: LLM_LIST_SCHEMA,
      schemaName: LLM_LIST_SCHEMA_NAME,
      config,
      signal,
      job,
      step,
    });
    const recipes = readListAnswer(result.data);
    step.set({ names: recipes.map((recipe) => recipe.name || recipe.heading) });
    return {
      recipes,
      model: result.model,
      ...(result.api ? { api: result.api } : {}),
      durationMs: result.durationMs,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Stage 1b: one dish in parts?                                        */
/* ------------------------------------------------------------------ */

export const LLM_ONE_DISH_SCHEMA = {
  type: "object",
  properties: { oneDish: { type: "boolean" } },
  required: ["oneDish"],
} as const;

/**
 * Asked only when the list names two or more (D10). The list alone split
 * Lagerstrom's butter chicken ("2 recipes in 1 dish": the chicken and its
 * marinade, the sauce, the rice) into three, both runs; a `oneDish` field
 * added to the list's own schema fixed that but turned his ciabatta into
 * five "recipes" (BIGA, AUTOLYSE, …) — T1 again. As its own short call it
 * answered 15 of 16 texts right, and the 16th never passes the gate.
 */
export const LLM_ONE_DISH_SYSTEM_PROMPT = `You read a recipe text and say whether it makes one dish or several.

"oneDish": true when everything the text makes is combined into one finished dish and served together as one — e.g. a chicken, its marinade, the sauce it is folded into and the rice it is served on; or a pizza with its dough, sauce and toppings.
"oneDish": false when the text makes separate dishes that are served or kept apart — e.g. three side dishes, or a cake and a separate sauce recipe — even when one is used on another.

Ignore links, sponsor messages, equipment lists, chapter lists and timestamps.`;

/** Whether the model reads the text as one dish in parts (stage 1b). */
export function isOneDish({
  text,
  url,
  meta,
  config,
  signal,
  job,
}: {
  text: string;
  url?: string;
  meta?: ExtractMeta;
  config?: LlmConfig;
  signal?: AbortSignal;
  /** The job (epic 37): an `llm.oneDish` step. */
  job?: JobRun;
}): Promise<boolean> {
  const { log } = jobContext(job);
  return log.step("llm.oneDish", { chars: text.length }, async (step) => {
    const result = await chatJson({
      system: LLM_ONE_DISH_SYSTEM_PROMPT,
      user: buildRecipeUserPrompt({ text, url, meta }).replace(
        /^Extract the recipe from this text\./,
        "Does this text make one dish or several?",
      ),
      schema: LLM_ONE_DISH_SCHEMA,
      schemaName: "dishes",
      config,
      signal,
      job,
      step,
    });
    const data = result.data as Record<string, unknown> | undefined;
    const oneDish = data?.oneDish === true;
    step.set({ oneDish });
    return oneDish;
  });
}

/* ------------------------------------------------------------------ */
/* Slicing                                                             */
/* ------------------------------------------------------------------ */

/** A chapter or timestamp line: "5:04 Stuffing", "1:02:05". */
const TIMESTAMP = /^\s*\d{1,2}:\d{2}/;

/**
 * A line that can be a recipe's heading: short, no amount, no timestamp —
 * not "2 cups fried shallots", not "5:04 Stuffing" (36e review).
 */
function headingLike(raw: string): boolean {
  const line = raw.trim();
  return (
    !!line &&
    gateLine(line) === "short" &&
    !AMOUNT_LED.test(line.replace(/^[\s*•▪-]+/, "")) &&
    !TIMESTAMP.test(line)
  );
}

/**
 * A copied line's place in the text, from `from` on: the whole line first;
 * then, with `heading`, a heading-like line holding it with a little
 * decoration ("STUFFING" for "STUFFING ✨", "FRIED SHALLOTS" for "FRIED
 * SHALLOTS (FOR THE CASSEROLE)"); without, any line holding it.
 */
function findLine(
  lines: string[],
  needle: string,
  from: number,
  { heading = false }: { heading?: boolean } = {},
): number {
  const target = normaliseForGrounding(needle);
  if (!target) return -1;
  const normalised = lines.map((line) => normaliseForGrounding(line));
  for (let at = from; at < lines.length; at += 1) {
    if (normalised[at] === target) return at;
  }
  for (let at = from; at < lines.length; at += 1) {
    const line = normalised[at];
    if (
      line &&
      ` ${line} `.includes(` ${target} `) &&
      line.length <= target.length + 20 &&
      (!heading || headingLike(lines[at]))
    ) {
      return at;
    }
  }
  return -1;
}

/** A heading's own ingredient list starts within this many lines of it. */
const HEADING_TO_LIST_MAX_LINES = 4;

/** The non-blank lines between `from` and `to`, exclusive. */
function linesBetween(lines: string[], from: number, to: number): number {
  return lines.slice(from + 1, to).filter((line) => line.trim()).length;
}

/**
 * Where each listed recipe starts: its heading's line — checked against its
 * first ingredient, which must follow within a few lines, so a heading
 * matched in a chapter list or an ingredient line cannot cut a recipe short
 * — else its first ingredient's (and the short heading-like line just above
 * that, if any). In order, each after the last. `undefined` when one cannot
 * be found — the text is then read as one recipe, as before.
 */
export function locateRecipes(
  text: string,
  listed: readonly ListedRecipe[],
): number[] | undefined {
  const lines = text.split("\n");
  const starts: number[] = [];
  let from = 0;
  for (const recipe of listed) {
    let at = findLine(lines, recipe.heading, from, { heading: true });
    if (at >= 0 && recipe.firstIngredient) {
      const first = findLine(lines, recipe.firstIngredient, at + 1);
      const tooFar =
        first >= 0
          ? linesBetween(lines, at, first) >= HEADING_TO_LIST_MAX_LINES
          : /* Only before the heading: the heading is not this recipe's. */
            findLine(lines, recipe.firstIngredient, from) >= 0;
      if (tooFar) at = -1;
    }
    if (at < 0) {
      at = findLine(lines, recipe.firstIngredient, from);
      if (at < 0) return undefined;
      /* Its heading, if the model left it out: one short line above. */
      let above = at - 1;
      while (above >= from && !lines[above].trim()) above -= 1;
      if (above >= from && headingLike(lines[above])) at = above;
    }
    starts.push(at);
    from = at + 1;
  }
  return starts;
}

/** The text cut at `starts`: each slice runs to the next start (the last, to the end). */
export function sliceText(text: string, starts: readonly number[]): string[] {
  const lines = text.split("\n");
  return starts.map((start, index) =>
    lines
      .slice(start, index + 1 < starts.length ? starts[index + 1] : undefined)
      .join("\n")
      .trim(),
  );
}

/* ------------------------------------------------------------------ */
/* Components: one recipe's line that names another                    */
/* ------------------------------------------------------------------ */

/** "see recipe below", "recipe follows", "(recipe above)", "see below". */
const REFERENCE =
  /\bsee\s+(the\s+)?(recipe|below|above)\b|\brecipe\s+(below|above|follows|following)\b|\(recipe\b/i;

/** Words that do not name a dish. */
const NAME_FILLER = new Set([
  "a",
  "an",
  "and",
  "for",
  "my",
  "of",
  "or",
  "the",
  "to",
  "with",
  "recipe",
  "homemade",
  "easy",
  "best",
]);

/** A word as names compare it: plural folded ("shallots" → "shallot"). */
function fold(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("oes")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/** The words that name a dish: normalised, folded, filler out. */
export function nameWords(name: string): string[] {
  return normaliseForGrounding(name)
    .split(" ")
    .filter((word) => word && !/^\d/.test(word) && !NAME_FILLER.has(word))
    .map(fold);
}

/** A batch ingredient line that names another recipe of the batch. */
export interface ComponentRef {
  /** The line's index in the recipe's `ingredients`. */
  line: number;
  /** The other recipe's index in the batch. */
  target: number;
}

/**
 * Which ingredient lines of each recipe name another recipe of the batch:
 * every word of the other's name is in the line, and the line says so — "see
 * recipe below", "recipe follows" — or is no more than that name (a bare
 * "Fried shallots" line, no amount). Headings never link.
 */
export function findComponents(
  recipes: readonly {
    names: readonly string[];
    ingredients: readonly { ingredient: string; type?: string }[];
  }[],
): ComponentRef[][] {
  const named = recipes.map((recipe) =>
    recipe.names
      .map(nameWords)
      .filter((words) => words.length > 0)
      .map((words) => new Set(words)),
  );
  return recipes.map((recipe, index) =>
    recipe.ingredients.flatMap((entry, line): ComponentRef[] => {
      if (entry.type === "heading") return [];
      const text = entry.ingredient.replace(
        /<Multiplyable\s+baseNumber="([^"]*)"\s*\/>/g,
        "$1",
      );
      const words = new Set(nameWords(text));
      const reference = REFERENCE.test(text);
      for (let target = 0; target < recipes.length; target += 1) {
        if (target === index) continue;
        const match = named[target].some(
          (name) =>
            [...name].every((word) => words.has(word)) &&
            (reference || (!AMOUNT_LED.test(text) && words.size <= name.size)),
        );
        if (match) return [{ line, target }];
      }
      return [];
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Chapters                                                            */
/* ------------------------------------------------------------------ */

/** A chapter must carry at least this share of a recipe's name words. */
const CHAPTER_MATCH_MIN = 0.5;

/**
 * The chapter a recipe is made in, by title: the chapter holding the most of
 * the recipe's name words ("Potato Puree" in "Potato Puree/Mashed
 * Potatoes"), at least half of them; the earlier on a tie.
 */
export function chapterFor(
  names: readonly string[],
  chapters: readonly ChapterRef[],
): ChapterRef | undefined {
  let best: { chapter: ChapterRef; score: number } | undefined;
  for (const name of names) {
    const words = nameWords(name);
    if (words.length === 0) continue;
    for (const chapter of chapters) {
      const have = new Set(nameWords(chapter.title));
      const score =
        words.filter((word) => have.has(word)).length / words.length;
      if (score >= CHAPTER_MATCH_MIN && (!best || score > best.score)) {
        best = { chapter, score };
      }
    }
  }
  return best?.chapter;
}

/**
 * Each recipe's chapter: its own by title, else — a component like the fried
 * shallots — the chapter of the first recipe whose ingredients name it.
 */
export function placeInChapters(
  names: readonly (readonly string[])[],
  components: readonly ComponentRef[][],
  chapters: readonly ChapterRef[],
): (ChapterRef | undefined)[] {
  const own = names.map((recipeNames) => chapterFor(recipeNames, chapters));
  return own.map((chapter, index) => {
    if (chapter) return chapter;
    const parent = components.findIndex(
      (refs, at) => at !== index && refs.some((ref) => ref.target === index),
    );
    return parent >= 0 ? own[parent] : undefined;
  });
}
