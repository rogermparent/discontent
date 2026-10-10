import type { Key, RootDatabase } from "lmdb";
import { dirname, resolve } from "path";
import type { ContentTypeConfig } from "../content/types";
import { getContentDirectory } from "../fs/getContentDirectory";
import { openCachedEnvironment } from "../lmdb/environmentCache";
import { hashValue } from "../pagination/hash";
import type { AggregateConfig, AggregateRecord } from "./types";

/**
 * The one key an aggregate environment holds.
 *
 * A tuple rather than a bare string so the keyspace can grow the way the
 * pagination one did — a second prefix is additive, a change of key type is
 * not.
 */
export const RECORD_KEY: Key[] = [0];

/*
 * A keyed aggregate's other two prefixes (32e). That second prefix is the
 * growth the tuple key above was chosen for.
 *
 *   [0]         the header — an `AggregateRecord<KeyedAggregateHeader>`
 *   [1, key]    one key's value, bare
 *   [2]         `Record<key, hash>`, read only by the writer to diff
 *
 * The hashes sit apart from the header so a one-key read pays for a header of
 * a few dozen bytes rather than for a line per key, and apart from the values
 * so the writer's diff never decodes a value it is not rewriting.
 */
export const KEYED_ENTRY_PREFIX = 1;
export const KEYED_HASHES_KEY: Key[] = [2];

export function keyedEntryKey(key: string): Key[] {
  return [KEYED_ENTRY_PREFIX, key];
}

/**
 * Where an aggregate lives: `<type>/aggregates/<name>/`, a sibling of the
 * `<type>/pagination/<name>/` convention.
 *
 * Its own environment per aggregate, for the reasons `getPaginationDirectory`
 * gives — no root/named-database mixing, no migration of existing `*.mdb`, and
 * independent writers that never contend.
 */
export function getAggregateDirectory(
  config: Pick<ContentTypeConfig, "indexDirectory">,
  aggregateConfig: Pick<AggregateConfig, "name">,
  contentDirectory?: string,
): string {
  const baseDir = contentDirectory || getContentDirectory();
  return resolve(
    baseDir,
    dirname(config.indexDirectory),
    "aggregates",
    aggregateConfig.name,
  );
}

export function getAggregateDatabase<TValue = unknown>(
  config: Pick<ContentTypeConfig, "indexDirectory">,
  aggregateConfig: Pick<AggregateConfig, "name">,
  contentDirectory?: string,
): RootDatabase<TValue, Key[]> {
  return openCachedEnvironment<TValue>(
    getAggregateDirectory(config, aggregateConfig, contentDirectory),
  );
}

/**
 * Covers the identity of the aggregate and the declared `version` of what its
 * fold produces — so editing a fold and bumping the version cannot leave a
 * stale value claiming to be current.
 *
 * Not the source text of those functions, for the reason `computeSpecHash`
 * gives: `fn.toString()` differs between a minified production build and a dev
 * server, so it identifies the build rather than the config (F16).
 *
 * `keyed` is in it too (32e), because it decides the stored layout: a header
 * read as a whole value, or a whole value read as a header, is a wrong answer
 * rather than a stale one. `hashValue` drops an `undefined` field, so an
 * aggregate that is not keyed hashes exactly as it did before the field
 * existed.
 */
export function computeAggregateSpecHash(
  aggregateConfig: AggregateConfig<never, Key, never, never>,
): string {
  const { name, version, keyed } = aggregateConfig;
  return hashValue({ name, version, keyed });
}

export function readAggregateRecord<TValue = unknown>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: RootDatabase<any, Key[]>,
): AggregateRecord<TValue> | undefined {
  return db.get(RECORD_KEY) as AggregateRecord<TValue> | undefined;
}

/** A keyed aggregate's per-key hashes, as the last pass stored them. */
export function readKeyedHashes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: RootDatabase<any, Key[]>,
): Record<string, string> | undefined {
  return db.get(KEYED_HASHES_KEY) as Record<string, string> | undefined;
}

/** One key's stored value, or `undefined` when the aggregate has no such key. */
export function readKeyedEntry<TEntry = unknown>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: RootDatabase<any, Key[]>,
  key: string,
): TEntry | undefined {
  return db.get(keyedEntryKey(key)) as TEntry | undefined;
}

/**
 * Every key's value, reassembled into the object `finalize` produced — in key
 * order, which for the slugs every keyed aggregate here uses is the sorted
 * order `finalize` inserted them in.
 */
export function readKeyedEntries<TEntry = unknown>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: RootDatabase<any, Key[]>,
): Record<string, TEntry> {
  const entries: Record<string, TEntry> = {};
  for (const { key, value } of db.getRange({
    start: [KEYED_ENTRY_PREFIX],
    end: [KEYED_ENTRY_PREFIX + 1],
  })) {
    entries[String((key as Key[])[1])] = value as TEntry;
  }
  return entries;
}
