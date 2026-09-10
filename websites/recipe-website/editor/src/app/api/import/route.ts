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
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { importAndCreate } from "recipe-editor/controller/curation/importRecipe";
import { ValidationError } from "recipe-editor/controller/curation/errors";
import { z } from "zod";
import { parseInput } from "recipe-editor/controller/curation/schema";

const ImportBodySchema = z.strictObject({
  url: z.string().min(1, "An import needs a url"),
  tags: z.array(z.string()).optional(),
  slug: z.string().optional(),
  name: z.string().optional(),
  dryRun: z.boolean().optional(),
  overwrite: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = parseInput(ImportBodySchema, await readJsonBody(request));
    const { url, ...options } = body;
    if (!URL.canParse(url)) {
      throw new ValidationError(`"${url}" is not a URL`);
    }
    const result = await importAndCreate(ctx, url, options);
    return Response.json(result, {
      status: "dryRun" in result && result.dryRun ? 200 : 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
