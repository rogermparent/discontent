"use server";

/**
 * Settings › Conversions (51f, Roger's answer 7): change, add or reset a
 * gram bank entry — one commit each, `conversions/grams.json`. Signed in,
 * as every editor action. Each answers the bank's rows as they now are.
 */
import { authenticateUser } from "recipe-editor/controller/actions/shared";
import { curationContextFor } from "recipe-editor/controller/apiContext";
import {
  gramsBankRows,
  resetGrams,
  setGrams,
  type GramsBankRow,
} from "recipe-editor/controller/curation/conversions";
import { CurationError } from "recipe-editor/controller/curation/errors";

export interface ConversionsAnswer {
  rows?: GramsBankRow[];
  /** The key written or reset. */
  key?: string;
  message?: string;
}

function failure(error: unknown): ConversionsAnswer {
  if (error instanceof CurationError) {
    const issue = error.details.issues?.[0];
    return {
      message: issue ? `${issue.path}: ${issue.message}` : error.message,
    };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}

export async function setGramsAction(
  name: string,
  gramsPerCup: number,
): Promise<ConversionsAnswer> {
  const email = await authenticateUser();
  if (!email) return { message: "Sign in to change the bank." };
  try {
    const result = await setGrams(curationContextFor(email), {
      name,
      gramsPerCup,
    });
    return { rows: gramsBankRows(result.entries), key: result.key };
  } catch (error) {
    return failure(error);
  }
}

export async function resetGramsAction(
  key: string,
): Promise<ConversionsAnswer> {
  const email = await authenticateUser();
  if (!email) return { message: "Sign in to change the bank." };
  try {
    const result = await resetGrams(curationContextFor(email), key);
    return { rows: gramsBankRows(result.entries), key: result.key };
  } catch (error) {
    return failure(error);
  }
}
