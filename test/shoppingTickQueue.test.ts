// The `/shopping` page's tick batching (epic 35, D9): the pure half.

import { describe, expect, it } from "vitest";

import {
  applyPending,
  MAX_RETRY_MS,
  parsePending,
  queueTicks,
  retryDelay,
  serializePending,
  settle,
  toPatch,
} from "recipe-website-common/util/shoppingTickQueue";

const items = [
  { id: "a", text: "eggs" },
  { id: "b", text: "milk", checked: true },
  { id: "c", text: "flour" },
];

describe("the tick queue", () => {
  it("keeps the newest wish per id, and patches it as check/uncheck", () => {
    let pending = queueTicks(new Map(), ["a", "c"], true);
    pending = queueTicks(pending, ["b"], false);
    pending = queueTicks(pending, ["c"], false);
    expect([...pending]).toEqual([
      ["a", true],
      ["c", false],
      ["b", false],
    ]);
    expect(toPatch(pending)).toEqual({ check: ["a"], uncheck: ["c", "b"] });
  });

  it("shows pending ticks over the server's items", () => {
    const shown = applyPending(
      items,
      new Map([
        ["a", true],
        ["b", false],
      ]),
    );
    expect(shown).toEqual([
      { id: "a", text: "eggs", checked: true },
      { id: "b", text: "milk" },
      { id: "c", text: "flour" },
    ]);
    /* The server's items are not touched. */
    expect(items[1].checked).toBe(true);
  });

  it("settles what was sent, keeps what changed since, drops what is gone", () => {
    const sent = new Map([
      ["a", true],
      ["b", false],
      ["c", true],
    ]);
    /* During the flight: `b` ticked again, `d` ticked for the first time. */
    const now = queueTicks(queueTicks(sent, ["b"], true), ["d"], true);
    expect([...settle(now, sent, ["c"])]).toEqual([
      ["b", true],
      ["d", true],
    ]);
  });

  it("backs off 1 s, 2 s, 4 s … to 30 s", () => {
    expect([0, 1, 2, 3, 10].map(retryDelay)).toEqual([
      1000,
      2000,
      4000,
      8000,
      MAX_RETRY_MS,
    ]);
  });

  it("round-trips through sessionStorage text, and survives junk", () => {
    const pending = new Map([
      ["a", true],
      ["b", false],
    ]);
    expect(parsePending(serializePending(pending))).toEqual(pending);
    expect(parsePending(null).size).toBe(0);
    expect(parsePending("{nope").size).toBe(0);
    expect(parsePending('[["a", "yes"], ["b", true]]')).toEqual(
      new Map([["b", true]]),
    );
  });
});
