/**
 * Which of a recipe's ingredient lines a linked recipe makes, and the line
 * rewritten to link it (50e).
 *
 * A line is the linked recipe's (50-De4):
 *
 * - **by its link** — the page put the link on that line (its name or its
 *   note: the cake's "2 cups (600g) pear puree" carries "poach the pears as
 *   instructed here"), or a card step's or note's link names the line; or
 * - **by name** — the line names what the recipe makes. Deterministic: the
 *   recipe's name less filler ("Easy", "Homemade", "Best", "Recipe"), its
 *   words singular and their -ed / -ing ending dropped (poached, poaching →
 *   poach), crust ≡ dough ≡ pastry. The line must hold the name's last word
 *   (its head: "pear", "crust"), and either another of its words ("pear
 *   poaching liquid" ← Poached Pears; "pie dough" ← All-Butter Pie Crust)
 *   or a word for what a method leaves — purée, liquid, syrup — when the
 *   name opens with a method ("pear purée" ← Poached Pears).
 *
 * Never a line that is one of the linked recipe's own ingredients (Poached
 * Pears uses "pear juice": a cake's pear juice is bought, not poached), a
 * heading, or a line that links somewhere already. No model is asked: the
 * rule is the whole of it, and what it does not reach becomes a "Uses:"
 * note.
 *
 * `linkLine` writes 38d's sub-recipe form (Dd2): the amount, then the
 * line's own words as the link, then any remark — "2 cups (600g) [pear
 * puree](/recipe/poached-pears)", "1 1/2 cups (350ml) [Pear Poaching
 * Liquid](/recipe/poached-pears) (strained)" — so the shopping list expands
 * it. A line with an alternative after the link ("… or All Butter Pie
 * Crust") is still linked, and Dd9 keeps it as written on the list: it is
 * a choice.
 */
import { splitLine } from "../components/Form/Ingredients/ingredientRows";
import { parseIngredientLine, stripMarkup } from "./ingredientNames";
import { createIngredient } from "./parseIngredients";
import { subRecipeLink } from "./shoppingLines";
import { fold } from "./fold";

/** A linked recipe, as the matcher reads it. */
export interface LinkedTarget {
  slug: string;
  name: string;
  /** The line the page linked it from (`LinkedCandidate.line`). */
  line?: number;
  /** Its own ingredient lines (stored text): never what it makes. */
  ingredients?: readonly string[];
}

export type LinkedHow = "link" | "name";

/**
 * A line an import rewrote to link a recipe its page links (50e), as the
 * form marks it until it is kept or undone: what it held, what it holds
 * now, and the recipe it links. Never stored.
 */
export interface LinkedLineMark {
  line: number;
  before: string;
  after: string;
  slug: string;
  name: string;
  how: LinkedHow;
}

export interface LineMatch {
  line: number;
  slug: string;
  how: LinkedHow;
}

/** Words a recipe's name carries that say nothing about what it makes. */
const NAME_FILLER = new Set([
  "a",
  "an",
  "and",
  "the",
  "my",
  "our",
  "of",
  "for",
  "with",
  "recipe",
  "easy",
  "best",
  "basic",
  "perfect",
  "classic",
  "quick",
  "ultimate",
  "favorite",
  "favourite",
  "homemade",
  "simple",
  "all",
  "the",
  "baking",
  "basics",
]);

/** The method words a name may open with ("Poached Pears", "Roasted Garlic"). */
const METHODS = new Set([
  "poach",
  "roast",
  "caramelize",
  "caramelise",
  "candi",
  "candy",
  "pickl",
  "pickle",
  "braise",
  "stew",
  "confit",
  "toast",
  "brown",
]);

/** What a method leaves besides the thing itself. */
const PRODUCTS = new Set(["puree", "liquid", "syrup", "mash", "sauce"]);

const SYNONYMS: Readonly<Record<string, string>> = {
  dough: "crust",
  pastry: "crust",
  shell: "crust",
  purée: "puree",
};

/** One word as names are compared: folded, singular, -ed/-ing off, a synonym's head. */
function stem(raw: string): string {
  let word = fold(raw);
  if (SYNONYMS[word]) return SYNONYMS[word];
  if (word.length > 4 && word.endsWith("ies")) word = `${word.slice(0, -3)}y`;
  else if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    word = word.slice(0, -1);
  }
  if (word.length > 5 && word.endsWith("ing")) word = word.slice(0, -3);
  else if (word.length > 4 && word.endsWith("ed")) word = word.slice(0, -2);
  return SYNONYMS[word] ?? word;
}

/** A recipe's name as the matcher reads it: what it makes, its head last. */
export function nameStems(name: string): string[] {
  return fold(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word && !NAME_FILLER.has(word))
    .map(stem)
    .filter((word) => !NAME_FILLER.has(word));
}

/** The words of a line's name (the first thing it names), as stems. */
function lineStems(markdown: string): string[] {
  const text = stripMarkup(markdown);
  const [requirement] = parseIngredientLine(text);
  const name = requirement?.alternatives[0];
  /* Compounds the name reader joins ("simple syrup") are split again. */
  return (name?.words ?? []).flatMap((word) => word.split(" ")).map(stem);
}

/** A line that links a recipe already. */
function linksSomewhere(markdown: string): boolean {
  return /\]\(\s*(?:https?:\/\/[^/\s)]+)?\/recipe\//.test(markdown);
}

/** Whether `line` names what `target` makes (see the module comment). */
export function namesRecipe(
  line: string,
  target: Pick<LinkedTarget, "name" | "ingredients">,
): boolean {
  const name = nameStems(target.name);
  if (name.length === 0) return false;
  const head = name[name.length - 1];
  const own = lineStems(line);
  if (!own.includes(head)) return false;
  const ownSet = new Set(own);
  const shared = name.filter((word) => ownSet.has(word)).length;
  const viaMethod =
    METHODS.has(name[0]) &&
    name.length > 1 &&
    own.some((word) => PRODUCTS.has(word));
  if (!(name.length === 1 || shared >= 2 || viaMethod)) return false;
  /* One of its own ingredients is bought, not made by it. */
  const key = own.join(" ");
  return !(target.ingredients ?? []).some(
    (ingredient) => lineStems(ingredient).join(" ") === key,
  );
}

/**
 * The lines each target makes: by its link first, then by name, one target
 * per line (the first that claims it). Headings and lines that link a
 * recipe already are never matched. A target may make several lines (the
 * cake's purée and its poaching liquid are one batch of pears).
 */
export function matchLinkedLines(
  ingredients: readonly { ingredient: string; type?: string }[],
  targets: readonly LinkedTarget[],
): LineMatch[] {
  const matches = new Map<number, LineMatch>();
  const open = (index: number) => {
    const entry = ingredients[index];
    return (
      !!entry &&
      entry.type !== "heading" &&
      !matches.has(index) &&
      !linksSomewhere(entry.ingredient)
    );
  };
  for (const target of targets) {
    if (target.line !== undefined && open(target.line)) {
      matches.set(target.line, {
        line: target.line,
        slug: target.slug,
        how: "link",
      });
    }
  }
  for (const target of targets) {
    ingredients.forEach((entry, index) => {
      if (!open(index)) return;
      if (namesRecipe(entry.ingredient, target)) {
        matches.set(index, { line: index, slug: target.slug, how: "name" });
      }
    });
  }
  return [...matches.values()].sort((a, b) => a.line - b.line);
}

/** Markdown's own characters, escaped in a link's text. */
function escapeLinkText(text: string): string {
  return text.replace(/([[\]\\])/g, "\\$1");
}

/** Where a line's name ends and its remark starts: the first "," or "(" after a word. */
function splitRemark(rest: string): { name: string; remark: string } {
  const match = /^(.*?\S)\s*([,(].*)$/.exec(rest);
  if (!match) return { name: rest.trim(), remark: "" };
  return { name: match[1].trim(), remark: match[2] };
}

export interface LinkedLine {
  /** The line as stored, rewritten (numbers marked again). */
  ingredient: string;
  /** The shopping list opens it into the recipe's lines (38d). */
  expands: boolean;
}

/**
 * `markdown` (a stored line) with its own words linked to `slug`, in 38d's
 * sub-recipe form — or `null` when the line has no words to link.
 */
export function linkLine(markdown: string, slug: string): LinkedLine | null {
  const plain = stripMarkup(markdown).replace(/\\\*/g, "*").trim();
  if (!plain) return null;
  const { rest } = splitLine(plain);
  const prefix = plain.endsWith(rest)
    ? plain.slice(0, plain.length - rest.length).trim()
    : "";
  const { name, remark } = splitRemark(prefix ? rest : plain);
  if (!name) return null;
  const link = `[${escapeLinkText(name)}](/recipe/${encodeURIComponent(slug)})`;
  const text = [prefix, `${link}${remark ? ` ${remark}` : ""}`]
    .filter(Boolean)
    .join(" ");
  const created = createIngredient(text);
  if (!created) return null;
  return {
    ingredient: created.ingredient,
    expands: subRecipeLink(created.ingredient)?.slug === slug,
  };
}
