import { readJsonInput } from "../input";
import type { RecipeWriteResult } from "../backend/types";
import { booleanOption, stringOption, type CommandDef } from "./types";

export const createCommand: CommandDef<RecipeWriteResult> = {
  name: "create",
  usage: "recipes create (--file recipe.json | --stdin) [--overwrite]",
  options: {
    file: { type: "string" },
    stdin: { type: "boolean" },
    overwrite: { type: "boolean" },
  },
  write: true,
  async run({ backend, options }) {
    const raw = await readJsonInput({
      file: stringOption(options, "file"),
      stdin: booleanOption(options, "stdin"),
    });
    return backend.createRecipe(raw, {
      overwrite: booleanOption(options, "overwrite"),
    });
  },
  format(result) {
    return `Created ${result.slug}\n  ${result.url}\n  ${result.path}`;
  },
};

export default createCommand;
