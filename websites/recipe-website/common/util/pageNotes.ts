/**
 * A recipe page's own notes (47j), read from its HTML — never invented.
 * Pure and Node-safe: no I/O and no model; the editor's import step
 * (`editor/controller/notes/importNotes.ts`) runs these in order:
 *
 * 1. **A known card plugin's notes block** (`pluginNotes`): WP Recipe
 *    Maker's `.wprm-recipe-notes`, Tasty Recipes' `.tasty-recipes-notes`,
 *    Mediavine Create's `.mv-create-notes`… split into notes on the card's
 *    own list items, else its paragraphs.
 * 2. **A learned site selector** (`selectorNotes`): a CSS selector a model
 *    picked once for the site from `notesOutline` — in the small grammar
 *    `parseSelector` reads — checked by `checkNotesSelector` (exactly one
 *    element, by a "Notes" heading, the size of notes, not the recipe).
 * 3. Otherwise no notes.
 *
 * schema.org's Recipe has no notes property, so JSON-LD never carries them.
 */
import type { Element, ElementContent, Root, RootContent } from "hast";
import { fromHtml } from "hast-util-from-html";
import { hastToMarkdown } from "./htmlMarkdown";
import { attr, textOf, walk, type Parent } from "./hastQuery";
import { NOTES_MAX, NOTE_MAX_CHARS } from "./recipeNotes";
import { isDropRegion } from "./pageText";

/* ------------------------------------------------------------------ */
/* Parsing and the tree's links                                        */
/* ------------------------------------------------------------------ */

/** A page parsed for its notes, with each element's parent. */
export interface NotesPage {
  tree: Root;
  parents: Map<Element, Parent>;
}

/** Parse a page once for every step below. */
export function notesPage(html: string): NotesPage {
  const tree = fromHtml(html);
  const parents = new Map<Element, Parent>();
  const stack: Parent[] = [tree];
  while (stack.length > 0) {
    const node = stack.pop()!;
    for (const child of node.children) {
      if (child.type !== "element") continue;
      parents.set(child, node);
      stack.push(child);
    }
  }
  return { tree, parents };
}

/** Whitespace collapsed. */
function text(node: Root | RootContent): string {
  return textOf(node).replace(/\s+/g, " ").trim();
}

function classList(element: Element): string[] {
  return (attr(element, "className") ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** Never notes: scripts, styles, templates — and what a reader never sees. */
const HIDDEN_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "head",
  "iframe",
  "button",
  "select",
  "form",
  "input",
  "textarea",
]);

/** Regions a page's own notes are never in: site chrome, unless it is the card's. */
const CHROME_TAGS = new Set(["nav", "footer", "header", "aside"]);

/** A site menu's own class tokens (Sally's "Tips" is a menu item's title). */
const MENU_TOKEN =
  /^(?:menu|sub-menu|mega-menu|navigation|navbar)$|^(?:menu|nav|navbar|mega-menu)[-_]/;

function isMenu(element: Element): boolean {
  return `${attr(element, "className") ?? ""} ${attr(element, "id") ?? ""}`
    .toLowerCase()
    .split(/\s+/)
    .some((token) => MENU_TOKEN.test(token));
}

/**
 * Whether `element` sits where notes never are: hidden, in the site's
 * nav, header, footer or an aside (unless its class names the recipe —
 * King Arthur's ingredients are an `<aside>`), or in a comment, sidebar,
 * related-post or share region (`isDropRegion`, pageText's whole tokens).
 */
function inChrome(page: NotesPage, element: Element): boolean {
  for (
    let node: Parent | undefined = element;
    node && node.type === "element";
    node = page.parents.get(node)
  ) {
    if (HIDDEN_TAGS.has(node.tagName)) return true;
    if (
      CHROME_TAGS.has(node.tagName) &&
      !/recipe/i.test(classList(node).join(" "))
    ) {
      return true;
    }
    if (isDropRegion(node) || isMenu(node)) return true;
    if (attr(node, "hidden") !== undefined) return true;
    if (/display\s*:\s*none/i.test(attr(node, "style") ?? "")) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* A block of notes → notes                                            */
/* ------------------------------------------------------------------ */

/**
 * A notes heading's words: "Notes", "Recipe Notes", "Notes:", "Tips",
 * "Recipe Tips", "Cook's Notes", "Notes & Tips", "Tips and Notes", "Tips
 * from our Bakers" (King Arthur).
 */
export const NOTES_LABEL =
  /^(?:(?:recipe|cook'?s|chef'?s|my|kitchen|baking|cooking|helpful|expert|pro|extra)\s+)?(?:notes?|tips?)(?:\s*(?:&|and|\+)\s*(?:notes?|tips?|tricks?|substitutions?|faqs?))?(?:\s+from\s+(?:the|our|my)\s+[a-z' ]{1,24})?\s*[:.]?$/i;

/** Whether `words` are a notes heading's. */
export function isNotesLabel(words: string): boolean {
  return NOTES_LABEL.test(words.replace(/[’‘]/g, "'").trim());
}

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "blockquote",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "table",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "pre",
  "figure",
]);

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/** A copy without hidden parts, images and links (their text kept). */
function cleaned(node: Element): Element {
  const children: ElementContent[] = [];
  for (const child of node.children) {
    if (child.type === "comment") continue;
    if (child.type === "text") {
      /* A no-break space is a space: markdown escapes it as `&#xA0;`. */
      children.push({ ...child, value: child.value.replace(/\u00a0/g, " ") });
      continue;
    }
    if (child.type !== "element") {
      children.push(child);
      continue;
    }
    if (HIDDEN_TAGS.has(child.tagName)) continue;
    if (
      ["img", "picture", "video", "audio", "figure"].includes(child.tagName)
    ) {
      continue;
    }
    if (/display\s*:\s*none/i.test(attr(child, "style") ?? "")) continue;
    const inner = cleaned(child);
    if (child.tagName === "a") {
      children.push(...inner.children);
      continue;
    }
    /* WPRM writes each paragraph as `<span style="display: block">`. */
    if (
      child.tagName === "span" &&
      /display\s*:\s*block/i.test(attr(child, "style") ?? "")
    ) {
      children.push({ ...inner, tagName: "p", properties: {} });
      continue;
    }
    if (EMPHASIS_TAGS.has(child.tagName)) {
      /* "<strong>Spiciness – </strong>Mapo": a space inside the bold is
       * moved out of it, or markdown writes entities to keep it bold. */
      const [lead, body, trail] = edgeSpace(inner);
      if (lead) children.push({ type: "text", value: " " });
      children.push(body);
      if (trail) children.push({ type: "text", value: " " });
      continue;
    }
    children.push(inner);
  }
  return { ...node, children };
}

const EMPHASIS_TAGS = new Set(["strong", "b", "em", "i", "u", "mark"]);

/**
 * An inline element with the spaces at its ends taken off — through its
 * first and last descendants (`<strong><span>Note: </span></strong>`) — and
 * whether there were.
 */
function edgeSpace(element: Element): [boolean, Element, boolean] {
  const [lead, start] = trimEdge(element, "start");
  const [trail, both] = trimEdge(start, "end");
  return [lead, both, trail];
}

function trimEdge(element: Element, edge: "start" | "end"): [boolean, Element] {
  const children = [...element.children];
  const at = edge === "start" ? 0 : children.length - 1;
  const child = children[at];
  if (!child) return [false, element];
  if (child.type === "text") {
    const pattern = edge === "start" ? /^\s+/ : /\s+$/;
    if (!pattern.test(child.value)) return [false, element];
    children[at] = { ...child, value: child.value.replace(pattern, "") };
    return [true, { ...element, children }];
  }
  if (child.type !== "element") return [false, element];
  const [trimmed, inner] = trimEdge(child, edge);
  if (!trimmed) return [false, element];
  children[at] = inner;
  return [true, { ...element, children }];
}

/** The child as a block of its own (a paragraph, a list, a div…), if it is one. */
function asBlock(node: ElementContent): Element | undefined {
  return node.type === "element" && BLOCK_TAGS.has(node.tagName)
    ? node
    : undefined;
}

/** An element as one note's markdown, at most `NOTE_MAX_CHARS`. */
function noteMarkdown(node: Element): string {
  const markdown = hastToMarkdown({
    type: "root",
    children: node.tagName === "li" ? node.children : [node],
  })
    /* Two breaks in a row are a paragraph's end, not two hard breaks. */
    .replace(/\\\n(?:[ \t]*\\\n)+/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (markdown.length <= NOTE_MAX_CHARS) return markdown;
  return `${markdown.slice(0, NOTE_MAX_CHARS - 1).trimEnd()}…`;
}

/** The block's own heading ("Notes"), which is no note. */
function isOwnHeading(node: Element): boolean {
  const words = text(node);
  if (!words || !isNotesLabel(words)) return false;
  return (
    HEADING_TAGS.has(node.tagName) ||
    /header|heading|title|label/i.test(classList(node).join(" ")) ||
    ["p", "strong", "b", "span", "div"].includes(node.tagName)
  );
}

/**
 * The units a block of notes splits into: its list items when it holds a
 * list, else its block children — a single wrapper unwrapped — with the
 * inline runs between them each a unit of their own.
 */
function units(block: Element): Element[] {
  const items: Element[] = [];
  walk(block, (element) => {
    if (element.tagName === "li") {
      items.push(element);
      return "skip";
    }
  });
  if (items.length > 0) return items;
  let node = block;
  for (;;) {
    const kids = node.children.filter(
      (child) =>
        !(child.type === "text" && !child.value.trim()) &&
        child.type !== "comment",
    );
    const only = kids[0];
    if (
      kids.length === 1 &&
      only.type === "element" &&
      ["div", "section", "article", "blockquote"].includes(only.tagName)
    ) {
      node = only;
      continue;
    }
    break;
  }
  const out: Element[] = [];
  let run: ElementContent[] = [];
  const flush = () => {
    if (run.some((child) => text(child as RootContent))) {
      out.push({
        type: "element",
        tagName: "p",
        properties: {},
        children: run,
      });
    }
    run = [];
  };
  for (const child of node.children) {
    const block = asBlock(child);
    if (block) {
      flush();
      if (HEADING_TAGS.has(block.tagName) && isOwnHeading(block)) continue;
      out.push(block);
    } else if (child.type === "element" && child.tagName === "br") {
      /* Two breaks in a row end a paragraph. */
      const last = run[run.length - 1];
      if (last?.type === "element" && last.tagName === "br") {
        run.pop();
        flush();
      } else {
        run.push(child);
      }
    } else {
      run.push(child);
    }
  }
  flush();
  return out;
}

/** A unit that is only a short bold lead ("Storage:"): it heads the next. */
function isLead(note: string): boolean {
  return /^\*\*[^*\n]{1,60}\*\*:?$/.test(note) || /^[^\n]{1,40}:$/.test(note);
}

/**
 * A block of notes as notes (47j): each list item, else each paragraph —
 * the block's own "Notes" heading left out, a short bold lead ("Storage:")
 * joined to what follows it — at most `NOTES_MAX`.
 */
export function splitNotes(block: Element): string[] {
  const notes: string[] = [];
  let lead: string | undefined;
  for (const unit of units(cleaned(block))) {
    if (isOwnHeading(unit)) continue;
    const note = noteMarkdown(unit);
    if (!note) continue;
    if (isLead(note) && !lead) {
      lead = note;
      continue;
    }
    notes.push(lead ? `${lead} ${note}` : note);
    lead = undefined;
  }
  if (lead) notes.push(lead);
  return notes.slice(0, NOTES_MAX);
}

/* ------------------------------------------------------------------ */
/* 1. A card plugin's notes block                                      */
/* ------------------------------------------------------------------ */

/** The recipe-card plugins whose notes block is known, by its class. */
export const NOTE_PLUGINS: readonly { plugin: string; className: string }[] = [
  { plugin: "WP Recipe Maker", className: "wprm-recipe-notes" },
  { plugin: "Tasty Recipes", className: "tasty-recipes-notes" },
  { plugin: "Mediavine Create", className: "mv-create-notes-content" },
  { plugin: "Mediavine Create", className: "mv-create-notes" },
  { plugin: "WPZOOM Recipe Card", className: "recipe-card-notes" },
  { plugin: "Zip Recipes", className: "zrdn-notes" },
  { plugin: "Cooked", className: "cooked-recipe-notes" },
  { plugin: "EasyRecipe", className: "ERSNotes".toLowerCase() },
];

/** What a plugin's block gave: its notes, and which plugin it was. */
export interface PluginNotes {
  plugin: string;
  className: string;
  notes: string[];
}

/**
 * The first known card plugin's notes block on the page with any notes in
 * it (47j's path 1), or `undefined`.
 */
export function pluginNotes(page: NotesPage): PluginNotes | undefined {
  for (const known of NOTE_PLUGINS) {
    const found: Element[] = [];
    walk(page.tree, (element) => {
      if (HIDDEN_TAGS.has(element.tagName)) return "skip";
      if (classList(element).includes(known.className)) {
        found.push(element);
        return "skip";
      }
    });
    for (const block of found) {
      const notes = splitNotes(block);
      if (notes.length > 0) return { ...known, notes };
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* The selector grammar                                                */
/* ------------------------------------------------------------------ */

/** One compound: `div#notes.recipe-notes[data-x="y"]`. */
interface Compound {
  tag?: string;
  id?: string;
  classes: string[];
  attrs: { name: string; value?: string }[];
}

/** A parsed selector: compounds, and the combinator before each but the first. */
export interface ParsedSelector {
  compounds: Compound[];
  combinators: (" " | ">" | "+")[];
}

/** The longest selector, and the most compounds in one. */
export const SELECTOR_MAX_CHARS = 200;
export const SELECTOR_MAX_PARTS = 6;

const NAME = "-?[_a-zA-Z][_a-zA-Z0-9-]*";
const COMPOUND = new RegExp(
  `^(${NAME}|\\*)?((?:#${NAME}|\\.${NAME}|\\[${NAME}(?:=(?:"[^"]*"|'[^']*'|${NAME}))?\\])*)$`,
);

/**
 * A selector in the small grammar a learned selector may use (47j): tag
 * names, `#id`, `.class`, `[attr]` and `[attr="value"]`, joined by a
 * descendant space, `>` or `+` — no pseudo-classes, no positions, so a
 * selector names the site's markup, not one page's layout. `undefined`
 * for anything else.
 */
export function parseSelector(raw: string): ParsedSelector | undefined {
  const source = raw.trim();
  if (!source || source.length > SELECTOR_MAX_CHARS) return undefined;
  const tokens = source
    .replace(/\s*([>+])\s*/g, " $1 ")
    .split(/\s+/)
    .filter(Boolean);
  const compounds: Compound[] = [];
  const combinators: (" " | ">" | "+")[] = [];
  let pending: " " | ">" | "+" | undefined;
  for (const token of tokens) {
    if (token === ">" || token === "+") {
      if (compounds.length === 0 || pending !== undefined) return undefined;
      pending = token;
      continue;
    }
    const match = COMPOUND.exec(token);
    if (!match || (!match[1] && !match[2])) return undefined;
    const compound: Compound = { classes: [], attrs: [] };
    if (match[1] && match[1] !== "*") compound.tag = match[1].toLowerCase();
    for (const part of match[2].match(
      new RegExp(`#${NAME}|\\.${NAME}|\\[[^\\]]+\\]`, "g"),
    ) ?? []) {
      if (part.startsWith("#")) {
        if (compound.id) return undefined;
        compound.id = part.slice(1);
      } else if (part.startsWith(".")) {
        compound.classes.push(part.slice(1).toLowerCase());
      } else {
        const [name, value] = part.slice(1, -1).split("=");
        compound.attrs.push({
          name: name.toLowerCase(),
          ...(value !== undefined
            ? { value: value.replace(/^["']|["']$/g, "") }
            : {}),
        });
      }
    }
    if (compounds.length > 0) combinators.push(pending ?? " ");
    pending = undefined;
    compounds.push(compound);
  }
  if (pending !== undefined || compounds.length === 0) return undefined;
  if (compounds.length > SELECTOR_MAX_PARTS) return undefined;
  return { compounds, combinators };
}

/** hast's property name for an HTML attribute (`data-x` → `dataX`). */
function propertyName(name: string): string {
  if (name === "class") return "className";
  if (name === "for") return "htmlFor";
  return name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function matchesCompound(element: Element, compound: Compound): boolean {
  if (compound.tag && element.tagName !== compound.tag) return false;
  if (compound.id && attr(element, "id") !== compound.id) return false;
  if (compound.classes.length) {
    const own = classList(element);
    if (!compound.classes.every((name) => own.includes(name))) return false;
  }
  for (const { name, value } of compound.attrs) {
    const actual = attr(element, propertyName(name));
    if (actual === undefined) return false;
    if (value !== undefined && actual !== value) return false;
  }
  return true;
}

/** The element just before `element` among its parent's element children. */
function previousElement(
  page: NotesPage,
  element: Element,
): Element | undefined {
  const parent = page.parents.get(element);
  if (!parent) return undefined;
  const siblings = (parent.children as RootContent[]).filter(
    (child): child is Element => child.type === "element",
  );
  const at = siblings.indexOf(element);
  return at > 0 ? siblings[at - 1] : undefined;
}

function matchesFrom(
  page: NotesPage,
  element: Element,
  selector: ParsedSelector,
  at: number,
): boolean {
  if (!matchesCompound(element, selector.compounds[at])) return false;
  if (at === 0) return true;
  const combinator = selector.combinators[at - 1];
  if (combinator === "+") {
    const before = previousElement(page, element);
    return !!before && matchesFrom(page, before, selector, at - 1);
  }
  if (combinator === ">") {
    const parent = page.parents.get(element);
    return (
      !!parent &&
      parent.type === "element" &&
      matchesFrom(page, parent, selector, at - 1)
    );
  }
  for (
    let parent = page.parents.get(element);
    parent && parent.type === "element";
    parent = page.parents.get(parent)
  ) {
    if (matchesFrom(page, parent, selector, at - 1)) return true;
  }
  return false;
}

/** Every element `selector` matches, in document order. */
export function selectAll(
  page: NotesPage,
  selector: ParsedSelector,
): Element[] {
  const last = selector.compounds.length - 1;
  const found: Element[] = [];
  walk(page.tree, (element) => {
    if (matchesFrom(page, element, selector, last)) found.push(element);
  });
  return found;
}

/* ------------------------------------------------------------------ */
/* 2. A learned selector                                               */
/* ------------------------------------------------------------------ */

/** A short element whose words are a notes heading (not in page chrome). */
function isNotesHeading(page: NotesPage, element: Element): boolean {
  if (HIDDEN_TAGS.has(element.tagName)) return false;
  const words = text(element);
  if (!words || words.length > 40 || !isNotesLabel(words)) return false;
  if (
    !HEADING_TAGS.has(element.tagName) &&
    !["strong", "b", "p", "span", "div", "dt", "summary"].includes(
      element.tagName,
    )
  ) {
    return false;
  }
  /* The innermost such element — a div wrapping an h3 "Notes", or a p
   * wrapping a lone strong "Tips:", is not one — but a heading tag wins
   * over the span inside it. */
  const heading = HEADING_TAGS.has(element.tagName);
  const inner = element.children.some(
    (child) =>
      child.type === "element" &&
      text(child) === words &&
      (!heading || HEADING_TAGS.has(child.tagName)),
  );
  if (inner || inChrome(page, element)) return false;
  if (HEADING_TAGS.has(element.tagName)) return true;
  /* Not a heading tag: a heading by its class, or a label standing alone
   * — "<p><strong>Tip:</strong> chill the dough</p>" is a sentence's lead,
   * not a heading. */
  if (/head|title|label/i.test(classList(element).join(" "))) return true;
  const parent = page.parents.get(element);
  const block =
    BLOCK_TAGS.has(element.tagName) || !parent || parent.type !== "element"
      ? element
      : parent;
  return text(block) === words;
}

/** The recipe-card plugins' own outer classes (pageText's `CARD_ROOTS`). */
const CARD_CLASSES = new Set([
  "wprm-recipe-container",
  "wprm-recipe",
  "tasty-recipes",
  "mv-create-card",
  "wpzoom-recipe-card",
  "zrdn-recipe-container",
  "easyrecipe",
  "cooked-recipe",
]);

/**
 * Whether the page's recipe is in a known card plugin's card: its notes,
 * if any, are in the card's notes block, so a "Notes" heading elsewhere on
 * the page is the post's, and no selector is learned for it.
 */
export function hasKnownCard(page: NotesPage): boolean {
  let found = false;
  walk(page.tree, (element) => {
    if (found) return "skip";
    if (classList(element).some((name) => CARD_CLASSES.has(name))) {
      found = true;
      return "skip";
    }
  });
  return found;
}

/** The page's "Notes" headings a reader sees, in document order. */
export function notesHeadings(page: NotesPage): Element[] {
  const found: Element[] = [];
  walk(page.tree, (element) => {
    if (HIDDEN_TAGS.has(element.tagName)) return "skip";
    if (isNotesHeading(page, element)) {
      found.push(element);
      return "skip";
    }
  });
  return found;
}

/** "Ingredients" and "Instructions" headings: a block holding both is the recipe. */
const RECIPE_LABELS = [
  /^ingredients?\b/i,
  /^(instructions?|directions?|method|preparation|steps)\b/i,
];

function holdsRecipe(element: Element): boolean {
  const seen = RECIPE_LABELS.map(() => false);
  walk(element, (child) => {
    const words = text(child);
    if (words.length > 40) return;
    RECIPE_LABELS.forEach((label, index) => {
      if (label.test(words)) seen[index] = true;
    });
  });
  return seen.every(Boolean);
}

/** The shortest notes a block may hold, and the longest (all of them). */
export const NOTES_MIN_CHARS = 20;
export const NOTES_BLOCK_MAX_CHARS = 20_000;

/**
 * Whether `element` is by a notes heading: it holds one, its text starts
 * with one, or one is the element just before it or before one of its
 * three nearest ancestors.
 */
function byNotesHeading(page: NotesPage, element: Element): boolean {
  let found = false;
  walk(element, (child) => {
    if (isNotesHeading(page, child)) found = true;
  });
  if (found) return true;
  const words = text(element);
  if (/^(?:recipe\s+)?(?:notes?|tips?)\s*[:.]/i.test(words)) return true;
  let node: Element | undefined = element;
  for (let depth = 0; node && depth < 4; depth += 1) {
    const before = previousElement(page, node);
    if (
      before &&
      (isNotesHeading(page, before) || lastIsHeading(page, before))
    ) {
      return true;
    }
    const parent = page.parents.get(node);
    node = parent && parent.type === "element" ? parent : undefined;
  }
  return false;
}

/** A wrapper whose last element is the heading (`<div><h3>Notes</h3></div>`). */
function lastIsHeading(page: NotesPage, element: Element): boolean {
  const kids = element.children.filter(
    (child): child is Element => child.type === "element",
  );
  const last = kids[kids.length - 1];
  return !!last && isNotesHeading(page, last);
}

/**
 * A class or id that a build tool made rather than a person: styled-jsx's
 * `jsx-1098722538`, CSS-in-JS hashes (`css-1x2y3z`, `sc-…`, `emotion-…`),
 * or any name with a run of five digits or more (a post's id). A selector
 * naming one would miss once the site is rebuilt.
 */
const GENERATED_NAME =
  /^(?:jsx|css|sc|emotion|styled|svelte|astro)-[\w-]+$|\d{5,}|^[a-z]{0,3}[0-9a-f]{8,}$/i;

/** The first generated name `selector` uses, if any. */
export function generatedName(selector: ParsedSelector): string | undefined {
  for (const compound of selector.compounds) {
    for (const name of [
      ...(compound.id ? [compound.id] : []),
      ...compound.classes,
    ]) {
      if (GENERATED_NAME.test(name)) return name;
    }
  }
  return undefined;
}

/** A checked selector: its element and the notes in it, or why it fails. */
export type SelectorCheck =
  | { ok: true; element: Element; notes: string[] }
  | { ok: false; problem: string };

/**
 * Whether `selector` names this page's notes (47j): it parses in the
 * small grammar, matches exactly one element a reader sees, the element
 * is by a "Notes" heading (holds it, starts with it, or follows it), is
 * the size of notes (20 to 20,000 characters) and not the recipe itself
 * (no block holding both an "Ingredients" and an "Instructions" heading),
 * and splits into at least one note. Its text is the page's: nothing is
 * taken from the model but the selector.
 */
export function checkNotesSelector(
  page: NotesPage,
  selector: string,
): SelectorCheck {
  const parsed = parseSelector(selector);
  if (!parsed) {
    return {
      ok: false,
      problem: `“${selector.slice(0, 80)}” is not a selector of tags, ids, classes and attributes`,
    };
  }
  const generated = generatedName(parsed);
  if (generated) {
    return {
      ok: false,
      problem: `it names “${generated}”, which looks generated for one build of the site and changes when the site is rebuilt`,
    };
  }
  const found = selectAll(page, parsed).filter(
    (element) => !inChrome(page, element),
  );
  if (found.length !== 1) {
    return {
      ok: false,
      problem: `it matches ${found.length} elements on the page, not one`,
    };
  }
  const [element] = found;
  const words = text(element);
  if (words.length < NOTES_MIN_CHARS) {
    return {
      ok: false,
      problem: "the element it matches holds next to no text",
    };
  }
  if (words.length > NOTES_BLOCK_MAX_CHARS) {
    return {
      ok: false,
      problem: "the element it matches is far longer than notes",
    };
  }
  if (holdsRecipe(element)) {
    return {
      ok: false,
      problem:
        "the element it matches holds the recipe's ingredients and steps, not its notes",
    };
  }
  if (!byNotesHeading(page, element)) {
    return {
      ok: false,
      problem: "the element it matches is not by a “Notes” heading",
    };
  }
  const notes = splitNotes(element);
  if (notes.length === 0) {
    return { ok: false, problem: "the element it matches holds no notes" };
  }
  return { ok: true, element, notes };
}

/** The notes a stored selector finds on this page, or why it found none. */
export function selectorNotes(
  page: NotesPage,
  selector: string,
): SelectorCheck {
  return checkNotesSelector(page, selector);
}

/* ------------------------------------------------------------------ */
/* What the model reads                                                */
/* ------------------------------------------------------------------ */

/** An element as the outline writes it: `div#id.class-a.class-b`. */
export function elementLabel(element: Element): string {
  const id = attr(element, "id");
  const names = classList(element)
    .filter(
      (name) =>
        /^-?[_a-z][_a-z0-9-]*$/.test(name) &&
        name.length <= 60 &&
        !GENERATED_NAME.test(name),
    )
    .slice(0, 6);
  const stableId =
    id && /^[_a-zA-Z][\w-]*$/.test(id) && !GENERATED_NAME.test(id) ? id : "";
  return `${element.tagName}${stableId ? `#${stableId}` : ""}${names.map((name) => `.${name}`).join("")}`;
}

/** The outline's bounds: lines, and characters of text a line shows. */
export const OUTLINE_MAX_LINES = 120;
export const OUTLINE_TEXT_CHARS = 80;

/**
 * A trimmed DOM outline around the page's first "Notes" heading (47j), for
 * the model to pick a selector from: the heading's ancestors as a path
 * from `<html>`, then the subtree of its ancestor three levels up, one
 * element a line — indented, written as a selector part
 * (`div.wprm-recipe-notes`), with the start of its own text. Only what is
 * by the heading is opened: the heading's parent's children, and what
 * follows that parent; every other branch is one line ending "…". Bounded
 * to `OUTLINE_MAX_LINES`. `undefined` when the page has no notes heading.
 */
export function notesOutline(page: NotesPage): string | undefined {
  const [heading] = notesHeadings(page);
  if (!heading) return undefined;
  const path: Element[] = [];
  for (
    let node: Parent | undefined = heading;
    node && node.type === "element";
    node = page.parents.get(node)
  ) {
    path.unshift(node);
  }
  const onPath = new Set(path);
  const parent = path[path.length - 2];
  const grandparent = path[path.length - 3];
  /* Opened in full: the heading's parent's children, and what follows the
   * parent in the grandparent. */
  const opened = new Set<Element>();
  const kids = (node: Element | undefined) =>
    (node?.children ?? []).filter(
      (child): child is Element => child.type === "element",
    );
  for (const child of kids(parent)) opened.add(child);
  const after = kids(grandparent);
  for (const child of after.slice(after.indexOf(parent) + 1)) opened.add(child);
  const root = path[Math.max(0, path.length - 4)];
  const lines: string[] = [
    `Path to the heading: ${path.map(elementLabel).join(" > ")}`,
    `Heading: ${elementLabel(heading)} "${text(heading)}"`,
    "",
    'Outline (one element a line, indented by depth; the heading is marked <<; a branch ending "…" is closed):',
  ];
  const skip = new Set(["img", "picture", "br", "hr", "source", "path"]);
  const line = (element: Element, depth: number, closed: boolean) => {
    const own = element.children
      .filter((child) => child.type === "text")
      .map((child) => (child as { value: string }).value)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const leaf = element.children.every((child) => child.type !== "element");
    const words = own || (leaf ? text(element) : "");
    const shown =
      words.length > OUTLINE_TEXT_CHARS
        ? `${words.slice(0, OUTLINE_TEXT_CHARS)}…`
        : words;
    lines.push(
      `${"  ".repeat(depth)}${elementLabel(element)}${shown ? ` "${shown}"` : ""}${element === heading ? " <<" : ""}${closed && !leaf ? " …" : ""}`,
    );
  };
  const visit = (element: Element, depth: number, open: boolean) => {
    if (lines.length >= OUTLINE_MAX_LINES) return;
    if (HIDDEN_TAGS.has(element.tagName) || skip.has(element.tagName)) return;
    const expand = open || onPath.has(element) || opened.has(element);
    line(element, depth, !expand);
    if (!expand) return;
    const inside = open || opened.has(element);
    for (const child of kids(element)) visit(child, depth + 1, inside);
  };
  visit(root, 0, false);
  if (lines.length >= OUTLINE_MAX_LINES) lines.push("…");
  return lines.join("\n");
}
