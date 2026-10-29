// 46f: per-option times on alternatives — the model (`readChoices`,
// `shownPath`, `pathTimes`), one value for the readers that need one
// (`recipeOnPath`, `timesOnPath`: JSON-LD, the plan's rows), field by field
// over the recipe's (Df1), the index and `time:` (`indexTimes`: the default
// path's times as the page shows them, Df2), the rule a worked-on option's
// times keep (`choiceProblems`), the write schema and the form's refusal. Then the model's look for alternatives: the
// outline it is shown, the grounding of its answer, and the call with
// `fetch` stubbed (never a real model).

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Recipe } from "recipe-website-common/controller/types";
import {
  ALL_OPTIONS,
  pathTimes,
  shownPath,
} from "recipe-website-common/util/alternatives";
import {
  indexTimes,
  readChoices,
  recipeOnPath,
  timesOnPath,
} from "recipe-website-common/util/readChoices";
import {
  choiceProblems,
  everySet,
} from "recipe-website-common/util/choiceChecks";
import buildRecipeIndexValue from "recipe-website-common/controller/buildIndexValue";
import { buildRecipeJsonLD } from "recipe-website-common/components/View/JsonLD";
import {
  matchesFilter,
  parseQuery,
} from "recipe-website-common/components/SearchForm/queryLanguage";
import {
  choiceOutline,
  groundChoiceSets,
  outlineHasCandidates,
  outlineText,
  setsAsSent,
} from "recipe-website-common/util/choiceOutline";
import { setOptionTime } from "recipe-website-common/components/Form/Instructions/choiceEdits";
import { RecipeInputSchema } from "../websites/recipe-website/editor/controller/curation/schema";
import parseRecipeFormData from "../websites/recipe-website/editor/controller/parseFormData";
import { recipeFormFailure } from "../websites/recipe-website/editor/controller/recipeFormErrors";
import type { LlmConfig } from "../websites/recipe-website/editor/controller/llm/client";
import {
  CHOICES_SYSTEM_PROMPT,
  checkChoicesAnswer,
  choicesUserPrompt,
  detectChoices,
} from "../websites/recipe-website/editor/controller/llm/detectChoices";
import { standInChat } from "../websites/recipe-website/editor/playwright/fixtures/llm/standInModel";
import { stepTitle } from "../websites/recipe-website/editor/controller/jobs/timeline";

/** A dough with no times of its own, then three ways to finish it. */
const DOUGH: Recipe = {
  name: "Everything Dough",
  date: 1_760_400_000_000,
  recipeYield: "1 batch of dough",
  ingredients: [{ ingredient: "500 g bread flour" }],
  instructions: [
    { name: "Dough", instructions: [{ text: "Mix and rise." }] },
    {
      name: "Bagels",
      choice: "Then make",
      recipeYield: "8 bagels",
      prepTime: 45,
      cookTime: 20,
      totalTime: 135,
      instructions: [{ text: "Shape, boil and bake." }],
    },
    {
      name: "Pretzels",
      choice: "Then make",
      totalTime: 90,
      instructions: [{ text: "Shape, dip and bake." }],
    },
    {
      name: "Pizza",
      choice: "Then make",
      instructions: [{ text: "Stretch, top and bake." }],
    },
  ],
};

describe("option times in the model (46f)", () => {
  it("each option carries its own times; one with none has none", () => {
    const choices = readChoices(DOUGH);
    expect(choices.sets[0].options.map((option) => option.times)).toEqual([
      { prepTime: 45, cookTime: 20, totalTime: 135 },
      { totalTime: 90 },
      undefined,
    ]);
  });

  it("the path's times are the chosen option's; none under All or an untimed pick", () => {
    const choices = readChoices(DOUGH);
    expect(shownPath(choices).times).toEqual({
      prepTime: 45,
      cookTime: 20,
      totalTime: 135,
    });
    expect(shownPath(choices, { "then-make": "pretzels" }).times).toEqual({
      totalTime: 90,
    });
    expect(shownPath(choices, { "then-make": "pizza" }).times).toBeUndefined();
    expect(
      shownPath(choices, { "then-make": ALL_OPTIONS }).times,
    ).toBeUndefined();
  });

  it("pathTimes, no option times: the recipe's own, a missing total is prep + cook", () => {
    expect(pathTimes({ prepTime: 10, cookTime: 5 }, undefined)).toEqual({
      prepTime: 10,
      cookTime: 5,
      totalTime: 15,
    });
    expect(pathTimes({ prepTime: 10, totalTime: 120 }, undefined)).toEqual({
      prepTime: 10,
      cookTime: 0,
      totalTime: 120,
    });
    expect(pathTimes({}, undefined)).toEqual({
      prepTime: 0,
      cookTime: 0,
      totalTime: 0,
    });
  });

  it("pathTimes (Df1): each stated time replaces only that one of the recipe's", () => {
    /* The orchestrator's example: recipe prep 30 / total 120, option cook
       25 — prep stays 30, cook is 25, and the total is prep + cook. */
    expect(
      pathTimes({ prepTime: 30, totalTime: 120 }, { cookTime: 25 }),
    ).toEqual({ prepTime: 30, cookTime: 25, totalTime: 55 });
    /* A stated total wins; prep and cook stay the recipe's. */
    expect(
      pathTimes(
        { prepTime: 10, cookTime: 5, totalTime: 15 },
        { totalTime: 90 },
      ),
    ).toEqual({ prepTime: 10, cookTime: 5, totalTime: 90 });
    /* Prep and cook stated, no total: their sum, never the recipe's. */
    expect(
      pathTimes({ totalTime: 300 }, { prepTime: 30, cookTime: 20 }),
    ).toEqual({ prepTime: 30, cookTime: 20, totalTime: 50 });
    /* One stated, the other the recipe's: still both known. */
    expect(pathTimes({ prepTime: 10, totalTime: 99 }, { cookTime: 5 })).toEqual(
      { prepTime: 10, cookTime: 5, totalTime: 15 },
    );
    /* Prep or cook stated and the other unknown: no total, not the
       recipe's (a different dish's) and not half a sum. */
    expect(pathTimes({ totalTime: 120 }, { cookTime: 25 })).toEqual({
      prepTime: 0,
      cookTime: 25,
      totalTime: 0,
    });
    expect(pathTimes({}, { prepTime: 40 })).toEqual({
      prepTime: 40,
      cookTime: 0,
      totalTime: 0,
    });
    /* Every field stated: the option's alone. */
    expect(
      pathTimes(
        { prepTime: 1, cookTime: 2, totalTime: 3 },
        { prepTime: 45, cookTime: 20, totalTime: 135 },
      ),
    ).toEqual({ prepTime: 45, cookTime: 20, totalTime: 135 });
  });

  it("two sets: the chosen options' times merge field by field, the later over the earlier", () => {
    const twoSets: Recipe = {
      name: "Two sets",
      date: 1,
      instructions: [
        {
          name: "Thin",
          choice: "Crust",
          prepTime: 20,
          instructions: [{ text: "Roll thin." }],
        },
        {
          name: "Thick",
          choice: "Crust",
          instructions: [{ text: "Press thick." }],
        },
        {
          name: "Oven",
          choice: "Bake",
          cookTime: 12,
          prepTime: 5,
          instructions: [{ text: "Bake." }],
        },
        {
          name: "Grill",
          choice: "Bake",
          cookTime: 8,
          instructions: [{ text: "Grill." }],
        },
      ],
    };
    const choices = readChoices(twoSets);
    expect(shownPath(choices).times).toEqual({ prepTime: 5, cookTime: 12 });
    expect(shownPath(choices, { bake: "grill" }).times).toEqual({
      prepTime: 20,
      cookTime: 8,
    });
    expect(timesOnPath(twoSets, { bake: "grill" })).toEqual({
      prepTime: 20,
      cookTime: 8,
      totalTime: 28,
    });
  });
});

describe("one value: the default option's times (46f, G2)", () => {
  it("recipeOnPath maps the chosen option's times field by field over the recipe's", () => {
    const own: Recipe = { ...DOUGH, prepTime: 10, cookTime: 3 };
    const onDefault = recipeOnPath(own);
    expect([
      onDefault.prepTime,
      onDefault.cookTime,
      onDefault.totalTime,
    ]).toEqual([45, 20, 135]);
    /* Pretzels states only a total: the recipe's prep and cook stand. */
    const pretzels = recipeOnPath(own, { "then-make": "pretzels" });
    expect([pretzels.prepTime, pretzels.cookTime, pretzels.totalTime]).toEqual([
      10, 3, 90,
    ]);
    /* An untimed option leaves the recipe's own times exactly as stored. */
    const pizza = recipeOnPath(own, { "then-make": "pizza" });
    expect([pizza.prepTime, pizza.cookTime, pizza.totalTime]).toEqual([
      10,
      3,
      undefined,
    ]);
    /* The example: recipe prep 30 / total 120, option cook 25. */
    const example: Recipe = {
      ...DOUGH,
      prepTime: 30,
      totalTime: 120,
      instructions: [
        DOUGH.instructions[0],
        {
          name: "Bagels",
          choice: "Then make",
          cookTime: 25,
          instructions: [{ text: "Boil and bake." }],
        },
        DOUGH.instructions[3],
      ],
    };
    const onExample = recipeOnPath(example);
    expect([
      onExample.prepTime,
      onExample.cookTime,
      onExample.totalTime,
    ]).toEqual([30, 25, 55]);
    expect(timesOnPath(example)).toEqual({
      prepTime: 30,
      cookTime: 25,
      totalTime: 55,
    });
    /* No total known on the path: absent, not the recipe's 120. */
    const unknown = recipeOnPath({ ...example, prepTime: undefined });
    expect("totalTime" in unknown).toBe(false);
    expect(unknown.cookTime).toBe(25);
  });

  /* A plan's row (`planRecipeView`) is `recipeOnPath`'s too; its module
   * reads the cached aggregates, which load only under Next. */
  it("JSON-LD reads the default option's times", () => {
    const jsonLD = buildRecipeJsonLD(DOUGH, undefined) as unknown as Record<
      string,
      unknown
    >;
    expect(jsonLD).toMatchObject({
      prepTime: "PT45M",
      cookTime: "PT20M",
      totalTime: "PT2H15M",
    });
  });

  it("JSON-LD's total is the page's: no total on the path is none, not a half sum", () => {
    const cookOnly: Recipe = {
      ...DOUGH,
      totalTime: 120,
      instructions: [
        DOUGH.instructions[0],
        {
          name: "Bagels",
          choice: "Then make",
          cookTime: 25,
          instructions: [{ text: "Boil and bake." }],
        },
        DOUGH.instructions[3],
      ],
    };
    const jsonLD = buildRecipeJsonLD(cookOnly, undefined) as unknown as Record<
      string,
      unknown
    >;
    expect(jsonLD.cookTime).toBe("PT25M");
    expect(jsonLD.totalTime).toBeUndefined();
    expect(jsonLD.prepTime).toBeUndefined();
    /* A plain recipe keeps the page's prep + cook total. */
    const plain = buildRecipeJsonLD(
      { name: "Plain", date: 1, prepTime: 10, cookTime: 5 },
      undefined,
    ) as unknown as Record<string, unknown>;
    expect(plain.totalTime).toBe("PT15M");
  });

  it("a recipe without option times reads exactly as before", () => {
    const plain: Recipe = {
      ...DOUGH,
      prepTime: 10,
      instructions: DOUGH.instructions.map((entry) =>
        "instructions" in entry
          ? {
              name: entry.name,
              instructions: entry.instructions,
              ...(entry.choice ? { choice: entry.choice } : {}),
            }
          : entry,
      ),
    };
    expect(recipeOnPath(plain).prepTime).toBe(10);
    expect(recipeOnPath(plain).totalTime).toBeUndefined();
  });
});

describe("the index and time: (46f)", () => {
  it("a recipe that states no times carries its default option's", () => {
    expect(indexTimes(DOUGH)).toEqual({
      prepTime: 45,
      cookTime: 20,
      totalTime: 135,
    });
    const value = buildRecipeIndexValue(DOUGH);
    expect([value.prepTime, value.cookTime, value.totalTime]).toEqual([
      45, 20, 135,
    ]);
    const timed = (query: string) =>
      matchesFilter(value, parseQuery(query).filter);
    expect(timed("time:>120")).toBe(true);
    expect(timed("time:<60")).toBe(false);
  });

  it("Df2: the default path's times exactly as the page shows them, the recipe's own under them", () => {
    /* Bagels states all three: the recipe's total is replaced. */
    const own: Recipe = { ...DOUGH, totalTime: 30 };
    expect(indexTimes(own)).toEqual({
      prepTime: 45,
      cookTime: 20,
      totalTime: 135,
    });
    /* The example: recipe prep 30 / total 120, option cook 25 → 30/25/55,
       as the page shows it, and `time:` agrees. */
    const example: Recipe = {
      ...DOUGH,
      prepTime: 30,
      totalTime: 120,
      instructions: [
        DOUGH.instructions[0],
        {
          name: "Bagels",
          choice: "Then make",
          cookTime: 25,
          instructions: [{ text: "Boil and bake." }],
        },
        DOUGH.instructions[3],
      ],
    };
    const value = buildRecipeIndexValue(example);
    expect([value.prepTime, value.cookTime, value.totalTime]).toEqual([
      30, 25, 55,
    ]);
    expect(value.totalTime).toBe(timesOnPath(example).totalTime);
    const timed = (query: string) =>
      matchesFilter(value, parseQuery(query).filter);
    expect(timed("time:<60")).toBe(true);
    expect(timed("time:>100")).toBe(false);
  });

  it("an untimed default option keeps the recipe's own as stored", () => {
    const pizzaFirst: Recipe = {
      ...DOUGH,
      prepTime: 10,
      cookTime: 5,
      instructions: [
        DOUGH.instructions[0],
        DOUGH.instructions[3],
        DOUGH.instructions[1],
      ],
    };
    expect(indexTimes(pizzaFirst)).toEqual({
      prepTime: 10,
      cookTime: 5,
      totalTime: undefined,
    });
  });

  it("an untimed default option, or no alternatives, carries nothing new", () => {
    const pizzaFirst: Recipe = {
      ...DOUGH,
      instructions: [
        DOUGH.instructions[0],
        DOUGH.instructions[3],
        DOUGH.instructions[1],
        DOUGH.instructions[2],
      ],
    };
    const value = buildRecipeIndexValue(pizzaFirst);
    expect([value.prepTime, value.cookTime, value.totalTime]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    const lone: Recipe = {
      name: "Lone",
      date: 1,
      instructions: [
        { name: "Bagels", totalTime: 90, instructions: [{ text: "Bake." }] },
      ],
    };
    expect(buildRecipeIndexValue(lone).totalTime).toBeUndefined();
  });
});

describe("an option's times keep the total rule (46f)", () => {
  it("a total shorter than the option's cook or prep time is a problem", () => {
    const broken = DOUGH.instructions.map((entry, index) =>
      index === 2 ? { ...entry, prepTime: 100 } : entry,
    );
    expect(choiceProblems(broken, everySet(broken))).toEqual([
      {
        index: 2,
        field: "totalTime",
        message:
          "The total time of “Pretzels” (1 hr 30 min) is shorter than its prep time (1 hr 40 min)",
      },
    ]);
    expect(
      choiceProblems(DOUGH.instructions, everySet(DOUGH.instructions)),
    ).toEqual([]);
    /* As stored (no set worked on), nothing is judged (43-D4). */
    expect(choiceProblems(broken)).toEqual([]);
  });

  it("the write schema keeps whole minutes, drops a 0, refuses a broken total", () => {
    const parsed = RecipeInputSchema.parse({
      name: "Timed",
      instructions: DOUGH.instructions.map((entry, index) =>
        index === 3 ? { ...entry, cookTime: 0 } : entry,
      ),
    });
    /* As stored: the 0 is no key at all. */
    expect(JSON.parse(JSON.stringify(parsed.instructions))).toEqual(
      DOUGH.instructions,
    );
    expect(JSON.stringify(parsed.instructions)).not.toContain('cookTime":0');
    expect(
      RecipeInputSchema.safeParse({
        name: "Timed",
        instructions: [
          DOUGH.instructions[0],
          { ...DOUGH.instructions[1], prepTime: 1.5 },
          DOUGH.instructions[2],
        ],
      }).success,
    ).toBe(false);
    const short = RecipeInputSchema.safeParse({
      name: "Timed",
      instructions: [
        DOUGH.instructions[0],
        { ...DOUGH.instructions[1], totalTime: 10 },
        DOUGH.instructions[2],
      ],
    });
    expect(short.success).toBe(false);
    expect(short.error?.issues[0].message).toMatch(
      /^The total time of “Bagels” \(10 min\) is shorter than its cook time/,
    );
  });

  it("setOptionTime sets a time and clears one with 0", () => {
    const set = setOptionTime(DOUGH.instructions, 3, "cookTime", 12);
    expect(set[3]).toMatchObject({ name: "Pizza", cookTime: 12 });
    const cleared = setOptionTime(set, 3, "cookTime", 0);
    expect("cookTime" in cleared[3]).toBe(false);
    expect(cleared[1]).toBe(DOUGH.instructions[1]);
  });
});

/** An old recipe whose groups `suggestChoices` reads as stages, not a choice. */
const OLD: Recipe = {
  name: "Weeknight Chili",
  date: 1,
  instructions: [
    { text: "Brown the beef and onions." },
    {
      name: "On the stove",
      instructions: [{ text: "Simmer **covered** for 1 hour." }],
    },
    {
      name: "In the slow cooker",
      instructions: [{ text: "Cook on low for 8 hours." }],
    },
    {
      name: "Toppings",
      instructions: [{ text: "Top with cheese." }],
      choice: "Garnish",
    },
  ],
};

describe("the outline the model is shown (46f)", () => {
  it("lists each entry, its group's name and first line, plain", () => {
    const outline = choiceOutline(OLD.instructions);
    expect(outline[1]).toEqual({
      group: true,
      name: "On the stove",
      first: "Simmer covered for 1 hour.",
      inChoice: false,
    });
    expect(outline[3].inChoice).toBe(true);
    expect(outlineHasCandidates(outline)).toBe(true);
    expect(outlineText(outline)).toBe(
      [
        "1. step — Brown the beef and onions.",
        "2. group “On the stove” — Simmer covered for 1 hour.",
        "3. group “In the slow cooker” — Cook on low for 8 hours.",
        "4. group “Toppings” (already in a choice) — Top with cheese.",
      ].join("\n"),
    );
    expect(
      outlineHasCandidates(choiceOutline(OLD.instructions.slice(0, 2))),
    ).toBe(false);
  });
});

describe("the model's sets against the steps it was sent (46f review)", () => {
  const steps = [
    { name: "Dough", instructions: [{ text: "Mix." }] },
    { name: "Bagels", instructions: [{ text: "Boil." }] },
    { name: "Pretzels", instructions: [{ text: "Dip." }] },
    { name: "Pizza", instructions: [{ text: "Top." }] },
  ];
  const sets = [{ label: "Then make", groups: [1, 2, 3] }];

  it("keeps a set whose groups are as they were sent", () => {
    const sent = choiceOutline(steps);
    expect(setsAsSent(sent, steps, sets)).toEqual({ kept: sets, changed: 0 });
    /* A changed first line does not matter: the names are what the set is. */
    const edited = steps.map((group, index) =>
      index === 2
        ? { ...group, instructions: [{ text: "Dip in lye." }] }
        : group,
    );
    expect(setsAsSent(sent, edited, sets).changed).toBe(0);
  });

  it("drops a set whose groups moved, were renamed or removed while it looked", () => {
    const sent = choiceOutline(steps);
    const moved = [steps[0], steps[2], steps[1], steps[3]];
    expect(setsAsSent(sent, moved, sets)).toEqual({ kept: [], changed: 1 });
    const renamed = steps.map((group, index) =>
      index === 3 ? { ...group, name: "Flatbread" } : group,
    );
    expect(setsAsSent(sent, renamed, sets).changed).toBe(1);
    const removed = steps.slice(0, 3);
    expect(setsAsSent(sent, removed, sets).changed).toBe(1);
    /* A group turned into a bare step at the same place. */
    const flattened = [steps[0], steps[1], { text: "Pretzels" }, steps[3]];
    expect(setsAsSent(sent, flattened, sets).changed).toBe(1);
    /* Only the set that changed goes. */
    const two = [
      { label: "Then make", groups: [1, 2] },
      { label: "Or", groups: [3, 4] },
    ];
    const five = [
      ...steps,
      { name: "Focaccia", instructions: [{ text: "Dimple." }] },
    ];
    const fiveSent = choiceOutline(five);
    const lastRenamed = five.map((group, index) =>
      index === 4 ? { ...group, name: "Fougasse" } : group,
    );
    expect(setsAsSent(fiveSent, lastRenamed, two)).toEqual({
      kept: [two[0]],
      changed: 1,
    });
  });
});

describe("an option's bad time says where (46f review, 45d's rule)", () => {
  it("names the option and the field", () => {
    const formData = new FormData();
    formData.set("name", "Everything Dough");
    formData.set("instructions[0].name", "Bagels");
    formData.set("instructions[0].choice", "Then make");
    formData.set("instructions[0].instructions[0].text", "Boil.");
    formData.set("instructions[0].prepTime.minutes", "-5");
    formData.set("instructions[1].name", "Pretzels");
    formData.set("instructions[1].choice", "Then make");
    formData.set("instructions[1].instructions[0].text", "Dip.");
    formData.set("instructions[1].totalTime.hours", "two");
    formData.set("instructions[1].totalTime.minutes", "x");
    const result = parseRecipeFormData(formData);
    expect(result.success).toBe(false);
    if (result.success) return;
    const { errors } = recipeFormFailure(result.error);
    expect(errors.instructions).toEqual([
      "Option “Bagels” prep time isn't a number",
      "Option “Pretzels” total time isn't a number",
    ]);
  });
});

describe("grounding the model's answer (46f)", () => {
  const outline = choiceOutline(OLD.instructions);

  it("keeps adjacent open groups, as 0-based indexes", () => {
    expect(
      groundChoiceSets([{ label: " Method ", groups: [3, 2] }], outline),
    ).toEqual({
      sets: [{ label: "Method", groups: [1, 2] }],
      droppedNumbers: 0,
      droppedSets: 0,
    });
  });

  it("drops bad numbers one by one: missing, a step, in a choice, repeated", () => {
    expect(
      groundChoiceSets(
        [{ label: "Method", groups: [2, 3, 3, 99, 1, 4, 2.5] }],
        outline,
      ),
    ).toEqual({
      sets: [{ label: "Method", groups: [1, 2] }],
      droppedNumbers: 5,
      droppedSets: 0,
    });
  });

  it("drops a whole set: too few left, not adjacent, a bad label, taken", () => {
    const four = choiceOutline([
      { name: "A", instructions: [{ text: "a" }] },
      { name: "B", instructions: [{ text: "b" }] },
      { name: "C", instructions: [{ text: "c" }] },
    ]);
    expect(
      groundChoiceSets(
        [
          { label: "One", groups: [1, 99] },
          { label: "Gap", groups: [1, 3] },
          { label: "", groups: [1, 2] },
          { label: "x".repeat(41), groups: [1, 2] },
          { label: "Kept", groups: [1, 2] },
          { label: "Taken", groups: [2, 3] },
        ],
        four,
      ),
    ).toEqual({
      sets: [{ label: "Kept", groups: [0, 1] }],
      droppedNumbers: 2,
      droppedSets: 5,
    });
  });

  it("a bad answer is no sets and says so", () => {
    expect(checkChoicesAnswer({ choices: [] }, outline)).toEqual({
      sets: [],
      warnings: ["The model's answer was not a list of choices."],
    });
    expect(
      checkChoicesAnswer(
        { sets: [{ label: "Method", groups: [2, 3, 7] }] },
        outline,
      ),
    ).toEqual({
      sets: [{ label: "Method", groups: [1, 2] }],
      warnings: [
        "Dropped from the model's answer: 1 group number that did not fit the recipe.",
      ],
    });
  });
});

const OLLAMA: LlmConfig = {
  url: "http://127.0.0.1:11434",
  model: "qwen3:8b",
  api: "ollama",
};

interface Call {
  url: string;
  body: Record<string, unknown>;
}

/** An Ollama that answers every chat with `answer`. */
function stubModel(answer: unknown) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body ?? "{}")) });
      return new Response(
        JSON.stringify({
          model: "qwen3:8b",
          message: {
            role: "assistant",
            content:
              typeof answer === "string" ? answer : JSON.stringify(answer),
          },
          done: true,
          prompt_eval_count: 200,
          eval_count: 20,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
  return calls;
}

describe("detectChoices (46f, a stubbed model)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const outline = choiceOutline(OLD.instructions);

  it("asks once with its own prompt and schema, and answers the grounded sets", async () => {
    const calls = stubModel({
      sets: [{ label: "Method", groups: [2, 3, 4] }],
    });
    const result = await detectChoices(OLD.name, outline, { config: OLLAMA });
    expect(calls).toHaveLength(1);
    const messages = calls[0].body.messages as {
      role: string;
      content: string;
    }[];
    expect(messages[0].content).toBe(CHOICES_SYSTEM_PROMPT);
    expect(messages[1].content).toBe(choicesUserPrompt(OLD.name, outline));
    expect(messages[1].content).toContain(
      "3. group “In the slow cooker” — Cook on low for 8 hours.",
    );
    expect(calls[0].body.format).toMatchObject({ required: ["sets"] });
    expect(result).toEqual({
      sets: [{ label: "Method", groups: [1, 2] }],
      model: "local model qwen3:8b",
      warnings: [
        "Dropped from the model's answer: 1 group number that did not fit the recipe.",
      ],
    });
  });

  it("a garbled answer, or nothing that fits, is nothing found", async () => {
    stubModel("not json at all");
    const garbled = await detectChoices(OLD.name, outline, { config: OLLAMA });
    expect(garbled.sets).toEqual([]);
    expect(garbled.warnings[0]).toMatch(/^The model's call failed: /);

    stubModel({ sets: [{ label: "Stages", groups: [1, 4] }] });
    const nothing = await detectChoices(OLD.name, outline, { config: OLLAMA });
    expect(nothing.sets).toEqual([]);
    expect(nothing.warnings).toEqual([
      "Dropped from the model's answer: 1 set and 2 group numbers that did not fit the recipe.",
    ]);

    stubModel({ sets: [] });
    expect(await detectChoices(OLD.name, outline, { config: OLLAMA })).toEqual({
      sets: [],
      model: "local model qwen3:8b",
      warnings: [],
    });
  });

  it("its step reads as a person would say it on /jobs", () => {
    expect(stepTitle({ step: "llm.choices", data: {} })).toBe(
      "Model looks for alternatives",
    );
  });

  it("with no model configured, asks nothing", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const key of [
      "RECIPE_LLM_URL",
      "RECIPE_LLM_API",
      "RECIPE_LLM_API_KEY",
      "RECIPE_LLM_MODEL",
    ]) {
      vi.stubEnv(key, "");
    }
    const result = await detectChoices(OLD.name, outline, {
      config: undefined,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(result.sets).toEqual([]);
    expect(result.warnings[0]).toMatch(/No model is configured/);
  });

  it("the stand-in proposes the run of open groups after a shared start, and one bad number", () => {
    const answer = standInChat({
      messages: [
        { role: "system", content: CHOICES_SYSTEM_PROMPT },
        { role: "user", content: choicesUserPrompt(OLD.name, outline) },
      ],
    });
    const data = JSON.parse(answer.message.content);
    expect(data).toEqual({
      sets: [{ label: "Then make", groups: [2, 3, 99] }],
    });
    expect(checkChoicesAnswer(data, outline).sets).toEqual([
      { label: "Then make", groups: [1, 2] },
    ]);
  });
});
