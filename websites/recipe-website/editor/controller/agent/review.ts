/**
 * The review of a run's held writes (epic 48, 48b, Db1–Db3): what the
 * curator page's "Review before it saves" shows (`curatorReview`), and its
 * Save (`applyReview`), which runs the ticked calls exactly as the model
 * asked — a `term_assign`'s `add` narrowed to the recipes left ticked, never
 * widened — through the same tools the run had (44b's bridge, unheld), as
 * the person, and records every decision beside the run the call was made
 * in (`reviewStore.ts`). The model is not asked again.
 *
 * - **One commit per call** (Db2): each applied call is the tool's own
 *   write, so the Git page reverts any one of them, as before 48b.
 * - **In order**: calls apply in the order the model made them, so a held
 *   import or create lands before the assign that names its slug. A call
 *   that fails is recorded with its error; the rest still run.
 * - **Only an ended run** is reviewed: a live one may still hold more
 *   (`job_live`, 409).
 */
import { getRecipeBySlug } from "recipe-website-common/controller/data/read";
import { tagSlug } from "recipe-website-common/controller/tagSlug";
import { createLocalBackend } from "../../cli/backend/local";
import type { CurationContext } from "../curation/context";
import {
  JobLiveError,
  NotFoundError,
  ValidationError,
  withJob,
} from "../curation/errors";
import { jobsDirectory } from "../jobs/location";
import { LIVE_STATUSES, settleOrphanedJob } from "../jobs/store";
import { requireJob } from "../jobs/views";
import { tagMisses, writeSummary } from "./changes";
import { recipeNames } from "./conversation";
import {
  heldCalls,
  heldPhrase,
  narrowedAdd,
  type HeldCall,
  type HeldDecision,
  type HeldState,
} from "./held";
import { readDecisions, recordDecisions, withReviewLock } from "./reviewStore";
import { recipeAgentTools } from "./tools";
import {
  historyOf,
  readTranscriptText,
  transcriptRecords,
  type TranscriptRecord,
} from "./transcript";
import type { AgentHeld } from "./types";

/** A recipe a held call names, as the content stands now. */
export interface CuratorReviewRecipe {
  slug: string;
  name: string;
  image?: string;
  tags?: string[];
  /** Not a recipe (yet): a held import or create may make it. */
  missing?: true;
  /** Already carries the term a held `term_assign` adds: no change. */
  alreadyTagged?: true;
}

export interface CuratorReviewCall {
  id: string;
  /** The run the call was made in. */
  job: string;
  tool: string;
  /** "Create “Pork Braise”", "Tag 2 recipes middle-eastern" (`heldPhrase`). */
  phrase: string;
  input: unknown;
  held: AgentHeld;
  state: HeldState;
  decidedAt?: number;
  error?: string;
  /** The `add` it ran with, when the person narrowed it. */
  appliedAdd?: string[];
  /** A `term_assign`: each recipe it adds, read now. */
  recipes?: CuratorReviewRecipe[];
  /** A `recipe_update` / `recipe_set_image`: the recipe it changes. */
  target?: CuratorReviewRecipe;
  /** A `recipe_update`: the fields its patch sets. */
  fields?: string[];
  /**
   * The tagging post-check (48a, moved into the review): what this run's
   * searches found that a held `term_assign` for the term leaves out.
   */
  missed?: { slug: string; name?: string }[];
  missedCount?: number;
  unseen?: number;
}

export interface CuratorReview {
  calls: CuratorReviewCall[];
  /** Calls still waiting for the person. */
  pending: number;
  /** The newest run is still live: nothing can be decided yet. */
  live: boolean;
}

/** At most this many recipes are read for a review's cards. */
export const REVIEW_RECIPES_MAX = 48;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function isLive(dir: string, id: string): Promise<boolean> {
  const meta = await requireJob(id, dir);
  if (!LIVE_STATUSES.includes(meta.status)) return false;
  const settled = await settleOrphanedJob(dir, meta).then(
    (result) => result.meta,
    () => meta,
  );
  return LIVE_STATUSES.includes(settled.status);
}

async function agentRecords(
  id: string,
  dir: string,
): Promise<{ id: string; records: TranscriptRecord[] }> {
  const meta = await requireJob(id, dir);
  if (meta.kind !== "agent") {
    throw new NotFoundError(`Job ${meta.id} is not an agent run.`);
  }
  const text = await readTranscriptText(dir, meta.id);
  return { id: meta.id, records: text ? transcriptRecords(text) : [] };
}

/** The review of run `id`'s conversation: its held calls and how each stands. */
export async function curatorReview(
  id: string,
  {
    dir = jobsDirectory(),
    contentDirectory,
  }: { dir?: string; contentDirectory: string },
): Promise<CuratorReview> {
  const { id: runId, records } = await agentRecords(id, dir);
  const calls = heldCalls(records);
  const decisions = await readDecisions(dir, calls);
  const names = recipeNames(records);
  const misses = new Map(
    tagMisses(historyOf(records)).map((miss) => [miss.term, miss]),
  );
  let reads = 0;
  const cache = new Map<string, CuratorReviewRecipe>();
  const readRecipe = async (slug: string): Promise<CuratorReviewRecipe> => {
    const known = cache.get(slug);
    if (known) return known;
    const fallback = { slug, name: names.get(slug) ?? slug };
    if (reads >= REVIEW_RECIPES_MAX) return fallback;
    reads += 1;
    try {
      const stored = await getRecipeBySlug({ slug, contentDirectory });
      const card: CuratorReviewRecipe = {
        slug,
        name: stored.name || fallback.name,
        ...(typeof stored.image === "string" ? { image: stored.image } : {}),
        ...(Array.isArray(stored.tags)
          ? {
              tags: stored.tags.filter(
                (tag): tag is string => typeof tag === "string",
              ),
            }
          : {}),
      };
      cache.set(slug, card);
      return card;
    } catch {
      const missing = { ...fallback, missing: true as const };
      cache.set(slug, missing);
      return missing;
    }
  };

  const out: CuratorReviewCall[] = [];
  for (const call of calls) {
    const decision = decisions.get(call.id);
    const input = isObject(call.input) ? call.input : {};
    const row: CuratorReviewCall = {
      id: call.id,
      job: call.job,
      tool: call.tool,
      phrase: heldPhrase(
        { name: call.tool, input: call.input },
        call.held,
        names,
      ),
      input: call.input,
      held: call.held,
      state: decision?.state ?? "pending",
      ...(decision ? { decidedAt: decision.at } : {}),
      ...(decision?.error ? { error: decision.error } : {}),
    };
    if (decision?.input && call.tool === "term_assign") {
      row.appliedAdd = strings(
        isObject(decision.input) ? decision.input.add : undefined,
      );
    }
    if (call.tool === "term_assign" && input.type !== "group") {
      const term = tagSlug(String(input.slug ?? ""));
      const recipes: CuratorReviewRecipe[] = [];
      for (const slug of strings(input.add)) {
        const card = await readRecipe(slug);
        const tagged =
          !card.missing &&
          (card.tags ?? []).some((tag) => tagSlug(tag) === term);
        recipes.push(tagged ? { ...card, alreadyTagged: true } : card);
      }
      row.recipes = recipes;
      const miss = misses.get(term);
      if (miss && miss.missedCount + miss.unseen > 0) {
        row.missed = miss.missed;
        row.missedCount = miss.missedCount;
        row.unseen = miss.unseen;
      }
    }
    if (
      (call.tool === "recipe_update" || call.tool === "recipe_set_image") &&
      typeof input.slug === "string"
    ) {
      row.target = await readRecipe(input.slug);
      if (call.tool === "recipe_update" && isObject(input.patch)) {
        row.fields = Object.keys(input.patch);
      }
    }
    out.push(row);
  }
  return {
    calls: out,
    pending: out.filter((call) => call.state === "pending").length,
    live: await isLive(dir, runId),
  };
}

/** One decision a Save sends (Db3). */
export interface ReviewDecisionInput {
  /** The held call's id. */
  call: string;
  /** Apply it (ticked), or skip it (unticked). */
  apply: boolean;
  /** A `term_assign` applied with fewer `add`s: those left ticked. */
  add?: string[];
}

/** The longest one applied call may take (an import with its page and images). */
export const REVIEW_CALL_TIMEOUT_MS = 10 * 60_000;

function errorMessage(value: unknown): string | undefined {
  if (!isObject(value) || !isObject(value.error)) return undefined;
  const { code, message } = value.error;
  const text = typeof message === "string" ? message : "the tool failed";
  return typeof code === "string" ? `${code}: ${text}` : text;
}

/**
 * Save (Db1–Db3): apply the ticked held calls of run `id`'s conversation in
 * the order the model made them, skip the unticked, and record each
 * decision. A call already decided, or not a held call of this
 * conversation, is `validation`; a run still live is `job_live`. Answers
 * the review as it now stands.
 */
export async function applyReview(
  id: string,
  decisions: readonly ReviewDecisionInput[],
  { ctx, dir = jobsDirectory() }: { ctx: CurationContext; dir?: string },
): Promise<CuratorReview> {
  /* One Save at a time in this process: a double click cannot apply twice. */
  return withReviewLock("curator-review", async () => {
    const { id: runId, records } = await agentRecords(id, dir);
    if (await isLive(dir, runId)) {
      throw withJob(
        new JobLiveError(
          `Run ${runId} is still working: review its changes once it has ended.`,
        ),
        runId,
      );
    }
    const calls = heldCalls(records);
    const byId = new Map(calls.map((call) => [call.id, call]));
    const decided = await readDecisions(dir, calls);
    const asked = new Map<string, ReviewDecisionInput>();
    for (const decision of decisions) {
      const call = byId.get(decision.call);
      if (!call) {
        throw new ValidationError(
          `${decision.call} is not a held change of this run.`,
        );
      }
      if (decided.has(call.id) || asked.has(call.id)) {
        throw new ValidationError(
          `${heldPhrase({ name: call.tool, input: call.input }, call.held)} was already reviewed.`,
        );
      }
      if (decision.add !== undefined && call.tool !== "term_assign") {
        throw new ValidationError(
          "Only a tagging change can be narrowed (add).",
        );
      }
      asked.set(call.id, decision);
    }

    const backend = createLocalBackend({ ...ctx, inProcess: true });
    const tools = new Map(
      recipeAgentTools(backend).map((tool) => [tool.name, tool] as const),
    );
    const by = ctx.author?.email;
    const results = new Map<string, Record<string, HeldDecision>>();
    const record = (call: HeldCall, decision: HeldDecision) => {
      const file = results.get(call.job) ?? {};
      file[call.id] = decision;
      results.set(call.job, file);
    };

    /* In the model's order (Db2), whatever order the Save listed them in. */
    for (const call of calls) {
      const decision = asked.get(call.id);
      if (!decision) continue;
      const at = Date.now();
      const stamp = { at, ...(by ? { by } : {}) };
      if (!decision.apply) {
        record(call, { state: "discarded", ...stamp });
        continue;
      }
      let input = call.input;
      if (decision.add !== undefined) {
        const narrowed = narrowedAdd(call.input, decision.add);
        if ("problem" in narrowed) throw new ValidationError(narrowed.problem);
        const base = isObject(call.input) ? call.input : {};
        if (narrowed.add.length === 0 && strings(base.remove).length === 0) {
          /* Every recipe unticked: nothing left to write. */
          record(call, { state: "discarded", ...stamp });
          continue;
        }
        input = { ...base, add: narrowed.add };
      }
      const tool = tools.get(call.tool);
      if (!tool) {
        record(call, {
          state: "failed",
          ...stamp,
          error: `${call.tool} is not a tool the curator has`,
        });
        continue;
      }
      let result: unknown;
      try {
        result = await tool.run(input, {
          signal: AbortSignal.timeout(REVIEW_CALL_TIMEOUT_MS),
        });
      } catch (error) {
        result = {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
      const failure = errorMessage(result);
      const changed = input !== call.input ? { input } : {};
      if (failure) {
        record(call, { state: "failed", ...stamp, ...changed, error: failure });
        continue;
      }
      const summary = writeSummary(call.tool, input, result);
      record(call, {
        state: "applied",
        ...stamp,
        ...changed,
        ...(summary ? { summary } : {}),
      });
    }
    for (const [job, file] of results) {
      await recordDecisions(dir, job, file);
    }
    return curatorReview(runId, {
      dir,
      contentDirectory: ctx.contentDirectory,
    });
  });
}

/** What the approvals of held writes in `records` wrote (Db1), for "What changed". */
export async function appliedSummaries(
  records: readonly TranscriptRecord[],
  dir: string,
) {
  const calls = heldCalls(records);
  if (calls.length === 0) return [];
  const decisions = await readDecisions(dir, calls);
  return calls.flatMap((call) => {
    const decision = decisions.get(call.id);
    return decision?.state === "applied" && decision.summary
      ? [decision.summary]
      : [];
  });
}
