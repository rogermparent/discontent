/**
 * Every recipe a meal plan cooks, through its nested sub-groups (epic 35,
 * 35b) — what a shopping list adds up.
 *
 * `resolveGroupItems` reads one level, which is what a group page renders.
 * A shopping list needs the whole tree, and two rules a page never meets:
 *
 * - **An ancestor path, not a visited set.** A sub-group listed twice is two
 *   lots of cooking and counts twice; only a group that contains itself (a
 *   cycle, which the write seats refuse but a hand edit can make) is stopped,
 *   skipped and reported.
 * - **Scale multiplies down the path.** A recipe row's `scale` (epic 32) times
 *   the scale of every row that led to it, as exact fractions.
 *
 * Pure: `readGroup` is injected — `groupItems.read` on the server, a fixture
 * in a test — and the walk does nothing else that touches the world.
 */
import Fraction from "fraction.js";
import type { Group } from "../controller/types";
import { parseScale } from "./scale";

/** How deep a plan may nest, counting the root as 1. */
export const MAX_GROUP_DEPTH = 32;

/** One recipe row, reached through the tree. */
export interface WalkedRecipe {
  /** The recipe's slug; not checked here — a dangling one is the caller's. */
  slug: string;
  /**
   * How much of it to cook: the row's own `scale` times every enclosing row's,
   * each `parseScale(item.scale) ?? 1`. A malformed scale reads as 1.
   */
  scale: Fraction;
  /** Group slugs from the root down to the group that lists the row; `[root]` at the top. */
  via: string[];
  /** The row's own label ("Mon · Dinner"), when it has one. */
  label?: string;
}

/**
 * What a walk found, in plan order (depth first, each group's items in its
 * own order, as the plan reads).
 */
export interface GroupWalk {
  recipes: WalkedRecipe[];
  /** Slugs of groups named but not found (the root included), once each. */
  missing: string[];
  /**
   * Each cycle met, as the path that closes it: `["a", "b", "a"]` is `a`
   * listing `b` listing `a`. The repeated sub-group is skipped there.
   */
  cycles: string[][];
  /**
   * Paths cut at `MAX_GROUP_DEPTH`: the path down to, and ending with, the
   * group that would have been one level too deep. Not read.
   */
  tooDeep: string[][];
}

/** Reads a group by slug; `null` when there is none. */
export type ReadGroup = (slug: string) => Promise<Group | null>;

const ONE = new Fraction(1);

/**
 * Walk `root` and its nested sub-groups, yielding every recipe row with its
 * effective scale and the path it came through. Each group is read once per
 * walk, however often it appears.
 */
export async function walkGroupRecipes(
  root: string,
  readGroup: ReadGroup,
): Promise<GroupWalk> {
  const reads = new Map<string, Promise<Group | null>>();
  const read = (slug: string) => {
    let pending = reads.get(slug);
    if (!pending) {
      pending = readGroup(slug);
      reads.set(slug, pending);
    }
    return pending;
  };

  const walk: GroupWalk = { recipes: [], missing: [], cycles: [], tooDeep: [] };
  const missing = new Set<string>();

  async function visit(slug: string, path: string[], scale: Fraction) {
    const group = await read(slug);
    if (!group) {
      if (!missing.has(slug)) {
        missing.add(slug);
        walk.missing.push(slug);
      }
      return;
    }
    const via = [...path, slug];
    for (const item of group.items ?? []) {
      const itemScale = scale.mul(parseScale(item.scale) ?? ONE);
      if (item.group !== undefined) {
        if (via.includes(item.group)) {
          walk.cycles.push([...via, item.group]);
        } else if (via.length >= MAX_GROUP_DEPTH) {
          walk.tooDeep.push([...via, item.group]);
        } else {
          await visit(item.group, via, itemScale);
        }
      } else if (item.recipe) {
        walk.recipes.push({
          slug: item.recipe,
          scale: itemScale,
          via: [...via],
          ...(item.label ? { label: item.label } : {}),
        });
      }
    }
  }

  await visit(root, [], ONE);
  return walk;
}
