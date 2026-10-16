/**
 * The local model in an import (epic 36, D3/D4/D5): the one place that
 * decides between `auto`, `force` and `off`.
 *
 * Every import surface — `importFromUrl` (the `import` seat), `inspectUrl`,
 * the roundup's `importItem` and the form's `reduceRecipeImport` — maps the
 * page as before and then hands the result here with the page's HTML (or a
 * video's text — title, description and pinned comment, 36d). What
 * comes back is the recipe to use, the model's statistics and the warnings
 * to show.
 *
 * - **auto** (the default): the model reads the source only when the mapper
 *   found no recipe body — no Recipe node (the SEO `partial`, or nothing at
 *   all), a Recipe node with no ingredients and no steps, or a video's
 *   description. With no model configured it quietly does nothing, and a
 *   failed call is a warning, not a failed import.
 * - **force**: the model reads the source even over a Recipe node, and its
 *   fields replace the schema's. Unconfigured, or a failed call, is an
 *   `ImportError` (`import_failed`); no text to read (yt-dlp missing, an
 *   empty page) is a warning and `llm.error`, and the mapper's result stands.
 * - **off**: never.
 *
 * Pasted text (D8, 36c) is `readPastedText`: `force` over nothing mapped,
 * where every way of not getting a recipe is an `ImportError`.
 *
 * Several recipes in one text (36e, D10): with `split` (a video's text, a
 * paste) a text that passes `splitRecipes.ts`'s gate is listed by the model,
 * cut, and read slice by slice; the result's `recipes` holds each, settled
 * on its own (`settleExtraction`: the floor, D4, T21), with its chapter and
 * its links to the others. Pages never split.
 *
 * Image, video, source and `suggestedTags` always stay the page's: the model
 * reads text, and what it would say about pictures or provenance is a guess.
 * An empty ingredient or step list from the model never replaces the page's.
 *
 * ## The grounding floor (36b, a D4 amendment)
 *
 * Below `GROUNDED_FLOOR` of the model's ingredient lines found in the source,
 * the extraction is thrown away rather than shown: the result is what the
 * mapper gave (today's partial, or the schema's recipe under force), still
 * carrying `llm` with the counts, and a warning that says so. 36a's Wikibooks
 * Hummus article came back as nine invented lines, 0/9 grounded. Between the
 * floor and D4's `GROUNDED_MIN` the lines are kept and the result is
 * `partial`, so 26-D3's `allowPartial` still means "not trustworthy" —
 * except under auto when the mapper's result was not partial (a video, an
 * empty Recipe node): that imported before the model was asked, so it is
 * never made partial now; the lines are kept with a warning.
 *
 * ## Startup cost
 *
 * The extractor and `pageText` load the page parsers; they are imported when
 * the model is about to run, not with this module, so the CLI and the MCP
 * server start as fast as they did (35q). `client.ts` is plain `fetch`.
 */
import type {
  ImportedRecipe,
  ParsedRecipePage,
} from "recipe-website-common/util/importRecipeData";
import { ImportError, ValidationError } from "../curation/errors";
import {
  PASTED_TEXT_MAX_CHARS,
  normalisePastedText,
} from "../curation/importRequest";
import {
  LLM_UNCONFIGURED_MESSAGE,
  LlmError,
  llmConfig,
  type LlmConfig,
} from "./client";
import type { YtdlpComment, YtdlpMetadata } from "../ytdlp";
import type { ExtractMeta, LlmExtraction, LlmStats } from "./extractRecipe";
import { DEFAULT_LLM_MODE, type LlmMode } from "./mode";
import type { ChapterRef } from "./chapterTime";
import type { ComponentRef } from "./splitRecipes";
import { jobContext, type JobRun } from "../jobs/context";
import { NO_LOG, type JobLog, type StepData } from "../jobs/log";

export { DEFAULT_LLM_MODE, LLM_MODES, isLlmMode, type LlmMode } from "./mode";

/**
 * Below this share of grounded ingredient lines the model's answer is thrown
 * away (36b; D4's `GROUNDED_MIN`, 90%, is the line between trusted and
 * `partial`).
 */
export const GROUNDED_FLOOR = 0.5;

/** What an import reports about the model: present whenever it was asked. */
export interface LlmImportInfo extends Partial<
  Omit<LlmStats, "model" | "durationMs">
> {
  model: string;
  mode: Exclude<LlmMode, "off">;
  /** The model answered with a recipe. */
  found: boolean;
  /**
   * The model's lines were thrown away: under `GROUNDED_FLOOR` (36b). The
   * recipe is what the mapper gave.
   */
  discarded?: true;
  /** `auto` only: the call failed, and the import went on without it. */
  error?: string;
  durationMs?: number;
}

/** Where the text comes from: a page's HTML, or text (a video's description). */
export type LlmSource =
  | { html: string; ok?: boolean; meta?: ParsedRecipePage["meta"] }
  | {
      text: string;
      meta?: ExtractMeta;
      /**
       * What the text is, for the warnings — "the video's description and
       * pinned comment" (36d). Without it the text is "the text".
       */
      label?: string;
      /**
       * A video's chapters (36e): when the text holds several recipes, each
       * cites the chapter it is made in. Never sent to the model (36d).
       */
      chapters?: ChapterRef[];
      /**
       * Pasted text (D8): its URL is cited but never named to the model
       * (38c, 36-T23) — a "Source URL:" line changed the reading of the
       * same paste.
       */
      pasted?: boolean;
    };

/**
 * The creator's comments a recipe may sit in (36d): the pinned one, and the
 * longest when that is another — many creators post the recipe in a comment
 * instead of the description, not always the one they pinned. At most two,
 * each capped at 6 000 characters, so both fit the 24k text cap.
 * (`pickYtdlpMetadata` has already dropped everyone else's comments, pinned
 * or not.)
 */
export function recipeComments(meta: YtdlpMetadata): YtdlpComment[] {
  const comments = meta.comments ?? [];
  const pinned = comments.find((comment) => comment.pinned);
  const longest = comments.reduce<YtdlpComment | undefined>(
    (best, comment) =>
      !best || comment.text.length > best.text.length ? comment : best,
    undefined,
  );
  return [pinned, longest].filter(
    (comment, index, list): comment is YtdlpComment =>
      !!comment && list.indexOf(comment) === index,
  );
}

/**
 * A video as the model's source (D3, widened in 36d): the title, the
 * description, and the creator's comments (`recipeComments`) as "Creator's
 * pinned comment:" / "Creator's comment:" blocks — many creators post the
 * recipe there. The whole of it is what D4 grounds the model's lines
 * against. The channel is the site. Comments are there only when the fetch
 * asked for them, which it does only when a model will read them
 * (`videoFetchOptions`), and only the uploader's are kept.
 *
 * **Not the chapters** (36d, measured over 12 videos): their titles never
 * improved a reading and made three worse. A description with the
 * ingredients but no method came back with a "Chapters" section of
 * "0:21 Preparing the pre-ferment" lines as its steps; a video whose only
 * text was its chapters came back with their titles as a steps-only
 * "recipe", which auto keeps (T21). `inspect` still lists them under
 * `video.chapters`.
 */
export function videoSource(meta: YtdlpMetadata): LlmSource {
  const comments = recipeComments(meta);
  const description = meta.description.trim();
  const blocks = [
    meta.title,
    description,
    ...comments.map(
      (comment) =>
        `${comment.pinned ? "Creator's pinned comment" : "Creator's comment"}:\n${comment.text}`,
    ),
  ];
  /* "the video's description and pinned comment", "the creator's comment" … */
  const commentPart =
    comments.length > 1
      ? "the creator's comments"
      : comments[0]?.pinned
        ? "pinned comment"
        : comments.length === 1
          ? "the creator's comment"
          : undefined;
  const label = description
    ? `the video's description${commentPart ? ` and ${commentPart}` : ""}`
    : !commentPart
      ? "the video"
      : commentPart.startsWith("the ")
        ? commentPart
        : `the video's ${commentPart}`;
  return {
    text: blocks.filter(Boolean).join("\n\n"),
    meta: {
      title: meta.title || undefined,
      siteName: meta.channel || meta.uploader || undefined,
    },
    label,
    ...(meta.chapters.length > 0
      ? {
          chapters: meta.chapters.map((chapter) => ({
            title: chapter.title,
            start: chapter.start_time,
          })),
        }
      : {}),
  };
}

/**
 * The yt-dlp fetch for an import (36d): comments only when the local model
 * will read the video — with no model, or `off`, the extra time buys nothing.
 * (A video never has a recipe body before the model, so `auto` always asks.)
 */
export function videoFetchOptions(
  mode: LlmMode = DEFAULT_LLM_MODE,
  config: LlmConfig | undefined = llmConfig(),
): { comments: boolean } {
  return { comments: mode !== "off" && !!config };
}

export interface ApplyLlmInput {
  /** The URL the source came from; `source` falls back to it. */
  url?: string;
  source: LlmSource;
  /** The mapper's recipe: `mapRecipePage`, `ytdlpToRecipe`, or none. */
  mapped: Partial<ImportedRecipe> | undefined;
  mode?: LlmMode;
  /** Defaults to `llmConfig()` (the environment, D1). */
  config?: LlmConfig;
  signal?: AbortSignal;
  /**
   * Look for several recipes in a text source (36e, D10): a video's text or
   * pasted text. Pages are read as one recipe, as before.
   */
  split?: boolean;
  /** The several-recipe attempt's deadline (default `SPLIT_DEADLINE_MS`). */
  splitDeadlineMs?: number;
  /**
   * The job (epic 37): the model's calls are `llm.*` steps, what is kept of
   * each reading is a `ground` note, the look for several recipes `split`
   * notes; its signal is the default `signal`.
   */
  job?: JobRun;
}

/**
 * How long looking for several recipes may take, all calls together (36e
 * review): then the text is read as one, as if the look had found nothing.
 * Four ~20 s readings and the list fit; a stuck call does not.
 */
export const SPLIT_DEADLINE_MS = 240_000;

/** One recipe of several the model found in one text (36e). */
export interface SplitReading {
  /**
   * 1-based, its place in the model's list — kept when a recipe before it
   * is left out, so the positions can have gaps (36e review); a pick by
   * name is steadier still.
   */
  n: number;
  /**
   * D4 held for it: grounded, an ingredient and a step. A video's untrusted
   * reading is kept without `partial` (T21), so this is what says "check it".
   */
  trusted: boolean;
  recipe: Partial<ImportedRecipe>;
  /**
   * The model's part; none for a page's own Recipe nodes (38c), which no
   * model read.
   */
  llm?: LlmImportInfo;
  warnings: string[];
  /** The line it starts at, as the text has it. */
  heading?: string;
  /** The video chapter it is made in (a component: its user's chapter). */
  chapter?: ChapterRef;
  /** Its ingredient lines that name another recipe of the batch (`target` is that recipe's `n`). */
  components?: ComponentRef[];
}

export interface ApplyLlmResult {
  recipe: Partial<ImportedRecipe> | undefined;
  /** Set whenever the model was asked (or, under auto, failed to answer). */
  llm?: LlmImportInfo;
  warnings: string[];
  /**
   * The model found several recipes (36e): each read on its own. `recipe`,
   * `llm` and `warnings` are then the first one's (the warnings led by one
   * that names them all), so a caller that knows nothing of `recipes` still
   * gets a recipe — every surface checks for it and asks which to import.
   */
  recipes?: SplitReading[];
  /** Listed, but left out: no recipe in its part, under the floor, a failed call. */
  leftOut?: { n: number; name: string; reason: string }[];
  /**
   * The recipe page a video's description linked, read instead of the
   * video (38c, `followRecipeLink`).
   */
  followed?: string;
  /**
   * A follow was attempted and could not be read — a transient failure
   * (403, a timeout) that must be retried, not kept in the reading cache
   * (38c review, `keptReading`).
   */
  followFailed?: boolean;
}

/** The mapper found a recipe body: ingredients or steps to keep. */
function hasRecipeBody(recipe: Partial<ImportedRecipe> | undefined): boolean {
  return (
    !!recipe &&
    !recipe.partial &&
    ((recipe.ingredients?.length ?? 0) > 0 ||
      (recipe.instructions?.length ?? 0) > 0)
  );
}

/** Whether `auto` asks the model about this result (D3, amended in 36b). */
export function autoWantsModel(
  mapped: Partial<ImportedRecipe> | undefined,
): boolean {
  return !hasRecipeBody(mapped);
}

/**
 * The model's recipe over the mapper's: the model's name, description,
 * yield, times, ingredients and steps where it has them; the page's image,
 * images, video, source and suggested tags always. An empty list from the
 * model never wipes the page's own (36b review): the mapper's ingredients or
 * steps stay, and `kept` says which. `partial` is not set here — `applyLlm`
 * decides it from the merged result.
 */
export function mergeExtraction(
  mapped: Partial<ImportedRecipe> | undefined,
  extracted: Partial<ImportedRecipe>,
): {
  recipe: Partial<ImportedRecipe>;
  kept: ("ingredients" | "instructions")[];
} {
  const {
    partial: _mappedPartial,
    ingredients: mappedIngredients,
    instructions: mappedInstructions,
    ...base
  } = mapped ?? {};
  void _mappedPartial;
  const merged: Partial<ImportedRecipe> = { ...base };
  const kept: ("ingredients" | "instructions")[] = [];
  for (const key of [
    "name",
    "description",
    "recipeYield",
    "prepTime",
    "cookTime",
    "totalTime",
  ] as const) {
    const value = extracted[key];
    if (value !== undefined && value !== "") {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  if (extracted.ingredients?.length) {
    merged.ingredients = extracted.ingredients;
  } else if (mappedIngredients?.length) {
    merged.ingredients = mappedIngredients;
    kept.push("ingredients");
  } else {
    merged.ingredients = [];
  }
  if (extracted.instructions?.length) {
    merged.instructions = extracted.instructions;
  } else if (mappedInstructions?.length) {
    merged.instructions = mappedInstructions;
    kept.push("instructions");
  } else {
    merged.instructions = [];
  }
  if (!merged.source && extracted.source) merged.source = extracted.source;
  if (!merged.videoImportUrl && extracted.videoImportUrl) {
    merged.videoImportUrl = extracted.videoImportUrl;
  }
  return { recipe: merged, kept };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Run the model on an import if `mode` says so, and decide what to keep.
 *
 * Never changes `mapped` when the model is not asked. Throws `ImportError`
 * only under `force`: with no model configured, or when the call fails.
 */
export async function applyLlm({
  url,
  source,
  mapped,
  mode = DEFAULT_LLM_MODE,
  config = llmConfig(),
  signal: ownSignal,
  split = false,
  splitDeadlineMs = SPLIT_DEADLINE_MS,
  job: run,
}: ApplyLlmInput): Promise<ApplyLlmResult> {
  const job = jobContext(run);
  const { log } = job;
  const signal = ownSignal ?? job.signal;
  const unchanged: ApplyLlmResult = { recipe: mapped, warnings: [] };
  if (mode === "off") return unchanged;
  assertLlmMode(mode, config);
  if (!config) {
    log.info("llm", "no local model configured — not asked");
    return unchanged;
  }
  if (mode === "auto" && !autoWantsModel(mapped)) {
    log.info("llm", "the page has a recipe body — auto does not ask the model");
    return unchanged;
  }
  /* A 404 page's text is not a recipe, whatever the mode. */
  if ("html" in source && source.ok === false) {
    log.info("llm", "the page did not answer 2xx — not read");
    return unchanged;
  }

  const { extractRecipeWithLlm, llmWarning, sourceWhere, GROUNDED_MIN } =
    await import("./extractRecipe");
  let text: string;
  let meta: ExtractMeta | undefined;
  let sourceKind: "page" | "text";
  let label: string | undefined;
  /* 36-T23: a paste's URL is cited, never put in the prompt. */
  const urlInPrompt = !("text" in source && source.pasted);
  if ("html" in source) {
    const { pageText } = await import("recipe-website-common/util/pageText");
    text = pageText(source.html);
    meta = source.meta
      ? {
          title: source.meta.ogTitle ?? source.meta.title,
          siteName: source.meta.siteName,
          author: source.meta.author,
        }
      : undefined;
    sourceKind = "page";
  } else {
    text = source.text;
    meta = source.meta;
    sourceKind = "text";
    label = source.label;
  }
  if (!text.trim()) {
    /*
     * Nothing to read (yt-dlp missing, an empty page). Under auto that is
     * just "not asked"; under force the caller asked for the model, so say
     * it was not used — a warning, not a failure: the mapper's result is
     * still a result (36b review).
     */
    log.info("llm", `${NO_TEXT} — not asked`);
    if (mode === "auto") return unchanged;
    return {
      recipe: mapped,
      llm: { model: config.model, mode, found: false, error: NO_TEXT },
      warnings: [`local model not used — ${NO_TEXT}`],
    };
  }

  let several: SeveralReading | undefined;
  if (split) {
    /*
     * Looking for several recipes is its own attempt (36e review): a list,
     * a question or a slice that times out or answers garbage must not cost
     * the single reading — the chili passes the gate and is one recipe.
     * One deadline over all of it; the caller's own abort still wins.
     */
    const deadline = AbortSignal.timeout(splitDeadlineMs);
    try {
      several = await readSeveral({
        text,
        url,
        meta,
        label,
        chapters: "html" in source ? undefined : source.chapters,
        urlInPrompt,
        mapped,
        mode,
        config,
        signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
        job,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (!(error instanceof LlmError) && !deadline.aborted) throw error;
      several = {
        note: `looking for several recipes failed — ${
          deadline.aborted
            ? `no answer within ${Math.round(splitDeadlineMs / 1000)} s`
            : describe(error)
        }; read as one`,
      };
    }
    if (several?.note) log.warn("split", several.note);
    if (several?.readings) return several.readings;
  }
  let extraction: LlmExtraction;
  try {
    extraction = await extractRecipeWithLlm({
      text,
      url,
      /* The mapper's name first: a schema's clean name beats "X | Site". */
      meta: { ...meta, title: mapped?.name ?? meta?.title },
      sourceKind,
      sourceLabel: label,
      urlInPrompt,
      config,
      signal,
      job,
    });
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    if (mode === "force") {
      throw new ImportError(`local model failed: ${error.message}`);
    }
    log.warn("llm", `the model failed under auto — imported without it`);
    return {
      recipe: mapped,
      llm: { model: config.model, mode, found: false, error: error.message },
      warnings: [`local model not used — ${describe(error)}`],
    };
  }

  const settled = settleExtraction({
    extraction,
    mapped,
    mode,
    sourceKind,
    label,
    extract: { llmWarning, sourceWhere, GROUNDED_MIN },
    log,
  });
  /* 36e: why a text that looked like several recipes was read as one. */
  if (several?.note) settled.warnings.push(several.note);
  return settled;
}

type ExtractModule = Pick<
  typeof import("./extractRecipe"),
  "llmWarning" | "sourceWhere" | "GROUNDED_MIN"
>;

/**
 * What to keep of one extraction (D3, D4 and the 36b floor), over the
 * mapper's recipe: the single reading's tail, and each recipe's of several
 * (36e) — so a batch is trusted, partial or discarded recipe by recipe.
 */
function settleExtraction({
  extraction,
  mapped,
  mode,
  sourceKind,
  label,
  extract: { llmWarning, sourceWhere, GROUNDED_MIN },
  log = NO_LOG,
  part,
}: {
  extraction: LlmExtraction;
  mapped: Partial<ImportedRecipe> | undefined;
  mode: Exclude<LlmMode, "off">;
  sourceKind: "page" | "text";
  label: string | undefined;
  extract: ExtractModule;
  log?: JobLog;
  /** A slice's place and name, for the `ground` note. */
  part?: StepData;
}): ApplyLlmResult & { trusted?: boolean } {
  const settled = settle({
    extraction,
    mapped,
    mode,
    sourceKind,
    label,
    extract: { llmWarning, sourceWhere, GROUNDED_MIN },
  });
  /* D3's `ground`: what was kept of the reading, and why. */
  const { llm } = settled;
  const outcome = !extraction.found
    ? "no recipe found"
    : llm?.discarded
      ? "discarded (under the floor)"
      : settled.trusted
        ? "trusted"
        : settled.recipe?.partial
          ? "partial"
          : "kept, untrusted";
  const level = settled.trusted || !extraction.found ? "info" : "warn";
  log[level](
    "ground",
    `${outcome}${llm?.total !== undefined ? ` — ${llm.grounded}/${llm.total} lines in the source` : ""}`,
    {
      ...part,
      outcome,
      ...(llm?.total !== undefined
        ? { grounded: llm.grounded, total: llm.total, verbatim: llm.verbatim }
        : {}),
      ...(settled.recipe?.partial ? { partial: true } : {}),
      ...(settled.trusted === false && extraction.found && !llm?.discarded
        ? { why: settled.warnings[0] }
        : {}),
    },
  );
  return settled;
}

function settle({
  extraction,
  mapped,
  mode,
  sourceKind,
  label,
  extract: { llmWarning, sourceWhere, GROUNDED_MIN },
}: {
  extraction: LlmExtraction;
  mapped: Partial<ImportedRecipe> | undefined;
  mode: Exclude<LlmMode, "off">;
  sourceKind: "page" | "text";
  label: string | undefined;
  extract: ExtractModule;
}): ApplyLlmResult & { trusted?: boolean } {
  const where = sourceWhere(sourceKind, label);
  if (!extraction.found) {
    return {
      recipe: mapped,
      llm: {
        model: extraction.llm.model,
        mode,
        found: false,
        durationMs: extraction.llm.durationMs,
      },
      warnings: [
        `local model ${extraction.llm.model} found no recipe ${where}`,
      ],
    };
  }

  const { llm: stats } = extraction;
  const info: LlmImportInfo = { ...stats, mode, found: true };
  if (stats.total > 0 && stats.grounded / stats.total < GROUNDED_FLOOR) {
    return {
      recipe: mapped,
      llm: { ...info, discarded: true },
      warnings: [
        `local model output discarded — only ${stats.grounded}/${stats.total} ingredient lines found ${where}`,
      ],
    };
  }
  const { recipe, kept } = mergeExtraction(mapped, extraction.recipe);
  const items = (recipe.ingredients ?? []).filter(
    (entry) => entry.type !== "heading",
  ).length;
  const steps = recipe.instructions?.length ?? 0;
  /*
   * D4 on the merged result: the model's own lines grounded (none of its
   * own, and the page's kept instead, counts as grounded), an ingredient
   * and a step.
   */
  const groundedEnough =
    stats.total > 0
      ? stats.grounded / stats.total >= GROUNDED_MIN
      : kept.includes("ingredients");
  const trusted = groundedEnough && items > 0 && steps > 0;
  /*
   * Under auto a result that was not partial — a video, a Recipe node with
   * an empty body — never becomes partial: before the model it imported, and
   * asking the model must not turn that into a refusal (36b review). The
   * lines stay, with a warning.
   */
  const keepWhole = mode === "auto" && !!mapped && !mapped.partial;
  const warnings: string[] = [];
  if (trusted) {
    warnings.push(
      llmWarning(stats, { items, steps, trusted }, sourceKind, label),
    );
  } else if (keepWhole) {
    const why =
      items === 0
        ? "it found no ingredients"
        : steps === 0
          ? "it found no instructions"
          : `only ${stats.grounded}/${stats.total} ingredient lines found ${where}`;
    warnings.push(
      `local model ${stats.model}'s reading is incomplete — ${why}; kept, since the import had nothing in its place; check it against the source`,
    );
  } else {
    warnings.push(
      llmWarning(stats, { items, steps, trusted }, sourceKind, label),
    );
    recipe.partial = true;
  }
  for (const list of kept) {
    warnings.push(
      `the local model returned no ${list}: the page's own ${list} are kept`,
    );
  }
  return { recipe, llm: info, warnings, trusted };
}

/* ------------------------------------------------------------------ */
/* Several recipes in one text (36e, D10)                              */
/* ------------------------------------------------------------------ */

/** `readSeveral`'s answer: the batch, or why the text was read as one. */
interface SeveralReading {
  readings?: ApplyLlmResult & { recipes: SplitReading[] };
  note?: string;
}

/**
 * Several recipes in one text (`splitRecipes.ts`): the gate, the model's
 * list, a D7 reading per slice, each settled on its own; then the
 * components and the chapters. `undefined` (or only a `note`) when the text
 * is one recipe, and the caller reads it as before.
 *
 * Each recipe starts from the mapper's (a video's thumbnail, channel,
 * source, video and suggested tags are the whole batch's) without its
 * description — a video's is every recipe's at once. A recipe the model
 * found nothing in, or whose reading fell under the floor, is left out with
 * a warning; fewer than two left is read as one recipe after all.
 */
async function readSeveral({
  text,
  url,
  meta,
  label,
  chapters = [],
  urlInPrompt = true,
  mapped,
  mode,
  config,
  signal,
  job,
}: {
  text: string;
  url?: string;
  meta?: ExtractMeta;
  label?: string;
  chapters?: ChapterRef[];
  /** Name `url` to the model (36-T23: not for a paste). */
  urlInPrompt?: boolean;
  mapped: Partial<ImportedRecipe> | undefined;
  mode: Exclude<LlmMode, "off">;
  config: LlmConfig;
  signal?: AbortSignal;
  job: JobRun;
}): Promise<SeveralReading | undefined> {
  const { log } = jobContext(job);
  const { capText } = await import("recipe-website-common/util/pageText");
  const capped = capText(text).text;
  const split = await import("./splitRecipes");
  /* D3's `split`: the gate, the names, the slices. */
  const blocks = split.ingredientBlocks(capped);
  if (!split.mayHoldSeveral(capped)) {
    log.info("split", "the gate: one recipe — read as one", {
      gate: false,
      blocks,
    });
    return undefined;
  }
  log.info("split", "the gate: may hold several — asking the model", {
    gate: true,
    blocks,
  });
  const promptUrl = urlInPrompt ? url : undefined;
  const listed = await split.listRecipes({
    text: capped,
    url: promptUrl,
    meta,
    config,
    signal,
    job,
  });
  if (listed.recipes.length < 2) {
    log.info("split", `listed ${listed.recipes.length} — read as one`);
    return undefined;
  }
  const names = listed.recipes.map((recipe) => recipe.name || recipe.heading);
  /* Parts of one dish (a chicken, its sauce, its rice) are one recipe. */
  if (
    await split.isOneDish({
      text: capped,
      url: promptUrl,
      meta,
      config,
      signal,
      job,
    })
  ) {
    return {
      note: `local model ${listed.model} read ${names.join(", ")} as parts of one dish — read as one`,
    };
  }
  const starts = split.locateRecipes(capped, listed.recipes);
  if (!starts) {
    return {
      note: `local model ${listed.model} listed ${listed.recipes.length} recipes (${names.join(", ")}), but not where each starts — read as one`,
    };
  }

  const extract = await import("./extractRecipe");
  const { capsName } = await import("./tidyReading");
  const { description: _description, ...base } = mapped ?? {};
  void _description;
  const slices = split.sliceText(capped, starts);
  log.info("split", `cut into ${slices.length} recipes`, {
    names,
    slices: slices.map((slice) => slice.length),
  });
  const notes: string[] = [];
  const leftOut: NonNullable<ApplyLlmResult["leftOut"]> = [];
  const kept: {
    n: number;
    settled: ApplyLlmResult & {
      recipe: Partial<ImportedRecipe>;
      trusted?: boolean;
    };
    heading: string;
    names: string[];
  }[] = [];
  for (const [index, slice] of slices.entries()) {
    const listedRecipe = listed.recipes[index];
    const leave = (reason: string) => {
      leftOut.push({ n: index + 1, name: names[index], reason });
      notes.push(`"${names[index]}": ${reason} — left out`);
    };
    const part = { part: `${index + 1}/${slices.length}`, name: names[index] };
    let extraction: LlmExtraction;
    try {
      extraction = await extract.extractRecipeWithLlm({
        text: slice,
        url,
        meta: { ...meta, title: listedRecipe.name || meta?.title },
        sourceKind: "text",
        sourceLabel: label,
        urlInPrompt,
        config,
        signal,
        job,
        stepData: part,
      });
    } catch (error) {
      /* One slice's failed call is that slice's (36e review); an abort —
       * the caller's or the deadline's — is the whole attempt's. */
      if (!(error instanceof LlmError) || signal?.aborted) throw error;
      leave(`local model failed — ${describe(error)}`);
      continue;
    }
    const settled = settleExtraction({
      extraction,
      mapped: mapped ? base : undefined,
      mode,
      sourceKind: "text",
      label,
      extract,
      log,
      part,
    });
    if (!settled.recipe || !extraction.found || settled.llm?.discarded) {
      leave(settled.warnings.join("; "));
      continue;
    }
    /* The list's name: it saw the whole text ("Stuffing", not "STUFFING"),
     * in title case when it is in capitals too (38c, 36-T25). */
    if (listedRecipe.name) {
      const tidy = capsName(listedRecipe.name);
      if (tidy) {
        log.info("tidy", `T25: name "${listedRecipe.name}" → "${tidy}"`, {
          ...part,
          rule: "caps-name",
          trap: "T25",
        });
      }
      settled.recipe.name = tidy ?? listedRecipe.name;
    }
    kept.push({
      n: index + 1,
      settled: { ...settled, recipe: settled.recipe },
      heading: slice.split("\n")[0]?.trim() ?? "",
      names: [
        listedRecipe.name,
        listedRecipe.heading,
        extraction.recipe.name ?? "",
      ].filter(Boolean),
    });
  }
  if (kept.length < 2) {
    return {
      note: [
        `local model ${listed.model} listed ${listed.recipes.length} recipes (${names.join(", ")}), but read fewer than two — read as one`,
        ...notes,
      ].join("; "),
    };
  }

  const components = split.findComponents(
    kept.map(({ names: recipeNames, settled }) => ({
      names: recipeNames,
      ingredients: settled.recipe.ingredients ?? [],
    })),
  );
  const placed = split.placeInChapters(
    kept.map(({ names: recipeNames }) => recipeNames),
    components,
    chapters,
  );
  const { withVideoStart } =
    await import("recipe-website-common/util/videoUrl");
  const recipes = kept.map(({ n, settled, heading }, index): SplitReading => {
    const chapter = placed[index];
    /* Its chapter's start, or none — never a start the person pasted. */
    const start = chapter?.start ?? 0;
    const recipe = { ...settled.recipe };
    if (recipe.source?.url) {
      recipe.source = {
        ...recipe.source,
        url: withVideoStart(recipe.source.url, start),
      };
    }
    if (recipe.videoImportUrl) {
      recipe.videoImportUrl = withVideoStart(recipe.videoImportUrl, start);
    }
    return {
      /* The list's position: a left-out recipe leaves a gap (M3). */
      n,
      recipe,
      llm: settled.llm!,
      warnings: settled.warnings,
      trusted: settled.trusted === true,
      ...(heading ? { heading } : {}),
      ...(chapter ? { chapter } : {}),
      ...(components[index].length > 0
        ? {
            components: components[index].map((ref) => ({
              line: ref.line,
              target: kept[ref.target].n,
            })),
          }
        : {}),
    };
  });
  const where = extract.sourceWhere("text", label);
  const found = `local model ${listed.model} found ${recipes.length} recipes ${where}: ${recipes
    .map((reading) => `${reading.n}. ${reading.recipe.name}`)
    .join(", ")}${PICK_PROMPT}`;
  const [first] = recipes;
  log.info("split", `${recipes.length} recipes read`, {
    kept: recipes.map((reading) => reading.n),
    ...(leftOut.length ? { leftOut: leftOut.map((entry) => entry.n) } : {}),
  });
  return {
    readings: {
      recipe: first.recipe,
      llm: first.llm,
      warnings: [found, ...notes, ...first.warnings],
      recipes,
      ...(leftOut.length ? { leftOut } : {}),
    },
  };
}

/**
 * The end of the several-recipes warning while nothing is picked yet. An
 * import that was given `pick` or `all` says what it took instead
 * (`pickedWarnings`).
 */
export const PICK_PROMPT = " — pick the ones to import, by name";

/**
 * The several-recipes warning once picks are made (37a review): "… found 4
 * recipes …: 1. A, 2. B — picked 2. B", or "— all picked". Other warnings
 * pass as they are.
 */
export function pickedWarnings(
  warnings: readonly string[],
  picked: "all" | readonly { n: number; name?: string }[],
): string[] {
  const said =
    picked === "all"
      ? " — all picked"
      : ` — picked ${picked.map((pick) => `${pick.n}. ${pick.name ?? ""}`.trim()).join(", ")}`;
  return warnings.map((warning) =>
    warning.endsWith(PICK_PROMPT)
      ? `${warning.slice(0, -PICK_PROMPT.length)}${said}`
      : warning,
  );
}

/* ------------------------------------------------------------------ */
/* Several Recipe nodes on one page (38c)                              */
/* ------------------------------------------------------------------ */

/**
 * The most recipes a batch offers, whichever way it arrives (36e's picker,
 * `--pick`/`--all`, and the form's `RecipeBatchInputSchema`, which bounds
 * `n` and the picks by the same number): past this, a roundup-style list
 * page is capped, with a warning, rather than breaking the picker (38-Dc7,
 * 38c review).
 */
export const MAX_BATCH_RECIPES = 30;

/**
 * A page that publishes several recipes of its own (`mapRecipeNodes`) as a
 * batch, with the contract of a several-recipe video or paste (36e): the
 * picker on the form, `--pick` / `--all` on the CLI and MCP. No model read
 * them — each is its Recipe node, mapped — so each is trusted and has no
 * `llm`; `recipe` and `warnings` lead with the first, as `readSeveral`'s do.
 * The model is not asked, whatever the mode (38-Dc4): a page is never split
 * by the model, and `asOne` (the caller's) is the way to read the page as
 * before — its first node, then the model as the mode says.
 *
 * A page over `MAX_BATCH_RECIPES` (38-Dc7: a roundup-style index marking up
 * every card as its own Recipe node) is capped to the first that many, with
 * a warning — simpler than a second picker path, and the first recipes are
 * usually the page's own rather than a related-posts carousel's.
 */
export function schemaReadings(
  recipes: readonly Partial<ImportedRecipe>[],
  { mode = DEFAULT_LLM_MODE, job }: { mode?: LlmMode; job?: JobRun } = {},
): ApplyLlmResult & { recipes: SplitReading[] } {
  const capped = recipes.length > MAX_BATCH_RECIPES;
  const kept = capped ? recipes.slice(0, MAX_BATCH_RECIPES) : recipes;
  const readings = kept.map(
    (recipe, index): SplitReading => ({
      n: index + 1,
      trusted: true,
      recipe,
      warnings: [],
    }),
  );
  const names = readings.map(
    (reading) =>
      `${reading.n}. ${reading.recipe.name ?? `Recipe ${reading.n}`}`,
  );
  jobContext(job).log.info(
    "split",
    `the page has ${readings.length} recipes of its own — a batch`,
    {
      schema: true,
      names: readings.map((reading) => reading.recipe.name),
      ...(capped ? { cappedFrom: recipes.length } : {}),
    },
  );
  const warnings = [
    `the page has ${readings.length} recipes: ${names.join(", ")}${PICK_PROMPT}`,
    ...(capped
      ? [
          `the page holds ${recipes.length} recipes; only the first ${MAX_BATCH_RECIPES} are offered`,
        ]
      : []),
    ...(mode === "force"
      ? [
          "the local model was not asked: the page's own recipe data holds each recipe (--as-one reads its first, with the model)",
        ]
      : []),
  ];
  return {
    recipe: readings[0].recipe,
    warnings,
    recipes: readings,
  };
}

/** Why `force` read nothing. */
const NO_TEXT = "no text to read";

/**
 * `force` with no model configured is refused before anything is fetched
 * (a roundup would otherwise fail every item the same way). `auto` and `off`
 * always pass.
 */
export function assertLlmMode(
  mode: LlmMode | undefined,
  config: LlmConfig | undefined = llmConfig(),
): void {
  if (mode === "force" && !config) {
    throw new ImportError(LLM_UNCONFIGURED_MESSAGE);
  }
}

/** The model's lines are in the recipe: say so in the commit (D5). */
export function usedModel(llm: LlmImportInfo | undefined): boolean {
  return !!llm?.found && !llm.discarded;
}

/* ------------------------------------------------------------------ */
/* Pasted text (D8, 36c)                                               */
/* ------------------------------------------------------------------ */

export interface PastedTextInput {
  /** The recipe's text: a video description, an email, a note. */
  text: string;
  /**
   * Where it came from. Cited as `source` (`buildSource`), and a video URL
   * (`isVideoUrl`) also sets `video`. Never fetched.
   */
  source?: string;
  /** Defaults to `llmConfig()` (the environment, D1). */
  config?: LlmConfig;
  signal?: AbortSignal;
  /** Look for several recipes (36e); `false` reads the text as one. */
  split?: boolean;
  /** The job (epic 37): its log, and its signal as the default `signal`. */
  job?: JobRun;
  /**
   * What the text is, when it is not a paste (38e): "the photo's
   * transcription". The warnings name it ("read from the photo's
   * transcription by local model …"), and the log's `text` note.
   */
  label?: string;
}

/** What the model made of pasted text: always a recipe, always `llm`. */
export interface PastedTextReading extends ApplyLlmResult {
  recipe: Partial<ImportedRecipe>;
  llm: LlmImportInfo;
}

/**
 * A pasted text's source URL as cited: http(s) only, without its fragment
 * (the URL importer's own rule). An empty string is no source.
 */
export function pastedSourceUrl(
  source: string | undefined,
): string | undefined {
  const trimmed = source?.trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ValidationError(`"${trimmed}" is not a URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ValidationError(`"${trimmed}" is not an http(s) URL`);
  }
  /* The parsed form, as cited: no fragment (the URL importer's rule). */
  parsed.hash = "";
  return parsed.href;
}

/**
 * A paste cut in the middle (`capText`, past `PAGE_TEXT_MAX_CHARS`): what
 * the model did not read, as a note for the warnings and the failure (36c
 * review). An email thread with the recipe in a quoted middle part would
 * otherwise read as "found no recipe" with no hint why.
 */
export function pastedTextCutNote(
  length: number,
  kept: { head: number; tail: number },
): string {
  const k = (chars: number) => `~${Math.max(1, Math.round(chars / 1000))}k`;
  return `the text is ${length} characters; the model read the first ${k(kept.head)} and the last ${k(kept.tail)} — paste just the recipe`;
}

/**
 * Read a pasted recipe with the local model (D8): the text mode of every
 * surface — the `import` seat's `importFromText`, the form's "Paste text"
 * tab — goes through here.
 *
 * It is `applyLlm` under `force` with nothing mapped: the same extractor,
 * cap, D4 grounding (against the pasted text) and 36b floor. What differs is
 * that there is nothing to fall back to, so every way of not getting a
 * recipe is an `ImportError` (`import_failed`): no model configured, a
 * failed call, `found: false`, or a reading under `GROUNDED_FLOOR`. Between
 * the floor and D4's 90% the recipe comes back `partial`, as a page's does.
 */
export async function readPastedText({
  text,
  source,
  config = llmConfig(),
  signal,
  split = true,
  job,
  label,
}: PastedTextInput): Promise<PastedTextReading> {
  const normalised = normalisePastedText(text);
  jobContext(job).log.info("text", label ?? "pasted text", {
    chars: normalised.length,
    ...(source ? { source } : {}),
  });
  if (!normalised.trim()) {
    throw new ValidationError("No text to import: paste the recipe's text.");
  }
  if (normalised.length > PASTED_TEXT_MAX_CHARS) {
    throw new ValidationError(
      `The text is ${normalised.length} characters; a pasted recipe can be at most ${PASTED_TEXT_MAX_CHARS}.`,
    );
  }
  const url = pastedSourceUrl(source);
  if (!config) throw new ImportError(LLM_UNCONFIGURED_MESSAGE);
  /* The extractor caps the text the same way; this only says so. */
  const { capText } = await import("recipe-website-common/util/pageText");
  const { kept } = capText(normalised);
  const cutNote = kept ? pastedTextCutNote(normalised.length, kept) : undefined;
  const applied = await applyLlm({
    url,
    source: { text: normalised, pasted: true, ...(label ? { label } : {}) },
    mapped: undefined,
    mode: "force",
    config,
    signal,
    /* 36e: a paste can hold several recipes, as a video can — unless the
     * caller asked for one (`asOne`). */
    split,
    job,
  });
  const warnings = cutNote ? [...applied.warnings, cutNote] : applied.warnings;
  if (!applied.recipe || !applied.llm) {
    throw new ImportError(
      [`No recipe read from ${label ?? "the pasted text"}`, ...warnings].join(
        " — ",
      ),
    );
  }
  return { ...applied, warnings, recipe: applied.recipe, llm: applied.llm };
}
