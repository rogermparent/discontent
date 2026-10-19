import Fraction from "fraction.js";

/**
 * The drink scaler (42c2, canvas B's Moscow mule): on a drink the scaler
 * counts drinks — "1 drink / 2 drinks / 4 drinks" — over the same multiplier
 * every recipe has. The count is the yield's number of drinks times the
 * multiplier.
 */

/** A drink is a recipe with a drink spec or the `drink` tag (27c). */
export function isDrinkRecipe({
  drink,
  tags,
}: {
  drink?: unknown;
  tags?: readonly string[];
}): boolean {
  return (
    Boolean(drink) ||
    Boolean(tags?.some((tag) => tag.toLowerCase() === "drink"))
  );
}

/** What a drink's yield may count in: "2 drinks", "1 serving", "4 cocktails". */
const DRINK_NOUN =
  "(?:drinks?|servings?|cocktails?|glass(?:es)?|mugs?|shots?|portions?)";

/**
 * How many drinks a drink's recipe makes at 1×, read from its yield: "1
 * drink" → 1, "2 servings" → 2, `<Multiplyable baseNumber="2" /> cocktails`
 * → 2, "Serves 4" → 4, "2" → 2; no yield → 1. `undefined` when the yield
 * counts something else — "1 pitcher", "about 6 cups", "2 to 4 servings" — and
 * the scaler then keeps its batch wording (Dc2-6), since "1 drink" would
 * misname a punch bowl.
 */
export function drinkYieldBase(recipeYield?: string): number | undefined {
  const text = (recipeYield ?? "")
    .replace(/<Multiplyable\s+baseNumber="([^"]*)"\s*\/>/gi, "$1")
    .replace(/[*_`]/g, "")
    .trim()
    .toLowerCase();
  if (text === "") return 1;
  const match =
    text.match(new RegExp(`^(\\d+)\\s*${DRINK_NOUN}$`)) ??
    text.match(/^(?:serves|makes)\s+(\d+)(?:\s+(?:drinks?|cocktails?))?$/) ??
    text.match(/^(\d+)$/);
  if (!match) return undefined;
  const count = Number(match[1]);
  return count > 0 ? count : undefined;
}

/** The drinks the scaler offers, as counts. */
export const DRINK_PRESETS = [1, 2, 4] as const;

/** Drinks at this multiplier: the yield's count times it (1× when unset). */
export function drinkCount(base: number, multiplier?: Fraction): Fraction {
  return new Fraction(base).mul(multiplier ?? 1);
}

/** The multiplier that makes `count` drinks, as the scaler's input writes it. */
export function multiplierForDrinks(base: number, count: number): string {
  return new Fraction(count).div(base).toFraction(true);
}

/** "1 drink", "2 drinks", "1/2 drink", "1 1/2 drinks". */
export function drinkCountLabel(count: Fraction | number): string {
  const value = new Fraction(count);
  const noun = value.compare(1) > 0 ? "drinks" : "drink";
  return `${value.toFraction(true)} ${noun}`;
}
