/**
 * `/api/import` — fetch a recipe from a URL, cite it, and (optionally) keep it.
 *
 * The same `importAndCreate` the CLI's `recipes import` runs, so the citation
 * (`source`), the image download and the markdown conversion are identical
 * whichever way a recipe arrives.
 *
 * `dryRun` writes nothing and answers 200 with the shaped recipe; a real import
 * answers 201 like any other create. That difference is the point of the flag:
 * the curator inspects a candidate before deciding, and a dry run must not look
 * like a write in any status code, log line or cache tag.
 *
 * `llm` (36b) is the local model's mode — `auto` (default), `force`, `off` —
 * and a result the model touched carries `llm`. A model call can take most of
 * a minute (the first one loads the model).
 *
 * `{text, source?}` in place of `{url}` (36c, D8) is a pasted recipe — a
 * YouTube description, an email — read by the local model (`importFromText`);
 * `source` is cited and never fetched. The body is `ImportRequestSchema`,
 * shared with the MCP `recipe_import` tool.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  importAndCreate,
  importFromText,
} from "recipe-editor/controller/curation/importRecipe";
import {
  ImportRequestSchema,
  importTarget,
} from "recipe-editor/controller/curation/importRequest";
import { ValidationError } from "recipe-editor/controller/curation/errors";
import { parseInput } from "recipe-editor/controller/curation/schema";

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const target = importTarget(
      parseInput(ImportRequestSchema, await readJsonBody(request)),
    );
    let result;
    if (target.kind === "text") {
      result = await importFromText(ctx, {
        text: target.text,
        source: target.source,
        ...target.options,
      });
    } else {
      if (!URL.canParse(target.url)) {
        throw new ValidationError(`"${target.url}" is not a URL`);
      }
      result = await importAndCreate(ctx, target.url, target.options);
    }
    return Response.json(result, {
      status: "dryRun" in result && result.dryRun ? 200 : 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
