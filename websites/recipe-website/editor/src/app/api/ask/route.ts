/**
 * `POST /api/ask` `{question}` — Ask (43q): a question about the recipes
 * becomes the page that answers it, as `{url, label, page, …}`; when the
 * model can't say (none set up, a timeout, an answer naming a tag the site
 * lacks) the URL is the plain search for the question's words and
 * `fallback` says why. Always 200 with a URL for an authenticated caller.
 *
 * Signed in, or a token with the read scope (27b) — never a guest: the
 * model's time is the operator's. A read: nothing is written, no job is
 * made, and the export has no such route (D1).
 *
 * Thin, per T17: validate, call `controller/ask`, answer through
 * `errorResponse`.
 */
import { z } from "zod";
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { ask } from "recipe-editor/controller/ask/ask";
import { ASK_QUESTION_MAX } from "recipe-editor/controller/ask/answer";

const AskRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(ASK_QUESTION_MAX),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request, { need: "read" });
    const { question } = parseInput(
      AskRequestSchema,
      await readJsonBody(request),
    );
    return Response.json(
      await ask({ contentDirectory: ctx.contentDirectory }, question, {
        signal: request.signal,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
