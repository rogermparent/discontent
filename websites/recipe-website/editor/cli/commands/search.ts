import { UsageError } from "../../controller/curation/errors";
import { formatRows } from "../output";
import type { SearchResult } from "../backend/types";
import { numberOption, type CommandDef } from "./types";

export const searchCommand: CommandDef<SearchResult> = {
  name: "search",
  usage: 'recipes search <query…>   e.g. recipes search "tag:dessert time:<30"',
  options: {
    limit: { type: "string" },
    offset: { type: "string" },
  },
  takesDashedPositionals: true,
  async run({ backend, positionals, options }) {
    /*
     * Joined rather than taking only the first: an unquoted
     * `recipes search chocolate cake` arrives as two positionals, and refusing
     * it would be pedantry — the query language treats the two forms alike.
     */
    const query = positionals.join(" ").trim();
    if (!query) throw new UsageError("search needs a query.");
    return backend.searchRecipes(query, {
      limit: numberOption(options, "limit"),
      offset: numberOption(options, "offset"),
    });
  },
  format(result) {
    return `${formatRows(result.recipes)}\n${result.recipes.length} of ${
      result.total
    } for ${JSON.stringify(result.query.raw)}`;
  },
};

export default searchCommand;
