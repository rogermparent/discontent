/**
 * Small queries over a parsed page (hast), shared by the roundup reader
 * (`roundupPage.ts`, 34) and the page-to-text helper (`pageText.ts`, 36a).
 * Pure and Node-safe: no parser here, only walks over a tree a caller parsed.
 */
import type { Element, Root, RootContent } from "hast";

export type Parent = Root | Element;

/** The concatenated text under a node. */
export function textOf(node: Root | RootContent): string {
  if (node.type === "text") return node.value;
  if ("children" in node) return node.children.map(textOf).join("");
  return "";
}

/** A property as a string: class lists joined by spaces, absent as undefined. */
export function attr(element: Element, name: string): string | undefined {
  const value = element.properties?.[name];
  if (value === undefined || value === null || value === false) return;
  if (Array.isArray(value)) return value.join(" ");
  return String(value);
}

/** An element's class list and id, as one string to test a pattern against. */
export function classes(element: Element): string {
  return `${attr(element, "className") ?? ""} ${attr(element, "id") ?? ""}`;
}

/** Depth-first over elements; `"skip"` from `visit` skips that subtree. */
export function walk(
  node: Parent,
  visit: (element: Element, parent: Parent) => void | "skip",
) {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (visit(child, node) === "skip") continue;
    walk(child, visit);
  }
}

/** Every element under `node` that passes `test`, in document order. */
export function elements(node: Parent, test: (element: Element) => boolean) {
  const found: Element[] = [];
  walk(node, (element) => {
    if (test(element)) found.push(element);
  });
  return found;
}

/** The class names blogs and CMSs give an article's body. */
export const CONTENT_CLASS =
  /(^|\s)(entry-content|post-content|article-content|article-body|post-body|single-content)(\s|$)/;

/**
 * The article body: the first element of the most specific kind found —
 * `.entry-content` and friends, `[itemprop=articleBody]`, `<article>`,
 * `<main>`, then `<body>`, else the whole tree.
 */
export function articleRoot(tree: Root): Element | Root {
  const candidates: ((element: Element) => boolean)[] = [
    (element) => CONTENT_CLASS.test(attr(element, "className") ?? ""),
    (element) => attr(element, "itemProp") === "articleBody",
    (element) => element.tagName === "article",
    (element) => element.tagName === "main",
    (element) => element.tagName === "body",
  ];
  for (const test of candidates) {
    const [found] = elements(tree, test);
    if (found) return found;
  }
  return tree;
}
