import { Recipe, RecipeEntryValue } from "./types";
import { compiler } from "markdown-to-jsx/react";

import type { JSX } from "react";

/**
 * Tags whose content is its own run of text, so what follows must not fuse onto
 * what came before. Everything else is inline and concatenates directly —
 * "This is **important**." has to come out with the full stop against the word.
 *
 * Only structural tags are listed. `markdown-to-jsx` compiles standard elements
 * to their lowercase tag name, so an unknown entry is inert rather than wrong.
 */
const BLOCK_TAGS = new Set([
  "address",
  "article",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);

interface CompiledElement {
  type: unknown;
  props: { children?: unknown; baseNumber?: unknown };
}

function isElement(node: unknown): node is CompiledElement {
  return typeof node === "object" && node !== null && "props" in node;
}

/**
 * The text a compiled node carries, children included.
 *
 * The recursion is the whole point (F23). The previous version concatenated a
 * node only when it was a string or when `props.children` was a *string*, so
 * anything with array children — a description of more than one paragraph, or
 * one containing a link, or a list — contributed nothing and flattened to `""`.
 * That silently emptied the `description` seat of the search index for 424 of
 * 436 real recipes, and `HowToStep.text` in the JSON-LD for their instructions.
 *
 * `Multiplyable` keeps its own branch, and it must stay a check on the literal
 * string type. `parseIngredients` wraps every number in a pasted ingredient as
 * `<Multiplyable baseNumber="2" />` and this function passes no `overrides`, so
 * the node arrives un-substituted and **self-closing** — recursing into
 * children would find none and drop every quantity on the floor.
 */
function flattenNode(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string") {
    return node;
  }
  if (typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(flattenNode).join("");
  }
  if (isElement(node)) {
    if (node.type === "Multiplyable") {
      return String(node.props.baseNumber);
    }
    const inner = flattenNode(node.props.children);
    /*
     * Padded on both sides, not just after. A block can also *follow* inline
     * content within one parent: `- <Multiplyable baseNumber="1/2" /> cup
     * sugar` compiles to the component plus a sibling `<p>`, with the space
     * between them consumed by the parser, so a trailing-only separator yields
     * "1/2cup sugar". The runs collapse at the end either way.
     */
    return typeof node.type === "string" && BLOCK_TAGS.has(node.type)
      ? ` ${inner} `
      : inner;
  }
  return "";
}

/**
 * Markdown prose as one line of plain text, for indexing and for structured
 * data — neither of which can render markup.
 */
export function flattenMarkdown(input: string): string {
  const compiled = compiler(input, {
    wrapper: null,
  }) as unknown as JSX.Element[];

  /*
   * Block boundaries contribute a space each, and so does the markdown's own
   * indentation, so the runs are collapsed once at the end rather than guarded
   * against at every join.
   */
  return flattenNode(compiled).replace(/\s+/g, " ").trim();
}

/**
 * Cap on the indexed description. The description is searchable prose, not a
 * display field — a few sentences carry the distinguishing terms, and this
 * field is on the unconditional page-load path: `/search/all` ships it to every
 * client (it is what the ⌘K palette renders as a subtitle), so an uncapped body
 * would bloat every page load for no matching benefit.
 *
 * `ingredients` below is *not* on that path since F4a — it is served separately
 * by `/search/ingredients`, fetched only when the index needs populating or a
 * filter asks for it — which is why it has no cap and needs none.
 *
 * **300 until F23 measured what it was costing (§12.11).** F23 made the field
 * real, which took `search/all` from 64.6 KiB to 145.6 KiB; 160 takes it back
 * to 118.9 KiB, recovering a third of that.
 *
 * 160 rather than something smaller because of what the two numbers do in
 * opposite directions. **Display cannot use more than about 80 characters**:
 * the search card clamps the description to two lines (`line-clamp-2`) and the
 * palette row to one, and both render it from the *start* rather than as a
 * window around the match, so past those lines the field is invisible. But
 * **search recall wants all of it** — `description` is a FlexSearch field, so a
 * term past the cap is not merely unshown, it is unfindable. On the real
 * 436-recipe corpus the flattened median is 221 characters, so 160 keeps most
 * of a median description, stays at double what any surface renders, and cuts
 * 18.4% of the document. Going to 80 would only save another 23 KiB while
 * making 24,000 more characters unsearchable.
 *
 * The measurement is `editor/scripts/measure-description-cap.ts`; re-run it
 * before moving this number, because both halves of the trade are corpus-shaped
 * and the corpus grows.
 */
const MAX_INDEXED_DESCRIPTION_LENGTH = 160;

/**
 * The first `MAX_INDEXED_DESCRIPTION_LENGTH` characters, ending on a word.
 *
 * A bare `slice` cuts mid-word — at 160 the corpus's own sample ends "under t" —
 * and this value is a FlexSearch field, so that tail is not just untidy: it
 * indexes a fragment as if it were a term, and leaves the real word findable
 * only by its prefix. Trimming back to the last space costs a few characters
 * and removes both.
 *
 * The guard is for prose that has no space to fall back to, where trimming
 * would throw away most of the budget; there a hard cut is the better of two
 * bad options.
 */
function capDescription(text: string): string {
  if (text.length <= MAX_INDEXED_DESCRIPTION_LENGTH) return text;
  const cut = text.slice(0, MAX_INDEXED_DESCRIPTION_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return (
    lastSpace > MAX_INDEXED_DESCRIPTION_LENGTH * 0.6
      ? cut.slice(0, lastSpace)
      : cut
  ).trimEnd();
}

export default function buildRecipeIndexValue(
  recipe: Recipe,
): RecipeEntryValue {
  const {
    name,
    description,
    image,
    ingredients,
    tags,
    prepTime,
    cookTime,
    totalTime,
  } = recipe;
  const flatDescription = description
    ? capDescription(flattenMarkdown(description))
    : undefined;
  return {
    name,
    description: flatDescription || undefined,
    image,
    ingredients: ingredients?.map(({ ingredient }) =>
      flattenMarkdown(ingredient),
    ),
    tags: tags && tags.length > 0 ? tags : undefined,
    prepTime: prepTime || undefined,
    cookTime: cookTime || undefined,
    totalTime: totalTime || undefined,
  };
}
