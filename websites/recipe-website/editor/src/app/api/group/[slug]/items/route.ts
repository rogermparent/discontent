/**
 * `POST /api/group/<slug>/items` — append one item to a group.
 *
 * Append, not upsert: a meal plan that cooks the same thing twice in a week is
 * two items with two labels, and `groupsByRecipe` folds one "Appears in" entry
 * per item precisely so both survive.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  boolParam,
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { addItem } from "recipe-editor/controller/curation/groups";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { z } from "zod";

const AddItemBodySchema = z.strictObject({
  recipe: z.string().min(1, "An item needs a recipe slug"),
  label: z.string().optional(),
  note: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const url = new URL(request.url);
    const ctx = await requireCurationContext(request);
    const { recipe, label, note } = parseInput(
      AddItemBodySchema,
      await readJsonBody(request),
    );
    return Response.json(
      await addItem(ctx, slug, recipe, {
        label,
        note,
        force: boolParam(url, "force"),
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
