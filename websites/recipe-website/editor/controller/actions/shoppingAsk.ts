"use server";

/**
 * 49b: the `/shopping` page's asks of the model — a note on one proposal or
 * merged row, or "Look for more with the model" — started as a
 * `shopping-merge` job over the list as it is now, answered with the job's
 * id at once (the panel follows it, as Edit with AI's does); or, for a job
 * with no record (38-Tb5), its outcome through a bounded long-poll.
 * Signed in, as every editor action; nothing is written (Accept is the
 * write, through `decideShoppingListMerge`).
 */
import { z } from "zod";
import { auth } from "@/auth";
import { curationContextFor } from "../apiContext";
import { toErrorObject } from "../curation/errors";
import { startSpec } from "../jobs/kinds";
import { keepUnstored, waitUnstored } from "../jobs/unstored";
import { readerLabel } from "../llm/readerLabel";
import {
  SHOPPING_ASK_NOTE_MAX,
  isShoppingAskResult,
  type ShoppingAskResult,
} from "recipe-website-common/util/shoppingAsk";
import { MERGE_LIMITS } from "recipe-website-common/util/shoppingMerges";

export interface ShoppingAskStarted {
  job?: string;
  /** False: the job has no record (38-Tb5) — ask `shoppingAskResultAction`. */
  stored?: boolean;
  /** Who was asked, for the panel's "Asking …". */
  model?: string;
  message?: string;
}

export interface ShoppingAskOutcome {
  pending?: true;
  result?: ShoppingAskResult;
  message?: string;
  cancelled?: true;
}

const StartSchema = z.discriminatedUnion("task", [
  z.strictObject({
    task: z.literal("revise"),
    id: z.string().trim().max(16).optional(),
    keys: z
      .array(z.string().trim().min(1).max(MERGE_LIMITS.key))
      .min(2)
      .max(MERGE_LIMITS.keys)
      .optional(),
    note: z.string().max(SHOPPING_ASK_NOTE_MAX),
    claude: z.boolean().optional(),
  }),
  z.strictObject({
    task: z.literal("find"),
    claude: z.boolean().optional(),
  }),
]);

/** Start an ask over the list as it is now. */
export async function startShoppingAsk(
  input: unknown,
): Promise<ShoppingAskStarted> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { message: "Sign in to ask the model." };
  const parsed = StartSchema.safeParse(input);
  if (!parsed.success) return { message: "That ask can't be read." };
  if (parsed.data.task === "revise" && !parsed.data.note.trim()) {
    return { message: "Type a note for the model first." };
  }
  try {
    const { storedShoppingAskSpec } = await import("../llm/shoppingAsk");
    const { editModelFor } = await import("../llm/askEdit");
    const spec = await storedShoppingAskSpec(
      curationContextFor(email),
      parsed.data,
    );
    const chosen = editModelFor(spec.backend);
    const { job, stored, done } = await startSpec(spec);
    keepUnstored(job, done);
    return {
      job,
      ...(stored ? {} : { stored: false }),
      ...("config" in chosen ? { model: readerLabel(chosen.config) } : {}),
    };
  } catch (error) {
    return { message: toErrorObject(error).error.message };
  }
}

/** A recordless ask's outcome (39a's long-poll, as `editResultAction`). */
export async function shoppingAskResultAction(
  job: string,
): Promise<ShoppingAskOutcome> {
  const session = await auth();
  if (!session?.user?.email) return { message: "Sign in to ask the model." };
  const answer =
    typeof job === "string"
      ? await waitUnstored<ShoppingAskResult & { job: string }>(job)
      : ({ status: "missing" } as const);
  switch (answer.status) {
    case "missing":
      return {
        message: `Ask ${String(job)} is not running in this editor any more — ask again.`,
      };
    case "pending":
      return { pending: true };
    case "done":
      return isShoppingAskResult(answer.value)
        ? { result: answer.value }
        : { message: "That job isn't an ask about the shopping list." };
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
