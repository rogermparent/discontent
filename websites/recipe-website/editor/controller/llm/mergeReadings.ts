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
import { withVideoStart } from "recipe-website-common/util/videoUrl";

/** `[line](/recipe/slug)`: the line verbatim as the link's text (36e). */
export function linkLine(ingredient: string, slug: string): string {
  const label = ingredient.replace(/([[\]\\])/g, "\\$1");
  return `[${label}](/recipe/${encodeURIComponent(slug)})`;
}

/**
 * One part with its lines that name another part linked (36e review: "Edit
 * this one first" keeps the link the batch would make), to the slug
 * `slugOf` says that part would be created at. `components` is
 * `SplitReading.components` (targets by `n`).
 */
export function linkReading(
  recipe: Partial<ImportedRecipe>,
  components: readonly { line: number; target: number }[] | undefined,
  slugOf: (n: number) => string | undefined,
): Partial<ImportedRecipe> {
  if (!components?.length || !recipe.ingredients) return recipe;
  const ingredients = [...recipe.ingredients];
  for (const ref of components) {
    const entry = ingredients[ref.line];
    const slug = slugOf(ref.target);
    if (!entry || entry.type === "heading" || !slug) continue;
    ingredients[ref.line] = {
      ...entry,
      ingredient: linkLine(entry.ingredient, slug),
    };
  }
  return { ...recipe, ingredients };
}

/**
 * A video URL without the chapter start a part was given — YouTube's `t=`
 * or Vimeo's `#t=` fragment alike (38c review nit: this used to strip only
 * the query parameter, leaving a Vimeo fragment on the merged recipe).
 */
function withoutStart(url: string | undefined): string | undefined {
  return url === undefined ? url : withVideoStart(url, 0);
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
