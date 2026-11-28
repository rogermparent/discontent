/**
 * `recipes grams <slug> [--paste file] [--model] [--dry-run]` and `POST
 * /api/recipe/<slug>/grams` (51f, Roger's answer 7): a stored recipe's
 * lines given grams — a pasted metric list first, the gram bank for what
 * it leaves, and with `model` the model for the rest, one line at a time —
 * in the house form, written as one update (one commit), or with `dryRun`
 * only said.
 *
 * The model is asked only when the caller says so (`--model`): on the
 * edit page every model answer is marked "≈ Model" until a person keeps
 * it, and a person running the CLI with `--model` is that person saying so
 * for every line at once. Its lines are named in the answer either way.
 * No MCP tool calls this (59 / 45 stay).
 */
import {
  gramsSuggestion,
  suggestGrams,
  type GramsSource,
} from "recipe-website-common/util/suggestGrams";
import { gramsTableOf } from "recipe-website-common/util/gramsBank";
import { plainLine } from "recipe-website-common/components/Form/Ingredients/ingredientRows";
import type { CurationContext } from "./context";
import { readGramsBank } from "./conversions";
import { getRecipe, updateRecipe } from "./recipes";

export interface GramsRecipeOptions {
  /** A pasted metric list (the CLI's `--paste file`). */
  paste?: string;
  /** Ask the model for what the paste and the bank leave. */
  model?: boolean;
  /** Say what would change; write nothing. */
  dryRun?: boolean;
}

export interface GramsRecipeLine {
  /** 1-based, as a person counts. */
  line: number;
  from: string;
  to: string;
  grams: number;
  source: GramsSource;
  why: string;
}

export interface GramsRecipeResult {
  slug: string;
  lines: GramsRecipeLine[];
  /** Lines that could take grams and got none ("2 eggs" without a paste or the model). */
  left: { line: number; text: string; problem?: string }[];
  /** Pasted lines that matched no line. */
  unmatched: string[];
  /** Lines that gave grams already. */
  had: number;
  written: boolean;
  dryRun?: true;
  /** Who the model step asked. */
  model?: string;
  /** The model step's job. */
  job?: string;
  warnings: string[];
}

export async function gramsForRecipe(
  ctx: CurationContext,
  slug: string,
  options: GramsRecipeOptions = {},
): Promise<GramsRecipeResult> {
  const { recipe } = await getRecipe(ctx, slug);
  const ingredients = recipe.ingredients ?? [];
  const table = gramsTableOf(await readGramsBank(ctx));
  const plan = suggestGrams(ingredients, {
    ...(options.paste ? { paste: options.paste } : {}),
    table,
  });
  const suggestions = [...plan.suggestions];
  const warnings: string[] = [];
  const problems = new Map<number, string>();
  let model: string | undefined;
  let job: string | undefined;
  if (options.model && plan.left.length > 0) {
    const { corpusOf, runSpec } = await import("../jobs/kinds");
    const { editModelFor } = await import("../llm/askEdit");
    const chosen = editModelFor(undefined);
    if ("problem" in chosen) {
      warnings.push(`The model wasn't asked: ${chosen.problem}.`);
    } else {
      const answer = await runSpec(
        {
          kind: "grams",
          ...corpusOf(ctx),
          slug,
          lines: plan.left.map((line) => ({
            line,
            text: ingredients[line].ingredient,
          })),
          backend: chosen.backend,
        },
        { ctx },
      );
      job = answer.job;
      model = answer.model;
      warnings.push(...answer.warnings);
      for (const each of answer.answers) {
        if (each.grams === undefined) {
          if (each.problem) problems.set(each.line, each.problem);
          continue;
        }
        const made = gramsSuggestion(
          ingredients,
          each.line,
          each.grams,
          "model",
          each.why ?? `asked ${model ?? "the model"}`,
        );
        if (made) suggestions.push(made);
      }
    }
  }
  suggestions.sort((a, b) => a.line - b.line);
  const done = new Set(suggestions.map((each) => each.line));
  const lines = suggestions.map((each) => ({
    line: each.line + 1,
    from: plainLine(each.before),
    to: plainLine(each.after),
    grams: each.grams,
    source: each.source,
    why: each.why,
  }));
  const base = {
    slug,
    lines,
    left: plan.left
      .filter((line) => !done.has(line))
      .map((line) => ({
        line: line + 1,
        text: plainLine(ingredients[line].ingredient),
        ...(problems.has(line) ? { problem: problems.get(line)! } : {}),
      })),
    unmatched: plan.unmatched,
    had: plan.had.length,
    ...(model ? { model } : {}),
    ...(job ? { job } : {}),
    warnings,
  };
  if (options.dryRun || suggestions.length === 0) {
    return {
      ...base,
      written: false,
      ...(options.dryRun ? { dryRun: true as const } : {}),
    };
  }
  const next = ingredients.map((line) => ({ ...line }));
  for (const each of suggestions) next[each.line].ingredient = each.after;
  await updateRecipe(ctx, slug, { ingredients: next });
  return { ...base, written: true };
}
