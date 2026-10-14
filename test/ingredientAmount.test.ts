import Fraction from "fraction.js";
import { describe, expect, it } from "vitest";
import {
  addAmounts,
  AS_NEEDED,
  formatAmount,
  isAsNeeded,
  normalizeUnit,
  parseAmount,
  scaleAmount,
  type Amount,
  type AmountPart,
} from "recipe-website-common/util/ingredientAmount";
import { UNITS } from "recipe-website-common/util/ingredientGrammar";

/** A line's amount as a list would show it; `null` when unread. */
function shown(line: string): string | null {
  const amount = parseAmount(line);
  return amount && formatAmount(amount);
}

function parts(line: string): AmountPart[] {
  const amount = parseAmount(line);
  expect(amount).not.toBeNull();
  return amount!.parts;
}

const amount = (...given: [number, string][]): Amount => ({
  parts: given.map(([qty, unit]) => {
    const found = normalizeUnit(unit);
    return found
      ? { qty, ...found }
      : { qty, unit: "", family: "count" as const };
  }),
});

describe("normalizeUnit", () => {
  it("reads spellings, plurals and full stops", () => {
    expect(normalizeUnit("Tablespoons")).toEqual({
      unit: "tbsp",
      family: "us-volume",
    });
    expect(normalizeUnit("tbsp.")?.unit).toBe("tbsp");
    expect(normalizeUnit("Tbs")?.unit).toBe("tbsp");
    expect(normalizeUnit("teaspoons")?.unit).toBe("tsp");
    expect(normalizeUnit("c.")?.unit).toBe("cup");
    expect(normalizeUnit("lbs.")).toEqual({ unit: "lb", family: "us-weight" });
    expect(normalizeUnit("pounds")?.unit).toBe("lb");
    expect(normalizeUnit("grams")).toEqual({
      unit: "g",
      family: "metric-weight",
    });
    expect(normalizeUnit("kilogram")?.unit).toBe("kg");
    expect(normalizeUnit("litres")).toEqual({
      unit: "l",
      family: "metric-volume",
    });
    expect(normalizeUnit("qt")?.unit).toBe("quart");
    expect(normalizeUnit("inches")).toEqual({
      unit: "inch",
      family: "container",
    });
    expect(normalizeUnit("bunches")?.unit).toBe("bunch");
    expect(normalizeUnit("pkg")?.unit).toBe("package");
  });

  it("T is a tablespoon and t a teaspoon", () => {
    expect(normalizeUnit("T")?.unit).toBe("tbsp");
    expect(normalizeUnit("T.")?.unit).toBe("tbsp");
    expect(normalizeUnit("t")?.unit).toBe("tsp");
  });

  it("oz is a weight; fl oz and fluid ounces are a volume", () => {
    expect(normalizeUnit("oz")).toEqual({ unit: "oz", family: "us-weight" });
    expect(normalizeUnit("ounces")?.family).toBe("us-weight");
    expect(normalizeUnit("fl oz")).toEqual({
      unit: "fl oz",
      family: "us-volume",
    });
    expect(normalizeUnit("fl. oz.")?.unit).toBe("fl oz");
    expect(normalizeUnit("floz")?.unit).toBe("fl oz");
    expect(normalizeUnit("fluid ounces")?.unit).toBe("fl oz");
  });

  it("is null for anything else, and for pinches", () => {
    expect(normalizeUnit("eggs")).toBeNull();
    expect(normalizeUnit("constructor")).toBeNull();
    expect(normalizeUnit("pinch")).toBeNull();
    expect(normalizeUnit("")).toBeNull();
  });

  it("knows every unit the grammar matches, or reads it as needed", () => {
    for (const unit of UNITS) {
      const vague = ["dash", "drop", "splash", "squeeze", "squirt", "pinch"];
      if (vague.includes(unit)) {
        expect(parseAmount(`1 ${unit} salt`), unit).toEqual(AS_NEEDED);
      } else {
        expect(normalizeUnit(unit), unit).not.toBeNull();
      }
    }
  });
});

describe("parseAmount — quantities", () => {
  it("reads whole numbers, decimals and fractions", () => {
    expect(parts("2 cups flour")).toEqual([
      { qty: 2, unit: "cup", family: "us-volume" },
    ]);
    expect(parts("1.5 kg potatoes")[0].qty).toBe(1.5);
    expect(parts("1,5 l water")[0].qty).toBe(1.5);
    expect(parts("3/4 cup sugar")[0].qty).toBe(0.75);
    expect(parts("1 1/2 tsp salt")[0].qty).toBe(1.5);
  });

  it("reads unicode and hyphenated mixed fractions", () => {
    expect(parts("½ cup milk")[0].qty).toBe(0.5);
    expect(parts("1½ cups milk")[0].qty).toBe(1.5);
    expect(parts("1 ½ cups milk")[0].qty).toBe(1.5);
    expect(parts("2¼ tsp yeast")[0].qty).toBe(2.25);
    expect(parts("1-1/2 cups rice")[0].qty).toBe(1.5);
    expect(parts("2 cans (15-1/2 ounces each) beans")).toEqual([
      { qty: 2, unit: "can", family: "container" },
    ]);
  });

  it("rounds a range up", () => {
    expect(parts("2-3 cloves garlic")).toEqual([
      { qty: 3, unit: "clove", family: "container" },
    ]);
    expect(parts("2 to 3 tablespoons oil")[0]).toMatchObject({
      qty: 3,
      unit: "tbsp",
    });
    expect(parts("1/2 to 1 cup celery")[0]).toMatchObject({
      qty: 1,
      unit: "cup",
    });
    expect(parts("3/4-1tsp salt")[0]).toMatchObject({ qty: 1, unit: "tsp" });
    expect(parts("5-7 black olives")[0]).toMatchObject({
      qty: 7,
      family: "count",
    });
    expect(parts("1 or 2 eggs")[0].qty).toBe(2);
  });

  it("reads quantity words", () => {
    expect(parts("one onion")[0].qty).toBe(1);
    expect(parts("Two 15-ounce cans black beans")).toEqual([
      { qty: 2, unit: "can", family: "container" },
    ]);
    expect(parts("half an onion")[0].qty).toBe(0.5);
    expect(parts("a couple of carrots")[0].qty).toBe(2);
    expect(parts("A few orange slices")[0].qty).toBe(3);
    expect(parseAmount("some parsley")).toEqual(AS_NEEDED);
  });

  it("skips modifiers and sizes", () => {
    expect(parts("about 2 cups stock")[0]).toMatchObject({
      qty: 2,
      unit: "cup",
    });
    expect(parts("Roughly 1 tablespoon butter")[0].unit).toBe("tbsp");
    expect(parts("1 heaping Tbsp brown sugar")[0].unit).toBe("tbsp");
    expect(parts("3 large eggs")).toEqual([
      { qty: 3, unit: "", family: "count" },
    ]);
    expect(parts("3 medium cloves garlic")[0].unit).toBe("clove");
    expect(parts("4 thick slices of bread")[0].unit).toBe("slice");
    expect(parts("8ish TBSP/100-150g of salt")[0]).toMatchObject({
      qty: 8,
      unit: "tbsp",
    });
  });
});

describe("parseAmount — units", () => {
  it("reads oz as weight and fl oz as volume", () => {
    expect(parts("8 oz cream cheese")).toEqual([
      { qty: 8, unit: "oz", family: "us-weight" },
    ]);
    expect(parts("4 oz. cream cheese")[0].family).toBe("us-weight");
    expect(parts("12 ounces chocolate chips")[0].family).toBe("us-weight");
    expect(parts("8 fl oz milk")).toEqual([
      { qty: 8, unit: "fl oz", family: "us-volume" },
    ]);
    expect(parts("6 fluid ounces cream")[0].family).toBe("us-volume");
  });

  it("reads units written against the number", () => {
    expect(parts("275g warm water")).toEqual([
      { qty: 275, unit: "g", family: "metric-weight" },
    ]);
    expect(parts("2T dijon mustard")[0].unit).toBe("tbsp");
    expect(parts("1tsp black pepper")[0].unit).toBe("tsp");
    expect(parts("500ml stock")[0].family).toBe("metric-volume");
  });

  it("keeps the first of two measures", () => {
    expect(parts("1 cup (120g) confectioners’ sugar")).toEqual([
      { qty: 1, unit: "cup", family: "us-volume" },
    ]);
    expect(parts("57g raw pistachios (2 ounces; about 1/2 cup)")[0].unit).toBe(
      "g",
    );
    expect(parts("100g or 1/2c mayo")[0].unit).toBe("g");
    expect(parts("3.5lb/1.5kg chicken")[0]).toMatchObject({
      qty: 3.5,
      unit: "lb",
    });
    expect(parts("(50g) 1/4 cup granulated sugar")[0]).toMatchObject({
      qty: 0.25,
      unit: "cup",
    });
  });

  it("chains plus and and", () => {
    /* 1 cup + 2 tbsp = 18 tbsp, kept in the smaller unit. */
    expect(parts("1 cup plus 2 tbsp flour")).toEqual([
      { qty: 18, unit: "tbsp", family: "us-volume" },
    ]);
    expect(shown("1/2 cup and 2 tablespoons sugar")).toBe("10 tbsp");
    expect(shown("1/2 cup plus 1 tablespoon water")).toBe("9 tbsp");
    expect(shown("1T + 1t honey")).toBe("1⅓ tbsp");
    /* A quantity without a unit is a second ingredient, not more of this one. */
    expect(parts("1 cup salt and 2 eggs")).toEqual([
      { qty: 1, unit: "cup", family: "us-volume" },
    ]);
  });

  it("counts containers in their own unit", () => {
    expect(parts("1 can black beans")).toEqual([
      { qty: 1, unit: "can", family: "container" },
    ]);
    expect(parts("2 cloves garlic, minced")[0].unit).toBe("clove");
    expect(parts("2 cloves, minced")[0].unit).toBe("clove");
    expect(parts("1 bunch scallions")[0].unit).toBe("bunch");
    expect(parts("1/4 head green cabbage")[0]).toMatchObject({
      qty: 0.25,
      unit: "head",
    });
    expect(parts("4 sticks unsalted butter")[0].unit).toBe("stick");
    expect(parts("2 sprigs fresh thyme")[0].unit).toBe("sprig");
    expect(parts("2 packages (8 ounces each) cream cheese")[0]).toMatchObject({
      qty: 2,
      unit: "package",
    });
  });

  it("counts a sized container as the container", () => {
    expect(parts("1 (15-ounce) can pumpkin puree")).toEqual([
      { qty: 1, unit: "can", family: "container" },
    ]);
    expect(parts("2 14.5oz/411g cans diced tomatoes")).toEqual([
      { qty: 2, unit: "can", family: "container" },
    ]);
    expect(parts("28oz/800g can crushed tomatoes")).toEqual([
      { qty: 1, unit: "can", family: "container" },
    ]);
  });

  it("multiplies a size that isn't a container's", () => {
    expect(parts("2 2-lb chickens")).toEqual([
      { qty: 4, unit: "lb", family: "us-weight" },
    ]);
    /* Written either way, each fillet is 6 oz. */
    expect(parts("4 6-oz salmon fillets")).toEqual([
      { qty: 24, unit: "oz", family: "us-weight" },
    ]);
    expect(parts("4 (6 oz) salmon fillets")).toEqual([
      { qty: 24, unit: "oz", family: "us-weight" },
    ]);
    expect(shown("1 (2 1/2 pound) chicken")).toBe("2½ lb");
  });

  it("takes a bracket that says about or total as the whole amount", () => {
    expect(parts("8 (about 2 lbs) chicken thighs")).toEqual([
      { qty: 2, unit: "lb", family: "us-weight" },
    ]);
  });

  it("reads a bracket before a unit as the other measure", () => {
    expect(parts("250 (1c) grams of warm water")).toEqual([
      { qty: 250, unit: "g", family: "metric-weight" },
    ]);
  });

  it("reads `2 x 400g tins` as the tins", () => {
    expect(parts("2 x 400g tins tomatoes")).toEqual([
      { qty: 2, unit: "tin", family: "container" },
    ]);
    expect(parts("2x 400g cans chickpeas")[0]).toMatchObject({
      qty: 2,
      unit: "can",
    });
  });

  it("counts things a dimension describes", () => {
    expect(parts("2 9-inch pie crusts")).toEqual([
      { qty: 2, unit: "", family: "count" },
    ]);
    expect(parts("4 6-inch flour tortillas")).toEqual([
      { qty: 4, unit: "", family: "count" },
    ]);
    expect(parts("1 (9 inch) pie crust")).toEqual([
      { qty: 1, unit: "", family: "count" },
    ]);
    expect(parts("10 inch tortillas")).toEqual([
      { qty: 1, unit: "", family: "count" },
    ]);
    /* A length of something is still an amount of it. */
    expect(parts("1 inch ginger")).toEqual([
      { qty: 1, unit: "inch", family: "container" },
    ]);
  });

  it("takes the larger end of a range with a unit on both ends", () => {
    expect(parts("200g-250g pasta")).toEqual([
      { qty: 250, unit: "g", family: "metric-weight" },
    ]);
    expect(shown("1 lb to 1 1/2 lbs ground beef")).toBe("1½ lb");
    expect(shown("1 lb - 1.5 lb potatoes")).toBe("1½ lb");
    expect(shown("2 tbsp to 1/4 cup water")).toBe("¼ cup");
    expect(shown("2 tsp to 1 tbsp sugar")).toBe("1 tbsp");
    expect(shown("1 cup or 2 cups stock")).toBe("2 cups");
    expect(shown("1/2 cup to 2/3 cup chocolate chips")).toBe("⅔ cup");
    /* Another family is the other measure, not a range. */
    expect(shown("100g or 1/2c mayo")).toBe("100 g");
  });

  it("continues a pair of units without a plus", () => {
    expect(parts("1 lb 2 oz beef")).toEqual([
      { qty: 18, unit: "oz", family: "us-weight" },
    ]);
    expect(shown("1 lb. 4 oz. flour")).toBe("1¼ lb");
    expect(shown("1 kg 200 g potatoes")).toBe("1.2 kg");
    /* Only a smaller unit of the same family continues it. */
    expect(shown("1 tsp 1 tsp vanilla")).toBe("1 tsp");
    expect(shown("2 cups 16 oz sour cream")).toBe("2 cups");
  });

  it("reads dozens and spelled-out halves", () => {
    expect(parts("2 dozen eggs")).toEqual([
      { qty: 24, unit: "", family: "count" },
    ]);
    expect(parts("a dozen eggs")[0].qty).toBe(12);
    expect(parts("1 dozen eggs")[0].qty).toBe(12);
    expect(shown("1 and 1/2 cups flour")).toBe("1½ cups");
    expect(shown("one and a half cups flour")).toBe("1½ cups");
    expect(shown("1 and a half cups flour")).toBe("1½ cups");
    expect(shown("2 and a half cups flour")).toBe("2½ cups");
    expect(shown("a half cup of milk")).toBe("½ cup");
    expect(shown("1 cup half and half")).toBe("1 cup");
  });

  it("is never a confident count when `and` follows the number", () => {
    expect(parseAmount("1 & 1/2 cups flour")).toBeNull();
    expect(parseAmount("2 & a half")).toBeNull();
  });

  it("reads spellings the grammar's unit list lacks", () => {
    expect(shown("2 Tb butter")).toBe("2 tbsp");
    expect(shown("1 TB oil")).toBe("1 tbsp");
    expect(parts("2 fl. oz gin")).toEqual([
      { qty: 2, unit: "fl oz", family: "us-volume" },
    ]);
  });

  it("reads a unit with no number as one", () => {
    expect(parts("Cup of fresh parsley")).toEqual([
      { qty: 1, unit: "cup", family: "us-volume" },
    ]);
  });

  it("reads a count of things", () => {
    expect(parts("3 eggs")).toEqual([{ qty: 3, unit: "", family: "count" }]);
    expect(parts("Juice of 2 limes")).toEqual([
      { qty: 2, unit: "", family: "count" },
    ]);
    expect(parts("Finely grated zest of 1 lemon")[0].qty).toBe(1);
    expect(parts("Juice & Zest of 1 Small Lemon")[0].qty).toBe(1);
    expect(parts("zest 1 lemon")[0].qty).toBe(1);
  });
});

describe("parseAmount — amounts written after the name", () => {
  it("reads a trailing amount with a unit", () => {
    expect(parts("Bread flour 300g (at least 12.8% protein)")).toEqual([
      { qty: 300, unit: "g", family: "metric-weight" },
    ]);
    expect(parts("Salt, 5 g")[0]).toMatchObject({ qty: 5, unit: "g" });
    expect(parts("Center-cut beef tenderloin, ~900g")[0].qty).toBe(900);
    expect(parts("King Arthur Whole Wheat Flour 48g 40%")[0]).toMatchObject({
      qty: 48,
      unit: "g",
    });
    expect(parts("Oregano, ~4 to 5 sprigs")[0]).toMatchObject({
      qty: 5,
      unit: "sprig",
    });
    expect(parts("TOTAL YIELD 1,800g")[0].qty).toBe(1800);
  });

  it("reads a trailing count only after a comma", () => {
    expect(parts("Whole egg, 1")).toEqual([
      { qty: 1, unit: "", family: "count" },
    ]);
    expect(parseAmount("Dough from step 2")).toBeNull();
    expect(parseAmount("Piping tip: small round tip such as Wilton #4")).toBe(
      null,
    );
  });

  it("reads a measure in brackets, but not one per serving", () => {
    expect(parts("Black pepper (approx. 1 tsp, divided)")[0]).toMatchObject({
      qty: 1,
      unit: "tsp",
    });
    expect(parts("Chopped cilantro (about 25-30 grams)")[0]).toMatchObject({
      qty: 30,
      unit: "g",
    });
    expect(parseAmount("soy sauce (1 Tbsp per serving)")).toBeNull();
  });

  it("reads a leading bracket when it is the only amount", () => {
    expect(parts("(about 2 cups) chopped kale")).toEqual([
      { qty: 2, unit: "cup", family: "us-volume" },
    ]);
  });

  it("reads past a label", () => {
    expect(
      parts("egg wash: 1 large egg beaten with 1 Tablespoon milk"),
    ).toEqual([{ qty: 1, unit: "", family: "count" }]);
    expect(parts("optional: 2/3 cup (80g) dried cranberries")[0].unit).toBe(
      "cup",
    );
  });
});

describe("parseAmount — as needed", () => {
  it.each([
    "Salt, to taste",
    "Salt and pepper to taste",
    "Pinch of salt",
    "Pinch ground cinnamon",
    "1 pinch sugar",
    "a pinch of nutmeg",
    "4 dashes sesame oil, plus more to taste",
    "splash of olive oil",
    "Olive oil, as needed",
    "Freshly torn basil, for serving",
    "Fresh cilantro, for garnish",
    "Vegetable oil for frying",
    "Flaky salt (optional)",
    "Kosher salt",
    "Freshly ground black pepper",
  ])("%s", (line) => {
    expect(parseAmount(line)).toEqual(AS_NEEDED);
    expect(isAsNeeded(parseAmount(line)!)).toBe(true);
  });

  it("keeps an amount that comes with a remark", () => {
    expect(parts("1 tablespoon water, plus more as needed")[0].unit).toBe(
      "tbsp",
    );
    expect(parts("2 tablespoons mayonnaise (optional, see note)")[0].qty).toBe(
      2,
    );
  });
});

describe("parseAmount — markup and nothing", () => {
  it("reads a stored line with its markup", () => {
    expect(parts('<Multiplyable baseNumber="275" />g warm water')).toEqual([
      { qty: 275, unit: "g", family: "metric-weight" },
    ]);
    expect(
      parts('<Multiplyable baseNumber="1 1/2" /> teaspoons kosher salt'),
    ).toEqual([{ qty: 1.5, unit: "tsp", family: "us-volume" }]);
    expect(
      parts(
        '<Multiplyable baseNumber="1/4" /> oz [lavender syrup](/recipe/lavender-syrup)',
      ),
    ).toEqual([{ qty: 0.25, unit: "oz", family: "us-weight" }]);
    expect(parts("**2** cups flour")[0].qty).toBe(2);
  });

  it("is null for headings, empty lines and numbers it can't read", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("For the sauce:")).toBeNull();
    expect(parseAmount("FILLING")).toBeNull();
    expect(
      parseAmount(
        "Homemade Pie Crust (both recipes make 2 crusts, 1 for bottom and 1 for top)",
      ),
    ).toBeNull();
  });
});

describe("addAmounts", () => {
  it("adds within a family, in the smaller unit", () => {
    expect(addAmounts(amount([1, "cup"]), amount([2, "tbsp"]))).toEqual({
      parts: [{ qty: 18, unit: "tbsp", family: "us-volume" }],
    });
    expect(addAmounts(amount([1, "lb"]), amount([8, "oz"]))).toEqual({
      parts: [{ qty: 24, unit: "oz", family: "us-weight" }],
    });
    expect(addAmounts(amount([1, "kg"]), amount([250, "g"]))).toEqual({
      parts: [{ qty: 1250, unit: "g", family: "metric-weight" }],
    });
    expect(addAmounts(amount([1, "l"]), amount([500, "ml"])).parts[0].qty).toBe(
      1500,
    );
    expect(addAmounts(amount([2, ""]), amount([3, ""]))).toEqual({
      parts: [{ qty: 5, unit: "", family: "count" }],
    });
  });

  it("keeps different families side by side, in order", () => {
    const sum = addAmounts(amount([1, "lb"]), amount([2, "cup"]));
    expect(sum.parts.map((p) => p.family)).toEqual(["us-weight", "us-volume"]);
    expect(formatAmount(sum)).toBe("1 lb + 2 cups");
  });

  it("never converts between US and metric", () => {
    const sum = addAmounts(amount([1, "cup"]), amount([240, "ml"]));
    expect(sum.parts).toHaveLength(2);
    expect(
      addAmounts(amount([8, "oz"]), amount([100, "g"])).parts,
    ).toHaveLength(2);
  });

  it("keeps weight oz apart from fl oz", () => {
    const sum = addAmounts(amount([8, "oz"]), amount([8, "fl oz"]));
    expect(formatAmount(sum)).toBe("8 oz + 1 cup");
  });

  it("adds containers only to the same container", () => {
    const sum = addAmounts(
      amount([1, "can"]),
      amount([2, "can"]),
      amount([1, "jar"]),
      amount([3, ""]),
    );
    expect(formatAmount(sum)).toBe("3 cans + 1 jar + 3");
  });

  it("as needed adds nothing", () => {
    expect(addAmounts(amount([1, "tsp"]), AS_NEEDED)).toEqual(
      amount([1, "tsp"]),
    );
    expect(isAsNeeded(addAmounts(AS_NEEDED, AS_NEEDED))).toBe(true);
    expect(isAsNeeded(addAmounts())).toBe(true);
  });

  it("does not change its arguments", () => {
    const a = amount([1, "cup"]);
    addAmounts(a, amount([1, "cup"]));
    expect(a).toEqual(amount([1, "cup"]));
  });
});

describe("scaleAmount", () => {
  it("multiplies every part", () => {
    const scaled = scaleAmount(
      addAmounts(amount([1, "cup"]), amount([2, ""])),
      2,
    );
    expect(scaled.parts.map((p) => p.qty)).toEqual([2, 4]);
    expect(formatAmount(scaled)).toBe("2 cups + 4");
  });

  it("takes a parsed scale", () => {
    expect(
      formatAmount(scaleAmount(amount([3, "cup"]), new Fraction("1/2"))),
    ).toBe("1½ cups");
  });

  it("leaves as needed as it is", () => {
    expect(scaleAmount(AS_NEEDED, 3)).toEqual(AS_NEEDED);
  });

  it("leaves nothing to buy at zero or less", () => {
    expect(scaleAmount(amount([2, "cup"]), 0)).toEqual(AS_NEEDED);
    expect(formatAmount(scaleAmount(amount([2, "cup"]), 0))).toBe("as needed");
    expect(scaleAmount(amount([2, "cup"]), -1)).toEqual(AS_NEEDED);
    expect(scaleAmount(amount([2, "cup"]), Number.NaN)).toEqual(AS_NEEDED);
    expect(
      formatAmount({ parts: [{ qty: 0, unit: "g", family: "metric-weight" }] }),
    ).toBe("as needed");
  });
});

describe("formatAmount", () => {
  it.each<[Amount, string]>([
    [amount([2, "cup"]), "2 cups"],
    [amount([1, "cup"]), "1 cup"],
    [amount([0.5, "cup"]), "½ cup"],
    [amount([1 / 3, "cup"]), "⅓ cup"],
    [amount([2 / 3, "cup"]), "⅔ cup"],
    [amount([0.25, "cup"]), "¼ cup"],
    [amount([1.5, "cup"]), "1½ cups"],
    /* Not a fraction of a cup recipes write: in tablespoons. */
    [amount([5, "tbsp"]), "5 tbsp"],
    [amount([6, "tbsp"]), "6 tbsp"],
    [amount([10, "tbsp"]), "10 tbsp"],
    [amount([12, "tbsp"]), "¾ cup"],
    [amount([3, "tbsp"]), "3 tbsp"],
    [amount([16, "tbsp"]), "1 cup"],
    [amount([3, "tsp"]), "1 tbsp"],
    [amount([2, "tsp"]), "2 tsp"],
    [amount([4, "cup"]), "1 quart"],
    [amount([7, "cup"]), "1¾ quarts"],
    [amount([16, "cup"]), "1 gallon"],
    /* No pints on a list: a pint read in comes out in cups. */
    [amount([1, "pint"]), "2 cups"],
    [amount([16, "fl oz"]), "2 cups"],
    [amount([24, "oz"]), "1½ lb"],
    [amount([12, "oz"]), "12 oz"],
    [amount([1500, "g"]), "1.5 kg"],
    [amount([250, "g"]), "250 g"],
    [amount([1500, "ml"]), "1.5 l"],
    [amount([3, ""]), "3"],
    [amount([0.5, ""]), "½"],
    [amount([2, "can"]), "2 cans"],
    [amount([1, "clove"]), "1 clove"],
    [amount([2, "bunch"]), "2 bunches"],
    [amount([3, "inch"]), "3 inches"],
    [AS_NEEDED, "as needed"],
  ])("%j → %s", (given, expected) => {
    expect(formatAmount(given)).toBe(expected);
  });

  it("rounds to the nearest eighth", () => {
    expect(formatAmount(amount([1.1, "lb"]))).toBe("1⅛ lb");
    expect(formatAmount(amount([1.3, "cup"]))).toBe("1¼ cups");
    expect(formatAmount(amount([2.06, ""]))).toBe("2");
  });

  it("rounds teaspoons to the nearest half, never to nothing", () => {
    expect(formatAmount(amount([1.25, "tsp"]))).toBe("1½ tsp");
    expect(formatAmount(amount([1.2, "tsp"]))).toBe("1 tsp");
    expect(formatAmount(amount([0.25, "tsp"]))).toBe("½ tsp");
    expect(formatAmount(amount([0.125, "tsp"]))).toBe("½ tsp");
    expect(formatAmount(amount([0.01, ""]))).toBe("⅛");
  });

  it("shows metric whole below a kilo or litre, tenths above, rounded up", () => {
    expect(formatAmount(amount([112.5, "g"]))).toBe("113 g");
    expect(formatAmount(amount([999, "g"]))).toBe("999 g");
    expect(formatAmount(amount([999.2, "g"]))).toBe("1 kg");
    expect(formatAmount(amount([1000, "g"]))).toBe("1 kg");
    expect(formatAmount(amount([1001, "g"]))).toBe("1.1 kg");
    expect(formatAmount(amount([1.8, "kg"]))).toBe("1.8 kg");
    expect(formatAmount(amount([0.3, "g"]))).toBe("1 g");
    expect(formatAmount(amount([2.5, "dl"]))).toBe("250 ml");
    expect(formatAmount(amount([0.75, "l"]))).toBe("750 ml");
    /* Float sums don't tip a whole number up. */
    expect(
      formatAmount(addAmounts(amount([0.1, "kg"]), amount([0.2, "kg"]))),
    ).toBe("300 g");
  });

  it("shows a parsed line", () => {
    expect(shown("1 cup plus 2 tablespoons milk")).toBe("1⅛ cups");
    expect(shown("1 tablespoon plus 2 teaspoons butter")).toBe("1⅔ tbsp");
    expect(shown("1/2 cup (100g) sugar")).toBe("½ cup");
  });
});
