import { readTermDescriptions } from "recipe-website-common/controller/data/readTermDescriptions";

// Baked at build time under `output: "export"`, as `search/terms` is.
export const dynamic = "force-static";

/**
 * The term card's descriptions, matching the editor's route — the reasoning
 * is in `readTermDescriptions`.
 */
export async function GET() {
  return Response.json(await readTermDescriptions());
}
