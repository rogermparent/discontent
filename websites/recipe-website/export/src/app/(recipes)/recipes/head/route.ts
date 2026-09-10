import { recipeIndexJsonRoutes } from "recipe-website-common/components/RecipeIndexPage/jsonRoutes";

// Statically rendered under `output: "export"`: `force-static` is the required
// opt-in for a parameterless route handler, baking the landing fold's JSON at
// build. This is what lets the reader site's infinite list append without a
// server.
export const dynamic = "force-static";

export const GET = recipeIndexJsonRoutes.head;
