import { readSearchTerms } from "recipe-website-common/controller/data/readTermPage";

// Statically rendered under `output: "export"`, exactly as `search/groups` is:
// `force-static` is the required opt-in for a parameterless route handler, and
// it bakes the term document at build time so the reader site's tag rail and
// hierarchy-aware `tag:` resolve with no server behind them.
export const dynamic = "force-static";

/**
 * The term half of the search corpus, matching the editor's route — the
 * reasoning is in that file.
 */
export async function GET() {
  return Response.json(await readSearchTerms());
}
