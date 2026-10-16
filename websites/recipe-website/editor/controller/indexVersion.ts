/**
 * This site's index version (epic 39, D1): `computeIndexVersion` over the
 * registry, once per process — the configs cannot change under a running
 * process, and a deploy or `pnpm workstation update` starts a new one.
 *
 * A full rebuild writes it beside the HEAD stamp (`curation/reindex.ts`);
 * `instance/start.ts` compares it at start and rebuilds once when it moved;
 * `gitStatus` and the stale-index banner report it.
 */
import { computeIndexVersion } from "@discontent/cms/git/indexStamp";
import { recipeContentTypes } from "./contentTypes";

let memo: string | undefined;

export function currentIndexVersion(): string {
  memo ??= computeIndexVersion(recipeContentTypes);
  return memo;
}
