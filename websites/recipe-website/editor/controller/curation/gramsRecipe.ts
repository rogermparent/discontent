/**
 * `recipes grams <slug> [--paste file] [--model] [--dry-run]` and `POST
 * /api/recipe/<slug>/grams` (51f, Roger's answer 7): a stored recipe's
 * lines given grams — a pasted metric list first, the gram bank for what
 * it leaves — in the house form, written as one update (one commit), or
 * with `dryRun` only said.
 *
 * **The model's grams are never written here** (Roger's standing rule:
 * every model-made change is marked and approved by a person before it is
 * saved). With `model` the model is asked for what the paste and the bank
 * leave, one line at a time, and its answers come back as `suggested`
 * only, to keep on the edit page ("Add grams" marks each "≈ Model" until
 * Keep). The HTTP route asks for a write token for `model`, dry run or not,
 * since it spends a model's time or money.
 *
 * **The write is checked against the recipe as it is then** (the model
 * step can take minutes): the recipe is read again just before the update,
 * and a line is written only while it still says what it said when its
 * grams were worked out. A line changed meanwhile is left alone, and said.
 * No MCP tool calls this (59 / 45 stay).
 */
import {
  gramsSuggestion,
  suggestGrams,
  type GramsSource,
  type GramsSuggestion,
} from "recipe-website-common/util/suggestGrams";
import { gramsTableOf } from "recipe-website-common/util/gramsBank";
import { plainLine } from "recipe-website-common/components/Form/Ingredients/ingredientRows";
import type { GramsModelLine, GramsModelResult } from "../llm/gramsModel";
import type { CurationContext } from "./context";
import { readGramsBank } from "./conversions";
import { getRecipe, updateRecipe } from "./recipes";

export interface GramsRecipeOptions {
  /** A pasted metric list (the CLI's `--paste file`). */
  paste?: string;
  /** Ask the model for what the paste and the bank leave: suggested, never written. */
  model?: boolean;
  /** Say what would change; write nothing. */
  dryRun?: boolean;
}

/** Who the model step asks, and its job (tests: a stand-in, never a real model). */
export type GramsModelAsk = (
  lines: GramsModelLine[],
) => Promise<GramsModelResult & { job?: string }>;

export interface GramsRecipeSeams {
  /** In place of the `grams` job on `editModelFor`'s model. */
  askModel?: GramsModelAsk;
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
  /** The paste's and the bank's lines: written, or with `dryRun` would be. */
  lines: GramsRecipeLine[];
  /**
   * The model's lines (`model`): suggestions only, never written here —
   * keep them on the edit page, where each is marked until a person keeps
   * it.
   */
  suggested: GramsRecipeLine[];
  /** Lines that could take grams and got none ("2 eggs" without a paste or the model). */
  left: { line: number; text: string; problem?: string }[];
  /** Pasted lines that matched no line. */
  unmatched: string[];
  /** Lines that gave grams already. */
  had: number;
  /** Lines whose text changed while the grams were worked out: left alone. */
  changed: { line: number; text: string }[];
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
  seams: GramsRecipeSeams = {},
): Promise<GramsRecipeResult> {
  const { recipe } = await getRecipe(ctx, slug);
  const ingredients = recipe.ingredients ?? [];
  const table = gramsTableOf(await readGramsBank(ctx));
  const plan = suggestGrams(ingredients, {
    ...(options.paste ? { paste: options.paste } : {}),
    table,
  });
  const suggestions = [...plan.suggestions];
  const modelSuggestions: GramsSuggestion[] = [];
  const warnings: string[] = [];
  const problems = new Map<number, string>();
  let model: string | undefined;
  let job: string | undefined;
  if (options.model && plan.left.length > 0) {
    const asked = plan.left.map((line) => ({
      line,
      text: ingredients[line].ingredient,
    }));
    const answer = seams.askModel
      ? await seams.askModel(asked)
      : await askTheModel(ctx, slug, asked);
    if ("problem" in answer) {
      warnings.push(`The model wasn't asked: ${answer.problem}.`);
    } else {
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
        if (made) modelSuggestions.push(made);
      }
    }
  }
  suggestions.sort((a, b) => a.line - b.line);
  modelSuggestions.sort((a, b) => a.line - b.line);
  const done = new Set(
    [...suggestions, ...modelSuggestions].map((each) => each.line),
  );
  const lineOf = (each: GramsSuggestion): GramsRecipeLine => ({
    line: each.line + 1,
    from: plainLine(each.before),
    to: plainLine(each.after),
    grams: each.grams,
    source: each.source,
    why: each.why,
  });
  if (modelSuggestions.length > 0) {
    warnings.push(
      `The model's grams for ${modelSuggestions.length} line${modelSuggestions.length === 1 ? " are" : "s are"} suggestions only: nothing the model said is written here. Keep them on the edit page (Add grams), where each is marked until you keep it.`,
    );
  }
  const base = {
    slug,
    suggested: modelSuggestions.map(lineOf),
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
      lines: suggestions.map(lineOf),
      changed: [],
      written: false,
      ...(options.dryRun ? { dryRun: true as const } : {}),
    };
  }
  /* Read again: a line edited while the model was asked is the person's. */
  const now = (await getRecipe(ctx, slug)).recipe.ingredients ?? [];
  const still = suggestions.filter(
    (each) => now[each.line]?.ingredient === each.before,
  );
  const changed = suggestions
    .filter((each) => !still.includes(each))
    .map((each) => ({ line: each.line + 1, text: plainLine(each.before) }));
  if (changed.length > 0) {
    warnings.push(
      `${changed.length} line${changed.length === 1 ? "" : "s"} changed while the grams were worked out, and ${changed.length === 1 ? "was" : "were"} left alone: ${changed.map((each) => `${each.line}. ${each.text}`).join("; ")}.`,
    );
  }
  if (still.length === 0) {
    return { ...base, lines: [], changed, written: false };
  }
  const next = now.map((line) => ({ ...line }));
  for (const each of still) next[each.line].ingredient = each.after;
  await updateRecipe(ctx, slug, { ingredients: next });
  return { ...base, lines: still.map(lineOf), changed, written: true };
}

/** The `grams` job on the edit model (47i's choice), or why nobody is asked. */
async function askTheModel(
  ctx: CurationContext,
  slug: string,
  lines: GramsModelLine[],
): Promise<(GramsModelResult & { job?: string }) | { problem: string }> {
  const { corpusOf, runSpec } = await import("../jobs/kinds");
  const { editModelFor } = await import("../llm/askEdit");
  const chosen = editModelFor(undefined);
  if ("problem" in chosen) return { problem: chosen.problem };
  const answer = await runSpec(
    {
      kind: "grams",
      ...corpusOf(ctx),
      slug,
      lines,
      backend: chosen.backend,
    },
    { ctx },
  );
  return {
    answers: answer.answers,
    ...(answer.model ? { model: answer.model } : {}),
    warnings: answer.warnings,
    ...(answer.job ? { job: answer.job } : {}),
  };
}
