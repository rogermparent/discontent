// The recipe view's "Jump to Ingredients · Instructions" row (39c): shown on
// long recipes only, linking the two headings' ids.

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import {
  INGREDIENTS_ID,
  INSTRUCTIONS_ID,
  JUMP_LINKS_MIN_LINES,
  JumpLinks,
  recipeLineCount,
  showJumpLinks,
} from "recipe-website-common/components/View/JumpLinks";
import type {
  Ingredient,
  InstructionEntry,
} from "recipe-website-common/controller/types";

const lines = (n: number): Ingredient[] =>
  Array.from({ length: n }, (_, i) => ({ ingredient: `${i + 1} cup flour` }));
const steps = (n: number): InstructionEntry[] =>
  Array.from({ length: n }, (_, i) => ({ text: `Step ${i + 1}` }));

describe("JumpLinks (39c)", () => {
  it("counts ingredient lines and steps, not headings, each grouped step once", () => {
    expect(
      recipeLineCount(
        [
          { ingredient: "For the dough", type: "heading" },
          ...lines(3),
          { ingredient: "For the filling", type: "heading" },
          ...lines(2),
        ],
        [
          { text: "Preheat" },
          {
            name: "Dough",
            instructions: [{ text: "Mix" }, { text: "Rest" }, { text: "Roll" }],
          },
        ],
      ),
    ).toBe(5 + 4);
    expect(recipeLineCount()).toBe(0);
  });

  it("shows from the threshold up, and only with both sections", () => {
    expect(JUMP_LINKS_MIN_LINES).toBe(15);
    expect(showJumpLinks(lines(8), steps(6))).toBe(false);
    expect(showJumpLinks(lines(8), steps(7))).toBe(true);
    expect(showJumpLinks(lines(20), [])).toBe(false);
    expect(showJumpLinks(undefined, steps(20))).toBe(false);
  });

  it("renders nothing for a short recipe", () => {
    const { container } = render(
      <JumpLinks ingredients={lines(4)} instructions={steps(3)} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("links the two headings' ids in a labelled nav on a long one", () => {
    const { getByRole } = render(
      <JumpLinks ingredients={lines(10)} instructions={steps(8)} />,
    );
    const nav = getByRole("navigation", { name: "Jump to" });
    const links = [...nav.querySelectorAll("a")].map((link) => [
      link.textContent,
      link.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["Ingredients", `#${INGREDIENTS_ID}`],
      ["Instructions", `#${INSTRUCTIONS_ID}`],
    ]);
    expect([INGREDIENTS_ID, INSTRUCTIONS_ID]).toEqual([
      "ingredients",
      "instructions",
    ]);
  });
});
