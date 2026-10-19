// @vitest-environment node
//
// 42h: the holidays for the agents — `holidayList` (what's coming up) and
// `holidayGet` (one holiday's menu) — against the real engine in a tmpdir on
// a frozen day, the two API routes in-process, and the HTTP backend over a
// stubbed fetch. The rules underneath (dates, order, grouping) are 42e's and
// `holidaysPage.test.ts` pins them; what is pinned here is the seat: the
// Node-safe reads, `date`, the rows' shape, aliases, and the failures.
//
// The fixture: `holidays` with Halloween (a pinned dish, a dessert, a warm
// drink), Christmas (a cookie filed under its alias "Christmas Cookies", a
// sour), New Year's (whose alias `new-years-eve` has a rule of its own —
// 42e's Te2), Easter (a term, nothing filed) and Fall favorites (no rule).

import { mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { createHttpBackend } from "../websites/recipe-website/editor/cli/backend/http";
import { createLocalBackend } from "../websites/recipe-website/editor/cli/backend/local";
import { holidaysCommand } from "../websites/recipe-website/editor/cli/commands/holidays";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { toErrorObject } from "../websites/recipe-website/editor/controller/curation/errors";
import {
  holidayGet,
  holidayList,
  holidayToday,
} from "../websites/recipe-website/editor/controller/curation/holidays";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";
import {
  createTerm,
  updateTerm,
} from "../websites/recipe-website/editor/controller/curation/terms";

/* The routes with their context stood in for: a public read's
 * `readContext()` is the content directory and nothing else. */
vi.mock("recipe-editor/controller/apiContext", () => ({
  readContext: () => ({ contentDirectory }),
}));
const { GET: listRoute } =
  await import("../websites/recipe-website/editor/src/app/api/holidays/route");
const { GET: getRoute } =
  await import("../websites/recipe-website/editor/src/app/api/holidays/[slug]/route");

const TODAY = "2026-10-19";

let contentDirectory: string;
let ctx: CurationContext;
let previousContentDirectory: string | undefined;

async function seed(): Promise<void> {
  for (const term of [
    { label: "Holidays", slug: "holidays" },
    { label: "Halloween", parent: "holidays", description: "Tricks, treats." },
    { label: "Christmas", parent: "holidays", aliases: ["Christmas Cookies"] },
    {
      label: "New Year's",
      slug: "new-years",
      parent: "holidays",
      aliases: ["new-years-eve"],
    },
    { label: "Easter", parent: "holidays" },
    { label: "Fall favorites", slug: "fall-favorites", parent: "holidays" },
    { label: "Course", slug: "course" },
    { label: "Dessert", parent: "course" },
    { label: "Side", parent: "course" },
    { label: "Drink", slug: "drink" },
    { label: "Sour", parent: "drink" },
    { label: "Warm drinks", slug: "warm-drinks", parent: "drink" },
  ]) {
    await createTerm(ctx, term);
  }
  for (const recipe of [
    { name: "Pumpkin Pie", tags: ["halloween", "dessert"], date: 1_000 },
    { name: "Caramel Apples", tags: ["Halloween"], date: 2_000 },
    { name: "Hot Cider", tags: ["halloween", "warm-drinks"], date: 3_000 },
    {
      name: "Sugar Cookies",
      tags: ["Christmas Cookies", "dessert"],
      date: 4_000,
    },
    { name: "Eggnog Sour", tags: ["christmas", "sour"], date: 5_000 },
    { name: "Black-Eyed Peas", tags: ["new-years", "side"], date: 6_000 },
    { name: "Apple Crisp", tags: ["fall-favorites", "dessert"], date: 7_000 },
  ]) {
    await createRecipe(ctx, recipe);
  }
  await updateTerm(ctx, "halloween", { pinned: ["caramel-apples"] });
}

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "holiday-tools-"));
  ctx = { contentDirectory };
  previousContentDirectory = process.env.CONTENT_DIRECTORY;
  process.env.CONTENT_DIRECTORY = contentDirectory;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await closeCachedEnvironments();
  if (previousContentDirectory === undefined) {
    delete process.env.CONTENT_DIRECTORY;
  } else {
    process.env.CONTENT_DIRECTORY = previousContentDirectory;
  }
  await rm(contentDirectory, { recursive: true, force: true });
});

describe("holidayList", () => {
  it("lists every holiday soonest first, empty ones too, undated last", async () => {
    await seed();
    const result = await holidayList(ctx, { date: TODAY });
    expect(result.today).toBe(TODAY);
    expect(result.link).toBe("/holidays");
    expect(result.total).toBe(5);
    expect(
      result.holidays.map(({ slug, date, days, countdown, dated }) => ({
        slug,
        date,
        days,
        countdown,
        dated,
      })),
    ).toEqual([
      {
        slug: "halloween",
        date: "2026-10-31",
        days: 12,
        countdown: "in 12 days",
        dated: true,
      },
      {
        slug: "christmas",
        date: "2026-12-25",
        days: 67,
        countdown: "in 67 days",
        dated: true,
      },
      /* By its own slug's rule, not its alias's 31 December (Te2). */
      {
        slug: "new-years",
        date: "2027-01-01",
        days: 74,
        countdown: "in 74 days",
        dated: true,
      },
      {
        slug: "easter",
        date: "2027-03-28",
        days: 160,
        countdown: "in 160 days",
        dated: true,
      },
      {
        slug: "fall-favorites",
        date: undefined,
        days: undefined,
        countdown: undefined,
        dated: false,
      },
    ]);

    const [halloween, christmas, , easter] = result.holidays;
    expect(halloween).toMatchObject({
      label: "Halloween",
      counts: { recipes: 3, dishes: 2, drinks: 1 },
      /* Pinned first, then the newest. */
      top: [
        { slug: "caramel-apples", name: "Caramel Apples" },
        { slug: "hot-cider", name: "Hot Cider" },
        { slug: "pumpkin-pie", name: "Pumpkin Pie" },
      ],
    });
    /* A recipe filed under the alias counts for the holiday. */
    expect(christmas).toMatchObject({
      counts: { recipes: 2, dishes: 1, drinks: 1 },
      aliases: ["christmas cookies"],
    });
    /* A term nothing is filed under yet: listed, with counts of 0. */
    expect(easter).toMatchObject({
      counts: { recipes: 0, dishes: 0, drinks: 0 },
      top: [],
    });
    /* `rule` only when another key dates it. */
    expect(halloween).not.toHaveProperty("rule");
  });

  it("counts as of another day", async () => {
    await seed();
    const { holidays } = await holidayList(ctx, { date: "2026-11-01" });
    expect(holidays.map((row) => [row.slug, row.days])).toEqual([
      ["christmas", 54],
      ["new-years", 61],
      ["easter", 147],
      ["halloween", 364],
      ["fall-favorites", undefined],
    ]);
    const onTheDay = await holidayList(ctx, { date: "2026-12-25" });
    expect(onTheDay.holidays[0]).toMatchObject({
      slug: "christmas",
      days: 0,
      countdown: "today",
    });
  });

  it("answers an empty list on a site with no holidays", async () => {
    await createRecipe(ctx, { name: "Toast", tags: ["breakfast"] });
    expect(await holidayList(ctx, { date: TODAY })).toEqual({
      today: TODAY,
      total: 0,
      holidays: [],
      link: "/holidays",
    });
  });

  it("refuses a date that is not a calendar day", async () => {
    for (const date of ["2026-02-30", "10/31", "2026-1-5", "tomorrow"]) {
      expect(() => holidayToday(date), date).toThrow(/YYYY-MM-DD/);
    }
    await expect(holidayList(ctx, { date: "2026-13-01" })).rejects.toThrow();
    const error = await holidayList(ctx, { date: "2026-02-30" }).catch(
      (thrown: unknown) => toErrorObject(thrown).error,
    );
    expect(error).toMatchObject({
      code: "validation",
      issues: [{ path: "date" }],
    });
    /* Absent, the machine's own local day. */
    expect(holidayToday(undefined, new Date(2026, 9, 19, 23, 30))).toEqual({
      year: 2026,
      month: 10,
      day: 19,
    });
  });
});

describe("holidayGet", () => {
  it("answers a holiday's menu: dishes by course, drinks by style", async () => {
    await seed();
    const menu = await holidayGet(ctx, "halloween", { date: TODAY });
    expect(menu).toMatchObject({
      today: TODAY,
      slug: "halloween",
      label: "Halloween",
      description: "Tricks, treats.",
      dated: true,
      date: "2026-10-31",
      days: 12,
      countdown: "in 12 days",
      counts: { recipes: 3, dishes: 2, drinks: 1 },
      next: {
        slug: "christmas",
        label: "Christmas",
        date: "2026-12-25",
        days: 67,
        countdown: "in 67 days",
      },
      link: "/holidays/halloween",
    });
    expect(menu.courses).toEqual([
      {
        slug: "dessert",
        label: "Dessert",
        recipes: [
          {
            slug: "pumpkin-pie",
            name: "Pumpkin Pie",
            date: 1_000,
            tags: ["halloween", "dessert"],
          },
        ],
      },
      {
        slug: "more",
        label: "More",
        recipes: [
          {
            slug: "caramel-apples",
            name: "Caramel Apples",
            date: 2_000,
            /* Normalised on the way in, as every recipe's tags are. */
            tags: ["halloween"],
          },
        ],
      },
    ]);
    expect(menu.styles).toEqual([
      {
        slug: "warm-drinks",
        label: "Warm drinks",
        recipes: [
          expect.objectContaining({ slug: "hot-cider", name: "Hot Cider" }),
        ],
      },
    ]);
    expect(menu).not.toHaveProperty("requested");
  });

  it("answers an alias with its holiday, and names what was asked", async () => {
    await seed();
    const menu = await holidayGet(ctx, "christmas-cookies", { date: TODAY });
    expect(menu).toMatchObject({
      slug: "christmas",
      requested: "christmas-cookies",
      link: "/holidays/christmas",
      counts: { recipes: 2 },
    });
    expect(menu.courses[0].recipes.map((recipe) => recipe.slug)).toEqual([
      "sugar-cookies",
    ]);
    expect(menu.styles[0]).toMatchObject({ slug: "sour" });
  });

  it("answers an undated holiday and one with nothing filed", async () => {
    await seed();
    const fall = await holidayGet(ctx, "fall-favorites", { date: TODAY });
    expect(fall).toMatchObject({ dated: false, counts: { recipes: 1 } });
    expect(fall).not.toHaveProperty("date");
    expect(fall).not.toHaveProperty("next");
    const easter = await holidayGet(ctx, "easter", { date: TODAY });
    expect(easter).toMatchObject({
      date: "2027-03-28",
      counts: { recipes: 0, dishes: 0, drinks: 0 },
      courses: [],
      styles: [],
    });
  });

  it("refuses a slug that is no holiday", async () => {
    await seed();
    for (const slug of ["nope", "dessert", "holidays"]) {
      const error = await holidayGet(ctx, slug, { date: TODAY }).catch(
        (thrown: unknown) => toErrorObject(thrown).error,
      );
      expect(error, slug).toMatchObject({ code: "not_found", slug });
      expect((error as { message: string }).message).toContain("halloween");
    }
  });
});

describe("the routes", () => {
  it("answer the seats, with date as a query parameter", async () => {
    await seed();
    const list = await listRoute(
      new Request(`http://editor.test/api/holidays?date=${TODAY}`),
    );
    expect(list.status).toBe(200);
    expect((await list.json()).holidays[0]).toMatchObject({
      slug: "halloween",
      days: 12,
    });

    const menu = await getRoute(
      new Request(`http://editor.test/api/holidays/halloween?date=2026-10-31`),
      { params: Promise.resolve({ slug: "halloween" }) },
    );
    expect(await menu.json()).toMatchObject({ days: 0, countdown: "today" });

    const missing = await getRoute(
      new Request("http://editor.test/api/holidays/nope"),
      { params: Promise.resolve({ slug: "nope" }) },
    );
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("not_found");

    const bad = await listRoute(
      new Request("http://editor.test/api/holidays?date=2026-02-30"),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("validation");
  });
});

describe("the backends and the CLI's text", () => {
  it("makes the link absolute on RECIPE_EDITOR_URL locally", async () => {
    await seed();
    vi.stubEnv("RECIPE_EDITOR_URL", "http://workstation.test:3000");
    try {
      const backend = createLocalBackend({ contentDirectory });
      const list = await backend.holidayList({ date: TODAY });
      expect(list.link).toBe("http://workstation.test:3000/holidays");
      const menu = await backend.holidayGet("halloween", { date: TODAY });
      expect(menu.link).toBe("http://workstation.test:3000/holidays/halloween");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("prints a readable list and menu", async () => {
    await seed();
    const list = holidaysCommand.format(
      await holidayList(ctx, { date: TODAY }),
    );
    expect(list).toContain("Holidays as of 2026-10-19");
    expect(list).toContain(
      "  Halloween — halloween: Sat 31 Oct, in 12 days · 2 dishes · 1 drink",
    );
    expect(list).toContain(
      "  Easter — easter: Sun 28 Mar, in 160 days · nothing filed yet",
    );
    expect(list).toContain(
      "  Fall favorites — fall-favorites: no date · 1 dish",
    );

    const menu = holidaysCommand.format(
      await holidayGet(ctx, "christmas-cookies", { date: TODAY }),
    );
    expect(menu).toContain("Christmas — christmas: Fri 25 Dec, in 67 days");
    expect(menu).toContain("(christmas-cookies is an alias of it)");
    expect(menu).toContain(
      "Dishes\n  Dessert\n    Sugar Cookies — sugar-cookies",
    );
    expect(menu).toContain("Drinks\n  Sour\n    Eggnog Sour — eggnog-sour");
    expect(menu).toContain("Then New Year's, in 74 days");
    expect(menu).toContain("On the site: /holidays/christmas");
  });

  describe("over HTTP", () => {
    const ORIGIN = "http://pi.test:3000";

    function answer(status: number, body: string, type = "application/json") {
      const seen: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL) => {
          seen.push(String(input));
          return new Response(body, {
            status,
            headers: { "content-type": type },
          });
        }),
      );
      return seen;
    }

    it("sends date and makes the link absolute on the editor that answered", async () => {
      const seen = answer(
        200,
        JSON.stringify({
          today: TODAY,
          total: 0,
          holidays: [],
          link: "/holidays",
        }),
      );
      const result = await createHttpBackend({
        baseUrl: `${ORIGIN}/`,
      }).holidayList({
        date: TODAY,
      });
      expect(seen[0]).toBe(`${ORIGIN}/api/holidays?date=${TODAY}`);
      expect(result.link).toBe(`${ORIGIN}/holidays`);
    });

    it("names an editor from before 42h, and keeps a missing holiday's own error", async () => {
      answer(404, "<!DOCTYPE html><title>404</title>", "text/html");
      const backend = createHttpBackend({ baseUrl: ORIGIN });
      await expect(backend.holidayList()).rejects.toThrow(
        `The editor at ${ORIGIN} predates the holiday tools (42h) — update it, or run with --content-dir.`,
      );
      await expect(backend.holidayGet("halloween")).rejects.toThrow(
        /predates the holiday tools/,
      );

      answer(
        404,
        JSON.stringify({
          error: {
            code: "not_found",
            message: 'No holiday at slug "nope"',
            slug: "nope",
          },
        }),
      );
      await expect(backend.holidayGet("nope")).rejects.toThrow(
        'No holiday at slug "nope"',
      );
    });
  });
});
