import { describe, expect, it } from "vitest";
import {
  countdownLabel,
  dayKey,
  daysBetween,
  easterSunday,
  formatDayLong,
  nextOccurrence,
  orderByNextOccurrence,
  parseDayKey,
} from "../websites/recipe-website/common/util/holidayDates";
import {
  HOMEPAGE_INTENTS,
  countLabel,
  homepageIntents,
  termTotals,
} from "../websites/recipe-website/common/controller/homepageIntents";
import { comingUpEntries } from "../websites/recipe-website/common/controller/homepageComingUp";
import type { TermHierarchyNode } from "../websites/recipe-website/common/controller/tagVocabulary";

const day = (key: string) => parseDayKey(key);

function node(
  slug: string,
  total: number,
  children: TermHierarchyNode[] = [],
  image?: string,
): TermHierarchyNode {
  return {
    slug,
    label: slug[0].toUpperCase() + slug.slice(1),
    count: 0,
    total,
    children,
    ...(image ? { image } : {}),
  };
}

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
  });

  it("writes the day the same way everywhere", () => {
    expect(formatDayLong(day("2026-10-15"))).toBe("Thursday 15 October");
    expect(dayKey({ year: 2026, month: 3, day: 7 })).toBe("2026-03-07");
  });
});

describe("homepage intents", () => {
  it("shows the configured tiles that have something, in order, with counts", () => {
    const tree = [
      node("effort", 9, [node("quick", 4), node("project", 0)]),
      node("drink", 7, [node("sour", 3)]),
    ];
    const intents = homepageIntents(termTotals(tree));
    expect(intents.map((intent) => [intent.slug, intent.count])).toEqual([
      ["quick", 4],
      ["drink", 7],
    ]);
    expect(countLabel(7, intents[1].noun)).toBe("7 drinks");
    expect(countLabel(1, "recipe")).toBe("1 recipe");
  });

  it("falls back to the flat vocabulary for bare tags", () => {
    const intents = homepageIntents(new Map(), [
      { slug: "vegetarian", label: "vegetarian", count: 2 },
    ]);
    expect(intents).toEqual([{ ...HOMEPAGE_INTENTS[1], count: 2 }]);
  });

  it("is empty for a corpus with none of the terms", () => {
    expect(homepageIntents(new Map(), [])).toEqual([]);
  });
});

describe("coming up", () => {
  const recipes: Record<
    string,
    { slug: string; date: number; image?: string; name: string }[]
  > = {
    christmas: [
      { slug: "linzer", date: 3, name: "Linzer" },
      { slug: "stollen", date: 2, image: "stollen.jpg", name: "Stollen" },
    ],
    "christmas-cookies": [
      { slug: "linzer", date: 3, name: "Linzer" },
      { slug: "spritz", date: 5, image: "spritz.jpg", name: "Spritz" },
    ],
    halloween: [{ slug: "mummy-dogs", date: 1, name: "Mummy Dogs" }],
  };
  const groups: Record<string, { slug: string }[]> = {
    christmas: [{ slug: "christmas-baking" }],
  };
  const rows = (slug: string) => recipes[slug] ?? [];
  const groupRows = (slug: string) => groups[slug] ?? [];

  it("is null with no holidays root", () => {
    expect(
      comingUpEntries([node("course", 1, [node("main", 1)])], rows, groupRows),
    ).toBe(null);
  });

  it("counts each holiday's subtree once and picks the newest photo", () => {
    const tree = [
      node("holidays", 6, [
        node("christmas", 4, [node("christmas-cookies", 2)]),
        node("halloween", 1),
        node("easter", 0),
        node("thanksgiving", 0, [], "turkey.png"),
      ]),
    ];
    const entries = comingUpEntries(tree, rows, groupRows)!;
    expect(entries.map((entry) => entry.slug)).toEqual([
      "christmas",
      "halloween",
    ]);
    expect(entries[0]).toMatchObject({
      recipes: 3,
      groups: 1,
      recipeImage: { slug: "spritz", image: "spritz.jpg" },
    });
    expect(entries[1]).not.toHaveProperty("recipeImage");
  });

  it("prefers the term's own picture", () => {
    const tree = [node("holidays", 1, [node("christmas", 3, [], "tree.png")])];
    const [entry] = comingUpEntries(tree, rows, groupRows)!;
    expect(entry.image).toBe("tree.png");
    expect(entry).not.toHaveProperty("recipeImage");
  });
});
