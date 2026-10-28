// @vitest-environment node
//
// 46e: the ⌘K palette's holiday rows — which holidays it may offer (the
// `holidays` root's children that lead somewhere), the coming-up rows on an
// empty or short input, and the matches while typing.

import { describe, expect, it } from "vitest";
import {
  HOLIDAY_MATCH_MIN,
  paletteHolidayRows,
  paletteHolidays,
  type PaletteHoliday,
} from "../websites/recipe-website/common/components/CommandPalette/holidayRows";
import {
  buildFacetModel,
  type FacetTerm,
} from "../websites/recipe-website/common/util/facets";
import {
  countdownLabel,
  parseDayKey,
} from "../websites/recipe-website/common/util/holidays";

const TERMS: FacetTerm[] = [
  { slug: "holidays", label: "Holidays", record: true },
  { slug: "halloween", label: "Halloween", parent: "holidays", record: true },
  {
    slug: "thanksgiving",
    label: "Thanksgiving",
    parent: "holidays",
    record: true,
  },
  {
    slug: "xmas",
    label: "Xmas",
    parent: "holidays",
    aliases: ["Christmas"],
    record: true,
  },
  {
    slug: "christmas-eve",
    label: "Christmas Eve",
    parent: "holidays",
    record: true,
  },
  /* Carried only through its child. */
  { slug: "easter", label: "Easter", parent: "holidays", record: true },
  { slug: "easter-brunch", label: "Easter Brunch", parent: "easter" },
  /* Undated. */
  {
    slug: "fall-favorites",
    label: "Fall Favorites",
    parent: "holidays",
    record: true,
  },
  /* Nothing carries it: no row. */
  {
    slug: "valentines",
    label: "Valentine's",
    parent: "holidays",
    record: true,
  },
  { slug: "dessert", label: "Desserts" },
];

const COUNTS: Record<string, number> = {
  halloween: 2,
  thanksgiving: 5,
  xmas: 3,
  "christmas-eve": 1,
  "easter-brunch": 1,
  "fall-favorites": 1,
  dessert: 9,
};

const holidays = paletteHolidays(
  buildFacetModel(TERMS),
  (slug) => COUNTS[slug] ?? 0,
);
const day = parseDayKey;
const slugs = (rows: Array<{ slug: string }>) => rows.map((row) => row.slug);

describe("paletteHolidays", () => {
  it("offers the holidays root's children that lead somewhere", () => {
    expect(slugs(holidays)).toEqual([
      "halloween",
      "thanksgiving",
      "xmas",
      "christmas-eve",
      "easter",
      "fall-favorites",
    ]);
  });

  it("dates a holiday by an alias's rule and keeps its words", () => {
    const xmas = holidays.find((holiday) => holiday.slug === "xmas");
    expect(xmas?.rule).toBe("christmas");
    expect(xmas?.words).toEqual(["xmas", "christmas"]);
    expect(
      holidays.find((holiday) => holiday.slug === "fall-favorites")?.rule,
    ).toBeUndefined();
  });

  it("has nothing to offer without a holidays root", () => {
    expect(
      paletteHolidays(
        buildFacetModel(TERMS.filter((term) => term.slug !== "holidays")),
        () => 1,
      ),
    ).toEqual([]);
  });
});

describe("paletteHolidayRows", () => {
  it("shows the next two within the window on an empty input", () => {
    /* The brief's example: 28 October 2026 is 29 days to Thanksgiving. */
    const { mode, rows } = paletteHolidayRows(holidays, "", day("2026-10-28"));
    expect(mode).toBe("coming-up");
    expect(rows.map((row) => [row.slug, countdownLabel(row.days)])).toEqual([
      ["halloween", "in 3 days"],
      ["thanksgiving", "in 29 days"],
    ]);
  });

  it("counts today as the day itself, and moves on the day after", () => {
    expect(
      slugs(paletteHolidayRows(holidays, "", day("2026-10-31")).rows),
    ).toEqual(["halloween", "thanksgiving"]);
    expect(
      paletteHolidayRows(holidays, "", day("2026-11-01")).rows.map((row) => [
        row.slug,
        row.days,
      ]),
    ).toEqual([
      ["thanksgiving", 25],
      ["christmas-eve", 53],
    ]);
  });

  it("leaves out what is past the 180-day window, and the undated", () => {
    /* 2 January: Easter is 93 days off; Halloween 302 — outside. */
    expect(
      slugs(paletteHolidayRows(holidays, "", day("2026-01-02")).rows),
    ).toEqual(["easter"]);
    /* 1 May: nothing until Halloween, 183 days off. */
    expect(paletteHolidayRows(holidays, "", day("2026-05-01")).rows).toEqual(
      [],
    );
  });

  it("treats a short input as empty", () => {
    const short = "x".repeat(HOLIDAY_MATCH_MIN - 1);
    const rows = paletteHolidayRows(holidays, ` ${short} `, day("2026-10-28"));
    expect(rows.mode).toBe("coming-up");
    expect(slugs(rows.rows)).toEqual(["halloween", "thanksgiving"]);
  });

  it("matches the typed words while typing, soonest first", () => {
    const at = day("2026-10-18");
    const match = (input: string) =>
      paletteHolidayRows(holidays, input, at) satisfies {
        mode: string;
        rows: Array<PaletteHoliday & { days?: number }>;
      };
    expect(match("thanks").mode).toBe("match");
    expect(slugs(match("thanks").rows)).toEqual(["thanksgiving"]);
    expect(slugs(match("Thanksgiving").rows)).toEqual(["thanksgiving"]);
    /* An alias names it too. */
    expect(slugs(match("christmas").rows)).toEqual(["christmas-eve", "xmas"]);
    expect(slugs(match("christmas eve").rows)).toEqual(["christmas-eve"]);
    expect(slugs(match("XMAS").rows)).toEqual(["xmas"]);
    /* Undated: offered, with no countdown. */
    expect(match("fall").rows).toEqual([
      expect.objectContaining({ slug: "fall-favorites", days: undefined }),
    ]);
    /* A match is offered however far off: Thanksgiving's next, from the
     * day after, is a year away. */
    expect(
      paletteHolidayRows(holidays, "thanks", day("2026-11-27")).rows,
    ).toEqual([expect.objectContaining({ slug: "thanksgiving", days: 363 })]);
  });

  it("is not a holiday when the words say something else", () => {
    const at = day("2026-10-18");
    expect(paletteHolidayRows(holidays, "halloween punch", at).rows).toEqual(
      [],
    );
    expect(paletteHolidayRows(holidays, "chicken", at).rows).toEqual([]);
    /* A filter term is not a word: nothing to match. */
    expect(paletteHolidayRows(holidays, "tag:halloween", at)).toEqual({
      mode: "match",
      rows: [],
    });
    /* An empty-carrier holiday never comes back by name. */
    expect(paletteHolidayRows(holidays, "valentine", at).rows).toEqual([]);
  });

  it("caps the rows at two", () => {
    const many = Array.from({ length: 5 }, (_, i): PaletteHoliday => ({
      slug: `halloween-${i}`,
      label: `Halloween ${i}`,
      rule: "halloween",
      words: ["halloween", String(i)],
    }));
    expect(
      paletteHolidayRows(many, "halloween", day("2026-10-18")).rows,
    ).toHaveLength(2);
  });
});
