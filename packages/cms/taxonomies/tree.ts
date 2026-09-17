import type { AggregateConfig } from "../aggregates/types";
import type { TermIndexKey, TermIndexValue } from "./termContentType";

/** One term's place in the hierarchy, as the tree aggregate stores it. */
export interface TermTreeNode {
  label: string;
  /** The parent's slug, absent for a root term. */
  parent?: string;
  /** Direct children only, oldest first — the walk order. */
  children: string[];
  /** Carried so a "narrower terms" row can render thumbnails from one read. */
  image?: string;
}

/**
 * The whole vocabulary's hierarchy in one record, keyed by term slug.
 *
 * A flat map rather than a nested structure: a term page wants its own node,
 * its parent chain and its children, and every one of those is a key lookup
 * here. Nesting would force a reader to walk to find any of them, and would
 * have no representation at all for the hand-edited cycle below.
 */
export type TermTree = Record<string, TermTreeNode>;

/**
 * The term type's own aggregate: parent/child links folded from the term index
 * alone.
 *
 * Folded rather than read per-term for the reason every aggregate exists: a
 * breadcrumb and a children list are questions about the *whole* vocabulary,
 * and answering them by reading N term records per page is the N+1 the index
 * exists to remove. The index value already carries `parent`, so this needs no
 * data-file read — which is the `fold` contract (sync, index-only).
 *
 * **A hand-edited cycle terminates.** `A.parent = B` and `B.parent = A` is
 * writable by a text editor and by git, and this fold is the one place that
 * cannot be allowed to hang on it. Linking is a **single pass** over the nodes
 * — each node appends itself to its parent's `children` exactly once, and
 * nothing recurses — so a cycle produces two nodes that are each other's child
 * and both appear in the result. The write-time check that rejects a cycle in
 * the first place is a curation seat (24e), not this; a fold's job is to
 * survive whatever is on disk.
 *
 * A term naming *itself* as parent is dropped from its own `children` for the
 * same reason: it is a state a text editor can produce, and a node that is its
 * own child would make every reader's descendant walk a loop.
 */
export function termTreeAggregate(): AggregateConfig<
  TermIndexValue,
  TermIndexKey,
  Map<string, TermTreeNode>,
  TermTree
> {
  return {
    name: "tree",
    /*
     * Its own version, not the taxonomy's: this fold reads the term *record*
     * type, whose shape is the engine's, while `TaxonomyConfig.version` covers
     * a site's carrier projection. Pinned by `test/specVersions.test.ts` (T1).
     *
     * A factory taking nothing rather than a bare constant, so a
     * vocabulary-specific variant stays an additive change to the signature
     * rather than a second export. The aggregate needs no vocabulary name of
     * its own: it is already scoped by the term content type that declares it,
     * whose environment lives at `<directory>/aggregates/tree/`.
     */
    version: "1",
    initial: () => new Map<string, TermTreeNode>(),
    fold: (tree, { value, id }) => {
      tree.set(id, {
        label: value.label,
        ...(value.parent ? { parent: value.parent } : {}),
        ...(value.image ? { image: value.image } : {}),
        children: [],
      });
      return tree;
    },
    finalize: (tree) => {
      for (const [slug, node] of tree) {
        if (!node.parent || node.parent === slug) continue;
        /*
         * A parent that is not in the corpus stays on the child as a dangling
         * `parent` — the same rule `resolveReferences` follows. A term whose
         * record was deleted is an ordinary state, not a broken invariant.
         */
        tree.get(node.parent)?.children.push(slug);
      }
      return Object.fromEntries(
        [...tree.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      );
    },
  };
}

export default termTreeAggregate;
