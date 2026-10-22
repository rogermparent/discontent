"use server";

/**
 * The edit page's "Fill gaps from the source" (45b): start a `fill` job for
 * the recipe and answer its id at once — the page's live panel follows it,
 * as /new-recipe's does an import (37c) — or, for a job with no record
 * (38-Tb5), its outcome through a bounded long-poll. Signed in, as every
 * editor action; nothing is written (the form's Save is the write).
 */
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { curationContextFor } from "recipe-editor/controller/apiContext";
import { authenticateUser } from "recipe-editor/controller/actions/shared";
import type { FillResult } from "recipe-editor/controller/curation/fillRecipe";
import { corpusOf, startSpec } from "recipe-editor/controller/jobs/kinds";
import {
  keepUnstored,
  waitUnstored,
} from "recipe-editor/controller/jobs/unstored";

export interface FillStartState {
  job?: string;
  /** False: the job has no record (38-Tb5) — ask `fillResultAction`. */
  stored?: boolean;
  message?: string;
}

export interface FillOutcome {
  /** Still running after the wait: ask again. */
  pending?: true;
  result?: FillResult;
  message?: string;
  cancelled?: true;
}

/** Start filling `slug` from its source. */
export async function fillStartAction(slug: string): Promise<FillStartState> {
  const email = await authenticateUser();
  if (!email) return { message: "Sign in to fill a recipe." };
  if (typeof slug !== "string" || !slug) return { message: "No recipe." };
  try {
    const ctx = curationContextFor(email, getContentDirectory());
    const { job, stored, done } = await startSpec(
      { kind: "fill", ...corpusOf(ctx), slug },
      { ctx },
    );
    if (stored) return { job };
    keepUnstored(job, done);
    return { job, stored: false };
  } catch (error) {
    return { message: error instanceof Error ? error.message : String(error) };
  }
}

/** A recordless fill's outcome (39a's long-poll, as `importResultAction`). */
export async function fillResultAction(job: string): Promise<FillOutcome> {
  if (!(await authenticateUser()))
    return { message: "Sign in to fill a recipe." };
  const answer =
    typeof job === "string"
      ? await waitUnstored<FillResult & { job: string }>(job)
      : ({ status: "missing" } as const);
  switch (answer.status) {
    case "missing":
      return {
        message: `Fill ${String(job)} is not running in this editor any more — fill it again.`,
      };
    case "pending":
      return { pending: true };
    case "done":
      return { result: answer.value };
    default: {
      const { error } = answer;
      const cancelled =
        !!error &&
        typeof error === "object" &&
        (error as { code?: unknown }).code === "cancelled";
      return {
        message: error instanceof Error ? error.message : String(error),
        ...(cancelled ? { cancelled: true as const } : {}),
      };
    }
  }
}
