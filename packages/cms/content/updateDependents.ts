import { pathExists, readdir } from "fs-extra";
import type { Key } from "lmdb";
import { hashValue } from "../pagination/hash";
import { syncPaginationItems } from "../pagination/syncContentItems";
import type { SyncPaginationItem } from "../pagination/types";
import { getContentDatabase, removeFromIndex, writeToIndex } from "./database";
import {
  getDataDirectory,
  readContentFromFilesystem,
  writeContentToFilesystem,
} from "./filesystem";
import {
  borrowedFieldsOf,
  resolveReferences,
  type ReferenceResolver,
} from "./references";
import type {
  ContentTypeConfig,
  DependentWriteResult,
  ReferenceSpec,
} from "./types";
import { extractSlugFromKey } from "./updateReferences";

/** A loosely-typed dependent config: this pass never knows the real generics. */
type DependentConfig = ContentTypeConfig<
  Record<string, unknown>,
  Record<string, unknown>,
  Key
>;

export interface UpdateDependentsOptions {
  /** The config of the type that was just written. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: ContentTypeConfig<any, any, any>;
  contentDirectory: string;
  /** The written item's slug, after any rename. */
  slug: string;
  /** The slug it had before, when this write renamed it. */
  previousSlug?: string;
  /** Its data before this write. Absent for a create. */
  previousData?: unknown;
  /** Its data after this write. Absent for a delete. */
  data?: unknown;
  /** The write operation's resolver — see `createReferenceResolver`. */
  resolver: ReferenceResolver;
}

export interface UpdateDependentsResult {
  dependents: DependentWriteResult[];
  /** Data files this pass rewrote, relative to the content directory. */
  touchedPaths: string[];
}

const NOTHING: UpdateDependentsResult = { dependents: [], touchedPaths: [] };

/** One dependent found, with the index entry it currently has if we saw it. */
interface Candidate {
  slug: string;
  key?: Key;
  value?: Record<string, unknown>;
}

/**
 * Bring every content item that borrows from the just-written item back in
 * step, and report the pages that moved.
 *
 * This replaces the rename-triggered full pagination rebuild of the
 * referencing type (F15). Both halves of that trigger were wrong at once: it
 * fired for the wrong reason — any rename, whether or not anything rendered
 * changed — and missed the right one, a borrowed field changing without a
 * rename. A borrowed-field declaration fixes both, because it names exactly
 * which fields a dependent renders.
 *
 * **A delete does not rewrite dependents' data files.** The reference field
 * keeps pointing at the dead slug; only the borrowed values leave the index.
 * Rewriting it would destroy the only record of what the item pointed at, and
 * a content directory is a git repository whose history is the point.
 *
 * @example
 * ```ts
 * const { dependents, touchedPaths } = await updateDependents({
 *   config: recipeConfig,
 *   contentDirectory,
 *   slug,
 *   previousSlug: willRename ? currentSlug : undefined,
 *   previousData,
 *   data,
 *   resolver,
 * });
 * ```
 */
export async function updateDependents(
  options: UpdateDependentsOptions,
): Promise<UpdateDependentsResult> {
  const {
    config,
    contentDirectory,
    slug,
    previousSlug,
    previousData,
    data,
    resolver,
  } = options;

  const specs = config.referencedBy;
  if (!specs || specs.length === 0) return NOTHING;

  /*
   * The gate. It opens nothing and reads nothing when neither half holds, and
   * neither half can hold for a content type whose dependents borrow nothing —
   * which is every production type in this repo today. That is D1's
   * behavioural-no-op guarantee, the same property `paginationIndexes` gave P2.
   *
   * A rename is not special-cased so much as included: the slug is a borrowed
   * value like any other, it is simply the one stored in the dependent's own
   * data file rather than copied out of ours.
   */
  const renamed = previousSlug !== undefined && previousSlug !== slug;
  const before = previousData as Record<string, unknown> | undefined;
  const after = data as Record<string, unknown> | undefined;
  const borrowedChanged = borrowedFieldsOf(config).some(
    (field) => hashValue(before?.[field]) !== hashValue(after?.[field]),
  );
  if (!renamed && !borrowedChanged) return NOTHING;

  /* Dependents still point at whatever slug the item had before this write. */
  const targetSlug = previousSlug ?? slug;

  const dependents: DependentWriteResult[] = [];
  const touchedPaths: string[] = [];

  for (const spec of specs) {
    const result = await updateDependentsForSpec({
      spec,
      targetSlug,
      newSlug: slug,
      renamed,
      contentDirectory,
      resolver,
    });
    touchedPaths.push(...result.touchedPaths);
    if (result.dependent) dependents.push(result.dependent);
  }

  return { dependents, touchedPaths };
}

async function updateDependentsForSpec(options: {
  spec: ReferenceSpec;
  targetSlug: string;
  newSlug: string;
  renamed: boolean;
  contentDirectory: string;
  resolver: ReferenceResolver;
}): Promise<{ dependent?: DependentWriteResult; touchedPaths: string[] }> {
  const { spec, targetSlug, newSlug, renamed, contentDirectory, resolver } =
    options;
  const dependentConfig = spec.config() as DependentConfig;
  const { indexField, dataField } = spec;

  /*
   * `indexField` alone means "the same field name in both", which is how every
   * spec in this repo is written.
   */
  const dataFieldName = dataField || indexField;
  if (!dataFieldName) {
    console.warn(
      `Reference spec for ${dependentConfig.contentType} declares neither indexField nor dataField; skipping`,
    );
    return { touchedPaths: [] };
  }

  /*
   * No data directory means no items of this type, so nothing can borrow from
   * the write that got us here.
   *
   * Checked *before* `getContentDatabase`, which is the whole point: opening an
   * LMDB environment creates it. Without this, every write of a referenced type
   * materialized an empty index directory for each of its dependent types, in
   * content directories that have never held one of those items — new derived
   * state appearing in a git-tracked content repository as a side effect of an
   * unrelated write. Found by `git.spec.ts`'s remote-sync tests, which went red
   * the moment recipes gained a dependent that borrows: an untracked
   * `featured-recipes/` left the repo dirty and the Git UI in its
   * uncommitted-changes state.
   *
   * It is also the cheap half of F18. A corpus with no featured recipes now
   * costs a `stat` per recipe write instead of an environment open and a scan.
   */
  if (!(await pathExists(getDataDirectory(dependentConfig, contentDirectory)))) {
    return { touchedPaths: [] };
  }

  const db = getContentDatabase<Record<string, unknown>, Key>(
    dependentConfig,
    contentDirectory,
  );

  const items: SyncPaginationItem<Record<string, unknown>, Key>[] = [];
  const updatedSlugs: string[] = [];
  const touchedPaths: string[] = [];

  const candidates = indexField
    ? await findViaIndex(db, indexField, targetSlug)
    : await findViaDataFiles(
        dependentConfig,
        dataFieldName,
        targetSlug,
        contentDirectory,
      );

  for (const candidate of candidates) {
    const { slug } = candidate;
    try {
      /*
       * Read once, write at most once. Sequencing a slug rewrite pass and a
       * borrowed-value pass would read and write this file twice, and the
       * two would have to agree about the order they ran in.
       */
      const data = await readContentFromFilesystem<Record<string, unknown>>(
        dependentConfig,
        slug,
        contentDirectory,
      );

      /*
       * The key as the index actually holds it, when we found it there —
       * which is what has to be removed if the entry moves, even if the data
       * file has drifted from it.
       */
      const oldKey = candidate.key ?? dependentConfig.buildIndexKey(slug, data);
      const oldValue = candidate.value ?? db.get(oldKey);

      if (renamed) {
        data[dataFieldName] = newSlug;
        touchedPaths.push(
          await writeContentToFilesystem(
            dependentConfig,
            slug,
            data,
            contentDirectory,
          ),
        );
      }

      const refs = await resolveReferences({
        config: dependentConfig,
        data,
        resolver,
      });
      const newKey = dependentConfig.buildIndexKey(slug, data);
      const newValue = dependentConfig.buildIndexValue(data, refs);

      const keyMoved = JSON.stringify(newKey) !== JSON.stringify(oldKey);
      const indexChanged =
        keyMoved || hashValue(newValue) !== hashValue(oldValue);

      if (indexChanged) {
        /*
         * Removing the old key when it moved is not optional: without it the
         * dependent sits in the index twice, which is a latent orphan the
         * rename path had until now.
         */
        if (keyMoved) await removeFromIndex(db, oldKey);
        await writeToIndex(db, newKey, newValue);
        items.push({ id: slug, entry: { key: newKey, value: newValue } });
      }

      if (indexChanged || renamed) updatedSlugs.push(slug);
    } catch (error) {
      /*
       * One unreadable dependent must not fail the write that triggered
       * this. Said out loud rather than swallowed.
       */
      console.warn(
        `Failed to update dependent ${dependentConfig.contentType}/${slug}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (updatedSlugs.length === 0) return { touchedPaths };

  /*
   * Once, for all of them. K dependents cost one phase 2 — and one aggregate
   * walk — not K.
   */
  const { pagination, aggregates } = await syncPaginationItems({
    config: dependentConfig,
    contentDirectory,
    items,
  });

  return {
    dependent: {
      contentType: dependentConfig.contentType,
      pagination,
      aggregates,
      updatedSlugs,
    },
    touchedPaths,
  };
}

/**
 * The index scan. Loads the dependent index into memory, as the rename path
 * already did — §6.2's reverse-dependency keyspace is the release valve if a
 * corpus ever grows big enough for this to show up in a profile.
 */
async function findViaIndex(
  db: ReturnType<typeof getContentDatabase<Record<string, unknown>, Key>>,
  indexFieldName: string,
  targetSlug: string,
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  const entries = await db.getRange().asArray;

  for (const { key, value } of entries) {
    if (value?.[indexFieldName] !== targetSlug) continue;
    const slug = extractSlugFromKey(key);
    if (!slug) {
      console.warn(`Could not extract a slug from index key ${String(key)}`);
      continue;
    }
    candidates.push({ slug, key, value });
  }

  return candidates;
}

/**
 * The fallback, for a spec that declares only `dataField` and so has no field
 * in the index to scan. No config in this repo takes it; it exists so that
 * replacing the rename pass costs no reachable behaviour.
 */
async function findViaDataFiles(
  config: DependentConfig,
  dataFieldName: string,
  targetSlug: string,
  contentDirectory: string,
): Promise<Candidate[]> {
  let slugs: string[];
  try {
    slugs = await readdir(getDataDirectory(config, contentDirectory));
  } catch {
    /* No data directory means no dependents. */
    return [];
  }

  const candidates: Candidate[] = [];
  for (const slug of slugs) {
    try {
      const data = await readContentFromFilesystem<Record<string, unknown>>(
        config,
        slug,
        contentDirectory,
      );
      if (data?.[dataFieldName] === targetSlug) candidates.push({ slug });
    } catch {
      /* Unreadable items are not dependents we can do anything about. */
    }
  }
  return candidates;
}

export default updateDependents;
