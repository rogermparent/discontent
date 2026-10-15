// @vitest-environment node
//
// Usability pass (U1/U3): when each holiday term falls, for the homepage's
// "Coming up" and the Drinks page's seasonal row.

import { describe, expect, it } from "vitest";
import {
  daysUntil,
  nextOccurrence,
  orderByNextOccurrence,
} from "../websites/recipe-website/common/util/holidays";

const day = (year: number, month: number, date: number) =>
  new Date(year, month - 1, date);
const ymd = (date: Date | undefined) =>
  date &&
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

describe("nextOccurrence", () => {
  it("dates fixed holidays this year, or next once passed", () => {
    expect(ymd(nextOccurrence("halloween", day(2026, 10, 15)))).toBe(
      "2026-10-31",
    );
    expect(ymd(nextOccurrence("halloween", day(2026, 11, 1)))).toBe(
      "2027-10-31",
    );
    expect(ymd(nextOccurrence("christmas", day(2026, 12, 26)))).toBe(
      "2027-12-25",
    );
  });

  it("counts the day itself, at any hour", () => {
    const evening = new Date(2026, 9, 31, 22, 30);
    expect(ymd(nextOccurrence("halloween", evening))).toBe("2026-10-31");
    expect(daysUntil(nextOccurrence("halloween", evening)!, evening)).toBe(0);
  });

  it("puts Thanksgiving on the fourth Thursday of November", () => {
    expect(ymd(nextOccurrence("thanksgiving", day(2026, 1, 1)))).toBe(
      "2026-11-26",
    );
    expect(ymd(nextOccurrence("thanksgiving", day(2027, 1, 1)))).toBe(
      "2027-11-25",
    );
    /* November 2029 starts on a Thursday. */
    expect(ymd(nextOccurrence("thanksgiving", day(2029, 1, 1)))).toBe(
      "2029-11-22",
    );
  });

  it("computes Easter", () => {
    expect(ymd(nextOccurrence("easter", day(2026, 1, 1)))).toBe("2026-04-05");
    expect(ymd(nextOccurrence("easter", day(2027, 1, 1)))).toBe("2027-03-28");
    expect(ymd(nextOccurrence("easter", day(2025, 1, 1)))).toBe("2025-04-20");
  });

  it("knows several spellings, and nothing it has no rule for", () => {
    expect(ymd(nextOccurrence("independence-day", day(2026, 1, 1)))).toBe(
      "2026-07-04",
    );
    expect(ymd(nextOccurrence("valentines-day", day(2026, 3, 1)))).toBe(
      "2027-02-14",
    );
    expect(nextOccurrence("hanukkah", day(2026, 1, 1))).toBeUndefined();
    expect(nextOccurrence("fall", day(2026, 1, 1))).toBeUndefined();
  });
});

describe("orderByNextOccurrence", () => {
  it("puts the soonest first and undated slugs last, in order", () => {
    const ordered = orderByNextOccurrence(
      ["christmas", "fall", "halloween", "thanksgiving", "potluck"],
      (slug) => slug,
      day(2026, 11, 1),
    );
    expect(ordered.map((entry) => entry.item)).toEqual([
      "thanksgiving",
      "christmas",
      "halloween",
      "fall",
      "potluck",
    ]);
    expect(ordered[0].days).toBe(25);
    expect(ordered[3].date).toBeUndefined();
  });
});
