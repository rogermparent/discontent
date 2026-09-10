import { revalidateTag } from "next/cache";
import type { AggregateUpdateResult } from "../types";
import { aggregateTags } from "./tags";

/**
 * Expire matching entries now, rather than serving them stale while they
 * refresh in the background. See `pagination/next/revalidate.ts` for why the
 * second argument is required and why a named profile is wrong here.
 */
const EXPIRE_NOW = { expire: 0 } as const;

/**
 * Fire a tag for each aggregate whose value actually moved.
 *
 * The `continue` below is the entire point of the kind. Every write touches
 * the corpus an aggregate is folded from, so a pass that fired unconditionally
 * would invalidate the tag cloud on every keystroke-sized edit — which is what
 * `revalidatePath("/")` already did, at no less cost. Reporting `changed:
 * false` and firing nothing is the improvement.
 *
 * @example
 * ```ts
 * const { aggregates } = await createContent({ ... });
 * revalidateAggregateResults("notes", aggregates);
 * ```
 */
export function revalidateAggregateResults(
  contentType: string,
  results: AggregateUpdateResult[],
): void {
  for (const result of results) {
    if (!result.changed) continue;
    revalidateTag(aggregateTags(contentType, result.name).value, EXPIRE_NOW);
  }
}

export default revalidateAggregateResults;
