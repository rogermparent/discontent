/**
 * `GET /api/shopping/tidy/models` (epic 50, 50b, Db2): the models a "Tidy
 * with the model" run may pick — `{models: [{id, words, name, api,
 * default?}], unavailable: [{id, words, why}]}` — for 50c's picker and
 * `recipes shopping tidy --model`. Never a key or a URL.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { readTidyModels } from "recipe-editor/controller/llm/shoppingTidy";

export async function GET(request: Request) {
  try {
    await requireCurationContext(request, { need: "read" });
    const { choices } = await readTidyModels();
    return Response.json(choices, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
