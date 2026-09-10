import { formatRows } from "../output";
import type { RecipeListResult } from "../backend/types";
import { numberOption, stringOption, type CommandDef } from "./types";

export const listCommand: CommandDef<RecipeListResult> = {
  name: "list",
  usage: "recipes list [--tag t] [--limit 20] [--offset 0]",
  options: {
    tag: { type: "string" },
    limit: { type: "string" },
    offset: { type: "string" },
  },
  async run({ backend, options }) {
    return backend.listRecipes({
      tag: stringOption(options, "tag"),
      limit: numberOption(options, "limit"),
      offset: numberOption(options, "offset"),
    });
  },
  format(result) {
    const rows = formatRows(result.recipes);
    return `${rows}\n${result.recipes.length} of ${result.total}${
      result.more ? " (more)" : ""
    }`;
  },
};

export default listCommand;
