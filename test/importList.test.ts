// @vitest-environment node
//
// Roundup import (epic 34, D11) against two local fixture servers — two
// "sites" on 127.0.0.1, one per port — and a content directory that is a git
// repository, so "one commit per recipe" and "create + assign in one commit"
// are counted rather than assumed.
//
// The pacing is a fake clock: `sleep` advances it instantly, and the servers
// stamp every request with it. So the 15 s rule (30-D5) is asserted on what
// the servers saw, with loopback pacing switched on, and the suite never
// waits. Nothing here touches the network.

import { mkdtemp, pathExists, rm, writeFile } from "fs-extra";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import simpleGit, { type SimpleGit } from "simple-git";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { createHttpBackend } from "../websites/recipe-website/editor/cli/backend/http";
import { parsePicks } from "../websites/recipe-website/editor/cli/commands/importList";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { CurationError } from "../websites/recipe-website/editor/controller/curation/errors";
import {
  MISSING_INDEX_WARNING,
  SiteState,
  importList,
  inspectList,
  type Pacing,
} from "../websites/recipe-website/editor/controller/curation/importList";
import { importAndCreate } from "../websites/recipe-website/editor/controller/curation/importRecipe";
import { inspectUrl } from "../websites/recipe-website/editor/controller/curation/inspect";
import {
  createRecipe,
  getRecipe,
} from "../websites/recipe-website/editor/controller/curation/recipes";
import {
  createTerm,
  getTerm,
} from "../websites/recipe-website/editor/controller/curation/terms";

/* ------------------------------------------------------------------ */
/* Two sites                                                           */
/* ------------------------------------------------------------------ */

interface Hit {
  site: "a" | "b";
  path: string;
  /** The fake clock when the request arrived. */
  at: number;
}

let now = 0;
let hits: Hit[] = [];
const servers: Record<"a" | "b", { server: Server; origin: string }> =
  {} as never;

/** Every request answered 403, by path: a page and an image. */
const FORBIDDEN = new Set(["/r/forbidden/", "/img/shy-pie.png"]);
/** Answered 403 once, then 200 with HTML: a retry that worked, but no image. */
const FLAKY = "/img/flaky-pie.png";
let flakyHits = 0;

function recipePage(origin: string, slug: string, name: string): string {
  return [
    "<html><head>",
    `<title>${name}</title>`,
    `<script type="application/ld+json">${JSON.stringify({
      "@type": "Recipe",
      name,
      recipeCategory: "Dessert",
      recipeIngredient: ["1 cup flour", "1/2 cup sugar"],
      recipeInstructions: "Mix. Bake.",
      image: `${origin}/img/${slug}.png`,
    })}</script>`,
    "</head><body></body></html>",
  ].join("");
}

/**
 * The roundup: three cards on A, then two on B (one of them forbidden) — in
 * the order the parser lists them, same site first.
 */
function listPage(): string {
  const a = servers.a.origin;
  const b = servers.b.origin;
  const card = (href: string, name: string) =>
    `<div class="card"><a href="${href}"><img src="${href}cover.jpg" alt=""></a><h2>${name}</h2><a href="${href}">Get the recipe</a></div>`;
  return [
    "<html><head><title>Fall Bakes | Site A</title>",
    `<link rel="canonical" href="${a}/fall-bakes/">`,
    "</head><body><nav><a href='/category/pies/'>Pies</a></nav>",
    "<article><h1>Five Fall Bakes</h1><div class='entry-content'>",
    "<p>Our favourite fall bakes.</p>",
    card(`${a}/r/apple-cake/`, "Apple Cake"),
    card(`${a}/r/pear-tart/`, "Pear Tart"),
    card(`${a}/r/plum-crisp/`, "Plum Crisp"),
    card(`${b}/r/forbidden/`, "Forbidden Fudge"),
    card(`${b}/r/maple-bars/`, "Maple Bars"),
    "</div></article></body></html>",
  ].join("");
}

/** A second roundup on A: two pies whose pictures misbehave, then a cake. */
function piesPage(): string {
  const card = (slug: string, name: string) =>
    `<div><a href="/r/${slug}/"><img src="/c/${slug}.jpg"></a><h2>${name}</h2></div>`;
  return [
    "<html><head><title>Pies</title></head><body><article><h1>Pies</h1>",
    "<div class='entry-content'>",
    card("flaky-pie", "Flaky Pie"),
    card("shy-pie", "Shy Pie"),
    card("apple-cake", "Apple Cake"),
    "</div></article></body></html>",
  ].join("");
}

function startSite(site: "a" | "b"): Promise<void> {
  const server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0];
    hits.push({ site, path, at: now });
    const origin = servers[site].origin;
    if (FORBIDDEN.has(path)) {
      response.writeHead(403, { "content-type": "text/html" });
      return response.end("<html><title>Just a moment...</title></html>");
    }
    if (path === FLAKY) {
      flakyHits += 1;
      response.writeHead(flakyHits === 1 ? 403 : 200, {
        "content-type": "text/html",
      });
      return response.end("<html>not a picture</html>");
    }
    if (path === "/fall-bakes/") {
      response.writeHead(200, { "content-type": "text/html" });
      return response.end(listPage());
    }
    if (path === "/pies/") {
      response.writeHead(200, { "content-type": "text/html" });
      return response.end(piesPage());
    }
    const recipe = /^\/r\/([a-z-]+)\/$/.exec(path);
    if (recipe) {
      const name = recipe[1]
        .split("-")
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(" ");
      response.writeHead(200, { "content-type": "text/html" });
      return response.end(recipePage(origin, recipe[1], name));
    }
    if (path.startsWith("/img/")) {
      response.writeHead(200, { "content-type": "image/png" });
      return response.end("png bytes");
    }
    response.writeHead(404, { "content-type": "text/html" });
    response.end("<html>Not found</html>");
  });
  servers[site] = { server, origin: "" };
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      servers[site].origin =
        `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    }),
  );
}

beforeAll(async () => {
  await startSite("a");
  await startSite("b");
});

afterAll(async () => {
  for (const { server } of Object.values(servers)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

/**
 * The fake clock, pacing loopback hosts as if they were real sites, with
 * queues of its own (fresh each test) shared by every call in it.
 */
let pacing: Pacing;

const listUrl = () => `${servers.a.origin}/fall-bakes/`;

/** Every same-site pair of requests, in order, is at least 15 s apart. */
function expectPolite() {
  for (const site of ["a", "b"] as const) {
    const times = hits.filter((hit) => hit.site === site).map((hit) => hit.at);
    for (let i = 1; i < times.length; i += 1) {
      expect(
        times[i] - times[i - 1],
        `${site} request ${i}`,
      ).toBeGreaterThanOrEqual(15_000);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

let contentDirectory: string;
let git: SimpleGit;
let ctx: CurationContext;

beforeEach(async () => {
  now = 1_000_000;
  hits = [];
  flakyHits = 0;
  pacing = {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    paceLoopback: true,
    state: new SiteState(),
  };
  contentDirectory = await mkdtemp(join(tmpdir(), "import-list-"));
  git = simpleGit({ baseDir: contentDirectory });
  await git.init();
  await git.addConfig("user.email", "curator@test.local");
  await git.addConfig("user.name", "Test Curator");
  await git.addConfig("commit.gpgsign", "false");
  await writeFile(
    join(contentDirectory, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
  );
  await git.add(".");
  await git.commit("Initial commit");
  ctx = {
    contentDirectory,
    author: { name: "Test Curator", email: "curator@test.local" },
  };
});

afterEach(async () => {
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

async function commitCount(): Promise<number> {
  return Number((await git.raw(["rev-list", "--count", "HEAD"])).trim());
}

async function lastMessage(): Promise<string> {
  return (await git.raw(["log", "-1", "--format=%s"])).trim();
}

/** A recipe already imported from the list's second item — its source URL
 * without the trailing slash, which must still match. */
async function seedPearTart() {
  await createRecipe(ctx, {
    name: "Pear Tart",
    ingredients: ["2 pears"],
    source: {
      url: `${servers.a.origin}/r/pear-tart`,
      name: "Site A",
    },
  });
}

/* ------------------------------------------------------------------ */
/* inspectList                                                         */
/* ------------------------------------------------------------------ */

describe("inspectList", () => {
  it("lists the cards and marks what the corpus already has", async () => {
    await seedPearTart();
    const result = await inspectList(ctx, listUrl(), { pacing });
    expect(result).toMatchObject({
      url: listUrl(),
      status: 200,
      title: "Five Fall Bakes",
      source: "links",
    });
    expect(
      result.items.map(({ n, name, existing }) => ({ n, name, existing })),
    ).toEqual([
      { n: 1, name: "Apple Cake", existing: undefined },
      { n: 2, name: "Pear Tart", existing: "pear-tart" },
      { n: 3, name: "Plum Crisp", existing: undefined },
      { n: 4, name: "Forbidden Fudge", existing: undefined },
      { n: 5, name: "Maple Bars", existing: undefined },
    ]);
    /* One request, nothing written. */
    expect(hits).toHaveLength(1);
    /* An index to ask, so no warning. */
    expect(result).not.toHaveProperty("warnings");
  });

  /* 35p: an unbuilt index reads as empty (F30); say so rather than mark nothing. */
  it("warns when the recipes index is missing, in both seats", async () => {
    const inspected = await inspectList(ctx, listUrl(), { pacing });
    expect(inspected.items.some((item) => item.existing)).toBe(false);
    expect(inspected.warnings).toEqual([MISSING_INDEX_WARNING]);
    expect(MISSING_INDEX_WARNING).toMatch(/index is missing.*Reindex first/);

    const dryRun = await importList(
      ctx,
      listUrl(),
      { pick: [1], dryRun: true },
      { pacing },
    );
    expect(dryRun.warnings).toEqual([MISSING_INDEX_WARNING]);
  });

  it("answers an empty list with the parser's reason", async () => {
    const result = await inspectList(ctx, `${servers.a.origin}/r/apple-cake/`, {
      pacing,
    });
    expect(result.items).toEqual([]);
    expect(result.reason).toMatch(/Recipe of its own/);
  });
});

/* ------------------------------------------------------------------ */
/* importList                                                          */
/* ------------------------------------------------------------------ */

describe("importList", () => {
  it("imports picks one commit each, skips existing, and paces each site", async () => {
    await seedPearTart();
    const before = await commitCount();

    const result = await importList(
      ctx,
      listUrl(),
      { pick: [1, 2, 3] },
      { pacing },
    );

    expect(result).toMatchObject({
      title: "Five Fall Bakes",
      total: 5,
      picked: [1, 2, 3],
      remaining: [],
    });
    expect(result.dryRun).toBeUndefined();
    expect(result.results).toEqual([
      expect.objectContaining({
        n: 1,
        status: "imported",
        slug: "apple-cake",
        suggestedTags: ["dessert"],
      }),
      expect.objectContaining({ n: 2, status: "existing", slug: "pear-tart" }),
      expect.objectContaining({ n: 3, status: "imported", slug: "plum-crisp" }),
    ]);
    /* Two recipes, two commits; no tags invented. */
    expect(await commitCount()).toBe(before + 2);
    const apple = await getRecipe(ctx, "apple-cake");
    expect(apple.recipe.source?.url).toBe(`${servers.a.origin}/r/apple-cake/`);
    expect(apple.recipe.tags).toBeUndefined();
    expect(apple.recipe.image).toBe("apple-cake.png");

    /* The list, then page + image per import; existing fetched nothing. */
    expect(hits.map((hit) => hit.path)).toEqual([
      "/fall-bakes/",
      "/r/apple-cake/",
      "/img/apple-cake.png",
      "/r/plum-crisp/",
      "/img/plum-crisp.png",
    ]);
    expect(result.requests).toBe(5);
    expectPolite();
  });

  it("creates the term and assigns it to imported and existing items in one commit", async () => {
    await seedPearTart();
    const before = await commitCount();

    const result = await importList(
      ctx,
      listUrl(),
      { pick: [1, 2], term: "fall-bakes" },
      { pacing },
    );

    expect(result.term).toMatchObject({
      slug: "fall-bakes",
      label: "Five Fall Bakes",
      created: true,
      updated: ["apple-cake", "pear-tart"],
    });
    /* One import, then the term record and both carriers together. */
    expect(await commitCount()).toBe(before + 2);
    expect(await lastMessage()).toBe("Create term: fall-bakes (+2 recipes)");
    const term = await getTerm(ctx, "fall-bakes");
    expect(term.record?.label).toBe("Five Fall Bakes");
    expect(term.recipes.sort()).toEqual(["apple-cake", "pear-tart"]);

    /* A second run finds both existing, keeps the record, changes nothing. */
    const again = await importList(
      ctx,
      listUrl(),
      { pick: [1, 2], term: "fall-bakes", termLabel: "Ignored" },
      { pacing },
    );
    expect(again.results.map((entry) => entry.status)).toEqual([
      "existing",
      "existing",
    ]);
    expect(again.term).toMatchObject({
      created: false,
      label: "Five Fall Bakes",
      updated: [],
      unchanged: ["apple-cake", "pear-tart"],
    });
    expect(await commitCount()).toBe(before + 2);
  });

  it("retries a 403 once, then drops the site and leaves its picks remaining", async () => {
    /* The retry waits on the queue, not this delay — but say what it is. */
    vi.stubEnv("RECIPE_FETCH_403_DELAY_MS", "15000");
    const result = await importList(
      ctx,
      listUrl(),
      { pick: [4, 5, 1] },
      { pacing },
    );

    expect(result.results).toEqual([
      expect.objectContaining({
        n: 4,
        status: "failed",
        error: expect.objectContaining({ code: "import_failed" }),
      }),
      expect.objectContaining({ n: 1, status: "imported", slug: "apple-cake" }),
    ]);
    /* Maple Bars is on the dropped site: not attempted, still to do. */
    expect(result.remaining).toEqual([
      { n: 5, url: `${servers.b.origin}/r/maple-bars/` },
    ]);
    expect(result.dropped).toEqual([
      {
        site: new URL(servers.b.origin).host,
        reason: expect.stringContaining("403"),
      },
    ]);
    const forbidden = hits.filter((hit) => hit.path === "/r/forbidden/");
    expect(forbidden).toHaveLength(2);
    expect(hits.some((hit) => hit.path === "/r/maple-bars/")).toBe(false);
    expect(result.requests).toBe(hits.length);
    expectPolite();

    /* The drop outlives the call: the next one asks site B nothing. */
    const before = hits.length;
    const again = await importList(ctx, listUrl(), { pick: [5] }, { pacing });
    expect(again.remaining).toEqual([
      { n: 5, url: `${servers.b.origin}/r/maple-bars/` },
    ]);
    expect(again.dropped?.[0].site).toBe(new URL(servers.b.origin).host);
    expect(hits.slice(before).every((hit) => hit.site === "a")).toBe(true);
    vi.unstubAllEnvs();
  });

  it("imports a recipe without an image it cannot get, and drops only on a second 403", async () => {
    const result = await importList(
      ctx,
      `${servers.a.origin}/pies/`,
      { pick: [1, 2, 3] },
      { pacing },
    );
    /* Flaky: 403, then a 200 that is not a picture — imported without it,
     * and the site is not dropped. Shy: 403 twice — imported without it, and
     * site A is dropped, so the cake (also on A) waits for a later call. */
    expect(result.results).toEqual([
      expect.objectContaining({
        n: 1,
        status: "imported",
        slug: "flaky-pie",
        warnings: [expect.stringContaining("without its image")],
      }),
      expect.objectContaining({
        n: 2,
        status: "imported",
        slug: "shy-pie",
        warnings: [expect.stringContaining("without its image")],
      }),
    ]);
    expect(result.results[0].image).toBeUndefined();
    expect((await getRecipe(ctx, "flaky-pie")).recipe.image).toBeUndefined();
    expect(result.remaining).toEqual([
      { n: 3, url: `${servers.a.origin}/r/apple-cake/` },
    ]);
    expect(result.dropped).toEqual([
      {
        site: new URL(servers.a.origin).host,
        reason: expect.stringContaining("shy-pie.png"),
      },
    ]);
    expect(hits.filter((hit) => hit.path === FLAKY)).toHaveLength(2);
    expect(hits.filter((hit) => hit.path === "/img/shy-pie.png")).toHaveLength(
      2,
    );
    expectPolite();
  });

  it("paces two calls at once against each other", async () => {
    await Promise.all([
      importList(ctx, listUrl(), { pick: [1] }, { pacing }),
      importList(ctx, listUrl(), { pick: [3], dryRun: true }, { pacing }),
      inspectList(ctx, listUrl(), { pacing }),
      inspectList(ctx, listUrl(), { pacing }),
    ]);
    expect(hits.filter((hit) => hit.path === "/fall-bakes/")).toHaveLength(4);
    expectPolite();
  });

  it("checks URL picks against the list as it is now", async () => {
    const a = servers.a.origin;
    const result = await importList(
      ctx,
      listUrl(),
      {
        pick: [
          /* A `remaining` entry whose item moved from 2 to 3. */
          { n: 2, url: `${a}/r/plum-crisp/` },
          /* A bare URL, spelled without the trailing slash. */
          `${a}/r/apple-cake`,
          /* Gone from the list. */
          { n: 4, url: `${a}/r/quince-tart/` },
        ],
        dryRun: true,
      },
      { pacing },
    );
    expect(result.results).toEqual([
      expect.objectContaining({
        n: 3,
        status: "would-import",
        slug: "plum-crisp",
        warnings: [expect.stringContaining("was item 2, is now 3")],
      }),
      expect.objectContaining({
        n: 1,
        status: "would-import",
        slug: "apple-cake",
      }),
      expect.objectContaining({
        n: 0,
        status: "skipped",
        warnings: [expect.stringContaining("no longer on the list")],
      }),
    ]);
    expect(result.picked).toEqual([3, 1]);
  });

  it("caps a call and answers the rest as remaining, to continue", async () => {
    const first = await importList(
      ctx,
      listUrl(),
      { all: true, limit: 2 },
      { pacing },
    );
    expect(first.picked).toEqual([1, 2, 3, 4, 5]);
    expect(first.results.map((entry) => [entry.n, entry.status])).toEqual([
      [1, "imported"],
      [2, "imported"],
    ]);
    expect(first.remaining.map((pick) => pick.n)).toEqual([3, 4, 5]);

    const second = await importList(
      ctx,
      listUrl(),
      { pick: first.remaining, limit: 2 },
      { pacing },
    );
    /* 4 is refused twice — a failure, and an attempt all the same. */
    expect(second.results.map((entry) => [entry.n, entry.status])).toEqual([
      [3, "imported"],
      [4, "failed"],
    ]);
    expect(second.remaining.map((pick) => pick.n)).toEqual([5]);
    /* The second call's list fetch waited out the first call's last request. */
    expectPolite();
  });

  it("dry-runs: fetches pages, never images, and writes nothing", async () => {
    await seedPearTart();
    const before = await commitCount();

    const result = await importList(
      ctx,
      listUrl(),
      { pick: [1, 2, 3], term: "fall-bakes", dryRun: true },
      { pacing },
    );

    expect(result.dryRun).toBe(true);
    expect(result.results).toEqual([
      expect.objectContaining({
        n: 1,
        status: "would-import",
        slug: "apple-cake",
        image: `${servers.a.origin}/img/apple-cake.png`,
      }),
      expect.objectContaining({ n: 2, status: "existing", slug: "pear-tart" }),
      expect.objectContaining({
        n: 3,
        status: "would-import",
        slug: "plum-crisp",
      }),
    ]);
    expect(result.term).toEqual({
      slug: "fall-bakes",
      label: "Five Fall Bakes",
      created: true,
      assign: ["apple-cake", "pear-tart", "plum-crisp"],
    });
    expect(hits.some((hit) => hit.path.startsWith("/img/"))).toBe(false);
    expect(await commitCount()).toBe(before);
    expect(
      await pathExists(join(contentDirectory, "recipes/data/apple-cake")),
    ).toBe(false);
    await expect(getTerm(ctx, "fall-bakes")).rejects.toMatchObject({
      code: "not_found",
    });
    expectPolite();
  });

  it("refuses a call with no picks, both, or a pick past the end", async () => {
    await expect(
      importList(ctx, listUrl(), {}, { pacing }),
    ).rejects.toMatchObject({
      code: "validation",
    });
    await expect(
      importList(ctx, listUrl(), { pick: [1], all: true }, { pacing }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      importList(ctx, listUrl(), { pick: [9] }, { pacing }),
    ).rejects.toMatchObject({
      code: "validation",
      message: expect.stringContaining("the list has 5"),
    });
    await expect(
      importList(ctx, "not a url", { all: true }, { pacing }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      importList(ctx, listUrl(), { all: true, limit: 7 }, { pacing }),
    ).rejects.toMatchObject({ code: "validation" });
  });
});

/* ------------------------------------------------------------------ */
/* Transports                                                          */
/* ------------------------------------------------------------------ */

describe("the term", () => {
  it("resolves an alias to its owner, and refuses an alias label before fetching", async () => {
    await createTerm(ctx, {
      label: "Autumn Bakes",
      aliases: ["fall-bakes"],
    });
    const result = await importList(
      ctx,
      listUrl(),
      { pick: [1], term: "fall-bakes" },
      { pacing },
    );
    expect(result.term).toMatchObject({
      slug: "autumn-bakes",
      label: "Autumn Bakes",
      created: false,
      updated: ["apple-cake"],
      warnings: [expect.stringContaining("alias")],
    });

    const before = hits.length;
    await expect(
      importList(
        ctx,
        listUrl(),
        { pick: [2], term: "harvest", termLabel: "Fall-Bakes" },
        { pacing },
      ),
    ).rejects.toMatchObject({ code: "validation" });
    /* Refused before the list was fetched. */
    expect(hits).toHaveLength(before);
  });

  it("labels a carried tag by its own label, not the page's title", async () => {
    await createRecipe(ctx, {
      name: "Old Cake",
      tags: ["Orchard Fruit"],
      ingredients: ["1 apple"],
    });
    const result = await importList(
      ctx,
      listUrl(),
      { pick: [1], term: "orchard-fruit", dryRun: true },
      { pacing },
    );
    expect(result.term).toMatchObject({
      slug: "orchard-fruit",
      label: "orchard fruit",
      created: true,
    });
  });
});

describe("the epic-26 seats share the queue", () => {
  it("spaces inspect and import on the real clock, and two calls at once", async () => {
    /* A short real gap: the queue, not the length, is what is checked. */
    vi.stubEnv("RECIPE_POLITE_GAP_MS", "300");
    const page = `<html><head><script type="application/ld+json">${JSON.stringify(
      { "@type": "Recipe", name: "Queue Cake", recipeIngredient: ["1 egg"] },
    )}</script></head></html>`;
    const started: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        started.push(Date.now());
        return new Response(page, { headers: { "content-type": "text/html" } });
      }),
    );
    try {
      await Promise.all([
        inspectUrl("https://queue.example.com/a/"),
        inspectUrl("https://www.queue.example.com/b/"),
        importAndCreate(ctx, "https://cdn.queue.example.com/c/", {
          dryRun: true,
        }),
      ]);
      expect(started).toHaveLength(3);
      started.sort((x, y) => x - y);
      /* One site (`siteKey`), so one at a time, each ≥ 300 ms after the last
       * ended — a few ms of timer slack allowed. */
      expect(started[1] - started[0]).toBeGreaterThanOrEqual(290);
      expect(started[2] - started[1]).toBeGreaterThanOrEqual(290);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

describe("the CLI's --pick", () => {
  it("reads positions and ranges", () => {
    expect(parsePicks("1,3,5-7")).toEqual([1, 3, 5, 6, 7]);
    expect(() => parsePicks("0")).toThrow(CurationError);
    expect(() => parsePicks("3-1")).toThrow(/range/);
    expect(() => parsePicks("a")).toThrow(/1-based/);
    expect(() => parsePicks("1-5000")).toThrow(/more than 1000/);
    expect(parsePicks("2,https://x.example/a/")).toEqual([
      2,
      "https://x.example/a/",
    ]);
  });
});

describe("the HTTP backend", () => {
  it("posts to /api/inspect-list and /api/import-list and rehydrates errors", async () => {
    const seen: { path?: string; body: unknown }[] = [];
    const editor = createServer((request, response) => {
      let text = "";
      request.on("data", (chunk) => (text += chunk));
      request.on("end", () => {
        seen.push({ path: request.url, body: JSON.parse(text) });
        response.writeHead(request.url === "/api/import-list" ? 400 : 200, {
          "content-type": "application/json",
        });
        response.end(
          request.url === "/api/import-list"
            ? JSON.stringify({
                error: { code: "validation", message: "No item 9" },
              })
            : JSON.stringify({ url: "u", items: [] }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      editor.listen(0, "127.0.0.1", resolve),
    );
    try {
      const backend = createHttpBackend({
        baseUrl: `http://127.0.0.1:${(editor.address() as AddressInfo).port}`,
      });
      expect(await backend.inspectList("https://x.example/list/")).toEqual({
        url: "u",
        items: [],
      });
      await expect(
        backend.importList("https://x.example/list/", {
          pick: [9],
          term: "fall",
          dryRun: true,
        }),
      ).rejects.toMatchObject({ code: "validation", message: "No item 9" });
      expect(seen).toEqual([
        { path: "/api/inspect-list", body: { url: "https://x.example/list/" } },
        {
          path: "/api/import-list",
          body: {
            url: "https://x.example/list/",
            pick: [9],
            term: "fall",
            dryRun: true,
          },
        },
      ]);
    } finally {
      await new Promise<void>((resolve) => editor.close(() => resolve()));
    }
  });
});
