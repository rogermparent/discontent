/*
 * The 47g measurement: how well a model reads what each step uses, against
 * answers written by hand. Local only — it calls a real model
 * (`RECIPE_LLM_URL` from `editor/.env`, or the Claude API from the
 * environment); never run in CI, and never pointed at `editor/content`.
 *
 *   pnpm --filter recipe-editor exec tsx scripts/measure-step-uses.ts \
 *     --dir /scratch/fixtures --answers /scratch/answers.json \
 *     [--model qwen3:8b] [--only slug,slug] [--out runs.jsonl] [--verbose]
 *
 * `--dir` holds `<slug>/recipe.json` copies (a scratch directory: the script
 * only reads them). `--answers` is `{"<slug>": [[line numbers], …]}` — for
 * each step in reading order, the numbers of the lines it brings in, as the
 * outline numbers them (`usesOutline`: headings have no number); `--verbose`
 * prints each recipe's outline, which is what to write the answers from.
 *
 * Each recipe is one `suggestUses` call, exactly the fill's (the same prompt,
 * schema and check), forced: a local model is asked here though a fill does
 * not ask one by default (Dg2 — this is how that was measured). A line per recipe: `{slug, model, steps, right, wrong:
 * [{step, want, got}], unanswered, dropped, guessRight, ms, tokens: {in,
 * out}, costUsd}` — `right` counts the steps whose checked answer names
 * exactly the hand answer's lines (a step with no checked answer is wrong),
 * `guessRight` the same for the matcher alone (`matchStepIngredients`), the
 * baseline a suggestion has to beat. Then a total line.
 */
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { Recipe } from "recipe-website-common/controller/types";
import { matchStepIngredients } from "recipe-website-common/util/stepIngredients";
import {
  sameLines,
  usesOutline,
} from "recipe-website-common/util/usesSuggestions";
import { loadEditorEnv } from "../cli/editorEnv";
import { llmConfig } from "../controller/llm/client";
import { claudeCostEstimate } from "../controller/llm/cost";
import { suggestUses } from "../controller/llm/suggestUses";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const has = (name: string) => args.includes(`--${name}`);

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function main() {
  const dir = flag("dir") ?? fail("--dir <fixtures> is required");
  const answersPath = flag("answers") ?? fail("--answers <file> is required");
  if (/editor\/content(\/|$)/.test(path.resolve(dir))) {
    fail("never the real content repository: copy the recipes to scratch");
  }
  const model = flag("model");
  if (model) process.env.RECIPE_LLM_MODEL = model;
  loadEditorEnv();
  const config = llmConfig();
  if (!config) {
    fail(
      "no model configured: set RECIPE_LLM_URL (editor/.env) or the Claude API",
    );
  }
  const hand = JSON.parse(await readFile(answersPath, "utf8")) as Record<
    string,
    number[][]
  >;
  const only = flag("only")?.split(",");
  const slugs = Object.keys(hand).filter(
    (slug) => !only || only.includes(slug),
  );
  const out = flag("out");
  const emit = async (line: unknown) => {
    const text = `${JSON.stringify(line)}\n`;
    process.stdout.write(text);
    if (out) await appendFile(out, text);
  };

  const total = {
    steps: 0,
    right: 0,
    guessRight: 0,
    ms: 0,
    in: 0,
    out: 0,
    costUsd: 0,
  };
  for (const slug of slugs) {
    const recipe = JSON.parse(
      await readFile(path.join(dir, slug, "recipe.json"), "utf8"),
    ) as Recipe;
    const ingredients = recipe.ingredients ?? [];
    const instructions = recipe.instructions ?? [];
    const outline = usesOutline(ingredients, instructions);
    if (has("verbose")) process.stderr.write(`\n== ${slug}\n${outline.text}\n`);
    const want = hand[slug];
    if (want.length !== outline.steps.length) {
      fail(
        `${slug}: ${want.length} hand answers for ${outline.steps.length} steps`,
      );
    }
    /* The hand answer's numbers as indices into `ingredients`. */
    const wanted = want.map((numbers) =>
      numbers.map((number) => {
        const index = outline.lines[number - 1];
        if (index === undefined) fail(`${slug}: no line ${number}`);
        return index;
      }),
    );
    const guess = matchStepIngredients(ingredients, instructions).flat();
    const result = await suggestUses(
      { name: recipe.name, ingredients, instructions },
      { config, force: true },
    );
    const got = new Map(
      result.answers.map((answer) => [answer.number, answer.lines]),
    );
    const numberOf = new Map(outline.lines.map((index, at) => [index, at + 1]));
    const numbers = (lines: readonly number[] | undefined) =>
      lines?.map((line) => numberOf.get(line)).sort((a, b) => a! - b!);
    const wrong = outline.steps
      .filter(
        (step) =>
          !sameLines(got.get(step.number), wanted[step.number - 1]) ||
          !got.has(step.number),
      )
      .map((step) => ({
        step: step.number,
        want: [...want[step.number - 1]].sort((a, b) => a - b),
        got: numbers(got.get(step.number)) ?? null,
      }));
    const guessRight = outline.steps.filter((step) =>
      sameLines(guess[step.number - 1], wanted[step.number - 1]),
    ).length;
    const costUsd =
      claudeCostEstimate(config.model, {
        inputTokens: result.promptTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        webSearchRequests: 0,
      }) ?? null;
    const steps = outline.steps.length;
    total.steps += steps;
    total.right += steps - wrong.length;
    total.guessRight += guessRight;
    total.ms += result.durationMs ?? 0;
    total.in += result.promptTokens ?? 0;
    total.out += result.outputTokens ?? 0;
    total.costUsd += costUsd ?? 0;
    await emit({
      slug,
      model: result.model ?? config.model,
      steps,
      right: steps - wrong.length,
      wrong,
      unanswered: outline.steps.filter((step) => !got.has(step.number)).length,
      warnings: result.warnings,
      guessRight,
      ms: result.durationMs ?? null,
      tokens: {
        in: result.promptTokens ?? null,
        out: result.outputTokens ?? null,
      },
      costUsd,
    });
  }
  await emit({
    total: true,
    model: config.model,
    ...total,
    costUsd: Math.round(total.costUsd * 10_000) / 10_000,
  });
}

main().catch((error) =>
  fail(error instanceof Error ? error.message : String(error)),
);
