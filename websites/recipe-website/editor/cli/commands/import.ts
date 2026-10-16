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
import { MAX_PHOTOS } from "../../controller/photoLimits";
import { writeDraft } from "./inspect";
import {
  LLM_OPTION,
  VERBOSE_OPTION,
  LLM_USAGE,
  booleanOption,
  llmOption,
  stringListOption,
  stringOption,
  type CommandDef,
} from "./types";

export const importCommand: CommandDef<ImportResult> = {
  name: "import",
  usage: `recipes import (<url> ${LLM_USAGE} | --text <file|-> [--source <url>] | --photo <file> [<file>…] [--source <url>] [--photo-as-image]) [--all | --pick "Name",… | --as-one] [--tags a,b] [--slug s] [--name N] [--image <url>] [--dry-run [--out draft.json]] [--overwrite] [--allow-partial] [--verbose]`,
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
    ...VERBOSE_OPTION,
    /* 36c (D8): a pasted recipe, read by the local model. */
    text: { type: "string" },
    source: { type: "string" },
    /* 36e: one video (or paste) holding several recipes. */
    all: { type: "boolean" },
    pick: { type: "string", multiple: true },
    "as-one": { type: "boolean" },
    /* 38e: photos of a recipe card, transcribed by the vision model. */
    photo: { type: "string", multiple: true },
    "photo-as-image": { type: "boolean" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    /* `--photo a.jpg b.jpg` as well as `--photo a.jpg --photo b.jpg`. */
    const photoFlags = stringListOption(options, "photo");
    const photoPaths =
      photoFlags.length > 0 ? [...photoFlags, ...positionals] : [];
    const url = photoPaths.length > 0 ? undefined : positionals[0];
    const textFrom = stringOption(options, "text");
    const source = stringOption(options, "source");
    const photoAsImage = booleanOption(options, "photo-as-image");
    if (photoPaths.length > 0 && textFrom !== undefined) {
      throw new UsageError("import takes --text or --photo, not both.");
    }
    if (url && textFrom !== undefined) {
      throw new UsageError("import takes a URL or --text <file|->, not both.");
    }
    if (!url && !textFrom && photoPaths.length === 0) {
      throw new UsageError(
        "import needs a URL, --text <file|-> for a pasted recipe, or --photo <file> for a photo of one.",
      );
    }
    if (photoPaths.length > MAX_PHOTOS) {
      throw new UsageError(
        `--photo takes at most ${MAX_PHOTOS} photos (the pages of one recipe, in order); ${photoPaths.length} given.`,
      );
    }
    if (
      source !== undefined &&
      textFrom === undefined &&
      photoPaths.length === 0
    ) {
      throw new UsageError(
        "--source is a pasted text's (or a photo's) URL: it goes with --text or --photo (import a URL directly otherwise).",
      );
    }
    if (photoAsImage && photoPaths.length === 0) {
      throw new UsageError("--photo-as-image goes with --photo.");
    }
    if (photoAsImage && stringOption(options, "image") !== undefined) {
      throw new UsageError(
        "--photo-as-image or --image, not both: the recipe has one image.",
      );
    }
    const tagsFlag = stringOption(options, "tags");
    const out = stringOption(options, "out");
    const dryRun = booleanOption(options, "dry-run");
    if (out && !dryRun) {
      throw new UsageError("--out writes a dry run's draft: pass --dry-run.");
    }
    const llm = llmOption(options);
    if (llm && (textFrom !== undefined || photoPaths.length > 0)) {
      throw new UsageError(
        "--llm is for a URL import: --text and --photo always use the local model.",
      );
    }
    const all = booleanOption(options, "all");
    const pickFlags = stringListOption(options, "pick");
    const asOne = booleanOption(options, "as-one");
    if (all && pickFlags.length > 0) {
      throw new UsageError("--all or --pick, not both.");
    }
    if (asOne && (all || pickFlags.length > 0)) {
      throw new UsageError(
        "--as-one reads the text as one recipe: no --all or --pick with it.",
      );
    }
    const pick = pickFlags.length > 0 ? parseRecipePicks(pickFlags) : undefined;
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
      ...(asOne ? { asOne: true } : {}),
    };
    let result: ImportResult;
    if (photoPaths.length > 0) {
      /* Read here, so a remote import uploads them (38e). */
      const { readImageFile } = await import("../../controller/imageImport");
      const photos: File[] = [];
      for (const photoPath of photoPaths) {
        photos.push(await readImageFile(photoPath));
      }
      result = await backend.importPhotos(photos, {
        ...writeOptions,
        ...(source ? { source } : {}),
        ...(photoAsImage ? { photoAsImage: true } : {}),
      });
    } else if (textFrom) {
      result = await backend.importText(await readTextInput(textFrom), {
        ...writeOptions,
        ...(source ? { source } : {}),
      });
    } else {
      result = await backend.importRecipe(url!, {
        ...writeOptions,
        ...(llm ? { llm } : {}),
      });
    }
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
        result.photos
          ? `dry run: ${photoCount(result.photos)}${result.url ? ` (source ${result.url})` : ""}`
          : result.pastedText
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
        result.job ? `job: ${result.job}` : undefined,
        ...formatTranscription(result.transcription),
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
      result.photos ? `  read from ${photoCount(result.photos)}` : undefined,
      formatLlm(result.llm, "  "),
      ...formatWarnings(result.warnings),
      result.job ? `  job: ${result.job}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  },
};

export default importCommand;

/**
 * `--pick` (36e): names — `--pick "Green Bean Casserole"`, steady across
 * re-reads — or 1-based positions (`1,3`, `2-4`); commas separate, and the
 * flag can repeat. A part that is all digits (or a range of them) is a
 * position; anything else is a name.
 */
export function parseRecipePicks(
  values: string | readonly string[],
): (number | string)[] {
  const picks: (number | string)[] = [];
  const parts = (typeof values === "string" ? [values] : values).flatMap(
    (value) => value.split(","),
  );
  for (const part of parts.map((entry) => entry.trim())) {
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
    if (/^\d+$/.test(part)) {
      if (Number(part) < 1) {
        throw new UsageError(
          `--pick takes names, or 1-based positions — not "${part}".`,
        );
      }
      picks.push(Number(part));
      continue;
    }
    picks.push(part);
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

/** "1 photo", "2 photos". */
function photoCount(count: number): string {
  return `${count} photo${count === 1 ? "" : "s"}`;
}

/** A dry run's transcription (38e): what the vision model read, indented. */
function formatTranscription(text: string | undefined): string[] {
  if (!text) return [];
  return ["transcription:", ...text.split("\n").map((line) => `  ${line}`)];
}

function formatBatch(result: ImportBatchResult): string {
  const where = result.photos
    ? `${photoCount(result.photos)}${result.url ? ` (source ${result.url})` : ""}`
    : result.pastedText
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
    result.job ? `job: ${result.job}` : undefined,
    ...formatTranscription(result.transcription),
  ]
    .filter(Boolean)
    .join("\n");
}
