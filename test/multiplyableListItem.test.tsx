import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import StyledMarkdown from "@discontent/component-library/components/Markdown";
import { DummyMultiplyable } from "recipe-website-common/components/Form/RecipeMarkdown";
import { Multiplyable } from "recipe-website-common/components/View/Multiplier/Multiplyable";
import { MultiplierProvider } from "recipe-website-common/components/View/Multiplier/Provider";

/*
 * 41c. Since markdown-to-jsx 9.7 a `<Multiplyable />` that starts a list item
 * is parsed as an HTML block whose children are the rest of the line. A
 * Multiplyable that rendered only its number showed "1/2" for "1/2 cup sugar".
 * `flattenMarkdown`'s side of the same case is in flattenMarkdown.test.ts.
 */
const search = { value: "" };
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search.value),
}));

afterEach(() => {
  cleanup();
  search.value = "";
});

const list =
  '- <Multiplyable baseNumber="1/2" /> cup sugar\n- <Multiplyable baseNumber="3" /> eggs\n- a pinch of salt, <Multiplyable baseNumber="2" /> times';

function items(container: HTMLElement) {
  return [...container.querySelectorAll("li")].map((li) =>
    li.textContent?.replace(/\s+/g, " ").trim(),
  );
}

describe("a Multiplyable that starts a list item", () => {
  it("keeps the rest of its line in the form preview", () => {
    const { container } = render(
      <StyledMarkdown components={{ Multiplyable: DummyMultiplyable }}>
        {list}
      </StyledMarkdown>,
    );
    expect(items(container)).toEqual([
      "1/2 cup sugar",
      "3 eggs",
      "a pinch of salt, 2 times",
    ]);
  });

  it("keeps the rest of its line on the recipe page, scaled", () => {
    search.value = "scale=2";
    const { container } = render(
      <MultiplierProvider>
        <StyledMarkdown components={{ Multiplyable }}>{list}</StyledMarkdown>
      </MultiplierProvider>,
    );
    expect(items(container)).toEqual([
      "1 cup sugar",
      "6 eggs",
      "a pinch of salt, 4 times",
    ]);
  });

  it("renders a lone number with nothing after it", () => {
    const { container } = render(
      <StyledMarkdown components={{ Multiplyable: DummyMultiplyable }}>
        {
          '- <Multiplyable baseNumber="2" />\n- <Multiplyable baseNumber="3" /> eggs'
        }
      </StyledMarkdown>,
    );
    expect(items(container)).toEqual(["2", "3 eggs"]);
  });

  it("puts punctuation that starts the line against the number", () => {
    const { container } = render(
      <StyledMarkdown components={{ Multiplyable: DummyMultiplyable }}>
        {
          '- <Multiplyable baseNumber="2" />% milk\n- <Multiplyable baseNumber="3" />, then more\n- <Multiplyable baseNumber="4" />) aside'
        }
      </StyledMarkdown>,
    );
    expect(items(container)).toEqual(["2% milk", "3, then more", "4) aside"]);
  });
});
