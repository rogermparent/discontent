// @vitest-environment node
//
// Usability pass (U1/U3): the one holiday calendar — when each holiday term
// falls, for the homepage's "Coming up" (its 180-day window) and the Drinks
// page's seasonal row (the next dated holiday, within 60 days since 38a).

import { describe, expect, it } from "vitest";
import {
  countdownLabel,
  dayKey,
  daysBetween,
  easterSunday,
  formatDayLong,
  localDay,
  nextOccurrence,
  nextSeasonal,
  orderByNextOccurrence,
  parseDayKey,
  SEASONAL_WINDOW_DAYS,
  withinComingUpWindow,
  withinDays,
} from "../websites/recipe-website/common/util/holidays";

const day = (key: string) => parseDayKey(key);

describe("holiday dates", () => {
  it("computes Easter by the Gregorian computus", () => {
    expect(easterSunday(2024)).toEqual({ month: 3, day: 31 });
    expect(easterSunday(2025)).toEqual({ month: 4, day: 20 });
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
    expect(easterSunday(2027)).toEqual({ month: 3, day: 28 });
  });

  it("puts US Thanksgiving on the fourth Thursday of November", () => {
    expect(nextOccurrence("thanksgiving", day("2026-10-15"))).toEqual(
      day("2026-11-26"),
    );
    expect(nextOccurrence("thanksgiving", day("2027-01-01"))).toEqual(
      day("2027-11-25"),
    );
    /* November 2029 starts on a Thursday: Thanksgiving falls as early as it
     * can, the 22nd. */
    expect(nextOccurrence("thanksgiving", day("2029-01-01"))).toEqual(
      day("2029-11-22"),
    );
    /* November 2024 starts on a Friday: Thanksgiving falls on the 28th. */
    expect(nextOccurrence("thanksgiving", day("2024-01-01"))).toEqual(
      day("2024-11-28"),
    );
  });

  it("rolls Easter to next year once this year's has passed", () => {
    /* Easter 2026 is 5 April (the computus test above); the day after, it
     * rolls to 2027's, 28 March. */
    expect(nextOccurrence("easter", day("2026-04-06"))).toEqual(
      day("2027-03-28"),
    );
  });

  it("counts today as the day, and rolls a passed date to next year", () => {
    expect(nextOccurrence("christmas", day("2026-12-25"))).toEqual(
      day("2026-12-25"),
    );
    expect(nextOccurrence("christmas", day("2026-12-26"))).toEqual(
      day("2027-12-25"),
    );
    expect(nextOccurrence("fall-favorites", day("2026-10-15"))).toBe(undefined);
  });

  it("counts whole calendar days, across a DST change and a year end", () => {
    expect(daysBetween(day("2026-10-15"), day("2026-10-31"))).toBe(16);
    /* US clocks go back on 1 November 2026; calendar days don't care. */
    expect(daysBetween(day("2026-10-31"), day("2026-11-02"))).toBe(2);
    expect(daysBetween(day("2026-10-15"), day("2026-12-25"))).toBe(71);
    expect(daysBetween(day("2026-12-31"), day("2027-01-01"))).toBe(1);
    expect(countdownLabel(0)).toBe("today");
    expect(countdownLabel(1)).toBe("tomorrow");
    expect(countdownLabel(16)).toBe("in 16 days");
  });

  it("orders dated holidays soonest first and keeps undated ones after", () => {
    const ordered = orderByNextOccurrence(
      [
        { slug: "christmas" },
        { slug: "fall-favorites" },
        { slug: "halloween" },
        { slug: "thanksgiving" },
      ],
      day("2026-10-15"),
    );
    expect(ordered.map((item) => [item.slug, item.days])).toEqual([
      ["halloween", 16],
      ["thanksgiving", 42],
      ["christmas", 71],
      ["fall-favorites", undefined],
    ]);
    /* On 1 November Halloween has passed: it is a year away now. */
    expect(
      orderByNextOccurrence(
        [{ slug: "halloween" }, { slug: "christmas" }],
        day("2026-11-01"),
      ).map((item) => item.slug),
    ).toEqual(["christmas", "halloween"]);
    /* The day after Christmas, new-year is six days off and soonest, ahead
     * of the holidays that rolled a whole year out. */
    expect(
      orderByNextOccurrence(
        [{ slug: "christmas" }, { slug: "new-year" }, { slug: "halloween" }],
        day("2026-12-26"),
      ).map((item) => item.slug),
    ).toEqual(["new-year", "halloween", "christmas"]);
  });

  it("writes the day the same way everywhere", () => {
    expect(formatDayLong(day("2026-10-15"))).toBe("Thursday 15 October");
    expect(dayKey({ year: 2026, month: 3, day: 7 })).toBe("2026-03-07");
  });

  it("keeps only what is due within the 180-day window", () => {
    /* The day after Christmas, Halloween, Thanksgiving and Christmas have
     * all just rolled a year out — none is within 180 days, so nothing
     * qualifies and the section has nothing to show. */
    expect(
      withinComingUpWindow(
        [
          { slug: "halloween" },
          { slug: "thanksgiving" },
          { slug: "christmas" },
        ],
        day("2026-12-26"),
      ),
    ).toEqual([]);
    /* Five days before Christmas, it is well within the window. */
    expect(
      withinComingUpWindow([{ slug: "christmas" }], day("2026-12-20")).map(
        (item) => [item.slug, item.days],
      ),
    ).toEqual([["christmas", 5]]);
  });
});

describe("holiday spellings and the reader's day", () => {
  it("knows several spellings, and nothing it has no rule for", () => {
    expect(nextOccurrence("independence-day", day("2026-01-01"))).toEqual(
      day("2026-07-04"),
    );
    expect(nextOccurrence("fourth-of-july", day("2026-01-01"))).toEqual(
      day("2026-07-04"),
    );
    expect(nextOccurrence("valentines-day", day("2026-03-01"))).toEqual(
      day("2027-02-14"),
    );
    expect(nextOccurrence("saint-patricks-day", day("2026-01-01"))).toEqual(
      day("2026-03-17"),
    );
    expect(nextOccurrence("hanukkah", day("2026-01-01"))).toBeUndefined();
    expect(nextOccurrence("fall", day("2026-01-01"))).toBeUndefined();
  });

  it("counts the day itself, at any hour of the reader's evening", () => {
    const evening = localDay(new Date(2026, 9, 31, 22, 30));
    expect(evening).toEqual(day("2026-10-31"));
    const halloween = nextOccurrence("halloween", evening)!;
    expect(halloween).toEqual(day("2026-10-31"));
    expect(daysBetween(evening, halloween)).toBe(0);
  });

  it("orders the undated holidays after the dated ones", () => {
    const ordered = orderByNextOccurrence(
      [{ slug: "fall" }, { slug: "halloween" }, { slug: "christmas" }],
      day("2026-12-26"),
    );
    expect(ordered.map((entry) => entry.slug)).toEqual([
      "halloween",
      "christmas",
      "fall",
    ]);
    expect(ordered.at(-1)).toEqual({ slug: "fall", days: undefined });
  });
});

describe("withinDays (38a, D1)", () => {
  it("counts today and the n days after it, and nothing past", () => {
    const today = day("2026-10-16");
    expect(withinDays(today, today, 0)).toBe(true);
    expect(withinDays(today, day("2026-12-15"), 60)).toBe(true);
    expect(withinDays(today, day("2026-12-16"), 60)).toBe(false);
    expect(withinDays(today, day("2026-10-15"), 60)).toBe(false);
  });

  it("crosses the year end", () => {
    expect(withinDays(day("2026-12-26"), day("2027-01-01"), 6)).toBe(true);
    expect(withinDays(day("2026-12-26"), day("2027-01-01"), 5)).toBe(false);
  });
});

describe("the Drinks page's seasonal row (38a, D1)", () => {
  const holidays = [
    { slug: "fall" },
    { slug: "halloween" },
    { slug: "christmas" },
  ];

  it("shows a holiday 60 days out, and hides one 61 days out", () => {
    expect(SEASONAL_WINDOW_DAYS).toBe(60);
    /* Christmas is 25 December: 60 days before is 26 October. */
    expect(nextSeasonal([{ slug: "christmas" }], day("2026-10-26"))).toEqual({
      slug: "christmas",
      days: 60,
    });
    expect(
      nextSeasonal([{ slug: "christmas" }], day("2026-10-25")),
    ).toBeUndefined();
  });

  it("names the soonest dated holiday within the window", () => {
    expect(nextSeasonal(holidays, day("2026-10-15"))?.slug).toBe("halloween");
    expect(nextSeasonal(holidays, day("2026-11-01"))?.slug).toBe("christmas");
  });

  it("hides the row after Christmas until a holiday comes within 60 days", () => {
    /* Halloween is 309 days off, and an undated "fall" is never next. */
    expect(nextSeasonal(holidays, day("2026-12-26"))).toBeUndefined();
    /* Across the year end: New Year's Day, six days off. */
    expect(
      nextSeasonal([...holidays, { slug: "new-year" }], day("2026-12-26")),
    ).toEqual({ slug: "new-year", days: 6 });
    /* Halloween comes back into the window on 1 September. */
    expect(nextSeasonal(holidays, day("2027-09-01"))).toEqual({
      slug: "halloween",
      days: 60,
    });
  });
});
