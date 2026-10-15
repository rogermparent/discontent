import { UsageError } from "../../controller/curation/errors";
import {
  formatImageProbe,
  formatJsonBlock,
  formatLlm,
  formatWarnings,
} from "../output";
import type { ImportResult } from "../backend/types";
import { readTextInput } from "../input";
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
  usage: `recipes import (<url> ${LLM_USAGE} | --text <file|-> [--source <url>]) [--tags a,b] [--slug s] [--name N] [--image <url>] [--dry-run [--out draft.json]] [--overwrite] [--allow-partial]`,
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
    /* 36c (D8): a pasted recipe, read by the local model. */
    text: { type: "string" },
    source: { type: "string" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const url = positionals[0];
    const textFrom = stringOption(options, "text");
    const source = stringOption(options, "source");
    if (url && textFrom !== undefined) {
      throw new UsageError("import takes a URL or --text <file|->, not both.");
    }
    if (!url && !textFrom) {
      throw new UsageError(
        "import needs a URL, or --text <file|-> for a pasted recipe.",
      );
    }
    if (source !== undefined && textFrom === undefined) {
      throw new UsageError(
        "--source is a pasted text's URL: it goes with --text (import a URL directly otherwise).",
      );
    }
    const tagsFlag = stringOption(options, "tags");
    const out = stringOption(options, "out");
    const dryRun = booleanOption(options, "dry-run");
    if (out && !dryRun) {
      throw new UsageError("--out writes a dry run's draft: pass --dry-run.");
    }
    const llm = llmOption(options);
    if (llm && textFrom !== undefined) {
      throw new UsageError(
        "--llm is for a URL import: --text always uses the local model.",
      );
    }
    const writeOptions = {
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
    };
    const result = textFrom
      ? await backend.importText(await readTextInput(textFrom), {
          ...writeOptions,
          ...(source ? { source } : {}),
        })
      : await backend.importRecipe(url, {
          ...writeOptions,
          ...(llm ? { llm } : {}),
        });
    if (out && "dryRun" in result) await writeDraft(out, result.draft);
    return result;
  },
  format(result) {
    if ("dryRun" in result) {
      return [
        result.pastedText
          ? `dry run: pasted text${result.url ? ` (source ${result.url})` : ""}`
          : `dry run: ${result.url}`,
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
