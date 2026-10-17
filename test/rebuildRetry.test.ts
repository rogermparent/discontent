// @vitest-environment node
//
// 40c (39b review, L5): the instance's own rebuild is retried after a
// failure — 1, 5 and 15 minutes after each failure in a row — and stops on
// success, a newer HEAD move, or shutdown. All on a frozen clock.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CurationError } from "../websites/recipe-website/editor/controller/curation/errors";
import {
  createRetryingRebuild,
  REBUILD_RETRY_DELAYS_MS,
} from "../websites/recipe-website/editor/controller/instance/rebuildRetry";

const MINUTE = 60_000;

/** A rebuild that answers each call from `outcomes`, then succeeds. */
function scripted(outcomes: (Error | "ok")[]) {
  const calls: number[] = [];
  const rebuild = vi.fn(async () => {
    calls.push(Date.now());
    const next = outcomes.shift() ?? "ok";
    if (next !== "ok") throw next;
    return true;
  });
  return { rebuild, calls };
}

beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createRetryingRebuild (40c)", () => {
  it("schedules 1, 5 and 15 minutes after each failure, then gives up", async () => {
    expect(REBUILD_RETRY_DELAYS_MS).toEqual([MINUTE, 5 * MINUTE, 15 * MINUTE]);
    const boom = () => new Error("ENOSPC");
    const { rebuild, calls } = scripted([boom(), boom(), boom(), boom()]);
    const retrying = createRetryingRebuild({ rebuild });

    await retrying.task();
    expect(calls).toEqual([0]);
    expect(retrying).toMatchObject({ pending: true, failures: 1 });

    await vi.advanceTimersByTimeAsync(MINUTE - 1);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([0, MINUTE]);

    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(calls).toEqual([0, MINUTE, 6 * MINUTE]);

    await vi.advanceTimersByTimeAsync(15 * MINUTE);
    expect(calls).toEqual([0, MINUTE, 6 * MINUTE, 21 * MINUTE]);

    /* The fourth failure in a row: no more. */
    expect(retrying.pending).toBe(false);
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(calls).toHaveLength(4);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("no more retries (3 made)"),
    );
    retrying.dispose();
  });

  it("stops on success, and a later failure starts from the first delay", async () => {
    const { rebuild, calls } = scripted([
      new Error("first"),
      "ok",
      new Error("later"),
    ]);
    const retrying = createRetryingRebuild({ rebuild });
    await retrying.task();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(calls).toEqual([0, MINUTE]);
    expect(retrying).toMatchObject({ pending: false, failures: 0 });
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    expect(calls).toHaveLength(2);

    /* A HEAD move's rebuild fails later: 1 minute again, not 5. */
    await retrying.task();
    expect(retrying).toMatchObject({ pending: true, failures: 1 });
    const at = Date.now();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(calls).toEqual([0, MINUTE, at, at + MINUTE]);
    retrying.dispose();
  });

  it("drops the pending retry on a newer HEAD move and counts again from one", async () => {
    const { rebuild, calls } = scripted([
      new Error("a"),
      new Error("b"),
      new Error("c"),
    ]);
    const retrying = createRetryingRebuild({ rebuild });
    await retrying.task();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(retrying.failures).toBe(2);

    /* The watcher: the move asks by itself, so the 5-minute retry goes. */
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    retrying.headMoved();
    expect(retrying).toMatchObject({ pending: false, failures: 0 });
    await retrying.task();
    expect(calls).toEqual([0, MINUTE, 3 * MINUTE]);
    expect(retrying).toMatchObject({ pending: true, failures: 1 });
    /* Nothing at the old schedule's 6 minutes; the new one's 1 minute. */
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(calls).toEqual([0, MINUTE, 3 * MINUTE, 4 * MINUTE]);
    retrying.dispose();
  });

  it("never retries busy in a tight loop: it waits for the next attempt", async () => {
    const busy = () =>
      new CurationError("busy", "The repository is busy: a sync holds it.");
    const { rebuild, calls } = scripted([busy(), busy()]);
    const retrying = createRetryingRebuild({ rebuild });
    await retrying.task();
    /* A tick, a second: nothing until the scheduled minute. */
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toEqual([0]);
    await vi.advanceTimersByTimeAsync(MINUTE - 1_000);
    expect(calls).toEqual([0, MINUTE]);
    await vi.advanceTimersByTimeAsync(5 * MINUTE - 1);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([0, MINUTE, 6 * MINUTE]);
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("was busy; retrying in 1 minute (retry 1 of 3)"),
    );
    expect(retrying.pending).toBe(false);
    retrying.dispose();
  });

  it("clears the pending retry on shutdown and schedules nothing after", async () => {
    const { rebuild, calls } = scripted([new Error("a"), new Error("b")]);
    const retrying = createRetryingRebuild({ rebuild });
    await retrying.task();
    expect(retrying.pending).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    retrying.dispose();
    expect(retrying.pending).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(calls).toEqual([0]);
    /* A rebuild already in flight that fails after shutdown schedules none. */
    await retrying.task();
    expect(retrying.pending).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits out a sync: a retry while blocked runs when the sync kicks it", async () => {
    let syncing = false;
    const { rebuild, calls } = scripted([new Error("a")]);
    const retrying = createRetryingRebuild({
      rebuild,
      blocked: () => syncing,
    });
    await retrying.task();
    syncing = true;
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(calls).toEqual([0]);
    syncing = false;
    await retrying.task.kick();
    expect(calls).toEqual([0, MINUTE]);
    expect(retrying).toMatchObject({ pending: false, failures: 0 });
    retrying.dispose();
  });

  it("unrefs its timer, so a pending retry never holds the process open", async () => {
    const unref = vi.fn();
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      ...args: Parameters<typeof setTimeout>
    ) => {
      const handle = realSetTimeout(...args);
      return Object.assign(handle, { unref });
    }) as typeof setTimeout);
    const { rebuild } = scripted([new Error("a")]);
    const retrying = createRetryingRebuild({ rebuild });
    await retrying.task();
    expect(unref).toHaveBeenCalledTimes(1);
    retrying.dispose();
  });
});
