/**
 * A recipe's ingredient lines as shopping-list lines (epic 35, D7; 38d).
 *
 * `recipeLines` is what the shopping seat puts on the list for one recipe:
 * markup flattened, headings skipped, a line marked optional when the recipe
 * makes it so. `expandRecipeLines` (38d, 38-D4) also opens a line that *is*
 * another recipe — "1 batch [Simple Syrup](/recipe/simple-syrup)" — into
 * that recipe's own lines, scaled by how many batches the line asks for, each
 * remembering the sub-recipes it came through (`for`). Done when a recipe or
 * a plan is added, not on every render, because the list's view runs in the
 * browser over the stored items alone and cannot read recipes.
 *
 * Pure apart from the injected `readRecipe`.
 */
import Fraction from "fraction.js";
import { flattenMarkdown } from "../controller/buildIndexValue";
import type { Recipe } from "../controller/types";
import { detectHeading } from "./detectHeading";
import {
  formatAmount,
  parseAmount,
  scaleAmount,
  type Amount,
} from "./ingredientAmount";
import {
  nameKey,
  parseIngredientLine,
  parseIngredientList,
  stripMarkup,
} from "./ingredientNames";
import type { ShoppingSubRecipe } from "./shoppingTypes";

/**
 * How many sub-recipes deep a line expands: a pie's crust's lard is two.
 * Past it the line stays as written, with a warning.
 */
export const MAX_SUBRECIPE_DEPTH = 3;

type Ingredients = Pick<Recipe, "ingredients">;

/** One ingredient line on its way to the list. */
export interface RecipeLine {
  /** Markup flattened, as the index flattens it. */
  text: string;
  /** The line's index in its recipe's ingredient list. */
  line: number;
  optional: boolean;
  /** The line as stored, links and all. */
  markdown: string;
}

/**
 * A recipe's ingredient lines: markup flattened, headings — stored or
 * detected — skipped, a line marked optional when the recipe makes it so (a
 * garnish section, "to taste").
 */
export function recipeLines(recipe: Ingredients): RecipeLine[] {
  const ingredients = recipe.ingredients ?? [];
  const texts = ingredients.map(({ ingredient }) =>
    flattenMarkdown(ingredient),
  );
  const headings = new Set(
    ingredients.flatMap(({ type }, line) => (type === "heading" ? [line] : [])),
  );
  const optional = new Map<number, boolean>();
  for (const requirement of parseIngredientList(texts, [...headings])) {
    optional.set(
      requirement.line,
      (optional.get(requirement.line) ?? true) && requirement.optional,
    );
  }
  return texts.flatMap((text, line) =>
    !text.trim() || headings.has(line) || detectHeading(text)
      ? []
      : [
          {
            text: text.trim(),
            line,
            optional: optional.get(line) === true,
            markdown: ingredients[line].ingredient,
          },
        ],
  );
}

/** What a linking line asks of its sub-recipe. */
export interface SubRecipeLink {
  slug: string;
  /** Batches per batch of the recipe that links it. */
  factor: Fraction;
  /**
   * The line's amount when it is not a number of batches — `½ oz` of syrup
   * — so one batch is listed and the note says what was called for.
   */
  called?: Amount;
  /** The amount as written, when it could not be read at all. */
  calledText?: string;
}

/** The first `[text](/recipe/<slug>)` link, relative or on any host. */
const RECIPE_LINK_RE =
  /\[([^\]]*)\]\(\s*(?:https?:\/\/[^/\s)]+)?\/recipe\/([^/\s)#?]+)[^)]*\)/;

function firstNameKey(text: string): string | undefined {
  const name = parseIngredientLine(text)[0]?.alternatives[0];
  return name && name.words.length > 0 ? nameKey(name) : undefined;
}

/**
 * A word no line uses: what stands in for the link when asking whether the
 * text before it is an amount and nothing else.
 */
const PLACEHOLDER = "zzsubrecipe";

/** `½ oz`, `2 heaping teaspoons`, `1 batch`: an amount, naming nothing. */
function onlyAmount(prefix: string): boolean {
  return !prefix || firstNameKey(`${prefix} ${PLACEHOLDER}`) === PLACEHOLDER;
}

/**
 * The sub-recipe a line *is*, or `null`. Only when the link is the line's
 * own name, with nothing but an amount before it:
 *
 * - `1 batch [Simple Syrup](…)`, `2 batches [pie crust](…)` (× the number),
 *   `[Pickled slaw](…)` (×1), `2 [pie crusts](…)` (a bare count: ×2);
 * - `½ oz [simple syrup](…)` — a measure, not batches: ×1, and `called`
 *   says what the line asked for.
 *
 * A link that is an alternative or a remark is no sub-recipe: "1 tsp maple
 * syrup or [simple syrup](…)" buys maple syrup, and "3 Tbsp tonkatsu sauce
 * (or make [Homemade Tonkatsu Sauce](…))" buys the sauce.
 */
export function subRecipeLink(markdown: string): SubRecipeLink | null {
  const match = RECIPE_LINK_RE.exec(markdown);
  if (!match) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[2]);
  } catch {
    slug = match[2];
  }
  const prefix = stripMarkup(markdown.slice(0, match.index))
    .replace(/\s+/g, " ")
    .trim();
  const linkText = stripMarkup(match[1]).replace(/\s+/g, " ").trim();
  if (!firstNameKey(linkText) || !onlyAmount(prefix)) return null;
  if (!prefix) return { slug, factor: new Fraction(1) };
  const amount = parseAmount(`${prefix} ${linkText}`);
  if (!amount) return { slug, factor: new Fraction(1), calledText: prefix };
  if (amount.parts.length === 1) {
    const [part] = amount.parts;
    if (
      part.family === "count" ||
      (part.family === "container" &&
        (part.unit === "batch" || part.unit === "recipe"))
    ) {
      /* `1/0` reads as no number at all: one batch, the line as the note. */
      return Number.isFinite(part.qty) && part.qty > 0
        ? { slug, factor: new Fraction(part.qty) }
        : { slug, factor: new Fraction(1), calledText: prefix };
    }
  }
  /* A pinch, a dash, "some": one batch, nothing to say. */
  if (amount.parts.length === 0) return { slug, factor: new Fraction(1) };
  return { slug, factor: new Fraction(1), called: amount };
}

/** A line as it goes on the list: its sub-recipe path and its multiplier. */
export interface ExpandedLine extends RecipeLine {
  /** × the scale the recipe is added at: batches of the sub-recipe. */
  factor: Fraction;
  /** The sub-recipes it came through, outermost first; empty for the recipe's own. */
  for: ShoppingSubRecipe[];
}

export interface ExpandOptions {
  readRecipe(slug: string): Promise<(Ingredients & { name: string }) | null>;
  /** Off: the lines as written, links and all (the `subRecipes` switch). */
  expand?: boolean;
  /** The scale the recipe is added at, for the `called` notes. */
  scale?: Fraction;
  maxDepth?: number;
  /** Reads shared across one add (a plan names a sub-recipe many times). */
  cache?: Map<string, Promise<(Ingredients & { name: string }) | null>>;
}

export interface ExpandResult {
  lines: ExpandedLine[];
  /** A line kept as written, and why: a missing recipe, a cycle, too deep. */
  warnings: string[];
}

/**
 * `recipe`'s lines with every sub-recipe line opened into the sub-recipe's
 * own, recursively, under an ancestor-path guard (a cycle A → B → A keeps
 * B's line to A as written) and `maxDepth`. A sub-recipe that does not
 * exist, or has no lines, keeps the linking line as written. Each case is a
 * warning; none is an error.
 */
export async function expandRecipeLines(
  slug: string,
  recipe: Ingredients,
  {
    readRecipe,
    expand = true,
    scale = new Fraction(1),
    maxDepth = MAX_SUBRECIPE_DEPTH,
    cache = new Map(),
  }: ExpandOptions,
): Promise<ExpandResult> {
  const warnings: string[] = [];
  const warn = (text: string) => {
    if (!warnings.includes(text)) warnings.push(text);
  };
  const read = (sub: string) => {
    let found = cache.get(sub);
    if (!found) {
      found = readRecipe(sub);
      cache.set(sub, found);
    }
    return found;
  };

  const walk = async (
    current: Ingredients,
    ancestors: string[],
    factor: Fraction,
    path: ShoppingSubRecipe[],
    optionalAbove: boolean,
  ): Promise<ExpandedLine[]> => {
    const out: ExpandedLine[] = [];
    for (const line of recipeLines(current)) {
      const kept: ExpandedLine = {
        ...line,
        optional: line.optional || optionalAbove,
        factor,
        for: path,
      };
      const link = expand ? subRecipeLink(line.markdown) : null;
      if (!link) {
        out.push(kept);
        continue;
      }
      const as = `Kept "${line.text}" as written`;
      if (ancestors.includes(link.slug)) {
        warn(
          `${as}: a sub-recipe cycle (${[...ancestors, link.slug].join(" → ")}).`,
        );
        out.push(kept);
        continue;
      }
      if (path.length >= maxDepth) {
        warn(`${as}: sub-recipes nest more than ${maxDepth} deep.`);
        out.push(kept);
        continue;
      }
      const sub = await read(link.slug);
      if (!sub) {
        warn(`${as}: there is no recipe "${link.slug}".`);
        out.push(kept);
        continue;
      }
      const called = link.called
        ? formatAmount(scaleAmount(link.called, scale.mul(factor)))
        : link.calledText;
      const lines = await walk(
        sub,
        [...ancestors, link.slug],
        factor.mul(link.factor),
        [
          ...path,
          { slug: link.slug, name: sub.name, ...(called ? { called } : {}) },
        ],
        kept.optional,
      );
      if (lines.length === 0) {
        warn(`${as}: ${sub.name} has no ingredient lines.`);
        out.push(kept);
        continue;
      }
      out.push(...lines);
    }
    return out;
  };

  const lines = await walk(recipe, [slug], new Fraction(1), [], false);
  return { lines, warnings };
}
