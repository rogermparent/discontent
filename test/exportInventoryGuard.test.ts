// @vitest-environment node
//
// Usability pass, U6: the public export never carries the operator's saved
// inventory (`<content>/inventory/on-hand.json`). 25c/D10 already kept the
// export's `/make` browser-only; `/drinks` (U3) adds a make panel and a
// secondary group, so this pins the rule for every export route at once.
//
// Statically, in a second rather than a build: walk the import graph of
// every module under `export/src/app` — relative imports, `@/`, and
// `recipe-website-common/` — and fail if it reaches editor code or anything
// that names the inventory file or its reader. The export can only bake what
// one of its modules reads, so a module graph without a reader is an export
// without the list. It complements 25c's text scan in `inventory.test.ts`
// (no common/ or export/ file names the file), which a reader hidden behind
// an editor import would slip past. The opt-in "Share my saved inventory on
// the export" reaches the export only as the build-time snapshot variable;
// `exportHouseInventory.test.ts` pins both halves of that (off → absent,
// on → present).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { secondaryInventory } from "../websites/recipe-website/common/controller/secondaryInventory";

const site = resolve(__dirname, "../websites/recipe-website");
const exportSrc = join(site, "export/src");
const common = join(site, "common");
const editor = join(site, "editor");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** The code, less comments: a docstring may mention the file by name. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const SPECIFIERS = [
  /(?:import|export)\s[^;]*?\sfrom\s*["']([^"']+)["']/g,
  /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  /^\s*import\s*["']([^"']+)["']/gm,
];

function resolveFile(base: string): string | undefined {
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return undefined;
}

/** A local module's path, `editor` for the editor package, else nothing. */
function resolveSpecifier(from: string, specifier: string) {
  if (specifier.startsWith("recipe-editor")) return "editor";
  let base: string | undefined;
  if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else if (specifier.startsWith("@/"))
    base = join(exportSrc, specifier.slice(2));
  else if (specifier.startsWith("recipe-website-common/")) {
    base = join(common, specifier.slice("recipe-website-common/".length));
  }
  return base && resolveFile(base);
}

function reachable(entries: string[]) {
  const seen = new Set<string>();
  const editorImports: string[] = [];
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = code(file);
    for (const pattern of SPECIFIERS) {
      for (const match of text.matchAll(pattern)) {
        const target = resolveSpecifier(file, match[1]);
        if (target === "editor") editorImports.push(`${file} → ${match[1]}`);
        else if (target) queue.push(target);
      }
    }
  }
  return { files: [...seen], editorImports };
}

const { files, editorImports } = reachable(walk(join(exportSrc, "app")));
const rel = (path: string) => relative(site, path);

describe("the export never carries the saved inventory (U6)", () => {
  it("walks the drinks and make pages", () => {
    const reached = files.map(rel);
    expect(reached).toContain("export/src/app/(recipes)/drinks/page.tsx");
    expect(reached).toContain("common/components/DrinksPage/MakePanel.tsx");
    expect(reached).toContain("common/controller/secondaryInventory.ts");
    expect(reached).toContain("common/components/MakePage/index.tsx");
  });

  it("reaches no editor code", () => {
    expect(editorImports).toEqual([]);
    expect(files.filter((file) => file.startsWith(editor)).map(rel)).toEqual(
      [],
    );
  });

  it("reaches nothing that reads the inventory file", () => {
    const readers = files.filter((file) =>
      /on-hand\.json|INVENTORY_FILE|readInventory\b|["'`]inventory\/|join\([^)]*["']inventory["']/.test(
        code(file),
      ),
    );
    expect(readers.map(rel)).toEqual([]);
  });

  it("does not depend on the editor package", () => {
    const manifest = JSON.parse(
      readFileSync(join(site, "export/package.json"), "utf8"),
    ) as Record<string, Record<string, string> | undefined>;
    expect({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).not.toHaveProperty("recipe-editor");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("asks the secondary helper for nothing, and gets nothing", async () => {
    /* With the share option off the export build sets the snapshot empty. */
    vi.stubEnv("SITE_HOUSE_INVENTORY", "");
    await expect(secondaryInventory()).resolves.toBeUndefined();
    await expect(
      secondaryInventory(async () => ["gin"]),
    ).resolves.toMatchObject({ items: ["gin"] });
  });
});
