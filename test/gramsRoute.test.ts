// @vitest-environment node
//
// Epic 51, 51f (review finding 1): `POST /api/recipe/<slug>/grams` through
// the route itself, auth for real (tokens minted per test, the `@/auth`
// stub for the session). The model step is a stand-in (`runSpec` and
// `editModelFor` mocked) — never a real model. Pinned: asking the model
// needs a write token, dry run or not (it spends a model's time or money);
// a read token may dry-run the paste and the bank; and the model's grams
// come back as `suggested`, never written — the edit page is where a
// person keeps them.

import { mkdtemp, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import simpleGit from "simple-git";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

const { runSpec } = vi.hoisted(() => ({ runSpec: vi.fn() }));
vi.mock(
  "../websites/recipe-website/editor/controller/jobs/kinds",
  async (original) => ({
    ...(await original<object>()),
    runSpec,
  }),
);
vi.mock(
  "../websites/recipe-website/editor/controller/llm/askEdit",
  async (original) => ({
    ...(await original<object>()),
    editModelFor: () => ({
      backend: "local",
      config: { url: "http://127.0.0.1:1", model: "stand-in", api: "ollama" },
      label: "stand-in (local)",
    }),
  }),
);

import { auth } from "./stub_auth.js";
import {
  addTokenToUser,
  writeUser,
} from "../websites/recipe-website/editor/src/users";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import {
  createRecipe,
  getRecipe,
} from "../websites/recipe-website/editor/controller/curation/recipes";

const { POST: gramsRoute } =
  await import("../websites/recipe-website/editor/src/app/api/recipe/[slug]/grams/route");

const EDITOR = "admin@nextmail.com";
const SLUG = "eggs-and-sugar";

let contentDirectory: string;

async function mint(scope: "read" | "write"): Promise<string> {
  await writeUser(contentDirectory, { email: EDITOR, password: "hashed" });
  return addTokenToUser(contentDirectory, EDITOR, `grams-${scope}`, {
    scope,
  });
}

function post(body: unknown, token: string) {
  return gramsRoute(
    new Request(`http://editor/api/recipe/${SLUG}/grams`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug: SLUG }) },
  );
}

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "grams-route-"));
  const git = simpleGit({ baseDir: contentDirectory });
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
  vi.stubEnv("CONTENT_DIRECTORY", contentDirectory);
  auth.mockReset();
  auth.mockResolvedValue(null);
  runSpec.mockReset();
  runSpec.mockImplementation(async (spec: { lines: { line: number }[] }) => ({
    answers: spec.lines.map((line) => ({
      line: line.line,
      grams: 100,
      why: "two large eggs",
    })),
    model: "stand-in (local)",
    warnings: [],
    job: "job-1",
  }));
  await createRecipe(
    {
      contentDirectory,
      author: { name: "Test Curator", email: "curator@test.local" },
    },
    {
      name: "Eggs and sugar",
      slug: SLUG,
      ingredients: ["1 cup sugar", "2 eggs"],
    },
  );
});

afterEach(async () => {
  await closeCachedEnvironments();
  vi.unstubAllEnvs();
  await rm(contentDirectory, { recursive: true, force: true });
});

const stored = async () =>
  (
    await getRecipe(
      {
        contentDirectory,
        author: { name: "Test Curator", email: "curator@test.local" },
      },
      SLUG,
    )
  ).recipe.ingredients?.map((line) => line.ingredient);

describe("POST /api/recipe/<slug>/grams", () => {
  it("lets a read token dry-run the bank, and refuses it the model, dry run or not", async () => {
    const read = await mint("read");
    const dry = await post({ dryRun: true }, read);
    expect(dry.status).toBe(200);
    expect(await dry.json()).toMatchObject({
      written: false,
      dryRun: true,
      lines: [{ line: 1, to: "1 cup (200g) sugar", source: "bank" }],
      suggested: [],
    });
    for (const body of [{ model: true, dryRun: true }, { model: true }, {}]) {
      const refused = await post(body, read);
      expect(refused.status).toBe(403);
      expect((await refused.json()).error.code).toBe("forbidden");
    }
    expect(runSpec).not.toHaveBeenCalled();
  });

  it("answers the model's grams as suggestions and never writes them", async () => {
    const write = await mint("write");
    const response = await post({ model: true }, write);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(runSpec).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      written: true,
      lines: [{ line: 1, source: "bank" }],
      suggested: [
        { line: 2, to: "2 eggs (100g)", source: "model", grams: 100 },
      ],
    });
    expect(await stored()).toEqual([
      '<Multiplyable baseNumber="1" /> cup (<Multiplyable baseNumber="200" />g) sugar',
      '<Multiplyable baseNumber="2" /> eggs',
    ]);
  });
});
