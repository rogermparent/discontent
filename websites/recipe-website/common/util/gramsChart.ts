/**
 * The gram bank's built-in seed (51f, Roger's answer 3): King Arthur
 * Baking's ingredient weight chart,
 * https://www.kingarthurbaking.com/learn/ingredient-weight-chart, fetched
 * once on 2026-11-28 (one request, 326 rows) and transcribed here by hand.
 * Nothing reads the chart at runtime.
 *
 * Each row is the chart's own: its ingredient as printed, the volume it
 * weighs, and the grams it gives. `keys` are the grams keys (`gramsKeyOf`,
 * `gramsBank.ts`: the shopping name key, with the line's preparation words
 * such as "dried" or "sliced" put back) a recipe line reaches it by, and a
 * test checks each one is what a typed "1 cup <key>" line keys as. The
 * grams per cup are worked out from the row (`chartGramsPerCup`), so a
 * teaspoon row (baking powder, 4 g) stays exact: 192 g a cup, and 2½ tsp is
 * 10 g again.
 *
 * Left out, on purpose (51f Df1): King Arthur's own branded products and
 * mixes (Climate Blend, Baker's Special Sugar, Harvest Grains Blend…);
 * rows given as a range ("140 to 170"); rows counted rather than measured
 * (an egg, a head of garlic: the bank is grams per cup, Roger's answer 4);
 * and kosher salt, which the chart gives as 8 g (Diamond Crystal) or 16 g
 * (Morton's) a tablespoon, too far apart for one value.
 *
 * Where epic 49's `GRAMS_PER_CUP` already had a value that differs, the
 * house value stays (`HOUSE_GRAMS_PER_CUP`, each with why), as the brief
 * asks.
 */

export interface ChartRow {
  /** The chart's ingredient, as printed. */
  row: string;
  /** The volume the chart weighs: "1 cup", "1/4 cup", "2 tablespoons". */
  volume: string;
  /** The chart's grams for that volume. */
  grams: number;
  /** Grams keys this row is the density of. */
  keys: readonly string[];
}

const row = (
  name: string,
  volume: string,
  grams: number,
  keys: readonly string[],
): ChartRow => ({ row: name, volume, grams, keys });

export const KING_ARTHUR_CHART: readonly ChartRow[] = [
  row("Agave syrup", "1/4 cup", 84, ["agave syrup", "agave nectar"]),
  row("All-Purpose Flour", "1 cup", 120, ["all purpose flour", "flour"]),
  row("Almond butter", "1/4 cup", 68, ["almond butter"]),
  row("Almond Flour", "1 cup", 96, ["almond flour"]),
  row("Almond meal", "1 cup", 84, ["almond meal"]),
  row("Almond paste (packed)", "1 cup", 259, ["almond paste"]),
  row("Almonds (sliced)", "1/2 cup", 43, ["sliced almond"]),
  row("Almonds (slivered)", "1/2 cup", 57, ["slivered almond"]),
  row("Almonds, whole (unblanched)", "1 cup", 142, ["almond"]),
  row("Apples (peeled, sliced)", "1 cup", 113, ["sliced apple", "apple"]),
  row("Applesauce", "1 cup", 255, ["applesauce", "unsweetened applesauce"]),
  row("Apricots (dried, diced)", "1/2 cup", 64, [
    "dried apricot",
    "chopped dried apricot",
  ]),
  row("Bananas (mashed)", "1 cup", 227, ["mashed banana", "banana"]),
  row("Barley (pearled)", "1 cup", 213, ["pearl barley"]),
  row("Barley flour", "1 cup", 85, ["barley flour"]),
  row("Barley malt syrup", "2 tablespoons", 42, ["barley malt syrup"]),
  row("Basil pesto", "2 tablespoons", 28, ["basil pesto", "pesto"]),
  row("Bell peppers (fresh)", "1 cup", 142, [
    "bell pepper",
    "chopped bell pepper",
  ]),
  row("Berries (frozen)", "1 cup", 142, ["frozen berry"]),
  row("Blueberries (dried)", "1 cup", 156, ["dried blueberry"]),
  row("Blueberry juice", "1 cup", 241, ["blueberry juice"]),
  row("Boiled cider", "1/4 cup", 85, ["boiled cider"]),
  row("Bread Flour", "1 cup", 120, ["bread flour"]),
  row("Breadcrumbs (dried)", "1/4 cup", 28, [
    "dried breadcrumb",
    "breadcrumb",
    "bread crumb",
  ]),
  row("Breadcrumbs (Japanese Panko)", "1 cup", 50, [
    "panko",
    "panko breadcrumb",
  ]),
  row("Brown rice (cooked)", "1 cup", 170, ["cooked brown rice"]),
  row("Brown rice flour", "1 cup", 128, ["brown rice flour"]),
  row("Brown sugar (dark or light, packed)", "1 cup", 213, [
    "brown sugar",
    "light brown sugar",
    "dark brown sugar",
  ]),
  row("Buckwheat Flour", "1 cup", 120, ["buckwheat flour"]),
  row("Bulgur", "1 cup", 152, ["bulgur"]),
  row("Butter", "8 tablespoons (1/2 cup)", 113, [
    "butter",
    "unsalted butter",
    "salted butter",
  ]),
  row("Buttermilk", "1 cup", 227, ["buttermilk"]),
  row("Buttermilk powder", "2 tablespoons", 18, ["buttermilk powder"]),
  row("Cacao nibs", "1 cup", 120, ["cacao nib"]),
  row("Caramel bits (chopped Heath or toffee)", "1 cup", 156, [
    "caramel bit",
    "toffee bit",
  ]),
  row("Caraway seeds", "2 tablespoons", 18, ["caraway seed"]),
  row("Carrots (diced)", "1 cup", 142, ["chopped carrot"]),
  row("Carrots (grated)", "1 cup", 99, ["grated carrot", "carrot"]),
  row("Cashews (chopped)", "1 cup", 113, ["chopped cashew", "cashew"]),
  row("Celery (diced)", "1 cup", 142, ["chopped celery", "celery"]),
  row("Cheese (Feta)", "1/2 cup", 57, ["feta cheese"]),
  row("Cheese (grated cheddar, jack, mozzarella, or Swiss)", "1 cup", 113, [
    "cheddar cheese",
    "grated cheddar cheese",
    "monterey jack cheese",
    "grated monterey jack cheese",
    "mozzarella cheese",
    "grated mozzarella cheese",
    "swiss cheese",
    "grated swiss cheese",
  ]),
  row("Cheese (grated Parmesan)", "1/2 cup", 50, [
    "parmesan cheese",
    "grated parmesan cheese",
  ]),
  row("Cheese (Ricotta)", "1 cup", 227, ["ricotta cheese"]),
  row("Cherries (candied)", "1/4 cup", 50, ["candied cherry"]),
  row("Cherries (dried)", "1/2 cup", 71, ["dried cherry"]),
  row("Cherries (frozen)", "1 cup", 113, ["frozen cherry"]),
  row("Chia seeds", "1/4 cup", 37, ["chia seed"]),
  row("Chickpea flour", "1 cup", 85, ["chickpea flour"]),
  row("Chives (fresh)", "1/2 cup", 21, ["chive"]),
  row("Chocolate (chopped)", "1 cup", 170, ["chopped chocolate", "chocolate"]),
  row("Chocolate Chips", "1 cup", 170, [
    "chocolate chip",
    "semisweet chocolate chip",
  ]),
  row("Chocolate Chunks", "1 cup", 170, ["chocolate chunk"]),
  row("Cinnamon-Sugar", "1/4 cup", 50, ["cinnamon sugar"]),
  row("Cocoa (unsweetened)", "1/2 cup", 42, [
    "cocoa powder",
    "dutch process cocoa powder",
    "cocoa",
  ]),
  row("Coconut (sweetened, shredded)", "1 cup", 85, [
    "sweetened coconut",
    "grated sweetened coconut",
    "grated coconut",
  ]),
  row("Coconut (toasted)", "1 cup", 85, ["toasted coconut"]),
  row("Coconut (unsweetened, shredded)", "1 cup", 53, [
    "unsweetened coconut",
    "grated unsweetened coconut",
  ]),
  row("Coconut cream (unsweetened)", "1 cup", 284, ["coconut cream"]),
  row("Coconut Flour", "1 cup", 128, ["coconut flour"]),
  row("Coconut milk; canned, well shaken", "1 cup", 241, [
    "coconut milk",
    "canned coconut milk",
  ]),
  row("Coconut oil", "1/2 cup", 113, ["coconut oil"]),
  row("Coconut sugar", "1/2 cup", 77, ["coconut sugar"]),
  row("Confectioners' sugar (unsifted)", "1 cup", 113, ["powdered sugar"]),
  row("Cookie butter", "1/4 cup", 72, ["cookie butter"]),
  row("Cookie crumbs", "1 cup", 85, ["cookie crumb"]),
  row("Corn (fresh or frozen)", "1/4 cup", 38, ["corn", "frozen corn"]),
  row("Corn (popped)", "4 cups", 21, ["popped popcorn"]),
  row("Corn syrup", "1 cup", 312, ["corn syrup", "light corn syrup"]),
  row("Cornmeal (whole)", "1 cup", 138, ["cornmeal", "yellow cornmeal"]),
  row("Cornstarch", "1/4 cup", 28, ["cornstarch"]),
  row("Cottage cheese", "1/2 cup", 113, ["cottage cheese"]),
  row("Cranberries (dried)", "1/2 cup", 57, ["dried cranberry"]),
  row("Cranberries (fresh or frozen)", "1 cup", 99, ["cranberry"]),
  row("Cream (heavy cream, light cream, or half & half)", "1 cup", 227, [
    "heavy cream",
    "light cream",
    "half and half",
  ]),
  row("Cream cheese", "1 cup", 227, ["cream cheese"]),
  row("Cream of coconut", "1/2 cup", 142, ["cream of coconut"]),
  row("Crème fraiche", "1/2 cup", 113, ["creme fraiche"]),
  row("Currants", "1 cup", 142, ["currant"]),
  row("Dates (chopped)", "1 cup", 149, ["chopped date", "date"]),
  row("Demerara sugar", "1 cup", 220, ["demerara sugar"]),
  row("Dried milk (Baker's Special Dry Milk)", "1/4 cup", 28, ["dried milk"]),
  row("Dried nonfat milk (powdered)", "1/4 cup", 28, ["nonfat dry milk"]),
  row("Dried potato flakes (instant mashed potatoes)", "1/2 cup", 43, [
    "instant potato",
    "mashed instant potato",
  ]),
  row("Durum Flour", "1 cup", 124, ["durum flour"]),
  row("Egg whites (dried)", "2 tablespoons", 11, ["dried egg white"]),
  row("Espresso Powder", "1 tablespoon", 7, [
    "espresso powder",
    "instant espresso powder",
  ]),
  row("Figs (dried, chopped)", "1 cup", 149, [
    "dried fig",
    "chopped dried fig",
  ]),
  row("Flax meal", "1/2 cup", 50, ["flax meal", "ground flaxseed"]),
  row("Flaxseed", "1/4 cup", 35, ["flaxseed"]),
  row("Garlic (minced)", "2 tablespoons", 28, ["minced garlic", "garlic"]),
  row("Garlic (peeled and sliced)", "1 cup", 149, ["sliced garlic"]),
  row("Ghee", "1/4 cup", 44, ["ghee"]),
  row("Ginger (fresh, sliced)", "1/4 cup", 57, ["sliced ginger"]),
  row("Glutinous rice flour", "1 cup", 120, ["glutinous rice flour"]),
  row(
    "Graham cracker crumbs (store-bought or crushed from whole)",
    "1 cup (6 to 7 crackers)",
    100,
    ["graham cracker crumb", "crushed graham cracker"],
  ),
  row("Granola", "1 cup", 113, ["granola"]),
  row("Guava paste", "1/4 cup", 100, ["guava paste"]),
  row("Hazelnut flour", "1 cup", 89, ["hazelnut flour"]),
  row("Hazelnut spread", "1/2 cup", 160, ["hazelnut spread", "nutella"]),
  row("Hazelnuts (whole)", "1 cup", 142, ["hazelnut"]),
  row("High-Gluten Flour", "1 cup", 120, ["high gluten flour"]),
  row("Honey", "1 tablespoon", 21, ["honey"]),
  row("Jam or preserves", "1/4 cup", 85, ["jam", "preserve"]),
  row("Key Lime Juice", "1 cup", 227, ["key lime juice"]),
  row("Lard", "1/2 cup", 113, ["lard"]),
  row("Leeks (diced)", "1 cup", 92, ["chopped leek", "leek"]),
  row("Lemon Curd", "1/2 cup", 113, ["lemon curd"]),
  row("Lemon juice", "1 tablespoon", 14, ["lemon juice"]),
  row("Macadamia nuts (whole)", "1 cup", 149, ["macadamia nut"]),
  row("Malted Milk Powder", "1/4 cup", 35, ["malted milk powder"]),
  row("Maple sugar", "1/2 cup", 78, ["maple sugar"]),
  row("Maple syrup", "1/2 cup", 156, ["maple syrup"]),
  row("Marshmallow Fluff®", "1 cup", 128, ["marshmallow fluff"]),
  row("Marshmallows (mini)", "1 cup", 43, ["mini marshmallow"]),
  row("Marzipan", "1 cup", 290, ["marzipan"]),
  row("Masa Harina", "1 cup", 93, ["masa harina"]),
  row("Mascarpone cheese", "1 cup", 227, ["mascarpone cheese"]),
  row("Mashed potatoes", "1 cup", 213, ["mashed potato"]),
  row("Mashed sweet potatoes", "1 cup", 240, [
    "mashed sweet potato",
    "sweet potato puree",
  ]),
  row("Matcha powder", "2 tablespoons", 12, ["matcha powder"]),
  row("Mayonnaise", "1/2 cup", 113, ["mayonnaise"]),
  row("Meringue powder", "1/4 cup", 43, ["meringue powder"]),
  row("Milk (evaporated)", "1/2 cup", 113, ["evaporated milk"]),
  row("Milk (fresh)", "1 cup", 227, ["milk"]),
  row("Millet (whole)", "1/2 cup", 103, ["millet"]),
  row("Mini chocolate chips", "1 cup", 177, ["mini chocolate chip"]),
  row("Molasses", "1/4 cup", 85, ["molasses"]),
  row("Mushrooms (sliced)", "1 cup", 78, ["sliced mushroom", "mushroom"]),
  row("Oat bran", "1/2 cup", 53, ["oat bran"]),
  row("Oat Flour", "1 cup", 92, ["oat flour"]),
  row("Oats (old-fashioned or quick-cooking)", "1 cup", 89, [
    "rolled oats",
    "old fashioned oats",
    "quick oats",
    "quick cooking oats",
  ]),
  row("Olive oil", "1/4 cup", 50, ["olive oil", "extra virgin olive oil"]),
  row("Olives (sliced)", "1 cup", 142, ["sliced olive", "olive"]),
  row("Onions (fresh, diced)", "1 cup", 142, ["chopped onion", "onion"]),
  row("Passion fruit purée", "1/3 cup", 60, ["passion fruit puree"]),
  row("Pastry Flour", "1 cup", 106, ["pastry flour"]),
  row("Peaches (peeled and diced)", "1 cup", 170, ["chopped peach", "peach"]),
  row("Peanut butter", "1/2 cup", 135, [
    "peanut butter",
    "creamy peanut butter",
  ]),
  row("Peanuts (whole, shelled)", "1 cup", 142, ["peanut"]),
  row("Pears (peeled and diced)", "1 cup", 163, ["chopped pear", "pear"]),
  row("Pecan Meal", "1 cup", 80, ["pecan meal"]),
  row("Pecans (diced)", "1/2 cup", 57, ["chopped pecan"]),
  row("Pecans (whole)", "1 cup", 105, ["pecan", "pecan half"]),
  row("Pine nuts", "1/2 cup", 71, ["pine nut"]),
  row("Pineapple (crushed, drained)", "1 cup", 256, ["crushed pineapple"]),
  row("Pineapple (fresh or canned, diced)", "1 cup", 170, [
    "chopped pineapple",
    "pineapple",
  ]),
  row("Pistachio nuts (shelled)", "1/2 cup", 60, [
    "pistachio",
    "shelled pistachio",
  ]),
  row("Pizza sauce", "1/4 cup", 57, ["pizza sauce"]),
  row("Polenta (coarse ground cornmeal)", "1 cup", 163, ["polenta"]),
  row("Poppy seeds", "2 tablespoons", 18, ["poppy seed"]),
  row("Potato Flour", "1/4 cup", 46, ["potato flour"]),
  row("Potato starch", "1 cup", 152, ["potato starch"]),
  row("Pumpernickel Flour", "1 cup", 106, ["pumpernickel flour"]),
  row("Pumpkin purée", "1 cup", 227, ["pumpkin puree"]),
  row("Pumpkin seeds", "1/4 cup", 40, ["pumpkin seed", "pepita"]),
  row("Queso fresco", "1/2 cup", 57, ["queso fresco"]),
  row("Quinoa (cooked)", "1 cup", 184, ["cooked quinoa"]),
  row("Quinoa (whole)", "1 cup", 177, ["quinoa"]),
  row("Quinoa flour", "1 cup", 110, ["quinoa flour"]),
  row("Raisins (loose)", "1 cup", 149, ["raisin", "golden raisin"]),
  row("Raspberries (fresh)", "1 cup", 120, ["raspberry"]),
  row("Rice (long grain, dry)", "1/2 cup", 99, ["long grain rice"]),
  row("Rice flour (white)", "1 cup", 142, ["rice flour"]),
  row("Rice Krispies", "1 cup", 28, ["rice krispy", "rice cereal"]),
  row("Rye Flour Blend", "1 cup", 106, ["rye flour"]),
  row("Rye flakes", "1 cup", 124, ["rye flake"]),
  row("Salt (table)", "1 tablespoon", 18, ["salt", "table salt"]),
  row("Scallions (sliced)", "1 cup", 64, ["sliced green onion", "green onion"]),
  row("Self-Rising Flour", "1 cup", 113, ["self rising flour"]),
  row("Semolina Flour", "1 cup", 163, ["semolina flour", "semolina"]),
  row("Sesame seeds", "1/2 cup", 71, ["sesame seed"]),
  row("Shallots (peeled and sliced)", "1 cup", 156, [
    "sliced shallot",
    "shallot",
  ]),
  row("Sorghum flour", "1 cup", 138, ["sorghum flour"]),
  row("Sour cream", "1 cup", 227, ["sour cream"]),
  row("Soy flour", "1/4 cup", 35, ["soy flour"]),
  row("Sparkling Sugar", "1/4 cup", 57, ["sparkling sugar"]),
  row("Spelt Flour", "1 cup", 99, ["spelt flour"]),
  row("Steel cut oats", "1/2 cup", 70, ["steel cut oats"]),
  row("Strawberries (fresh sliced)", "1 cup", 167, [
    "sliced strawberry",
    "strawberry",
  ]),
  row("Sugar (granulated white)", "1 cup", 198, ["granulated sugar"]),
  row("Sundried tomatoes (dry pack)", "1 cup", 170, ["sundried tomato"]),
  row("Sunflower seeds", "1/4 cup", 35, ["sunflower seed"]),
  row("Swedish Pearl Sugar", "1/4 cup", 49, ["pearl sugar"]),
  row("Sweetened condensed milk", "1/4 cup", 78, ["sweetened condensed milk"]),
  row("Tahini paste", "1/2 cup", 128, ["tahini"]),
  row("Tapioca (quick cooking)", "2 tablespoons", 21, ["minute tapioca"]),
  row("Tapioca starch or flour", "1 cup", 113, [
    "tapioca starch",
    "tapioca flour",
  ]),
  row("Teff flour", "1 cup", 135, ["teff flour"]),
  row("Tomato paste", "2 tablespoons", 29, ["tomato paste"]),
  row("Turbinado sugar (raw)", "1 cup", 180, ["turbinado sugar"]),
  row("Unbleached Cake Flour", "1 cup", 120, ["cake flour"]),
  row("Vanilla Extract", "1 tablespoon", 14, ["vanilla extract", "vanilla"]),
  row("Vegetable oil", "1 cup", 198, ["vegetable oil", "canola oil"]),
  row("Vegetable shortening", "1/4 cup", 46, [
    "vegetable shortening",
    "shortening",
  ]),
  row("Vital Wheat Gluten", "2 tablespoons", 18, ["vital wheat gluten"]),
  row("Walnuts (chopped)", "1 cup", 113, ["chopped walnut"]),
  row("Walnuts (whole)", "1/2 cup", 64, ["walnut", "walnut half"]),
  row("Water", "1 cup", 227, ["water"]),
  row("Wheat bran", "1/2 cup", 32, ["wheat bran"]),
  row("Wheat germ", "1/4 cup", 28, ["wheat germ"]),
  row("White Chocolate Chips", "1 cup", 170, ["white chocolate chip"]),
  row("Whole Wheat Flour (Premium 100%)", "1 cup", 113, [
    "wheat flour",
    "white wheat flour",
  ]),
  row("Whole Wheat Pastry Flour / Graham Flour", "1 cup", 96, [
    "wheat pastry flour",
    "graham flour",
  ]),
  row("Yeast (instant)", "1 tablespoon", 9, ["instant yeast", "yeast"]),
  row("Yogurt", "1 cup", 227, ["yogurt", "greek yogurt"]),
  row("Baking powder", "1 teaspoon", 4, ["baking powder"]),
  row("Baking soda", "1/2 teaspoon", 3, ["baking soda"]),
];

/**
 * Epic 49's densities that differ from the chart, kept (the brief: keep
 * today's values where they differ, or note each change). Each wins over
 * the chart row for its key.
 */
export const HOUSE_GRAMS_PER_CUP: Readonly<
  Record<string, { gramsPerCup: number; why: string }>
> = {
  water: {
    gramsPerCup: 237,
    why: "water's own weight (50a); the chart rounds a cup to 8 oz, 227 g",
  },
  "granulated sugar": {
    gramsPerCup: 200,
    why: "49a's rounded value; the chart says 198 g",
  },
  "powdered sugar": {
    gramsPerCup: 120,
    why: "49a's value; the chart's unsifted cup is 113 g",
  },
  "wheat flour": {
    gramsPerCup: 120,
    why: "49a's value; the chart's whole wheat flour is 113 g",
  },
  rice: {
    gramsPerCup: 185,
    why: "49a: uncooked white rice; the chart has long-grain rice only",
  },
  "rolled oats": {
    gramsPerCup: 90,
    why: "49a's rounded value; the chart says 89 g",
  },
  butter: {
    gramsPerCup: 227,
    why: "49a's value, two sticks; the chart's ½ cup is 113 g",
  },
  "unsalted butter": { gramsPerCup: 227, why: "as butter" },
  "salted butter": { gramsPerCup: 227, why: "as butter" },
  "whole milk": { gramsPerCup: 227, why: "50a, as milk" },
  /* A typed line keys as heavy cream; a merge set's member may not. */
  "whipping cream": { gramsPerCup: 227, why: "50a, as heavy cream" },
};

/** Cups in a chart volume: "1 cup", "1/4 cup", "2 1/4 teaspoons". */
export function chartVolumeCups(volume: string): number | undefined {
  const match =
    /^(\d+)(?:\/(\d+))?(?:\s+(\d+)\/(\d+))?\s+(cups?|tablespoons?|teaspoons?)\b/i.exec(
      volume.trim(),
    );
  if (!match) return undefined;
  const [, whole, over, num, den, unit] = match;
  let qty = over ? Number(whole) / Number(over) : Number(whole);
  if (num && den) qty += Number(num) / Number(den);
  const perCup = /^cup/i.test(unit) ? 1 : /^tablespoon/i.test(unit) ? 16 : 48;
  return qty / perCup;
}

/** A chart row's grams in one US cup. */
export function chartGramsPerCup(entry: ChartRow): number {
  const cups = chartVolumeCups(entry.volume);
  if (!cups) throw new Error(`unreadable chart volume: ${entry.volume}`);
  return entry.grams / cups;
}

export interface BuiltInGrams {
  gramsPerCup: number;
  /** What it comes from: the chart's row, or the house value's reason. */
  from: string;
}

/**
 * Every built-in density by grams key: the chart's rows, then the house
 * values over them. Built once.
 */
export const BUILT_IN_GRAMS: Readonly<Record<string, BuiltInGrams>> = (() => {
  const out: Record<string, BuiltInGrams> = {};
  for (const entry of KING_ARTHUR_CHART) {
    const gramsPerCup = chartGramsPerCup(entry);
    for (const key of entry.keys) {
      out[key] = {
        gramsPerCup,
        from: `King Arthur: ${entry.volume} ${entry.row.toLowerCase()} is ${entry.grams} g`,
      };
    }
  }
  for (const [key, house] of Object.entries(HOUSE_GRAMS_PER_CUP)) {
    out[key] = { gramsPerCup: house.gramsPerCup, from: `House: ${house.why}` };
  }
  return out;
})();

/** Grams in a cup by key, as epic 49's `GRAMS_PER_CUP` reads it. */
export const BUILT_IN_GRAMS_PER_CUP: Readonly<Record<string, number>> =
  Object.fromEntries(
    Object.entries(BUILT_IN_GRAMS).map(([key, entry]) => [
      key,
      entry.gramsPerCup,
    ]),
  );
