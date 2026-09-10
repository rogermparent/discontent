import getProjects from "@discontent/projects-collection/controller/data/readIndex";

/**
 * The whole index as JSON — the editor's half of the pair the export already
 * serves, so the command palette can fetch the same URL in both apps.
 *
 * Deliberately *without* the export's `export const dynamic = "force-static"`.
 * That line exists there only because `output: "export"` forbids a dynamic
 * handler; here it would bake the corpus at build time and serve a stale index
 * to the one app where projects are actually being edited.
 */
export async function GET() {
  const { projects } = await getProjects();
  return Response.json({ projects });
}
