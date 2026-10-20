/**
 * Ask (43q): a question becomes a filled-in page. Editor only, never a write
 * (D1): this reads the vocabulary, asks the model once, grounds its answer
 * and hands back a URL — nothing here calls a write seat, starts a job or
 * touches the content repository's git.
 *
 * **The model** is the import layer's (`chatJson`, epic 36): `RECIPE_LLM_*`,
 * the local model through the machine's `gpu` queue line in the
 * `interactive` tier (37b — an Ask waits behind a running import's call, not
 * beside it), or the Claude API (38g), which takes no queue line. An Ask is
 * not a job: it lasts seconds, its answer is a URL the person sees at once,
 * and a step log nobody opens would only fill `RECIPE_JOBS_DIR`.
 *
 * **Never stuck.** The whole Ask — the queue wait, a cold model load, the
 * call — is bounded by `ASK_TIMEOUT_MS`; a timeout, a failure, an answer that
 * isn't one or that names a tag the site lacks all end in the same place:
 * the fallback search for the question's words (`fallbackTarget`).
 */
import {
  buildFacetModel,
  facetTermsFromOptions,
} from "recipe-website-common/util/facets";
import { prepareCorpus } from "recipe-website-common/util/makeable";
import {
  mergeTagVocabulary,
  tagOptions,
} from "recipe-website-common/controller/tagVocabulary";
import { buildTagExpansion } from "recipe-website-common/controller/tagExpansion";
import { readAggregate } from "@discontent/cms/aggregates/readAggregate";
import { readTaxonomyTerms } from "@discontent/cms/taxonomies/read";
import { termTreeAggregate } from "@discontent/cms/taxonomies/tree";
import { groupContentConfig } from "recipe-website-common/controller/groupContentConfig";
import { groupTagTaxonomy } from "recipe-website-common/controller/groupTagTaxonomy";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import { recipeTagTaxonomy } from "recipe-website-common/controller/recipeTagTaxonomy";
import { tagTermContentConfig } from "recipe-website-common/controller/tagTermContentConfig";
import type { CurationContext } from "../curation/context";
import { listGroups } from "../curation/groups";
import { readMakeCorpus } from "../curation/inventory";
import {
  chatJson,
  llmConfig,
  LlmError,
  modelLabel,
  type LlmConfig,
} from "../llm/client";
import {
  ASK_JSON_SCHEMA,
  ASK_SCHEMA_NAME,
  fallbackTarget,
  groundAnswer,
  type AskPage,
  type AskRefusal,
  type AskVocabulary,
} from "./answer";
import { askPrompt } from "./prompt";

/**
 * How long an Ask may take, all told (Dq3): the queue wait for the `gpu`
 * line, a cold load of the local model (4–9 s for qwen3:8b, 40a) and the
 * call. Long enough for a cold start behind a short import call; short
 * enough that a person waiting at ⌘K gets the word search instead of a
 * spinner. The Claude API, with no load and no queue, answers well inside it.
 */
export const ASK_TIMEOUT_MS = 30_000;

/** Groups read for the plans block and for grounding a plan's slug. */
const ASK_GROUP_READ = 500;

/** What `/api/ask` answers: always a URL — the page, or the fallback search. */
export interface AskResult {
  question: string;
  page: AskPage;
  url: string;
  /** "What can I make: drinks with lime", or the fallback's sentence. */
  label: string;
  /** Present when this is the fallback: why the answer was not used. */
  fallback?: AskRefusal;
  /** Who answered (`modelLabel`), when a model was asked. */
  model?: string;
  /** Wall time of the whole Ask. */
  durationMs: number;
  /** The prompt's tokens, over-counted, and the context asked for (40a). */
  promptTokens?: number;
  numCtx?: number;
}

/**
 * Everything Ask grounds against, read Node-safe — the reads `tag:` uses on
 * the server (`readTagResolver`), the groups, and `/make`'s corpus — so the
 * route, a CLI and the vitest read alike.
 */
export async function readAskVocabulary(
  ctx: CurationContext,
): Promise<AskVocabulary> {
  const { contentDirectory } = ctx;
  const [recipeTerms, groupTerms, tree, groups, recipes] = await Promise.all([
    readTaxonomyTerms({
      config: recipeContentConfig,
      taxonomy: recipeTagTaxonomy,
      contentDirectory,
    }),
    readTaxonomyTerms({
      config: groupContentConfig,
      taxonomy: groupTagTaxonomy,
      contentDirectory,
    }),
    readAggregate({
      config: tagTermContentConfig,
      aggregateConfig: termTreeAggregate(),
      contentDirectory,
    }),
    /* A site with no groups yet has no group index to read. */
    listGroups(ctx, { limit: ASK_GROUP_READ }).catch(() => ({ groups: [] })),
    readMakeCorpus(ctx),
  ]);
  const options = tagOptions(
    mergeTagVocabulary({ recipeTerms, groupTerms, tree }),
    tree,
  );
  return {
    model: buildFacetModel(facetTermsFromOptions(options)),
    resolver: buildTagExpansion(options),
    groups: groups.groups.map(({ slug, name, kind, date }) => ({
      slug,
      name,
      kind,
      date,
    })),
    recipes,
    prepared: prepareCorpus(recipes),
  };
}

export interface AskOptions {
  /** Defaults to `llmConfig()`. */
  config?: LlmConfig;
  /** The caller's abort (the request's): an Ask nobody waits for stops. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** The vocabulary, when the caller has it (tests). */
  vocabulary?: AskVocabulary;
  today?: Date;
}

/** One Ask: the model's answer grounded, or the fallback — never a throw. */
export async function ask(
  ctx: CurationContext,
  question: string,
  options: AskOptions = {},
): Promise<AskResult> {
  const started = Date.now();
  const words = question.replace(/\s+/g, " ").trim();
  const config = options.config ?? llmConfig();
  const fallback = (
    refusal: AskRefusal,
    extra: Partial<AskResult> = {},
  ): AskResult => {
    const target = fallbackTarget(words);
    return {
      question: words,
      ...target,
      fallback: refusal,
      ...extra,
      durationMs: Date.now() - started,
    };
  };
  if (!config) {
    return fallback({ code: "unconfigured", detail: "no model is set up" });
  }
  const timeoutMs = options.timeoutMs ?? ASK_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;

  const vocabulary = options.vocabulary ?? (await readAskVocabulary(ctx));
  const prompt = askPrompt(words, vocabulary, options.today);
  const said = {
    model: modelLabel(config),
    promptTokens: prompt.tokens,
    numCtx: prompt.numCtx,
  };
  let data: unknown;
  try {
    const result = await chatJson({
      system: prompt.system,
      user: prompt.user,
      schema: ASK_JSON_SCHEMA,
      schemaName: ASK_SCHEMA_NAME,
      config,
      numCtx: prompt.numCtx,
      timeoutMs,
      /* The queue wait and the call both end at the timeout (Dq3). */
      signal,
    });
    data = result.data;
  } catch (error) {
    if (
      timeout.aborted ||
      (error instanceof LlmError && error.kind === "timeout")
    ) {
      return fallback(
        {
          code: "timeout",
          detail: `no answer within ${Math.round(timeoutMs / 1000)} s`,
        },
        said,
      );
    }
    return fallback(
      {
        code: "model",
        detail:
          error instanceof Error ? error.message : String(error ?? "failed"),
      },
      said,
    );
  }
  const grounded = groundAnswer(data, vocabulary, words);
  if (!grounded.ok) return fallback(grounded.refusal, said);
  return {
    question: words,
    ...grounded.target,
    ...said,
    durationMs: Date.now() - started,
  };
}
