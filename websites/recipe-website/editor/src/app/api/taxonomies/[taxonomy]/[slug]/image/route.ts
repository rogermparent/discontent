/**
 * `PUT /api/taxonomies/<taxonomy>/<slug>/image` — set or clear one term
 * record's picture (32c), shaped exactly like `PUT /api/recipe/<slug>/image`.
 *
 * Two bodies, one seat:
 *
 * - `multipart/form-data` with a `file` part — what `recipes term image
 *   --file` sends over `--remote`;
 * - JSON `{url}` to download one, or `{clear: true}` to remove it.
 *
 * Either way it is one commit, `Update term image: <slug>`, through
 * `setTermImage`, which checks a posted file exactly as it checks a fetched
 * one. Same guard as every other term write: a write-scoped token or a
 * session.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { ValidationError } from "recipe-editor/controller/curation/errors";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { setTermImage } from "recipe-editor/controller/curation/recipeImage";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { assertTaxonomy } from "recipe-editor/controller/curation/terms";
import { z } from "zod";

const ImageBodySchema = z.union([
  z.strictObject({ url: z.string().min(1) }),
  z.strictObject({ clear: z.literal(true) }),
]);

interface Context {
  params: Promise<{ taxonomy: string; slug: string }>;
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const { taxonomy, slug } = await params;
    assertTaxonomy(taxonomy);
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
      return Response.json(await setTermImage(ctx, slug, { file }));
    }

    const body = parseInput(ImageBodySchema, await readJsonBody(request));
    if ("url" in body && !URL.canParse(body.url)) {
      throw new ValidationError(`"${body.url}" is not a URL`);
    }
    return Response.json(
      await setTermImage(
        ctx,
        slug,
        "url" in body ? { url: body.url } : { clear: true },
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
