import { describe, expect, it } from "vitest";

import buildRecipeIndexValue, {
  flattenMarkdown,
} from "recipe-website-common/controller/buildIndexValue";
import type { Recipe } from "recipe-website-common/controller/types";

/*
 * F23. `flattenMarkdown` used to concatenate a compiled node only when it was a
 * string, or when its `props.children` was a *string*. Real prose does not
 * compile to that: two paragraphs, a link, or a list all arrive with array
 * children, contributed nothing, and flattened to `""`.
 *
 * Two consumers were reading that empty string. The content index's
 * `description` — which drives the ⌘K subtitle, the search-card snippet,
 * FlexSearch's `description` seat and the `description:` filter — and the
 * JSON-LD `HowToStep.text` for every recipe instruction.
 *
 * The constraint that shapes the fix is `Multiplyable`: `parseIngredients`
 * wraps every number in a pasted ingredient in one, and it is self-closing, so
 * a rewrite that recursed into children instead of reading `props.baseNumber`
 * would lose every quantity while looking correct on prose.
 */
describe("flattenMarkdown", () => {
  it("returns a plain sentence unchanged", () => {
    expect(flattenMarkdown("A simple description.")).toBe(
      "A simple description.",
    );
  });

  it("keeps both paragraphs of a two-paragraph description", () => {
    const flattened = flattenMarkdown(
      "The first paragraph introduces it.\n\nThe second names the technique.",
    );
    expect(flattened).toBe(
      "The first paragraph introduces it. The second names the technique.",
    );
  });

  it("keeps the text of an inline link, and the prose around it", () => {
    expect(
      flattenMarkdown(
        "Adapted from [an older recipe](https://example.com/older) of ours.",
      ),
    ).toBe("Adapted from an older recipe of ours.");
  });

  it("keeps every item of a list, separated", () => {
    expect(flattenMarkdown("- first\n- second\n- third")).toBe(
      "first second third",
    );
  });

  it("keeps emphasis against its neighbouring punctuation", () => {
    // The inline case the block separator must not touch.
    expect(flattenMarkdown("This one is **important**.")).toBe(
      "This one is important.",
    );
  });

  it("substitutes a Multiplyable's base number rather than dropping it", () => {
    // What `parseIngredients` produces for "2 cups flour".
    expect(flattenMarkdown('<Multiplyable baseNumber="2" /> cups flour')).toBe(
      "2 cups flour",
    );
  });

  it("keeps quantities inside prose that also has structure", () => {
    expect(
      flattenMarkdown(
        '- <Multiplyable baseNumber="1/2" /> cup sugar\n- <Multiplyable baseNumber="3" /> eggs',
      ),
    ).toBe("1/2 cup sugar 3 eggs");
  });

  it("is empty for empty input", () => {
    expect(flattenMarkdown("")).toBe("");
  });
});

/*
 * The cap is 160 (§12.11) and it is applied to a FlexSearch field, so where it
 * falls matters as well as how much it keeps.
 */
describe("the indexed description's cap", () => {
  const indexed = (description: string) =>
    buildRecipeIndexValue({ name: "A Recipe", description } as Recipe)
      .description;

  it("leaves a description under the cap exactly as it is", () => {
    const short = "A short description that is well under the limit.";
    expect(indexed(short)).toBe(short);
  });

  it("cuts at a word boundary rather than mid-word", () => {
    const long = `${"word ".repeat(60)}tail`;
    const result = indexed(long)!;
    expect(result.length).toBeLessThanOrEqual(160);
    // The give-away of a bare slice is a fragment at the end.
    expect(result.endsWith("word")).toBe(true);
    expect(result).not.toMatch(/\bwor$|\bwo$|\bw$/);
  });

  it("keeps a term that sits inside the cap", () => {
    // The `search-corpus` case the e2e asserts on: "smokehouse" is in the
    // second paragraph, at roughly character 96, and must survive.
    const result = indexed(
      "A brisk one-pan supper glazed with pomegranate molasses and finished with herbs.\n\nAdapted from [a smokehouse standby](https://example.com/s), with the char traded for a fast sear under the broiler.",
    )!;
    expect(result).toContain("smokehouse");
  });

  it("falls back to a hard cut when there is no word boundary to use", () => {
    const result = indexed("x".repeat(400))!;
    expect(result).toHaveLength(160);
  });
});
