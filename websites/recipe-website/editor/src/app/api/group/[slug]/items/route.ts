/**
 * `POST /api/group/<slug>/items` — append one item to a group.
 *
 * Append, not upsert: a meal plan that cooks the same thing twice in a week is
 * two items with two labels, and `groupsByRecipe` folds one "Appears in" entry
 * per item precisely so both survive.
 *
 * The body is `GroupItemObjectSchema` itself since 23c (D15) — `{recipe}` or
 * `{group}`, never both. The route used to carry a private copy of that schema,
 * which is exactly the kind of near-duplicate that starts accepting a body the
 * CLI rejects the day one of the two grows a field.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  boolParam,
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { addItem } from "recipe-editor/controller/curation/groups";
import {
  GroupItemObjectSchema,
  parseInput,
} from "recipe-editor/controller/curation/schema";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const url = new URL(request.url);
    const ctx = await requireCurationContext(request);
    const { recipe, group, label, note } = parseInput(
      GroupItemObjectSchema,
      await readJsonBody(request),
    );
    /*
     * The schema's refine has already established that exactly one is set; zod
     * cannot narrow a type through a refine, so the ref is built here rather
     * than asserted.
     */
    const ref = group ? { group } : { recipe: recipe as string };
    return Response.json(
      await addItem(ctx, slug, ref, {
        label,
        note,
        force: boolParam(url, "force"),
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
