/*
 * What the indexed description costs at each candidate cap, and what it loses.
 *
 *   CONTENT_DIRECTORY=/path/to/scratch/corpus \
 *     pnpm exec tsx ./scripts/measure-description-cap.ts
 *
 * Sibling of `measure-search-corpus.ts`, and it wants the same input: a scratch
 * copy of the real content repository whose indexes `build-corpus-indexes.ts`
 * has brought up to date. Never the live one — opening an index creates it
 * (§10).
 *
 * Two numbers per cap, because the cap is a trade and not a saving:
 *
 *  - the bytes `search/all` carries, which is what a page load pays;
 *  - how much prose stops being searchable, which is what it costs. A term
 *    past the cap is not merely missing from a subtitle — `description` is a
 *    FlexSearch field, so the term becomes unfindable.
 */
import { readFile } from "fs-extra";
import { resolve } from "node:path";
import { getRecipes } from "recipe-website-common/controller/data/read";
import { flattenMarkdown } from "recipe-website-common/controller/buildIndexValue";

const CAPS = [300, 250, 200, 160, 140, 120, 100, 80];

async function main() {
  const contentDirectory = process.env.CONTENT_DIRECTORY;
  const { recipes } = await getRecipes({ contentDirectory });

  /*
   * The *uncapped* flattened description, read from the content file rather
   * than the index — the index already holds a capped copy, so measuring a
   * larger cap from it would silently report the smaller one.
   */
  const full = new Map<string, string>();
  for (const { slug } of recipes) {
    const path = resolve(
      contentDirectory ?? ".",
      "recipes",
      "data",
      slug,
      "recipe.json",
    );
    try {
      const data = JSON.parse(await readFile(path, "utf8")) as {
        description?: string;
      };
      if (data.description) full.set(slug, flattenMarkdown(data.description));
    } catch {
      // A recipe whose file will not read is one the index will not carry.
    }
  }

  const lengths = [...full.values()]
    .map((text) => text.length)
    .sort((a, b) => a - b);
  const at = (q: number) => lengths[Math.floor((lengths.length - 1) * q)];
  console.log(`recipes:                 ${recipes.length}`);
  console.log(`with a description:      ${lengths.length}`);
  console.log(
    `flattened length:        min ${lengths[0]}, median ${at(0.5)}, p75 ${at(0.75)}, p90 ${at(0.9)}, p99 ${at(0.99)}, max ${lengths[lengths.length - 1]}`,
  );

  const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
  const display = recipes.map(({ ingredients: _ingredients, ...rest }) => rest);
  const withoutDescription = display.map(
    ({ description: _description, ...rest }) => rest,
  );
  const floor = bytes(withoutDescription);

  console.log(`\nsearch/all without any description: ${floor} B`);
  console.log(
    `\n cap | search/all |    KiB | vs 300 | truncated | prose dropped`,
  );
  console.log(
    `-----|------------|--------|--------|-----------|--------------`,
  );

  let baseline = 0;
  for (const cap of CAPS) {
    const capped = display.map(({ description: _description, ...rest }) => {
      const text = full.get(rest.slug)?.slice(0, cap);
      return text ? { ...rest, description: text } : rest;
    });
    const total = bytes(capped);
    if (!baseline) baseline = total;
    const truncated = lengths.filter((length) => length > cap).length;
    const dropped = [...full.values()].reduce(
      (sum, text) => sum + Math.max(0, text.length - cap),
      0,
    );
    console.log(
      ` ${String(cap).padStart(3)} | ${String(total).padStart(10)} | ${(total / 1024).toFixed(1).padStart(6)} | ${(((total - baseline) / baseline) * 100).toFixed(1).padStart(6)}% | ${String(truncated).padStart(9)} | ${String(dropped).padStart(9)} ch`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
