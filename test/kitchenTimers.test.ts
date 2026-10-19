// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  anyRunning,
  finishDue,
  pauseTimer,
  remainingMs,
  removeTimer,
  resumeTimer,
  startTimer,
  stepTimerId,
  type KitchenTimer,
} from "recipe-website-common/util/kitchenTimers";

/*
 * 42c2: the recipe page's timers as pure state. Times are end times, so the
 * remaining time is right however late the clock is read.
 */
const T0 = 1_760_000_000_000;
const bake = {
  id: stepTimerId(5, 0),
  label: "Step 5 · 25 minutes",
  text: "25 minutes",
  seconds: 1500,
};
const cover = {
  id: stepTimerId(5, 1),
  label: "Step 5 · 10 minutes",
  text: "10 minutes",
  seconds: 600,
};

describe("kitchen timers", () => {
  it("starts with an end time and counts down from the clock", () => {
    const timers = startTimer([], bake, T0);
    expect(timers).toEqual([
      { ...bake, status: "running", endsAt: T0 + 1_500_000 },
    ]);
    expect(remainingMs(timers[0], T0 + 60_000)).toBe(1_440_000);
    /* A tab asleep past the end reads 0, not a negative. */
    expect(remainingMs(timers[0], T0 + 9_999_999)).toBe(0);
  });

  it("runs several at once, each to its own end", () => {
    let timers = startTimer([], bake, T0);
    timers = startTimer(timers, cover, T0 + 30_000);
    expect(timers.map(({ id }) => id)).toEqual(["step-5-0", "step-5-1"]);

    const atTen = finishDue(timers, T0 + 30_000 + 600_000);
    expect(atTen.finished.map(({ id }) => id)).toEqual(["step-5-1"]);
    expect(atTen.timers.map(({ status }) => status)).toEqual([
      "running",
      "done",
    ]);
    expect(anyRunning(atTen.timers)).toBe(true);

    const atEnd = finishDue(atTen.timers, T0 + 1_500_000);
    expect(atEnd.finished.map(({ id }) => id)).toEqual(["step-5-0"]);
    expect(anyRunning(atEnd.timers)).toBe(false);
  });

  it("finishes each timer once, however late the check comes", () => {
    const timers = startTimer([], cover, T0);
    const late = finishDue(timers, T0 + 3_600_000);
    expect(late.finished).toHaveLength(1);
    const again = finishDue(late.timers, T0 + 3_700_000);
    expect(again.finished).toHaveLength(0);
    expect(again.timers).toBe(late.timers);
  });

  it("pauses with what was left and resumes from it", () => {
    let timers = startTimer([], bake, T0);
    timers = pauseTimer(timers, bake.id, T0 + 100_000);
    expect(timers[0].status).toBe("paused");
    expect(remainingMs(timers[0], T0 + 999_999)).toBe(1_400_000);
    /* Paused time does not finish. */
    expect(finishDue(timers, T0 + 9_999_999).finished).toHaveLength(0);

    timers = resumeTimer(timers, bake.id, T0 + 500_000);
    expect(timers[0]).toMatchObject({
      status: "running",
      endsAt: T0 + 500_000 + 1_400_000,
    });
    expect(remainingMs(timers[0], T0 + 600_000)).toBe(1_300_000);
  });

  it("restarts a timer in place, and removes one", () => {
    let timers = startTimer(startTimer([], bake, T0), cover, T0);
    timers = startTimer(timers, bake, T0 + 50_000);
    expect(timers.map(({ id }) => id)).toEqual(["step-5-0", "step-5-1"]);
    expect(timers[0].endsAt).toBe(T0 + 50_000 + 1_500_000);
    timers = removeTimer(timers, cover.id);
    expect(timers.map(({ id }) => id)).toEqual(["step-5-0"]);
  });

  it("reads a done timer as 0 left", () => {
    const done: KitchenTimer = { ...bake, status: "done", remainingMs: 0 };
    expect(remainingMs(done, T0)).toBe(0);
  });
});
