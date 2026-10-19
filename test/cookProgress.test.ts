// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  cookProgressKey,
  firstOpenStep,
  readCookProgress,
  writeCookProgress,
} from "recipe-website-common/components/View/FocusView/cookProgress";

/* 42c2: the cook view's ticks, per recipe, in sessionStorage. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

const shape = { steps: 6, ingredients: 10, fallbackLayout: "step" as const };

describe("cook view progress", () => {
  it("round-trips through storage under the recipe's key", () => {
    const storage = memoryStorage();
    writeCookProgress(storage, "pumpkin-pie", {
      done: [0, 1],
      gathered: [2, 4],
      step: 2,
      layout: "step",
    });
    expect([...storage.data.keys()]).toEqual(["cook-view:pumpkin-pie"]);
    expect(readCookProgress(storage, "pumpkin-pie", shape)).toEqual({
      done: [0, 1],
      gathered: [2, 4],
      step: 2,
      layout: "step",
    });
    /* Another recipe starts clean. */
    expect(readCookProgress(storage, "mule", shape)).toEqual({
      done: [],
      gathered: [],
      step: 0,
      layout: "step",
    });
  });

  it("drops what no longer fits the recipe and opens at the first open step", () => {
    const storage = memoryStorage({
      [cookProgressKey("pie")]: JSON.stringify({
        done: [0, 1, 1, 9, -1, "2"],
        gathered: [3, 12],
        step: 40,
        layout: "sideways",
      }),
    });
    expect(
      readCookProgress(storage, "pie", { ...shape, fallbackLayout: "list" }),
    ).toEqual({ done: [0, 1], gathered: [3], step: 2, layout: "list" });
  });

  it("reads nothing from junk, blocked or missing storage", () => {
    const junk = memoryStorage({ [cookProgressKey("pie")]: "{not json" });
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const empty = { done: [], gathered: [], step: 0, layout: "step" };
    expect(readCookProgress(junk, "pie", shape)).toEqual(empty);
    expect(readCookProgress(blocked, "pie", shape)).toEqual(empty);
    expect(readCookProgress(undefined, "pie", shape)).toEqual(empty);
    expect(() =>
      writeCookProgress(blocked, "pie", { ...empty, layout: "list" }),
    ).not.toThrow();
  });

  it("finds the first step not done, or the last when all are", () => {
    expect(firstOpenStep([], 4)).toBe(0);
    expect(firstOpenStep([0, 1, 3], 4)).toBe(2);
    expect(firstOpenStep([0, 1, 2, 3], 4)).toBe(3);
    expect(firstOpenStep([], 0)).toBe(0);
  });
});
