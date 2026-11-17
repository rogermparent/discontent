/**
 * `recipes fill <slug> [--no-estimate] [--uses | --no-uses] [--all-uses]
 * [--out patch.json]` — a recipe's gaps filled from its source, written
 * nowhere (45b).
 *
 * Reads the recipe's source link (or its video) as `import --dry-run` would,
 * fills only its empty fields (epic 45 F1/F3), and has the configured model
 * estimate the times and yield the source does not state (F4) unless
 * `--no-estimate`, and read what each step brings in (47g: a step's `uses`,
 * for the steps where that differs from what the page shows). That reading
 * is the Claude API's by default; `--uses` asks a local model too,
 * `--no-uses` asks none, and `--all-uses` reads the steps that already
 * store a list as well.
 * Prints the patch, what was filled, what estimated and which steps' `uses`
 * the model suggests; the write stays `recipes update <slug> --file
 * patch.json` (`--out` writes the patch there).
 */
import { UsageError } from "../../controller/curation/errors";
import { fieldList } from "recipe-website-common/components/Form/fillMarks";
import { numberList } from "recipe-website-common/util/usesSuggestions";
import type { FillResult } from "../backend/types";
import { formatJsonBlock, formatLlm, formatWarnings } from "../output";
import { writeDraft } from "./inspect";
import {
  VERBOSE_OPTION,
  booleanOption,
  stringOption,
  type CommandDef,
} from "./types";

export const fillCommand: CommandDef<FillResult> = {
  name: "fill",
  usage:
    "recipes fill <slug> [--no-estimate] [--uses | --no-uses] [--all-uses] [--out patch.json] [--verbose]",
  options: {
    "no-estimate": { type: "boolean" },
    uses: { type: "boolean" },
    "no-uses": { type: "boolean" },
    "all-uses": { type: "boolean" },
    out: { type: "string" },
    ...VERBOSE_OPTION,
  },
  async run({ backend, positionals, options }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("fill needs a slug.");
    if (
      booleanOption(options, "no-uses") &&
      (booleanOption(options, "all-uses") || booleanOption(options, "uses"))
    ) {
      throw new UsageError(
        "fill takes --no-uses, or --uses / --all-uses, not both.",
      );
    }
    const result = await backend.fillRecipe(slug, {
      ...(booleanOption(options, "no-estimate") ? { estimate: false } : {}),
      ...(booleanOption(options, "no-uses") ? { uses: false } : {}),
      ...(booleanOption(options, "uses") ? { uses: true } : {}),
      ...(booleanOption(options, "all-uses") ? { usesAll: true } : {}),
    });
    const out = stringOption(options, "out");
    if (out) await writeDraft(out, result.patch);
    return result;
  },
  format(result) {
    const { estimated, uses } = result;
    const suggested = (uses?.answers ?? []).filter((answer) =>
      uses?.steps.includes(answer.number),
    );
    const nothing =
      result.filled.length === 0 &&
      !estimated?.fields.length &&
      suggested.length === 0;
    return [
      `${result.slug} from ${result.url}`,
      result.filled.length > 0
        ? `filled from the source: ${fieldList(result.filled)}`
        : undefined,
      estimated?.fields.length
        ? `estimated by ${estimated.model}: ${fieldList(estimated.fields)} — ${estimated.basis}`
        : undefined,
      suggested.length > 0
        ? `uses suggested by ${uses?.model} for step${suggested.length === 1 ? "" : "s"} ${numberList(suggested.map((answer) => answer.number))} (a suggestion: read it before you write it):`
        : undefined,
      ...suggested.map(
        (answer) =>
          `  step ${answer.number}: ${answer.uses.length > 0 ? answer.uses.join(", ") : "nothing"}${uses?.replaced?.includes(answer.number) ? " (replaces its stored list)" : ""}`,
      ),
      uses && suggested.length === 0
        ? `uses: ${uses.model} read ${uses.answers.length} step${uses.answers.length === 1 ? "" : "s"} and suggests no change`
        : undefined,
      result.usesNotAsked
        ? `uses: ${result.usesNotAsked} was not asked what each step uses — only the Claude API is by default; --uses (or RECIPE_LLM_USES=1) asks a local model`
        : undefined,
      suggested.length > 0
        ? "the patch's instructions are the whole list of steps as they were read: write it before editing the steps, or the edits are undone"
        : undefined,
      nothing ? "nothing new: every field the source has is filled" : undefined,
      formatLlm(result.llm),
      ...formatWarnings(result.warnings),
      result.job ? `job: ${result.job}` : undefined,
      result.suggestedTags?.length
        ? `suggested tags: ${result.suggestedTags.join(", ")}`
        : undefined,
      nothing ? undefined : "patch (recipes update <slug> --file patch.json):",
      nothing ? undefined : formatJsonBlock(result.patch),
    ]
      .filter(Boolean)
      .join("\n");
  },
};

export default fillCommand;
