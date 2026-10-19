/*
 * Ingredient names that are probably one thing (43n) — for choosing what
 * `ingredientNames`' synonym and descriptor tables merge next.
 *
 *   pnpm exec tsx ./scripts/measure-ingredient-dupes.ts <content-dir> \
 *     [--top 40] > dupes.md
 *
 * **Read-only, and it opens no index**, like `measure-ingredient-names.ts`:
 * it reads `recipes/data/<slug>/recipe.json` straight off disk, so a scratch
 * clone or the live content repository are both safe. `CONTENT_DIRECTORY`
 * stands in for the argument.
 *
 * Every name is what `parseIngredientList` makes of a line *today* — the
 * table's merges are already applied — and the report shows what is left:
 *
 * 1. **Near duplicates**: names that still differ only by a plural the naive
 *    `singular` missed, by word order, or by a word on `CANDIDATE_WORDS`
 *    (words that often don't change what you buy — kept in names until
 *    someone decides). Grouped, each name with its line and recipe counts.
 * 2. **One word more**: a name and the same name with one leading word —
 *    "feta cheese" and "mild feta cheese" — both in the corpus, by how many
 *    lines the pair covers. Most are real varieties (red onion is not
 *    onion); this is the list to pick merges from.
 * 3. **The table at work**: each `NAME_SYNONYMS` row and `NAME_DESCRIPTORS`
 *    word, and how many lines it rewrote.
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { flattenMarkdown } from "recipe-website-common/controller/buildIndexValue";
import type { Recipe } from "recipe-website-common/controller/types";
import { fold } from "recipe-website-common/components/SearchForm/queryLanguage";
import {
  NAME_DESCRIPTORS,
  NAME_SYNONYMS,
  nameLabel,
  parseIngredientList,
  stripMarkup,
} from "recipe-website-common/util/ingredientNames";

/**
 * Words worth a look as descriptors: candidates only, never applied here.
 * Many of them matter (dark brown sugar is not brown sugar to a baker) — the
 * report shows the pairs, a person decides.
 */
const CANDIDATE_WORDS = new Set([
  "plain",
  "regular",
  "extra",
  "unsweetened",
  "sweetened",
  "unsalted",
  "salted",
  "light",
  "dark",
  "low",
  "sodium",
  "reduced",
  "kosher",
  "fine",
  "coarse",
  "flaky",
  "granulated",
  "ground",
  "canned",
  "frozen",
  "dry",
  "nonfat",
  "lowfat",
  "full",
  "fat",
  "skim",
  "mini",
  "baby",
  "unbleached",
  "bleached",
  "virgin",
  "lean",
  "thick",
  "thin",
  "cut",
  "boneless",
  "skinless",
  "instant",
  "active",
  "sharp",
  "white",
  "yellow",
  "golden",
  "sweet",
  "spicy",
  "smoked",
  "roasted",
  "aged",
]);

interface Seen {
  label: string;
  lines: number;
  recipes: Set<string>;
}

/** Plural endings `singular` leaves on: one more cut, for the comparison only. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function looseKey(words: string[]): string {
  return words
    .map(stem)
    .filter((word) => !CANDIDATE_WORDS.has(word))
    .sort()
    .join(" ");
}

/** Why two names share a loose key: what differs between them. */
function reason(a: string[], b: string[]): string {
  const reasons = new Set<string>();
  const sa = a.map(stem);
  const sb = b.map(stem);
  if (sa.join(" ") === sb.join(" ")) return "plural";
  const extra = [
    ...sa.filter((word) => !sb.includes(word)),
    ...sb.filter((word) => !sa.includes(word)),
  ];
  if (extra.length > 0) reasons.add(`word: ${[...new Set(extra)].join(", ")}`);
  if (
    extra.length === 0 &&
    [...sa].sort().join(" ") === [...sb].sort().join(" ")
  ) {
    reasons.add("word order");
  }
  return [...reasons].join("; ");
}

function folded(line: string): string {
  return fold(stripMarkup(line))
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const args = process.argv.slice(2);
  const topAt = args.indexOf("--top");
  const top = topAt >= 0 ? Number(args[topAt + 1]) : 40;
  const contentDirectory =
    args.find(
      (arg, i) => !arg.startsWith("--") && (topAt < 0 || i !== topAt + 1),
    ) ?? process.env.CONTENT_DIRECTORY;
  if (!contentDirectory) {
    throw new Error("Pass a content directory (or set CONTENT_DIRECTORY)");
  }

  const dataDirectory = resolve(contentDirectory, "recipes", "data");
  const names = new Map<string, Seen>();
  const rewrites = new Map<string, number>();
  let recipeCount = 0;
  let lineCount = 0;
  for (const slug of (await readdir(dataDirectory)).sort()) {
    let recipe: Recipe;
    try {
      recipe = JSON.parse(
        await readFile(resolve(dataDirectory, slug, "recipe.json"), "utf8"),
      ) as Recipe;
    } catch {
      continue;
    }
    recipeCount += 1;
    const ingredients = recipe.ingredients ?? [];
    const lines = ingredients.map(({ ingredient }) =>
      flattenMarkdown(ingredient),
    );
    const headings = ingredients.flatMap(({ type }, i) =>
      type === "heading" ? [i] : [],
    );
    lines.forEach((line, i) => {
      if (headings.includes(i)) return;
      lineCount += 1;
      const text = folded(line);
      for (const [from, to] of NAME_SYNONYMS) {
        if (new RegExp(`\\b(?:${from})\\b`).test(text)) {
          const key = `${from} → ${to}`;
          rewrites.set(key, (rewrites.get(key) ?? 0) + 1);
        }
      }
      for (const word of NAME_DESCRIPTORS) {
        if (new RegExp(`\\b${word}\\b`).test(text)) {
          const key = `${word} (dropped)`;
          rewrites.set(key, (rewrites.get(key) ?? 0) + 1);
        }
      }
    });
    for (const requirement of parseIngredientList(lines, headings)) {
      for (const name of requirement.alternatives) {
        const label = nameLabel(name);
        const seen = names.get(label) ?? {
          label,
          lines: 0,
          recipes: new Set<string>(),
        };
        seen.lines += 1;
        seen.recipes.add(slug);
        names.set(label, seen);
      }
    }
  }

  const words = (label: string) => label.split(" ");
  const count = (seen: Seen) =>
    `${seen.lines} line${seen.lines === 1 ? "" : "s"} / ${seen.recipes.size}`;

  console.log("# Ingredient near-duplicates\n");
  console.log(
    `${recipeCount} recipes, ${lineCount} lines, ${names.size} distinct names. Counts are lines / recipes.\n`,
  );

  // 1. Near duplicates.
  const groups = new Map<string, Seen[]>();
  for (const seen of names.values()) {
    const key = looseKey(words(seen.label));
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), seen]);
  }
  const near = [...groups.values()]
    .filter((members) => members.length > 1)
    .map((members) => members.sort((a, b) => b.lines - a.lines))
    .sort(
      (a, b) =>
        b.reduce((sum, seen) => sum + seen.lines, 0) -
        a.reduce((sum, seen) => sum + seen.lines, 0),
    );
  console.log(`## 1. Near duplicates (${near.length} groups)\n`);
  console.log("| Names | Lines | Differ by |");
  console.log("| --- | --- | --- |");
  for (const members of near) {
    const [first, ...rest] = members;
    console.log(
      `| ${members.map((seen) => `${seen.label} (${count(seen)})`).join(" · ")} | ${members.reduce((sum, seen) => sum + seen.lines, 0)} | ${rest.map((seen) => reason(words(first.label), words(seen.label))).join(" · ")} |`,
    );
  }

  // 2. One word more.
  const pairs: { short: Seen; long: Seen; word: string }[] = [];
  for (const long of names.values()) {
    const [first, ...tail] = words(long.label);
    if (tail.length === 0) continue;
    const short = names.get(tail.join(" "));
    if (short) pairs.push({ short, long, word: first });
  }
  pairs.sort(
    (a, b) =>
      Math.min(b.short.lines, b.long.lines) -
        Math.min(a.short.lines, a.long.lines) ||
      b.short.lines + b.long.lines - (a.short.lines + a.long.lines),
  );
  console.log(
    `\n## 2. One word more (${pairs.length} pairs; top ${top} by the rarer side)\n`,
  );
  console.log("| Name | With one word more | Word |");
  console.log("| --- | --- | --- |");
  for (const { short, long, word } of pairs.slice(0, top)) {
    console.log(
      `| ${short.label} (${count(short)}) | ${long.label} (${count(long)}) | ${word} |`,
    );
  }

  // 3. The table.
  console.log("\n## 3. The table at work (lines rewritten)\n");
  console.log("| Row | Lines |");
  console.log("| --- | --- |");
  for (const [row, lines] of [...rewrites].sort((a, b) => b[1] - a[1])) {
    console.log(`| \`${row}\` | ${lines} |`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
