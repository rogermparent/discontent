/**
 * What one roundup-picker call's answer means for each pick (35r) — the
 * server half of `roundupPicker.ts`, run by the import action so the client
 * gets outcomes, not the seat's raw report. Separate because it matches
 * dropped sites by `siteKey`, whose module (`roundupPage.ts`) parses HTML
 * and does not belong in a client bundle.
 */
import { siteKey } from "recipe-website-common/util/roundupPage";
import type { ImportListResult } from "./curation/importList";
import type { RoundupOutcome, RoundupPick } from "./roundupPicker";

/**
 * One call's answer, per pick. A pick the seat handed back in `remaining`
 * goes back on the queue — unless its site was dropped (two 403s: an hour,
 * process-wide), which would hand it back forever, so it is reported instead.
 * A call that made no progress at all (everything back, nothing attempted)
 * is `stalled`: the caller stops rather than ask again.
 */
export function settleChunk(
  chunk: readonly RoundupPick[],
  result: Pick<ImportListResult, "results" | "remaining" | "dropped">,
): { outcomes: RoundupOutcome[]; requeue: RoundupPick[]; stalled: boolean } {
  const byUrl = new Map(chunk.map((pick) => [pick.url, pick]));
  const outcomes: RoundupOutcome[] = result.results.map((entry) => {
    const pick = byUrl.get(entry.url);
    const message =
      entry.error?.message ??
      (entry.warnings?.length ? entry.warnings.join(" ") : undefined);
    return {
      n: pick?.n ?? entry.n,
      url: entry.url,
      name: pick?.name ?? entry.name,
      status: entry.status,
      ...(entry.slug ? { slug: entry.slug } : {}),
      ...(message ? { message } : {}),
    };
  });
  const dropped = new Map(
    (result.dropped ?? []).map((entry) => [entry.site, entry.reason]),
  );
  const requeue: RoundupPick[] = [];
  for (const left of result.remaining) {
    const pick = byUrl.get(left.url) ?? { ...left, name: left.url };
    const reason = dropped.get(siteKey(left.url) ?? "");
    if (reason) {
      outcomes.push({
        ...pick,
        status: "dropped",
        message: `Its site refused twice and is left alone for an hour: ${reason}`,
      });
    } else {
      requeue.push(pick);
    }
  }
  const stalled = result.results.length === 0 && requeue.length > 0;
  if (stalled) {
    return {
      outcomes: requeue.map((pick) => ({
        ...pick,
        status: "not-attempted",
        message: "The import made no progress on it; try again later.",
      })),
      requeue: [],
      stalled,
    };
  }
  return { outcomes, requeue, stalled };
}
