/**
 * HTML → markdown through hast and mdast: the importer's text chain.
 *
 * `htmlToMarkdown` is what `importRecipeData.ts` has always run a JSON-LD
 * string through (entities decoded, tags turned into markdown, trimmed);
 * `hastToMarkdown` is the same chain from a tree already parsed, which is how
 * `pageText.ts` (36a) renders the part of a page it keeps.
 */
import type { Nodes } from "hast";
import { fromHtml } from "hast-util-from-html";
import { toMdast } from "hast-util-to-mdast";
import { toMarkdown } from "mdast-util-to-markdown";
import { decodeHTML } from "entities";

/** A hast tree as markdown, trimmed. */
export function hastToMarkdown(tree: Nodes): string {
  return toMarkdown(toMdast(tree)).trim();
}

/** An HTML string (entities and all) as markdown, trimmed. */
export function htmlToMarkdown(html: string): string {
  return hastToMarkdown(fromHtml(decodeHTML(html), { fragment: true }));
}
