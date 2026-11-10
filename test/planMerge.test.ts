// 46h (Roger's 43-Dp1-11 pick): "Try to merge" after a refused plan Save —
// the pure three-way merge of a plan's rows: the stored rows (theirs) and
// the person's draft (mine) over the rows the draft was made over (base).

import { describe, expect, it } from "vitest";
import type { GroupItem } from "recipe-website-common/controller/types";
import {
  planMerge,
  resolvePlanMerge,
  type MineRow,
  type PlanMergeInput,
} from "recipe-website-common/util/planMerge";

const NAMES: Record<string, string> = {
  a: "Apple Pie",
  b: "Brownies",
  c: "Carrot Cake",
  d: "Dumplings",
  week2: "Week 2",
};

const BASE: GroupItem[] = [
  { recipe: "a", label: "Mon" },
  { recipe: "b", label: "Tue", scale: "2" },
  { recipe: "c" },
];

/** Mine as the plan page's draft makes it: base rows, by index. */
function draft(
  order: number[],
  change: (item: GroupItem, index: number) => GroupItem = (item) => item,
): MineRow[] {
  return order.map((index) => ({
    item: change(BASE[index], index),
    base: index,
  }));
}

function input(mine: MineRow[], theirs: GroupItem[]): PlanMergeInput {
  return {
    base: BASE,
    mine,
    theirs,
    nameOf: (item) => NAMES[item.recipe ?? item.group ?? ""] ?? "?",
  };
}

const slugs = (items: GroupItem[]) =>
  items.map((item) => item.recipe ?? `group:${item.group}`);

describe("planMerge — what each side changed", () => {
  it("lists additions, removals, moves and field changes per side", () => {
    const merge = planMerge(
      input(
        draft([1, 0], (item, i) => (i === 0 ? { ...item, scale: "3" } : item)),
        [
          { recipe: "a", label: "Monday" },
          { recipe: "b", label: "Tue", scale: "2", note: "Double batch" },
          { recipe: "c" },
          { recipe: "d", label: "Wed" },
        ],
      ),
    );
    expect(merge.mine).toEqual([
      "Apple Pie: scale 1× → 3×",
      "Removed Carrot Cake",
      "Reordered the rows",
    ]);
    expect(merge.theirs).toEqual([
      "Apple Pie: label “Mon” → “Monday”",
      "Brownies: note none → “Double batch”",
      "Added Dumplings",
    ]);
    expect(merge.conflicts).toEqual([]);
  });

  it("asks about a field both changed differently, not one changed alike", () => {
    const merge = planMerge(
      input(
        draft([0, 1, 2], (item, i) =>
          i === 1
            ? { ...item, scale: "3" }
            : i === 0
              ? { ...item, label: "Sun" }
              : item,
        ),
        [
          { recipe: "a", label: "Sun" },
          { recipe: "b", label: "Tue", scale: "1/2" },
          { recipe: "c" },
        ],
      ),
    );
    expect(merge.conflicts).toEqual([
      {
        id: "field:1:scale",
        kind: "field",
        name: "Brownies",
        field: "scale",
        mine: "3×",
        theirs: "½×",
      },
    ]);
  });

  it("asks about a row one side removed and the other changed", () => {
    const merge = planMerge(
      input(draft([0, 1]), [
        { recipe: "a", label: "Mon" },
        { recipe: "b", label: "Tue", scale: "2" },
        { recipe: "c", note: "Make ahead" },
      ]),
    );
    expect(merge.conflicts).toEqual([
      {
        id: "removed:2",
        kind: "removed",
        name: "Carrot Cake",
        mine: "remove it",
        theirs: "keep it (note none → “Make ahead”)",
      },
    ]);
  });

  it("asks whose order when both reordered differently", () => {
    const merge = planMerge(
      input(draft([2, 0, 1]), [BASE[1], BASE[0], BASE[2]]),
    );
    expect(merge.conflicts.map((conflict) => conflict.id)).toEqual(["order"]);
    /* Both moved the rows the same way: no question. */
    const alike = planMerge(
      input(draft([1, 0, 2]), [BASE[1], BASE[0], BASE[2]]),
    );
    expect(alike.conflicts).toEqual([]);
  });
});

describe("resolvePlanMerge — the rows a Save merged writes", () => {
  it("takes each side's own changes, and theirs added after its row", () => {
    const merged = resolvePlanMerge(
      input(
        draft([1, 0, 2], (item, i) =>
          i === 2 ? { ...item, scale: "2" } : item,
        ),
        [
          { recipe: "a", label: "Monday" },
          { recipe: "d", label: "Wed" },
          { recipe: "b", label: "Tue", scale: "2" },
          { recipe: "c" },
        ],
      ),
    );
    expect(merged).toEqual([
      { recipe: "b", label: "Tue", scale: "2" },
      { recipe: "a", label: "Monday" },
      { recipe: "d", label: "Wed" },
      { recipe: "c", scale: "2" },
    ]);
  });

  it("drops a row either side removed, unless the other changed it", () => {
    const theirs = [
      { recipe: "a", label: "Mon" },
      { recipe: "c", note: "Make ahead" },
    ];
    /* Theirs removed Brownies, mine removed Carrot Cake (which theirs changed). */
    const mine = draft([0, 1]);
    expect(slugs(resolvePlanMerge(input(mine, theirs)))).toEqual(["a", "c"]);
    expect(
      slugs(resolvePlanMerge(input(mine, theirs), { "removed:2": "mine" })),
    ).toEqual(["a"]);
    /* Mine changed a row theirs removed: kept only when mine is chosen. */
    const scaled = draft([0, 1, 2], (item, i) =>
      i === 1 ? { ...item, scale: "4" } : item,
    );
    expect(
      resolvePlanMerge(input(scaled, [BASE[0], BASE[2]]), {
        "removed:1": "mine",
      }),
    ).toEqual([BASE[0], { recipe: "b", label: "Tue", scale: "4" }, BASE[2]]);
    expect(slugs(resolvePlanMerge(input(scaled, [BASE[0], BASE[2]])))).toEqual([
      "a",
      "c",
    ]);
  });

  it("writes the chosen side of a field conflict, and clears a 1× scale", () => {
    const mine = draft([0, 1, 2], (item, i) =>
      i === 1 ? { recipe: "b", label: "Tue" } : item,
    );
    const theirs = [
      BASE[0],
      { recipe: "b", label: "Tue", scale: "3" },
      BASE[2],
    ];
    expect(planMerge(input(mine, theirs)).conflicts).toHaveLength(1);
    expect(
      resolvePlanMerge(input(mine, theirs), { "field:1:scale": "mine" })[1],
    ).toEqual({ recipe: "b", label: "Tue" });
    expect(
      resolvePlanMerge(input(mine, theirs), { "field:1:scale": "theirs" })[1],
    ).toEqual({ recipe: "b", label: "Tue", scale: "3" });
  });

  it("follows the chosen order, placing the other side's additions", () => {
    const mine = draft([2, 0, 1]);
    const theirs = [
      BASE[1],
      BASE[0],
      { group: "week2" },
      BASE[2],
    ] as GroupItem[];
    expect(
      slugs(resolvePlanMerge(input(mine, theirs), { order: "mine" })),
    ).toEqual(["c", "a", "group:week2", "b"]);
    expect(
      slugs(resolvePlanMerge(input(mine, theirs), { order: "theirs" })),
    ).toEqual(["b", "a", "group:week2", "c"]);
  });

  it("falls back to occurrence for a relabelled twice-planned recipe", () => {
    const base: GroupItem[] = [
      { recipe: "a", label: "Mon" },
      { recipe: "a", label: "Thu" },
    ];
    const merged = resolvePlanMerge({
      base,
      mine: [
        { item: { recipe: "a", label: "Mon", scale: "2" }, base: 0 },
        { item: base[1], base: 1 },
      ],
      theirs: [
        { recipe: "a", label: "Mon" },
        { recipe: "a", label: "Thursday" },
      ],
      nameOf: () => "Apple Pie",
    });
    expect(merged).toEqual([
      { recipe: "a", label: "Mon", scale: "2" },
      { recipe: "a", label: "Thursday" },
    ]);
  });

  it("pairs a recipe planned twice by label before occurrence", () => {
    const base: GroupItem[] = [
      { recipe: "a", label: "Mon" },
      { recipe: "a", label: "Thu" },
    ];
    const nameOf = () => "Chili";
    /* Theirs removed Mon; mine noted Thu: one Thu, my note, no conflict. */
    const removed: PlanMergeInput = {
      base,
      mine: [
        { item: base[0], base: 0 },
        { item: { ...base[1], note: "Leftovers" }, base: 1 },
      ],
      theirs: [{ recipe: "a", label: "Thu" }],
      nameOf,
    };
    expect(planMerge(removed).conflicts).toEqual([]);
    expect(resolvePlanMerge(removed)).toEqual([
      { recipe: "a", label: "Thu", note: "Leftovers" },
    ]);
    /* Theirs put Chili Sun before Mon; mine noted Mon: the note stays on Mon. */
    const inserted: PlanMergeInput = {
      base,
      mine: [
        { item: { ...base[0], note: "Double it" }, base: 0 },
        { item: base[1], base: 1 },
      ],
      theirs: [
        { recipe: "a", label: "Sun" },
        { recipe: "a", label: "Mon" },
        { recipe: "a", label: "Thu" },
      ],
      nameOf,
    };
    expect(planMerge(inserted).conflicts).toEqual([]);
    expect(resolvePlanMerge(inserted)).toEqual([
      { recipe: "a", label: "Sun" },
      { recipe: "a", label: "Mon", note: "Double it" },
      { recipe: "a", label: "Thu" },
    ]);
  });

  it("changes nothing when neither side did", () => {
    expect(resolvePlanMerge(input(draft([0, 1, 2]), BASE))).toEqual(BASE);
    expect(planMerge(input(draft([0, 1, 2]), BASE))).toEqual({
      mine: [],
      theirs: [],
      conflicts: [],
    });
  });
});
