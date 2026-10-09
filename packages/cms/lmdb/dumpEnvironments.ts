import { createHash } from "node:crypto";
import { readdir } from "fs-extra";
import { join, relative, sep } from "node:path";
import { openCachedEnvironment } from "./environmentCache";

/**
 * A canonical, logical dump of every LMDB environment under a content
 * directory — what "these two rebuilds produced the same indexes" is checked
 * against (epic 29, D3).
 *
 * Logical, never bytes: two `data.mdb` files holding the same entries differ in
 * page layout, free lists and msgpackr's shared-structure table, all of which
 * depend on the order the writes happened in. So every environment is read
 * back through LMDB, in key order, and every value is serialised with its
 * object keys sorted.
 *
 * Two things are left out because they are not content:
 *
 *  - symbol keys — msgpackr's shared-structure record lives under one, and its
 *    contents depend on write order;
 *  - `updatedAt` at the top level of a pagination or aggregate value — META and
 *    every aggregate record stamp the wall clock when they are written.
 *
 * `.git` and `node_modules` are not walked. Opening goes through the
 * environment cache, so a test that dumps a tmpdir closes it with
 * `closeCachedEnvironments` as it would after any other read.
 */
export interface EnvironmentDump {
  /** The environment's directory, relative to the content directory. */
  environment: string;
  entries: number;
}

export interface IndexDump {
  /** One JSON line per entry: `{"env","key","value"}`, canonical. */
  lines: string[];
  environments: EnvironmentDump[];
  /** sha256 of `lines.join("\n")`. */
  sha256: string;
}

const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"]);

/** Every directory under `root` holding a `data.mdb`, sorted. */
export async function findEnvironments(root: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (directory: string) => {
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === "data.mdb")) {
      found.push(directory);
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      await walk(join(directory, entry.name));
    }
  };
  await walk(root);
  return found.sort();
}

function canonical(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (typeof value === "symbol") return { $symbol: value.description };
  if (typeof value !== "object") return value;
  if (value instanceof Uint8Array) {
    return { $bytes: Buffer.from(value).toString("base64") };
  }
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Map) {
    return {
      $map: [...value.entries()]
        .map(([key, entry]) => [canonical(key), canonical(entry)])
        .sort((a, b) =>
          JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0])),
        ),
    };
  }
  if (value instanceof Set) {
    return {
      $set: [...value]
        .map(canonical)
        .map((entry) => JSON.stringify(entry))
        .sort()
        .map((entry) => JSON.parse(entry)),
    };
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry === undefined) continue;
    sorted[key] = canonical(entry);
  }
  return sorted;
}

/** Pagination META and aggregate records carry a wall-clock `updatedAt`. */
function isDerivedEnvironment(environment: string): boolean {
  const segments = environment.split(sep);
  return segments.includes("pagination") || segments.includes("aggregates");
}

function withoutUpdatedAt(value: unknown): unknown {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("updatedAt" in value)
  ) {
    return value;
  }
  const { updatedAt, ...rest } = value as Record<string, unknown>;
  return rest;
}

export async function dumpEnvironments(
  contentDirectory: string,
): Promise<IndexDump> {
  const lines: string[] = [];
  const environments: EnvironmentDump[] = [];
  for (const path of await findEnvironments(contentDirectory)) {
    const environment = relative(contentDirectory, path);
    const derived = isDerivedEnvironment(environment);
    const db = openCachedEnvironment(path);
    let entries = 0;
    for (const { key, value } of db.getRange({})) {
      if (typeof key === "symbol") continue;
      lines.push(
        JSON.stringify({
          env: environment,
          key: canonical(key),
          value: canonical(derived ? withoutUpdatedAt(value) : value),
        }),
      );
      entries += 1;
    }
    environments.push({ environment, entries });
  }
  const sha256 = createHash("sha256").update(lines.join("\n")).digest("hex");
  return { lines, environments, sha256 };
}
