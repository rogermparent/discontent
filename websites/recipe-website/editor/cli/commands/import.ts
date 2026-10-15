import { UsageError } from "../../controller/curation/errors";
import {
  formatImageProbe,
  formatJsonBlock,
  formatLlm,
  formatWarnings,
} from "../output";
import type { ImportBatchResult, ImportResult } from "../backend/types";
import { formatStart } from "../../controller/llm/chapterTime";
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
  usage: `recipes import (<url> ${LLM_USAGE} | --text <file|-> [--source <url>]) [--all | --pick 1,3] [--tags a,b] [--slug s] [--name N] [--image <url>] [--dry-run [--out draft.json]] [--overwrite] [--allow-partial]`,
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
    /* 36e: one video (or paste) holding several recipes. */
    all: { type: "boolean" },
    pick: { type: "string" },
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
    const all = booleanOption(options, "all");
    const pickFlag = stringOption(options, "pick");
    if (all && pickFlag !== undefined) {
      throw new UsageError("--all or --pick, not both.");
    }
    const pick =
      pickFlag !== undefined ? parseRecipePicks(pickFlag) : undefined;
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
      ...(all ? { all: true } : {}),
      ...(pick ? { pick } : {}),
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
    if (out) {
      if ("batch" in result) await writeBatchDrafts(out, result);
      else if ("dryRun" in result) await writeDraft(out, result.draft);
    }
    return result;
  },
  exitCode(result) {
    /* A batch where a pick failed (36e): the rest landed, but say so. */
    return "batch" in result &&
      result.recipes.some((recipe) => recipe.status === "failed")
      ? 1
      : 0;
  },
  format(result) {
    if ("batch" in result) return formatBatch(result);
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

/** `1,3` or `2-4` → positions; anything else is `usage`. */
export function parseRecipePicks(value: string): number[] {
  const picks: number[] = [];
  for (const part of value.split(",").map((entry) => entry.trim())) {
    if (!part) continue;
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (from < 1 || to < from || to - from > 100) {
        throw new UsageError(`--pick: "${part}" is not a range of positions.`);
      }
      for (let n = from; n <= to; n += 1) picks.push(n);
      continue;
    }
    if (!/^\d+$/.test(part) || Number(part) < 1) {
      throw new UsageError(
        `--pick takes the recipes' 1-based positions, like 1,3 or 2-4 — not "${part}".`,
      );
    }
    picks.push(Number(part));
  }
  if (picks.length === 0) throw new UsageError("--pick names no recipes.");
  return [...new Set(picks)];
}

/**
 * `--out d.json` on a dry run that found several recipes (36e): one draft
 * per recipe, `d-1.json`, `d-2.json` … by position — each ready for
 * `create --file`; one recipe picked writes `d.json` itself.
 */
async function writeBatchDrafts(
  out: string,
  result: ImportBatchResult,
): Promise<void> {
  const drafts = result.recipes.filter((recipe) => recipe.draft);
  if (drafts.length === 1) {
    await writeDraft(out, drafts[0].draft);
    return;
  }
  const dot = out.lastIndexOf(".");
  const stem = dot > out.lastIndexOf("/") && dot > 0 ? out.slice(0, dot) : out;
  const ext = stem === out ? ".json" : out.slice(dot);
  for (const recipe of drafts) {
    await writeDraft(`${stem}-${recipe.n}${ext}`, recipe.draft);
  }
}

function formatBatch(result: ImportBatchResult): string {
  const where = result.pastedText
    ? `pasted text${result.url ? ` (source ${result.url})` : ""}`
    : result.url;
  return [
    `${result.dryRun ? "dry run: " : ""}${where} — ${result.found.length} recipes found`,
    ...result.found.map(
      (recipe) =>
        `  ${recipe.n}. ${recipe.name} — ${recipe.ingredients} ingredients, ${recipe.steps} steps` +
        (recipe.total !== undefined
          ? `, ${recipe.grounded ?? 0}/${recipe.total} grounded`
          : "") +
        (recipe.chapter ? `, at ${formatStart(recipe.chapter.start)}` : "") +
        (recipe.partial
          ? " (partial)"
          : recipe.trusted
            ? ""
            : " (not trusted — check it)"),
    ),
    ...result.recipes.flatMap((recipe) => [
      [
        `${recipe.n}.`,
        recipe.status,
        recipe.slug ?? "",
        recipe.error
          ? `${recipe.error.code}: ${recipe.error.message}`
          : `(${recipe.name})`,
      ]
        .filter(Boolean)
        .join("  "),
      ...formatWarnings(recipe.warnings),
      ...(recipe.recipe ? [formatJsonBlock(recipe.recipe)] : []),
    ]),
    ...formatWarnings(result.warnings),
  ]
    .filter(Boolean)
    .join("\n");
}
