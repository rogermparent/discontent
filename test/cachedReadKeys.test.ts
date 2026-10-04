// @vitest-environment node
//
// Next's data cache outlives `next build` (`.next/cache` is kept), so the
// `unstable_cache` key is the only thing standing between a production server
// and a value cached under an older shape. 24b moved the recipe `terms`
// aggregate from `string[]` to `{slug, label, count}[]` under the same name,
// and a checkout whose cache predated it crashed the homepage on
// `slugify(undefined)`. A version bump is the contract for a shape change;
// this pins that it is also a new cache key, for aggregates and pagination.

import { describe, expect, it, vi } from "vitest";

const keys: string[][] = [];

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown, keyParts: string[]) => {
    keys.push(keyParts);
    return fn;
  },
}));

import { createCachedAggregateRead } from "@discontent/cms/aggregates/next/cachedReads";
import { createCachedPaginationReads } from "@discontent/cms/pagination/next/cachedReads";

const config = { contentType: "notes" } as never;

function aggregateKey(version: string): string[] {
  keys.length = 0;
  createCachedAggregateRead({
    config,
    aggregateConfig: { name: "tags", version } as never,
    contentDirectory: "/content",
  });
  return keys[0];
}

function paginationKeys(version: string): string[][] {
  keys.length = 0;
  const reads = createCachedPaginationReads({
    config,
    paginationConfig: { name: "by-date", version } as never,
    contentDirectory: "/content",
  });
  // Page readers are built on first use.
  void reads.readPage(0).catch(() => undefined);
  return [...keys];
}

describe("cached-read keys carry the config version", () => {
  it("aggregate: a version bump is a different key", () => {
    const v1 = aggregateKey("1");
    const v2 = aggregateKey("2");
    expect(v1).toContain("1");
    expect(v2).toContain("2");
    expect(v1).not.toEqual(v2);
  });

  it("pagination: head, meta and page keys all move with the version", () => {
    const v1 = paginationKeys("1");
    const v2 = paginationKeys("2");
    expect(v1.length).toBeGreaterThanOrEqual(3);
    expect(v1).toHaveLength(v2.length);
    for (let i = 0; i < v1.length; i++) {
      expect(v1[i]).not.toEqual(v2[i]);
    }
  });
});
