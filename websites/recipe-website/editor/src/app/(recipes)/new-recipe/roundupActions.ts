"use server";

/**
 * The roundup picker's two server actions (35r), over 34f's seats — the same
 * `inspectList` / `importList` that `/api/inspect-list`, `/api/import-list`,
 * the CLI and MCP reach, with the session's context in place of a token.
 *
 * - Signed in, or nothing: `authenticateUser`, as every editor action, and
 *   `unauthenticated` otherwise.
 * - The input is parsed strictly (`RoundupImportInputSchema`), so a bad shape
 *   is `validation`, never `internal`. The URL and picks are then the seat's
 *   to check: `inspectList` / `importList` refuse a non-http(s) URL, the
 *   importer's fetch keeps its own guards, and `ImportListOptionsSchema`
 *   validates the picks and the term exactly as the API body is validated.
 * - **At most `ROUNDUP_CHUNK` picks a call**, and passed as the seat's
 *   `limit` too. One call re-fetches the list page, then a page and an image
 *   per pick, each 15 s after the last request to that site: seven requests,
 *   so ≥ 105 s against one site when the previous call just ended there, and
 *   15 s more for each 403 retry.
 * - The term field may hold a label: it is resolved to the vocabulary's slug
 *   first (`resolveTermSlug`), so "Speed & effort" means `effort`.
 * - Revalidation is the context's: `curationContextFor` gives each write the
 *   `onWrite` the API routes use, so every recipe the call imports (its own
 *   commit) and the term's create-and-assign expire their pages as they land.
 *
 * Answers are plain objects — an error is `{error: {code, message}}`, never a
 * throw — because the client keeps looping and needs to know why it stopped.
 */
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { z } from "zod";
import { curationContextFor } from "recipe-editor/controller/apiContext";
import {
  UnauthenticatedError,
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
import { parseInput } from "recipe-editor/controller/curation/schema";
import { listTerms } from "recipe-editor/controller/curation/terms";
import {
  ROUNDUP_CHUNK,
  type RoundupOutcome,
  type RoundupPick,
} from "recipe-editor/controller/roundupPicker";
import {
  resolveTermSlug,
  settleChunk,
} from "recipe-editor/controller/roundupSettle";
import { authenticateUser } from "recipe-editor/controller/actions/shared";

type Failure = { error: ErrorObject["error"] };

async function context() {
  const email = await authenticateUser();
  if (!email) throw new UnauthenticatedError();
  return curationContextFor(email, getContentDirectory());
}

function failure(error: unknown): Failure {
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

const RoundupImportInputSchema = z.strictObject({
  url: z.string().trim().min(1),
  picks: z
    .array(
      z.strictObject({
        n: z.number().int().min(1),
        url: z.string().min(1),
        name: z.string(),
      }),
    )
    .min(1)
    .max(ROUNDUP_CHUNK, `At most ${ROUNDUP_CHUNK} picks a call`),
  term: z.string().trim().optional(),
  termLabel: z.string().trim().optional(),
});

export type RoundupImportInput = z.input<typeof RoundupImportInputSchema>;

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
  raw: RoundupImportInput,
): Promise<RoundupImportAnswer | Failure> {
  try {
    const ctx = await context();
    const input = parseInput(RoundupImportInputSchema, raw);
    const term = input.term
      ? resolveTermSlug((await listTerms(ctx)).terms, input.term)
      : undefined;
    const termLabel = (term && input.termLabel) || undefined;
    const result = await importList(ctx, input.url, {
      /* Back as the seat hands out `remaining`: checked against the list. */
      pick: input.picks.map(({ n, url }) => ({ n, url })),
      limit: ROUNDUP_CHUNK,
      ...(term ? { term } : {}),
      ...(termLabel ? { termLabel } : {}),
    });
    const settled = settleChunk(input.picks, result);
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
