// @vitest-environment node
//
// 38c: the deterministic fixes to the local model's answer
// (`tidyReading.ts`), one per epic-36 trap, each against the trap's own real
// example (the 36c/36d measurement texts and the model's answers to them),
// and each with the near miss it must leave alone. `fetch` is stubbed for
// the extractor runs: never a real model here.

import { afterEach, describe, expect, it, vi } from "vitest";

import type { LlmConfig } from "../websites/recipe-website/editor/controller/llm/client";
import { extractRecipeWithLlm } from "../websites/recipe-website/editor/controller/llm/extractRecipe";
import { readPastedText } from "../websites/recipe-website/editor/controller/llm/importWithLlm";
import {
  allInTime,
  capsName,
  colonlessHeadings,
  creditSteps,
  isCreditLine,
  sentences,
  splitMethod,
  tidyReading,
  wholeTime,
} from "../websites/recipe-website/editor/controller/llm/tidyReading";
import { memoryJobLog } from "../websites/recipe-website/editor/controller/jobs/log";

const CONFIG: LlmConfig = {
  url: "http://model.test:11434",
  model: "qwen3:8b",
  api: "ollama",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A model that answers every chat call with `answer`; the bodies it was sent. */
function stubModel(answer: unknown) {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith("/api/chat")) {
        bodies.push(JSON.parse(String(init?.body)));
      }
      return new Response(
        JSON.stringify({
          model: "qwen3:8b",
          done: true,
          message: { role: "assistant", content: JSON.stringify(answer) },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
  return bodies;
}

/* 36c's emailed chili (T24, T25, T26), as pasted. */
const EMAIL = `From: Aunt Carol <carol.b@example.net>
Subject: RE: RE: that chili!!

Hi hon!! Here's the chili you asked about, I don't really measure but this is close.

CAROL'S WHITE CHICKEN CHILI
(feeds a crowd, 8 or so)

2 lbs boneless chicken thighs
1 big onion chopped
4 cloves garlic, minced
2 cans (15 oz) great northern beans, drained -- don't rinse them
1 can (4 oz) diced green chiles
4 cups chicken broth
1 tsp cumin
1 tsp dried oregano
1/2 tsp cayenne (more if you're brave lol)
salt and pepper
1 cup sour cream
a handful of cilantro

brown the chicken in a big pot w/ a little oil, take it out. cook the onion and garlic till soft maybe 5 min. put everything back in except the sour cream and cilantro and simmer 45 min. shred the chicken with 2 forks. stir in sour cream at the end and top w/ cilantro.

Takes about an hour all in. It's even better the next day!!

Love,
Carol`;

/* qwen3:8b's answer to it (36c's real run): one step, prep 60, the name in capitals. */
const EMAIL_ANSWER = {
  found: true,
  name: "CAROL'S WHITE CHICKEN CHILI",
  recipeYield: "feeds a crowd, 8 or so",
  prepTime: "about an hour",
  ingredients: [
    "2 lbs boneless chicken thighs",
    "1 big onion chopped",
    "4 cloves garlic, minced",
    "2 cans (15 oz) great northern beans, drained -- don't rinse them",
    "1 can (4 oz) diced green chiles",
    "4 cups chicken broth",
    "1 tsp cumin",
    "1 tsp dried oregano",
    "1/2 tsp cayenne (more if you're brave lol)",
    "salt and pepper",
    "1 cup sour cream",
    "a handful of cilantro",
  ],
  instructions: [
    "brown the chicken in a big pot w/ a little oil, take it out. cook the onion and garlic till soft maybe 5 min. put everything back in except the sour cream and cilantro and simmer 45 min. shred the chicken with 2 forks. stir in sour cream at the end and top w/ cilantro.",
  ],
};

describe("36-T24: an unnumbered method as one step", () => {
  it("cuts Aunt Carol's paragraph at its sentences, words unchanged — across 'min.'", () => {
    const data = { instructions: [...EMAIL_ANSWER.instructions] };
    const changes = splitMethod(data);
    expect(data.instructions).toEqual([
      "brown the chicken in a big pot w/ a little oil, take it out.",
      "cook the onion and garlic till soft maybe 5 min.",
      "put everything back in except the sour cream and cilantro and simmer 45 min.",
      "shred the chicken with 2 forks.",
      "stir in sour cream at the end and top w/ cilantro.",
    ]);
    expect(changes).toEqual([
      expect.objectContaining({ rule: "split-method", trap: "T24" }),
    ]);
  });

  it("cuts a one-step method at its line breaks first", () => {
    const data = {
      instructions: ["Mix the dough.\nLet it rise 1 hr.\nBake at 400°F"],
    };
    splitMethod(data);
    expect(data.instructions).toEqual([
      "Mix the dough.",
      "Let it rise 1 hr.",
      "Bake at 400°F",
    ]);
  });

  it("minds abbreviations: approx., tsp., a single letter, a time carried on", () => {
    expect(
      sentences(
        "Add approx. 2 cups stock and 1 tsp. salt. Simmer 10 min. or until thick. Serve, says J. Kenji. Done.",
      ),
    ).toEqual([
      "Add approx. 2 cups stock and 1 tsp. salt.",
      "Simmer 10 min. or until thick.",
      "Serve, says J. Kenji.",
      "Done.",
    ]);
    expect(sentences("Preheat to 350°F. Line a sheet.")).toEqual([
      "Preheat to 350°F.",
      "Line a sheet.",
    ]);
  });

  it("leaves a short two-sentence step, and several steps, as they are", () => {
    const short = {
      instructions: ["Shake with ice. Strain into a chilled glass."],
    };
    expect(splitMethod(short)).toEqual([]);
    expect(short.instructions).toHaveLength(1);
    const several = {
      instructions: ["Mix. Stir. Bake.", "Cool. Slice. Serve."],
    };
    expect(splitMethod(several)).toEqual([]);
  });

  it("never splits a hard-wrapped line mid-sentence (38c review)", () => {
    const data = {
      instructions: [
        "Preheat the oven to 350°F and grease a 9x13\npan with butter. In a large bowl, whisk together\nthe flour, sugar, and baking powder until well\ncombined, about 2 minutes. Pour the batter into\nthe prepared pan and bake for 35 minutes.",
      ],
    };
    const changes = splitMethod(data);
    expect(data.instructions).toEqual([
      "Preheat the oven to 350°F and grease a 9x13 pan with butter.",
      "In a large bowl, whisk together the flour, sugar, and baking powder until well combined, about 2 minutes.",
      "Pour the batter into the prepared pan and bake for 35 minutes.",
    ]);
    expect(changes[0]).toMatchObject({ rule: "split-method", trap: "T24" });
  });

  it("never ends a sentence on 'in.'/'cm.'/'mm.' when a number precedes it", () => {
    expect(
      sentences("Pour into a 9-in. pan. Bake at 350°F for 45 min."),
    ).toEqual(["Pour into a 9-in. pan.", "Bake at 350°F for 45 min."]);
    expect(sentences("Cut a round 9 in. across. Dust with flour.")).toEqual([
      "Cut a round 9 in. across.",
      "Dust with flour.",
    ]);
    expect(sentences("Roll it out 25 cm. wide. Chill it.")).toEqual([
      "Roll it out 25 cm. wide.",
      "Chill it.",
    ]);
    /* No number before "in.": a normal sentence end. */
    expect(sentences("Place the dish in. Serve warm.")).toEqual([
      "Place the dish in.",
      "Serve warm.",
    ]);
  });

  it("keeps a section heading where it is", () => {
    const data = {
      instructions: [
        "Chili:",
        "brown the chicken, take it out. cook the onion. simmer it all.",
      ],
    };
    splitMethod(data);
    expect(data.instructions).toEqual([
      "Chili:",
      "brown the chicken, take it out.",
      "cook the onion.",
      "simmer it all.",
    ]);
  });
});

describe("36-T25: a name in capitals", () => {
  it("title-cases Lagerstrom's and Carol's names, minus RECIPE and the colon", () => {
    expect(capsName("DRUNKEN NOODLES RECIPE:")).toBe("Drunken Noodles");
    expect(capsName("PEANUT BUTTER COOKIE RECIPE:")).toBe(
      "Peanut Butter Cookie",
    );
    expect(capsName("CAROL'S WHITE CHICKEN CHILI")).toBe(
      "Carol's White Chicken Chili",
    );
    expect(capsName("FRIED SHALLOTS (FOR THE CASSEROLE)")).toBe(
      "Fried Shallots (For the Casserole)",
    );
    expect(capsName("BBQ STIR-FRY WITH RICE")).toBe("BBQ Stir-Fry with Rice");
  });

  it("keeps short acronyms with a vowel, and 'y'-only words like NYC (38c review)", () => {
    expect(capsName("NYC BLACK AND WHITE COOKIES")).toBe(
      "NYC Black and White Cookies",
    );
    expect(capsName("IPA BEER BREAD")).toBe("IPA Beer Bread");
    expect(capsName("XO SAUCE NOODLES")).toBe("XO Sauce Noodles");
    expect(capsName("DIY PIZZA DOUGH")).toBe("DIY Pizza Dough");
    expect(capsName("USA STYLE PANCAKES")).toBe("USA Style Pancakes");
  });

  it("leaves any name that is not wholly in capitals", () => {
    expect(
      capsName("SOURDOUGH ENGLISH MUFFIN RECIPE | Super Fluffy!"),
    ).toBeUndefined();
    expect(capsName("Drunken Noodles")).toBeUndefined();
    expect(capsName("BLT")).toBeUndefined();
    expect(capsName("RECIPE")).toBe("Recipe");
  });
});

describe("36-T26: 'all in' is the total time", () => {
  it("moves Carol's 'about an hour' from prep to total", () => {
    const data: Record<string, unknown> = { prepTime: "about an hour" };
    const changes = allInTime(data, EMAIL);
    expect(data).toEqual({ totalTime: "about an hour" });
    expect(changes[0]).toMatchObject({ rule: "all-in-time", trap: "T26" });
    expect(wholeTime(EMAIL)).toEqual({
      minutes: 60,
      clause: "Takes about an hour all in",
    });
  });

  it("needs the phrase, a time in its clause, and the model's time to match it", () => {
    /* No "all in": prep stays prep. */
    const plain: Record<string, unknown> = { prepTime: "about an hour" };
    allInTime(plain, "Takes about an hour. Serves 4.");
    expect(plain).toEqual({ prepTime: "about an hour" });
    /* "all in" in a method sentence is no time. */
    expect(wholeTime("Put it all in the pot and simmer 45 min.")).toBe(
      undefined,
    );
    /* A total already read is kept. */
    const total: Record<string, unknown> = {
      prepTime: "1 hour",
      totalTime: "2 hours",
    };
    allInTime(total, EMAIL);
    expect(total).toEqual({ prepTime: "1 hour", totalTime: "2 hours" });
    /* A prep time that is not the whole time stays. */
    const prep: Record<string, unknown> = { prepTime: "15 minutes" };
    allInTime(prep, EMAIL);
    expect(prep).toEqual({ prepTime: "15 minutes" });
    expect(wholeTime("Start to finish: 2 hours")).toMatchObject({
      minutes: 120,
    });
  });

  it("never reads 'all-in-one' as a whole time, or splits a decimal clause (38c review)", () => {
    expect(wholeTime("An all-in-one breakfast burrito. Serves 4.")).toBe(
      undefined,
    );
    expect(wholeTime("Takes 1.5 hours all in.")).toEqual({
      minutes: 90,
      clause: "Takes 1.5 hours all in",
    });
  });
});

/* 36c's Sally's card text, copied: "Icing" stands alone between the lists. */
const SALLY = `Ingredients

2 cups (170g) old-fashioned whole rolled oats
1 teaspoon salt
2 teaspoons pure vanilla extract

Icing

1 and 1/2 cups (180g) sifted confectioners’ sugar*
1/4 teaspoon pure vanilla extract
1.5 – 2 Tablespoons milk

Instructions`;

describe("36-T30: a colon-less sub-heading", () => {
  it("reads Sally's 'Icing' as a heading", () => {
    const data = {
      ingredients: [
        "2 cups (170g) old-fashioned whole rolled oats",
        "1 teaspoon salt",
        "2 teaspoons pure vanilla extract",
        "Icing",
        "1 1/2 cups (180g) sifted confectioners’ sugar*",
        "1/4 teaspoon pure vanilla extract",
        "1.5 – 2 Tablespoons milk",
      ],
    };
    const changes = colonlessHeadings(data, SALLY);
    expect(data.ingredients[3]).toBe("Icing:");
    expect(changes).toEqual([
      expect.objectContaining({ rule: "sub-heading", trap: "T30" }),
    ]);
  });

  it("reads a set-apart title-case or capitals part name too", () => {
    const source =
      "Cake\n\n2 cups flour\n1 cup sugar\n\nCream Cheese Layer\n\n8 oz cream cheese\n1 egg";
    const data = {
      ingredients: [
        "2 cups flour",
        "1 cup sugar",
        "Cream Cheese Layer",
        "8 oz cream cheese",
        "1 egg",
      ],
    };
    colonlessHeadings(data, source);
    expect(data.ingredients[2]).toBe("Cream Cheese Layer:");
  });

  it("leaves an amount-free ingredient inside a list", () => {
    const source = "1 cup rice\nHot sauce\n2 cups water\nSalt\n1 tbsp butter\n";
    const data = {
      ingredients: [
        "1 cup rice",
        "Hot sauce",
        "2 cups water",
        "Salt",
        "1 tbsp butter",
      ],
    };
    expect(colonlessHeadings(data, source)).toEqual([]);
    expect(data.ingredients).toEqual([
      "1 cup rice",
      "Hot sauce",
      "2 cups water",
      "Salt",
      "1 tbsp butter",
    ]);
    /* A line the source does not hold on its own is the model's, not a heading. */
    const invented = { ingredients: ["Icing", "1 cup sugar"] };
    expect(colonlessHeadings(invented, "1 cup sugar\n")).toEqual([]);
  });

  it("leaves a bought-as-is ingredient whose last word is a part word (38c review)", () => {
    const phrases = [
      "Store-bought pizza dough",
      "Pie crust",
      "Graham cracker crust",
      "Whipped topping",
      "Fresh herbs, for garnish",
    ];
    for (const phrase of phrases) {
      const source = `1 cup flour\n${phrase}\n2 cups sugar\n1 egg\n`;
      const data = {
        ingredients: ["1 cup flour", phrase, "2 cups sugar", "1 egg"],
      };
      expect(colonlessHeadings(data, source)).toEqual([]);
      expect(data.ingredients[1]).toBe(phrase);
    }
  });

  it("still reads a bare part name, or 'the <part word>', as a heading", () => {
    const source = "2 cups flour\n\nThe Filling\n\n1 cup jam\n1 egg\n";
    const data = {
      ingredients: ["2 cups flour", "The Filling", "1 cup jam", "1 egg"],
    };
    const changes = colonlessHeadings(data, source);
    expect(data.ingredients[1]).toBe("The Filling:");
    expect(changes).toHaveLength(1);
  });

  it("needs at least two amount-led lines after it", () => {
    const source = "Icing\n\n1 cup sugar\n";
    const data = { ingredients: ["Icing", "1 cup sugar"] };
    expect(colonlessHeadings(data, source)).toEqual([]);
  });
});

/* 36d's Lagerstrom English muffins: no method, a credit line. */
const MUFFIN_CREDIT =
  "THANKS TO AMERICAS TEST KITCHEN AND SERIOUS EATS FOR THE RECIPE INSPIRATION HERE.";

describe("36-T36: a credit line as the only step", () => {
  it("drops the muffins' credit line, leaving no steps", () => {
    const data = { instructions: [MUFFIN_CREDIT] };
    const changes = creditSteps(data);
    expect(data.instructions).toEqual([]);
    expect(changes[0]).toMatchObject({ rule: "credit-step", trap: "T36" });
  });

  it("keeps a step that cooks, whatever it credits", () => {
    expect(isCreditLine(MUFFIN_CREDIT)).toBe(true);
    expect(isCreditLine("Recipe adapted from Serious Eats.")).toBe(true);
    expect(
      isCreditLine("Thanks to the resting time, bake the dough at 450°F."),
    ).toBe(false);
    expect(isCreditLine("Ripen on counter overnight")).toBe(false);
  });
});

describe("tidyReading: the rules together", () => {
  it("fixes Carol's chili in one pass and leaves the model's answer alone", () => {
    const answer = structuredClone(EMAIL_ANSWER);
    const { data, changes } = tidyReading(answer, EMAIL);
    expect(changes.map((change) => change.rule)).toEqual([
      "split-method",
      "caps-name",
      "all-in-time",
    ]);
    expect(data.name).toBe("Carol's White Chicken Chili");
    expect(data.totalTime).toBe("about an hour");
    expect(data.prepTime).toBeUndefined();
    expect(data.instructions).toHaveLength(5);
    expect(answer).toEqual(EMAIL_ANSWER);
  });

  it("changes nothing in a reading with none of the traps", () => {
    const answer = {
      found: true,
      name: "Pancakes",
      prepTime: "10 minutes",
      ingredients: ["1 cup flour", "1 egg"],
      instructions: ["Whisk.", "Fry."],
    };
    expect(tidyReading(answer, "1 cup flour\n1 egg\nWhisk.\nFry.")).toEqual({
      data: answer,
      changes: [],
    });
  });

  it("is the extractor's: steps, total, name — each change a tidy note", async () => {
    stubModel(EMAIL_ANSWER);
    const { log, lines } = memoryJobLog();
    const extraction = await extractRecipeWithLlm({
      text: EMAIL,
      sourceKind: "text",
      config: CONFIG,
      job: { log },
    });
    expect(extraction.found).toBe(true);
    if (!extraction.found) return;
    expect(extraction.recipe.name).toBe("Carol's White Chicken Chili");
    expect(extraction.recipe.totalTime).toBe(60);
    expect(extraction.recipe.prepTime).toBeUndefined();
    expect(extraction.recipe.instructions).toHaveLength(5);
    expect(extraction.llm).toMatchObject({ grounded: 12, total: 12 });
    const tidy = lines.filter((line) => line.step === "tidy");
    expect(tidy.map((line) => line.data?.trap)).toEqual(["T24", "T25", "T26"]);
    const end = lines.find(
      (line) => line.step === "llm.extract" && line.phase === "end",
    );
    expect(end?.data?.tidied).toEqual([
      "split-method",
      "caps-name",
      "all-in-time",
    ]);
  });

  it("leaves the muffins with no steps: no longer trusted on a credit line", async () => {
    const text = `PREFERMENT
25g SOURDOUGH STARTER or small pinch instant yeast
75g WATER
75g AP FLOUR

DOUGH
300g or 1 1/2 C. WATER
7g or 1 1/2 TSP SALT

${MUFFIN_CREDIT}`;
    stubModel({
      found: true,
      name: "SOURDOUGH ENGLISH MUFFIN RECIPE | Super Fluffy!",
      ingredients: [
        "PREFERMENT:",
        "25g SOURDOUGH STARTER or small pinch instant yeast",
        "75g WATER",
        "75g AP FLOUR",
        "DOUGH:",
        "300g or 1 1/2 C. WATER",
        "7g or 1 1/2 TSP SALT",
      ],
      instructions: [MUFFIN_CREDIT],
    });
    const extraction = await extractRecipeWithLlm({
      text,
      sourceKind: "text",
      config: CONFIG,
    });
    expect(extraction.found).toBe(true);
    if (!extraction.found) return;
    expect(extraction.recipe.instructions).toEqual([]);
    expect(extraction.recipe.partial).toBe(true);
    expect(extraction.warnings[0]).toContain("it found no instructions");
  });
});

/* 36c's pasta salad (T23): the same paste, with and without --source. */
describe("36-T23: a pasted text's prompt is the same with a source URL", () => {
  const PASTA = [
    "Pasta Salad:",
    "2000g water",
    "235g rotini",
    "Dressing:",
    "25g grainy mustard",
    "200g neutral oil",
    "",
    "Boil the pasta. Blend the dressing. Toss.",
  ].join("\n");
  const ANSWER = {
    found: true,
    name: "Pasta Salad",
    ingredients: [
      "Pasta Salad:",
      "2000g water",
      "235g rotini",
      "Dressing:",
      "25g grainy mustard",
      "200g neutral oil",
    ],
    instructions: ["Boil the pasta.", "Blend the dressing.", "Toss."],
  };

  it("never names the URL to the model, and still cites it", async () => {
    const alone = stubModel(ANSWER);
    await readPastedText({ text: PASTA, config: CONFIG, split: false });
    const withSource = stubModel(ANSWER);
    const reading = await readPastedText({
      text: PASTA,
      source: "https://www.youtube.com/watch?v=lo2pf0pYB9U",
      config: CONFIG,
      split: false,
    });
    const userOf = (bodies: Record<string, unknown>[]) =>
      (bodies[0].messages as { role: string; content: string }[]).find(
        (message) => message.role === "user",
      )?.content;
    expect(userOf(withSource)).toBe(userOf(alone));
    expect(userOf(withSource)).not.toContain("Source URL");
    expect(reading.recipe.source?.url).toBe(
      "https://www.youtube.com/watch?v=lo2pf0pYB9U",
    );
    expect(reading.recipe.videoImportUrl).toBe(
      "https://www.youtube.com/watch?v=lo2pf0pYB9U",
    );
  });

  it("still names a page's URL", async () => {
    const bodies = stubModel(ANSWER);
    await extractRecipeWithLlm({
      text: PASTA,
      url: "https://example.com/pasta-salad",
      config: CONFIG,
    });
    const user = (
      bodies[0].messages as { role: string; content: string }[]
    ).find((message) => message.role === "user")?.content;
    expect(user).toContain("Source URL: https://example.com/pasta-salad");
  });
});
