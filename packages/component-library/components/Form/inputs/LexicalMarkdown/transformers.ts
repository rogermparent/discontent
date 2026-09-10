import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
  type TextMatchTransformer,
  type Transformer,
} from "@lexical/markdown";
import { type TextNode } from "lexical";
import {
  $createMultiplyableNode,
  $createVideoTimeNode,
  $isMultiplyableNode,
  $isVideoTimeNode,
  MultiplyableNode,
  VideoTimeNode,
} from "./nodes";

/** `<Multiplyable baseNumber="2" />` <-> MultiplyableNode */
const MULTIPLYABLE_TRANSFORMER: TextMatchTransformer = {
  dependencies: [MultiplyableNode],
  export: (node) => {
    if (!$isMultiplyableNode(node)) return null;
    return `<Multiplyable baseNumber="${node.getBaseNumber()}" />`;
  },
  importRegExp: /<Multiplyable baseNumber="([^"]*)"\s*\/>/,
  regExp: /<Multiplyable baseNumber="([^"]*)"\s*\/>$/,
  replace: (textNode: TextNode, match: RegExpMatchArray) => {
    textNode.replace($createMultiplyableNode(match[1]));
  },
  trigger: ">",
  type: "text-match",
};

/** `<VideoTime time={10}>10s</VideoTime>` <-> VideoTimeNode */
const VIDEO_TIME_TRANSFORMER: TextMatchTransformer = {
  dependencies: [VideoTimeNode],
  export: (node) => {
    if (!$isVideoTimeNode(node)) return null;
    return `<VideoTime time={${node.getTime()}}>${node.getLabel()}</VideoTime>`;
  },
  importRegExp: /<VideoTime time=\{(\d+)\}>([^<]*)<\/VideoTime>/,
  regExp: /<VideoTime time=\{(\d+)\}>([^<]*)<\/VideoTime>$/,
  replace: (textNode: TextNode, match: RegExpMatchArray) => {
    textNode.replace($createVideoTimeNode(Number(match[1]), match[2]));
  },
  trigger: ">",
  type: "text-match",
};

/**
 * Default markdown transformers plus the recipe-specific custom tags. Custom
 * ones go first so they match before generic inline rules.
 */
export const RECIPE_TRANSFORMERS: Transformer[] = [
  MULTIPLYABLE_TRANSFORMER,
  VIDEO_TIME_TRANSFORMER,
  ...TRANSFORMERS,
];

export const RECIPE_EDITOR_NODES = [MultiplyableNode, VideoTimeNode];

/** Parse a markdown string into the current editor (call inside editor.update). */
export function $importMarkdown(
  markdown: string,
  transformers: Transformer[],
): void {
  $convertFromMarkdownString(markdown, transformers);
}

/** Serialize the current editor to a markdown string (call inside read/update). */
export function $exportMarkdown(transformers: Transformer[]): string {
  return $convertToMarkdownString(transformers);
}

/**
 * A markdown *dialect*: the Lexical namespace, the extra nodes, and the
 * transformers that together decide what syntax the editor understands.
 *
 * This exists so `LexicalMarkdownInput` is not hard-wired to one content type.
 * It used to import RECIPE_TRANSFORMERS/RECIPE_EDITOR_NODES directly and run
 * under the namespace "recipe-markdown", which meant any other site adopting the
 * editor silently inherited recipe's `<Multiplyable>` and `<VideoTime>` syntax.
 */
export interface MarkdownDialect {
  /** Lexical namespace — distinct per dialect so editors never share state. */
  namespace: string;
  /** Extra nodes beyond the rich-text/list/code/link baseline. */
  nodes: typeof RECIPE_EDITOR_NODES;
  transformers: Transformer[];
}

/** Plain CommonMark-ish markdown. The default: no site-specific syntax. */
export const PLAIN_MARKDOWN: MarkdownDialect = {
  namespace: "markdown",
  nodes: [],
  transformers: TRANSFORMERS,
};

/** Recipe's dialect — adds scalable quantities and video timestamps. */
export const RECIPE_MARKDOWN: MarkdownDialect = {
  namespace: "recipe-markdown",
  nodes: RECIPE_EDITOR_NODES,
  transformers: RECIPE_TRANSFORMERS,
};
