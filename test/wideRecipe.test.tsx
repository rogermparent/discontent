import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import {
  parseWideRecipe,
  WIDE_RECIPE_ATTRIBUTE,
  WIDE_RECIPE_STORAGE_KEY,
  wideRecipePrePaintScript,
} from "recipe-website-common/components/AppLayout/wideRecipe";
import {
  useWideRecipe,
  WideRecipeSync,
} from "recipe-website-common/components/AppLayout/useWideRecipe";

/*
 * 42c1: the "three columns on wide screens" switch — a storage key, a
 * pre-paint script, an attribute on <html>, modelled on sticky chrome.
 */

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute(WIDE_RECIPE_ATTRIBUTE);
});

describe("parseWideRecipe", () => {
  it("is on unless the reader stored off", () => {
    expect(parseWideRecipe(null)).toBe("on");
    expect(parseWideRecipe(undefined)).toBe("on");
    expect(parseWideRecipe("on")).toBe("on");
    expect(parseWideRecipe("garbage")).toBe("on");
    expect(parseWideRecipe("off")).toBe("off");
  });

  it("keeps its storage key: a contract with readers' browsers", () => {
    expect(WIDE_RECIPE_STORAGE_KEY).toBe("recipe-wide-columns");
    expect(WIDE_RECIPE_ATTRIBUTE).toBe("data-recipe-columns");
  });
});

describe("wideRecipePrePaintScript", () => {
  const run = () => new Function(wideRecipePrePaintScript())();

  it("stamps a stored off onto <html> before paint", () => {
    localStorage.setItem(WIDE_RECIPE_STORAGE_KEY, "off");
    run();
    expect(document.documentElement.getAttribute(WIDE_RECIPE_ATTRIBUTE)).toBe(
      "two",
    );
  });

  it("swallows a storage that throws, leaving the default", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    try {
      expect(run).not.toThrow();
      expect(document.documentElement.hasAttribute(WIDE_RECIPE_ATTRIBUTE)).toBe(
        false,
      );
    } finally {
      getItem.mockRestore();
    }
  });

  it("leaves the attribute absent for the default or anything else", () => {
    run();
    expect(document.documentElement.hasAttribute(WIDE_RECIPE_ATTRIBUTE)).toBe(
      false,
    );
    localStorage.setItem(WIDE_RECIPE_STORAGE_KEY, "sideways");
    run();
    expect(document.documentElement.hasAttribute(WIDE_RECIPE_ATTRIBUTE)).toBe(
      false,
    );
  });
});

describe("useWideRecipe + WideRecipeSync", () => {
  let setWide: ((next: "on" | "off") => void) | undefined;
  function Probe() {
    const [wide, set] = useWideRecipe();
    setWide = set;
    return <span data-testid="wide">{wide}</span>;
  }

  it("persists off, never on, and mirrors it onto <html>", () => {
    const { getByTestId } = render(
      <>
        <WideRecipeSync />
        <Probe />
      </>,
    );
    expect(getByTestId("wide").textContent).toBe("on");

    act(() => setWide!("off"));
    expect(localStorage.getItem(WIDE_RECIPE_STORAGE_KEY)).toBe("off");
    expect(getByTestId("wide").textContent).toBe("off");
    expect(document.documentElement.getAttribute(WIDE_RECIPE_ATTRIBUTE)).toBe(
      "two",
    );

    act(() => setWide!("on"));
    expect(localStorage.getItem(WIDE_RECIPE_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute(WIDE_RECIPE_ATTRIBUTE)).toBe(
      false,
    );
  });
});
