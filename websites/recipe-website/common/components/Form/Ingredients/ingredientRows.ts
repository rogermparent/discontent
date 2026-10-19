/**
 * Ingredient rows (43e2, canvas B): a stored line shown as plain text with
 * its amount in a column, and a typed line marked up again for scaling.
 * Pure, so the rows and their unit tests read the same rules.
 *
 * **The data model does not move (D4).** A line stays the string the recipe
 * stores, `<Multiplyable baseNumber="2" />` markup and all. The form shows
 * it without the markup; a row nobody edits posts its stored string back
 * byte for byte, and only a row whose text changed is marked up again —
 * `createIngredient`, the paste path's own marker, the same one the
 * importer's lines went through.
 */
import {
  QUANTITY_RE,
  UNIT_ALT_RE,
  UNIT_OR_RE,
  UNIT_RE,
} from "../../../util/ingredientGrammar";
import { createIngredient } from "../../../util/parseIngredients";
import type { Ingredient } from "../../../controller/types";

const MULTIPLYABLE_RE = /<Multiplyable\s+baseNumber="([^"]*)"\s*\/>/g;

/** A stored line as a person reads and types it: the number markup undone. */
export function plainLine(stored: string): string {
  return (stored ?? "").replace(MULTIPLYABLE_RE, "$1");
}

/**
 * The line to store for what was typed in a row: the stored string itself
 * when the text reads the same as it (nothing to re-mark — a hand-placed
 * mark survives), else the typed text marked up by `createIngredient`
 * (markup typed by hand is read as its numbers first, so it is never marked
 * twice). Blank stays blank: the schema reports an empty line.
 */
export function remarkLine(stored: string, typed: string): string {
  if (plainLine(stored) === typed) return stored;
  const plain = plainLine(typed);
  return createIngredient(plain)?.ingredient ?? "";
}

/** A line split for the row: the amount column, and the rest. */
export interface SplitLine {
  /** "2 cups · 250 g", "1", "" — as written, the second measure after a dot. */
  amount: string;
  /** What is left, markdown and all: "all-purpose flour (spooned & leveled)". */
  rest: string;
}

/** `(250g)`, `(14 oz)`: a bracket with a number in it, right after the amount. */
const MEASURE_BRACKET_RE = /^\(([^()]*\d[^()]*)\)\s*/;

/**
 * The amount at the start of a plain line — a quantity (a range, a word
 * number), the unit, a second unit (`/1.5kg`, ` or can`) and a bracketed
 * other measure — as the shopping list's grammar (`ingredientGrammar`)
 * reads it. A line that starts with no quantity has no amount column:
 * "Kosher salt", "Juice of 2 limes" read whole.
 */
export function splitLine(plain: string): SplitLine {
  const text = plain.trim();
  const quantity = QUANTITY_RE.exec(text);
  if (!quantity || !quantity[0].trim() || !/\d/.test(quantity[0])) {
    return { amount: "", rest: text };
  }
  /* "1 large egg": the grammar reads a size into the quantity; on the row
   * it belongs to the thing ("large egg"). */
  const size = /\s+(large|small|big|medium)\s*$/i.exec(quantity[0]);
  const taken = size ? quantity[0].slice(0, size.index) : quantity[0];
  let amount = taken.trim();
  let rest = text.slice(taken.length);
  const measures: string[] = [];
  const takeBracket = () => {
    const bracket = MEASURE_BRACKET_RE.exec(rest);
    if (!bracket) return;
    measures.push(bracket[1].trim());
    rest = rest.slice(bracket[0].length);
  };
  takeBracket();
  const unit = UNIT_RE.exec(rest);
  /* "4 cloves": a unit with nothing after it is the name itself. */
  if (unit && rest.slice(unit[0].length).trim()) {
    amount = `${amount} ${unit[0].trim()}`;
    rest = rest.slice(unit[0].length);
    const or = UNIT_OR_RE.exec(rest);
    if (or) {
      amount = `${amount} ${or[0].trim()}`;
      rest = rest.slice(or[0].length);
    }
    const alt = UNIT_ALT_RE.exec(rest);
    if (alt) {
      measures.push(alt[0].replace(/^\/\s*/, "").trim());
      rest = rest.slice(alt[0].length);
    }
    takeBracket();
  }
  return {
    amount: [amount, ...measures].join(" · "),
    rest: rest.trim(),
  };
}

/** A run of the rest: the line itself, or an aside shown muted. */
export interface LineSegment {
  text: string;
  aside: boolean;
}

/**
 * The rest of a line in runs, its asides apart: each top-level parenthesis
 * ("(12 Tbsp)") and a dash-led tail ("— for rolling"). A markdown link's
 * target `](…)` is never an aside.
 */
export function lineSegments(rest: string): LineSegment[] {
  const out: LineSegment[] = [];
  const push = (text: string, aside: boolean) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.aside === aside) last.text += text;
    else out.push({ text, aside });
  };
  let dashTail = "";
  let body = rest;
  const dash = /\s[—–]\s/.exec(rest);
  if (dash) {
    body = rest.slice(0, dash.index);
    dashTail = rest.slice(dash.index);
  }
  let depth = 0;
  let current = "";
  for (let i = 0; i < body.length; i++) {
    const character = body[i];
    if (character === "(" && body[i - 1] === "]" && depth === 0) {
      /* A link target: copy it through to its close. */
      const close = body.indexOf(")", i);
      const end = close < 0 ? body.length : close + 1;
      current += body.slice(i, end);
      i = end - 1;
      continue;
    }
    if (character === "(") {
      if (depth === 0) {
        push(current, false);
        current = "";
      }
      depth += 1;
      current += character;
      continue;
    }
    if (character === ")" && depth > 0) {
      depth -= 1;
      current += character;
      if (depth === 0) {
        push(current, true);
        current = "";
      }
      continue;
    }
    current += character;
  }
  push(current, depth > 0);
  push(dashTail, true);
  return out;
}

/** What a row says needs a look. */
export type IngredientFlag = "note-mark";

/**
 * Checks on one plain line. Only one so far: a `*` that is not markdown
 * emphasis — "coarse sugar*" — points at a note the page had, which an
 * import does not bring in (canvas B's flag).
 */
export function ingredientFlags(plain: string): IngredientFlag[] {
  const unpaired = plain
    .replace(/\*\*[^*\n]+\*\*/g, "")
    .replace(/(^|[^*\w])\*(?!\s)[^*\n]+?(?<!\s)\*(?!\w)/g, "$1");
  return unpaired.includes("*") ? ["note-mark"] : [];
}

/** One run of inline markdown, as the row renders it. */
export type InlineRun =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  | { type: "link"; text: string; href: string };

/**
 * The inline markdown an ingredient line uses — links (to a linked recipe,
 * 25c), bold and italics — as runs. Anything else reads as text, as typed.
 */
export function inlineRuns(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const pattern =
    /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|(?<![\w*])\*(?!\s)([^*]+?)(?<!\s)\*(?![\w*])|(?<!\w)_(?!\s)([^_]+?)(?<!\s)_(?!\w)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last)
      runs.push({ type: "text", text: text.slice(last, start) });
    if (match[1] !== undefined) {
      runs.push({ type: "link", text: match[1], href: match[2] });
    } else if (match[3] !== undefined) {
      runs.push({ type: "strong", text: match[3] });
    } else {
      runs.push({ type: "em", text: match[4] ?? match[5] });
    }
    last = start + match[0].length;
  }
  if (last < text.length) runs.push({ type: "text", text: text.slice(last) });
  return runs;
}

/**
 * The text view's lines back into the list, keeping what did not change:
 * a line whose text reads the same as one already in the list keeps that
 * line — its markup and whether it is a heading — and a new one is marked
 * up as a paste is (`createIngredient`, heading detection included).
 */
export function linesFromText(
  text: string,
  previous: readonly Ingredient[],
): Ingredient[] {
  const unused = previous.map((line) => ({ line, used: false }));
  return text
    .split(/\n+/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const match = unused.find(
        (entry) => !entry.used && plainLine(entry.line.ingredient) === raw,
      );
      if (match) {
        match.used = true;
        return match.line;
      }
      return createIngredient(plainLine(raw)) ?? { ingredient: raw };
    })
    .filter((line) => line.ingredient);
}

/** The ingredient list as one text — "Edit as text" — headings as lines. */
export function linesAsText(
  lines: readonly { ingredient: string; type?: "heading" }[],
): string {
  return lines.map((line) => plainLine(line.ingredient)).join("\n");
}
