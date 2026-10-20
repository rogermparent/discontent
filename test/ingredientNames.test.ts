import { describe, expect, it } from "vitest";
import {
  nameLabel,
  parseIngredientLine,
  parseIngredientList,
  readableLine,
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
    /* `dry` before a red or white wine says nothing you buy by (43n). */
    ["2 cups dry red wine, such as Cabernet Sauvignon", "red wine"],
    ["1 oz cinnamon syrup (Toschi)", "cinnamon syrup"],
    ["A few orange slices", "orange slice"],
    [
      "3 cups dry red wine, such as Cabernet Sauvignon (about one bottle)",
      "red wine",
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
    /* White sugar is granulated sugar (43n). */
    ["1/2 cup plus 2 tablespoons white sugar", "granulated sugar"],
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
    ["1 (15-ounce/425g) can chickpeas, drained and rinsed", "canned chickpea"],
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
    expect(label("2 cups milk or cream")).toBe("milk or cream");
    /* Scallion is a green onion (32j), so the two alternatives are one. */
    expect(label("1 green onion/scallion")).toBe("green onion");
    expect(label("2 oz vodka and/or gin")).toBe("vodka or gin");
    expect(label("tonkatsu sauce ((or make my Homemade Tonkatsu Sauce))")).toBe(
      "tonkatsu sauce",
    );
    expect(label("2 oz gin (or vodka)")).toBe("gin or vodka");
  });

  it("never splits on and, except salt and pepper (32j)", () => {
    expect(label("1 cup half and half")).toBe("half and half");
    /* Read as the quantity `half` and the name `half` until 35b. */
    expect(label("1 cup half-and-half")).toBe("half and half");
    expect(label("2 cups half & half")).toBe("half and half");
    expect(label("half a lemon")).toBe("lemon");
    expect(label("2 cups macaroni and cheese")).toBe("macaroni and cheese");
    expect(
      parseIngredientLine("Salt and pepper").map(requirementLabel),
    ).toEqual(["salt", "pepper"]);
    expect(
      parseIngredientLine(
        "1 tsp kosher salt & freshly ground black pepper",
      ).map(requirementLabel),
    ).toEqual(["kosher salt", "black pepper"]);
  });

  it("drops measures in parentheses but keeps names as aliases", () => {
    expect(only("1 3/4 cups (420ml) milk").aliases).toEqual([]);
    expect(only("1 cup panko (Japanese breadcrumbs)").aliases).toEqual([
      "Japanese breadcrumbs",
    ]);
    expect(only("2 garlic cloves (minced)").aliases).toEqual([]);
  });
});

describe("readableLine (38a review)", () => {
  it("drops NFKD's marks, undoes markup and keeps the fractions", () => {
    expect(readableLine("2 oz añejo tequila")).toBe("2 oz anejo tequila");
    expect(readableLine("crème fraîche, jalapeño")).toBe(
      "creme fraiche, jalapeno",
    );
    expect(
      readableLine('<Multiplyable baseNumber="1½" /> oz [syrup](/x)'),
    ).toBe("1 1/2 oz syrup");
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

describe("parseIngredientLine — food lines (32j)", () => {
  /* Lines from the real corpus's dinners, as 25c's matcher misread them. */
  it.each([
    /* A prep phrase without a comma. */
    ["1 large onion cut into wedges", "onion"],
    [
      "8 tablespoons (113g) unsalted butter at room temperature",
      "unsalted butter",
    ],
    ["3 1/4 cups flour plus more for kneading", "flour"],
    ['1 1/2 pound stewing beef trimmed and cut into 1" cubes', "stewing beef"],
    ["Lemon juice to taste", "lemon juice"],
    ["2 teaspoons salt or to taste", "salt"],
    [
      "4 Tbsp light olive oil (or any cooking oil, divided)",
      "light olive oil or any cooking oil",
    ],
    /* Remarks in parentheses that say how much. */
    ["1/2 cup milk (or more as needed)", "milk"],
    ["1 tbsp. (or more) fresh lemon juice", "lemon juice"],
    ["2 Tbsp sugar (adjust to taste)", "sugar"],
    /* "or more" before a name is a choice. */
    [
      "2-3 Tbsp ghee (or margarine, or more butter)",
      "ghee or margarine or butter",
    ],
    /* How a cut comes. */
    ["2 boneless, skinless chicken breasts", "chicken breast"],
    ["8 bone-in, skin-on chicken thighs", "chicken thigh"],
    ["3 lbs chicken thighs boneless, skinless", "chicken thigh"],
    /* An amount in two units. */
    ["3.5lb/1.5kg bone in pork butt", "pork butt"],
    ["1 cup/240ml milk", "milk"],
    /* Food synonyms. */
    ["2 scallions, thinly sliced", "green onion"],
    ["1 can garbanzo beans, drained", "canned chickpea"],
    ["1 cup confectioners' sugar", "powdered sugar"],
    ["2 courgettes", "zucchini"],
    ["1 cup double cream", "heavy cream"],
    ["1 lb hamburger meat", "ground beef"],
    ["1 tsp bicarbonate of soda", "baking soda"],
    ["2 red chillies", "red chili"],
    ["1 cup Greek yoghurt", "greek yogurt"],
    /* Flavoured salts stay whole; "ancho chile" stays as the drinks write it. */
    ["1/2 tsp celery salt", "celery salt"],
    ["1/2 oz ancho chile liqueur", "ancho chile liqueur"],
  ])("%s → %s", (line, expected) => {
    expect(label(line)).toBe(expected);
  });

  it("marks cool and lukewarm water as staples", () => {
    expect(only("1 cup cool water").staple).toBe(true);
    expect(only("300g lukewarm water").staple).toBe(true);
  });

  it("splits salt and pepper, keeping the line optional when it is", () => {
    const [salt, pepper] = parseIngredientLine("Salt and pepper to taste");
    expect([salt.optional, pepper.optional]).toEqual([true, true]);
    expect(requirementLabel(pepper)).toBe("pepper");
  });
});

describe("38d: OR: lines and a bare pinch", () => {
  /* The tail of `classic-peanut-butter-blossoms`' list, copied (Sally's). */
  const BLOSSOMS_TAIL = [
    '<Multiplyable baseNumber="24" /> chocolate kiss candies, unwrapped',
    '<Multiplyable baseNumber="1/2" /> cup (<Multiplyable baseNumber="100" />g) granulated sugar',
    'OR: <Multiplyable baseNumber="1/4" /> cup (<Multiplyable baseNumber="50" />g) green sanding sugar and <Multiplyable baseNumber="1/4" /> cup (<Multiplyable baseNumber="50" />g) red sanding sugar',
  ];

  it("reads an OR: line's parts as names, with no stray units, marked orPrevious", () => {
    const or = only(BLOSSOMS_TAIL[2]);
    expect(or.orPrevious).toBe(true);
    /* A combination offers what its parts share (Dd10). */
    expect(requirementLabel(or)).toBe("sanding sugar");
    expect(only("or: 2 cups oat milk").orPrevious).toBe(true);
    expect(only("1 cup sugar").orPrevious).toBeUndefined();
  });

  it("folds an OR: line into the line above it in a list", () => {
    const list = parseIngredientList(BLOSSOMS_TAIL);
    expect(list.map(requirementLabel)).toEqual([
      "chocolate kiss candy",
      "granulated sugar or sanding sugar",
    ]);
    expect(list[1].line).toBe(1);
    expect(list[1].orPrevious).toBeUndefined();
  });

  it("reads a combination with nothing shared as no alternative (Dd10)", () => {
    for (const or of [
      "OR: 1 cup milk plus 1 Tbsp vinegar",
      "OR: 1 cup milk and 1 Tbsp lemon juice",
      "OR: 1 cup milk plus vinegar",
    ]) {
      const list = parseIngredientList(["1 cup buttermilk", or]);
      expect(list.map(requirementLabel), or).toEqual(["buttermilk"]);
    }
    /* One part, several names: each is a way. */
    expect(
      parseIngredientList([
        "1 cup sugar",
        "OR: 1 cup honey or maple syrup",
      ]).map(requirementLabel),
    ).toEqual(["sugar or honey or maple syrup"]);
  });

  it("leaves an OR: line after a heading on its own", () => {
    const list = parseIngredientList(
      ["1 cup sugar", "Topping", "OR: 1 cup honey"],
      [1],
    );
    expect(list.map(requirementLabel)).toEqual(["sugar", "honey"]);
  });

  it("reads a pinch or a dash with no 'a' and no 'of' as an amount", () => {
    expect(label("pinch salt")).toBe("salt");
    expect(label("Dash Angostura bitters")).toBe("angostura bitters");
    expect(label("2 pinches salt")).toBe("salt");
  });
});

describe("parseIngredientLine — ranges, dashes and amount shapes (43n)", () => {
  /*
   * Real lines from the corpus survey (a read-only dump of every line of a
   * scratch clone), each beside the name it now reads as — and, in the
   * comment, what it read before.
   */
  const m = (n: string) => `<Multiplyable baseNumber="${n}" />`;
  it.each([
    /* balela-salad: `to cup italian parsley`, `to cup mint`. */
    [
      `${m("1/2")} cup to ${m("1")} cup Italian parsley – chopped`,
      "italian parsley",
    ],
    [`${m("1/2")} cup to ${m("1")} cup fresh mint- chopped`, "mint"],
    [
      `${m("1/4")}- ${m("1/2")} teaspoon cayenne or aleppo chili flakes`,
      "cayenne pepper or aleppo chili flake",
    ],
    [
      `${m("3")} cups cooked garbanzo beans- ( ${m("2")} cans, drained and rinsed)`,
      "cooked chickpea",
    ],
    [`${m("1")} red bell pepper-diced`, "red bell pepper"],
    /* Other range ends: `to cup chocolate chip`, `to cup water`. */
    ["1/2 cup to 2/3 cup chocolate chips", "chocolate chip"],
    ["3/4 cup to 7/8 cup (170g to 198g) lukewarm water", "water"],
    ["1 cup to 1 cup plus 2 tablespoons (227g to 255g) boiling water", "water"],
    /* The same amount two ways (Lagerstrom): `or 2c heavy cream`. */
    ["125g or 1/2c heavy cream", "heavy cream"],
    ["75g or about 1/3c aged balsamic", "aged balsamic"],
    ["200g or 3/4c+1tbsp water", "water"],
    ["100g or 2 large carrots, julienned", "carrot"],
    ["20g or 1/4 of a red onion", "red onion"],
    ["3-4 cloves or 10-15g minced garlic", "garlic"],
    ["1lb or 1/2kg boneless skinless chicken thighs", "chicken thigh"],
    /* `/.5kg`, a range in other units: `5kg ground beef`, `2kg chuck roast`. */
    ["1lb/.5kg 90/10 ground beef", "ground beef"],
    ["3-4lbs/1.5-2kg Chuck roast, cut into large chunks", "chuck roast"],
    ["8ish TBSP/100-150g of salt", "salt"],
    /* A container after a measure: `ounce can kidney bean`, `bag cranberry`. */
    ["One 15-ounce can kidney beans, drained and rinsed", "canned kidney bean"],
    [
      "1 15- ounce can cannellini beans, (drained and rinsed)",
      "canned cannellini bean",
    ],
    ["28oz/800g can crushed tomatoes", "canned tomato"],
    ["one 15-ounce can (425g) pumpkin puree*", "canned pumpkin puree"],
    ["6-ounce can of tomato paste", "canned tomato paste"],
    ["12 ounce bag cranberries, rinsed", "cranberry"],
    ["4 6-oz. bags baby spinach leaves, (stems removed)", "baby spinach leaf"],
    [
      "two 4-ounce bars (226g) white chocolate, coarsely chopped",
      "white chocolate",
    ],
    ["1-inch piece of ginger- sliced into thin strips", "ginger"],
    ["2-inch knob ginger, peeled and finely diced", "ginger"],
    ["4 x 400g/14 oz large floury potatoes", "floury potato"],
    /* A bracket after the unit: `cup white sugar`, `lbs beef oxtail`. */
    ["55g (1/4) cup white sugar", "granulated sugar"],
    ["1 1/2 cups (packed) brown sugar, divided", "brown sugar"],
    ["15 ounces (can) refried beans", "canned refried bean"],
    [
      "4 lbs (meaty!) fresh beef oxtail, already cut into pieces",
      "beef oxtail",
    ],
    ["1 packed cup cilantro (plus more for garnish)", "cilantro"],
    ["1/2 cup plus 2 (150ml) tablespoons water", "water"],
    /* Sizes: `to green onion`, `med carrot`, `lrg clove garlic`. */
    ["6 medium-to-large scallions, diced", "green onion"],
    ["150g or 3 med carrot, diced", "carrot"],
    ["5g or 1/2 lrg clove garlic", "garlic"],
    ["4 medium cloves garlic, thinly sliced", "garlic"],
    /* A label before the amount: `egg wash egg with tablespoon milk`. */
    ["egg wash: 1 large egg beaten with 1 Tablespoon (15ml) milk", "egg"],
    [
      "for rolling: 2/3 cup granulated or coarse sugar",
      "granulated sugar or coarse sugar",
    ],
    ["optional topping: 1/3 cup (30g) breadcrumbs", "breadcrumb"],
    /* Words before a quantity: `up to cup blueberry preserve`. */
    ["up to 1/2 cup blueberry preserves", "blueberry preserve"],
    ["Roughly 1 tablespoon salted butter", "salted butter"],
    /* An amount written last: `bread flour 300g`, `soy sauce tsp`. */
    ["Bread flour 300g (at least 12.8% protein)", "bread flour"],
    ["King Arthur Whole Wheat Flour 48g 40%", "king arthur wheat flour"],
    ["3 tablespoons Soy Sauce + 1 tsp", "soy sauce"],
    /* A dash before the prep, after the name: `garlic into round`. */
    ["1 clove garlic- thinly sliced into rounds", "garlic"],
    [
      "25 g (1 3/4 T) olive oil — plus 1/4 cup + for the pan and drizzling",
      "olive oil",
    ],
    [
      "1 lb. 90% lean ground beef -or ground lamb",
      "lean ground beef or ground lamb",
    ],
    /* Remarks after the name: `onion and to remove excess liquid`. */
    ["1 onion grated and squeezed to remove excess liquid", "onion"],
    ["75g or 5 1/2Tbsp melted butter (not hot) + extra for brushing", "butter"],
    ["optional: 3/4 cup (100g) finely chopped and toasted pecans", "pecan"],
    /* Alternatives: `uncut stevia or tbsp sugar`, `… or plus more`, `… note`. */
    ["pinch uncut stevia OR 2 tbsp sugar", "uncut stevia or sugar"],
    [
      "1 tablespoon (18 grams) adobo ((or seasoned salt), plus more to taste)",
      "adobo or seasoned salt",
    ],
    [
      "2 tbsp tahini ((or Chinese sesame paste - Note 5))",
      "tahini or chinese sesame paste",
    ],
    [
      "2 tablespoons chopped fresh dill or basil (or substitute 1/2 teaspoon dried dill)",
      "dill or basil",
    ],
    [
      "1 (14-ounce) can (drained and rinsed) or 1 package of frozen corn",
      "canned corn or frozen corn",
    ],
    ["pinch or two chili flakes (optional, but good)", "chili flake"],
    ["zest 1 lemon", "lemon zest"],
    /* The backlog's `(or A or B C)`: `pinto or cannellini bean` was one name. */
    [
      "2 (about 15-ounce) cans black beans (or pinto or cannellini beans), drained and rinsed",
      "canned black bean or canned pinto bean or canned cannellini bean",
    ],
    [
      "1 cup (150g) shredded apple (or shredded carrot/zucchini)",
      "apple or carrot or zucchini",
    ],
    /* …and a tail that is the rest of a name is not lent. */
    [
      "1/2 oz crème de cassis (or substitute Chambord or crème de mure)",
      "creme de cassis or chambord or creme de mure",
    ],
  ])("%s → %s", (line, expected) => {
    expect(label(line)).toBe(expected);
  });

  it("keeps a hyphen inside a name", () => {
    expect(label("1 cup semi-sweet chocolate chips")).toBe(
      "semi sweet chocolate chip",
    );
    expect(label("2 cups all-purpose flour")).toBe("all purpose flour");
  });

  it("keeps a unit that is the name", () => {
    expect(label("4 cloves (minced)")).toBe("clove");
    expect(label("2 cans, drained")).toBe("can");
  });

  /* Dn2 (43n review): every can shape reads `canned X`, not only a can
   * after a measure. */
  it.each([
    ["1 can black beans", "canned black bean"],
    ["2 cans chickpeas", "canned chickpea"],
    ["1 (28 ounce) can crushed tomatoes", "canned tomato"],
    ["28 oz can diced tomatoes", "canned tomato"],
    ["1 (15-ounce) can pinto beans, drained and rinsed", "canned pinto bean"],
    ["2 (15-ounce cans) chickpeas (drained and rinsed)", "canned chickpea"],
    ["1 oz. (14-oz.) can crushed tomatoes", "canned tomato"],
    ["1 can (15 ounces) chickpeas or garbanzo beans", "canned chickpea"],
    ["1 can corn or peas (optional)", "canned corn or canned pea"],
    ["1 can black or pinto beans", "canned black bean or canned pinto bean"],
    /* A second measure joined by `or`: the canned thing or the other. */
    [
      "15 ounce can or 260g drained cooked black beans",
      "canned black bean or cooked black bean",
    ],
    ["450g or 2 8oz cans tomato sauce", "canned tomato sauce or tomato sauce"],
    /* What comes in a can but isn't canned goods. */
    ["6-ounce can of water", "water"],
    [
      "1 (8-ounce) can refrigerated crescent roll dough",
      "refrigerated crescent roll dough",
    ],
    [
      "1 (12 ounce) can frozen orange juice concentrate",
      "frozen orange juice concentrate",
    ],
    /* A choice that is only a measure names nothing. */
    [
      "3 cups cooked black eyed peas (1/2 pound) or 2 15-ounce cans",
      "cooked black eyed pea",
    ],
    [
      "15 oz (425g) roasted pumpkin puree (or a 15 oz can, if u want I guess)",
      "roasted pumpkin puree",
    ],
  ])("%s → %s", (line, expected) => {
    expect(label(line)).toBe(expected);
  });

  it("keeps the label when it is the name (43n review)", () => {
    expect(label("Flour: 2 cups")).toBe("flour");
    expect(label("Kosher salt: 1 teaspoon")).toBe("kosher salt");
    expect(label("Bread flour: 500g")).toBe("bread flour");
    expect(label("Flour: 2 cups, sifted")).toBe("flour");
    expect(label("Eggs: 2 large")).toBe("egg");
    /* …and drops one that names a part of the recipe, or with a name after it. */
    expect(label("Filling: 2 cups blueberries")).toBe("blueberry");
    expect(label("Topping: 1/2 cup pecans")).toBe("pecan");
    expect(label("Dough: 3 cups bread flour")).toBe("bread flour");
  });
});

describe("toName — synonyms and descriptors (43n)", () => {
  const name = (text: string) => toName(text).words.join(" ");

  it.each([
    ["mayo", "mayonnaise"],
    ["Mayonnaise", "mayonnaise"],
    ["mild feta cheese", "feta cheese"],
    ["feta", "feta cheese"],
    ["crumbled feta", "feta cheese"],
    ["parm", "parmesan cheese"],
    ["Parmigiano-Reggiano", "parmesan cheese"],
    ["grated parmesan", "parmesan cheese"],
    ["sharp cheddar", "sharp cheddar cheese"],
    ["shredded mozzarella", "mozzarella cheese"],
    ["pepper jack", "pepper jack cheese"],
    ["garbanzo beans", "chickpea"],
    ["Dijon", "dijon mustard"],
    ["Worcestershire", "worcestershire sauce"],
    ["cayenne", "cayenne pepper"],
    ["cayenne powder", "cayenne pepper"],
    ["cayenne pepper powder", "cayenne pepper"],
    /* 43n review: the rows backtracked into "pepper pepper", "romano cheese". */
    ["cayenne peppers", "cayenne pepper"],
    ["pecorino romano", "pecorino romano cheese"],
    ["pecorino romano cheese", "pecorino romano cheese"],
    ["cheddar-jack cheese blend", "cheddar jack cheese blend"],
    ["ricotta salata", "ricotta salata"],
    ["feta-style cheese", "feta style cheese"],
    ["AP flour", "all purpose flour"],
    ["plain flour", "all purpose flour"],
    ["flat-leaf parsley", "italian parsley"],
    ["white sugar", "granulated sugar"],
    ["full-fat sour cream", "sour cream"],
    ["plain Greek yogurt", "greek yogurt"],
    ["unsweetened cocoa powder", "cocoa powder"],
    ["dry white wine", "white wine"],
    ["distilled white vinegar", "white vinegar"],
    ["white distilled vinegar", "white vinegar"],
    ["instant dry yeast", "instant yeast"],
    ["freshly ground black pepper", "black pepper"],
    ["ground cinnamon", "cinnamon"],
    ["uncooked long grain rice", "long grain rice"],
    ["mild Italian sausage", "italian sausage"],
  ])("%s → %s", (text, expected) => {
    expect(name(text)).toBe(expected);
  });

  it("never merges varieties that matter", () => {
    for (const [text, expected] of [
      ["Italian parsley", "italian parsley"],
      ["parsley", "parsley"],
      ["dark brown sugar", "dark brown sugar"],
      ["kosher salt", "kosher salt"],
      ["unsalted butter", "unsalted butter"],
      ["ground ginger", "ground ginger"],
      ["ground beef", "ground beef"],
      ["ground cloves", "ground clove"],
      ["dry vermouth", "dry vermouth"],
      ["cooked rice", "cooked rice"],
      ["low sodium soy sauce", "low sodium soy sauce"],
      ["cream cheese", "cream cheese"],
      ["cheddar cheese sauce", "cheddar cheese sauce"],
      ["parmesan rind", "parmesan rind"],
      ["unsweetened applesauce", "unsweetened applesauce"],
      ["white wine vinegar", "white wine vinegar"],
      ["Swiss chard", "swiss chard"],
    ]) {
      expect(name(text), text).toBe(expected);
    }
  });
});

describe("parseIngredientLine — mixed numbers written with and (43n2)", () => {
  /*
   * Sally's recipes write `2 and 1/4 cups`. The quantity read stopped at
   * `2`, so the unit stayed: each line read `cup …` (in the comment) and
   * never met the same flour on a list, in Make or in a step.
   */
  const m = (n: string) => `<Multiplyable baseNumber="${n}" />`;
  it.each([
    /* `cup all purpose flour` */
    ["2 and 1/4 cups all-purpose flour", "all purpose flour"],
    [`${m("2")} and ${m("1/4")} cups all-purpose flour`, "all purpose flour"],
    [
      `${m("2")} and ${m("1/4")} cups (${m("281")}g) all-purpose flour (spooned & leveled)`,
      "all purpose flour",
    ],
    /* `cup powdered sugar` */
    ["1 and 1/2 cups (180g) sifted confectioners' sugar", "powdered sugar"],
    /* `teaspoon instant yeast`, `stick butter`, `pound chicken thigh` */
    ["2 and 1/4 teaspoons instant yeast", "instant yeast"],
    ["1 and 1/2 sticks butter", "butter"],
    ["2 and 1/2 pounds chicken thighs", "chicken thigh"],
    ["3 and 1/4 cups all purpose flour, divided", "all purpose flour"],
    /* `cup flour`, each */
    ["2 and ½ cups flour", "flour"],
    ["2 & 1/2 cups flour", "flour"],
    ["2 & ½ cups flour", "flour"],
    ["2 and 1/4-cups flour", "flour"],
    /* `one half cup milk`, then `half cup milk` */
    ["1 and one-half cups milk", "milk"],
    ["1 and a half cups milk", "milk"],
    ["2 and a half cups milk", "milk"],
    ["one and a half cups milk", "milk"],
    /* `half pound beef`, `quarter cup sugar`, `three quarter cup milk` */
    ["two and a half pounds beef", "beef"],
    ["1 and a quarter cups sugar", "sugar"],
    ["1 and three-quarters cups milk", "milk"],
    /* `cup plus tablespoon sugar`, `plus and tablespoon sugar` */
    ["1 and 1/2 cups plus 2 tablespoons sugar", "sugar"],
    ["1/2 cup plus 1 and 1/2 tablespoons sugar", "sugar"],
    /* `cup flour or cup bread flour` */
    [
      "2 and 1/4 cups flour or 1 and 1/2 cups bread flour",
      "flour or bread flour",
    ],
    /* A count was already right; pinned. */
    ["2 and 1/2 lemons", "lemon"],
    ["1 and 1/2 large eggs", "egg"],
  ])("%s → %s", (text, expected) => {
    expect(label(text)).toBe(expected);
  });

  it("joins only a whole number, `and`, then a fraction", () => {
    expect(
      parseIngredientLine("salt and pepper").map(requirementLabel),
    ).toEqual(["salt", "pepper"]);
    expect(
      parseIngredientLine("2 tablespoons salt and pepper").map(
        requirementLabel,
      ),
    ).toEqual(["salt", "pepper"]);
    /* The 27c chain rule: a quantity and a unit continue the amount, a
     * count does not — the second ingredient stays in the name. */
    expect(label("1 cup salt and 2 eggs")).toBe("salt and egg");
    expect(label("oil and vinegar")).toBe("oil and vinegar");
    expect(label("1 cup oil and vinegar")).toBe("oil and vinegar");
    expect(label("2 eggs and 1 yolk")).toBe("egg and yolk");
    expect(label("1 cup half and half")).toBe("half and half");
    expect(label("2 and a half cups half and half")).toBe("half and half");
    expect(label("a half and half mix")).toBe("half and half mix");
    /* Two amounts, not one: left alone, as before. */
    expect(label("1/2 and 1/4 cup sugar")).toBe("cup sugar");
    expect(label("1 and 2 cups flour")).toBe("cup flour");
    /* An amount with no name names nothing, as `2 1/2` does (was `half`). */
    expect(parseIngredientLine("2 and a half")).toEqual([]);
    expect(label("1 1/4 cup beef broth, divided into 1 and 1/4 cup")).toBe(
      "beef broth",
    );
  });
});
