// The `/shopping` page's tick batching (epic 35, D9): the pure half.

import { describe, expect, it } from "vitest";

import {
  applyPending,
  HELD_TICKS_MAX_AGE_MS,
  MAX_RETRY_MS,
  parseHeld,
  parsePending,
  queueTicks,
  retryDelay,
  serializeHeld,
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

  it("round-trips through sessionStorage text, and survives junk and age", () => {
    const pending = new Map([
      ["a", true],
      ["b", false],
    ]);
    const stored = serializePending(pending, 1_000);
    expect(parsePending(stored, 2_000)).toEqual(pending);
    /* Ten minutes on, the stored ticks are dropped, not replayed. */
    expect(parsePending(stored, 1_000 + 10 * 60_000 + 1).size).toBe(0);
    expect(parsePending(null, 0).size).toBe(0);
    expect(parsePending("{nope", 0).size).toBe(0);
    expect(parsePending('[["a", true]]', 0).size).toBe(0);
    expect(
      parsePending('{"at": 0, "ticks": [["a", "yes"], ["b", true]]}', 0),
    ).toEqual(new Map([["b", true]]));
  });
});

describe("held ticks expire after a week (39-D3)", () => {
  const DAY = 24 * 60 * 60_000;
  const NOW = 100 * DAY;

  it("is seven days", () => {
    expect(HELD_TICKS_MAX_AGE_MS).toBe(7 * DAY);
  });

  it("keeps a tick six days old", () => {
    const stored = serializeHeld(
      new Map([["a", true]]),
      new Map([["a", NOW - 6 * DAY]]),
      NOW - 6 * DAY,
    );
    const read = parseHeld(stored, NOW);
    expect(read.ticks).toEqual(new Map([["a", true]]));
    expect(read.times.get("a")).toBe(NOW - 6 * DAY);
    expect(read.expired).toEqual([]);
  });

  it("drops a tick eight days old, and counts it", () => {
    const stored = serializeHeld(
      new Map([["a", true]]),
      new Map([["a", NOW - 8 * DAY]]),
      NOW - 8 * DAY,
    );
    const read = parseHeld(stored, NOW);
    expect(read.ticks.size).toBe(0);
    expect(read.expired).toEqual(["a"]);
  });

  it("ages each tick from when it was made, not the set's last write", () => {
    const stored = serializeHeld(
      new Map([
        ["old", true],
        ["new", false],
        ["older", true],
      ]),
      new Map([
        ["old", NOW - 8 * DAY],
        ["new", NOW - 6 * DAY],
        ["older", NOW - 30 * DAY],
      ]),
      /* Written yesterday, by the tick of "new" or another. */
      NOW - DAY,
    );
    const read = parseHeld(stored, NOW);
    expect(read.ticks).toEqual(new Map([["new", false]]));
    expect(read.expired).toEqual(["old", "older"]);
  });

  it("reads a set written before 39c as old as its `at`, and is read by parsePending", () => {
    const legacy = serializePending(new Map([["a", true]]), NOW - 8 * DAY);
    expect(parseHeld(legacy, NOW)).toMatchObject({ expired: ["a"] });
    expect(parseHeld(legacy, NOW - 2 * DAY).ticks).toEqual(
      new Map([["a", true]]),
    );
    /* An older page (38d) reads the new shape with `Infinity`. */
    const current = serializeHeld(new Map([["a", true]]), new Map(), NOW);
    expect(parsePending(current, NOW, Infinity)).toEqual(
      new Map([["a", true]]),
    );
  });

  it("reads junk as nothing held", () => {
    expect(parseHeld(null, NOW)).toMatchObject({ expired: [] });
    expect(parseHeld("{nope", NOW).ticks.size).toBe(0);
    expect(parseHeld('{"ticks": [["a", true]]}', NOW).ticks.size).toBe(0);
    expect(
      parseHeld(
        `{"at": ${NOW}, "ticks": [["a", "yes"], ["b", true]], "times": []}`,
        NOW,
      ).ticks,
    ).toEqual(new Map([["b", true]]));
  });
});
