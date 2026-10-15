import { UsageError } from "../../controller/curation/errors";
import {
  formatImageProbe,
  formatJsonBlock,
  formatLlm,
  formatWarnings,
} from "../output";
import type { ImportResult } from "../backend/types";
import { writeDraft } from "./inspect";
import {
  LLM_OPTION,
  LLM_USAGE,
  booleanOption,
  llmOption,
  stringOption,
  type CommandDef,
} from "./types";

export const importCommand: CommandDef<ImportResult> = {
  name: "import",
  usage: `recipes import <url> [--tags a,b] [--slug s] [--name N] [--image <url>] [--dry-run [--out draft.json]] [--overwrite] [--allow-partial] ${LLM_USAGE}`,
  options: {
    tags: { type: "string" },
    slug: { type: "string" },
    name: { type: "string" },
    image: { type: "string" },
    "dry-run": { type: "boolean" },
    out: { type: "string" },
    overwrite: { type: "boolean" },
    "allow-partial": { type: "boolean" },
    ...LLM_OPTION,
  },
  write: true,
  async run({ backend, positionals, options }) {
    const url = positionals[0];
    if (!url) throw new UsageError("import needs a URL.");
    const tagsFlag = stringOption(options, "tags");
    const out = stringOption(options, "out");
    const dryRun = booleanOption(options, "dry-run");
    if (out && !dryRun) {
      throw new UsageError("--out writes a dry run's draft: pass --dry-run.");
    }
    const llm = llmOption(options);
    const result = await backend.importRecipe(url, {
      tags: tagsFlag
        ? tagsFlag
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : undefined,
      slug: stringOption(options, "slug"),
      name: stringOption(options, "name"),
      image: stringOption(options, "image"),
      dryRun,
      overwrite: booleanOption(options, "overwrite"),
      allowPartial: booleanOption(options, "allow-partial"),
      ...(llm ? { llm } : {}),
    });
    if (out && "dryRun" in result) await writeDraft(out, result.draft);
    return result;
  },
  format(result) {
    if ("dryRun" in result) {
      return [
        `dry run: ${result.url}`,
        `slug: ${result.slug}`,
        result.partial
          ? result.llm?.found && !result.llm.discarded
            ? "partial: the local model's reading is not trusted — check it"
            : "partial: no Recipe node — title, description and image only"
          : undefined,
        formatLlm(result.llm),
        result.image ? formatImageProbe(result.image) : undefined,
        result.video ? `video: ${result.video}` : undefined,
        ...formatWarnings(result.warnings),
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
      formatLlm(result.llm, "  "),
      ...formatWarnings(result.warnings),
    ]
      .filter(Boolean)
      .join("\n");
  },
};

export default importCommand;
