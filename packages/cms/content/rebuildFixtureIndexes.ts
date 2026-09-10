/**
 * Bring every Playwright content fixture's derived indexes into step.
 *
 * A fixture is a content directory captured on disk, LMDB files and all, and a
 * suite restores one by copying it over the live content directory. Nothing
 * about a read self-heals what it finds — by design, since a read may be
 * happening inside a static export or against a read-only mount — so a fixture
 * generated before a content type declared an index serves an empty list with
 * no error, and one generated before an index value grew a field serves the old
 * shape.
 *
 * Adding an index to a content type, adding an aggregate, or changing what its
 * index value carries therefore means regenerating every existing fixture. Run
 * this after any of them; regenerating fixtures through the UI would work too,
 * but it rewrites content files that were fine.
 *
 * Generic over a site's registry (F21c). Each site's script was bespoke — recipe
 * had a hand-written two-branch walk, and portfolio had none at all, so the
 * moment `projects` declares an index every portfolio fixture would have served
 * an empty list with nothing going red. That is what made §11.2's adoption
 * unsafe, and it is the last of F21's three hand-maintained copies.
 */
import { pathExists, readdir } from "fs-extra";
import { resolve } from "path";
import { rebuildIndex } from "./rebuildIndex";
import type { AnyContentTypeConfig } from "./types";

export interface RebuildFixtureIndexesOptions {
  /** Every content type the site owns — its `contentTypes.ts` registry. */
  configs: readonly AnyContentTypeConfig[];
  /** Directory whose immediate subdirectories are each a content fixture. */
  fixturesDir: string;
  /** Where to report progress. Defaults to `console.log`. */
  log?: (message: string) => void;
}

/**
 * Bring one content type's derived state in one fixture up to date.
 *
 * Every type goes through `rebuildIndex`: it re-derives the content index from
 * the content files, then forces `updatePaginationIndexes` and runs
 * `updateAggregates`, so one call covers all three derived kinds. Nothing here
 * can self-heal — the content index carries no spec hash, so a stale index
 * value is invisible to every reader and to every test — which makes
 * re-deriving unconditionally the only honest option.
 *
 * **This used to branch on `config.references`**, and re-derived the content
 * index only for types that borrow index-value fields (§6.1), on the reasoning
 * that everything else needed just its keyspace recomputed. That silently
 * excluded the case this file's own header promises to handle — "changing what
 * its index value carries" — because `updatePaginationIndexes` and
 * `updateAggregates` recompute *from the existing index values* and never call
 * `buildIndexValue`. F23 is what made it visible: the flattener that fills
 * `description` was fixed, and running this script repaired nothing, because
 * recipes declare no `references`.
 *
 * `cascadeDependents` stays off because the caller walks every config in the
 * registry anyway; letting each rebuild cascade would rebuild shared types once
 * per dependent, and a registry lists its types in dependency order.
 */
async function rebuildOne(
  config: AnyContentTypeConfig,
  contentDirectory: string,
  fixtureName: string,
  log: (message: string) => void,
): Promise<void> {
  /*
   * Absent from this fixture — a page-only fixture holds no recipes, and a
   * portfolio fixture may hold no projects.
   *
   * The guard is on the *index directory* and it is load-bearing, not an
   * optimisation: `getContentDatabase` creates what it opens, so indexing a
   * type a fixture does not have would leave a new LMDB environment inside the
   * captured directory. That is the D2a trap (§10) in the one place where the
   * side effect gets committed to the repository rather than merely observed.
   */
  if (!(await pathExists(resolve(contentDirectory, config.indexDirectory)))) {
    log(`${fixtureName}: no ${config.contentType} index, skipped`);
    return;
  }

  await rebuildIndex({
    config,
    contentDirectory,
    cascadeDependents: false,
  });
  log(`${fixtureName}: ${config.contentType} index rebuilt`);
}

/**
 * Every fixture, every content type.
 *
 * @example
 * ```ts
 * await rebuildFixtureIndexes({
 *   configs: recipeContentTypes,
 *   fixturesDir: resolve(__dirname, "..", "playwright", "fixtures", "test-content"),
 * });
 * ```
 */
export async function rebuildFixtureIndexes({
  configs,
  fixturesDir,
  log = console.log,
}: RebuildFixtureIndexesOptions): Promise<void> {
  const entries = await readdir(fixturesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const contentDirectory = resolve(fixturesDir, entry.name);

    /*
     * Sequential across configs, because a type that borrows fields reads the
     * type it borrows from. Running the registry in order means a referenced
     * type is already current when its dependent resolves against it — which is
     * why a registry lists its types in dependency order, referenced first.
     */
    for (const config of configs) {
      await rebuildOne(config, contentDirectory, entry.name, log);
    }
  }
}

export default rebuildFixtureIndexes;
