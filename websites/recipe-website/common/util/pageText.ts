/**
 * A recipe page as the text a local model reads (epic 36, D6).
 *
 * `pageText(html)` keeps the part of the page a recipe lives in and renders
 * it as markdown, so the model sees list structure (one ingredient per line)
 * and no markup:
 *
 * 1. Parse (`hast-util-from-html`, as `pageMetadata.ts` does).
 * 2. Drop what is never the recipe: scripts and styles, navigation, asides,
 *    forms, iframes, media, buttons, the site's own header and footer (an
 *    `<article>`'s header keeps its title), and the comment, sidebar,
 *    related-post and share regions — matched by whole class or id tokens, so
 *    a wrapper's `has-sidebar` does not take the page with it.
 * 3. Choose a container: the smallest recipe card (a class containing
 *    `recipe` whose text names both ingredients and instructions — WP Recipe
 *    Maker, Tasty, Mediavine…), else the article body (`articleRoot`, the
 *    roundup reader's heuristic), else `<body>`.
 * 4. Links become their text and images go, then the hast → mdast →
 *    markdown chain the importer already runs JSON-LD strings through.
 * 5. Cap (`capText`): past `PAGE_TEXT_MAX_CHARS` the *middle* goes — the
 *    leading story on a blog page — keeping the head (title, intro) and the
 *    end, where the recipe card sits. Never the end.
 *
 * Pure and Node-safe: no I/O. The pasted-text mode (D8) skips 1–4 and caps
 * the same way.
 */
import type { Element, ElementContent, Root } from "hast";
import { fromHtml } from "hast-util-from-html";
import { decodeHTML } from "entities";
import { hastToMarkdown } from "./htmlMarkdown";
import {
  articleRoot,
  attr,
  elements,
  textOf,
  walk,
  type Parent,
} from "./hastQuery";

/** ~7k tokens: fits `num_ctx` 12288 with the prompt and the answer (D6). */
export const PAGE_TEXT_MAX_CHARS = 24_000;

/** What a capped text keeps from its start: the title and the intro. */
export const PAGE_TEXT_HEAD_CHARS = 3_000;

const CUT_MARKER = "\n\n[…]\n\n";

/** Elements that never hold recipe text. */
const DROP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "frame",
  "object",
  "embed",
  "svg",
  "canvas",
  "img",
  "picture",
  "video",
  "audio",
  "button",
  "select",
  "input",
  "textarea",
  "dialog",
  "link",
  "meta",
]);

/**
 * Page chrome: dropped unless its class or id names the recipe — King Arthur
 * puts its ingredient list in `<aside class="recipe__ingredients">`.
 * `<header>` and `<footer>` are chrome only outside an `<article>`.
 */
const CHROME_TAGS = new Set(["nav", "aside", "form", "header", "footer"]);
const RECIPE_PART = /recipe|ingredient|instruction|direction/i;

/** Class or id tokens that mark a region to drop, compared whole. */
const DROP_TOKENS = new Set([
  "comments",
  "comment-list",
  "commentlist",
  "comments-area",
  "comment-respond",
  "respond",
  "disqus_thread",
  "sidebar",
  "widget-area",
  "related-posts",
  "jp-relatedposts",
  "breadcrumb",
  "breadcrumbs",
  "share-buttons",
  "social-share",
  "sharedaddy",
  "newsletter",
  "site-header",
  "site-footer",
]);

/** Class or id token prefixes that mark a region to drop. */
const DROP_PREFIXES = ["comment-", "wpdiscuz"];

function tokens(element: Element): string[] {
  return `${attr(element, "className") ?? ""} ${attr(element, "id") ?? ""}`
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function isDropRegion(element: Element): boolean {
  return tokens(element).some(
    (token) =>
      DROP_TOKENS.has(token) ||
      DROP_PREFIXES.some((prefix) => token.startsWith(prefix)),
  );
}

/**
 * Links and emphasis, read as their text: the markdown carries no URLs and no
 * `**…**` for the model to copy into an ingredient line.
 */
const UNWRAP_TAGS = new Set(["a", "strong", "b", "em", "i", "u", "mark"]);

/**
 * Tables as rows of text: the markdown chain has no GFM, and mdast's `table`
 * would not serialise. A row is a block, a cell its text and a space — or a
 * block itself, when it holds blocks.
 */
const TABLE_TAGS: Record<string, string> = {
  table: "div",
  thead: "div",
  tbody: "div",
  tfoot: "div",
  caption: "p",
  tr: "div",
  td: "span",
  th: "span",
};

/** Text nodes' line breaks as `<br>`s, all the way down. */
function withBreaks(children: ElementContent[]): ElementContent[] {
  return children.flatMap((child): ElementContent[] => {
    if (child.type === "element") {
      child.children = withBreaks(child.children);
      return [child];
    }
    if (child.type !== "text" || !child.value.includes("\n")) return [child];
    return child.value.split("\n").flatMap((line, index): ElementContent[] => [
      ...(index > 0
        ? [
            {
              type: "element",
              tagName: "br",
              properties: {},
              children: [],
            } as Element,
          ]
        : []),
      ...(line ? [{ type: "text", value: line } as const] : []),
    ]);
  });
}

/**
 * Never dropped by class, `hidden` or `display:none`: WordPress themes put
 * `sidebar` on `<body>` itself, and dropping it empties the page.
 */
const PAGE_ROOTS = new Set(["html", "body", "main"]);

/** Block content that makes a table cell a block of its own. */
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "ul",
  "ol",
  "li",
  "br",
  "table",
  "section",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
]);

/** An element whose whole text is an amount: `¾`, `1 1/2`, `2–3`. */
const AMOUNT_ONLY = /^[\d\s¼-¾⅐-⅞⁄/.,–-]{1,10}$/;

/**
 * An amount in a block of its own, then the rest of the line in the next
 * block — Bon Appétit's grid, `<p>¾</p><div>cup whole-milk … yogurt</div>` —
 * as one line: the amount moves into the next element. Otherwise the
 * markdown has "¾" and "cup whole-milk plain Greek yogurt" on lines of their
 * own, and no line of the page holds the ingredient the model copies (36a
 * review: Bon Appétit graded 1/11 once grounding went line by line).
 */
function joinAmounts(children: ElementContent[]): ElementContent[] {
  const joined: ElementContent[] = [];
  for (let at = 0; at < children.length; at += 1) {
    const child = children[at];
    if (child.type === "element" && BLOCK_TAGS.has(child.tagName)) {
      const amount = textOf(child).replace(/\s+/g, " ").trim();
      let next = at + 1;
      while (
        next < children.length &&
        children[next].type === "text" &&
        !(children[next] as { value: string }).value.trim()
      ) {
        next += 1;
      }
      const following = children[next];
      if (
        amount &&
        AMOUNT_ONLY.test(amount) &&
        following?.type === "element" &&
        !AMOUNT_ONLY.test(textOf(following).trim())
      ) {
        following.children.unshift({ type: "text", value: `${amount} ` });
        continue;
      }
    }
    joined.push(child);
  }
  return joined;
}

/**
 * Remove dropped elements and chrome in place, and unwrap links and emphasis
 * (`UNWRAP_TAGS`). `minimal` drops only `DROP_TAGS` — the fallback when the
 * full pass leaves nothing.
 */
function prune(node: Parent, inArticle = false, minimal = false) {
  const kept: ElementContent[] = [];
  for (const child of node.children as ElementContent[]) {
    if (child.type === "comment") continue;
    if (child.type !== "element") {
      kept.push(child);
      continue;
    }
    const tag = child.tagName;
    if (DROP_TAGS.has(tag)) continue;
    if (!minimal && !PAGE_ROOTS.has(tag)) {
      if (isDropRegion(child)) continue;
      if (
        CHROME_TAGS.has(tag) &&
        !(inArticle && (tag === "header" || tag === "footer")) &&
        !RECIPE_PART.test(tokens(child).join(" "))
      ) {
        continue;
      }
      /* Hidden copies: PUNCH repeats each ingredient in a `display:none` <li>. */
      if (child.properties?.hidden) continue;
      if (/display\s*:\s*none/i.test(attr(child, "style") ?? "")) continue;
    }
    if (UNWRAP_TAGS.has(tag)) {
      child.tagName = "span";
      child.properties = {};
    }
    if (tag === "pre" || tag === "code") {
      /* Preformatted text (an old archive's whole recipe) as lines, not a
       * fenced code block: in a fence qwen3:8b skipped the method (36a). */
      child.tagName = tag === "pre" ? "p" : "span";
      child.properties = {};
      child.children = withBreaks(child.children);
    }
    const tableTag = TABLE_TAGS[tag];
    if (tableTag) {
      /* A cell holding blocks is a block: as a span its lines would glue
       * together ("1 cup flour2 eggs"). */
      const blockCell =
        tableTag === "span" &&
        child.children.some(
          (inner) => inner.type === "element" && BLOCK_TAGS.has(inner.tagName),
        );
      child.tagName = blockCell ? "div" : tableTag;
      child.properties = {};
      if (child.tagName === "span") {
        child.children.push({ type: "text", value: " " });
      }
    }
    prune(child, inArticle || tag === "article", minimal);
    kept.push(child);
  }
  (node as { children: ElementContent[] }).children = joinAmounts(kept);
}

/** A section label: "Ingredients", "Ingredients for the dough". */
const INGREDIENTS_LABEL = /^ingredients?\b/i;
/** "Instructions", "Directions", "Method", "Preparation", "Steps"… */
const INSTRUCTIONS_LABEL =
  /^(instructions?|directions?|method|preparation|steps|how to make)\b/i;
/** A label is short; a step that mentions "ingredients" is not one. */
const MAX_LABEL_CHARS = 40;

/** The recipe-card plugins' own outer classes, compared as whole tokens. */
const CARD_ROOTS = new Set([
  "wprm-recipe-container",
  "wprm-recipe",
  "tasty-recipes",
  "mv-create-card",
  "wpzoom-recipe-card",
  "zrdn-recipe-container",
  "easyrecipe",
  "cooked-recipe",
  "recipe-card",
]);

/**
 * A climb from the smallest card may add a header (title, times, yield) but
 * not the page: at most this much more text than the card itself.
 */
const CLIMB_EXTRA_CHARS = 3_000;

/**
 * Text lengths and parents, computed once per page in one bottom-up pass:
 * measuring each element's text on demand was O(n·depth), 17 s for 400
 * nested `recipe` divs (36a review).
 */
class PageIndex {
  private lengths = new Map<Element, number>();
  readonly parents = new Map<Element, Element>();

  constructor(tree: Root) {
    /* Iterative post-order: deep pages must not overflow the stack here. */
    const stack: { node: Parent; done: boolean }[] = [
      { node: tree, done: false },
    ];
    while (stack.length > 0) {
      const top = stack.pop()!;
      if (!top.done) {
        stack.push({ node: top.node, done: true });
        for (const child of top.node.children) {
          if (child.type !== "element") continue;
          if (top.node.type === "element") this.parents.set(child, top.node);
          stack.push({ node: child, done: false });
        }
        continue;
      }
      if (top.node.type !== "element") continue;
      let length = 0;
      for (const child of top.node.children) {
        if (child.type === "text") {
          length += child.value.replace(/\s+/g, " ").length;
        } else if (child.type === "element") {
          length += this.lengths.get(child) ?? 0;
        }
      }
      this.lengths.set(top.node, length);
    }
  }

  /** The element's text, whitespace collapsed. */
  text(element: Element): string {
    return textOf(element).replace(/\s+/g, " ").trim();
  }

  /** Its text's length, whitespace collapsed per text node (near enough). */
  length(element: Element): number {
    return this.lengths.get(element) ?? 0;
  }

  /** Whether the element holds both an ingredients and an instructions label. */
  hasBothLabels(element: Element): boolean {
    let ingredients = false;
    let instructions = false;
    walk(element, (child) => {
      if (this.length(child) > MAX_LABEL_CHARS) return;
      const label = this.text(child);
      if (INGREDIENTS_LABEL.test(label)) ingredients = true;
      if (INSTRUCTIONS_LABEL.test(label)) instructions = true;
      return "skip";
    });
    return ingredients && instructions;
  }
}

function hasRecipeClass(element: Element): boolean {
  return /recipe/i.test(attr(element, "className") ?? "");
}

/**
 * The recipe card, where the page has one.
 *
 * 1. A known plugin's card (`CARD_ROOTS`) holding both labels — the first.
 * 2. Else the smallest element with `recipe` in its class holding both
 *    labels, widened to its `recipe`-classed ancestors while they add no more
 *    than `CLIMB_EXTRA_CHARS` (the card's header: title, times, yield).
 *
 * "Holding a label" means a short element reading "Ingredients" and one
 * reading "Instructions" / "Directions" / "Method"…; matching words anywhere
 * in the text instead picked a step list that says "the wet ingredients".
 */
function recipeCard(tree: Root): Element | undefined {
  const index = new PageIndex(tree);
  const named = elements(tree, (element) =>
    (attr(element, "className") ?? "")
      .toLowerCase()
      .split(/\s+/)
      .some((token) => CARD_ROOTS.has(token)),
  ).find((element) => index.hasBothLabels(element));
  if (named) return named;

  let smallest: Element | undefined;
  for (const element of elements(tree, hasRecipeClass)) {
    if (smallest && index.length(element) >= index.length(smallest)) continue;
    if (index.hasBothLabels(element)) smallest = element;
  }
  if (!smallest) return undefined;
  const limit = index.length(smallest) + CLIMB_EXTRA_CHARS;
  let card = smallest;
  for (
    let parent = index.parents.get(card);
    parent && hasRecipeClass(parent) && index.length(parent) <= limit;
    parent = index.parents.get(parent)
  ) {
    card = parent;
  }
  return card;
}

/** Under this much text, the "article" found is an excerpt: read the body. */
const MIN_ARTICLE_CHARS = 200;

export type PageTextContainer = "recipe-card" | "article" | "body" | "plain";

/** Any tag, doctype or comment: the input is HTML, not a plain-text file. */
const HTML_TAG = /<(!--|!doctype|[a-z][a-z0-9-]*[\s>/])/i;

export interface PageTextResult {
  text: string;
  /** Which part of the page `text` came from. */
  container: PageTextContainer;
  /** The middle was cut to fit `maxChars`. */
  truncated: boolean;
  /** The rendered length before the cap. */
  fullLength: number;
}

/**
 * Markdown as plain lines: escapes undone (`1\.` → `1.`, a hard break's
 * trailing `\`), the `<!---->` mdast puts between adjacent lists gone, blank
 * runs collapsed. The model copies lines verbatim, so it must not see escapes.
 */
function plainLines(markdown: string): string {
  return decodeHTML(markdown)
    .replace(/\u00a0/g, " ")
    .replace(/\\\n/g, "\n")
    .replace(/\\([\\`*_{}[\]()#+\-.!<>~|&])/g, "$1")
    .replace(/^(<!---->|\*\*\*)$/gm, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * `text` cut to `maxChars` by dropping its middle: the head (up to
 * `PAGE_TEXT_HEAD_CHARS`) and as much of the end as fits, both cut at line
 * breaks, joined by a `[…]` line. Shared with the pasted-text mode (D8).
 */
export function capText(
  text: string,
  maxChars: number = PAGE_TEXT_MAX_CHARS,
): {
  text: string;
  truncated: boolean;
  /** When cut: how many characters of the start and of the end were kept. */
  kept?: { head: number; tail: number };
} {
  if (text.length <= maxChars) return { text, truncated: false };
  const headLimit = Math.min(PAGE_TEXT_HEAD_CHARS, Math.floor(maxChars / 4));
  let head = text.slice(0, headLimit);
  const headBreak = head.lastIndexOf("\n");
  if (headBreak > headLimit / 2) head = head.slice(0, headBreak);
  const tailLimit = maxChars - head.length - CUT_MARKER.length;
  let tail = text.slice(text.length - tailLimit);
  const tailBreak = tail.indexOf("\n");
  if (tailBreak >= 0 && tailBreak < tailLimit / 2) {
    tail = tail.slice(tailBreak + 1);
  }
  const keptHead = head.trimEnd();
  const keptTail = tail.trimStart();
  return {
    text: `${keptHead}${CUT_MARKER}${keptTail}`,
    truncated: true,
    kept: { head: keptHead.length, tail: keptTail.length },
  };
}

/**
 * The `<article>` around a post body (`.entry-content`), when there is one:
 * its header holds the post's title, which the body alone lacks.
 */
function enclosingArticle(found: Element | Root, tree: Root): Element | Root {
  if (found.type === "root" || found.tagName === "article") return found;
  /* Document order puts an outer article first: the innermost is the last. */
  const article = elements(
    tree,
    (element) =>
      element.tagName === "article" &&
      elements(element, (inner) => inner === found).length > 0,
  ).at(-1);
  return article ?? found;
}

function asRoot(node: Element | Root): Root {
  return node.type === "root" ? node : { type: "root", children: [node] };
}

/** `text` capped, as a result. */
function result(
  text: string,
  container: PageTextContainer,
  maxChars: number,
): PageTextResult {
  const capped = capText(text, maxChars);
  return {
    text: capped.text,
    container,
    truncated: capped.truncated,
    fullLength: text.length,
  };
}

/**
 * Tags stripped by pattern, no tree: the fallback for a page nested too deep
 * for the recursive hast → mdast → markdown chain (a `RangeError`).
 */
export function strippedPageText(html: string): string {
  return decodeHTML(
    html
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|pre|section)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function bodyOf(tree: Root): Element | Root {
  return elements(tree, (element) => element.tagName === "body")[0] ?? tree;
}

/** `pageText`, with where the text came from and whether it was cut. */
export function pageTextDetail(
  html: string,
  { maxChars = PAGE_TEXT_MAX_CHARS }: { maxChars?: number } = {},
): PageTextResult {
  if (!HTML_TAG.test(html.slice(0, 4_096))) {
    /* A plain-text page (an old `.txt` archive): parsed as HTML its line
     * breaks would collapse into one paragraph. */
    const plain = html
      .replace(/\r\n?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return result(plain, "plain", maxChars);
  }
  try {
    const tree = fromHtml(html);
    prune(tree);

    let container: PageTextContainer = "body";
    let root: Element | Root;
    const card = recipeCard(tree);
    if (card) {
      container = "recipe-card";
      root = card;
    } else {
      const article = enclosingArticle(articleRoot(tree), tree);
      if (
        article.type === "element" &&
        article.tagName !== "body" &&
        textOf(article).replace(/\s+/g, " ").trim().length >= MIN_ARTICLE_CHARS
      ) {
        container = "article";
        root = article;
      } else {
        root = bodyOf(tree);
      }
    }

    const rendered = plainLines(hastToMarkdown(asRoot(root)));
    if (rendered) return result(rendered, container, maxChars);

    /* Everything was pruned (a page made of "chrome"): the body, minimally. */
    const unpruned = fromHtml(html);
    prune(unpruned, false, true);
    return result(
      plainLines(hastToMarkdown(asRoot(bodyOf(unpruned)))),
      "body",
      maxChars,
    );
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return result(strippedPageText(html), "body", maxChars);
  }
}

/** The recipe-bearing part of a page as markdown, capped (D6). */
export function pageText(html: string, options?: { maxChars?: number }) {
  return pageTextDetail(html, options).text;
}
