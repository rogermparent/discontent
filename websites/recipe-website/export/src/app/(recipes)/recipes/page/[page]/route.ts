import { recipeIndexJsonRoutes } from "recipe-website-common/components/RecipeIndexPage/jsonRoutes";

export const dynamic = "force-static";

/**
 * One numbered page as JSON, baked at build beside the HTML page it mirrors.
 */
export const GET = recipeIndexJsonRoutes.numbered;

/**
 * Derived from the meta record in O(1), and never empty — `output: "export"`
 * rejects a dynamic route whose params come back empty, and a corpus small
 * enough to fit in the landing fold has no numbered pages at all. The emitted
 * param names a page that does not exist; the handler answers it with its 404
 * body, which is written to disk there.
 */
export const generateStaticParams = recipeIndexJsonRoutes.generateStaticParams;
