// Epic 50, 50c: the walkthrough — Now → After by composition, an edited
// accept, "Always do this" (each kind, refused for amounts), the rules tier
// (rename rules, switched-off rules and merges) and the run history. The
// pure helpers first; then the seat in a real git repository.

import { mkdtemp, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import simpleGit, { type SimpleGit } from "simple-git";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import {
  addShoppingLayer,
  addToShopping,
  decideShoppingMerge,
  decideTidySuggestion,
  promoteShoppingLayer,
  readShopping,
  readShoppingLayers,
  readShoppingView,
  readTidyRuns,
  removeShoppingRule,
  setShoppingRuleOn,
  writeTidyRun,
} from "../websites/recipe-website/editor/controller/curation/shopping";
import {
  ruleIdOf,
  type ShoppingLayer,
  type ShoppingLayerOp,
  type ShoppingRule,
} from "recipe-website-common/util/shoppingLayers";
import {
  DEFAULT_SHOPPING_SETTINGS,
  type ShoppingItem,
} from "recipe-website-common/util/shoppingTypes";
import { findShoppingProposals } from "recipe-website-common/util/shoppingConsolidate";
import {
  mergeIdOf,
  type ShoppingMerge,
} from "recipe-website-common/util/shoppingMerges";
import type {
  TidyRun,
  TidyRunView,
} from "recipe-website-common/util/shoppingTidy";
import { buildShoppingView } from "recipe-website-common/util/shoppingView";
import {
  applyWalkEdits,
  composeWalk,
  isEdited,
  listRules,
  nextCard,
  pickRun,
  promoteLayer,
  runHistory,
  sameShape,
  suggestionDiff,
  walkCards,
  walkCounts,
  walkFields,
  LIST_ONLY_WHY,
} from "recipe-website-common/util/shoppingWalk";

let next = 0;
function item(text: string): ShoppingItem {
  next += 1;
  return { id: `01j${String(next).padStart(8, "0")}`, text };
}

const settings = DEFAULT_SHOPPING_SETTINGS;

function labels(view: ReturnType<typeof composeWalk>): string[] {
  return view.stores.flatMap((list) =>
    list.sections.flatMap((section) => section.rows.map((row) => row.label)),
  );
}

describe("Now → After is the list composed with the suggestion (Dc2)", () => {
  const oil = item("1 cup vegetable oil");
  const fat = item("vegetable shortening");
  const salt = item("1 tsp salt");
  const sea = item("1 pinch sea salt");
  const items = [oil, fat, salt, sea];
  const input = { items, settings };

  it("a leave-off and an added amount: the rows now, the rows after, and why", () => {
    const ops: ShoppingLayerOp[] = [
      { op: "drop", ids: [fat.id], reason: "fry in the vegetable oil" },
      { op: "amount", ids: [oil.id], add: "2½ qt" },
    ];
    const diff = suggestionDiff(input, ops);
    expect(diff.now.map((line) => line.label)).toEqual([
      "1 cup vegetable oil",
      "vegetable shortening",
    ]);
    expect(diff.after).toEqual([
      { key: expect.any(String), label: "11 cups vegetable oil" },
      {
        key: expect.any(String),
        label: "vegetable shortening",
        leftOff: "fry in the vegetable oil",
      },
    ]);
    /* Exactly what Accept makes: the same layer on the list. */
    const accepted: ShoppingLayer = {
      id: "01kaaaaaaaaaaaaaaaaaaaaa01",
      ops,
      by: { kind: "model", model: "qwen3:8b" },
      at: "",
      on: true,
    };
    expect(labels(composeWalk({ ...input, layers: [accepted] }))).toContain(
      "11 cups vegetable oil",
    );
    expect(
      labels(
        buildShoppingView(items, settings, [], [], [], { layers: [accepted] }),
      ),
    ).not.toContain("vegetable shortening");
  });

  it("an aisle move says where to, a merge is one row, a note shows under it", () => {
    const moved = suggestionDiff(input, [
      { op: "aisle", ids: [salt.id, sea.id], aisle: "check" },
    ]);
    expect(moved.after.map((line) => line.movedTo)).toEqual([
      "Check at home first",
      "Check at home first",
    ]);
    const merged = suggestionDiff(input, [
      { op: "merge", ids: [salt.id, sea.id], name: "salt" },
      { op: "note", ids: [salt.id], text: "table salt is fine" },
    ]);
    expect(merged.now).toHaveLength(2);
    expect(merged.after).toHaveLength(1);
    expect(merged.after[0].notes).toEqual(["table salt is fine"]);
  });
});

describe("Edit before Accept keeps the suggestion's shape (Dc4)", () => {
  const cream = item("1 cup heavy cream");
  const sugar = item("1 cup sugar");
  const ops: ShoppingLayerOp[] = [
    { op: "amount", ids: [cream.id], amount: "1 quart" },
    { op: "note", ids: [cream.id], text: "≈ 1 cup needed" },
    { op: "drop", ids: [sugar.id], reason: "on hand" },
  ];

  it("offers the names, amounts and notes; an edit changes only those", () => {
    const fields = walkFields(ops, [cream, sugar]);
    expect(fields.map((field) => [field.id, field.label, field.value])).toEqual(
      [
        ["0:amount", "Amount for heavy cream", "1 quart"],
        ["1:text", "Note on heavy cream", "≈ 1 cup needed"],
      ],
    );
    const edited = applyWalkEdits(ops, { "0:amount": " 1 pint " });
    expect(edited).toEqual({
      ops: [{ ...ops[0], amount: "1 pint" }, ops[1], ops[2]],
    });
    if (!("ops" in edited)) throw new Error("edited");
    expect(sameShape(ops, edited.ops)).toBe(true);
    expect(isEdited(ops, edited.ops)).toBe(true);
    /* Review 1: a note alone edited is an edit (a signature leaves it out). */
    const note = applyWalkEdits(ops, { "1:text": "a big carton" });
    expect("ops" in note && isEdited(ops, note.ops)).toBe(true);
    const same = applyWalkEdits(ops, {});
    expect("ops" in same && isEdited(ops, same.ops)).toBe(false);
    expect(applyWalkEdits(ops, { "0:amount": "" })).toEqual({
      error: "An amount can't be empty.",
    });
    /* Another row, another reason or another op is not an edit. */
    expect(
      sameShape(ops, [{ ...ops[0], ids: [sugar.id] }, ops[1], ops[2]]),
    ).toBe(false);
    expect(
      sameShape(ops, [ops[0], ops[1], { ...ops[2], reason: "buy it" }]),
    ).toBe(false);
    expect(sameShape(ops, ops.slice(0, 2))).toBe(false);
    /* A merge's name and amount may be emptied: the list's own. */
    const merge: ShoppingLayerOp[] = [
      { op: "merge", ids: [cream.id, sugar.id], name: "x", amount: "2" },
    ];
    expect(applyWalkEdits(merge, { "0:name": "", "0:amount": "" })).toEqual({
      ops: [{ op: "merge", ids: [cream.id, sugar.id] }],
    });
  });
});

describe('"Always do this": a change by names, or why not (Dc5)', () => {
  const eggs = item("2 eggs");
  const egg = item("1 large egg");
  const white = item("1 egg white");
  const butter = item("1 tbsp butter");
  const items = [eggs, egg, white, butter];

  it("each kind becomes rules by its lines' names", () => {
    expect(
      promoteLayer(
        {
          ops: [
            { op: "merge", ids: [eggs.id, white.id], name: "eggs" },
            { op: "rename", ids: [butter.id], name: "unsalted butter" },
            { op: "drop", ids: [white.id], reason: "from the eggs" },
            { op: "aisle", ids: [butter.id], aisle: "dairy-eggs" },
          ],
        },
        items,
      ),
    ).toEqual({
      ok: true,
      rules: [
        { kind: "merge", keys: ["egg", "egg white"], name: "eggs" },
        {
          kind: "rename",
          key: "butter",
          name: "butter",
          label: "unsalted butter",
        },
        {
          kind: "leave-off",
          key: "egg white",
          name: "egg white",
          reason: "from the eggs",
        },
        { kind: "aisle", key: "butter", name: "butter", aisle: "dairy-eggs" },
      ],
    });
  });

  it("refuses amounts and notes, a merge of one name, and Check at home", () => {
    for (const op of [
      { op: "amount", ids: [butter.id], amount: "1 lb" },
      { op: "note", ids: [butter.id], text: "salted is fine" },
      { op: "merge", ids: [eggs.id, white.id], amount: "6" },
    ] as ShoppingLayerOp[]) {
      expect(promoteLayer({ ops: [op] }, items)).toEqual({
        ok: false,
        why: LIST_ONLY_WHY,
      });
    }
    /* One bad op refuses the whole change. */
    expect(
      promoteLayer(
        {
          ops: [
            { op: "drop", ids: [white.id], reason: "x" },
            { op: "amount", ids: [eggs.id], add: "1" },
          ],
        },
        items,
      ).ok,
    ).toBe(false);
    expect(
      promoteLayer({ ops: [{ op: "merge", ids: [eggs.id, egg.id] }] }, items),
    ).toMatchObject({ ok: false, why: expect.stringContaining("one name") });
    expect(
      promoteLayer(
        { ops: [{ op: "aisle", ids: [butter.id], aisle: "check" }] },
        items,
      ),
    ).toMatchObject({ ok: false });
    /* A rename of a row of several names; a change switched off. */
    expect(
      promoteLayer(
        { ops: [{ op: "rename", ids: [eggs.id, white.id], name: "eggs" }] },
        items,
      ),
    ).toMatchObject({
      ok: false,
      why: expect.stringContaining("several names"),
    });
    expect(
      promoteLayer(
        { ops: [{ op: "drop", ids: [white.id], reason: "x" }], on: false },
        items,
      ),
    ).toMatchObject({
      ok: false,
      why: expect.stringContaining("switched off"),
    });
  });
});

describe("rules for every list: renames, and switched off (Dc6, Dc7)", () => {
  const butter = item("1 tbsp butter");
  const water = item("1 cup water");
  const flour = item("2 cups all-purpose flour");
  const white = item("1 cup white flour");
  const items = [butter, water, flour, white];
  const rename: ShoppingRule = {
    id: ruleIdOf("rename", "butter"),
    kind: "rename",
    key: "butter",
    name: "butter",
    label: "unsalted butter",
    decidedAt: "",
  };

  it("a rename rule labels its name's row; off, it does nothing", () => {
    const on = composeWalk({ items, settings, rules: [rename] });
    expect(labels(on)).toContain("1 tbsp unsalted butter");
    const row = on.stores[0].sections
      .flatMap((section) => section.rows)
      .find((each) => each.label.includes("unsalted"))!;
    expect(row.changes?.[0]).toMatchObject({ source: "rule", op: "rename" });
    const off = composeWalk({
      items,
      settings,
      rules: [{ ...rename, on: false }],
    });
    expect(labels(off)).toContain("1 tbsp butter");
  });

  it("a merge switched off is undecided: rows apart, the proposal back", () => {
    const keys = ["all purpose flour", "white flour"];
    const merge: ShoppingMerge = {
      id: mergeIdOf(keys),
      keys,
      status: "merged",
      decidedAt: "",
    };
    expect(labels(composeWalk({ items, settings, merges: [merge] }))).toContain(
      "3 cups all-purpose flour",
    );
    expect(findShoppingProposals(items, settings, [merge])).toHaveLength(0);
    const off = { ...merge, on: false as const };
    expect(
      labels(composeWalk({ items, settings, merges: [off] })).filter((label) =>
        label.includes("flour"),
      ),
    ).toHaveLength(2);
    expect(findShoppingProposals(items, settings, [off])).toHaveLength(1);
  });

  it("the tier lists built-ins, yours, merges and aisles, each switchable or not", () => {
    const leave: ShoppingRule = {
      id: ruleIdOf("leave-off", "ice"),
      kind: "leave-off",
      key: "ice",
      name: "ice",
      leaveOff: true,
      reason: "the freezer makes it",
      decidedAt: "",
    };
    const restored: ShoppingRule = {
      id: ruleIdOf("leave-off", "ice water"),
      kind: "leave-off",
      key: "ice water",
      leaveOff: false,
      decidedAt: "",
    };
    const listed = listRules(
      [leave, restored, rename],
      [
        {
          id: mergeIdOf(["a", "b"]),
          keys: ["a", "b"],
          status: "apart",
          decidedAt: "",
        },
      ],
      { aisleOverrides: { butter: "dairy-eggs" } },
    );
    expect(
      listed.map((rule) => [
        rule.source,
        rule.text,
        rule.on,
        rule.switchable,
        rule.removable,
      ]),
    ).toEqual([
      ["built-in", "Leave off water", true, true, false],
      ["built-in", "Leave off tap water", true, true, false],
      ["built-in", "Leave off ice water", false, true, false],
      ["leave-off", "Leave off ice", true, true, true],
      ["rename", "Call butter “unsalted butter”", true, true, true],
      ["apart", "Keep a and b apart", true, true, true],
      ["aisle", "butter in Dairy & eggs", true, false, true],
    ]);
  });
});

describe("the cards and the runs (Dc3, Dc8)", () => {
  const view = (
    id: string,
    counts: Partial<TidyRunView["counts"]>,
    model = "qwen3:8b",
  ) =>
    ({
      id,
      model,
      choice: model,
      on: "current",
      at: "2026-11-21T10:00:00.000Z",
      suggestions: [],
      leftOut: [],
      counts: { pending: 0, accepted: 0, skipped: 0, stale: 0, ...counts },
    }) as TidyRunView;

  it("history is newest first with its counts; picking a run shows that one", () => {
    const older = view("01kaaaaaaaaaaaaaaaaaaaaa01", {
      accepted: 2,
      skipped: 1,
    });
    const newer = view(
      "01kaaaaaaaaaaaaaaaaaaaaa02",
      { pending: 3 },
      "qwen3:14b",
    );
    expect(
      runHistory([older, newer]).map((entry) => [
        entry.model,
        entry.accepted,
        entry.pending,
      ]),
    ).toEqual([
      ["qwen3:14b", 0, 3],
      ["qwen3:8b", 2, 0],
    ]);
    expect(pickRun([older, newer])?.id).toBe(newer.id);
    expect(pickRun([older, newer], older.id)?.id).toBe(older.id);
    expect(pickRun([older, newer], "gone")?.id).toBe(newer.id);
    expect(pickRun([])).toBeUndefined();
  });

  it("built-in cards come first; the next card is the next pending one", () => {
    const a = item("2 cups all-purpose flour");
    const b = item("1 cup white flour");
    const proposals = findShoppingProposals([a, b], settings);
    const run = {
      ...view("01kaaaaaaaaaaaaaaaaaaaaa03", {}),
      suggestions: [
        { id: "01kaaaaaaaaaaaaaaaaaaaaa03-1", status: "pending" },
        { id: "01kaaaaaaaaaaaaaaaaaaaaa03-2", status: "stale" },
        { id: "01kaaaaaaaaaaaaaaaaaaaaa03-3", status: "skipped" },
        { id: "01kaaaaaaaaaaaaaaaaaaaaa03-4", status: "pending" },
      ],
    } as unknown as TidyRunView;
    const cards = walkCards({ proposals, answered: new Map(), run });
    expect(cards.map((card) => [card.source, card.status])).toEqual([
      ["built-in", "pending"],
      ["model", "pending"],
      ["model", "skipped"],
      ["model", "pending"],
    ]);
    expect(nextCard(cards)?.source).toBe("built-in");
    expect(nextCard(cards, cards[1].id)?.id).toBe(cards[3].id);
    expect(nextCard(cards, cards[3].id)?.id).toBe(cards[0].id);
    expect(walkCounts(cards)).toEqual({ accepted: 0, skipped: 1, pending: 3 });
    /* Review 4: a pending card naming a line no longer on the list is gone. */
    const gone = walkCards({
      proposals: [],
      answered: new Map(),
      run: {
        ...run,
        suggestions: [
          {
            id: "01kaaaaaaaaaaaaaaaaaaaaa03-1",
            status: "pending",
            ops: [{ op: "drop", ids: ["01jgone00000"], reason: "x" }],
          },
        ],
      } as unknown as TidyRunView,
      present: new Set([a.id]),
    });
    expect(gone).toEqual([]);
    /* Merged on this page: the proposal has gone, the card stays, accepted. */
    const after = walkCards({
      proposals: [],
      answered: new Map([
        [proposals[0].id, { status: "accepted", proposal: proposals[0] }],
      ]),
      run,
    });
    expect(after[0]).toMatchObject({ source: "built-in", status: "accepted" });
    /* Skipped on this page: still open, shown skipped. */
    const skipped = walkCards({
      proposals,
      answered: new Map([
        [proposals[0].id, { status: "skipped", proposal: proposals[0] }],
      ]),
    });
    expect(skipped[0].status).toBe("skipped");
    expect(nextCard(skipped)).toBeUndefined();
  });
});

// --- the seat, in a real repository ---------------------------------------------

const AUTHOR = { name: "Test Curator", email: "curator@test.local" };
let contentDirectory: string;
let git: SimpleGit;
let ctx: CurationContext;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "shopping-walk-"));
  git = simpleGit({ baseDir: contentDirectory });
  await git.init();
  await git.addConfig("user.email", AUTHOR.email);
  await git.addConfig("user.name", AUTHOR.name);
  await git.addConfig("commit.gpgsign", "false");
  await writeFile(
    join(contentDirectory, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
  );
  await git.add(".");
  await git.commit("Initial commit");
  ctx = { contentDirectory, author: AUTHOR };
});

afterEach(async () => {
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

const RUN = "01k" + "d".repeat(23);

async function latest(): Promise<string> {
  return (await git.log()).latest?.message ?? "";
}

describe("the seat (50c)", () => {
  it("an edited Accept writes the person's ops and keeps the model's; a new shape is refused", async () => {
    await addToShopping(ctx, { items: ["1 1/2 cups buttermilk", "2 eggs"] });
    const { items } = await readShopping(ctx);
    const milk = items.find((each) => each.text.includes("buttermilk"))!;
    const eggs = items.find((each) => each.text.includes("eggs"))!;
    const ops: ShoppingLayerOp[] = [
      { op: "amount", ids: [milk.id], amount: "1 quart" },
      { op: "note", ids: [milk.id], text: "1½ cups needed" },
    ];
    const run: TidyRun = {
      id: RUN,
      model: "qwen3:8b",
      choice: "qwen3:8b",
      on: "current",
      at: "2026-11-21T10:00:00.000Z",
      suggestions: [
        {
          id: `${RUN}-1`,
          kind: "store-size",
          title: "Buy a quart of buttermilk",
          reason: "",
          ops,
          warnings: [],
        },
        {
          id: `${RUN}-2`,
          kind: "rename",
          title: "Say large eggs",
          reason: "",
          ops: [{ op: "rename", ids: [eggs.id], name: "large eggs" }],
          warnings: [],
        },
      ],
      status: {},
      leftOut: [],
    };
    await writeTidyRun(ctx, run);
    await expect(
      decideTidySuggestion(ctx, `${RUN}-1`, "accept", {
        ops: [{ op: "drop", ids: [milk.id], reason: "no" }, ops[1]],
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("names, amounts and notes only"),
    });
    const edited = [{ ...ops[0], amount: "1 pint" }, ops[1]];
    await decideTidySuggestion(ctx, `${RUN}-1`, "accept", { ops: edited });
    expect(await latest()).toBe(
      "Update shopping list: accept (edited): Buy a quart of buttermilk (qwen3:8b)",
    );
    const [layer] = await readShoppingLayers(ctx);
    expect(layer.ops).toEqual(edited);
    expect(layer.edited).toMatchObject({ ops });
    expect(layer.by).toEqual({ kind: "model", model: "qwen3:8b" });
    const [kept] = await readTidyRuns(ctx);
    expect(kept.status[`${RUN}-1`]).toMatchObject({
      status: "accepted",
      edited: true,
    });
    expect((await readShoppingView(ctx)).text).toContain("1 pint buttermilk");
    const row = (await readShoppingView(ctx)).view.stores[0].sections
      .flatMap((section) => section.rows)
      .find((each) => each.label.includes("buttermilk"))!;
    expect(row.changes?.[0]).toMatchObject({ edited: true });

    /* An Accept with the model's own ops is no edit. */
    await decideTidySuggestion(ctx, `${RUN}-2`, "accept", {
      ops: run.suggestions[1].ops,
    });
    expect(await latest()).toBe(
      "Update shopping list: accept: Say large eggs (qwen3:8b)",
    );
  });

  it("Always do this writes the rules and takes the change in one commit; amounts are refused", async () => {
    await addToShopping(ctx, {
      items: ["1 tbsp butter", "2 eggs", "1 egg white", "1 tsp vanilla"],
    });
    const { items } = await readShopping(ctx);
    const id = (text: string) => items.find((each) => each.text === text)!.id;
    const { layer } = await addShoppingLayer(ctx, {
      ops: [
        { op: "merge", ids: [id("2 eggs"), id("1 egg white")], name: "eggs" },
        { op: "rename", ids: [id("1 tbsp butter")], name: "unsalted butter" },
        { op: "aisle", ids: [id("1 tbsp butter")], aisle: "dairy-eggs" },
      ],
      reason: "how I buy them",
    });
    await promoteShoppingLayer(ctx, { id: layer!.id });
    expect(await latest()).toMatch(/^Update shopping list: always: /);
    const shown = await git.raw(["show", "--name-only", "--format=", "HEAD"]);
    expect(shown.trim().split("\n").sort()).toEqual(
      [
        `shopping/layers/${layer!.id}.json`,
        `shopping/merges/${mergeIdOf(["egg", "egg white"])}.json`,
        `shopping/rules/${ruleIdOf("rename", "butter")}.json`,
        "shopping/settings.json",
      ].sort(),
    );
    const state = await readShopping(ctx);
    expect(state.layers).toEqual([]);
    expect(state.settings.aisleOverrides).toEqual({ butter: "dairy-eggs" });
    const { text } = await readShoppingView(ctx);
    expect(text).toContain("1 tbsp unsalted butter");
    expect(text).toMatch(/3 eggs/);

    const { layer: amount } = await addShoppingLayer(ctx, {
      ops: [{ op: "amount", ids: [id("1 tsp vanilla")], amount: "1 bottle" }],
    });
    await expect(
      promoteShoppingLayer(ctx, { id: amount!.id }),
    ).rejects.toMatchObject({ message: LIST_ONLY_WHY });
    expect(await readShoppingLayers(ctx)).toHaveLength(1);

    /* A rule switched off keeps its file and does nothing; Remove deletes it. */
    const renameId = ruleIdOf("rename", "butter");
    await setShoppingRuleOn(ctx, { kind: "rule", id: renameId, on: false });
    expect(await latest()).toBe(
      "Update shopping list: rule off: call butter unsalted butter",
    );
    expect((await readShoppingView(ctx)).text).toContain("1 tbsp butter");
    expect(
      (await setShoppingRuleOn(ctx, { kind: "rule", id: renameId, on: false }))
        .changed,
    ).toBe(false);
    await removeShoppingRule(ctx, { kind: "rule", id: renameId });
    expect((await readShopping(ctx)).rules).toEqual([]);
    await removeShoppingRule(ctx, { kind: "aisle", key: "butter" });
    expect((await readShopping(ctx)).settings.aisleOverrides).toEqual({});
    expect(await latest()).toBe(
      "Update shopping list: remove rule: butter in its own aisle",
    );

    /* A merge decision switched off: the rows apart; on again: merged. */
    const mergeId = mergeIdOf(["egg", "egg white"]);
    await setShoppingRuleOn(ctx, { kind: "merge", id: mergeId, on: false });
    expect((await readShopping(ctx)).merges[0].on).toBe(false);
    expect((await readShoppingView(ctx)).text).toContain("1 egg white");
    await setShoppingRuleOn(ctx, { kind: "merge", id: mergeId, on: true });
    expect((await readShopping(ctx)).merges[0].on).toBeUndefined();
  });

  it("refuses a merge whose names a rule merges with others already", async () => {
    await addToShopping(ctx, {
      items: [
        "2 cups all-purpose flour",
        "1 cup white flour",
        "1 cup bread flour",
      ],
    });
    await decideShoppingMerge(ctx, {
      keys: ["all purpose flour", "white flour"],
      status: "merged",
    });
    const { items } = await readShopping(ctx);
    const id = (text: string) => items.find((each) => each.text === text)!.id;
    const { layer } = await addShoppingLayer(ctx, {
      ops: [
        {
          op: "merge",
          ids: [id("1 cup white flour"), id("1 cup bread flour")],
        },
      ],
    });
    await expect(
      promoteShoppingLayer(ctx, { id: layer!.id }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("merged by a rule already"),
    });
  });
});
