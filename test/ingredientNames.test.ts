import { describe, expect, it } from "vitest";
import {
  nameLabel,
  parseIngredientLine,
  parseIngredientList,
  requirementLabel,
  singular,
  toName,
  type Requirement,
} from "recipe-website-common/util/ingredientNames";

/** The one requirement a line yields, as a label. */
function label(line: string): string {
  const found = parseIngredientLine(line);
  expect(found).toHaveLength(1);
  return requirementLabel(found[0]);
}

function only(line: string): Requirement {
  const found = parseIngredientLine(line);
  expect(found).toHaveLength(1);
  return found[0];
}

describe("parseIngredientLine — every real drink line", () => {
  /*
   * The drink lines in the content repository as of 25c (the 12 step-1
   * drinks, 6 tea drinks and Lavender Syrup), each beside the name it must
   * come out as. A change here is a change to what "can make" means.
   */
  const lines: [string, string][] = [
    ["2 oz vodka", "vodka"],
    ["1 1/2 oz vodka", "vodka"],
    ["2 1/2 oz vodka", "vodka"],
    ["3/4 oz lemon juice", "lemon juice"],
    ["3/4 oz simple syrup", "simple syrup"],
    ["1 dash orange bitters", "orange bitters"],
    ["4 oz spicy Bloody Mary mix (Major Peters)", "spicy bloody mary mix"],
    ["Squeeze of lemon juice", "lemon juice"],
    ["Squeeze of lime juice", "lime juice"],
    ["1/2 oz elderflower syrup (Toschi)", "elderflower syrup"],
    ["Club soda, to top", "soda water"],
    ["1/2 oz blood orange liqueur (St. Elder)", "blood orange liqueur"],
    ["2 oz cosmopolitan mix (Matteo's thin)", "cosmopolitan mix"],
    ["1/4 oz lime juice", "lime juice"],
    ["2 oz sake (Gekkeikan)", "sake"],
    ["1/2 oz cucumber syrup (Toschi)", "cucumber syrup"],
    ["1/2 oz extra dry vermouth", "extra dry vermouth"],
    ["1 barspoon cucumber syrup (Toschi)", "cucumber syrup"],
    ["2 oz green tea, cold-brewed", "green tea"],
    ["1 1/2 oz non-alcoholic aperitif (Gnista)", "non-alcoholic aperitif"],
    ["2 oz hibiscus tea, cold-brewed", "hibiscus tea"],
    ["1/2 oz ginger syrup (Toschi)", "ginger syrup"],
    ["1/4 oz lavender syrup", "lavender syrup"],
    ["Tonic water, to top", "tonic water"],
    ["2 cups dry red wine, such as Cabernet Sauvignon", "dry red wine"],
    ["1 oz cinnamon syrup (Toschi)", "cinnamon syrup"],
    ["A few orange slices", "orange slice"],
    [
      "3 cups dry red wine, such as Cabernet Sauvignon (about one bottle)",
      "dry red wine",
    ],
    ["1 oz mango syrup (Toschi)", "mango syrup"],
    ["1 orange, chopped", "orange"],
    ["1/2 oz ancho chile liqueur (Ancho Reyes)", "ancho chile liqueur"],
    ["2 oz extra dry vermouth", "extra dry vermouth"],
    ["2 oz non-alcoholic gin (Big Spoon virGin)", "non-alcoholic gin"],
    ["1 cup sugar", "sugar"],
    ["1 cup water", "water"],
    ["1 tbsp dried culinary lavender", "lavender"],
  ];
  it.each(lines)("%s → %s", (line, expected) => {
    expect(label(line)).toBe(expected);
  });

  it("keeps brands and examples as aliases", () => {
    expect(only("1 1/2 oz non-alcoholic aperitif (Gnista)").aliases).toEqual([
      "Gnista",
    ]);
    expect(
      only("3 cups dry red wine, such as Cabernet Sauvignon (about one bottle)")
        .aliases,
    ).toEqual(["Cabernet Sauvignon"]);
  });

  it("marks optional lines", () => {
    const line = only(
      "1/4 to 1/2 oz ancho chile liqueur (Ancho Reyes), optional",
    );
    expect(requirementLabel(line)).toBe("ancho chile liqueur");
    expect(line.optional).toBe(true);
    expect(only("1 dash orange bitters, optional").optional).toBe(true);
    expect(only("Salt, to taste").optional).toBe(true);
    expect(only("Garnish: lime wheel").optional).toBe(true);
    expect(only("Mint sprigs, for garnish").optional).toBe(true);
    expect(only("Grated nutmeg (optional)").optional).toBe(true);
    expect(only("2 oz vodka").optional).toBe(false);
  });

  it("does not let a remark in parentheses make a line optional", () => {
    const line = only(
      "1/4 cup chopped fresh mint (plus whole leaves for garnish)",
    );
    expect(requirementLabel(line)).toBe("mint");
    expect(line.optional).toBe(false);
    expect(only("2 tsp chili garlic sauce, plus more to taste").optional).toBe(
      false,
    );
  });

  it("splits an infusion into the spirit and, loosely, its flavour", () => {
    const [spirit, flavour] = parseIngredientLine(
      "2 oz black-tea-infused vodka",
    );
    expect(requirementLabel(spirit)).toBe("vodka");
    expect(spirit.loose).toBe(false);
    expect(requirementLabel(flavour)).toBe("black tea");
    expect(flavour.loose).toBe(true);
    const [, chamomile] = parseIngredientLine("2 oz chamomile-infused vodka");
    expect(requirementLabel(chamomile)).toBe("chamomile");
  });

  it("marks water and ice as staples", () => {
    expect(only("1 cup water").staple).toBe(true);
    expect(only("Ice cubes").staple).toBe(true);
    expect(only("Tonic water, to top").staple).toBe(false);
    expect(only("Soda water").staple).toBe(false);
  });
});

describe("parseIngredientLine — 25f's parser findings, fixed (27c)", () => {
  it.each([
    /* A left side that is already a whole name borrows nothing. */
    ["simple syrup or maple syrup", "simple syrup or maple syrup"],
    ["1/2 oz honey or maple syrup", "honey or maple syrup"],
    /* The borrowed tail never repeats the left word. */
    ["2 oz vodka or citron vodka", "vodka or citron vodka"],
    [
      "1 oz sweet or semi-sweet red vermouth",
      "sweet red vermouth or semi sweet red vermouth",
    ],
    /* …and the classic distribution still distributes. */
    ["3/4 oz lemon or lime juice", "lemon juice or lime juice"],
    /* Compounds are paired before `hot` is dropped as descriptive. */
    ["2 dashes hot sauce", "hot sauce"],
    ["1 cup hot water", "water"],
    /* A `plus|and <qty> <unit>` chain is all amount. */
    ["1/2 cup plus 2 tablespoons white sugar", "white sugar"],
    ["1 cup and 1 tablespoon flour", "flour"],
    /* `unit or unit`: either container. */
    ["1 (46- to 48-oz) bottle or can tomato juice", "tomato juice"],
    /* `recipe` and `batch` are units. */
    ["1 recipe lavender syrup", "lavender syrup"],
    ["1 batch simple syrup", "simple syrup"],
    /* A flavoured soda is its own bottle; a bare one is soda water. */
    ["4 oz grapefruit soda", "grapefruit soda"],
    ["Splash of soda", "soda water"],
  ])("%s → %s", (line, expected) => {
    expect(label(line)).toBe(expected);
  });
});

describe("parseIngredientLine — quantities, units and alternatives", () => {
  it.each([
    ["1/4 to 1/2 oz vodka", "vodka"],
    ["1-2 dashes Angostura bitters", "angostura bitters"],
    ["12–16 ounces (340–454g) hard pretzels", "hard pretzel"],
    ["1 (15-ounce/425g) can chickpeas, drained and rinsed", "chickpea"],
    ["2 Tablespoons (30ml) fresh lemon juice", "lemon juice"],
    ["1 tbsp. fresh thyme leaves", "thyme leaf"],
    ["2 oz of kale (56 g)", "kale"],
    ["Pinch of salt", "salt"],
    ["Splash of soda", "soda water"],
    ["Half a lemon", "lemon"],
    ["1 lemon twist", "lemon twist"],
    ["zest of 2 lemons", "lemon zest"],
    ["juice of 1 lime", "lime juice"],
    ["4 whole cloves", "clove"],
    ["4 cloves", "clove"],
    ["3 cloves garlic, minced", "garlic"],
    ["2 heaping teaspoons sugar", "sugar"],
    ["1 large (8-ounce; 215g) yellow onion, thinly sliced", "yellow onion"],
    ["2 teaspoons light corn syrup*", "light corn syrup"],
  ])("%s → %s", (line, expected) => {
    expect(label(line)).toBe(expected);
  });

  it("reads unicode fractions the way the form stores them", () => {
    expect(label("½ oz lime juice")).toBe("lime juice");
    expect(label("1½ oz gin")).toBe("gin");
    expect(label("¾ cup sugar")).toBe("sugar");
  });

  it("reads stored markup", () => {
    expect(label('<Multiplyable baseNumber="1 1/2" /> oz vodka')).toBe("vodka");
    expect(label("1/4 oz [lavender syrup](/recipe/lavender-syrup)")).toBe(
      "lavender syrup",
    );
  });

  it("splits alternatives, carrying the shared tail leftwards", () => {
    expect(label("3/4 oz lemon or lime juice")).toBe(
      "lemon juice or lime juice",
    );
    expect(label("2 oz dark or light rum")).toBe("dark rum or light rum");
    expect(label("1 green onion/scallion")).toBe("green onion or scallion");
    expect(label("2 oz vodka and/or gin")).toBe("vodka or gin");
    expect(label("tonkatsu sauce ((or make my Homemade Tonkatsu Sauce))")).toBe(
      "tonkatsu sauce",
    );
    expect(label("2 oz gin (or vodka)")).toBe("gin or vodka");
  });

  it("never splits on and", () => {
    expect(label("Salt and pepper")).toBe("salt and pepper");
  });

  it("drops measures in parentheses but keeps names as aliases", () => {
    expect(only("1 3/4 cups (420ml) milk").aliases).toEqual([]);
    expect(only("1 cup panko (Japanese breadcrumbs)").aliases).toEqual([
      "Japanese breadcrumbs",
    ]);
    expect(only("2 garlic cloves (minced)").aliases).toEqual([]);
  });
});

describe("headings", () => {
  it("yields nothing for a heading line", () => {
    expect(parseIngredientLine("For the filling:")).toEqual([]);
    expect(parseIngredientLine("GARNISH")).toEqual([]);
    expect(parseIngredientLine("Filling", { heading: true })).toEqual([]);
  });

  it("uses stored headings, and detectHeading for the rest", () => {
    const requirements = parseIngredientList(
      [
        "Dough",
        "2 cups flour",
        "Filling",
        "1 cup jam",
        "For the glaze:",
        "1 cup powdered sugar",
      ],
      [0, 2],
    );
    expect(requirements.map(requirementLabel)).toEqual([
      "flour",
      "jam",
      "powdered sugar",
    ]);
    expect(requirements.map((r) => r.line)).toEqual([1, 3, 5]);
  });

  it("without stored headings, an undetectable one reads as an ingredient", () => {
    /* What a pre-25c index gives: `Filling` is then a (missing) ingredient,
     * which is why the field exists. */
    expect(
      parseIngredientList(["Filling", "1 cup jam"]).map(requirementLabel),
    ).toEqual(["filling", "jam"]);
  });

  it("makes everything under a garnish or optional heading optional", () => {
    const requirements = parseIngredientList(
      ["2 oz gin", "Garnish:", "1 lime wheel", "To serve", "Mint"],
      [3],
    );
    expect(requirements.map((r) => [requirementLabel(r), r.optional])).toEqual([
      ["gin", false],
      ["lime wheel", true],
      ["mint", true],
    ]);
  });
});

describe("toName", () => {
  it("is the same pipeline for inventory items", () => {
    expect(nameLabel(toName("Fresh Limes"))).toBe("lime");
    expect(nameLabel(toName("Club Soda"))).toBe("soda water");
    expect(nameLabel(toName("seltzer"))).toBe("soda water");
    expect(nameLabel(toName("sparkling water"))).toBe("soda water");
    expect(nameLabel(toName("Tonic"))).toBe("tonic water");
    expect(nameLabel(toName("NA gin"))).toBe("non-alcoholic gin");
    expect(nameLabel(toName("Alcohol-free gin"))).toBe("non-alcoholic gin");
    expect(nameLabel(toName("Zero-proof aperitif"))).toBe(
      "non-alcoholic aperitif",
    );
    expect(nameLabel(toName("Dried lavender"))).toBe("lavender");
  });

  it("leaves 'virgin' alone", () => {
    expect(toName("extra virgin olive oil").na).toBe(false);
  });

  it("joins compounds into one word", () => {
    expect(toName("ginger beer").words).toEqual(["ginger beer"]);
    expect(toName("Egg whites").words).toEqual(["egg white"]);
    expect(toName("baking soda").words).toEqual(["baking soda"]);
  });

  it("singularizes naively but consistently", () => {
    expect(singular("cherries")).toBe("cherry");
    expect(singular("tomatoes")).toBe("tomato");
    expect(singular("peaches")).toBe("peach");
    expect(singular("leaves")).toBe("leaf");
    expect(singular("bitters")).toBe("bitters");
    expect(singular("citrus")).toBe("citrus");
    expect(singular("glass")).toBe("glass");
  });
});
