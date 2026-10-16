// @vitest-environment node
//
// The roundup picker's server actions without a job store (38b review).
// When the jobs directory cannot be written (37-T6) a job runs with no
// record, so its id answers 404 to the picker's poll. The start actions
// must then wait for the job and answer inline — as before 38b — rather
// than hand back an id nobody can follow (the picker would stop while the
// chunk went on importing, and Resume would import the same picks again).
//
// One loopback "site" (not paced), a content directory that is a git
// repository, and the session mocked; no network, no model.

import { mkdtemp, rm, writeFile } from "fs-extra";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import simpleGit from "simple-git";
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
import { getRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";

let ctx: CurationContext;
vi.mock("recipe-editor/controller/actions/shared", () => ({
  authenticateUser: async () => "cook@test.local",
}));
vi.mock("recipe-editor/controller/apiContext", () => ({
  curationContextFor: () => ctx,
}));
vi.mock("@discontent/cms/fs/getContentDirectory", () => ({
  getContentDirectory: () => ctx.contentDirectory,
}));
const { afterTasks } = vi.hoisted(() => ({
  afterTasks: [] as Promise<unknown>[],
}));
vi.mock("next/server", () => ({
  after: (task: unknown) => {
    afterTasks.push(
      typeof task === "function"
        ? Promise.resolve().then(task as () => unknown)
        : (task as Promise<unknown>),
    );
  },
}));

const actions =
  await import("../websites/recipe-website/editor/src/app/(recipes)/new-recipe/roundupActions");

/* ------------------------------------------------------------------ */
/* One site                                                            */
/* ------------------------------------------------------------------ */

let server: Server;
let origin = "";

function recipePage(slug: string, name: string): string {
  return [
    "<html><head>",
    `<title>${name}</title>`,
    `<script type="application/ld+json">${JSON.stringify({
      "@type": "Recipe",
      name,
      recipeIngredient: ["1 cup flour", "1/2 cup sugar"],
      recipeInstructions: "Mix. Bake.",
      image: `${origin}/img/${slug}.png`,
    })}</script>`,
    "</head><body></body></html>",
  ].join("");
}

function listPage(): string {
  const card = (slug: string, name: string) =>
    `<div><a href="/r/${slug}/"><img src="/c/${slug}.jpg"></a><h2>${name}</h2></div>`;
  return [
    "<html><head><title>Three Bakes</title></head><body><article>",
    "<h1>Three Bakes</h1><div class='entry-content'>",
    card("pear-tart", "Pear Tart"),
    card("plum-crisp", "Plum Crisp"),
    card("fig-cake", "Fig Cake"),
    "</div></article></body></html>",
  ].join("");
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0];
    if (path === "/three-bakes/") {
      response.writeHead(200, { "content-type": "text/html" });
      return response.end(listPage());
    }
    const recipe = /^\/r\/([a-z-]+)\/$/.exec(path);
    if (recipe) {
      const name = recipe[1]
        .split("-")
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(" ");
      response.writeHead(200, { "content-type": "text/html" });
      return response.end(recipePage(recipe[1], name));
    }
    if (path.startsWith("/img/")) {
      response.writeHead(200, { "content-type": "image/png" });
      return response.end("png bytes");
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

/* ------------------------------------------------------------------ */
/* Content and the job store                                           */
/* ------------------------------------------------------------------ */

let scratch: string;

beforeEach(async () => {
  vi.stubEnv("RECIPE_LLM_URL", "");
  scratch = await mkdtemp(join(tmpdir(), "roundup-actions-"));
  const contentDirectory = join(scratch, "content");
  const git = simpleGit();
  await git.init([contentDirectory]);
  const repo = simpleGit({ baseDir: contentDirectory });
  await repo.addConfig("user.email", "cook@test.local");
  await repo.addConfig("user.name", "Test Cook");
  await repo.addConfig("commit.gpgsign", "false");
  await writeFile(
    join(contentDirectory, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
  );
  await repo.add(".");
  await repo.commit("Initial commit");
  ctx = {
    contentDirectory,
    author: { name: "cook@test.local", email: "cook@test.local" },
  };
  afterTasks.length = 0;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.allSettled(afterTasks);
  await closeCachedEnvironments();
  await rm(scratch, { recursive: true, force: true });
});

/** A jobs directory under a regular file: every write to it fails. */
async function unwritableJobsDir(): Promise<string> {
  const file = join(scratch, "not-a-directory");
  await writeFile(file, "");
  return join(file, "jobs");
}

const listUrl = () => `${origin}/three-bakes/`;
const picks = () => [
  { n: 1, url: `${origin}/r/pear-tart/`, name: "Pear Tart" },
  { n: 2, url: `${origin}/r/plum-crisp/`, name: "Plum Crisp" },
];

describe("the roundup picker's actions without a job store (38b review)", () => {
  it("list and import inline: the answer comes with the start, nothing to follow", async () => {
    vi.stubEnv("RECIPE_JOBS_DIR", await unwritableJobsDir());
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const listed = await actions.inspectRoundupAction(listUrl());
    if (!("answer" in listed)) {
      throw new Error(`expected an inline answer: ${JSON.stringify(listed)}`);
    }
    expect(listed.answer.result.items.map((item) => item.name)).toEqual([
      "Pear Tart",
      "Plum Crisp",
      "Fig Cake",
    ]);

    const imported = await actions.importRoundupAction({
      url: listUrl(),
      picks: picks(),
    });
    if (!("answer" in imported)) {
      throw new Error(`expected an inline answer: ${JSON.stringify(imported)}`);
    }
    expect(imported.answer).toMatchObject({
      outcomes: [
        { n: 1, status: "imported", slug: "pear-tart" },
        { n: 2, status: "imported", slug: "plum-crisp" },
      ],
      requeue: [],
      stalled: false,
    });
    /* The writes had landed when the action answered. */
    expect((await getRecipe(ctx, "pear-tart")).recipe.name).toBe("Pear Tart");
    expect((await getRecipe(ctx, "plum-crisp")).recipe.name).toBe("Plum Crisp");
  });

  it("answers a failed job's error inline, as the record would have", async () => {
    vi.stubEnv("RECIPE_JOBS_DIR", await unwritableJobsDir());
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const answer = await actions.inspectRoundupAction("ftp://example.com/x");
    expect(answer).toMatchObject({ error: { code: expect.any(String) } });
    expect("job" in answer).toBe(false);
  });

  it("with a store, answers the job's id at once, and the result is read back", async () => {
    const started = await actions.inspectRoundupAction(listUrl());
    if ("error" in started) throw new Error(started.error.message);
    expect("answer" in started).toBe(false);
    await vi.waitFor(
      async () => {
        const read = await actions.inspectRoundupResult(started.job);
        if ("error" in read) throw new Error(read.error.message);
        expect(read.result.items).toHaveLength(3);
      },
      { timeout: 15_000, interval: 50 },
    );
  }, 20_000);
});
