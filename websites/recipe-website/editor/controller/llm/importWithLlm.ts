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
import type { ExtractMeta, LlmStats } from "./extractRecipe";
import { DEFAULT_LLM_MODE, type LlmMode } from "./mode";

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
    };

/**
 * The comment a recipe may sit in (36d): the pinned one, else the uploader's
 * longest. Many creators post the recipe there instead of the description.
 * (`pickYtdlpMetadata` has already dropped every other comment.)
 */
export function recipeComment(meta: YtdlpMetadata): YtdlpComment | undefined {
  const comments = meta.comments ?? [];
  const pinned = comments.find((comment) => comment.pinned);
  if (pinned) return pinned;
  return comments.reduce<YtdlpComment | undefined>(
    (longest, comment) =>
      comment.byUploader &&
      (!longest || comment.text.length > longest.text.length)
        ? comment
        : longest,
    undefined,
  );
}

/**
 * A video as the model's source (D3, widened in 36d): the title, the
 * description, and the pinned (or the uploader's) comment as a "Pinned
 * comment:" block — many creators post the recipe there. The whole of it is
 * what D4 grounds the model's lines against. The channel is the site. A
 * comment is there only when the fetch asked for one, which it does only
 * when a model will read it (`videoFetchOptions`).
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
  const comment = recipeComment(meta);
  const description = meta.description.trim();
  const blocks = [meta.title, description];
  if (comment) {
    blocks.push(
      `${comment.pinned ? "Pinned comment" : "Comment by the uploader"}:\n${comment.text}`,
    );
  }
  const parts = [
    ...(description ? ["description"] : []),
    ...(comment ? [comment.pinned ? "pinned comment" : "comment"] : []),
  ];
  return {
    text: blocks.filter(Boolean).join("\n\n"),
    meta: {
      title: meta.title || undefined,
      siteName: meta.channel || meta.uploader || undefined,
    },
    label:
      parts.length > 0 ? `the video's ${parts.join(" and ")}` : "the video",
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
}

export interface ApplyLlmResult {
  recipe: Partial<ImportedRecipe> | undefined;
  /** Set whenever the model was asked (or, under auto, failed to answer). */
  llm?: LlmImportInfo;
  warnings: string[];
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
  signal,
}: ApplyLlmInput): Promise<ApplyLlmResult> {
  const unchanged: ApplyLlmResult = { recipe: mapped, warnings: [] };
  if (mode === "off") return unchanged;
  assertLlmMode(mode, config);
  if (!config) return unchanged;
  if (mode === "auto" && !autoWantsModel(mapped)) return unchanged;
  /* A 404 page's text is not a recipe, whatever the mode. */
  if ("html" in source && source.ok === false) return unchanged;

  const { extractRecipeWithLlm, llmWarning, sourceWhere, GROUNDED_MIN } =
    await import("./extractRecipe");
  let text: string;
  let meta: ExtractMeta | undefined;
  let sourceKind: "page" | "text";
  let label: string | undefined;
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
    if (mode === "auto") return unchanged;
    return {
      recipe: mapped,
      llm: { model: config.model, mode, found: false, error: NO_TEXT },
      warnings: [`local model not used — ${NO_TEXT}`],
    };
  }

  let extraction;
  try {
    extraction = await extractRecipeWithLlm({
      text,
      url,
      /* The mapper's name first: a schema's clean name beats "X | Site". */
      meta: { ...meta, title: mapped?.name ?? meta?.title },
      sourceKind,
      sourceLabel: label,
      config,
      signal,
    });
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    if (mode === "force") {
      throw new ImportError(`local model failed: ${error.message}`);
    }
    return {
      recipe: mapped,
      llm: { model: config.model, mode, found: false, error: error.message },
      warnings: [`local model not used — ${describe(error)}`],
    };
  }

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
  return { recipe, llm: info, warnings };
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
}: PastedTextInput): Promise<PastedTextReading> {
  const normalised = normalisePastedText(text);
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
    source: { text: normalised },
    mapped: undefined,
    mode: "force",
    config,
    signal,
  });
  const warnings = cutNote ? [...applied.warnings, cutNote] : applied.warnings;
  if (!applied.recipe || !applied.llm) {
    throw new ImportError(
      ["No recipe read from the pasted text", ...warnings].join(" — "),
    );
  }
  return { ...applied, warnings, recipe: applied.recipe, llm: applied.llm };
}
