import { getGroupSearchCorpus } from "recipe-website-common/controller/data/readGroupSearchCorpus";

// Statically rendered under `output: "export"`, exactly as `search/all` is:
// `force-static` is the required opt-in for a parameterless route handler, and
// it bakes the group document at build time so the reader site's rail, group
// results and `group:` filter all resolve with no server behind them.
export const dynamic = "force-static";

/**
 * The group half of the search corpus, matching the editor's route — the
 * reasoning for the split is in that file.
 */
export async function GET() {
  return Response.json(await getGroupSearchCorpus());
}
