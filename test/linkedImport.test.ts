// @vitest-environment node
//
// 50e: an import follows the recipes its page links to, against a loopback
// "zoebakes" serving the trimmed fixtures (its links pointed at the server),
// into a content directory that is a git repository — so the linked recipe's
// own commit, the line rewrites, `--linked off`, a dry run, the "already
// here" link and `recipes linked --scan` are counted, not assumed. No model,
// nothing on the network.

import { mkdtemp, readFileSync, rm, writeFile } from "fs-extra";
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

import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import {
  importAndCreate,
  type ImportCreateResult,
  type ImportDryRunResult,
} from "../websites/recipe-website/editor/controller/curation/importRecipe";
import { scanLinked } from "../websites/recipe-website/editor/controller/curation/linkedImport";
import {
  getRecipe,
  updateRecipe,
} from "../websites/recipe-website/editor/controller/curation/recipes";
import { formatLinked } from "../websites/recipe-website/editor/cli/commands/linked";

const FIXTURES = join(__dirname, "fixtures", "linked");
const CAKE_PATH = "/2019/10/13/pear-panna-cotta-cake/";
const PEARS_PATH = "/2008/02/01/poached-pears/";
/** A 1×1 PNG, for every picture the pages name. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let server: Server;
let origin = "";
let hits: string[] = [];

/** A fixture with every zoebakes.com link (escaped in JSON-LD too) on `origin`. */
function served(file: string): string {
  const html = readFileSync(join(FIXTURES, file), "utf8");
  const escaped = origin.replace(/\//g, "\\/");
  return html
    .replace(/https?:\/\/(?:i\d\.wp\.com\/)?(?:www\.)?zoebakes\.com/g, origin)
    .replace(
      /https?:\\\/\\\/(?:i\d\.wp\.com\\\/)?(?:www\.)?zoebakes\.com/g,
      escaped,
    );
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0];
    hits.push(path);
    if (path === CAKE_PATH) {
      response.writeHead(200, { "content-type": "text/html" });
      return response.end(served("zoebakes-pear-panna-cotta-cake.html"));
    }
    if (path === PEARS_PATH) {
      response.writeHead(200, { "content-type": "text/html" });
      return response.end(served("zoebakes-poached-pears.html"));
    }
    if (path.startsWith("/wp-content/")) {
      response.writeHead(200, { "content-type": "image/png" });
      return response.end(PNG);
    }
    response.writeHead(404, { "content-type": "text/html" });
    response.end("<html>Not found</html>");
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    }),
  );
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

let contentDirectory: string;
let git: SimpleGit;
let ctx: CurationContext;

beforeEach(async () => {
  hits = [];
  vi.stubEnv("RECIPE_LLM_URL", "");
  contentDirectory = await mkdtemp(join(tmpdir(), "linked-import-"));
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
  vi.unstubAllEnvs();
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

const cakeUrl = () => `${origin}${CAKE_PATH}`;
const pearsUrl = () => `${origin}${PEARS_PATH}`;

async function messages(): Promise<string[]> {
  return (await git.raw(["log", "--format=%s"])).trim().split("\n");
}

const plain = (line: string) =>
  line.replace(/<Multiplyable baseNumber="([^"]*)" \/>/g, "$1");

describe("importing a recipe that links another", () => {
  it("imports the poached pears first, then the cake with both pear lines linked", async () => {
    const result = (await importAndCreate(ctx, cakeUrl(), {
      tags: ["dessert", "pear"],
    })) as ImportCreateResult;
    expect(result.slug).toBe("pear-panna-cotta-cake");
    expect(result.linked?.recipes).toEqual([
      {
        url: pearsUrl(),
        text: "poach the pears as instructed here",
        where: "ingredient",
        status: "imported",
        slug: "poached-pears",
        name: "Poached Pears",
        lines: [9, 17],
        /* Her page names pears; it says nothing of dessert. */
        tags: ["pear"],
      },
    ]);
    expect(
      result.linked?.lines.map((change) => [
        change.line,
        change.how,
        change.to,
      ]),
    ).toEqual([
      [9, "link", "2 cups (600g) [pear puree](/recipe/poached-pears)"],
      [
        17,
        "name",
        "1 1/2 cups (350ml) [Pear Poaching Liquid](/recipe/poached-pears) (strained)",
      ],
    ]);
    const cake = await getRecipe(ctx, "pear-panna-cotta-cake");
    expect(plain(cake.recipe.ingredients[9].ingredient)).toBe(
      "2 cups (600g) [pear puree](/recipe/poached-pears)",
    );
    const pears = await getRecipe(ctx, "poached-pears");
    expect(pears.recipe.tags).toEqual(["pear"]);
    expect(pears.recipe.source?.url).toBe(pearsUrl());
    /* The linked one is its own commit, before the cake's. */
    expect((await messages()).slice(0, 2)).toEqual([
      "Create recipe: pear-panna-cotta-cake",
      expect.stringMatching(
        /^Create recipe: poached-pears \(linked from 127\.0\.0\.1\/2019\/10\/13\/pear-panna-cotta-cake\)$/,
      ),
    ]);
    /* Each page once: the cake, then the pears (and their pictures). */
    expect(hits.filter((path) => !path.startsWith("/wp-content/"))).toEqual([
      CAKE_PATH,
      PEARS_PATH,
    ]);
  });

  it("links to the poached pears already here instead of importing them again", async () => {
    await importAndCreate(ctx, pearsUrl(), {});
    hits = [];
    const result = (await importAndCreate(
      ctx,
      cakeUrl(),
      {},
    )) as ImportCreateResult;
    expect(result.linked?.recipes[0]).toMatchObject({
      status: "existing",
      slug: "poached-pears",
      lines: [9, 17],
    });
    expect(hits.filter((path) => !path.startsWith("/wp-content/"))).toEqual([
      CAKE_PATH,
    ]);
  });

  it("imports the cake alone with linked off", async () => {
    const result = (await importAndCreate(ctx, cakeUrl(), {
      linked: "off",
    })) as ImportCreateResult;
    expect(result.linked).toBeUndefined();
    const cake = await getRecipe(ctx, "pear-panna-cotta-cake");
    expect(plain(cake.recipe.ingredients[9].ingredient)).toBe(
      "2 cups (600g) pear puree",
    );
    await expect(getRecipe(ctx, "poached-pears")).rejects.toThrow();
  });

  it("shows, in a dry run, what it would import and link, and writes nothing", async () => {
    const before = await messages();
    const result = (await importAndCreate(ctx, cakeUrl(), {
      dryRun: true,
    })) as ImportDryRunResult;
    expect(result.linked?.recipes[0]).toMatchObject({
      status: "would-import",
      slug: "poached-pears",
    });
    expect(plain(result.recipe.ingredients[17].ingredient)).toContain(
      "[Pear Poaching Liquid](/recipe/poached-pears)",
    );
    expect(await messages()).toEqual(before);
    const text = formatLinked(result.linked, true).join("\n");
    expect(text).toContain("would import as poached-pears");
    expect(text).toContain(
      'line 18 would read "1 1/2 cups (350ml) Pear Poaching Liquid (strained)" → "1 1/2 cups (350ml) [Pear Poaching Liquid](/recipe/poached-pears) (strained)"',
    );
  });
});

describe("recipes linked --scan", () => {
  it("links an existing recipe's lines from its page, and finds nothing more to do the second time", async () => {
    await importAndCreate(ctx, cakeUrl(), { linked: "off" });
    const dry = await scanLinked(ctx, {
      slugs: ["pear-panna-cotta-cake"],
      dryRun: true,
    });
    expect(dry).toMatchObject({
      dryRun: true,
      scanned: 1,
      recipes: [{ slug: "pear-panna-cotta-cake", status: "would-link" }],
    });
    await expect(getRecipe(ctx, "poached-pears")).rejects.toThrow();

    const done = await scanLinked(ctx, { slugs: ["pear-panna-cotta-cake"] });
    expect(done.recipes[0]).toMatchObject({ status: "linked" });
    expect(done.recipes[0].linked?.lines).toHaveLength(2);
    const cake = await getRecipe(ctx, "pear-panna-cotta-cake");
    expect(plain(cake.recipe.ingredients[17].ingredient)).toContain(
      "[Pear Poaching Liquid](/recipe/poached-pears)",
    );

    const again = await scanLinked(ctx, { slugs: ["pear-panna-cotta-cake"] });
    expect(again.recipes[0]).toMatchObject({ status: "unchanged" });
    expect(again.recipes[0].linked?.recipes[0]).toMatchObject({
      status: "existing",
      already: true,
      lines: [9, 17],
    });
    expect(again.recipes[0].linked?.notes).toBeUndefined();
  });

  it("adds a Uses note when no line makes the linked recipe", async () => {
    await importAndCreate(ctx, cakeUrl(), { linked: "off" });
    /* Lines nobody could match: the purée line renamed past recognition. */
    const cake = await getRecipe(ctx, "pear-panna-cotta-cake");
    const ingredients = cake.recipe.ingredients.map((entry, index) =>
      index === 9
        ? { ingredient: "2 cups fruit mush" }
        : index === 17
          ? { ingredient: "1 1/2 cups syrup" }
          : entry,
    );
    await updateRecipe(ctx, "pear-panna-cotta-cake", { ingredients });
    const done = await scanLinked(ctx, { slugs: ["pear-panna-cotta-cake"] });
    expect(done.recipes[0].linked?.lines).toEqual([]);
    expect(done.recipes[0].linked?.notes).toEqual([
      "Uses: [Poached Pears](/recipe/poached-pears)",
    ]);
    const after = await getRecipe(ctx, "pear-panna-cotta-cake");
    expect(after.recipe.notes).toContain(
      "Uses: [Poached Pears](/recipe/poached-pears)",
    );
  });
});
