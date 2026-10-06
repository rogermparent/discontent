import { readJsonInput } from "../input";
import { formatJsonBlock } from "../output";
import type { RecipeDryRunResult, RecipeWriteResult } from "../backend/types";
import { booleanOption, stringOption, type CommandDef } from "./types";

/** A `--dry-run`'s report: what would be written, and where. */
export function formatDryRun(result: RecipeDryRunResult): string {
  return [
    `dry run: ${result.previousSlug ? `${result.previousSlug} → ` : ""}${result.slug}`,
    result.conflict
      ? `conflict: something already lives at ${result.slug}`
      : undefined,
    result.image
      ? `image: ${result.image.filename}${result.image.error ? ` (${result.image.error})` : ""}`
      : undefined,
    formatJsonBlock(result.recipe),
  ]
    .filter(Boolean)
    .join("\n");
}

export const createCommand: CommandDef<RecipeWriteResult | RecipeDryRunResult> =
  {
    name: "create",
    usage:
      "recipes create (--file recipe.json | --stdin) [--overwrite] [--dry-run]",
    options: {
      file: { type: "string" },
      stdin: { type: "boolean" },
      overwrite: { type: "boolean" },
      "dry-run": { type: "boolean" },
    },
    write: true,
    async run({ backend, options }) {
      const raw = await readJsonInput({
        file: stringOption(options, "file"),
        stdin: booleanOption(options, "stdin"),
      });
      return backend.createRecipe(raw, {
        overwrite: booleanOption(options, "overwrite"),
        dryRun: booleanOption(options, "dry-run"),
      });
    },
    format(result) {
      if ("dryRun" in result) return formatDryRun(result);
      return `Created ${result.slug}\n  ${result.url}\n  ${result.path}`;
    },
  };

export default createCommand;
