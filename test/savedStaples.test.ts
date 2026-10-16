// @vitest-environment node
//
// 38a, Da2: the signed-in editor's saved "Assume I always have" list and
// this browser's — what a first signed-in `/make` load does with the two.

import { describe, expect, it } from "vitest";
import {
  capStaples,
  MAX_STAPLE_LENGTH,
  MAX_STAPLES,
} from "../websites/recipe-website/common/components/MakePage/stapleLimits";
import { staplesSync } from "../websites/recipe-website/common/components/MakePage/useSavedStaples";
import { DEFAULT_STAPLES } from "../websites/recipe-website/common/util/makeable";

const untouched = { defaultStaples: true, alwaysHave: DEFAULT_STAPLES };
const own = { defaultStaples: false, alwaysHave: ["salt", "olive oil"] };

describe("staplesSync (38a, Da2)", () => {
  it("seeds a browser still on the default list from the saved one", () => {
    expect(staplesSync(untouched, ["salt", "ice", "soy sauce"])).toEqual({
      kind: "seed",
      items: ["salt", "ice", "soy sauce"],
    });
  });

  it("does nothing when neither has a list of its own", () => {
    expect(staplesSync(untouched, undefined)).toEqual({ kind: "none" });
  });

  it("saves a browser's own list when nothing is saved yet", () => {
    expect(staplesSync(own, undefined)).toEqual({
      kind: "upload",
      items: ["salt", "olive oil"],
    });
  });

  it("keeps the browser's list over a different saved one, merging nothing", () => {
    expect(staplesSync(own, ["salt", "ice"])).toEqual({ kind: "none" });
  });
});

describe("capStaples (38a review)", () => {
  it("keeps a list within the server's limits", () => {
    const long = Array.from({ length: 250 }, (_, n) => `item ${n}`);
    const capped = capStaples(long);
    expect(capped).toHaveLength(MAX_STAPLES);
    expect(capped[0]).toBe("item 0");
    expect(capStaples([" salt ", "", "y".repeat(300)])).toEqual([
      "salt",
      "y".repeat(MAX_STAPLE_LENGTH),
    ]);
  });

  it("caps what a first load uploads", () => {
    const alwaysHave = Array.from({ length: 250 }, (_, n) => `item ${n}`);
    const sync = staplesSync({ defaultStaples: false, alwaysHave }, undefined);
    expect(sync.kind === "upload" && sync.items.length).toBe(MAX_STAPLES);
  });
});
