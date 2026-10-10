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
const tags: string[][] = [];

vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: () => unknown,
    keyParts: string[],
    options?: { tags?: string[] },
  ) => {
    keys.push(keyParts);
    tags.push(options?.tags ?? []);
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

/*
 * A keyed aggregate (32e) caches the whole value and each key it is asked for
 * separately, so one key's write expires that key's readers and the whole
 * value — and no other key's.
 */
describe("a keyed aggregate's cached reads", () => {
  function keyedReads() {
    keys.length = 0;
    tags.length = 0;
    const reads = createCachedAggregateRead({
      config,
      aggregateConfig: { name: "by-tag", version: "2.1", keyed: true } as never,
      contentDirectory: "/content",
    });
    void reads.readKey("cookies").catch(() => undefined);
    void reads.readKey("cake").catch(() => undefined);
    return { keys: [...keys], tags: [...tags] };
  }

  /*
   * The 32e review's B2: no module-scope map of wrappers, because the key
   * comes from the URL. A wrapper is built per call (inside `React.cache`,
   * which dedupes within a request and is a pass-through outside one, as
   * here) and kept nowhere, so a second read of the same key builds a second
   * wrapper instead of finding a retained one.
   */
  it("retains no wrapper between reads", () => {
    const reads = createCachedAggregateRead({
      config,
      aggregateConfig: { name: "by-tag", version: "2.1", keyed: true } as never,
      contentDirectory: "/content",
    });
    keys.length = 0;
    void reads.readKey("cookies").catch(() => undefined);
    void reads.readKey("cookies").catch(() => undefined);
    expect(keys).toHaveLength(2);
  });

  it("builds a wrapper per key read, keyed by version and key", () => {
    const built = keyedReads();
    expect(built.keys).toEqual([
      ["aggregate", "notes", "by-tag", "2.1", "/content"],
      ["aggregate", "notes", "by-tag", "2.1", "/content", "key", "cookies"],
      ["aggregate", "notes", "by-tag", "2.1", "/content", "key", "cake"],
    ]);
  });

  it("tags the whole value with `whole` and each key with its own", () => {
    expect(keyedReads().tags).toEqual([
      ["aggregate:notes:by-tag", "aggregate:notes:by-tag:whole"],
      ["aggregate:notes:by-tag", "aggregate:notes:by-tag:key:cookies"],
      ["aggregate:notes:by-tag", "aggregate:notes:by-tag:key:cake"],
    ]);
  });

  it("leaves an ordinary aggregate with its one tag", () => {
    tags.length = 0;
    createCachedAggregateRead({
      config,
      aggregateConfig: { name: "tags", version: "2.1" } as never,
      contentDirectory: "/content",
    });
    expect(tags).toEqual([["aggregate:notes:tags"]]);
  });
});
