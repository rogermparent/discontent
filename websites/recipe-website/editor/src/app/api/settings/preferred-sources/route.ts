/**
 * `/api/settings/preferred-sources` — the sites the curator's online plan
 * asks first (51g, b03). Signed-in or token-scoped: `GET` reads
 * (`{sources, default}`), `PUT {sources: string[]}` replaces the list
 * (checked: registrable domains, deduped, at most ten; `[]` allowed). Per
 * instance, in this editor's `settings.json`.
 */
import { revalidatePath } from "next/cache";
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  DEFAULT_PREFERRED_SOURCES,
  readPreferredSources,
  writePreferredSources,
} from "recipe-editor/controller/agent/preferredSources";
import { ValidationError } from "recipe-editor/controller/curation/errors";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireCurationContext(request, { need: "read" });
    return Response.json({
      sources: await readPreferredSources(),
      default: DEFAULT_PREFERRED_SOURCES,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireCurationContext(request);
    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || !("sources" in body)) {
      throw new ValidationError("The body is {sources: string[]}.");
    }
    const sources = await writePreferredSources(
      (body as { sources: unknown }).sources,
    );
    revalidatePath("/settings/tools");
    return Response.json({ sources, default: DEFAULT_PREFERRED_SOURCES });
  } catch (error) {
    return errorResponse(error);
  }
}
