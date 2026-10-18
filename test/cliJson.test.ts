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
import { mkdtemp, pathExists, readFile, rm, writeFile } from "fs-extra";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import { dirname, join } from "path";
import simpleGit from "simple-git";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createContent } from "@discontent/cms/content/createContent";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import {
  photoTranscripts,
  standInChat,
} from "../websites/recipe-website/editor/playwright/fixtures/llm/standInModel";

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

/** 38e: the Playwright fixture card and its transcript. */
const PHOTO_FIXTURES = join(EDITOR_DIR, "playwright/fixtures/photos");

let contentDirectory: string;

beforeAll(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "cli-json-"));
  /*
   * A repository, unlike every other content test's tmpdir (23d). The identity
   * and the `.gitignore` land before the first `createContent` below, because
   * that call commits and would otherwise either demand a committer or sweep
   * the LMDB files into the initial commit (T49).
   */
  const repo = simpleGit({ baseDir: contentDirectory });
  await repo.init();
  await repo.addConfig("user.email", "curator@test.local");
  await repo.addConfig("user.name", "Test Curator");
  await repo.addConfig("commit.gpgsign", "false");
  await writeFile(
    join(contentDirectory, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
  );
  await repo.add(".");
  await repo.commit("Initial commit");
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

function run(args: string[], env: NodeJS.ProcessEnv = {}, input?: string) {
  return execa(
    "pnpm",
    ["exec", "tsx", "cli/index.ts", ...args, "--content-dir", contentDirectory],
    {
      cwd: EDITOR_DIR,
      reject: false,
      ...(input !== undefined ? { input } : {}),
      /*
       * `CONTENT_DIRECTORY` unset, so a bug in `--content-dir` resolution
       * cannot be masked by the ambient environment the runner inherited —
       * and no local model (36b) unless a test names one.
       */
      env: {
        ...process.env,
        CONTENT_DIRECTORY: undefined,
        RECIPE_LLM_URL: undefined,
        RECIPE_LLM_MODEL: undefined,
        RECIPE_LLM_API: undefined,
        RECIPE_LLM_API_KEY: undefined,
        RECIPE_LLM_VISION_MODEL: undefined,
        ...env,
      },
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
    "prints one object for tags --json",
    async () => {
      /*
       * The fixture recipe carries no tags, so the interesting part is the
       * *shape*: the CLI's contract is one JSON object, which is why `tags`
       * answers `{tags}` rather than a bare array (D12).
       */
      const result = await run(["tags", "--json"]);
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ tags: [] });
    },
    TIMEOUT,
  );

  it(
    "exits 1 with a group_cycle object for `group add <g> --group <g>`",
    async () => {
      /*
       * The 23c flag through a real process: `--group` names a sub-group where
       * the positional names a recipe, and a group that would contain itself is
       * refused before anything is written — so this case needs no fixture of
       * its own and leaves the corpus exactly as it found it.
       */
      const result = await run([
        "group",
        "add",
        "week-one",
        "--group",
        "week-one",
        "--json",
      ]);
      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stdout)).toEqual({
        error: {
          code: "group_cycle",
          message: expect.stringContaining("week-one"),
          groups: ["week-one", "week-one"],
        },
      });
    },
    TIMEOUT,
  );

  it(
    "adds an item with --scale and shows it, in JSON and in text",
    async () => {
      /*
       * Epic 32, D4. Its own plan, so the shared `week-one` fixture the other
       * cases count stays one item long.
       */
      const created = await run([
        "group",
        "create",
        "--name",
        "Scaled Week",
        "--slug",
        "scaled-week",
        "--item",
        "first-recipe:Mon@1/2",
        "--json",
      ]);
      expect(created.exitCode).toBe(0);

      const added = await run([
        "group",
        "add",
        "scaled-week",
        "first-recipe",
        "--label",
        "Tue",
        "--scale",
        "2",
        "--json",
      ]);
      expect(added.exitCode).toBe(0);

      const shown = await run(["group", "show", "scaled-week", "--json"]);
      expect(JSON.parse(shown.stdout).group.items).toEqual([
        { recipe: "first-recipe", label: "Mon", scale: "1/2" },
        { recipe: "first-recipe", label: "Tue", scale: "2" },
      ]);

      const text = await run(["group", "show", "scaled-week"]);
      expect(text.stdout).toContain("Tue — First Recipe (first-recipe) ×2");

      const refused = await run([
        "group",
        "add",
        "scaled-week",
        "first-recipe",
        "--scale",
        "0",
        "--json",
      ]);
      expect(refused.exitCode).not.toBe(0);
      expect(JSON.parse(refused.stdout).error).toMatchObject({
        code: "validation",
        issues: [{ path: "scale" }],
      });
    },
    /* Five processes, at the ~4 s a `tsx` start costs. */
    TIMEOUT * 3,
  );

  it(
    "prints one object for git log --json",
    async () => {
      /*
       * 23d, and the only thing that proves the git seats survive the trip
       * through a real `tsx` process: `simple-git` spawns a child, and the
       * seeded commits above are what it has to find. `--type recipe --slug`
       * also exercises the pathspec the content config produces, which is the
       * part a wrong `uploadsDirectory` would silently widen.
       */
      const result = await run([
        "git",
        "log",
        "--type",
        "recipe",
        "--slug",
        "first-recipe",
        "--json",
      ]);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.hasMore).toBe(false);
      expect(parsed.commits).toHaveLength(1);
      expect(parsed.commits[0]).toMatchObject({
        message: "Add new recipes: first-recipe",
        files: ["recipes/data/first-recipe/recipe.json"],
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

  /*
   * 22d. Two things in one case, and neither needs a server: that `--remote`
   * actually *selects* the HTTP backend — a local read would have succeeded
   * against the seeded tmpdir, so a passing `list` here would mean the flag was
   * ignored — and that a transport failure arrives as the CLI's own error
   * object rather than an unhandled `fetch failed`. Port 9 is discard: nothing
   * listens there by definition.
   */
  it(
    "reports an unreachable --remote as one internal error object",
    async () => {
      const result = await run([
        "--remote",
        "http://127.0.0.1:9",
        "list",
        "--json",
      ]);
      expect(result.exitCode).toBe(1);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.error.code).toBe("internal");
      expect(parsed.error.message).toContain("Could not reach");
    },
    TIMEOUT,
  );

  /*
   * 25d. A bare `inventory` is `inventory list` — the one table command with
   * a default — and the items are positionals, quoted when they have spaces.
   */
  it(
    "keeps the inventory: bare list, add, and make as one object each",
    async () => {
      const empty = await run(["inventory", "--json"]);
      expect(empty.exitCode).toBe(0);
      expect(JSON.parse(empty.stdout)).toMatchObject({ items: [] });

      const added = await run([
        "inventory",
        "add",
        "simple syrup",
        "Gnista",
        "--json",
      ]);
      expect(added.exitCode).toBe(0);
      expect(JSON.parse(added.stdout)).toMatchObject({
        items: ["Gnista", "simple syrup"],
        changed: true,
      });

      const make = await run(["inventory", "make", "-tag:drink", "--json"]);
      expect(make.exitCode).toBe(0);
      expect(JSON.parse(make.stdout)).toMatchObject({
        query: "-tag:drink",
        inventory: 2,
        staples: true,
      });
      /* U5: `--no-staples` turns the pantry staples off. */
      const strict = await run([
        "inventory",
        "make",
        "-tag:drink",
        "--no-staples",
        "--json",
      ]);
      expect(strict.exitCode).toBe(0);
      expect(JSON.parse(strict.stdout)).toMatchObject({
        query: "-tag:drink",
        staples: false,
      });

      /*
       * 41i: `--query` (a dashed value after a space too) and a repeatable
       * `--feature`, as /make features; the editor's saved staples, from a
       * settings directory of the test's own.
       */
      const settingsDirectory = await mkdtemp(join(tmpdir(), "cli-settings-"));
      try {
        await writeFile(
          join(settingsDirectory, "settings.json"),
          JSON.stringify({ makeStaples: ["salt", "gin"] }),
        );
        const featured = await run(
          [
            "inventory",
            "make",
            "--query",
            "-tag:drink",
            "--feature",
            "lime",
            "--feature",
            "gin",
            "--json",
          ],
          { SETTINGS_DIRECTORY: settingsDirectory },
        );
        expect(featured.exitCode).toBe(0);
        expect(JSON.parse(featured.stdout)).toMatchObject({
          query: "-tag:drink",
          scope: "-tag:drink ingredient:lime ingredient:gin",
          features: ["lime", "gin"],
          link: "/make?q=-tag%3Adrink+ingredient%3Alime+ingredient%3Agin",
          alwaysHave: ["salt", "gin"],
          total: 0,
        });
      } finally {
        await rm(settingsDirectory, { recursive: true, force: true });
      }
      const twice = await run([
        "inventory",
        "make",
        "tag:drink",
        "--query",
        "tag:drink",
        "--json",
      ]);
      expect(twice.exitCode).not.toBe(0);
      expect(JSON.parse(twice.stdout).error.code).toBe("usage");

      const usage = await run(["inventory", "add", "--json"]);
      expect(usage.exitCode).not.toBe(0);
      expect(JSON.parse(usage.stdout).error.code).toBe("usage");
    },
    TIMEOUT,
  );

  /*
   * 35c. A bare `shopping` is the list as text (its `--json` the whole read),
   * lines and names are positionals, and `clear` refuses a pipe without
   * `--yes`. Cleared at the end, so the cases around it see no list.
   */
  it(
    "keeps the shopping list: bare list, add, check by name, settings, guarded clear",
    async () => {
      const empty = await run(["shopping"]);
      expect(empty.exitCode).toBe(0);
      expect(empty.stdout.trim()).toBe("The list is empty.");

      const added = await run([
        "shopping",
        "add",
        "2 lemons",
        "paper towels",
        "--json",
      ]);
      expect(added.exitCode).toBe(0);
      expect(JSON.parse(added.stdout)).toMatchObject({
        changed: true,
        added: [
          { text: "2 lemons", manual: true },
          { text: "paper towels", manual: true },
        ],
      });

      const checked = await run(["shopping", "check", "lemons", "--json"]);
      expect(checked.exitCode).toBe(0);
      expect(JSON.parse(checked.stdout).updated).toHaveLength(1);

      const settings = await run([
        "shopping",
        "settings",
        "set",
        "features.aisles",
        "off",
        "--json",
      ]);
      expect(settings.exitCode).toBe(0);
      expect(JSON.parse(settings.stdout).settings.features.aisles).toBe(false);

      const read = await run(["shopping", "--json"]);
      const parsed = JSON.parse(read.stdout);
      expect(Object.keys(parsed).sort()).toEqual([
        "items",
        "path",
        "settings",
        "text",
        "view",
      ]);
      expect(parsed.text).toBe("paper towels");

      const refused = await run(["shopping", "clear", "--all", "--json"]);
      expect(refused.exitCode).not.toBe(0);
      expect(JSON.parse(refused.stdout).error.code).toBe("usage");

      const cleared = await run(["shopping", "clear", "--all", "--yes"]);
      expect(cleared.exitCode).toBe(0);
      expect(cleared.stdout.trim()).toBe("Cleared 2 items; 0 items left");
    },
    /* Seven CLI processes, each a `tsx` start. */
    TIMEOUT * 2,
  );

  /*
   * 40c. `shopping remove --for <slug>` (39-Dc3): what a sub-recipe's
   * expansion added goes, the linking recipe's own line stays. The two
   * recipes and the list go again before the case ends, so the cases below
   * count what they counted.
   */
  it(
    "removes what a sub-recipe added with shopping remove --for",
    async () => {
      for (const recipe of [
        {
          name: "Simple Syrup",
          ingredients: ["1/2 cup sugar", "1/2 cup water"],
        },
        {
          name: "Lemonade",
          ingredients: [
            "1 cup lemon juice",
            "1 batch [Simple Syrup](/recipe/simple-syrup)",
          ],
        },
      ]) {
        const created = await run(
          ["create", "--stdin", "--json"],
          {},
          JSON.stringify(recipe),
        );
        expect(created.exitCode, created.stdout).toBe(0);
      }
      const added = await run([
        "shopping",
        "add",
        "--recipe",
        "lemonade",
        "--json",
      ]);
      expect(JSON.parse(added.stdout).items).toHaveLength(3);

      const both = await run([
        "shopping",
        "remove",
        "--for",
        "simple-syrup",
        "--recipe",
        "lemonade",
        "--json",
      ]);
      expect(both.exitCode).not.toBe(0);
      expect(JSON.parse(both.stdout).error.code).toBe("usage");
      /* An empty slug is a usage slip too (40c review). */
      const empty = await run(["shopping", "remove", "--for", "", "--json"]);
      expect(empty.exitCode).not.toBe(0);
      expect(JSON.parse(empty.stdout).error).toMatchObject({
        code: "usage",
        message: expect.stringContaining("--for needs a slug"),
      });

      const removed = await run([
        "shopping",
        "remove",
        "--for",
        "simple-syrup",
      ]);
      expect(removed.exitCode).toBe(0);
      expect(removed.stdout.trim()).toBe("Removed 2 items");
      const read = await run(["shopping", "--json"]);
      expect(
        JSON.parse(read.stdout).items.map(
          (item: { text: string }) => item.text,
        ),
      ).toEqual(["1 cup lemon juice"]);

      await run(["shopping", "clear", "--all", "--yes"]);
      for (const slug of ["lemonade", "simple-syrup"]) {
        const deleted = await run(["delete", slug, "--yes", "--json"]);
        expect(deleted.exitCode, deleted.stdout).toBe(0);
      }
    },
    /* Ten CLI processes. */
    TIMEOUT * 3,
  );

  /*
   * 31c. The `term` table end to end, one object per call, and the two
   * destructive subcommands refuse a pipe without `--yes`. The tag is taken
   * back off before the case ends, so the cases above stay as they were.
   */
  it(
    "runs the term table: create, assign, get, list, and a guarded delete",
    async () => {
      const created = await run([
        "term",
        "create",
        "--label",
        "Weeknight",
        "--description",
        "Fast enough for a Tuesday.",
        "--json",
      ]);
      expect(created.exitCode).toBe(0);
      expect(JSON.parse(created.stdout)).toMatchObject({
        slug: "weeknight",
        url: "/tags/weeknight",
        tag: "weeknight",
      });

      const assigned = await run([
        "term",
        "assign",
        "weeknight",
        "--add",
        "first-recipe",
        "--json",
      ]);
      expect(assigned.exitCode).toBe(0);
      expect(JSON.parse(assigned.stdout)).toMatchObject({
        updated: ["first-recipe"],
        missing: [],
      });

      /* 32-close: `--add a b` used to write `a` and drop `b` unannounced. */
      const stray = await run([
        "term",
        "assign",
        "weeknight",
        "--add",
        "first-recipe",
        "second-recipe",
        "--json",
      ]);
      expect(stray.exitCode).not.toBe(0);
      expect(JSON.parse(stray.stdout).error).toMatchObject({
        code: "usage",
        message: expect.stringContaining("second-recipe"),
      });

      const got = await run(["term", "get", "weeknight", "--json"]);
      expect(got.exitCode).toBe(0);
      expect(JSON.parse(got.stdout)).toMatchObject({
        slug: "weeknight",
        record: { description: "Fast enough for a Tuesday." },
        counts: { own: 1, withDescendants: 1 },
        recipes: ["first-recipe"],
      });

      const listed = await run(["term", "list", "--records", "--json"]);
      expect(listed.exitCode).toBe(0);
      expect(JSON.parse(listed.stdout).terms).toEqual([
        { slug: "weeknight", label: "Weeknight", count: 1, record: true },
      ]);

      /* Carried, so refused — and without `--yes` it never gets that far. */
      const unconfirmed = await run(["term", "delete", "weeknight", "--json"]);
      expect(JSON.parse(unconfirmed.stdout).error.code).toBe("usage");
      const inUse = await run([
        "term",
        "delete",
        "weeknight",
        "--yes",
        "--json",
      ]);
      expect(inUse.exitCode).toBe(1);
      expect(JSON.parse(inUse.stdout).error).toMatchObject({
        code: "term_in_use",
        recipes: ["first-recipe"],
      });

      const deleted = await run([
        "term",
        "delete",
        "weeknight",
        "--unassign",
        "--yes",
        "--json",
      ]);
      expect(deleted.exitCode).toBe(0);
      expect(JSON.parse(deleted.stdout)).toMatchObject({
        slug: "weeknight",
        deleted: true,
        recipes: ["first-recipe"],
      });
    },
    TIMEOUT * 5,
  );

  /*
   * 32i. `--alias` on create and update: `tag:<alias>` finds the term's
   * carriers, `--clear-aliases` clears, a clash is a validation error. The
   * term goes again before the case ends.
   */
  it(
    "takes --alias on term create / update, and search follows it",
    async () => {
      const created = await run([
        "term",
        "create",
        "--label",
        "Supper",
        "--alias",
        "Dinner Time",
        "--alias",
        "evening meal",
        "--json",
      ]);
      expect(created.exitCode).toBe(0);
      await run(["term", "assign", "supper", "--add", "first-recipe"]);

      const got = await run(["term", "get", "supper", "--json"]);
      expect(JSON.parse(got.stdout)).toMatchObject({
        aliases: ["dinner time", "evening meal"],
      });
      const found = await run(["search", "tag:dinner-time", "--json"]);
      expect(found.exitCode).toBe(0);
      expect(
        JSON.parse(found.stdout).recipes.map(
          (row: { slug: string }) => row.slug,
        ),
      ).toEqual(["first-recipe"]);

      const replaced = await run([
        "term",
        "update",
        "supper",
        "--alias",
        "tea",
        "--json",
      ]);
      expect(replaced.exitCode).toBe(0);
      expect(
        JSON.parse((await run(["term", "get", "supper", "--json"])).stdout)
          .record.aliases,
      ).toEqual(["tea"]);

      const both = await run([
        "term",
        "update",
        "supper",
        "--alias",
        "x",
        "--clear-aliases",
        "--json",
      ]);
      expect(JSON.parse(both.stdout).error.code).toBe("usage");

      const clash = await run([
        "term",
        "update",
        "supper",
        "--alias",
        "supper",
        "--json",
      ]);
      expect(clash.exitCode).toBe(1);
      expect(JSON.parse(clash.stdout).error).toMatchObject({
        code: "validation",
        issues: [{ path: "aliases.0" }],
      });

      const cleared = await run([
        "term",
        "update",
        "supper",
        "--clear-aliases",
        "--json",
      ]);
      expect(cleared.exitCode).toBe(0);
      expect(
        JSON.parse((await run(["term", "get", "supper", "--json"])).stdout),
      ).not.toHaveProperty("aliases");

      const deleted = await run([
        "term",
        "delete",
        "supper",
        "--unassign",
        "--yes",
        "--json",
      ]);
      expect(deleted.exitCode).toBe(0);
    },
    TIMEOUT * 6,
  );

  /*
   * 35-D10. An `--add` of a recipe that does not exist is refused whole;
   * `--force` lets it through as `missing`, and the exit code still says so.
   */
  it(
    "refuses term assign of an unknown recipe, and exits 1 when forced past it",
    async () => {
      const refused = await run([
        "term",
        "assign",
        "d10-check",
        "--add",
        "first-recipe",
        "--add",
        "nope",
        "--json",
      ]);
      expect(refused.exitCode).toBe(1);
      expect(JSON.parse(refused.stdout).error).toMatchObject({
        code: "unknown_recipe",
        recipes: ["nope"],
      });
      const untouched = await run(["show", "first-recipe", "--json"]);
      expect(JSON.parse(untouched.stdout).recipe.tags ?? []).not.toContain(
        "d10-check",
      );

      const forced = await run([
        "term",
        "assign",
        "d10-check",
        "--add",
        "nope",
        "--force",
        "--json",
      ]);
      expect(forced.exitCode).toBe(1);
      expect(JSON.parse(forced.stdout)).toMatchObject({
        updated: [],
        missing: ["nope"],
        warnings: [expect.stringContaining('No recipe "nope"')],
      });
      expect(forced.stderr).toContain('No recipe "nope"');
    },
    TIMEOUT * 3,
  );

  /*
   * 35-D11. The CLI reads `RECIPE_API_TOKEN` from the editor's `.env` — here
   * a file of the test's own through `RECIPE_ENV_FILE` — so `--notify` sends
   * it; the rest of the file (`RECIPE_API_URL`, `CONTENT_DIRECTORY`) is not
   * read, or this local write would have gone to port 9; and a token already
   * in the environment beats the file's.
   */
  it(
    "loads the token from the editor env file for --notify, and nothing else",
    async () => {
      const seen: (string | undefined)[] = [];
      const editor = createServer((request, response) => {
        if (request.method === "POST" && request.url === "/api/revalidate") {
          seen.push(request.headers.authorization);
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}");
      });
      await new Promise<void>((resolve) =>
        editor.listen(0, "127.0.0.1", resolve),
      );
      const editorUrl = `http://127.0.0.1:${(editor.address() as AddressInfo).port}`;
      const envDirectory = await mkdtemp(join(tmpdir(), "cli-env-"));
      const envFile = join(envDirectory, ".env");
      await writeFile(
        envFile,
        [
          "RECIPE_API_TOKEN=rcp_from_file",
          "RECIPE_API_URL=http://127.0.0.1:9",
          "CONTENT_DIRECTORY=/nonexistent",
        ].join("\n"),
      );
      const notify = (token?: string) =>
        execa(
          "pnpm",
          [
            "exec",
            "tsx",
            "cli/index.ts",
            "term",
            "assign",
            "d11-check",
            "--remove",
            "first-recipe",
            "--notify",
            "--editor-url",
            editorUrl,
            "--json",
            "--content-dir",
            contentDirectory,
          ],
          {
            cwd: EDITOR_DIR,
            reject: false,
            env: {
              ...process.env,
              CONTENT_DIRECTORY: undefined,
              RECIPE_API_URL: undefined,
              RECIPE_API_TOKEN: token,
              RECIPE_EDITOR_URL: undefined,
              RECIPE_ENV_FILE: envFile,
            },
          },
        );
      try {
        /* `""` is unset, as `.mcp.json` passes it (T27). */
        const fromFile = await notify("");
        expect(fromFile.exitCode).toBe(0);
        expect(JSON.parse(fromFile.stdout)).toMatchObject({
          unchanged: ["first-recipe"],
        });
        expect(fromFile.stderr).toContain("Notified");

        const fromEnv = await notify("rcp_from_env");
        expect(fromEnv.exitCode).toBe(0);
        expect(seen).toEqual(["Bearer rcp_from_file", "Bearer rcp_from_env"]);
      } finally {
        await new Promise((resolve) => editor.close(resolve));
        await rm(envDirectory, { recursive: true, force: true });
      }
    },
    TIMEOUT * 2,
  );
});

/*
 * 26b. The import tooling through real processes, against a static server
 * this test starts on 127.0.0.1 — `fetch` cannot be stubbed in a child, and
 * these must not touch the network.
 */
describe("import tooling as a process (26b)", () => {
  let server: Server;
  let origin: string;
  let scratch: string;

  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), "cli-26b-"));
    server = createServer((request, response) => {
      const page = (body: string) => {
        response.writeHead(200, { "content-type": "text/html" });
        response.end(body);
      };
      switch (request.url) {
        case "/paper-plane.html":
          return page(
            [
              "<html><head>",
              "<title>Paper Plane | Test Bar</title>",
              `<script type="application/ld+json">${JSON.stringify({
                "@type": "Recipe",
                name: "Paper Plane",
                recipeIngredient: ["3/4 oz bourbon", "3/4 oz Aperol"],
                recipeInstructions: "Shake with ice. Strain into a coupe.",
                recipeYield: 1,
                image: [`${origin}/plane-225x225.png`, `${origin}/plane.png`],
              })}</script>`,
              "</head><body></body></html>",
            ].join(""),
          );
        /* 34f: a roundup of three cocktails, two of them new. */
        case "/bar-roundup.html":
          return page(
            [
              "<html><head><title>Bar Classics | Test Bar</title></head><body>",
              "<article><h1>Three Bar Classics</h1><div class='entry-content'>",
              ...[
                ["last-word", "The Last Word"],
                ["naked-and-famous", "Naked and Famous"],
                ["paper-plane", "Paper Plane"],
              ].map(
                ([slug, name]) =>
                  `<div><a href="${origin}/${slug}.html"><img src="${origin}/c/${slug}.jpg"></a><h2>${name}</h2></div>`,
              ),
              "</div></article></body></html>",
            ].join(""),
          );
        case "/last-word.html":
        case "/naked-and-famous.html":
          return page(
            `<html><head><script type="application/ld+json">${JSON.stringify({
              "@type": "Recipe",
              name:
                request.url === "/last-word.html"
                  ? "Last Word"
                  : "Naked and Famous",
              recipeIngredient: ["3/4 oz lime juice"],
              recipeInstructions: "Shake with ice.",
            })}</script></head><body></body></html>`,
          );
        /* 36b: an old post with no Recipe node, and a model to read it. */
        case "/old-scones.html":
          return page(
            [
              "<html><head><title>Old Scones</title></head><body><article>",
              "<h1>Old Scones</h1><h2>Ingredients</h2><ul>",
              "<li>2 cups flour</li><li>1/2 cup cold butter</li>",
              "<li>3/4 cup cream</li></ul><h2>Method</h2>",
              "<p>Rub in the butter, stir in the cream, bake.</p>",
              "</article></body></html>",
            ].join(""),
          );
        /* 36e: the stand-in model, which reads what it is sent. */
        case "/multi/api/chat": {
          const chunks: Buffer[] = [];
          request.on("data", (chunk: Buffer) => chunks.push(chunk));
          request.on("end", () => {
            response.writeHead(200, { "content-type": "application/json" });
            response.end(
              JSON.stringify(
                standInChat(JSON.parse(Buffer.concat(chunks).toString())),
              ),
            );
          });
          return;
        }
        /* 38e: the stand-in again, transcribing the fixture card by hash. */
        case "/photo/api/chat": {
          const chunks: Buffer[] = [];
          request.on("data", (chunk: Buffer) => chunks.push(chunk));
          request.on("end", async () => {
            const transcripts = await photoTranscripts(PHOTO_FIXTURES);
            response.writeHead(200, { "content-type": "application/json" });
            response.end(
              JSON.stringify(
                standInChat(JSON.parse(Buffer.concat(chunks).toString()), {
                  transcripts,
                }),
              ),
            );
          });
          return;
        }
        case "/photo/api/ps":
        case "/photo/api/generate":
          response.writeHead(200, { "content-type": "application/json" });
          return response.end("{}");
        case "/api/chat":
          response.writeHead(200, { "content-type": "application/json" });
          return response.end(
            JSON.stringify({
              model: "qwen3:8b",
              done: true,
              message: {
                role: "assistant",
                content: JSON.stringify({
                  found: true,
                  name: "Old Scones",
                  ingredients: [
                    "2 cups flour",
                    "1/2 cup cold butter",
                    "3/4 cup cream",
                  ],
                  instructions: ["Rub in the butter, stir in the cream, bake."],
                }),
              },
            }),
          );
        case "/plane.png":
        case "/plane-225x225.png":
          response.writeHead(200, { "content-type": "image/png" });
          return response.end("png bytes");
        default:
          response.writeHead(404, { "content-type": "text/html" });
          return response.end("<html>Not found</html>");
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(scratch, { recursive: true, force: true });
  });

  async function commitCount() {
    return Number(
      (
        await simpleGit({ baseDir: contentDirectory }).raw([
          "rev-list",
          "--count",
          "HEAD",
        ])
      ).trim(),
    );
  }

  it(
    "inspects a page: a markup-free draft and the full-size image first",
    async () => {
      const result = await run([
        "inspect",
        `${origin}/paper-plane.html`,
        "--json",
      ]);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toMatchObject({ status: 200, partial: false });
      expect(parsed.images[0].url).toBe(`${origin}/plane.png`);
      expect(parsed.draft).toEqual({
        name: "Paper Plane",
        recipeYield: "1",
        ingredients: ["3/4 oz bourbon", "3/4 oz Aperol"],
        instructions: ["Shake with ice.", "Strain into a coupe."],
        source: { url: `${origin}/paper-plane.html`, name: "127.0.0.1" },
        imageImportUrl: `${origin}/plane.png`,
      });
    },
    TIMEOUT,
  );

  it(
    "runs the tweak loop: dry-run --out, edit, create --dry-run, create",
    async () => {
      const before = await commitCount();
      const draftPath = join(scratch, "d.json");
      const dry = await run([
        "import",
        `${origin}/paper-plane.html`,
        "--dry-run",
        "--out",
        draftPath,
        "--json",
      ]);
      expect(dry.exitCode).toBe(0);
      /* A dry run wrote nothing, so it warns about no stale editor either. */
      expect(dry.stderr).not.toContain("stale");
      expect(JSON.parse(dry.stdout).image).toMatchObject({
        filename: "plane.png",
        contentType: "image/png",
      });

      const draft = JSON.parse(await readFile(draftPath, "utf8"));
      draft.name = "Paper Plane (Test Bar)";
      draft.tags = ["drink"];
      draft.drink = { method: "shake", glass: "coupe" };
      await writeFile(draftPath, JSON.stringify(draft));

      const check = await run([
        "create",
        "--file",
        draftPath,
        "--dry-run",
        "--json",
      ]);
      expect(check.exitCode).toBe(0);
      expect(JSON.parse(check.stdout)).toMatchObject({
        dryRun: true,
        slug: "paper-plane-test-bar",
        conflict: false,
        recipe: { image: "plane.png", drink: { method: "shake" } },
      });
      expect(await commitCount()).toBe(before);

      const created = await run(["create", "--file", draftPath, "--json"]);
      expect(created.exitCode).toBe(0);
      expect(JSON.parse(created.stdout).slug).toBe("paper-plane-test-bar");
      expect(await commitCount()).toBe(before + 1);
      expect(
        await readFile(
          join(
            contentDirectory,
            "uploads/recipe/paper-plane-test-bar/uploads/plane.png",
          ),
          "utf8",
        ),
      ).toBe("png bytes");
    },
    TIMEOUT * 2,
  );

  it(
    "sets an image from a file and clears it, one commit each",
    async () => {
      const picture = join(scratch, "new photo.jpg");
      await writeFile(picture, "jpeg bytes");
      const repo = simpleGit({ baseDir: contentDirectory });
      const before = await commitCount();

      const set = await run([
        "image",
        "first-recipe",
        "--file",
        picture,
        "--json",
      ]);
      expect(set.exitCode).toBe(0);
      expect(JSON.parse(set.stdout)).toMatchObject({
        slug: "first-recipe",
        image: "new-photo.jpg",
      });
      expect(await commitCount()).toBe(before + 1);
      expect((await repo.log({ maxCount: 1 })).latest?.message).toBe(
        "Update recipe image: first-recipe",
      );
      const uploadsDir = join(
        contentDirectory,
        "uploads/recipe/first-recipe/uploads",
      );
      expect(await readFile(join(uploadsDir, "new-photo.jpg"), "utf8")).toBe(
        "jpeg bytes",
      );

      const cleared = await run(["image", "first-recipe", "--clear", "--json"]);
      expect(cleared.exitCode).toBe(0);
      expect(JSON.parse(cleared.stdout)).toMatchObject({
        image: null,
        previous: "new-photo.jpg",
      });
      expect(await commitCount()).toBe(before + 2);
      expect(await pathExists(join(uploadsDir, "new-photo.jpg"))).toBe(false);

      const usage = await run(["image", "first-recipe", "--json"]);
      expect(JSON.parse(usage.stdout).error.code).toBe("usage");
    },
    TIMEOUT * 2,
  );

  /* 36b: `--llm`, and the model's URL from the editor env file. */
  it(
    "takes --llm, and finds the local model through the editor env file",
    async () => {
      const url = `${origin}/old-scones.html`;
      const bad = await run([
        "import",
        url,
        "--dry-run",
        "--llm",
        "maybe",
        "--json",
      ]);
      expect(bad.exitCode).toBe(1);
      expect(JSON.parse(bad.stdout).error).toMatchObject({
        code: "usage",
        message: expect.stringContaining("--llm takes auto, force, off"),
      });

      /* No model anywhere: auto is today's partial, force is refused. */
      const auto = await run(["import", url, "--dry-run", "--json"]);
      expect(auto.exitCode).toBe(0);
      const autoResult = JSON.parse(auto.stdout);
      expect(autoResult.partial).toBe(true);
      expect(autoResult.llm).toBeUndefined();
      const force = await run([
        "import",
        url,
        "--dry-run",
        "--llm",
        "force",
        "--json",
      ]);
      expect(force.exitCode).toBe(1);
      expect(JSON.parse(force.stdout).error).toMatchObject({
        code: "import_failed",
        message: "no local model configured (RECIPE_LLM_URL)",
      });

      /* The model's URL from the file (EDITOR_ENV_KEYS): auto fills it. */
      const envFile = join(scratch, "llm.env");
      await writeFile(
        envFile,
        [`RECIPE_LLM_URL=${origin}`, "RECIPE_LLM_MODEL=qwen3:8b"].join("\n"),
      );
      const withModel = { RECIPE_ENV_FILE: envFile };
      const filled = await run(
        ["import", url, "--dry-run", "--json"],
        withModel,
      );
      expect(filled.exitCode).toBe(0);
      const filledResult = JSON.parse(filled.stdout);
      expect(filledResult.partial).toBeUndefined();
      expect(filledResult.llm).toMatchObject({
        model: "qwen3:8b",
        mode: "auto",
        found: true,
        grounded: 3,
        total: 3,
      });
      expect(filledResult.draft.ingredients).toEqual([
        "2 cups flour",
        "1/2 cup cold butter",
        "3/4 cup cream",
      ]);

      const inspected = await run(
        ["inspect", url, "--llm", "off", "--json"],
        withModel,
      );
      expect(inspected.exitCode).toBe(0);
      expect(JSON.parse(inspected.stdout)).toMatchObject({ partial: true });
      expect(JSON.parse(inspected.stdout).llm).toBeUndefined();
    },
    TIMEOUT * 3,
  );

  /* 36c: `import --text <file|->`, a pasted recipe read by the model. */
  it(
    "imports pasted text from stdin or a file, and refuses a URL with it",
    async () => {
      const text = [
        "Old Scones from my grandmother — use code SCONE10 for 10% off!",
        "0:00 Intro",
        "2 cups flour",
        "1/2 cup cold butter",
        "3/4 cup cream",
        "Rub in the butter, stir in the cream, bake.",
        "Follow me @oldscones",
      ].join("\n");
      const url = `${origin}/old-scones.html`;

      /* No model anywhere: import_failed, before anything else. */
      const none = await run(["import", "--text", "-", "--json"], {}, text);
      expect(none.exitCode).toBe(1);
      expect(JSON.parse(none.stdout).error).toMatchObject({
        code: "import_failed",
        message: "no local model configured (RECIPE_LLM_URL)",
      });

      const envFile = join(scratch, "llm-text.env");
      await writeFile(
        envFile,
        [`RECIPE_LLM_URL=${origin}`, "RECIPE_LLM_MODEL=qwen3:8b"].join("\n"),
      );
      const withModel = { RECIPE_ENV_FILE: envFile };

      const both = await run(
        ["import", url, "--text", "-", "--json"],
        withModel,
        text,
      );
      expect(both.exitCode).toBe(1);
      expect(JSON.parse(both.stdout).error).toMatchObject({
        code: "usage",
        message: expect.stringContaining("not both"),
      });
      const sourceOnly = await run(
        ["import", url, "--source", url, "--json"],
        withModel,
      );
      expect(JSON.parse(sourceOnly.stdout).error.code).toBe("usage");
      const withLlm = await run(
        ["import", "--text", "-", "--llm", "off", "--json"],
        withModel,
        text,
      );
      expect(JSON.parse(withLlm.stdout).error.code).toBe("usage");
      const empty = await run(
        ["import", "--text", "-", "--json"],
        withModel,
        "  \n",
      );
      expect(JSON.parse(empty.stdout).error.code).toBe("validation");

      /* From stdin: a dry run, cited to the source, nothing fetched. */
      const dry = await run(
        [
          "import",
          "--text",
          "-",
          "--source",
          `${origin}/my-email`,
          "--dry-run",
          "--json",
        ],
        withModel,
        text,
      );
      expect(dry.exitCode).toBe(0);
      const dryResult = JSON.parse(dry.stdout);
      expect(dryResult).toMatchObject({
        dryRun: true,
        pastedText: true,
        url: `${origin}/my-email`,
        slug: "old-scones",
        llm: { model: "qwen3:8b", mode: "force", grounded: 3, total: 3 },
        draft: {
          name: "Old Scones",
          ingredients: ["2 cups flour", "1/2 cup cold butter", "3/4 cup cream"],
          source: { url: `${origin}/my-email` },
        },
      });
      expect(dryResult.partial).toBeUndefined();

      /* From a file: a create, and the commit says how it was read. */
      const file = join(scratch, "scones.txt");
      await writeFile(file, text);
      const created = await run(
        ["import", "--text", file, "--tags", "baking", "--json"],
        withModel,
      );
      expect(created.exitCode).toBe(0);
      expect(JSON.parse(created.stdout)).toMatchObject({
        slug: "old-scones",
        llm: { mode: "force", found: true },
      });
      const latest = (
        await simpleGit({ baseDir: contentDirectory }).log({ maxCount: 1 })
      ).latest;
      expect(latest?.message).toBe(
        "Create recipe: old-scones (local model, pasted text)",
      );
    },
    TIMEOUT * 3,
  );

  /* 36e: a paste holding two recipes — refused, then --pick / --all. */
  it(
    "refuses a several-recipe import without --all or --pick, then takes them",
    async () => {
      const text = [
        "LEMON CAKE",
        "200g flour",
        "100g sugar",
        "",
        "Mix and bake.",
        "",
        "LEMON GLAZE",
        "100g icing sugar",
        "20g lemon juice",
        "",
        "Whisk and pour over the cake.",
      ].join("\n");
      const envFile = join(scratch, "llm-multi.env");
      await writeFile(envFile, `RECIPE_LLM_URL=${origin}/multi\n`);
      const withModel = { RECIPE_ENV_FILE: envFile };

      const refused = await run(
        ["import", "--text", "-", "--json"],
        withModel,
        text,
      );
      expect(refused.exitCode).toBe(1);
      expect(JSON.parse(refused.stdout).error).toMatchObject({
        code: "usage",
        message: expect.stringContaining("1. Lemon Cake, 2. Lemon Glaze"),
      });
      const both = await run(
        ["import", "--text", "-", "--all", "--pick", "1", "--json"],
        withModel,
        text,
      );
      expect(JSON.parse(both.stdout).error.code).toBe("usage");
      /* --as-one reads it as one: no pick with it (36e review). */
      const asOneAll = await run(
        ["import", "--text", "-", "--as-one", "--all", "--json"],
        withModel,
        text,
      );
      expect(JSON.parse(asOneAll.stdout).error).toMatchObject({
        code: "usage",
        message: expect.stringContaining("--as-one"),
      });

      /* A dry run shows them all; --out writes a draft each. */
      const out = join(scratch, "lemon.json");
      const dry = await run(
        ["import", "--text", "-", "--dry-run", "--out", out, "--json"],
        withModel,
        text,
      );
      expect(dry.exitCode).toBe(0);
      expect(JSON.parse(dry.stdout)).toMatchObject({
        batch: true,
        dryRun: true,
        found: [
          { n: 1, name: "Lemon Cake" },
          { n: 2, name: "Lemon Glaze" },
        ],
      });
      expect(
        JSON.parse(await readFile(join(scratch, "lemon-2.json"), "utf8")),
      ).toMatchObject({ name: "Lemon Glaze" });

      const picked = await run(
        ["import", "--text", "-", "--pick", "lemon glaze", "--json"],
        withModel,
        text,
      );
      expect(picked.exitCode).toBe(0);
      expect(JSON.parse(picked.stdout).recipes).toEqual([
        expect.objectContaining({
          n: 2,
          status: "imported",
          slug: "lemon-glaze",
        }),
      ]);
      const latest = (
        await simpleGit({ baseDir: contentDirectory }).log({ maxCount: 1 })
      ).latest;
      expect(latest?.message).toBe(
        "Create recipe: lemon-glaze (local model, pasted text, 2 of 2)",
      );

      /* --all: the glaze is there now, so that pick fails and the exit says so. */
      const all = await run(
        ["import", "--text", "-", "--all"],
        withModel,
        text,
      );
      expect(all.exitCode).toBe(1);
      expect(all.stdout).toContain("2 recipes found");
      expect(all.stdout).toMatch(/1\.\s+imported\s+lemon-cake/);
      expect(all.stdout).toMatch(/2\.\s+failed\s+slug_conflict/);
    },
    TIMEOUT * 3,
  );

  /* 38e: `import --photo`, a recipe card read by the vision model. */
  it(
    "imports a photo: transcribed, read, and with --photo-as-image its picture",
    async () => {
      const card = join(PHOTO_FIXTURES, "oat-cookie-card.jpg");
      const envFile = join(scratch, "llm-photo.env");
      await writeFile(
        envFile,
        [
          `RECIPE_LLM_URL=${origin}/photo`,
          "RECIPE_LLM_VISION_MODEL=qwen2.5vl:7b",
        ].join("\n"),
      );
      const withVision = { RECIPE_ENV_FILE: envFile };

      /* The flags' own rules, before anything is read. */
      const both = await run(
        ["import", "--photo", card, "--text", "-", "--json"],
        withVision,
        "x",
      );
      expect(JSON.parse(both.stdout).error).toMatchObject({
        code: "usage",
        message: "import takes --text or --photo, not both.",
      });
      const five = await run(
        ["import", "--photo", card, card, card, card, card, "--json"],
        withVision,
      );
      expect(JSON.parse(five.stdout).error.message).toMatch(
        /^--photo takes at most 4 photos/,
      );
      const asImage = await run(
        ["import", `${origin}/old-scones.html`, "--photo-as-image", "--json"],
        withVision,
      );
      expect(JSON.parse(asImage.stdout).error.message).toBe(
        "--photo-as-image goes with --photo.",
      );
      /* No vision model: usage, naming the variable. */
      const off = await run(["import", "--photo", card, "--dry-run", "--json"]);
      expect(off.exitCode).toBe(1);
      expect(JSON.parse(off.stdout).error).toMatchObject({
        code: "usage",
        message: expect.stringContaining("RECIPE_LLM_VISION_MODEL"),
      });

      const dry = await run(
        ["import", "--photo", card, "--dry-run", "--json"],
        withVision,
      );
      expect(dry.exitCode).toBe(0);
      expect(JSON.parse(dry.stdout)).toMatchObject({
        dryRun: true,
        photos: 1,
        transcription: expect.stringContaining("3 cups rolled oats"),
        slug: "grandmas-oat-cookies",
        llm: { mode: "force", grounded: 4, total: 4 },
      });
      /* The human output prints the transcription. */
      const human = await run(
        ["import", "--photo", card, "--dry-run"],
        withVision,
      );
      expect(human.stdout).toContain("dry run: 1 photo");
      expect(human.stdout).toContain("transcription:\n  Grandma's Oat Cookies");

      const before = await commitCount();
      const created = await run(
        ["import", "--photo", card, "--photo-as-image", "--json"],
        withVision,
      );
      expect(created.exitCode).toBe(0);
      expect(JSON.parse(created.stdout)).toMatchObject({
        slug: "grandmas-oat-cookies",
        photos: 1,
      });
      expect(await commitCount()).toBe(before + 2);
      const log = await simpleGit({ baseDir: contentDirectory }).log({
        maxCount: 2,
      });
      expect(log.all.map((entry) => entry.message)).toEqual([
        "Update recipe image: grandmas-oat-cookies",
        "Create recipe: grandmas-oat-cookies (local model, photo)",
      ]);
    },
    TIMEOUT * 3,
  );

  /* 34f: roundup import, as a process. Loopback, so nothing is paced. */
  it(
    "lists a roundup, then imports picks with a term: a commit each, one for the term",
    async () => {
      const url = `${origin}/bar-roundup.html`;
      const listed = await run(["inspect-list", url, "--json"]);
      expect(listed.exitCode).toBe(0);
      const list = JSON.parse(listed.stdout);
      expect(list).toMatchObject({
        title: "Three Bar Classics",
        source: "links",
      });
      expect(list.items.map((item: { name: string }) => item.name)).toEqual([
        "The Last Word",
        "Naked and Famous",
        "Paper Plane",
      ]);

      const before = await commitCount();
      const imported = await run([
        "import-list",
        url,
        "--pick",
        "1-2",
        "--term",
        "bar-classics",
        "--json",
      ]);
      expect(imported.exitCode).toBe(0);
      const result = JSON.parse(imported.stdout);
      expect(
        result.results.map((r: { slug: string; status: string }) => [
          r.slug,
          r.status,
        ]),
      ).toEqual([
        ["last-word", "imported"],
        ["naked-and-famous", "imported"],
      ]);
      expect(result.term).toMatchObject({
        slug: "bar-classics",
        label: "Three Bar Classics",
        created: true,
        updated: ["last-word", "naked-and-famous"],
      });
      expect(await commitCount()).toBe(before + 3);
      expect(
        (await simpleGit({ baseDir: contentDirectory }).log({ maxCount: 1 }))
          .latest?.message,
      ).toBe("Create term: bar-classics (+2 recipes)");
      /* A write: the stale-editor hint goes to stderr, never stdout. */
      expect(imported.stderr).toContain("stale");

      const usage = await run(["import-list", url, "--json"]);
      expect(usage.exitCode).toBe(1);
      expect(JSON.parse(usage.stdout).error.code).toBe("usage");
    },
    TIMEOUT * 2,
  );

  /* 32c: `term image`, the same three sources on a term record. */
  it(
    "sets a term's picture from a file and a URL and clears it, one commit each",
    async () => {
      const picture = join(scratch, "cookie tin.png");
      await writeFile(picture, "png bytes");
      const repo = simpleGit({ baseDir: contentDirectory });

      const missing = await run([
        "term",
        "image",
        "tin-cookies",
        "--file",
        picture,
        "--json",
      ]);
      expect(JSON.parse(missing.stdout).error.code).toBe("not_found");

      const created = await run([
        "term",
        "create",
        "--label",
        "Tin Cookies",
        "--json",
      ]);
      expect(created.exitCode).toBe(0);
      const before = await commitCount();

      const set = await run([
        "term",
        "image",
        "tin-cookies",
        "--file",
        picture,
        "--json",
      ]);
      expect(set.exitCode).toBe(0);
      expect(JSON.parse(set.stdout)).toMatchObject({
        slug: "tin-cookies",
        image: "cookie-tin.png",
        url: "/tags/tin-cookies",
      });
      expect(await commitCount()).toBe(before + 1);
      expect((await repo.log({ maxCount: 1 })).latest?.message).toBe(
        "Update term image: tin-cookies",
      );
      const uploadsDir = join(
        contentDirectory,
        "uploads/tag-term/tin-cookies/uploads",
      );
      expect(await readFile(join(uploadsDir, "cookie-tin.png"), "utf8")).toBe(
        "png bytes",
      );

      const fromUrl = await run([
        "term",
        "image",
        "tin-cookies",
        "--url",
        `${origin}/plane.png`,
        "--json",
      ]);
      expect(fromUrl.exitCode).toBe(0);
      expect(JSON.parse(fromUrl.stdout)).toMatchObject({
        image: "plane.png",
        previous: "cookie-tin.png",
      });
      expect(await commitCount()).toBe(before + 2);

      const cleared = await run([
        "term",
        "image",
        "tin-cookies",
        "--clear",
        "--json",
      ]);
      expect(cleared.exitCode).toBe(0);
      expect(JSON.parse(cleared.stdout)).toMatchObject({
        image: null,
        previous: "plane.png",
      });
      expect(await commitCount()).toBe(before + 3);
      expect(await pathExists(join(uploadsDir, "plane.png"))).toBe(false);

      const usage = await run(["term", "image", "tin-cookies", "--json"]);
      expect(JSON.parse(usage.stdout).error.code).toBe("usage");
    },
    TIMEOUT * 3,
  );
});
