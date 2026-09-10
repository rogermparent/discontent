import getProjects from "@discontent/projects-collection/controller/data/readIndex";

/**
 * The whole index as JSON, for a client that wants the corpus without the page.
 *
 * `force-static` is not optional here: `force-dynamic` is *illegal* under
 * `output: "export"`, and a parameterless route handler is treated as dynamic
 * unless it says otherwise — so without this line the export build fails.
 */
export const dynamic = "force-static";

export async function GET() {
  const { projects } = await getProjects();
  return Response.json({ projects });
}
