/**
 * `POST /api/inspect` — read a page the way `import` would, write nothing (26b).
 *
 * The body is `{url}`; the answer is `InspectResult`: the mapped import, a
 * create-ready `draft`, the raw Recipe node, the page's SEO metadata, its
 * ranked images and, for a video host, yt-dlp's metadata.
 *
 * Authenticated although it writes nothing: it makes this server fetch an
 * arbitrary URL (and run yt-dlp on one), which is not a door to leave open to
 * guests the way the public reads are.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { ValidationError } from "recipe-editor/controller/curation/errors";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { inspectUrl } from "recipe-editor/controller/curation/inspect";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { z } from "zod";

const InspectBodySchema = z.strictObject({
  url: z.string().min(1, "inspect needs a url"),
});

export async function POST(request: Request) {
  try {
    await requireCurationContext(request);
    const { url } = parseInput(InspectBodySchema, await readJsonBody(request));
    if (!URL.canParse(url)) {
      throw new ValidationError(`"${url}" is not a URL`);
    }
    return Response.json(await inspectUrl(url));
  } catch (error) {
    return errorResponse(error);
  }
}
