/**
 * `feature`, `unfeature` and `featured list` — the homepage strip (23a/D5).
 *
 * `feature` is a top-level command rather than `featured add`, because that is
 * the verb the ask uses ("feature it", "put it on the homepage") and the one a
 * skill will reach for. `featured list` is the noun-first read, so the table
 * lives under the same sub-dispatch `group list` does.
 */
import { UsageError } from "../../controller/curation/errors";
import { formatRows } from "../output";
import type {
  DeleteResult,
  FeaturedListResult,
  FeaturedWriteResult,
} from "../backend/types";
import { confirmDeletion } from "./delete";
import {
  booleanOption,
  numberOption,
  stringOption,
  type CommandDef,
} from "./types";

const featureCommand: CommandDef<FeaturedWriteResult> = {
  name: "feature",
  usage:
    "recipes feature (--recipe s | --group s) [--note N] [--date d] [--slug s]",
  options: {
    recipe: { type: "string" },
    group: { type: "string" },
    note: { type: "string" },
    date: { type: "string" },
    slug: { type: "string" },
  },
  write: true,
  async run({ backend, options }) {
    const recipe = stringOption(options, "recipe");
    const group = stringOption(options, "group");
    /*
     * Caught here as well as in the schema so the message names the *flags* a
     * person typed rather than the JSON keys they became — the schema's refine
     * is still what guards the API and the MCP tool.
     */
    if (Boolean(recipe) === Boolean(group)) {
      throw new UsageError(
        "feature needs exactly one of --recipe <slug> or --group <slug>.",
      );
    }
    const note = stringOption(options, "note");
    const date = stringOption(options, "date");
    const slug = stringOption(options, "slug");
    return backend.feature({
      ...(recipe ? { recipe } : {}),
      ...(group ? { group } : {}),
      ...(note ? { note } : {}),
      ...(date ? { date } : {}),
      ...(slug ? { slug } : {}),
    });
  },
  format: (result) =>
    [
      `Featured ${result.recipe ?? result.group}`,
      `  ${result.url}`,
      `  ${result.path}`,
    ].join("\n"),
};

const unfeatureCommand: CommandDef<DeleteResult> = {
  name: "unfeature",
  usage: "recipes unfeature <slug> [--yes]",
  options: {
    yes: { type: "boolean", short: "y" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("unfeature needs a slug.");
    /* The slug is the feature's own, which is why `featured list` comes first. */
    await confirmDeletion(
      "featured entry",
      slug,
      booleanOption(options, "yes"),
    );
    return backend.unfeature(slug);
  },
  format: (result) => `Unfeatured ${result.slug}`,
};

const featuredList: CommandDef<FeaturedListResult> = {
  name: "featured list",
  usage: "recipes featured list [--limit 20] [--offset 0]",
  options: {
    limit: { type: "string" },
    offset: { type: "string" },
  },
  async run({ backend, options }) {
    return backend.listFeatured({
      limit: numberOption(options, "limit"),
      offset: numberOption(options, "offset"),
    });
  },
  format(result) {
    const rows = formatRows(
      result.featured.map((entry) => ({
        slug: entry.slug,
        /* The borrowed name, or the slug when the reference dangles. */
        name: entry.name ?? entry.recipe ?? entry.group ?? "",
        date: entry.date,
        tags: [
          entry.recipe ? "recipe" : "group",
          entry.recipe ?? entry.group ?? "",
        ],
      })),
    );
    return `${rows}\n${result.featured.length} of ${result.total}${
      result.more ? " (more)" : ""
    }`;
  },
};

export const featuredCommands: Record<string, CommandDef<unknown>> = {
  list: featuredList,
};

export { featureCommand, unfeatureCommand };
export default featuredCommands;
