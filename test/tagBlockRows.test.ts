import { describe, expect, it } from "vitest";
import { blockRows } from "recipe-website-common/components/TagPage/blockRows";
import type { TermHierarchyNode } from "recipe-website-common/controller/tagVocabulary";

/* `/tags`' block cap (U4 review): top-level rows first, nesting while the
 * budget lasts — a big child's subtree never hides a bigger sibling. */
function node(
  slug: string,
  total: number,
  children: TermHierarchyNode[] = [],
): TermHierarchyNode {
  return { slug, label: slug, count: total, total, children };
}

const view = (rows: { node: TermHierarchyNode; depth: number }[]) =>
  rows.map(({ node, depth }) => `${"-".repeat(depth)}${node.slug}`);

describe("blockRows", () => {
  it("keeps every top-level row before any nested one", () => {
    const big = node(
      "cocktails",
      100,
      Array.from({ length: 20 }, (_, i) =>
        node(`family-${String(i).padStart(2, "0")}`, 20 - i),
      ),
    );
    const siblings = Array.from({ length: 5 }, (_, i) =>
      node(`style-${i}`, 50 - i),
    );
    const { shown, rest } = blockRows([big, ...siblings], 15);
    expect(shown).toHaveLength(15);
    /* All six top-level rows, the biggest's nesting in the nine left. */
    expect(view(shown).filter((row) => !row.startsWith("-"))).toEqual([
      "cocktails",
      "style-0",
      "style-1",
      "style-2",
      "style-3",
      "style-4",
    ]);
    expect(view(shown).slice(0, 3)).toEqual([
      "cocktails",
      "-family-00",
      "-family-01",
    ]);
    expect(view(shown)[10]).toBe("style-0");
    expect(rest).toHaveLength(11);
    expect(rest.every(({ depth }) => depth === 1)).toBe(true);
  });

  it("caps the top-level rows themselves, nesting none past the limit", () => {
    const nodes = Array.from({ length: 18 }, (_, i) =>
      node(`term-${String(i).padStart(2, "0")}`, 30 - i, [
        node(`child-${i}`, 1),
      ]),
    );
    const { shown, rest } = blockRows(nodes, 15);
    expect(view(shown)).toEqual(nodes.slice(0, 15).map((term) => term.slug));
    expect(rest).toHaveLength(21);
  });

  it("shows the whole tree when it fits, in reading order", () => {
    const { shown, rest } = blockRows(
      [node("a", 1), node("b", 5, [node("c", 3, [node("d", 2)])])],
      15,
    );
    expect(view(shown)).toEqual(["b", "-c", "--d", "a"]);
    expect(rest).toEqual([]);
  });
});
