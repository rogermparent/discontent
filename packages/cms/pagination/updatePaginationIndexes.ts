import type { Key } from "lmdb";
import { updatePaginationIndex } from "./updatePaginationIndex";
import type {
  PaginationIndexConfig,
  PaginationUpdateResult,
  UpdatePaginationIndexesOptions,
} from "./types";

/**
 * Run phase 2 for every index declared on a content type.
 *
 * Each index lives in its own environment, so there is no writer contention
 * and nothing to serialize: the real parallelism in this design is across
 * indexes and across content types, not within a single walk.
 *
 * @example
 * ```ts
 * const results = await updatePaginationIndexes({ config: recipeConfig });
 * ```
 */
export async function updatePaginationIndexes<TIndexValue, TKey extends Key>(
  options: UpdatePaginationIndexesOptions<TIndexValue, TKey>,
): Promise<PaginationUpdateResult[]> {
  const { config, contentDirectory, paginationConfigs, force } = options;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indexes: PaginationIndexConfig<any, any, any>[] =
    paginationConfigs ?? config.paginationIndexes ?? [];
  if (indexes.length === 0) return [];

  return Promise.all(
    indexes.map((paginationConfig) =>
      updatePaginationIndex({
        config,
        paginationConfig,
        contentDirectory,
        force,
      }),
    ),
  );
}

export default updatePaginationIndexes;
