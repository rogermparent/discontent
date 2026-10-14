// The importer's ISO 8601 duration reader (35 close-out follow-up). The old
// pattern only knew `PT…H…M`, so Food Network's `P0Y0M0DT1H15M0.000S` — and
// anything with a day part or seconds — came in with no times at all.

import { describe, expect, it } from "vitest";

import {
  minutesToDuration,
  parseDurationToMinutes,
} from "recipe-website-common/util/isoDuration";

describe("parseDurationToMinutes", () => {
  it("keeps reading the plain `PT…` forms", () => {
    expect(parseDurationToMinutes("PT1H")).toBe(60);
    expect(parseDurationToMinutes("PT45M")).toBe(45);
    expect(parseDurationToMinutes("PT1H30M")).toBe(90);
    expect(parseDurationToMinutes("PT0H20M")).toBe(20);
    expect(parseDurationToMinutes("PT90M")).toBe(90);
    expect(parseDurationToMinutes("PT0M")).toBe(0);
  });

  it("reads Food Network's full date-and-time form", () => {
    expect(parseDurationToMinutes("P0Y0M0DT1H15M0.000S")).toBe(75);
    expect(parseDurationToMinutes("P0Y0M0DT0H20M0.000S")).toBe(20);
    expect(parseDurationToMinutes("P0Y0M0DT0H0M0.000S")).toBe(0);
  });

  it("converts days and weeks", () => {
    expect(parseDurationToMinutes("P1DT2H")).toBe(1560);
    expect(parseDurationToMinutes("P1D")).toBe(1440);
    expect(parseDurationToMinutes("P0DT0H35M")).toBe(35);
    expect(parseDurationToMinutes("P1W")).toBe(7 * 1440);
  });

  it("rounds seconds up to the next whole minute", () => {
    expect(parseDurationToMinutes("PT1H30M45S")).toBe(91);
    expect(parseDurationToMinutes("PT30S")).toBe(1);
    expect(parseDurationToMinutes("PT1M1S")).toBe(2);
    expect(parseDurationToMinutes("PT120S")).toBe(2);
    expect(parseDurationToMinutes("PT10M0S")).toBe(10);
  });

  it("reads fractional components", () => {
    expect(parseDurationToMinutes("PT1.5H")).toBe(90);
    expect(parseDurationToMinutes("PT0,5H")).toBe(30);
    expect(parseDurationToMinutes("PT0.1H")).toBe(6);
    expect(parseDurationToMinutes("PT2.25M")).toBe(3);
  });

  it("reads lowercase", () => {
    expect(parseDurationToMinutes("pt1h30m")).toBe(90);
    expect(parseDurationToMinutes("p0y0m0dt1h15m0.000s")).toBe(75);
  });

  it("never reads a month as a minute", () => {
    /* Before the `T` an M is months, which have no fixed length. */
    expect(parseDurationToMinutes("P20M")).toBeUndefined();
    expect(parseDurationToMinutes("P1MT5M")).toBeUndefined();
    expect(parseDurationToMinutes("P1Y")).toBeUndefined();
    /* Zero years and months are just padding. */
    expect(parseDurationToMinutes("P0Y0MT5M")).toBe(5);
  });

  it("finds a duration inside a longer string, as before", () => {
    expect(parseDurationToMinutes("Prep: PT20M")).toBe(20);
    expect(parseDurationToMinutes(" PT20M ")).toBe(20);
  });

  it("is undefined for nothing and garbage", () => {
    expect(parseDurationToMinutes(undefined)).toBeUndefined();
    expect(parseDurationToMinutes("")).toBeUndefined();
    expect(parseDurationToMinutes("20 minutes")).toBeUndefined();
    expect(parseDurationToMinutes("Pizza")).toBeUndefined();
    expect(parseDurationToMinutes("P")).toBeUndefined();
    expect(parseDurationToMinutes("PT")).toBeUndefined();
    expect(
      parseDurationToMinutes(42 as unknown as string | undefined),
    ).toBeUndefined();
  });

  it("round-trips everything the export writes", () => {
    for (const minutes of [1, 5, 45, 60, 75, 95, 600, 1560]) {
      expect(parseDurationToMinutes(minutesToDuration(minutes))).toBe(minutes);
    }
  });
});
