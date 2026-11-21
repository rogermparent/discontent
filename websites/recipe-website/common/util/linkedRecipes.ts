/**
 * The other recipes a recipe page links to (50e): "poach the pears as
 * instructed here" on the cake's purée line, Sally's "Flaky Pie Crust" on a
 * pie's crust line, "see my recipe for …" under the card.
 *
 * Pure and fixture-tested (`test/linkedRecipes.test.ts`): the hast parser
 * the roundup reader uses (`roundupPage.ts`, 34) and its link rules — the
 * canonical URL (`canonicalItemUrl`), "the same page" (`sourceUrlKey`), the
 * site (`siteKey`), and what is never a recipe (`isNonRecipeLink`: the page
 * itself, share targets, shops, archives, files, private hosts). Fetches
 * nothing: the editor fetches each candidate (`controller/curation/
 * linkedImport.ts`), and a link counts only when its page parses as a
 * recipe.
 *
 * Where a link counts (50-De1):
 *
 * 1. **The recipe card's ingredient lines** — a link anywhere in an
 *    ingredient's item (its name or its note) belongs to that line. Same
 *    site: always. Another site: only when the link's words or its line say
 *    "recipe". A second link on the same line is an alternative ("Flaky Pie
 *    Crust (what I used) or All Butter Pie Crust"): the first is followed.
 * 2. **The card's steps and notes** — same rule, no line of its own.
 * 3. **The article body** (outside the card, comments, share bars, related
 *    posts, menus, sidebars) — only with a cue: the link's words or its
 *    paragraph say "recipe", "instructions", "how to make", "see my …".
 *    "I combined Swedish Cream with a poached pear puree" is prose, not a
 *    use.
 *
 * A link whose words name one of the recipe's own ingredient headings
 * ("Swedish Cream" over the "Sour cream panna cotta (Swedish cream)"
 * section) is that section written out here, and is not followed.
 * Ingredient lines first (in order), then steps, notes and the body; same
 * site before another; at most `max` (5).
 */
import { fromHtml } from "hast-util-from-html";
import type { Element, Root, RootContent } from "hast";
import {
  articleRoot,
  attr,
  classes,
  textOf,
  walk,
  type Parent,
} from "./hastQuery";
import {
  canonicalItemUrl,
  isNonRecipeLink,
  siteKey,
  sourceUrlKey,
} from "./roundupPage";
import { fold } from "./fold";

/** At most this many linked recipes per import (50e brief: cap it). */
export const MAX_LINKED_RECIPES = 5;

/** Where on the page a link was found. */
export type LinkedWhere = "ingredient" | "step" | "note" | "body";

export interface LinkedCandidate {
  /** Canonical: no query, no fragment. */
  url: string;
  /** The link's own words. */
  text: string;
  where: LinkedWhere;
  /** The ingredient line it sits on (an index into `lines`), for `ingredient`. */
  line?: number;
  /** On the page's own site (`siteKey`). */
  sameSite: boolean;
}

/** A link that looked like one and was left alone, and why. */
export interface LinkedSkip {
  url: string;
  text: string;
  reason: string;
}

export interface LinkedFind {
  candidates: LinkedCandidate[];
  skipped: LinkedSkip[];
}

/** The recipe card plugins' outer element, by class or schema.org type. */
const CARD_CLASS =
  /(^|\s)(wprm-recipe-container|tasty-recipes|mv-create-card|mv-recipe-card|wpzoom-recipe-card|recipe-card|easyrecipe|cooked-recipe|zlrecipe-container)(\s|$)/i;

/** A card's ingredient list (WPRM, Tasty, Mediavine, most themes). */
const INGREDIENT_CLASS = /ingredient/i;
const STEP_CLASS = /instruction|direction|method|steps?\b/i;
const NOTE_CLASS = /(^|[\s_-])notes?(\s|$|[_-])/i;

/** Regions whose links are never a recipe this one uses. */
const EXCLUDED_REGION =
  /\b(comments?|comment-list|respond|share|sharing|social|related|breadcrumbs?|navigation|nav|menu|sidebar|widget|pagination|pager|byline|jump|subscribe|newsletter|disclosure|post-meta|author-box|footer|header)\b/i;

const EXCLUDED_TAGS = new Set([
  "nav",
  "aside",
  "form",
  "button",
  "script",
  "style",
  "noscript",
  "template",
  "header",
  "footer",
]);

/** The block a link's surroundings are read from. */
const BLOCK_TAGS = new Set([
  "p",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "figcaption",
  "blockquote",
  "td",
  "dd",
]);

const SAYS_RECIPE = /\brecipes?\b/i;

/** A body link counts only with one of these in its words or its paragraph. */
const BODY_CUE =
  /\brecipes?\b|\binstruct(?:ions?|ed)\b|\bhow to make\b|\bsee (?:my|the|this|our|here)\b|\b(?:made|make it) (?:with|from) (?:my|this|our)\b/i;

function clean(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isCard(element: Element): boolean {
  if (CARD_CLASS.test(attr(element, "className") ?? "")) return true;
  if (/^tasty-recipes-\d+$/.test(attr(element, "id") ?? "")) return true;
  return /schema\.org\/Recipe\b/i.test(attr(element, "itemType") ?? "");
}

/**
 * Words, folded and singular, as lines and items are compared: "600g" is
 * "600" and "g" (a page writes it one way, a person the other), markup and
 * a link's target undone.
 */
function words(text: string): string[] {
  return fold(text)
    .replace(/<Multiplyable\s+baseNumber="([^"]*)"\s*\/>/gi, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\d)(\p{L})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(singularWord);
}

/**
 * The ingredient line an item of the card is (`null` for none): the line
 * most of whose words are in the item — a WPRM item adds its note to the
 * line ("2 cups (600g) pear puree poach the pears as instructed here…"),
 * and a model's or a person's reading may differ a little — at least 60%,
 * ties broken by the item's place among the card's items.
 */
function lineForItem(
  itemText: string,
  place: number,
  lines: readonly (string | null)[],
): number | null {
  const item = new Set(words(itemText));
  let best: { index: number; score: number; distance: number } | null = null;
  let ordinal = -1;
  lines.forEach((line, index) => {
    if (line === null) return;
    ordinal += 1;
    const own = words(line);
    if (own.length === 0) return;
    const score = own.filter((word) => item.has(word)).length / own.length;
    const distance = Math.abs(ordinal - place);
    if (
      score >= 0.6 &&
      (!best ||
        score > best.score + 1e-9 ||
        (Math.abs(score - best.score) < 1e-9 && distance < best.distance))
    ) {
      best = { index, score, distance };
    }
  });
  return best ? (best as { index: number }).index : null;
}

interface Found {
  url: string;
  text: string;
  where: LinkedWhere;
  /** The ingredient item it sits in, by place among the card's items. */
  item?: { element: Element; place: number };
  /** Its item's (or paragraph's) text before the link, and after it. */
  before: string;
  after: string;
  order: number;
}

/** The text of `block` before `anchor` and after it (the link's own text left out). */
function textAround(
  block: Element | undefined,
  anchor: Element,
): { before: string; after: string } {
  if (!block) return { before: "", after: "" };
  let before = "";
  let after = "";
  let past = false;
  const visit = (node: Root | RootContent) => {
    if (node === anchor) {
      past = true;
      return;
    }
    if (node.type === "text") {
      if (past) after += node.value;
      else before += node.value;
      return;
    }
    if ("children" in node) node.children.forEach(visit);
  };
  visit(block);
  return { before: clean(before), after: clean(after) };
}

/** The sentence the link sits in: "… my poached pear recipe." */
function sentenceOf({ before, text, after }: Found): string {
  const head = before.split(/[.!?:;]\s+/).pop() ?? "";
  const tail = after.split(/[.!?:;](?:\s|$)/)[0] ?? "";
  return clean(`${head} ${text} ${tail}`);
}

/** "… or [creme fraiche]", "or use [my crust]": the link is the line's other way. */
const ALTERNATIVE_BEFORE =
  /\b(?:or|instead of|in place of|substitute|alternatively)(?:\s+(?:use|try|with|a|an|the|my|our|some|homemade|store-bought))*[\s,:(]*$/i;

/**
 * The links of `html` (the page at `pageUrl`) that may be recipes this one
 * uses (see the module comment). `lines` are the recipe's ingredient lines
 * as imported — `null` for a heading — so a card item's link names its
 * line; `headings` are its section headings (`linkedLineTexts` makes both).
 */
export function findLinkedRecipes(
  html: string,
  pageUrl: string,
  {
    lines = [],
    headings = [],
    allowPrivateLinks = false,
    max = MAX_LINKED_RECIPES,
  }: {
    lines?: readonly (string | null)[];
    headings?: readonly string[];
    allowPrivateLinks?: boolean;
    max?: number;
  } = {},
): LinkedFind {
  const tree: Root = fromHtml(html);
  let canonical: string | undefined;
  walk(tree, (element) => {
    if (canonical || element.tagName !== "link") return;
    const rel = (attr(element, "rel") ?? "").toLowerCase().split(/\s+/);
    if (rel.includes("canonical")) {
      canonical = canonicalItemUrl(attr(element, "href"), pageUrl);
    }
  });
  const pageSite = siteKey(pageUrl);

  const parents = new Map<Element, Parent>();
  walk(tree, (element, parent) => {
    parents.set(element, parent);
  });
  const ancestors = (element: Element): Element[] => {
    const out: Element[] = [];
    let node = parents.get(element);
    while (node && node.type === "element") {
      out.push(node);
      node = parents.get(node);
    }
    return out;
  };

  const found: Found[] = [];
  let order = 0;
  const cards: Element[] = [];
  walk(tree, (element) => {
    if (isCard(element)) {
      cards.push(element);
      return "skip";
    }
  });

  /* 1–2. The card's ingredient items, steps and notes. */
  for (const card of cards) {
    const items: Element[] = [];
    walk(card, (element) => {
      if (element.tagName !== "li") return;
      const inIngredients =
        INGREDIENT_CLASS.test(classes(element)) ||
        attr(element, "itemProp") === "recipeIngredient" ||
        ancestors(element).some(
          (up) =>
            up !== card &&
            (INGREDIENT_CLASS.test(classes(up)) ||
              attr(up, "itemProp") === "recipeIngredient"),
        );
      if (!inIngredients) return;
      if (/group|list|container/i.test(classes(element))) return;
      items.push(element);
      return "skip";
    });
    walk(card, (element) => {
      if (element.tagName !== "a") return;
      const href = canonicalItemUrl(attr(element, "href"), pageUrl);
      if (!href) return "skip";
      const up = ancestors(element);
      const itemIndex = items.findIndex((item) => up.includes(item));
      const text = clean(textOf(element));
      if (itemIndex >= 0) {
        found.push({
          url: href,
          text,
          where: "ingredient",
          item: { element: items[itemIndex], place: itemIndex },
          ...textAround(items[itemIndex], element),
          order: order++,
        });
        return "skip";
      }
      const inside = up.slice(0, up.indexOf(card));
      const has = (pattern: RegExp) =>
        inside.some((node) => pattern.test(classes(node)));
      const where: LinkedWhere | undefined =
        has(INGREDIENT_CLASS) ||
        inside.some((node) => attr(node, "itemProp") === "recipeIngredient")
          ? "ingredient"
          : has(NOTE_CLASS)
            ? "note"
            : has(STEP_CLASS) ||
                inside.some(
                  (node) => attr(node, "itemProp") === "recipeInstructions",
                )
              ? "step"
              : undefined;
      /* Equipment, nutrition, the author, the print button: never. */
      if (!where) return "skip";
      const block = up.find((node) => BLOCK_TAGS.has(node.tagName));
      found.push({
        url: href,
        text,
        where,
        ...textAround(block, element),
        order: order++,
      });
      return "skip";
    });
  }

  /* 3. The article body, outside the card. */
  const body = articleRoot(tree);
  walk(body, (element) => {
    if (cards.includes(element)) return "skip";
    if (EXCLUDED_TAGS.has(element.tagName)) return "skip";
    if (EXCLUDED_REGION.test(classes(element))) return "skip";
    if (element.tagName !== "a") return;
    const href = canonicalItemUrl(attr(element, "href"), pageUrl);
    if (!href) return "skip";
    if (/\bsponsored\b/i.test(attr(element, "rel") ?? "")) return "skip";
    const text = clean(textOf(element));
    const block = ancestors(element).find((node) =>
      BLOCK_TAGS.has(node.tagName),
    );
    found.push({
      url: href,
      text,
      where: "body",
      ...textAround(block, element),
      order: order++,
    });
    return "skip";
  });

  const skipped: LinkedSkip[] = [];
  const kept: (LinkedCandidate & { order: number })[] = [];
  const seen = new Set<string>();
  const linesWithLink = new Set<Element>();
  const rank: Record<LinkedWhere, number> = {
    ingredient: 0,
    step: 1,
    note: 2,
    body: 3,
  };
  const ordered = [...found].sort(
    (a, b) => rank[a.where] - rank[b.where] || a.order - b.order,
  );
  /* Lines an ingredient item's link already names. */
  const claimed = new Set<number>();
  const skip = (entry: Found, key: string, reason: string) => {
    skipped.push({ url: entry.url, text: entry.text, reason });
    seen.add(key);
  };
  for (const entry of ordered) {
    if (
      isNonRecipeLink(entry.url, pageUrl, {
        ...(canonical ? { canonical } : {}),
        allowPrivate: allowPrivateLinks,
      })
    ) {
      continue;
    }
    const key = sourceUrlKey(entry.url) ?? entry.url;
    if (seen.has(key)) continue;
    const sameSite = siteKey(entry.url) === pageSite;
    const sentence = sentenceOf(entry);
    let line: number | undefined;
    if (entry.item) {
      if (ALTERNATIVE_BEFORE.test(entry.before)) {
        skip(entry, key, "offered instead of this line, not used by it");
        continue;
      }
      if (linesWithLink.has(entry.item.element)) {
        skip(
          entry,
          key,
          "an alternative on a line whose first link is followed",
        );
        continue;
      }
      const around = clean(`${entry.before} ${entry.text} ${entry.after}`);
      if (!sameSite && !SAYS_RECIPE.test(around)) {
        skip(entry, key, "another site, and nothing says it is a recipe");
        continue;
      }
      linesWithLink.add(entry.item.element);
      const index = lineForItem(around, entry.item.place, lines);
      if (index !== null) {
        line = index;
        claimed.add(index);
      }
    } else {
      const named = namedLine(entry.text, lines, claimed);
      const cued = BODY_CUE.test(entry.text) || BODY_CUE.test(sentence);
      /*
       * Prose, not a use ("try my maple pecan pie", "top with whipped
       * cream"): said nowhere — it would be noise in every dry run. A card
       * step or note may also name a line; the body must say it (Sally's
       * "if you have homemade vanilla extract, go ahead and use it" is a
       * choice, and its line is not that recipe).
       */
      if (!cued && (named === null || entry.where === "body")) continue;
      if (namesSection(entry.text, headings)) {
        skip(entry, key, "names a section this recipe writes out itself");
        continue;
      }
      if (!sameSite && !SAYS_RECIPE.test(`${entry.text} ${sentence}`)) {
        skip(entry, key, "another site, and nothing says it is a recipe");
        continue;
      }
      if (named !== null) {
        line = named;
        claimed.add(named);
      }
    }
    seen.add(key);
    kept.push({
      url: entry.url,
      text: entry.text,
      where: entry.where,
      ...(line !== undefined ? { line } : {}),
      sameSite,
      order: entry.order,
    });
  }
  /* Same site first within each kind, then the page's order. */
  kept.sort(
    (a, b) =>
      rank[a.where] - rank[b.where] ||
      Number(!a.sameSite) - Number(!b.sameSite) ||
      a.order - b.order,
  );
  const candidates = kept.slice(0, max).map(({ order: _order, ...rest }) => {
    void _order;
    return rest;
  });
  for (const extra of kept.slice(max)) {
    skipped.push({
      url: extra.url,
      text: extra.text,
      reason: `over the limit of ${max} linked recipes per import`,
    });
  }
  return { candidates, skipped };
}

/** Words a link's text says about itself, not what it names. */
const LINK_FILLER = new Set([
  "a",
  "an",
  "the",
  "my",
  "our",
  "this",
  "here",
  "homemade",
  "recipe",
  "recipes",
  "easy",
  "best",
  "favorite",
  "favourite",
  "see",
  "of",
  "for",
]);

/**
 * The ingredient line a step's, note's or paragraph's link names (`null`
 * for none): every word of the link (filler aside) in one line no other
 * link has claimed — "[pie dough](…)" over "1 disc pie dough".
 */
function namedLine(
  text: string,
  lines: readonly (string | null)[],
  claimed: ReadonlySet<number>,
): number | null {
  const own = words(text).filter(
    (word) => !LINK_FILLER.has(word) && !LINK_FILLER.has(`${word}s`),
  );
  if (own.length === 0) return null;
  for (const [index, line] of lines.entries()) {
    if (line === null || claimed.has(index)) continue;
    const there = new Set(words(line));
    if (own.every((word) => there.has(word))) return index;
  }
  return null;
}

/** "pears" ≡ "pear", "crusts" ≡ "crust": enough for a link's words. */
function singularWord(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss")
    ? word.slice(0, -1)
    : word;
}

/**
 * Whether `text` names one of the recipe's sections: every word of it in
 * one of its headings.
 */
function namesSection(text: string, headings: readonly string[]): boolean {
  const own = words(text);
  if (own.length === 0) return false;
  return headings.some((heading) => {
    const there = new Set(words(heading));
    return own.every((word) => there.has(word));
  });
}

/**
 * A recipe's ingredient entries as `findLinkedRecipes` takes them: each
 * line's text, `null` for a heading, and the headings' texts (for "names a
 * section this recipe writes out itself").
 */
export function linkedLineTexts(
  ingredients: readonly { ingredient: string; type?: string }[] | undefined,
): { lines: (string | null)[]; headings: string[] } {
  const entries = ingredients ?? [];
  return {
    lines: entries.map((entry) =>
      entry.type === "heading" ? null : entry.ingredient,
    ),
    headings: entries
      .filter((entry) => entry.type === "heading")
      .map((entry) => entry.ingredient),
  };
}
