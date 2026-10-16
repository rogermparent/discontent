// @vitest-environment node
//
// 35r: the roundup picker's bookkeeping — chunks of at most three picks, what
// one call's answer means for each pick, and the progress line. The loop and
// the buttons are the Playwright spec's (`import-roundup.spec.ts`).

import { describe, expect, it } from "vitest";

import {
  ROUNDUP_CHUNK,
  hostsOf,
  nextChunk,
  progressLine,
  type RoundupPick,
} from "../websites/recipe-website/editor/controller/roundupPicker";
import {
  resolveTermSlug,
  settleChunk,
} from "../websites/recipe-website/editor/controller/roundupSettle";

const pick = (n: number, host = "sallysbakingaddiction.com"): RoundupPick => ({
  n,
  url: `https://${host}/r/${n}/`,
  name: `Recipe ${n}`,
});

describe("nextChunk", () => {
  it("takes at most three, in order, and keeps the rest", () => {
    expect(ROUNDUP_CHUNK).toBe(3);
    const queue = [1, 2, 3, 4, 5].map((n) => pick(n));
    const { chunk, rest } = nextChunk(queue);
    expect(chunk.map((p) => p.n)).toEqual([1, 2, 3]);
    expect(rest.map((p) => p.n)).toEqual([4, 5]);
    expect(nextChunk(rest).chunk.map((p) => p.n)).toEqual([4, 5]);
    expect(nextChunk([])).toEqual({ chunk: [], rest: [] });
  });
});

describe("settleChunk", () => {
  it("maps results to outcomes and puts back what the cap left", () => {
    const chunk = [pick(1), pick(2), pick(3)];
    const settled = settleChunk(chunk, {
      results: [
        {
          n: 1,
          url: chunk[0].url,
          name: "One",
          status: "imported",
          slug: "one",
        },
        {
          n: 2,
          url: chunk[1].url,
          name: "Two",
          status: "failed",
          error: { code: "import_failed", message: "No recipe found." },
        },
      ],
      remaining: [{ n: 3, url: chunk[2].url }],
    });
    expect(settled).toEqual({
      outcomes: [
        {
          n: 1,
          url: chunk[0].url,
          name: "Recipe 1",
          status: "imported",
          slug: "one",
        },
        {
          n: 2,
          url: chunk[1].url,
          name: "Recipe 2",
          status: "failed",
          message: "No recipe found.",
        },
      ],
      requeue: [chunk[2]],
      stalled: false,
    });
  });

  it("reports a dropped site's picks instead of handing them back forever", () => {
    const chunk = [pick(1, "a.example.com"), pick(2, "www.b.example.org")];
    const settled = settleChunk(chunk, {
      results: [
        {
          n: 1,
          url: chunk[0].url,
          name: "One",
          status: "imported",
          slug: "one",
        },
      ],
      remaining: [{ n: 2, url: chunk[1].url }],
      dropped: [{ site: "b.example.org", reason: "refused twice (HTTP 403)" }],
    });
    expect(settled.requeue).toEqual([]);
    expect(settled.outcomes[1]).toMatchObject({
      n: 2,
      status: "dropped",
      message: expect.stringContaining("refused twice"),
    });
  });

  it("stops on a call that made no progress", () => {
    const chunk = [pick(1)];
    const settled = settleChunk(chunk, {
      results: [],
      remaining: [{ n: 1, url: chunk[0].url }],
    });
    expect(settled).toMatchObject({
      stalled: true,
      requeue: [],
      outcomes: [{ n: 1, status: "not-attempted" }],
    });
  });
});

describe("progressLine", () => {
  it("names what is being fetched, from where, and the rule it waits by", () => {
    expect(
      progressLine({
        outcomes: [
          { n: 1, url: "u1", name: "a", status: "imported" },
          { n: 2, url: "u2", name: "b", status: "existing" },
        ],
        total: 9,
        current: [pick(5), pick(6, "www.example.com")],
      }),
    ).toBe(
      "Imported 1 of 9 · fetching 5, 6 from sallysbakingaddiction.com, example.com — one request every 15 s per site…",
    );
    expect(
      progressLine({
        outcomes: [],
        total: 2,
        current: [pick(1)],
        stopping: true,
      }),
    ).toMatch(/Stopping after this call\.$/);
  });

  it("says stopped or done between calls", () => {
    const one = { n: 1, url: "u", name: "a", status: "imported" as const };
    expect(progressLine({ outcomes: [one], total: 3, current: [] })).toBe(
      "Imported 1 of 3 · stopped with 2 picks left",
    );
    expect(progressLine({ outcomes: [one], total: 1, current: [] })).toBe(
      "Imported 1 of 1 · done",
    );
  });

  it("lists each host once", () => {
    expect(
      hostsOf([
        "https://www.a.com/1",
        "https://a.com/2",
        "https://b.com/3",
        "x",
      ]),
    ).toEqual(["a.com", "b.com"]);
  });
});

describe("resolveTermSlug (35r review)", () => {
  const terms = [
    { slug: "effort", label: "Speed & effort" },
    { slug: "dessert", label: "Dessert" },
  ];

  it("answers a label that does not slug to its term with that term's slug", () => {
    expect(resolveTermSlug(terms, "Speed & effort")).toBe("effort");
    expect(resolveTermSlug(terms, "  speed & EFFORT ")).toBe("effort");
  });

  it("keeps a known slug, and anything new as typed", () => {
    expect(resolveTermSlug(terms, "effort")).toBe("effort");
    expect(resolveTermSlug(terms, "Dessert")).toBe("Dessert");
    expect(resolveTermSlug(terms, "Picker Dishes")).toBe("Picker Dishes");
  });
});
