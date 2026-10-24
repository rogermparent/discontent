/**
 * Ingredient headings tied to an option of a set (45e2, G1): a heading
 * carrying the set's label as `choice`, whose name meets the option's
 * (`nameKey`: "For the bagels" is `Bagels`), owns that option's extra lines.
 * Pure, for the rows' select and its tests.
 */
import type { Ingredient, InstructionEntry } from "../../../controller/types";
import type { Choices } from "../../../util/alternatives";
import { nameKey, readChoices } from "../../../util/readChoices";
import { stripMarkup } from "../../../util/ingredientNames";
import { plainLine } from "./ingredientRows";

/** An option a heading can be tied to: "Then make › Bagels". */
export interface TieOption {
  /** `<set key>/<option slug>`: the select's value. */
  value: string;
  setLabel: string;
  optionLabel: string;
  /** "Then make › Bagels". */
  label: string;
}

/** What one heading row shows about ties. */
export interface HeadingTie {
  /** The option it is tied to, by its `choice` and its name. */
  tied?: TieOption;
  /** No tie yet, and its name meets this option's: offer it. */
  suggestion?: TieOption;
  /** It has a `choice` that ties it to nothing ("Then make", no "Toppings"). */
  dangling?: string;
}

function readable(text: string | undefined): string {
  return stripMarkup(plainLine(text ?? "")).trim();
}

/** Every option of every set, in the recipe's order. */
export function tieOptions(choices: Choices): TieOption[] {
  return choices.sets.flatMap((set) =>
    set.options.map((option) => ({
      value: `${set.key}/${option.slug}`,
      setLabel: set.label,
      optionLabel: option.label,
      label: `${set.label} › ${option.label}`,
    })),
  );
}

/**
 * Each heading's tie, by its index in `ingredients` (headings only): the
 * option it owns lines for, the one its name suggests, or a `choice` that
 * meets no option. Empty when the recipe has no sets.
 */
export function headingTies(
  ingredients: readonly Ingredient[],
  instructions: readonly InstructionEntry[],
): { options: TieOption[]; ties: Map<number, HeadingTie> } {
  const choices = readChoices({
    ingredients: [...ingredients],
    instructions: [...instructions],
  });
  const ties = new Map<number, HeadingTie>();
  const options = tieOptions(choices);
  if (options.length === 0) return { options, ties };
  /* Every heading an option's lines run under: its first, and a second
   * heading of the same name and label, whose lines `readChoices` gives
   * that option too. */
  const owner = new Map<number, TieOption>();
  for (const set of choices.sets) {
    for (const option of set.options) {
      const tie = options.find(
        (candidate) => candidate.value === `${set.key}/${option.slug}`,
      )!;
      for (const line of option.ingredientLines) {
        if (ingredients[line]?.type === "heading") owner.set(line, tie);
      }
    }
  }
  ingredients.forEach((line, index) => {
    if (line.type !== "heading") return;
    const tied = line.choice?.trim() ? owner.get(index) : undefined;
    if (tied) {
      ties.set(index, { tied });
      return;
    }
    if (line.choice?.trim()) {
      ties.set(index, { dangling: line.choice.trim() });
      return;
    }
    const key = nameKey(readable(line.ingredient));
    const meets = key
      ? options.filter((option) => nameKey(option.optionLabel) === key)
      : [];
    /* One option it plainly means: two sets with a "Bagels" each is the
     * person's call, from the select. */
    ties.set(index, meets.length === 1 ? { suggestion: meets[0] } : {});
  });
  return { options, ties };
}

/**
 * `ingredients` with the heading at `index` tied to `option` — renamed to
 * the option's name when its own does not meet it, since the tie is by
 * name (`renamed` is the name it had) — or untied when `option` is
 * undefined. `original` is the name a tie renamed it from, if one did: an
 * untie, or a tie to an option that name meets, gives it back.
 */
export function tieHeading(
  ingredients: readonly Ingredient[],
  index: number,
  option: TieOption | undefined,
  original?: string,
): { ingredients: Ingredient[]; renamed?: string } {
  const line = ingredients[index];
  if (!line || line.type !== "heading")
    return { ingredients: [...ingredients] };
  const name = original ?? line.ingredient;
  const swap = (next: Ingredient) =>
    ingredients.map((other, i) => (i === index ? next : other));
  if (!option) {
    const { choice: _choice, ...rest } = line;
    void _choice;
    return { ingredients: swap({ ...rest, ingredient: name }) };
  }
  const meets = nameKey(readable(name)) === nameKey(option.optionLabel);
  return {
    ingredients: swap({
      ...line,
      ingredient: meets ? name : option.optionLabel,
      choice: option.setLabel,
    }),
    ...(meets ? {} : { renamed: name }),
  };
}
