/**
 * `recipes revise <slug> "<request>" [--claude] [--out patch.json]` — "Edit
 * with AI" from the command line (47i), written nowhere.
 *
 * The request ("remove the parentheses from the ingredients", "convert to
 * metric") goes to the local model (`RECIPE_LLM_EDIT_MODEL`, else
 * `RECIPE_LLM_MODEL`) with the stored recipe, or to the Claude API with
 * `--claude` (or where it is the only model). Its answer is checked as the
 * edit page checks it — the recipe's schema, sections, sets of
 * alternatives and stored `uses` kept — and printed as each changed
 * field's before → after and the patch; `recipes update <slug> --file
 * patch.json` is the write (`--out` writes the patch there).
 */
import { UsageError } from "../../controller/curation/errors";
import {
  EDIT_FIELD_LABELS,
  editFieldList,
  fieldDiff,
} from "recipe-website-common/util/editRequest";
import type { EditResult } from "../backend/types";
import { formatJsonBlock, formatWarnings } from "../output";
import { writeDraft } from "./inspect";
import {
  VERBOSE_OPTION,
  booleanOption,
  stringOption,
  type CommandDef,
} from "./types";

/** The request: the positionals after the slug, joined. */
function requestOf(positionals: readonly string[]): string {
  return positionals.slice(1).join(" ").trim();
}

export const reviseCommand: CommandDef<EditResult> = {
  name: "revise",
  usage:
    'recipes revise <slug> "<request>" [--claude] [--out patch.json] [--verbose]',
  options: {
    claude: { type: "boolean" },
    out: { type: "string" },
    ...VERBOSE_OPTION,
  },
  async run({ backend, positionals, options }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("revise needs a slug and a request.");
    const request = requestOf(positionals);
    if (!request) {
      throw new UsageError(
        'revise needs a request: recipes revise <slug> "remove the parentheses from the ingredients"',
      );
    }
    const result = await backend.reviseRecipe(slug, {
      request,
      ...(booleanOption(options, "claude") ? { claude: true } : {}),
    });
    const out = stringOption(options, "out");
    if (out && result.task === "request" && result.status === "changed") {
      await writeDraft(out, result.patch);
    }
    return result;
  },
  format(result) {
    if (result.task !== "request") return "";
    const who = result.model ?? "the model";
    const lines: (string | undefined)[] = [
      `${result.slug}: “${result.request}”`,
    ];
    switch (result.status) {
      case "changed": {
        lines.push(
          `changed by ${who}: ${editFieldList(result.fields)}${result.note ? ` — ${result.note}` : ""} (a suggestion: read it before you write it)`,
        );
        for (const field of result.fields) {
          lines.push(`${EDIT_FIELD_LABELS[field]}:`);
          for (const row of fieldDiff(
            field,
            result.before[field],
            result.change[field],
          )) {
            const mark =
              row.kind === "removed" ? "-" : row.kind === "added" ? "+" : " ";
            lines.push(`  ${mark} ${row.text}`);
          }
        }
        break;
      }
      case "no-change":
        lines.push(
          `no change from ${who}${result.note ? `: ${result.note}` : ""}`,
        );
        break;
      case "refused":
        lines.push(`${who}'s answer was not used: ${result.problem}`);
        break;
      default:
        lines.push(`nothing was changed: ${result.problem}`);
    }
    if (result.costEstimateUsd !== undefined) {
      lines.push(`cost: about $${result.costEstimateUsd.toFixed(4)}`);
    }
    lines.push(...formatWarnings(result.warnings));
    if (result.job) lines.push(`job: ${result.job}`);
    if (result.status === "changed") {
      lines.push("patch (recipes update <slug> --file patch.json):");
      lines.push(formatJsonBlock(result.patch));
    }
    return lines.filter(Boolean).join("\n");
  },
};

export default reviseCommand;
