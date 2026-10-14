/**
 * Which aisle an ingredient is shopped in (epic 35, 35b).
 *
 * The shopping list groups what a meal plan needs by aisle, so the walk round
 * the shop follows the list. The input is an ingredient *name* as
 * `ingredientNames` makes it — `nameKey(name)` or `nameLabel(name)`: folded,
 * singular, descriptive words already gone — not a raw line.
 *
 * Heuristic, like `ingredientNames`: every word list lives here, and
 * `editor/scripts/measure-aisles.ts` prints what it makes of the real corpus
 * (the share per aisle, the top names left in `other`, or any aisle's names
 * with `--aisle`) — re-run it before tuning a list.
 *
 * Pure, and safe in the browser.
 */
import { fold } from "../components/SearchForm/queryLanguage";
import { singular } from "./ingredientNames";

/** The aisles, in the order a list prints them. */
export const AISLES = [
  "produce",
  "meat-fish",
  "dairy-eggs",
  "bakery",
  "pantry",
  "spices",
  "frozen",
  "other",
] as const;

export type Aisle = (typeof AISLES)[number];

export const AISLE_LABELS: Record<Aisle, string> = {
  produce: "Produce",
  "meat-fish": "Meat & fish",
  "dairy-eggs": "Dairy & eggs",
  bakery: "Bakery",
  pantry: "Pantry",
  spices: "Spices",
  frozen: "Frozen",
  other: "Other",
};

export function isAisle(value: unknown): value is Aisle {
  return (AISLES as readonly unknown[]).includes(value);
}

/** Fresh chiles by variety: the name alone, or `<variety> pepper|chile|chili`. */
const FRESH_CHILES = [
  "jalapeno",
  "serrano",
  "poblano",
  "habanero",
  "scotch bonnet",
  "fresno",
  "anaheim",
  "shishito",
  "padron",
  "cubanelle",
];

/** Words that only name a fresh chile before `pepper|chile|chili`. */
const CHILE_COLOURS = [
  "bell",
  "green",
  "red",
  "yellow",
  "orange",
  "banana",
  "cherry",
  "hungarian",
  "thai",
  "bird eye",
];

/** Dried chiles by variety: on the spice rack (or the Mexican shelf by it). */
const DRIED_CHILES = ["ancho", "guajillo", "pasilla", "arbol", "chipotle"];

const chiles = (varieties: string[], bare = true): string[] =>
  varieties.flatMap((variety) => [
    ...(bare ? [variety] : []),
    `${variety} pepper`,
    `${variety} chile`,
    `${variety} chili`,
  ]);

/**
 * Words and phrases → aisle, written as people write them. `aisleFor` reads
 * them through the same key as a name (folded, each word singular), so
 * `"green onions"` and `"green onion"` are one entry.
 *
 * A one-word entry is matched against a name's last word, then any word; a
 * phrase is matched wherever it falls in a name, longest first. So a phrase
 * is only needed where the words alone go wrong: `coconut milk` (not dairy),
 * `peanut butter` (not dairy), `garlic clove` (not the spice), `tomato paste`
 * (not produce). An entry may say `other` on purpose: a sourdough starter is
 * made, not bought, and must not borrow `sourdough`'s bakery.
 */
export const DEFAULT_AISLE_WORDS: Readonly<Record<string, Aisle>> =
  Object.freeze(
    Object.fromEntries(
      (
        [
          [
            "produce",
            [
              // alliums and roots
              "onion",
              "green onion",
              "shallot",
              "leek",
              "garlic",
              "garlic clove",
              "garlic bulb",
              "ginger",
              "potato",
              "sweet potato",
              "yam",
              "carrot",
              "celery",
              "celery rib",
              "celery stalk",
              "beet",
              "radish",
              "daikon",
              "turnip",
              "parsnip",
              "rutabaga",
              "fennel",
              // greens
              "lettuce",
              "little gem",
              "romaine",
              "spinach",
              "kale",
              "chard",
              "collard",
              "arugula",
              "cabbage",
              "bok choy",
              "greens",
              "green leaf",
              "salad",
              "salad mix",
              "spring mix",
              "coleslaw mix",
              "watercress",
              "sprout",
              // vegetables
              "tomato",
              "tomatillo",
              "broccoli",
              "broccolini",
              "cauliflower",
              "zucchini",
              "squash",
              "pumpkin",
              "eggplant",
              "cucumber",
              ...chiles(FRESH_CHILES),
              ...chiles(CHILE_COLOURS, false),
              "chile",
              "chili",
              "mushroom",
              "corn",
              "corn on the cob",
              "pea",
              "snap pea",
              "snow pea",
              "green bean",
              "bean sprout",
              "asparagus",
              "artichoke",
              "avocado",
              "okra",
              "rhubarb",
              "tofu",
              "wonton wrapper",
              "gyoza wrapper",
              "dumpling wrapper",
              "wrapper",
              // fruit
              "fruit",
              "apple",
              "pear",
              "banana",
              "lemon",
              "lime",
              "orange",
              "grapefruit",
              "clementine",
              "berry",
              "strawberry",
              "blueberry",
              "raspberry",
              "blackberry",
              "cranberry",
              "cherry",
              "grape",
              "peach",
              "nectarine",
              "plum",
              "apricot",
              "mango",
              "pineapple",
              "melon",
              "watermelon",
              "kiwi",
              "pomegranate",
              "fig",
              "date",
              "lemon juice",
              "lime juice",
              // fresh herbs (dried ones go to spices by the `dried` cue)
              "herb",
              "basil",
              "parsley",
              "cilantro",
              "dill",
              "mint",
              "chive",
              "lemongrass",
              "mitsuba",
              "lavender",
            ],
          ],
          [
            "meat-fish",
            [
              "meat",
              "chicken",
              "beef",
              "steak",
              "pork",
              "bacon",
              "ham",
              "sausage",
              "chorizo",
              "pancetta",
              "prosciutto",
              "salami",
              "soppressata",
              "sopressata",
              "mortadella",
              "lardo",
              "pepperoni",
              "hot dog",
              "turkey",
              "lamb",
              "veal",
              "duck",
              "oxtail",
              "brisket",
              "roast",
              "rib",
              "chuck",
              "tenderloin",
              "meatball",
              "casing",
              "fish",
              "salmon",
              "tuna",
              "cod",
              "haddock",
              "halibut",
              "tilapia",
              "mackerel",
              "anchovy",
              "shrimp",
              "scallop",
              "crab",
              "crabmeat",
              "lobster",
              "clam",
              "mussel",
            ],
          ],
          [
            "dairy-eggs",
            [
              "egg",
              "egg white",
              "egg yolk",
              "milk",
              "buttermilk",
              "kefir",
              "cream",
              "heavy cream",
              "light cream",
              "half and half",
              "sour cream",
              "creme fraiche",
              "butter",
              "ghee",
              "margarine",
              "yogurt",
              "cheese",
              "cream cheese",
              "cheddar",
              "mozzarella",
              "parmesan",
              "parm",
              "parmigiano",
              "pecorino",
              "ricotta",
              "feta",
              "goat cheese",
              "gruyere",
              "swiss",
              "provolone",
              "mascarpone",
              "monterey jack",
              "pepper jack",
              "pepperjack",
              "queso fresco",
              "cotija",
              "orange juice",
            ],
          ],
          [
            "bakery",
            [
              "bread",
              "flatbread",
              "baguette",
              "bun",
              "hot dog bun",
              "roll",
              "tortilla",
              "tostada",
              "pita",
              "naan",
              "bagel",
              "croissant",
              "brioche",
              "english muffin",
              "doughnut",
              "donut",
              "sourdough",
              "pizza dough",
              "pie crust",
              "pie dough",
              "pastry dough",
            ],
          ],
          [
            "pantry",
            [
              // baking
              "flour",
              "all purpose",
              "sugar",
              "brown sugar",
              "powdered sugar",
              "baking soda",
              "baking powder",
              "yeast",
              "active dry",
              "cornstarch",
              "starch",
              "cornmeal",
              "masa",
              "masa harina",
              "cocoa",
              "cacao",
              "cocoa powder",
              "espresso powder",
              "milk powder",
              "chocolate",
              "chocolate chip",
              "morsel",
              "chip",
              "candy",
              "candy melt",
              "sprinkle",
              "food coloring",
              "marshmallow",
              "shortening",
              "lard",
              "gelatin",
              "gelatine",
              "honey",
              "agave",
              "maple syrup",
              "molasses",
              "corn syrup",
              "syrup",
              "caramel",
              "butterscotch",
              "oat",
              "oats",
              "grits",
              "graham cracker",
              "cracker",
              "cookie",
              "pretzel",
              "breadcrumb",
              "bread crumb",
              "panko",
              "crouton",
              "stuffing",
              "matzoh meal",
              "mix",
              // oils, vinegars, condiments
              "oil",
              "spray",
              "vinegar",
              "mustard",
              "stone ground mustard",
              "dijon",
              "ketchup",
              "mayonnaise",
              "mayo",
              "dressing",
              "sauce",
              "worcestershire",
              "sriracha",
              "gochujang",
              "sambal",
              "salsa",
              "adobo",
              "chipotle in adobo",
              "chipotle pepper in adobo",
              "chipotle chile in adobo",
              "chipotle chili in adobo",
              "ranch",
              "paste",
              "puree",
              "passata",
              "gravy",
              "jam",
              "jelly",
              "preserve",
              "conserve",
              "curd",
              "applesauce",
              "peanut butter",
              "almond butter",
              "nut butter",
              "apple butter",
              "tahini",
              "miso",
              "relish",
              "pickle",
              "sauerkraut",
              "horseradish",
              "olive",
              "caper",
              "pepperoncini",
              "juice",
              // cans, cartons and dry goods
              "broth",
              "stock",
              "bouillon",
              "boullion",
              "better than bouillon",
              "chicken base",
              "beef base",
              "dashi",
              "kombu",
              "nori",
              "seaweed",
              "soup",
              "sun tomato",
              "coconut milk",
              "coconut cream",
              "evaporated milk",
              "condensed milk",
              "bean",
              "chickpea",
              "lentil",
              "split pea",
              "black eyed pea",
              "hominy",
              "pasta",
              "spaghetti",
              "macaroni",
              "noodle",
              "gnocchi",
              "rice",
              "risotto",
              "quinoa",
              "couscous",
              "barley",
              "cereal",
              "rice cake",
              "potato flake",
              "corn flake",
              "oat flake",
              // nuts, seeds and dried fruit
              "nut",
              "almond",
              "walnut",
              "pecan",
              "peanut",
              "cashew",
              "pistachio",
              "hazelnut",
              "macadamia",
              "seed",
              "pepita",
              "flaxseed",
              "raisin",
              "coconut",
              "coconut flake",
              // drinks, mixers and wine (spirits and liqueurs are left to
              // `other`: a liquor store, not a grocery aisle)
              "soda water",
              "tonic water",
              "ginger ale",
              "cola",
              "lemonade",
              "bitters",
              "prosecco",
              "champagne",
              "coffee",
              "espresso",
              "tea",
              "wine",
              "beer",
              "sherry",
              "mirin",
              "sake",
            ],
          ],
          [
            "spices",
            [
              "salt",
              "diamond crystal",
              "pepper",
              "black pepper",
              "white pepper",
              "lemon pepper",
              "peppercorn",
              "cayenne",
              "flake",
              "red pepper flake",
              ...chiles(DRIED_CHILES),
              "paprika",
              "cumin",
              "coriander",
              "turmeric",
              "cinnamon",
              "nutmeg",
              "mace",
              "clove",
              "allspice",
              "allspice berry",
              "cardamom",
              "cardamon",
              "fenugreek",
              "chili powder",
              "chile powder",
              "garlic powder",
              "onion powder",
              "mustard powder",
              "ground mustard",
              "dry mustard",
              "curry powder",
              "powder",
              "garam masala",
              "msg",
              "togarashi",
              "oregano",
              "thyme",
              "rosemary",
              "sage",
              "bay leaf",
              "marjoram",
              "tarragon",
              "caraway seed",
              "fennel seed",
              "celery seed",
              "cumin seed",
              "coriander seed",
              "mustard seed",
              "nigella seed",
              "poppy seed",
              "extract",
              "vanilla",
              "vanilla bean",
              "cream of tartar",
              "seasoning",
              "rub",
              "spice",
            ],
          ],
          [
            "frozen",
            [
              "ice cream",
              "sorbet",
              "whipped topping",
              "puff pastry",
              "phyllo",
              "filo",
              "kataifi",
              "tater tot",
            ],
          ],
          [
            /* Made, not bought: kept off the aisles their words would borrow. */
            "other",
            [
              "sourdough starter",
              "sourdough discard",
              "starter",
              "levain",
              "leaven",
              "poolish",
              "preferment",
              "autolyse",
              "tangzhong",
              "soaker",
            ],
          ],
        ] as [Aisle, string[]][]
      ).flatMap(([aisle, phrases]) =>
        phrases.map((phrase): [string, Aisle] => [phrase, aisle]),
      ),
    ),
  );

/**
 * Herbs a `dried` cue sends to the spice rack, though fresh is their default
 * (other dried produce, fruit and mushrooms, goes to the pantry).
 */
const HERBS = [
  "basil",
  "parsley",
  "cilantro",
  "dill",
  "mint",
  "chive",
  "lavender",
  "chile",
  "chili",
];

/** A name's words as entries are keyed: folded, punctuation gone, singular. */
function keyWords(name: string): string[] {
  return fold(name)
    .replace(/@na$/, "")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(singular);
}

/** The key an entry or an override is compared by: `Green Onions` → `green onion`. */
export function aisleKey(name: string): string {
  return keyWords(name).join(" ");
}

interface Lookup {
  exact: Map<string, Aisle>;
  /** Entries of two words or more, longest first. */
  phrases: [string[], Aisle][];
  words: Map<string, Aisle>;
}

function buildLookup(entries: Record<string, Aisle>): Lookup {
  const exact = new Map<string, Aisle>();
  const phrases: [string[], Aisle][] = [];
  const words = new Map<string, Aisle>();
  for (const [phrase, aisle] of Object.entries(entries)) {
    const key = keyWords(phrase);
    if (key.length === 0) continue;
    exact.set(key.join(" "), aisle);
    if (key.length === 1) words.set(key[0], aisle);
    else phrases.push([key, aisle]);
  }
  phrases.sort(
    (a, b) =>
      b[0].length - a[0].length ||
      b[0].join(" ").length - a[0].join(" ").length,
  );
  return { exact, phrases, words };
}

const LOOKUP = buildLookup(DEFAULT_AISLE_WORDS);
const HERB_KEYS = new Set(HERBS.map(aisleKey));

function containsPhrase(words: string[], phrase: string[]): boolean {
  for (let i = 0; i + phrase.length <= words.length; i++) {
    if (phrase.every((word, j) => words[i + j] === word)) return true;
  }
  return false;
}

/** The word steps: exact, a phrase, the last word, any word right to left. */
function lookupWords(words: string[]): Aisle | undefined {
  const exact = LOOKUP.exact.get(words.join(" "));
  if (exact) return exact;
  for (const [phrase, aisle] of LOOKUP.phrases) {
    if (containsPhrase(words, phrase)) return aisle;
  }
  for (let i = words.length - 1; i >= 0; i--) {
    const found = LOOKUP.words.get(words[i]);
    if (found) return found;
  }
  return undefined;
}

/** Leading words that shelve a thing wherever its name would put it. */
const SHELF_CUES: Record<string, Aisle> = {
  frozen: "frozen",
  canned: "pantry",
  can: "pantry",
  tinned: "pantry",
  jarred: "pantry",
  pickled: "pantry",
};

/**
 * A leading word that says where the thing is shelved: `frozen peas` are in
 * the freezer, `canned corn` and `pickled jalapeno` in the pantry, `ground
 * ginger` and `dried oregano` on the spice rack — while `ground beef` stays
 * meat, `ground almonds` pantry, and `dried cranberries` go to the pantry.
 *
 * Checked before the word steps, not after: the last word (`pea`, `ginger`)
 * would otherwise answer first. `ingredientNames` drops `dried` (and
 * `fresh`) as descriptive, so a `nameKey` never carries it; the cue serves a
 * label or override written by hand.
 */
function lookupCue(words: string[]): Aisle | undefined {
  if (words.length < 2) return undefined;
  const [cue, ...rest] = words;
  if (SHELF_CUES[cue]) return SHELF_CUES[cue];
  if (cue !== "ground" && cue !== "powdered" && cue !== "dried") {
    return undefined;
  }
  const inner = lookupWords(rest);
  if (cue !== "dried") {
    return inner === "produce" || inner === "spices" ? "spices" : inner;
  }
  if (inner === "spices" || HERB_KEYS.has(rest.join(" "))) return "spices";
  return inner === "produce" ? "pantry" : inner;
}

/**
 * The aisle for an ingredient name.
 *
 * In order: `overrides` (keyed by `nameKey`, read through `aisleKey` so a
 * typed "Green Onions" works) always wins; then the name exactly as an
 * entry; a leading cue (`frozen`, `canned`, `pickled`, `ground`, `dried`, …);
 * a known phrase anywhere in it (`brown sugar`, `chicken broth`), longest
 * first; its last word; any other word, right to left; and `other` when
 * nothing knows it.
 */
export function aisleFor(
  name: string,
  overrides?: Readonly<Record<string, Aisle>>,
): Aisle {
  const words = keyWords(name);
  if (words.length === 0) return "other";
  const key = words.join(" ");
  if (overrides) {
    const direct = overrides[key];
    if (isAisle(direct)) return direct;
    for (const [overrideKey, aisle] of Object.entries(overrides)) {
      if (isAisle(aisle) && aisleKey(overrideKey) === key) return aisle;
    }
  }
  return (
    LOOKUP.exact.get(key) ?? lookupCue(words) ?? lookupWords(words) ?? "other"
  );
}
