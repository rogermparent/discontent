import { UsageError } from "../../controller/curation/errors";
import type { DeepSearchRow } from "../../controller/curation/search";
import { formatRows } from "../output";
import type { DeepSearchResult, SearchResult } from "../backend/types";
import { booleanOption, numberOption, type CommandDef } from "./types";

export const searchCommand: CommandDef<SearchResult | DeepSearchResult> = {
  name: "search",
  usage:
    'recipes search <query…> [--deep]   e.g. recipes search "tag:dessert time:<30"',
  options: {
    limit: { type: "string" },
    offset: { type: "string" },
    /* 51c: the steps and notes too, as the curator's `recipe_search` `deep`. */
    deep: { type: "boolean" },
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
    const deep = booleanOption(options, "deep");
    return backend.searchRecipes(query, {
      limit: numberOption(options, "limit"),
      offset: numberOption(options, "offset"),
      ...(deep ? { deep } : {}),
    });
  },
  format(result) {
    /* A row a step or note found says where, after the table. */
    const found = result.recipes.flatMap((row: DeepSearchRow) =>
      row.found
        ? [
            `  ${row.slug}: ${row.found.field === "steps" ? "step" : "note"} ${row.found.number}: ${row.found.text}`,
          ]
        : [],
    );
    const deep = "deep" in result ? " (steps and notes too)" : "";
    return [
      formatRows(result.recipes),
      ...(found.length > 0 ? ["Found in steps and notes:", ...found] : []),
      `${result.recipes.length} of ${result.total} for ${JSON.stringify(
        result.query.raw,
      )}${deep}`,
    ].join("\n");
  },
};

export default searchCommand;
