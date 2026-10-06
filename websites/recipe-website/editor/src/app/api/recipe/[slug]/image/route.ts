/**
 * `PUT /api/recipe/<slug>/image` — set or clear one recipe's image (26b).
 *
 * Two bodies, one seat:
 *
 * - `multipart/form-data` with a `file` part — what `recipes image --file`
 *   sends over `--remote`, and what a browser form could post;
 * - JSON `{url}` to download one, or `{clear: true}` to remove it.
 *
 * Either way it is one commit, `Update recipe image: <slug>`, through
 * `setRecipeImage`, which checks a posted file exactly as it checks a fetched
 * one.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { ValidationError } from "recipe-editor/controller/curation/errors";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { setRecipeImage } from "recipe-editor/controller/curation/recipeImage";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { z } from "zod";

const ImageBodySchema = z.union([
  z.strictObject({ url: z.string().min(1) }),
  z.strictObject({ clear: z.literal(true) }),
]);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const ctx = await requireCurationContext(request);
    const type = request.headers.get("content-type") ?? "";

    if (type.startsWith("multipart/form-data")) {
      let file: FormDataEntryValue | null;
      try {
        file = (await request.formData()).get("file");
      } catch (error) {
        throw new ValidationError(
          `Could not read the upload: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!(file instanceof File)) {
        throw new ValidationError("Expected a `file` part in the upload.");
      }
      return Response.json(await setRecipeImage(ctx, slug, { file }));
    }

    const body = parseInput(ImageBodySchema, await readJsonBody(request));
    if ("url" in body && !URL.canParse(body.url)) {
      throw new ValidationError(`"${body.url}" is not a URL`);
    }
    return Response.json(
      await setRecipeImage(
        ctx,
        slug,
        "url" in body ? { url: body.url } : { clear: true },
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
