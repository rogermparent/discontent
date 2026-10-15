/**
 * Several recipes back into one (36e): the picker's "Import as one recipe
 * instead", for a text the model split that is really one dish in parts —
 * Lagerstrom's butter chicken ("2 recipes in 1 dish": the chicken and its
 * marinade, the sauce, the rice) is the measured case (D10).
 *
 * Deterministic and free — no second reading: each part's name becomes an
 * ingredient heading and an instruction section, in the text's order, and
 * the lines are the parts' own (already grounded, part by part). Type-only
 * imports, so the `/new-recipe` form (a client component) can run it.
 */
import type {
  InstructionEntry,
  InstructionGroup,
  Instruction,
} from "recipe-website-common/controller/types";
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";

/** A video URL without the chapter start a part was given. */
function withoutStart(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("t")) return url;
    parsed.searchParams.delete("t");
    return parsed.href;
  } catch {
    return url;
  }
}

function steps(entries: readonly InstructionEntry[]): Instruction[] {
  return entries.flatMap((entry) =>
    "instructions" in entry
      ? (entry as InstructionGroup).instructions
      : [entry as Instruction],
  );
}

/**
 * The parts as one recipe: named `name` (the video's title), else the first
 * part's; the first part's picture, source and video (without a chapter
 * start); `partial` when any part was.
 */
export function mergeReadings(
  parts: readonly { recipe: Partial<ImportedRecipe> }[],
  name?: string,
): Partial<ImportedRecipe> {
  const [first] = parts;
  const base = first?.recipe ?? {};
  return {
    ...base,
    name: name || base.name,
    description: undefined,
    ...(base.source
      ? { source: { ...base.source, url: withoutStart(base.source.url)! } }
      : {}),
    ...(base.videoImportUrl
      ? { videoImportUrl: withoutStart(base.videoImportUrl) }
      : {}),
    partial: parts.some((part) => part.recipe.partial) ? true : undefined,
    ingredients: parts.flatMap(({ recipe }) => [
      ...(recipe.name
        ? [{ ingredient: `${recipe.name}:`, type: "heading" as const }]
        : []),
      ...(recipe.ingredients ?? []),
    ]),
    instructions: parts.flatMap(({ recipe }): InstructionEntry[] => {
      const list = steps(recipe.instructions ?? []);
      if (list.length === 0) return [];
      return recipe.name ? [{ name: recipe.name, instructions: list }] : list;
    }),
  };
}
