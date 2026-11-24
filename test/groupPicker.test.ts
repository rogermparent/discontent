import { describe, expect, it } from "vitest";
import {
  filterGroupChoices,
  groupChoiceCount,
  groupHasRecipe,
  type GroupChoice,
} from "recipe-website-common/util/groupChoices";
import {
  upcomingHolidays,
  type HolidayChoice,
} from "recipe-website-common/util/upcomingHolidays";

const choice = (slug: string, name: string): GroupChoice => ({
  slug,
  name,
  itemCount: 2,
  hasRecipe: false,
});

describe("51 group picker rules", () => {
  it("filters by every word of the name or slug, keeping order", () => {
    const groups = [
      choice("thanksgiving-2026", "Thanksgiving plan"),
      choice("week-of-nov-2", "Weeknights"),
      choice("christmas-cookies", "Christmas Cookies"),
    ];
    expect(filterGroupChoices(groups, "").map((g) => g.slug)).toHaveLength(3);
    expect(filterGroupChoices(groups, "  ")).toHaveLength(3);
    expect(filterGroupChoices(groups, "cook xmas")).toEqual([]);
    expect(filterGroupChoices(groups, "COOKIES christ")[0]?.slug).toBe(
      "christmas-cookies",
    );
    expect(filterGroupChoices(groups, "nov").map((g) => g.slug)).toEqual([
      "week-of-nov-2",
    ]);
  });

  it("says a group's size", () => {
    expect(groupChoiceCount(0)).toBe("empty");
    expect(groupChoiceCount(1)).toBe("1 item");
    expect(groupChoiceCount(5)).toBe("5 items");
  });

  it("knows a group already has a recipe (a sub-group row never matches)", () => {
    expect(groupHasRecipe([{ recipe: "pie" }, { recipe: "ham" }], "ham")).toBe(
      true,
    );
    expect(groupHasRecipe([{}, { recipe: "pie" }], "ham")).toBe(false);
    expect(groupHasRecipe(undefined, "ham")).toBe(false);
  });
});

describe("51 upcoming holiday chips", () => {
  const holidays: HolidayChoice[] = [
    { slug: "christmas", label: "Christmas" },
    { slug: "thanksgiving", label: "Thanksgiving" },
    { slug: "new-years-eve", label: "New Year's Eve" },
    { slug: "made-up", label: "Made up" },
    { slug: "xmas", label: "Xmas", rule: "christmas" },
  ];

  it("takes the next 42 days, nearest first, at most three", () => {
    const got = upcomingHolidays(holidays, { year: 2026, month: 11, day: 24 });
    expect(got.map((h) => h.slug)).toEqual([
      "thanksgiving",
      "christmas",
      "xmas",
    ]);
    expect(got[0]).toMatchObject({ days: 2, when: "Thu 26 Nov" });
  });

  it("counts today and drops the ones already tagged or out of the window", () => {
    const today = { year: 2026, month: 11, day: 26 };
    expect(upcomingHolidays(holidays, today)[0]).toMatchObject({
      slug: "thanksgiving",
      days: 0,
    });
    const tagged = new Set(["thanksgiving"]);
    expect(
      upcomingHolidays(holidays, today, tagged).map((h) => h.slug),
    ).not.toContain("thanksgiving");
    /* 2026-10-01 is 55 days before Thanksgiving: nothing in the window. */
    expect(
      upcomingHolidays(holidays, { year: 2026, month: 10, day: 1 }),
    ).toEqual([]);
  });
});
