/*
 * The 47i measurement: how a model answers "Edit with AI" requests on real
 * recipes. Local only — it calls a real model (`RECIPE_LLM_URL` from
 * `editor/.env`, or the Claude API from the environment); never run in CI,
 * and never pointed at `editor/content`.
 *
 *   pnpm --filter recipe-editor exec tsx scripts/measure-edit-requests.ts \
 *     --dir /scratch/fixtures --cases /scratch/cases.json \
 *     [--model qwen3:8b] [--claude] [--only c1,c2] [--out runs.jsonl]
 *
 * `--dir` holds `<slug>/recipe.json` copies (a scratch directory: the script
 * only reads them). `--cases` is `[{id, slug, request}]`. Each case is one
 * `runEdit` — exactly the edit job's (the same prompt, schema and check),
 * on the recipe as the form would load it. `--model` sets
 * `RECIPE_LLM_EDIT_MODEL` (the local model asked); `--claude` asks the
 * Claude API (`RECIPE_LLM_API=anthropic` in the environment, or
 * `RECIPE_LLM_CLAUDE_API_KEY`). A line per case: `{id, slug, request, model,
 * status, fields, note, problem, warnings, ms, tokens: {in, out}, costUsd,
 * diff}` — `diff` the changed fields' before → after, for judging by hand.
 */
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { Recipe } from "recipe-website-common/controller/types";
import {
  editValuesOfRecipe,
  fieldDiff,
} from "recipe-website-common/util/editRequest";
import { loadEditorEnv } from "../cli/editorEnv";
import { editModels, runEdit } from "../controller/llm/askEdit";

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

interface Case {
  id: string;
  slug: string;
  request: string;
}

async function main() {
  const dir = flag("dir") ?? fail("--dir <fixtures> is required");
  const casesPath = flag("cases") ?? fail("--cases <file> is required");
  if (/editor\/content(\/|$)/.test(path.resolve(dir))) {
    fail("never the real content repository: copy the recipes to scratch");
  }
  const model = flag("model");
  if (model) process.env.RECIPE_LLM_EDIT_MODEL = model;
  loadEditorEnv();
  const models = editModels();
  const claude = has("claude");
  if (claude ? !models.claude : !models.local) {
    fail(
      claude ? "no Claude API configured" : "no local model (RECIPE_LLM_URL)",
    );
  }
  const only = flag("only")?.split(",");
  const cases = (
    JSON.parse(await readFile(casesPath, "utf8")) as Case[]
  ).filter((one) => !only || only.includes(one.id));
  const out = flag("out");
  for (const one of cases) {
    const recipe = JSON.parse(
      await readFile(path.join(dir, one.slug, "recipe.json"), "utf8"),
    ) as Recipe;
    const values = editValuesOfRecipe(recipe);
    const started = Date.now();
    const result = await runEdit(
      {
        kind: "edit",
        slug: one.slug,
        task: "request",
        request: one.request,
        recipe: values,
        backend: claude ? "claude" : "local",
      },
      { models },
    );
    if (result.task !== "request") continue;
    const line = {
      id: one.id,
      slug: one.slug,
      request: one.request,
      model: result.model,
      status: result.status,
      fields: result.status === "changed" ? result.fields : [],
      note: result.note,
      ...(result.status === "refused" || result.status === "failed"
        ? { problem: result.problem }
        : {}),
      warnings: result.warnings,
      ms: result.durationMs ?? Date.now() - started,
      tokens: { in: result.promptTokens, out: result.outputTokens },
      ...(result.costEstimateUsd !== undefined
        ? { costUsd: result.costEstimateUsd }
        : {}),
      diff:
        result.status === "changed"
          ? Object.fromEntries(
              result.fields.map((field) => [
                field,
                fieldDiff(field, values[field], result.change[field])
                  .filter((row) => row.kind !== "same")
                  .map(
                    (row) => `${row.kind === "added" ? "+" : "-"} ${row.text}`,
                  ),
              ]),
            )
          : {},
    };
    const text = `${JSON.stringify(line)}\n`;
    process.stdout.write(text);
    if (out) await appendFile(out, text);
  }
}

void main().catch((error) => fail(String(error?.stack ?? error)));
