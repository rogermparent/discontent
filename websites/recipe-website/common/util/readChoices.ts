/**
 * A recipe's alternatives as the `Choices` model (45e, G1) — and the recipe
 * cut down to one path, for the readers that need a single value (G2: Make,
 * the plan page, JSON-LD, the shopping list).
 *
 * Its own module, apart from `alternatives.ts`, because pairing an
 * ingredient heading with its option goes through `sectionKey` and so
 * through `ingredientNames`: the recipe page runs this on the server and
 * hands the browser only the model (42c1's rule for the matcher).
 */
import type {
  Ingredient,
  InstructionEntry,
  InstructionGroup,
  Recipe,
} from "../controller/types";
import { detectHeading } from "./detectHeading";
import { stripMarkup } from "./ingredientNames";
import { sectionKey } from "./stepIngredients";
import {
  ALL_OPTIONS,
  choiceSlug,
  shownPath,
  type ChoiceOption,
  type ChoiceSet,
  type Choices,
  type Picks,
} from "./alternatives";

type ChoiceFields = Pick<Recipe, "ingredients" | "instructions">;

function isGroup(entry: InstructionEntry): entry is InstructionGroup {
  return "instructions" in entry;
}

/** A group's `choice`, trimmed; "" for none. */
function choiceOf(entry: InstructionEntry): string {
  return isGroup(entry) && typeof entry.choice === "string"
    ? entry.choice.trim()
    : "";
}

/**
 * How a heading and an option name meet: `sectionKey`, else the slug
 * ("For the bagels" and "Bagels" are both `bagel`). The edit form ties a
 * heading to an option by this (45e2).
 */
export function nameKey(text: string): string {
  return sectionKey(text) || choiceSlug(stripMarkup(text));
}

/** A key not yet taken: `key`, `key-2`, `key-3`… */
function unique(key: string, taken: Set<string>): string {
  let candidate = key;
  for (let n = 2; taken.has(candidate); n++) candidate = `${key}-${n}`;
  taken.add(candidate);
  return candidate;
}

/**
 * The sets of `recipe`: each run of consecutive groups with the same
 * `choice` (compared by slug, so "Then make" and "then make" are one), its
 * groups the options in order. Groups of one name inside a run are one
 * option. A run with fewer than two options is no set — its group reads as
 * an ordinary one — and so is a `choice` on a bare step.
 *
 * An ingredient heading carrying a set's `choice` whose name meets an
 * option's (`sectionKey`) owns that option's lines, from the heading to the
 * next heading (stored, or one `detectHeading` sees, as `lineNames` reads
 * sections). A heading that meets no option is an ordinary heading.
 */
export function readChoices(recipe: ChoiceFields): Choices {
  const instructions = recipe.instructions ?? [];
  const ingredients = recipe.ingredients ?? [];
  const entrySteps = instructions.map((entry) =>
    isGroup(entry) ? (entry.instructions ?? []).length : 1,
  );
  const sets: ChoiceSet[] = [];
  const setKeys = new Set<string>();

  let i = 0;
  while (i < instructions.length) {
    const label = choiceOf(instructions[i]);
    const slug = choiceSlug(label);
    if (!label || !slug) {
      i++;
      continue;
    }
    let end = i;
    while (
      end < instructions.length &&
      choiceSlug(choiceOf(instructions[end])) === slug
    ) {
      end++;
    }
    const options: ChoiceOption[] = [];
    const optionSlugs = new Set<string>([ALL_OPTIONS]);
    /* An unnamed group is "Option 2" on the picker (slug `option-2`), and
       never merges with another — not even one named "Option 2". */
    const unnamed = new Set<ChoiceOption>();
    for (let entry = i; entry < end; entry++) {
      const group = instructions[entry] as InstructionGroup;
      const name = (group.name ?? "").trim();
      const base = choiceSlug(name) || `option-${options.length + 1}`;
      const existing = name
        ? options.find(
            (option) =>
              !unnamed.has(option) &&
              choiceSlug(option.label) === choiceSlug(name),
          )
        : undefined;
      if (existing) {
        existing.groupIndexes.push(entry);
        if (!existing.yield && group.recipeYield?.trim()) {
          existing.yield = group.recipeYield.trim();
        }
        continue;
      }
      const option: ChoiceOption = {
        slug: unique(base, optionSlugs),
        label: name || `Option ${options.length + 1}`,
        groupIndexes: [entry],
        ingredientLines: [],
        ...(group.recipeYield?.trim()
          ? { yield: group.recipeYield.trim() }
          : {}),
      };
      if (!name) unnamed.add(option);
      options.push(option);
    }
    if (options.length >= 2) {
      sets.push({ key: unique(slug, setKeys), label, options });
    }
    i = end;
  }

  if (sets.length > 0) assignIngredientLines(sets, ingredients);
  return { sets, entrySteps, ingredientCount: ingredients.length };
}

function assignIngredientLines(
  sets: ChoiceSet[],
  ingredients: readonly Ingredient[],
): void {
  let owner: ChoiceOption | undefined;
  ingredients.forEach((line, index) => {
    const readable = stripMarkup(line.ingredient ?? "").trim();
    const heading =
      line.type === "heading" || (readable !== "" && detectHeading(readable));
    if (heading) {
      owner = undefined;
      const choice = line.type === "heading" ? line.choice?.trim() : undefined;
      if (choice) {
        const key = nameKey(readable);
        const slug = choiceSlug(choice);
        for (const set of sets) {
          if (choiceSlug(set.label) !== slug) continue;
          owner = set.options.find((option) => nameKey(option.label) === key);
          if (owner) break;
        }
      }
    }
    owner?.ingredientLines.push(index);
  });
}

/**
 * `recipe` with only the lines and steps on the path `picks` choose — the
 * default (G2) when `picks` is absent; an "All" pick reads as the default
 * here, since one path is the point. The yield is the chosen option's
 * when it has one. A recipe without sets comes back as it is.
 */
export function recipeOnPath<
  T extends ChoiceFields & Pick<Recipe, "recipeYield">,
>(recipe: T, picks?: Picks): T {
  const choices = readChoices(recipe);
  if (choices.sets.length === 0) return recipe;
  const single: Picks = {};
  for (const set of choices.sets) {
    const pick = picks?.[set.key];
    single[set.key] = pick && pick !== ALL_OPTIONS ? pick : set.options[0].slug;
  }
  const path = shownPath(choices, single);
  const instructions = recipe.instructions?.filter(
    (_, index) => path.entries[index],
  );
  const ingredients = recipe.ingredients?.filter(
    (_, index) => path.lines[index],
  );
  return {
    ...recipe,
    ...(instructions ? { instructions } : {}),
    ...(ingredients ? { ingredients } : {}),
    ...(path.yield ? { recipeYield: path.yield } : {}),
  };
}

/**
 * The ingredient lines off the default path (G2), for the index's
 * `ingredientAlternates`: what `/make` skips. Empty without sets.
 */
export function alternateLines(recipe: ChoiceFields): number[] {
  const choices = readChoices(recipe);
  if (choices.sets.length === 0) return [];
  const path = shownPath(choices);
  return path.lines.flatMap((shown, index) => (shown ? [] : [index]));
}
