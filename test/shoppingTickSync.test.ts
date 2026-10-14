// The `/shopping` page's tick sync (epic 35, D9): never lose a tick.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  serializePending,
  STORED_TICKS_MAX_AGE_MS,
} from "recipe-website-common/util/shoppingTickQueue";
import {
  TickSync,
  type TickSyncSnapshot,
} from "recipe-website-common/util/shoppingTickSync";

interface Call {
  body: { check: string[]; uncheck: string[] };
  keepalive: boolean;
  resolve(response: Response): void;
  reject(error: unknown): void;
}

/** A `fetch` whose answers the test hands out one at a time. */
function fakeFetch() {
  const calls: Call[] = [];
  const fetch = vi.fn(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        calls.push({
          body: JSON.parse(String(init?.body)),
          keepalive: Boolean(init?.keepalive),
          resolve,
          reject,
        });
      }),
  );
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const ok = (items: unknown[] = [], unknown?: string[]) =>
  new Response(JSON.stringify({ items, ...(unknown ? { unknown } : {}) }), {
    status: 200,
  });

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    read: () => value,
    write: (next: string) => {
      value = next;
    },
    clear: () => {
      value = null;
    },
    get value() {
      return value;
    },
  };
}

function setup(storage = memoryStorage(), now = () => 1_000_000) {
  const { fetch, calls } = fakeFetch();
  const snapshots: TickSyncSnapshot[] = [];
  const items: unknown[][] = [];
  const sync = new TickSync({
    patchUrl: "/api/shopping",
    fetch,
    storage,
    now,
    onItems: (next) => items.push(next),
    onChange: (snapshot) => snapshots.push(snapshot),
  });
  sync.attach();
  const last = () => snapshots.at(-1) ?? sync.snapshot();
  return { sync, calls, storage, items, last };
}

/** Let resolved promises run their continuations. */
const settled = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("TickSync", () => {
  it("batches ticks into one PATCH after the quiet spell", async () => {
    const { sync, calls, last } = setup();
    sync.tick(["a"], true);
    await vi.advanceTimersByTimeAsync(1000);
    sync.tick(["b"], true);
    sync.tick(["a"], false);
    await vi.advanceTimersByTimeAsync(1499);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ check: ["b"], uncheck: ["a"] });
    calls[0].resolve(ok());
    await settled();
    expect(last()).toMatchObject({ status: "idle" });
    expect(last().pending.size).toBe(0);
  });

  it("sends what is pending, with keepalive, when the page goes away", async () => {
    const { sync, calls, storage } = setup();
    sync.tick(["a"], true);
    expect(storage.value).not.toBeNull();
    /* A client-side navigation before the 1.5 s were up. */
    sync.detach();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      keepalive: true,
      body: { check: ["a"], uncheck: [] },
    });
    /* The request is on its way: no stale copy left to replay later. */
    expect(storage.value).toBeNull();
    /* And no timer fires after the page has gone. */
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toHaveLength(1);
  });

  it("a keepalive flush during a request in flight sends the newer ticks at once", async () => {
    const { sync, calls } = setup();
    sync.tick(["a"], true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(calls).toHaveLength(1);
    /* While the first is in flight, a new tick, then the phone locks. */
    sync.tick(["b"], true);
    sync.flushNow();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      keepalive: true,
      body: { check: ["a", "b"], uncheck: [] },
    });
  });

  it("flush() waits for the flight, then sends what was ticked meanwhile", async () => {
    const { sync, calls, last } = setup();
    sync.tick(["a"], true);
    await vi.advanceTimersByTimeAsync(1500);
    sync.tick(["b"], false);
    const done = sync.flush();
    await settled();
    expect(calls).toHaveLength(1);
    calls[0].resolve(ok());
    await settled();
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toEqual({ check: [], uncheck: ["b"] });
    calls[1].resolve(ok());
    await done;
    expect(last().pending.size).toBe(0);
  });

  it("keeps a tick made during the flight when the response settles", async () => {
    const { sync, calls, last } = setup();
    sync.tick(["a"], true);
    await vi.advanceTimersByTimeAsync(1500);
    sync.tick(["a"], false);
    calls[0].resolve(ok());
    await settled();
    expect([...last().pending]).toEqual([["a", false]]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(calls[1].body).toEqual({ check: [], uncheck: ["a"] });
  });

  it("retries a 503 with backoff and never drops the ticks", async () => {
    const { sync, calls, last } = setup();
    sync.tick(["a"], true);
    await vi.advanceTimersByTimeAsync(1500);
    calls[0].resolve(new Response("{}", { status: 503 }));
    await settled();
    expect(last().status).toBe("retrying");
    /* A tick while retrying keeps saying so, and does not reset the wait. */
    sync.tick(["b"], true);
    expect(last().status).toBe("retrying");
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    calls[1].reject(new TypeError("offline"));
    await settled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toHaveLength(3);
    expect(calls[2].body).toEqual({ check: ["a", "b"], uncheck: [] });
    calls[2].resolve(ok());
    await settled();
    expect(last()).toMatchObject({ status: "idle" });
  });

  it("reports a refusal, keeps the ticks, and sends again on the next tick", async () => {
    const { sync, calls, last } = setup();
    sync.tick(["a"], true);
    await vi.advanceTimersByTimeAsync(1500);
    calls[0].resolve(
      new Response(
        JSON.stringify({ error: { message: "Authentication required" } }),
        { status: 401 },
      ),
    );
    await settled();
    expect(last()).toMatchObject({
      status: "error",
      error: "Authentication required",
    });
    expect([...last().pending]).toEqual([["a", true]]);
    sync.tick(["b"], true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(calls).toHaveLength(2);
    expect(calls[1].body.check).toEqual(["a", "b"]);
  });

  it("picks up stored ticks and sends them; drops stale ones", async () => {
    const fresh = memoryStorage(
      serializePending(new Map([["a", true]]), 1_000_000 - 60_000),
    );
    const { calls } = setup(fresh);
    await vi.advanceTimersByTimeAsync(1500);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.check).toEqual(["a"]);

    const stale = memoryStorage(
      serializePending(
        new Map([["b", true]]),
        1_000_000 - STORED_TICKS_MAX_AGE_MS - 1,
      ),
    );
    const second = setup(stale);
    await vi.advanceTimersByTimeAsync(5000);
    expect(second.calls).toHaveLength(0);
    expect(stale.value).toBeNull();
  });

  it("forgets ticks for items that were cleared", () => {
    const { sync, last } = setup();
    sync.tick(["a", "b"], true);
    sync.forget(["a"]);
    expect([...last().pending]).toEqual([["b", true]]);
  });

  it("drops ids the server no longer knows", async () => {
    const { sync, calls, last } = setup();
    sync.tick(["gone"], true);
    await vi.advanceTimersByTimeAsync(1500);
    calls[0].resolve(ok([], ["gone"]));
    await settled();
    expect(last().pending.size).toBe(0);
  });
});
