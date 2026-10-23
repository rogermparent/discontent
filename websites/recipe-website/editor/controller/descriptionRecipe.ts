/**
 * A recipe written out as lists in a video's description, read without a
 * model (45d).
 *
 * Brian Lagerstrom's "The 25 Minute No Knead Dough" puts the whole recipe in
 * its description under "THE EVERYTHING DOUGH RECIPE:" — "∙"-bulleted
 * ingredient lines, numbered steps, then "Large Loaf", "Baguettes"… each
 * with its own numbered steps. With no model (the Pi before 38g, `--llm
 * off`, a model that finds nothing) the video came in as a bare title and
 * description. This reads that shape, and only that shape:
 *
 * - The block starts at a **recipe heading**: a short line, not a link,
 *   that says "recipe" or "ingredients", followed (blank lines aside)
 *   by a bulleted or numbered line, or by a part's heading and then one.
 * - Inside it, a bulleted line (`∙ • · ● ▪ ◦`, or `-` / `*` and a space) is
 *   an ingredient, a numbered line (`1.` / `1)`) a step, and a short line
 *   followed by bulleted or numbered lines a heading — of an ingredient part
 *   before bullets, of a step group before numbers. "Ingredients:" and
 *   "Instructions:" are labels, not headings.
 * - Anything else ends it: a link (gear lists, "HALF SHEET PAN:
 *   https://amzn.to/…"), a timestamp (chapters), a line of prose.
 * - Gear, tools, kits, codes, sponsors, shops and affiliates are never a
 *   heading, and a link is also a bare domain ("geni.us/abc") or a handle.
 * - It counts only with at least two ingredient lines and a step, and only
 *   when the description has one recipe heading: two recipes are the
 *   model's to split (36e).
 *
 * Conservative by design: a line that does not plainly belong is where the
 * block stops, and nothing outside it is read. When a model reads the
 * video, its reading wins — this is only asked when the import has no
 * ingredients and no steps (`withDescriptionRecipe`).
 */
import { createIngredient } from "recipe-website-common/util/parseIngredients";
import type {
  Ingredient,
  InstructionEntry,
  InstructionGroup,
} from "recipe-website-common/controller/types";
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import type { ApplyLlmResult } from "./llm/importWithLlm";
import type { JobContext } from "./jobs/context";

const BULLET = /^(?:[∙•·●▪◦]\s*|[-*]\s+)(.*)$/;
const NUMBERED = /^(\d{1,2})[.)]\s+(.+)$/;
/**
 * A link, a handle or a bare domain ("geni.us/abc", "geni.us",
 * "@chefjohn"): a gear list, never an ingredient.
 */
const LINK =
  /https?:\/\/|www\.|@\w|\b[\w-]+\.[a-z]{2,}\/|\b[a-z][\w-]*\.(?:com|net|org|us|io|co|me|ly|to|shop|store|gg|link|ca|uk|tv|app|be|it)\b/i;
const TIMESTAMP = /^\(?\d{1,2}:\d{2}/;
const RECIPE_HEADING = /\b(?:recipe|ingredients?)\b/i;
const LABEL =
  /^(?:ingredients?|instructions?|directions?|method|steps|recipe)\s*:?$/i;
const HEADING_MAX = 40;
/** A heading that names gear, a shop or a deal — never a recipe's part. */
const NOT_RECIPE =
  /\b(?:gear|tools?|kits?|equipment|codes?|sponsor\w*|shop\w*|affiliate\w*|discounts?|merch)\b/i;

type Line =
  | { kind: "blank" }
  | { kind: "bullet"; text: string }
  | { kind: "step"; text: string }
  | { kind: "other"; text: string };

function classify(raw: string): Line {
  const line = raw.trim();
  if (!line) return { kind: "blank" };
  const numbered = NUMBERED.exec(line);
  if (numbered) return { kind: "step", text: numbered[2].trim() };
  const bullet = BULLET.exec(line);
  /* "**As an Amazon Associate…**" is emphasis, not a bullet. */
  if (bullet && !line.startsWith("**")) {
    return { kind: "bullet", text: bullet[1].trim() };
  }
  return { kind: "other", text: line };
}

/** An item line that may sit in a recipe: text, no link, no timestamp. */
function isItem(line: Line | undefined): boolean {
  return (
    !!line &&
    (line.kind === "bullet" || line.kind === "step") &&
    !!line.text &&
    !LINK.test(line.text) &&
    !TIMESTAMP.test(line.text)
  );
}

/** The next line that is not blank. */
function nextFilled(lines: readonly Line[], from: number): Line | undefined {
  for (let index = from; index < lines.length; index += 1) {
    if (lines[index].kind !== "blank") return lines[index];
  }
  return undefined;
}

/**
 * A short line that names what follows it: no link, not a sentence, not
 * emphasis ("**As an Amazon Associate…**"), not gear or a deal ("GEAR I
 * USE IN THIS RECIPE:", "Get the recipe kit").
 */
function isHeadingText(text: string): boolean {
  return (
    text.length <= HEADING_MAX &&
    !text.startsWith("*") &&
    !NOT_RECIPE.test(text) &&
    !LINK.test(text) &&
    !TIMESTAMP.test(text) &&
    !/[.!?]$/.test(text)
  );
}

/**
 * Whether a list follows the line at `index`: an item next, or one
 * heading and then an item ("INGREDIENTS", "Dough:", "• 500 g flour").
 */
function leadsToItems(lines: readonly Line[], index: number): boolean {
  let next = index + 1;
  while (next < lines.length && lines[next].kind === "blank") next += 1;
  const line = lines[next];
  if (isItem(line)) return true;
  return (
    line?.kind === "other" &&
    isHeadingText(line.text) &&
    isItem(nextFilled(lines, next + 1))
  );
}

export interface DescriptionRecipe {
  ingredients: Ingredient[];
  instructions: InstructionEntry[];
}

/**
 * The recipe a description lists under a recipe heading, or `undefined`
 * when it lists none (see the module comment for the rules).
 */
export function descriptionRecipe(
  description: string | undefined,
): DescriptionRecipe | undefined {
  if (!description) return undefined;
  const lines = description.split(/\r?\n/).map(classify);
  const starts = lines.flatMap((line, index) =>
    line.kind === "other" &&
    RECIPE_HEADING.test(line.text) &&
    isHeadingText(line.text) &&
    leadsToItems(lines, index)
      ? [index]
      : [],
  );
  /* Two recipes ("RECIPE 1: Pancakes" … "RECIPE 2: Waffles") are the
   * model's to split (36e), never one recipe read from here. An
   * "Ingredients:" label under the heading is not a second recipe. */
  const recipes = starts.filter((index) => {
    const line = lines[index];
    return line.kind === "other" && !LABEL.test(line.text);
  });
  if (recipes.length > 1) return undefined;
  const start = starts[0];
  if (start === undefined) return undefined;

  const ingredients: Ingredient[] = [];
  const instructions: InstructionEntry[] = [];
  let group: InstructionGroup | undefined;
  let heading: string | undefined;

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.kind === "blank") continue;
    if (line.kind === "other") {
      const next = nextFilled(lines, index + 1);
      if (!isHeadingText(line.text) || !isItem(next)) break;
      heading = LABEL.test(line.text)
        ? undefined
        : line.text.replace(/:\s*$/, "").trim();
      continue;
    }
    if (!isItem(line)) break;
    if (line.kind === "bullet") {
      if (heading) {
        ingredients.push({ ingredient: `${heading}:`, type: "heading" });
        heading = undefined;
      }
      const ingredient = createIngredient(line.text);
      if (ingredient) ingredients.push(ingredient);
      continue;
    }
    if (heading) {
      group = { name: heading, instructions: [] };
      instructions.push(group);
      heading = undefined;
    }
    if (group) group.instructions.push({ text: line.text });
    else instructions.push({ text: line.text });
  }

  const lineCount = ingredients.filter(
    (line) => line.type !== "heading",
  ).length;
  /* A recipe has both: a list alone is as often gear or links. */
  if (lineCount < 2 || instructions.length === 0) return undefined;
  return { ingredients, instructions };
}

function hasBody(recipe: Partial<ImportedRecipe> | undefined): boolean {
  return (
    (recipe?.ingredients ?? []).some((line) => line.type !== "heading") ||
    (recipe?.instructions?.length ?? 0) > 0
  );
}

/**
 * The import with the description's own lists (45d) when nothing else read
 * a recipe: not a batch, not a followed page, no ingredients and no steps
 * from the mapper or the model. The model's reading, when it has one,
 * always wins; this never runs over it.
 */
export function withDescriptionRecipe(
  applied: ApplyLlmResult,
  description: string | undefined,
  job: JobContext,
): ApplyLlmResult {
  if (!applied.recipe || applied.recipes || applied.followed) return applied;
  if (hasBody(applied.recipe)) return applied;
  const read = descriptionRecipe(description);
  if (!read) return applied;
  const steps = read.instructions.reduce(
    (total, entry) =>
      total + ("instructions" in entry ? entry.instructions.length : 1),
    0,
  );
  const lines = read.ingredients.filter(
    (line) => line.type !== "heading",
  ).length;
  job.log.info(
    "description",
    `the description lists the recipe — ${lines} ingredients and ${steps} steps read without a model`,
    { ingredients: lines, steps },
  );
  /* A body is no longer partial — unless the model was asked for and
   * failed (`force`, or an error): then the reading stays one to check. */
  const keepPartial =
    !!applied.llm && (applied.llm.mode === "force" || !!applied.llm.error);
  const { partial, ...recipe } = applied.recipe;
  return {
    ...applied,
    recipe: {
      ...recipe,
      ...read,
      ...(keepPartial && partial ? { partial } : {}),
    },
  };
}
