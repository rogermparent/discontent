"use server";

/**
 * The roundup picker's two server actions (35r), over 34f's seats — the same
 * `inspectList` / `importList` that `/api/inspect-list`, `/api/import-list`,
 * the CLI and MCP reach, with the session's context in place of a token.
 *
 * - Signed in, or nothing: `authenticateUser`, as every editor action.
 * - The URL and picks are the seat's to check: `inspectList` / `importList`
 *   refuse a non-http(s) URL, the importer's fetch keeps its own guards, and
 *   `ImportListOptionsSchema` validates the picks and the term exactly as the
 *   API body is validated.
 * - **At most `ROUNDUP_CHUNK` picks a call**, refused otherwise and passed as
 *   the seat's `limit` too, so one call stays near 90 s of pacing.
 * - Revalidation is the context's: `curationContextFor` gives each write the
 *   `onWrite` the API routes use, so every recipe the call imports (its own
 *   commit) and the term's create-and-assign expire their pages as they land.
 *
 * Answers are plain objects — an error is `{error: {code, message}}`, never a
 * throw — because the client keeps looping and needs to know why it stopped.
 */
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { curationContextFor } from "recipe-editor/controller/apiContext";
import {
  ValidationError,
  toErrorObject,
  type ErrorObject,
} from "recipe-editor/controller/curation/errors";
import {
  importList,
  inspectList,
  type ImportListTermResult,
  type InspectListResult,
} from "recipe-editor/controller/curation/importList";
import {
  ROUNDUP_CHUNK,
  type RoundupOutcome,
  type RoundupPick,
} from "recipe-editor/controller/roundupPicker";
import { settleChunk } from "recipe-editor/controller/roundupSettle";
import { authenticateUser } from "recipe-editor/controller/actions/shared";

type Failure = { error: ErrorObject["error"] };

async function context() {
  const email = await authenticateUser();
  if (!email) {
    throw Object.assign(new Error("Authentication required"), {
      code: "unauthenticated",
    });
  }
  return curationContextFor(email, getContentDirectory());
}

function failure(error: unknown): Failure {
  if ((error as { code?: string })?.code === "unauthenticated") {
    return {
      error: { code: "unauthenticated", message: "Authentication required" },
    };
  }
  return { error: toErrorObject(error).error };
}

/** The list, with `existing` marked; nothing written. */
export async function inspectRoundupAction(
  url: string,
): Promise<{ result: InspectListResult } | Failure> {
  try {
    const ctx = await context();
    if (typeof url !== "string" || !url.trim()) {
      throw new ValidationError("Paste the roundup's URL.");
    }
    return { result: await inspectList(ctx, url.trim()) };
  } catch (error) {
    return failure(error);
  }
}

export interface RoundupImportInput {
  url: string;
  picks: RoundupPick[];
  term?: string;
  termLabel?: string;
}

export interface RoundupImportAnswer {
  outcomes: RoundupOutcome[];
  /** Picks to put back at the front of the queue. */
  requeue: RoundupPick[];
  /** The call made no progress: stop rather than ask again. */
  stalled: boolean;
  term?: ImportListTermResult;
  warnings?: string[];
}

/** Import up to `ROUNDUP_CHUNK` picks, one commit each, then the term. */
export async function importRoundupAction(
  input: RoundupImportInput,
): Promise<RoundupImportAnswer | Failure> {
  try {
    const ctx = await context();
    const picks = Array.isArray(input?.picks) ? input.picks : [];
    if (picks.length === 0 || picks.length > ROUNDUP_CHUNK) {
      throw new ValidationError(
        `Send between 1 and ${ROUNDUP_CHUNK} picks a call.`,
      );
    }
    const term = input.term?.trim() || undefined;
    const termLabel = (term && input.termLabel?.trim()) || undefined;
    const result = await importList(ctx, String(input.url ?? ""), {
      /* Back as the seat hands out `remaining`: checked against the list. */
      pick: picks.map(({ n, url }) => ({ n, url })),
      limit: ROUNDUP_CHUNK,
      ...(term ? { term } : {}),
      ...(termLabel ? { termLabel } : {}),
    });
    const settled = settleChunk(picks, result);
    const warnings = [
      ...(result.warnings ?? []),
      ...(result.term?.warnings ?? []),
      ...(result.term?.error ? [result.term.error.message] : []),
    ];
    return {
      ...settled,
      ...(result.term ? { term: result.term } : {}),
      ...(warnings.length ? { warnings } : {}),
    };
  } catch (error) {
    return failure(error);
  }
}
