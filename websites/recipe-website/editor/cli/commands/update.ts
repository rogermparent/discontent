import { UsageError } from "../../controller/curation/errors";
import { readJsonInput } from "../input";
import type { RecipeWriteResult } from "../backend/types";
import { booleanOption, stringOption, type CommandDef } from "./types";

export const updateCommand: CommandDef<RecipeWriteResult> = {
  name: "update",
  usage: "recipes update <slug> (--file patch.json | --stdin)",
  options: {
    file: { type: "string" },
    stdin: { type: "boolean" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("update needs a slug.");
    const raw = await readJsonInput({
      file: stringOption(options, "file"),
      stdin: booleanOption(options, "stdin"),
    });
    return backend.updateRecipe(slug, raw);
  },
  format(result) {
    return `Updated ${result.slug}\n  ${result.url}\n  ${result.path}`;
  },
};

export default updateCommand;
