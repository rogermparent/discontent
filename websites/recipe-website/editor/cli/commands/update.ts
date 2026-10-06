import { UsageError } from "../../controller/curation/errors";
import { readJsonInput } from "../input";
import type { RecipeDryRunResult, RecipeWriteResult } from "../backend/types";
import { formatDryRun } from "./create";
import { booleanOption, stringOption, type CommandDef } from "./types";

export const updateCommand: CommandDef<RecipeWriteResult | RecipeDryRunResult> =
  {
    name: "update",
    usage: "recipes update <slug> (--file patch.json | --stdin) [--dry-run]",
    options: {
      file: { type: "string" },
      stdin: { type: "boolean" },
      "dry-run": { type: "boolean" },
    },
    write: true,
    async run({ backend, positionals, options }) {
      const slug = positionals[0];
      if (!slug) throw new UsageError("update needs a slug.");
      const raw = await readJsonInput({
        file: stringOption(options, "file"),
        stdin: booleanOption(options, "stdin"),
      });
      return backend.updateRecipe(slug, raw, {
        dryRun: booleanOption(options, "dry-run"),
      });
    },
    format(result) {
      if ("dryRun" in result) return formatDryRun(result);
      return `Updated ${result.slug}\n  ${result.url}\n  ${result.path}`;
    },
  };

export default updateCommand;
