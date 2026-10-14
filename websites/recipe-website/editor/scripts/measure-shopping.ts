/*
 * What the shopping list's line readers make of a real corpus (epic 35) — for
 * tuning them.
 *
 *   CONTENT_DIRECTORY=/path/to/content \
 *     pnpm exec tsx ./scripts/measure-shopping.ts [--top 50] [--lines]
 *
 * **Read-only, and it opens no index**: like `measure-ingredient-names.ts`, it
 * reads `recipes/data/<slug>/recipe.json` straight off disk and flattens each
 * line the way `buildRecipeIndexValue` does, so pointing it at the live
 * content repository (the `editor/content` symlink) is safe — it writes
 * nothing anywhere.
 *
 * **Food lines**, the population every percentage is of: every ingredient
 * line of a recipe that is not a drink (no `drink` spec and no `drink` tag),
 * minus stored headings (`type: "heading"`), lines `detectHeading` reads as
 * one, and lines empty once flattened. Drink lines are counted on their own
 * line for reference and kept out of the target.
 *
 * Sections:
 *   - amounts (35a): how many food lines `parseAmount` reads — an amount or
 *     "as needed" — how many carry a unit, how many are as needed (and of
 *     those, how many say so rather than just naming the ingredient), and the
 *     most common lines it can't read. Target: ≥ 90% read.
 *     `--lines` also prints every food line beside its formatted amount.
 *   - aisles (35b): see `measure-aisles.ts`.
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { flattenMarkdown } from "recipe-website-common/controller/buildIndexValue";
import type { Recipe } from "recipe-website-common/controller/types";
import { detectHeading } from "recipe-website-common/util/detectHeading";
import {
  formatAmount,
  isAsNeeded,
  parseAmount,
} from "recipe-website-common/util/ingredientAmount";

interface CorpusLine {
  slug: string;
  text: string;
}

const percent = (part: number, whole: number): string =>
  whole === 0 ? "—" : `${((100 * part) / whole).toFixed(1)}%`;

/** Lines with no digit at all: "as needed" by naming the thing alone. */
const BARE_RE = /^[^\d½¼¾⅓⅔⅛⅜⅝⅞]*$/;

// --- amounts (35a) ---------------------------------------------------------

function measureAmounts(food: CorpusLine[], top: number, lines: boolean) {
  let read = 0;
  let withUnit = 0;
  let asNeeded = 0;
  let bare = 0;
  const unread = new Map<string, number>();
  for (const { slug, text } of food) {
    const amount = parseAmount(text);
    if (lines) {
      console.log(
        `  ${text.padEnd(64).slice(0, 64)} → ${amount ? formatAmount(amount) : "?"}  (${slug})`,
      );
    }
    if (!amount) {
      unread.set(text, (unread.get(text) ?? 0) + 1);
      continue;
    }
    read += 1;
    if (isAsNeeded(amount)) {
      asNeeded += 1;
      if (BARE_RE.test(text)) bare += 1;
    } else if (amount.parts.some((part) => part.family !== "count")) {
      withUnit += 1;
    }
  }

  console.log(`\n## Amounts (35a) — ${food.length} food lines`);
  console.log(`  read (amount or as needed)  ${percent(read, food.length)}`);
  console.log(
    `  with a unit                 ${percent(withUnit, food.length)}`,
  );
  console.log(
    `  as needed                   ${percent(asNeeded, food.length)}`,
  );
  console.log(
    `    of which a bare name      ${percent(bare, food.length)} (no digit in the line)`,
  );
  console.log(
    `  unread                      ${percent(food.length - read, food.length)} (${food.length - read} lines)`,
  );
  console.log(`\n## Unread lines (top ${top})`);
  for (const [text, count] of [...unread]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)) {
    console.log(`  ${String(count).padStart(4)}  ${text}`);
  }
}

// --- aisles (35b) ----------------------------------------------------------
//
// The aisle half has a script of its own: `measure-aisles.ts` (share of food
// lines per aisle, and the names left in `other`).

async function main() {
  const contentDirectory = process.env.CONTENT_DIRECTORY;
  if (!contentDirectory) throw new Error("Set CONTENT_DIRECTORY");
  const args = process.argv.slice(2);
  const top = args.includes("--top")
    ? Number(args[args.indexOf("--top") + 1])
    : 50;
  const lines = args.includes("--lines");

  const dataDirectory = resolve(contentDirectory, "recipes", "data");
  const food: CorpusLine[] = [];
  let recipes = 0;
  let drinkLines = 0;
  for (const slug of await readdir(dataDirectory)) {
    let recipe: Recipe;
    try {
      recipe = JSON.parse(
        await readFile(resolve(dataDirectory, slug, "recipe.json"), "utf8"),
      ) as Recipe;
    } catch {
      continue;
    }
    recipes += 1;
    const drink = !!recipe.drink || (recipe.tags ?? []).includes("drink");
    for (const { ingredient, type } of recipe.ingredients ?? []) {
      const text = flattenMarkdown(ingredient);
      if (type === "heading" || !text || detectHeading(text)) continue;
      if (drink) drinkLines += 1;
      else food.push({ slug, text });
    }
  }
  console.log(
    `# ${recipes} recipes: ${food.length} food lines, ${drinkLines} drink lines (not measured)`,
  );

  measureAmounts(food, top, lines);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
