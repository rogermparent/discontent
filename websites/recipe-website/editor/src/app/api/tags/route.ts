/**
 * `/api/tags` — every tag in the corpus (23b/D12).
 *
 * The last read that had no route: the CLI's `tags` command and the MCP
 * `tag_list` tool both sit on `CuratorBackend`, so a `--remote` run needs
 * somewhere to ask. A public read like `/api/recipes` and `/api/groups`.
 *
 * Thin, per T17: call `controller/curation/search`, answer through
 * `errorResponse`.
 */
import { readContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { listTags } from "recipe-editor/controller/curation/search";

export async function GET() {
  try {
    return Response.json({ tags: await listTags(readContext()) });
  } catch (error) {
    return errorResponse(error);
  }
}
