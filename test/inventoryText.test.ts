import { describe, expect, it } from "vitest";
import {
  applyImport,
  applyOverlay,
  exportInventory,
  inventoryKey,
  MAX_ITEMS,
  overlayFor,
  parseInventoryText,
  parseOverlay,
} from "recipe-website-common/util/inventoryText";

describe("exportInventory", () => {
  it("prints one item per line, sorted, without repeats", () => {
    expect(exportInventory(["vodka", "Gnista", "lime", "Vodka"])).toBe(
      "Gnista\nlime\nvodka",
    );
  });
});

describe("parseInventoryText", () => {
  it("reads one item per line", () => {
    expect(parseInventoryText("vodka\nlime\n\nGnista\n").items).toEqual([
      "vodka",
      "lime",
      "Gnista",
    ]);
  });

  it("splits a single line on commas or semicolons", () => {
    expect(parseInventoryText("vodka, lime; ginger syrup").items).toEqual([
      "vodka",
      "lime",
      "ginger syrup",
    ]);
  });

  it("keeps commas when there are several lines", () => {
    expect(parseInventoryText("salt, kosher\nvodka").items).toEqual([
      "salt, kosher",
      "vodka",
    ]);
  });

  it("strips bullets, numbering, checkboxes and comments", () => {
    const text = [
      "# my bar",
      "- vodka",
      "* lime",
      "• Gnista",
      "1. gin",
      "2) tonic",
      "- [x] soda water",
      "[ ] orange bitters",
      "sake # the Gekkeikan",
    ].join("\n");
    expect(parseInventoryText(text).items).toEqual([
      "vodka",
      "lime",
      "Gnista",
      "gin",
      "tonic",
      "soda water",
      "orange bitters",
      "sake",
    ]);
  });

  it("accepts a JSON array or {items}", () => {
    expect(parseInventoryText('["vodka", "lime", 3]').items).toEqual([
      "vodka",
      "lime",
    ]);
    expect(parseInventoryText('{"items": ["gin"]}').items).toEqual(["gin"]);
  });

  it("deduplicates by key", () => {
    expect(parseInventoryText("Vodka\nvodka\n  VODKA ").items).toEqual([
      "Vodka",
    ]);
    expect(inventoryKey("  Crème   de cassis")).toBe("creme de cassis");
  });

  it("skips over-long lines and caps the count", () => {
    const long = "x".repeat(81);
    expect(parseInventoryText(`vodka\n${long}`)).toEqual({
      items: ["vodka"],
      skipped: 1,
    });
    const many = Array.from({ length: MAX_ITEMS + 3 }, (_, i) => `item ${i}`);
    const parsed = parseInventoryText(many.join("\n"));
    expect(parsed.items).toHaveLength(MAX_ITEMS);
    expect(parsed.skipped).toBe(3);
  });

  it("round-trips through export", () => {
    const items = ["vodka", "Gnista", "lime juice"];
    expect(parseInventoryText(exportInventory(items)).items.sort()).toEqual(
      [...items].sort(),
    );
  });
});

describe("applyImport", () => {
  it("adds or replaces", () => {
    expect(applyImport(["vodka"], ["gin", "Vodka"], "add")).toEqual([
      "vodka",
      "gin",
    ]);
    expect(applyImport(["vodka"], ["gin"], "replace")).toEqual(["gin"]);
  });
});

describe("overlay", () => {
  it("is (shared − removed) ∪ added", () => {
    expect(
      applyOverlay(["vodka", "gin", "lime"], {
        added: ["Gnista"],
        removed: ["GIN"],
      }),
    ).toEqual(["vodka", "lime", "Gnista"]);
  });

  it("is the smallest overlay that reaches a list", () => {
    expect(overlayFor(["vodka", "gin"], ["vodka", "tonic"])).toEqual({
      added: ["tonic"],
      removed: ["gin"],
    });
    expect(overlayFor(["vodka"], ["Vodka"])).toEqual({
      added: [],
      removed: [],
    });
  });

  it("forgives malformed storage", () => {
    expect(parseOverlay(null)).toEqual({ added: [], removed: [] });
    expect(parseOverlay("nope")).toEqual({ added: [], removed: [] });
    expect(parseOverlay('{"added": ["vodka", 1]}')).toEqual({
      added: ["vodka"],
      removed: [],
    });
  });
});
