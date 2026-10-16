import type { TermHierarchyNode } from "../../controller/tagVocabulary";

/**
 * Rows a `/tags` block shows (usability pass review): a facet with seventy
 * children otherwise runs one column to thousands of pixels and leaves the
 * others empty. Nested rows count toward it; the rest are a link away.
 */
export const BLOCK_ROW_LIMIT = 15;

export interface BlockRow {
  node: TermHierarchyNode;
  /** 0 for the root's own children, 1 under one of them, and so on. */
  depth: number;
}

/** Most carried first, then by label — the order a bar chart reads in. */
export function sortRows(nodes: TermHierarchyNode[]): TermHierarchyNode[] {
  return [...nodes].sort(
    (a, b) => b.total - a.total || a.label.localeCompare(b.label),
  );
}

/** A block's rows in reading order: each term, then its narrower ones. */
export function flattenRows(nodes: TermHierarchyNode[], depth = 0): BlockRow[] {
  return sortRows(nodes).flatMap((node) => [
    { node, depth },
    ...flattenRows(node.children, depth + 1),
  ]);
}

/**
 * What a block shows within `limit` rows, and what it leaves out (review
 * round): the top-level rows first — up to `limit` of them, biggest first —
 * and only then, in the same order, each one's nested rows while the budget
 * lasts. So a big child's subtree never pushes a bigger sibling out; it is
 * the nesting that gives way. `shown` is in reading order (each row, then
 * the nested rows kept under it); `rest` is everything else, in reading
 * order too.
 */
export function blockRows(
  nodes: TermHierarchyNode[],
  limit = BLOCK_ROW_LIMIT,
): { shown: BlockRow[]; rest: BlockRow[]; all: BlockRow[] } {
  const all = flattenRows(nodes);
  const top = sortRows(nodes).slice(0, limit);
  let budget = limit - top.length;
  const shown: BlockRow[] = [];
  for (const node of top) {
    shown.push({ node, depth: 0 });
    if (budget > 0) {
      const nested = flattenRows(node.children, 1).slice(0, budget);
      budget -= nested.length;
      shown.push(...nested);
    }
  }
  const kept = new Set(shown.map((row) => row.node));
  return { shown, rest: all.filter((row) => !kept.has(row.node)), all };
}
