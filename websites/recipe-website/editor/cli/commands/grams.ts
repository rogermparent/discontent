/**
 * `recipes grams <slug> [--paste file] [--model] [--dry-run]` — a recipe's
 * lines given grams in the house form (51f): `2 cups (400g) brown sugar`.
 *
 * A pasted metric list (`--paste file`) wins; the gram bank (Settings ›
 * Conversions: King Arthur's chart and your own values) fills the cups and
 * spoons it leaves. One update, one commit — or with `--dry-run` only the
 * lines it would change. Counted lines ("2 eggs") take a paste or the
 * model; a pinch, a dash or "to taste" never get grams.
 *
 * With `--model` the model is asked for the rest, one line at a time, and
 * its grams are **shown, never written**: every model-made change is
 * approved by a person before it is saved, so keep them on the edit page
 * (Add grams), where each is marked "≈ Model" until kept.
 */
import { readFile } from "node:fs/promises";
import { UsageError } from "../../controller/curation/errors";
import type { GramsRecipeResult } from "../../controller/curation/gramsRecipe";
import { formatWarnings } from "../output";
import { booleanOption, stringOption, type CommandDef } from "./types";

const SOURCE_TEXT = { paste: "pasted", bank: "bank", model: "≈ model" };

export const gramsCommand: CommandDef<GramsRecipeResult> = {
  name: "grams",
  usage: "recipes grams <slug> [--paste file] [--model] [--dry-run]",
  options: {
    paste: { type: "string" },
    model: { type: "boolean" },
    "dry-run": { type: "boolean" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("grams needs a slug.");
    const pasteFile = stringOption(options, "paste");
    let paste: string | undefined;
    if (pasteFile) {
      try {
        paste = await readFile(pasteFile, "utf8");
      } catch (error) {
        throw new UsageError(
          `Can't read --paste ${pasteFile}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return backend.gramsForRecipe(slug, {
      ...(paste !== undefined ? { paste } : {}),
      ...(booleanOption(options, "model") ? { model: true } : {}),
      ...(booleanOption(options, "dry-run") ? { dryRun: true } : {}),
    });
  },
  format(result) {
    const verb = result.written
      ? "wrote"
      : result.dryRun
        ? "would write"
        : "nothing to write";
    const shown = (line: GramsRecipeResult["lines"][number]) =>
      `  ${line.line}. ${line.to}  (${SOURCE_TEXT[line.source]}: ${line.why})`;
    return [
      `${result.slug}: ${verb}${result.lines.length ? ` ${result.lines.length} line${result.lines.length === 1 ? "" : "s"}` : ""}`,
      ...result.lines.map(shown),
      result.suggested.length
        ? `the model suggests (not written; keep them on the edit page, Add grams):`
        : undefined,
      ...result.suggested.map(shown),
      result.left.length
        ? `left without grams: ${result.left
            .map(
              (line) =>
                `${line.line}. ${line.text}${line.problem ? ` (${line.problem})` : ""}`,
            )
            .join("; ")}`
        : undefined,
      result.unmatched.length
        ? `pasted lines that matched no line: ${result.unmatched.join(" · ")}`
        : undefined,
      result.had ? `${result.had} line(s) gave grams already` : undefined,
      result.model ? `model: ${result.model}` : undefined,
      ...formatWarnings(result.warnings),
      result.job ? `job: ${result.job}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  },
};

export default gramsCommand;
