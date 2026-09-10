/**
 * Rebuild an index from the data files — the CLI's half of Settings →
 * Maintenance.
 *
 * `rebuildAllIndexes()` in `controller/actions/index.ts` is the same loop with
 * a `revalidateDerivedState` at the end; that half cannot come along, because
 * invalidating a Next cache from outside the Next process is not a thing. So a
 * CLI write leaves a *running* editor serving what it had — which is what the
 * local backend's stderr hint says, and what 22d's `--notify` closes.
 *
 * `cascadeDependents: false` for the all-types pass, because the loop already
 * covers every type and the default would rebuild featured recipes twice.
 */
import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { recipeContentTypes } from "../contentTypes";
import type { CurationContext } from "./context";
import { NotFoundError } from "./errors";

export interface ReindexResult {
  rebuilt: string[];
}

export async function reindex(
  ctx: CurationContext,
  contentType?: string,
): Promise<ReindexResult> {
  if (contentType) {
    const config = recipeContentTypes.find(
      (candidate) => candidate.contentType === contentType,
    );
    if (!config) {
      throw new NotFoundError(
        `Unknown content type "${contentType}". Known types: ${recipeContentTypes
          .map((candidate) => candidate.contentType)
          .join(", ")}`,
      );
    }
    /* One type named: let the cascade reach whatever borrows from it. */
    await rebuildIndex({ config, contentDirectory: ctx.contentDirectory });
    return { rebuilt: [config.contentType] };
  }

  for (const config of recipeContentTypes) {
    await rebuildIndex({
      config,
      contentDirectory: ctx.contentDirectory,
      cascadeDependents: false,
    });
  }
  return { rebuilt: recipeContentTypes.map((config) => config.contentType) };
}
