import { UsageError } from "../../controller/curation/errors";
import { formatJsonBlock } from "../output";
import type { ImportResult } from "../backend/types";
import { booleanOption, stringOption, type CommandDef } from "./types";

export const importCommand: CommandDef<ImportResult> = {
  name: "import",
  usage:
    "recipes import <url> [--tags a,b] [--slug s] [--name N] [--dry-run] [--overwrite]",
  options: {
    tags: { type: "string" },
    slug: { type: "string" },
    name: { type: "string" },
    "dry-run": { type: "boolean" },
    overwrite: { type: "boolean" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const url = positionals[0];
    if (!url) throw new UsageError("import needs a URL.");
    const tagsFlag = stringOption(options, "tags");
    return backend.importRecipe(url, {
      tags: tagsFlag
        ? tagsFlag
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : undefined,
      slug: stringOption(options, "slug"),
      name: stringOption(options, "name"),
      dryRun: booleanOption(options, "dry-run"),
      overwrite: booleanOption(options, "overwrite"),
    });
  },
  format(result) {
    if ("dryRun" in result) {
      return [
        `dry run: ${result.url}`,
        `slug: ${result.slug}`,
        result.image ? `image: ${result.image.filename}` : undefined,
        result.video ? `video: ${result.video}` : undefined,
        formatJsonBlock(result.recipe),
      ]
        .filter(Boolean)
        .join("\n");
    }
    return [
      `Imported ${result.slug}`,
      `  ${result.url}`,
      `  ${result.path}`,
      result.source ? `  source: ${result.source.url}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  },
};

export default importCommand;
