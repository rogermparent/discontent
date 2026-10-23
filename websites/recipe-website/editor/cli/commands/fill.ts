/**
 * `recipes fill <slug> [--no-estimate] [--out patch.json]` — a recipe's
 * gaps filled from its source, written nowhere (45b).
 *
 * Reads the recipe's source link (or its video) as `import --dry-run` would,
 * fills only its empty fields (epic 45 F1/F3), and has the configured model
 * estimate the times and yield the source does not state (F4) unless
 * `--no-estimate`. Prints the patch, what was filled and what estimated;
 * the write stays `recipes update <slug> --file patch.json` (`--out` writes
 * the patch there).
 */
import { UsageError } from "../../controller/curation/errors";
import { fieldList } from "recipe-website-common/components/Form/fillMarks";
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
  usage: "recipes fill <slug> [--no-estimate] [--out patch.json] [--verbose]",
  options: {
    "no-estimate": { type: "boolean" },
    out: { type: "string" },
    ...VERBOSE_OPTION,
  },
  async run({ backend, positionals, options }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("fill needs a slug.");
    const result = await backend.fillRecipe(
      slug,
      booleanOption(options, "no-estimate") ? { estimate: false } : {},
    );
    const out = stringOption(options, "out");
    if (out) await writeDraft(out, result.patch);
    return result;
  },
  format(result) {
    const { estimated } = result;
    const nothing = result.filled.length === 0 && !estimated?.fields.length;
    return [
      `${result.slug} from ${result.url}`,
      result.filled.length > 0
        ? `filled from the source: ${fieldList(result.filled)}`
        : undefined,
      estimated?.fields.length
        ? `estimated by ${estimated.model}: ${fieldList(estimated.fields)} — ${estimated.basis}`
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
