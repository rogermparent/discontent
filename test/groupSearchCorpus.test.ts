// @vitest-environment node
//
// The group search corpus's borrowed thumbnail (epic 30c): ⌘K and `/search`
// render groups on the client, where no member walk can run, so the corpus
// resolves the photo the server `GroupThumbnail` would draw. These pin that it
// is the *same* walk — own image wins, first member with a photo, a sub-group's
// own picture, nothing found, and the six-candidate cap.

import { mkdtemp, readJson, rm, writeJson } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { getGroupSearchCorpus } from "../websites/recipe-website/common/controller/data/readGroupSearchCorpus";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import * as groups from "../websites/recipe-website/editor/controller/curation/groups";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";

let contentDirectory: string;
let ctx: CurationContext;
let previousContentDirectory: string | undefined;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "group-corpus-"));
  ctx = { contentDirectory };
  previousContentDirectory = process.env.CONTENT_DIRECTORY;
  process.env.CONTENT_DIRECTORY = contentDirectory;
});

afterEach(async () => {
  await closeCachedEnvironments();
  if (previousContentDirectory === undefined) {
    delete process.env.CONTENT_DIRECTORY;
  } else {
    process.env.CONTENT_DIRECTORY = previousContentDirectory;
  }
  await rm(contentDirectory, { recursive: true, force: true });
});

/** Give an item a picture by writing the field the corpus reads. */
async function setImage(
  kind: "recipes" | "groups",
  slug: string,
  image: string,
) {
  const file = join(
    contentDirectory,
    kind,
    "data",
    slug,
    kind === "recipes" ? "recipe.json" : "group.json",
  );
  await writeJson(file, { ...(await readJson(file)), image });
}

async function recipes(...names: string[]) {
  for (const name of names) await createRecipe(ctx, { name });
}

async function group(name: string, items: (string | { group: string })[]) {
  await groups.createGroup(
    ctx,
    { name, kind: "meal-plan", items: items as never },
    { force: true },
  );
}

async function entry(slug: string) {
  const corpus = await getGroupSearchCorpus({ contentDirectory });
  const found = corpus.find((candidate) => candidate.slug === slug);
  if (!found) throw new Error(`no corpus entry for ${slug}`);
  return found;
}

describe("the group corpus's borrowed thumbnail (30c)", () => {
  it("borrows nothing when the group has its own image", async () => {
    await recipes("Stew");
    await setImage("recipes", "stew", "stew.jpg");
    await group("Weeknights", ["stew"]);
    await setImage("groups", "weeknights", "cover.jpg");

    const found = await entry("weeknights");
    expect(found.image).toBe("cover.jpg");
    expect(found).not.toHaveProperty("thumbnail");
  });

  it("borrows the first member with a photo, in the group's order", async () => {
    await recipes("Salad", "Stew", "Soup");
    await setImage("recipes", "stew", "stew.jpg");
    await setImage("recipes", "soup", "soup.jpg");
    await group("Weeknights", ["salad", "stew", "soup"]);

    expect((await entry("weeknights")).thumbnail).toEqual({
      uploadsDirectory: "uploads/recipe",
      slug: "stew",
      image: "stew.jpg",
    });
  });

  it("takes a sub-group's own picture where it comes first", async () => {
    await recipes("Stew");
    await setImage("recipes", "stew", "stew.jpg");
    await group("Week One", ["stew"]);
    await setImage("groups", "week-one", "week.jpg");
    await group("All Weeks", [{ group: "week-one" }, "stew"]);

    expect((await entry("all-weeks")).thumbnail).toEqual({
      uploadsDirectory: "uploads/group",
      slug: "week-one",
      image: "week.jpg",
    });
  });

  it("descends into a sub-group without a picture of its own", async () => {
    await recipes("Salad", "Stew");
    await setImage("recipes", "stew", "stew.jpg");
    await group("Week One", ["salad", "stew"]);
    await group("All Weeks", [{ group: "week-one" }]);

    expect((await entry("all-weeks")).thumbnail).toEqual({
      uploadsDirectory: "uploads/recipe",
      slug: "stew",
      image: "stew.jpg",
    });
  });

  it("carries no field when nothing in the walk has a photo", async () => {
    await recipes("Salad", "Stew");
    await group("Weeknights", ["salad", "stew"]);

    expect(await entry("weeknights")).not.toHaveProperty("thumbnail");
  });

  it("looks no further than six candidates, as the server card does", async () => {
    await recipes("R1", "R2", "R3", "R4", "R5", "R6", "R7");
    await setImage("recipes", "r7", "seventh.jpg");
    await group("Long Plan", ["r1", "r2", "r3", "r4", "r5", "r6", "r7"]);

    expect(await entry("long-plan")).not.toHaveProperty("thumbnail");

    await setImage("recipes", "r6", "sixth.jpg");
    expect((await entry("long-plan")).thumbnail?.slug).toBe("r6");
  });
});
