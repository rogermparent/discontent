// 46e / 48a: a recipe card's time in place of its date — its total, else
// prep + cook (Roger's pick, 46-e-total), else nothing and the date shows.

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { cardTime } from "recipe-website-common/components/List/shared";

function shown(recipe: Parameters<typeof cardTime>[0]) {
  const meta = cardTime(recipe);
  if (meta === undefined) return undefined;
  const { container } = render(<>{meta}</>);
  const time = container.querySelector("time");
  return { text: time?.textContent, dateTime: time?.getAttribute("dateTime") };
}

describe("cardTime", () => {
  it("shows the total when the recipe has one", () => {
    expect(shown({ totalTime: 75, prepTime: 15, cookTime: 30 })).toEqual({
      text: "1 h 15 m",
      dateTime: "PT75M",
    });
  });

  it("shows prep + cook when there is no total", () => {
    expect(shown({ prepTime: 20, cookTime: 45 })).toEqual({
      text: "1 h 5 m",
      dateTime: "PT65M",
    });
    expect(shown({ cookTime: 30 })).toEqual({
      text: "30 m",
      dateTime: "PT30M",
    });
  });

  it("is nothing without any time, so the card keeps its date", () => {
    expect(shown({})).toBeUndefined();
    expect(shown({ totalTime: 0, prepTime: 0, cookTime: 0 })).toBeUndefined();
  });
});
