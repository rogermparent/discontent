/**
 * A recipe out of plain text by a local model (epic 36: D4, D7, D8).
 *
 * One prompt and one schema serve every input: a page's text (`pageText`,
 * D6), a video's title and description, and pasted text (D8). The model
 * copies lines; this module checks that it did (the grounding guard, D4) and
 * maps the answer onto `Partial<ImportedRecipe>` with the importer's own
 * `createIngredient` and `InstructionGroup` shape (D7), so everything after
 * it — `importedToInput`, drafts, dry runs, the form — is unchanged.
 *
 * What the model is trusted with is decided here, not by the caller: unless
 * at least `GROUNDED_MIN` of its ingredient lines are found in the source and
 * it returned at least one ingredient and one step, the result stays
 * `partial`, and 26-D3's `allowPartial` gate still means "not trustworthy".
 */
import type {
  Ingredient,
  Instruction,
  InstructionEntry,
} from "recipe-website-common/controller/types";
import { capText } from "recipe-website-common/util/pageText";
import {
  createIngredient,
  normalizeIngredientText,
} from "recipe-website-common/util/parseIngredients";
import {
  buildSource,
  isVideoUrl,
  type ImportedRecipe,
} from "recipe-website-common/util/importRecipeData";
import { chatJson, type LlmConfig } from "./client";

/* ------------------------------------------------------------------ */
/* Prompt and schema (D7, D8)                                          */
/* ------------------------------------------------------------------ */

/**
 * What the model returns. Times are copied as the text writes them ("3 hours,
 * 45 minutes") and converted here (`parseTimeText`): asked for whole minutes,
 * qwen3:8b turned Sally's "3 hours, 45 minutes" into 234 — the arithmetic,
 * not the reading, is what a small model gets wrong (36a). Only `found`, `name`,
 * `ingredients` and `instructions` are required, so a constrained decoder can
 * leave a time or a yield out instead of being made to guess one.
 *
 * Instructions are flat lines, sections as "Name:" lines, the same as
 * ingredients. D7's nested `[{section?, steps}]` let qwen3:8b close the list
 * empty on a long Sally's card (Star Bread: 10 ingredients, 0 steps); the
 * flat list read all nine (36a).
 */
export const LLM_RECIPE_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    name: { type: "string" },
    description: { type: "string" },
    recipeYield: { type: "string" },
    prepTime: { type: "string" },
    cookTime: { type: "string" },
    totalTime: { type: "string" },
    ingredients: { type: "array", items: { type: "string" } },
    instructions: { type: "array", items: { type: "string" } },
  },
  required: ["found", "name", "ingredients", "instructions"],
} as const;

export const LLM_RECIPE_SCHEMA_NAME = "recipe";

export const LLM_RECIPE_SYSTEM_PROMPT = `You extract one recipe from text and return it as JSON.

The text may be a web page, a video description, an email or a note. Find the recipe in it: its ingredient list and its instructions.

Copy, never write:
- Copy every ingredient line and every instruction step exactly as the text has it: the same words, amounts and units, in the same order. Do not convert, round, translate, summarise, reword or correct anything.
- One ingredient per entry, as the text lists them. A line with two measures stays one line, e.g. "500g (4 cups) bread flour" or "1 cup (120g) flour".
- Never add an ingredient, an amount or a step that is not in the text. If a line has no amount, leave it without one.
- Leave out list bullets and step numbers ("1.", "Step 2:"), but keep the rest of the line as written.
- Copy the whole ingredient list, every line of it, including lines whose amount is approximate ("handful", "about 2") or a range ("5-8g", "100-150g"). Do not skip a line.

Sections:
- When the ingredients come in parts (e.g. "Dough", "Sauce", "For the filling"), put each part's heading in "ingredients" as its own entry ending with a colon, e.g. "Dough:", directly before that part's lines.
- When the instructions come in parts, put each part's heading in "instructions" as its own entry ending with a colon, directly before that part's steps.
- Instructions are often a plain paragraph with no heading and no numbers, e.g. right after the ingredient list. That paragraph is the method: split it into steps at sentence boundaries without changing the words.

Ignore everything that is not the recipe:
- links and URLs, sponsor messages, discount codes, merch, Patreon and membership plugs;
- affiliate links, "my gear" and equipment lists, shopping links;
- chapter lists and timestamps (like "4:45 Boiling the pasta");
- social media handles, "subscribe", music credits, comments, ratings, navigation, nutrition facts;
- other recipes that are only mentioned or linked.

Other fields:
- "name": the recipe's name.
- "description": one or two sentences from the text that describe the dish, or leave it out.
- "recipeYield": the yield as the text says it ("12 cookies", "Serves 4"), only if it says one. A yield or servings line ("Serving: 1", "Makes 5 dozen") goes here, never in "ingredients".
- "prepTime", "cookTime", "totalTime": copied as the text labels them ("25 minutes", "3 hours, 45 minutes"), only when the text states that time. Never estimate or add up a time.

If the text has no recipe — no ingredient list or no instructions — return "found": false with an empty "name", "ingredients" and "instructions".`;

/** What the caller knows about the source besides its text. */
export interface ExtractMeta {
  /** The page's or video's title. */
  title?: string;
  /** `og:site_name`, or the channel for a video. */
  siteName?: string;
  author?: string;
}

/** The user message: where the text is from, then the text itself. */
export function buildRecipeUserPrompt({
  text,
  url,
  meta,
}: {
  text: string;
  url?: string;
  meta?: ExtractMeta;
}): string {
  const header = [
    url && `Source URL: ${url}`,
    meta?.title && `Title: ${meta.title}`,
    meta?.siteName && `Site: ${meta.siteName}`,
  ].filter(Boolean);
  return [
    "Extract the recipe from this text.",
    ...header,
    "",
    "--- TEXT ---",
    text,
    "--- END OF TEXT ---",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Grounding (D4)                                                       */
/* ------------------------------------------------------------------ */

/** At least this share of ingredient lines must be found in the source. */
export const GROUNDED_MIN = 0.9;

/** A line is found if at least this share of its words are in the source. */
export const TOKEN_MATCH_MIN = 0.8;

/**
 * A line as grounding compares it: bullets gone, unicode fractions as `1/2`
 * (`normalizeIngredientText`), accents and case folded, punctuation dropped
 * (the slash of a fraction kept), whitespace collapsed.
 */
export function normaliseForGrounding(text: string): string {
  return normalizeIngredientText(text)
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/(\d)\s*\/\s*(\d)/g, "$1/$2")
    .replace(/[^\p{L}\p{N}/]+/gu, " ")
    .replace(/(^|\s)\/+|\/+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The source, normalised once, for any number of `isGrounded` checks. */
export interface GroundingSource {
  text: string;
  tokens: Set<string>;
}

export function groundingSource(text: string): GroundingSource {
  const normalised = normaliseForGrounding(text);
  return {
    text: ` ${normalised} `,
    tokens: new Set(normalised.split(" ").filter(Boolean)),
  };
}

/**
 * Whether a line is in the source: as a run of whole words once both are
 * normalised, or with at least `TOKEN_MATCH_MIN` of its words found there.
 * A line with no words left (punctuation only) counts as found.
 */
export function isGrounded(line: string, source: GroundingSource): boolean {
  const normalised = normaliseForGrounding(line);
  if (!normalised) return true;
  if (source.text.includes(` ${normalised} `)) return true;
  const words = normalised.split(" ");
  const found = words.filter((word) => source.tokens.has(word)).length;
  return found / words.length >= TOKEN_MATCH_MIN;
}

/* ------------------------------------------------------------------ */
/* Skipped lines                                                       */
/* ------------------------------------------------------------------ */

/** Word-multiset Dice similarity of two normalised lines. */
function dice(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const pool = new Map<string, number>();
  for (const word of right) pool.set(word, (pool.get(word) ?? 0) + 1);
  let shared = 0;
  for (const word of left) {
    const count = pool.get(word) ?? 0;
    if (count > 0) {
      shared += 1;
      pool.set(word, count - 1);
    }
  }
  return (2 * shared) / (left.length + right.length);
}

/** Where in the source a copied line came from: the best unused match. */
function sourceIndex(
  line: string,
  source: { norm: string; words: string[] }[],
  used: Set<number>,
): number {
  const norm = normaliseForGrounding(line);
  if (!norm) return -1;
  const words = norm.split(" ");
  let best = -1;
  let bestScore = 0;
  source.forEach((candidate, index) => {
    if (used.has(index) || !candidate.norm) return;
    const score =
      candidate.norm === norm
        ? 3
        : candidate.norm.includes(norm) || norm.includes(candidate.norm)
          ? 2
          : dice(words, candidate.words);
    if (score > bestScore && score >= 0.8) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

/**
 * A source line that reads as an ingredient: it starts (after a bullet) with
 * an amount, and is not a numbered step, a timestamp or a link.
 */
function looksLikeIngredient(line: string): boolean {
  const text = line.replace(/^[\s*•▪-]+/, "");
  return (
    /^(\d|[¼-¾⅐-⅞])/.test(text) &&
    !/^\d{1,2}\s*[.)]\s/.test(text) &&
    !/^\d{1,2}:\d{2}/.test(text) &&
    !/https?:|www\./i.test(text) &&
    text.length <= 160
  );
}

/**
 * The model's ingredient lines, with any it skipped put back (36a).
 *
 * qwen3:8b sometimes leaves lines out of the middle of a list — four of
 * Brian Lagerstrom's sixteen drunken-noodle lines ("75g (about 2 med-lrg)
 * shallot…", "15g (handful) scallion…") — and grounding cannot see an
 * omission. So the lines the model copied are found in the source; any line
 * *between* the first and the last of them that starts with an amount and
 * was not copied is put back, verbatim, after the copied line before it.
 * Outside that span nothing is added: the model chose where the list is.
 */
export function fillSkippedLines(
  lines: string[],
  source: string,
): { lines: string[]; added: string[] } {
  const sourceLines = source.split("\n").map((raw) => {
    const norm = normaliseForGrounding(raw);
    return { raw: raw.trim(), norm, words: norm ? norm.split(" ") : [] };
  });
  const used = new Set<number>();
  const positions = lines.map((line) => {
    const index = sourceIndex(line, sourceLines, used);
    if (index >= 0) used.add(index);
    return index;
  });
  const found = positions.filter((index) => index >= 0);
  if (found.length < 2) return { lines, added: [] };
  const first = Math.min(...found);
  const last = Math.max(...found);

  const skipped: { index: number; line: string }[] = [];
  for (let index = first + 1; index < last; index += 1) {
    if (used.has(index)) continue;
    const { raw } = sourceLines[index];
    if (!looksLikeIngredient(raw)) continue;
    skipped.push({ index, line: raw.replace(/^[\s*•▪-]+/, "").trim() });
  }
  if (skipped.length === 0) return { lines, added: [] };

  /*
   * A model line found nowhere that shares half its words with a skipped
   * line is a garbled copy of it ("1 cup desicc thaned coconut"): the source
   * line replaces it. Otherwise each skipped line goes after the line
   * nearest above it in the source.
   */
  const words = (line: string) =>
    normaliseForGrounding(line).split(" ").filter(Boolean);
  const result = [...lines];
  for (const { index, line } of skipped) {
    const garbled = positions.findIndex(
      (position, at) =>
        position < 0 && dice(words(result[at]), words(line)) >= 0.5,
    );
    if (garbled >= 0) {
      result[garbled] = line;
      positions[garbled] = index;
      continue;
    }
    let after = -1;
    positions.forEach((position, at) => {
      if (position >= 0 && position < index) {
        if (after < 0 || position > positions[after]) after = at;
      }
    });
    result.splice(after + 1, 0, line);
    positions.splice(after + 1, 0, index);
  }
  return { lines: result, added: skipped.map(({ line }) => line) };
}

/* ------------------------------------------------------------------ */
/* The answer                                                          */
/* ------------------------------------------------------------------ */

/** The model's answer, read defensively: it is JSON, not yet this shape. */
export interface LlmRecipeAnswer {
  found: boolean;
  name?: string;
  description?: string;
  recipeYield?: string;
  prepMinutes?: number;
  cookMinutes?: number;
  totalMinutes?: number;
  ingredients: string[];
  instructions: { section?: string; steps: string[] }[];
}

function text(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed || undefined;
}

function lines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter((line): line is string => !!line);
}

const MINUTES_PER: Record<string, number> = {
  d: 1440,
  h: 60,
  m: 1,
};

/** A number as written: `2`, `1.5`, `1/2`, `1 1/2` (fractions already ascii). */
function amount(text: string): number {
  const [whole, fraction] = text.includes("/")
    ? text.includes(" ")
      ? text.split(" ")
      : ["0", text]
    : [text, undefined];
  const value = Number(whole);
  if (!fraction) return value;
  const [top, bottom] = fraction.split("/").map(Number);
  return value + top / bottom;
}

/**
 * A time as a recipe writes it, in whole minutes: "25 minutes", "1 hour 15
 * mins", "3 hours, 45 minutes", "1 1/2 hours", "1h30m", "an hour", "1 day";
 * a range ("17–18 minutes", "4 to 24 hrs") reads as its upper end; a bare
 * number is minutes. `undefined` for nothing positive under a week — "0
 * minutes", "overnight", "varies".
 */
export function parseTimeText(value: unknown): number | undefined {
  let total: number | undefined;
  if (typeof value === "number") {
    total = value;
  } else if (typeof value === "string") {
    const text = normalizeIngredientText(value)
      .toLowerCase()
      .replace(/\b(an?|one)\s+(?=(day|hour|hr|minute|min)s?\b)/g, "1 ")
      .replace(
        /(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(?=\d+(?:\.\d+)?\s*[a-z])/g,
        "",
      );
    const units = [
      ...text.matchAll(
        /(\d+ \d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(d|days?|h|hrs?|hours?|m|mins?|minutes?)(?![a-z])/g,
      ),
    ];
    if (units.length > 0) {
      total = units.reduce(
        (sum, [, number, unit]) => sum + amount(number) * MINUTES_PER[unit[0]],
        0,
      );
    } else if (/^\d+(?:\.\d+)?$/.test(text.trim())) {
      total = Number(text.trim());
    }
  }
  if (total === undefined || !Number.isFinite(total)) return undefined;
  const rounded = Math.round(total);
  return rounded > 0 && rounded < 7 * 24 * 60 ? rounded : undefined;
}

/** An instruction line that names a section: short, ending in a colon. */
const SECTION_LINE = /^[^.!?]{1,60}:$/;

export function readLlmAnswer(data: unknown): LlmRecipeAnswer {
  const record = (data && typeof data === "object" ? data : {}) as Record<
    string,
    unknown
  >;
  /*
   * Flat lines, a heading ("For the sauce:") opening a section — the shape
   * the schema asks for. A `{section, steps}` object (D7's first shape) is
   * still read, should a model or a test send one.
   */
  const instructions: LlmRecipeAnswer["instructions"] = [];
  let current: LlmRecipeAnswer["instructions"][number] | undefined;
  for (const entry of Array.isArray(record.instructions)
    ? record.instructions
    : []) {
    if (entry && typeof entry === "object") {
      const { section, steps } = entry as Record<string, unknown>;
      current = undefined;
      instructions.push({ section: text(section), steps: lines(steps) });
      continue;
    }
    const line = text(entry);
    if (!line) continue;
    if (SECTION_LINE.test(line)) {
      current = { section: line, steps: [] };
      instructions.push(current);
    } else {
      if (!current) {
        current = { steps: [] };
        instructions.push(current);
      }
      current.steps.push(line);
    }
  }
  return {
    found: record.found !== false,
    name: text(record.name),
    description: text(record.description),
    recipeYield: text(record.recipeYield),
    prepMinutes: parseTimeText(record.prepTime),
    cookMinutes: parseTimeText(record.cookTime),
    totalMinutes: parseTimeText(record.totalTime),
    ingredients: lines(record.ingredients),
    instructions,
  };
}

/** "Ingredients:", "Instructions" — a label the model echoed, not content. */
const BARE_LABEL =
  /^(ingredients?|instructions?|directions?|method|steps|recipe)\s*:?$/i;

/**
 * A markdown heading the model copied from the page text ("#### Cream Cheese
 * Frosting") as the heading line `createIngredient` detects ("Cream Cheese
 * Frosting:").
 */
function markdownHeading(line: string): string {
  const match = /^#{1,6}\s+(.+)$/.exec(line);
  if (!match) return line;
  const text = match[1].trim();
  return text.endsWith(":") ? text : `${text}:`;
}

/** `1.`, `2)`, `Step 3:`, a bullet (`•`, `-`, `*`) at a step's start. */
const STEP_NUMBER = /^(step\s*\d+\s*[:.)-]?|\d{1,2}\s*[.)]|[•▪*-])\s+/i;

function cleanStep(step: string): string {
  return step.replace(STEP_NUMBER, "").trim();
}

function instructionEntries(
  groups: LlmRecipeAnswer["instructions"],
): InstructionEntry[] {
  const entries: InstructionEntry[] = [];
  for (const { section, steps } of groups) {
    const instructions: Instruction[] = steps
      .map(cleanStep)
      .filter((step) => step && !BARE_LABEL.test(step))
      .map((step) => ({ text: step }));
    if (instructions.length === 0) continue;
    const name = section?.replace(/:\s*$/, "").trim();
    if (name && !BARE_LABEL.test(name)) {
      entries.push({ name, instructions });
    } else {
      entries.push(...instructions);
    }
  }
  return entries;
}

function stepCount(entries: InstructionEntry[]): number {
  return entries.reduce(
    (total, entry) =>
      total + ("instructions" in entry ? entry.instructions.length : 1),
    0,
  );
}

/** The first line of the text that reads as a title, for a nameless answer. */
function firstLine(source: string): string | undefined {
  for (const line of source.split("\n")) {
    const cleaned = line.replace(/^[#>*\-\s]+/, "").trim();
    if (cleaned) return cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* The extractor                                                       */
/* ------------------------------------------------------------------ */

export interface LlmStats {
  model: string;
  /** Ingredient lines (headings included) found in the source. */
  grounded: number;
  total: number;
  /** The lines that were not found, for a person to check (at most 10). */
  ungrounded?: string[];
  /** Source lines the model skipped inside its ingredient list, put back. */
  added?: string[];
  /** Wall time of the model call. */
  durationMs: number;
}

export type LlmExtraction =
  | {
      found: true;
      recipe: Partial<ImportedRecipe>;
      llm: LlmStats;
      warnings: string[];
    }
  | {
      found: false;
      llm: Pick<LlmStats, "model" | "durationMs">;
    };

export interface ExtractRecipeInput {
  /** The source: page text (`pageText`), a video description, pasted text. */
  text: string;
  /** Where it came from; `source` (and `video`, for a video) when given. */
  url?: string;
  meta?: ExtractMeta;
  /** How the warning names the source: "the page" or "the text". */
  sourceKind?: "page" | "text";
  /** Defaults to `llmConfig()`; unset throws `LlmError("unconfigured")`. */
  config?: LlmConfig;
  timeoutMs?: number;
  numCtx?: number;
  signal?: AbortSignal;
}

/**
 * Ask the model for the recipe in `text`, check its ingredient lines against
 * `text` (D4), and map the answer (D7).
 *
 * `{found: false}` when the model says there is no recipe, or returns no
 * ingredients and no steps. Otherwise the recipe — `partial` unless it is
 * grounded, with at least one ingredient and one step. Model failures throw
 * `LlmError` (`client.ts`).
 */
export async function extractRecipeWithLlm(
  input: ExtractRecipeInput,
): Promise<LlmExtraction> {
  const { text: source } = capText(input.text);
  const result = await chatJson({
    system: LLM_RECIPE_SYSTEM_PROMPT,
    user: buildRecipeUserPrompt({
      text: source,
      url: input.url,
      meta: input.meta,
    }),
    schema: LLM_RECIPE_SCHEMA,
    schemaName: LLM_RECIPE_SCHEMA_NAME,
    config: input.config,
    timeoutMs: input.timeoutMs,
    numCtx: input.numCtx,
    signal: input.signal,
  });
  const answer = readLlmAnswer(result.data);

  const { lines: ingredientLines, added } = fillSkippedLines(
    answer.ingredients
      .map(markdownHeading)
      .filter((line) => !BARE_LABEL.test(line)),
    source,
  );
  const ingredients = ingredientLines
    .map(createIngredient)
    .filter((entry): entry is Ingredient => !!entry);
  const instructions = instructionEntries(answer.instructions);
  const steps = stepCount(instructions);
  const items = ingredients.filter((entry) => entry.type !== "heading").length;

  if (!answer.found || (items === 0 && steps === 0)) {
    return {
      found: false,
      llm: { model: result.model, durationMs: result.durationMs },
    };
  }

  const grounding = groundingSource(source);
  const ungrounded = ingredientLines.filter(
    (line) => !isGrounded(line, grounding),
  );
  const total = ingredientLines.length;
  const grounded = total - ungrounded.length;
  const trusted =
    items > 0 && steps > 0 && total > 0 && grounded / total >= GROUNDED_MIN;

  const llm: LlmStats = {
    model: result.model,
    grounded,
    total,
    ...(ungrounded.length > 0 ? { ungrounded: ungrounded.slice(0, 10) } : {}),
    ...(added.length > 0 ? { added } : {}),
    durationMs: result.durationMs,
  };

  const recipe: Partial<ImportedRecipe> = {
    name: answer.name ?? input.meta?.title ?? firstLine(source),
    ...(answer.description ? { description: answer.description } : {}),
    ...(answer.recipeYield ? { recipeYield: answer.recipeYield } : {}),
    prepTime: answer.prepMinutes,
    cookTime: answer.cookMinutes,
    totalTime: answer.totalMinutes,
    ingredients,
    instructions,
    ...(input.url
      ? {
          source: buildSource(
            input.url,
            undefined,
            input.meta?.author,
            input.meta?.siteName,
          ),
          ...(isVideoUrl(input.url) ? { videoImportUrl: input.url } : {}),
        }
      : {}),
    ...(trusted ? {} : { partial: true }),
  };

  return {
    found: true,
    recipe,
    llm,
    warnings: [llmWarning(llm, { items, steps, trusted }, input.sourceKind)],
  };
}

/** The one warning an extraction carries: what to check, or why it is partial. */
export function llmWarning(
  llm: Pick<LlmStats, "model" | "grounded" | "total" | "added">,
  { items, steps, trusted }: { items: number; steps: number; trusted: boolean },
  sourceKind: "page" | "text" = "page",
): string {
  const where = sourceKind === "text" ? "in the text" : "on the page";
  const found = `${llm.grounded}/${llm.total} ingredient lines found verbatim ${where}`;
  const added = llm.added?.length
    ? ` (${llm.added.length} it skipped added back from the list)`
    : "";
  if (trusted) {
    return `extracted by local model ${llm.model} — ${found}${added}; check it`;
  }
  const why =
    items === 0
      ? "it found no ingredients"
      : steps === 0
        ? "it found no instructions"
        : `only ${found}`;
  return `local model ${llm.model}'s extraction is partial — ${why}; check it against the source`;
}
