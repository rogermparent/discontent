import type { Ingredient, InstructionEntry } from "../../controller/types";

/** The Ingredients heading's id: `/recipe/<slug>#ingredients` (39c). */
export const INGREDIENTS_ID = "ingredients";
/** The Instructions heading's id: `/recipe/<slug>#instructions` (39c). */
export const INSTRUCTIONS_ID = "instructions";

/**
 * 39-Dc5: a recipe this long gets the jump row — ingredient lines (headings
 * not counted) plus instruction steps (a group's steps each counted). Below
 * it both lists sit close to the top of a phone's page anyway.
 */
export const JUMP_LINKS_MIN_LINES = 15;

/** Ingredient lines and instruction steps, the way the page numbers them. */
export function recipeLineCount(
  ingredients: readonly Ingredient[] = [],
  instructions: readonly InstructionEntry[] = [],
): number {
  const lines = ingredients.filter(({ type }) => type !== "heading").length;
  const steps = instructions.reduce(
    (sum, entry) =>
      sum + ("instructions" in entry ? entry.instructions.length : 1),
    0,
  );
  return lines + steps;
}

/** Long enough for the row, and both sections there to jump to. */
export function showJumpLinks(
  ingredients?: readonly Ingredient[],
  instructions?: readonly InstructionEntry[],
): boolean {
  return (
    Boolean(ingredients?.length) &&
    Boolean(instructions?.length) &&
    recipeLineCount(ingredients, instructions) >= JUMP_LINKS_MIN_LINES
  );
}

const linkStyle =
  "inline-block rounded-sm py-1 underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * "Jump to Ingredients · Instructions" near the top of a long recipe (39c):
 * plain in-page links to the two headings' ids, so they work in the editor
 * and the static export alike, with no script. Decided from the recipe's
 * data on the server, so a short recipe renders nothing and nothing moves.
 */
export function JumpLinks({
  ingredients,
  instructions,
}: {
  ingredients?: Ingredient[];
  instructions?: InstructionEntry[];
}) {
  if (!showJumpLinks(ingredients, instructions)) return null;
  return <JumpLinksRow />;
}

/** The row itself, once a reader has decided it shows. */
export function JumpLinksRow() {
  return (
    <nav
      aria-label="Jump to"
      data-testid="recipe-jump-links"
      className="mt-3 text-sm text-muted-foreground print:hidden"
    >
      Jump to{" "}
      <a href={`#${INGREDIENTS_ID}`} className={linkStyle}>
        Ingredients
      </a>
      <span aria-hidden="true"> · </span>
      <a href={`#${INSTRUCTIONS_ID}`} className={linkStyle}>
        Instructions
      </a>
    </nav>
  );
}

/**
 * `showJumpLinks` over one path (45e): the lines and steps the path shows,
 * counted as `recipeLineCount` counts them. With everything shown it is
 * `showJumpLinks` exactly.
 */
export function showJumpLinksOnPath({
  headings,
  lines,
  entries,
  steps,
}: {
  /** Per ingredient line, whether it is a stored heading. */
  headings: readonly boolean[];
  /** Per ingredient line, whether the path shows it. */
  lines: readonly boolean[];
  /** Per instruction entry, whether the path shows it. */
  entries: readonly boolean[];
  /** How many steps the path shows. */
  steps: number;
}): boolean {
  const shownLines = headings.filter((_, index) => lines[index] !== false);
  const count = shownLines.filter((heading) => !heading).length + steps;
  return (
    shownLines.length > 0 &&
    entries.some(Boolean) &&
    count >= JUMP_LINKS_MIN_LINES
  );
}
