// @vitest-environment node
//
// The one thing `curation.test.ts` cannot check: that the *process* behaves.
//
// Everything here is about the boundary rather than the logic — that `--json`
// puts exactly one object on stdout and nothing else, that the exit code says
// which kind of failure it was (2 for a slug conflict, 1 for the rest), and
// that a plain `tsx` process can open this engine at all. The last one is the
// point of the whole phase and is exactly what an in-process test cannot prove:
// a stray `next/*` import or an `unstable_cache` read fails only when a real
// Node process runs the file.
//
// So these cases spawn the CLI. That costs a few seconds each — hence the
// explicit 30 s timeouts, since vitest's default is 5 s (fact 11) — and it
// rules out the network cases, because `fetch` cannot be stubbed in a child.

import { execa } from "execa";
import { mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createContent } from "@discontent/cms/content/createContent";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { groupContentConfig } from "../websites/recipe-website/common/controller/groupContentConfig";
import { recipeContentConfig } from "../websites/recipe-website/common/controller/recipeContentConfig";
import type {
  Group,
  GroupEntryKey,
  GroupEntryValue,
  Recipe,
  RecipeEntryKey,
  RecipeEntryValue,
} from "../websites/recipe-website/common/controller/types";

const EDITOR_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../websites/recipe-website/editor",
);

const TIMEOUT = 30_000;

let contentDirectory: string;

beforeAll(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "cli-json-"));
  await createContent<Recipe, RecipeEntryValue, RecipeEntryKey>({
    config: recipeContentConfig,
    slug: "first-recipe",
    data: { name: "First Recipe", date: Date.UTC(2026, 0, 2) },
    contentDirectory,
  });
  await createContent<Group, GroupEntryValue, GroupEntryKey>({
    config: groupContentConfig,
    slug: "week-one",
    data: {
      name: "Week One",
      date: Date.UTC(2026, 0, 3),
      kind: "meal-plan",
      items: [{ recipe: "first-recipe", label: "Mon · Dinner" }],
    },
    contentDirectory,
  });
  /*
   * Before any child runs. The environments this process opened are mapped
   * files, and the child is about to open the same ones (T16).
   */
  await closeCachedEnvironments();
});

afterAll(async () => {
  await rm(contentDirectory, { recursive: true, force: true });
});

function run(args: string[]) {
  return execa(
    "pnpm",
    ["exec", "tsx", "cli/index.ts", ...args, "--content-dir", contentDirectory],
    {
      cwd: EDITOR_DIR,
      reject: false,
      /*
       * `CONTENT_DIRECTORY` unset, so a bug in `--content-dir` resolution
       * cannot be masked by the ambient environment the runner inherited.
       */
      env: { ...process.env, CONTENT_DIRECTORY: undefined },
    },
  );
}

describe("the CLI as a process", () => {
  it(
    "prints one object for list --json",
    async () => {
      const result = await run(["list", "--json"]);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.total).toBe(1);
      expect(parsed.recipes[0].slug).toBe("first-recipe");
    },
    TIMEOUT,
  );

  it(
    "prints one object for group list --json",
    async () => {
      const result = await run(["group", "list", "--json"]);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.groups).toHaveLength(1);
      expect(parsed.groups[0]).toMatchObject({
        slug: "week-one",
        kind: "meal-plan",
        itemCount: 1,
      });
    },
    TIMEOUT,
  );

  it(
    "exits 1 with a not_found object for a missing recipe",
    async () => {
      const result = await run(["show", "missing", "--json"]);
      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stdout).error.code).toBe("not_found");
    },
    TIMEOUT,
  );

  it(
    "exits 2 with a slug_conflict object for a duplicate create",
    async () => {
      const result = await execa(
        "pnpm",
        [
          "exec",
          "tsx",
          "cli/index.ts",
          "create",
          "--stdin",
          "--json",
          "--content-dir",
          contentDirectory,
        ],
        {
          cwd: EDITOR_DIR,
          reject: false,
          input: JSON.stringify({ name: "First Recipe" }),
          env: { ...process.env, CONTENT_DIRECTORY: undefined },
        },
      );
      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.error.code).toBe("slug_conflict");
      expect(parsed.error.slug).toBe("first-recipe");
    },
    TIMEOUT,
  );
});
