"use server";

/**
 * 50b: "Tidy with the model" on `/shopping` — start a run, follow it, read
 * the latest run, Accept or Skip a suggestion. The minimal surface 50c's
 * walkthrough replaces; the HTTP API and the CLI have the same.
 */
import { z } from "zod";
import { auth } from "@/auth";
import { curationContextFor } from "../apiContext";
import { toErrorObject } from "../curation/errors";
import { startSpec } from "../jobs/kinds";
import { keepUnstored, waitUnstored } from "../jobs/unstored";
import {
  isShoppingTidyResult,
  tidyRunView,
  type ShoppingTidyResult,
  type TidyRunView,
} from "recipe-website-common/util/shoppingTidy";

export interface ShoppingTidyStarted {
  job?: string;
  message?: string;
}

export interface ShoppingTidyOutcome {
  pending?: true;
  result?: ShoppingTidyResult;
  message?: string;
}

const StartSchema = z.strictObject({
  model: z.string().trim().min(1).max(80).optional(),
  on: z.enum(["current", "original"]).optional(),
  /* 50d: the list to tidy (the main list without one). */
  list: z.string().trim().min(1).max(100).optional(),
});

function signedIn(email: string | null | undefined): string | undefined {
  return email ?? undefined;
}

/** 50d: the signed-in editor's context, on one list. */
function on(email: string, list: unknown) {
  const ctx = curationContextFor(email);
  return typeof list === "string" && list
    ? { ...ctx, shoppingList: list }
    : ctx;
}

/** Start a run over the list as it is now. */
export async function startShoppingTidy(
  input: unknown,
): Promise<ShoppingTidyStarted> {
  const email = signedIn((await auth())?.user?.email);
  if (!email) return { message: "Sign in to tidy the list." };
  const parsed = StartSchema.safeParse(input);
  if (!parsed.success) return { message: "That run can't be read." };
  try {
    const { storedTidySpec } = await import("../llm/shoppingTidy");
    const { list, ...start } = parsed.data;
    const spec = await storedTidySpec(on(email, list), start);
    const { job, done } = await startSpec(spec);
    keepUnstored(job, done);
    return { job };
  } catch (error) {
    return { message: toErrorObject(error).error.message };
  }
}

/** A run's outcome: a bounded long-poll (`waitUnstored`), as 49b's ask. */
export async function shoppingTidyResultAction(
  job: string,
): Promise<ShoppingTidyOutcome> {
  if (!(await auth())?.user?.email) return { message: "Sign in first." };
  const answer =
    typeof job === "string"
      ? await waitUnstored<ShoppingTidyResult & { job: string }>(job)
      : ({ status: "missing" } as const);
  switch (answer.status) {
    case "missing":
      return {
        message: `Run ${String(job)} is not running in this editor any more: see Jobs.`,
      };
    case "pending":
      return { pending: true };
    case "done":
      return isShoppingTidyResult(answer.value)
        ? { result: answer.value }
        : { message: "That job isn't a tidy of the shopping list." };
    default: {
      const { error } = answer;
      return {
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/** The latest run, as the list reads it now. */
export async function latestShoppingTidy(list?: string): Promise<{
  run?: TidyRunView;
  message?: string;
}> {
  const email = signedIn((await auth())?.user?.email);
  if (!email) return { message: "Sign in first." };
  try {
    const { readTidyRuns, readShoppingItems } =
      await import("../curation/shopping");
    const ctx = on(email, list);
    const [runs, items] = await Promise.all([
      readTidyRuns(ctx),
      readShoppingItems(ctx),
    ]);
    return runs[0] ? { run: tidyRunView(runs[0], items) } : {};
  } catch (error) {
    return { message: toErrorObject(error).error.message };
  }
}

/** Accept (one change on this list) or Skip one suggestion. */
export async function decideShoppingTidy(
  id: string,
  action: "accept" | "skip",
  list?: string,
): Promise<{ run?: TidyRunView; message?: string }> {
  const email = signedIn((await auth())?.user?.email);
  if (!email) return { message: "Sign in first." };
  if (typeof id !== "string" || (action !== "accept" && action !== "skip")) {
    return { message: "That can't be read." };
  }
  try {
    const { decideTidySuggestion, readShoppingItems } =
      await import("../curation/shopping");
    const ctx = on(email, list);
    const { run } = await decideTidySuggestion(ctx, id, action);
    return { run: tidyRunView(run, await readShoppingItems(ctx)) };
  } catch (error) {
    return { message: toErrorObject(error).error.message };
  }
}
