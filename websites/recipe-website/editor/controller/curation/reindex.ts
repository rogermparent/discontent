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
 *
 * The all-types pass is also the one that writes the index stamp (27b): it is
 * the only rebuild that leaves *every* index describing the tree, so it is the
 * only one entitled to say which commit that tree was. HEAD is read before the
 * loop, so a commit that lands mid-rebuild is not claimed as indexed. A
 * one-type rebuild leaves the stamp alone.
 */
import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { readHead, writeIndexedHead } from "@discontent/cms/git/indexStamp";
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

  const head = await readHead(ctx.contentDirectory);
  for (const config of recipeContentTypes) {
    await rebuildIndex({
      config,
      contentDirectory: ctx.contentDirectory,
      cascadeDependents: false,
    });
  }
  await writeIndexedHead(ctx.contentDirectory, head);
  return { rebuilt: recipeContentTypes.map((config) => config.contentType) };
}
