// @vitest-environment node
//
// Usability pass, U6: the operator's saved inventory reaches the static export
// only when they opt in ("Share my saved inventory on the export", off by
// default), and then only as the build-time `SITE_HOUSE_INVENTORY` snapshot.
//
// Both ways:
// - off → the editor's export build never reads the list, and sets the
//   variable empty (so one inherited from the editor's own environment can't
//   leak through); every export page that asks for a secondary list gets
//   nothing;
// - on → the variable carries exactly the saved list, and the export's pages
//   get it back as the "house inventory" group.
//
// The variable is the only road: no export/ or common/ module may read it
// except `secondaryInventory.ts`, and no export/ module may reach the
// editor's build-env code. 25d's text scan in `inventory.test.ts` keeps the
// inventory file itself out of common/ and export/.

import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HOUSE_INVENTORY_ENV,
  HOUSE_INVENTORY_LABEL,
  houseInventory,
  SAVED_INVENTORY_LABEL,
  secondaryInventory,
} from "../websites/recipe-website/common/controller/secondaryInventory";
import { exportBuildEnv } from "../websites/recipe-website/editor/controller/exportEnv";

const SAVED = ["Gnista", "orange bitters", "simple syrup"];

describe("the export build's environment (U6)", () => {
  it("off by default: never reads the list, and sets the snapshot empty", async () => {
    const read = vi.fn(async () => SAVED);
    for (const settings of [{}, { shareInventoryOnExport: false }]) {
      const env = await exportBuildEnv(settings, read);
      expect(env[HOUSE_INVENTORY_ENV]).toBe("");
      expect(JSON.stringify(env)).not.toMatch(/Gnista|orange bitters/);
    }
    expect(read).not.toHaveBeenCalled();
  });

  it("on: the snapshot is exactly the saved list", async () => {
    const env = await exportBuildEnv(
      { shareInventoryOnExport: true },
      async () => SAVED,
    );
    expect(JSON.parse(env[HOUSE_INVENTORY_ENV])).toEqual(SAVED);
    /* An empty saved list shares nothing. */
    const empty = await exportBuildEnv(
      { shareInventoryOnExport: true },
      async () => [],
    );
    expect(empty[HOUSE_INVENTORY_ENV]).toBe("");
  });

  it("still bakes the theme and footer as before", async () => {
    const env = await exportBuildEnv(
      { footerNote: "Hi", contact: { email: "a@b.c" } },
      async () => SAVED,
    );
    expect(env).toMatchObject({
      SITE_FOOTER_NOTE: "Hi",
      SITE_CONTACT: JSON.stringify({ email: "a@b.c" }),
    });
    expect(env).not.toHaveProperty("SITE_THEME");
  });
});

describe("what the export's pages get (U6)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("off: no group", async () => {
    expect(houseInventory({})).toBeUndefined();
    expect(houseInventory({ [HOUSE_INVENTORY_ENV]: "" })).toBeUndefined();
    expect(
      houseInventory({ [HOUSE_INVENTORY_ENV]: "not json" }),
    ).toBeUndefined();
    expect(houseInventory({ [HOUSE_INVENTORY_ENV]: "{}" })).toBeUndefined();
    vi.stubEnv(HOUSE_INVENTORY_ENV, "");
    await expect(secondaryInventory()).resolves.toBeUndefined();
  });

  it("on: the house group, for the export and an editor guest alike", async () => {
    const env = await exportBuildEnv(
      { shareInventoryOnExport: true },
      async () => SAVED,
    );
    expect(houseInventory(env)).toEqual({
      label: HOUSE_INVENTORY_LABEL,
      items: SAVED,
    });
    vi.stubEnv(HOUSE_INVENTORY_ENV, env[HOUSE_INVENTORY_ENV]);
    await expect(secondaryInventory()).resolves.toEqual({
      label: HOUSE_INVENTORY_LABEL,
      items: SAVED,
    });
  });

  it("a signed-in editor's saved list wins, and never the snapshot", async () => {
    vi.stubEnv(HOUSE_INVENTORY_ENV, JSON.stringify(["house rum"]));
    await expect(secondaryInventory(async () => ["gin"])).resolves.toEqual({
      label: SAVED_INVENTORY_LABEL,
      items: ["gin"],
    });
    await expect(secondaryInventory(async () => [])).resolves.toBeUndefined();
  });
});

describe("the snapshot variable is the only road (U6)", () => {
  const SITE = resolve(__dirname, "../websites/recipe-website");

  async function sourceFiles(directory: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".next", "out"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
      else if (/\.(tsx?|mjs|js)$/.test(entry.name)) out.push(path);
    }
    return out;
  }

  it("only secondaryInventory.ts reads it, and no export/ file reaches exportEnv", async () => {
    const files = [
      ...(await sourceFiles(join(SITE, "common"))),
      ...(await sourceFiles(join(SITE, "export"))),
    ];
    const readers: string[] = [];
    const editorEnv: string[] = [];
    for (const file of files) {
      /* The code, less comments: a docstring may name the variable. */
      const source = (await readFile(file, "utf8"))
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const name = relative(SITE, file);
      if (
        /SITE_HOUSE_INVENTORY|HOUSE_INVENTORY_ENV\]/.test(source) &&
        name !== "common/controller/secondaryInventory.ts"
      ) {
        readers.push(name);
      }
      if (/exportEnv|recipe-editor\//.test(source)) editorEnv.push(name);
    }
    expect(readers).toEqual([]);
    expect(editorEnv).toEqual([]);
  });

  it.each(["make", "drinks"])(
    "the export's /%s asks for the secondary list with no reader",
    async (route) => {
      const page = await readFile(
        join(SITE, `export/src/app/(recipes)/${route}/page.tsx`),
        "utf8",
      );
      expect(page).toMatch(/secondaryInventory\(\)/);
    },
  );
});
