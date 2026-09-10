/**
 * `/api/recipe/<slug>` — one recipe, read, rewritten or removed.
 *
 * The GET is older than the rest of this file and its shape is load-bearing:
 * `RecipeSelect` fetches it to fill the featured-recipe picker, so it keeps
 * returning the cached *item record* (`recipeItems.read`) rather than the
 * curation layer's `{slug, path, url, recipe}` envelope. The write methods are
 * new and go through the curation layer like every other route.
 *
 * That mix is why this file cannot be unit-tested (T17): importing it pulls in
 * `recipeItems`, whose `unstable_cache` throws outside Next. Playwright covers
 * it.
 */
import { NextRequest, NextResponse } from "next/server";
import { recipeItems } from "recipe-website-common/controller/data/readRecipeItem";
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  deleteRecipe,
  updateRecipe,
} from "recipe-editor/controller/curation/recipes";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!slug) {
    return NextResponse.json({ error: "Slug is required" }, { status: 400 });
  }

  try {
    /*
     * This 404 branch existed before anything could reach it — the read threw
     * ENOENT and the `catch` below turned a missing recipe into a 500. It is
     * reachable now, so a missing slug answers 404 as the code always said it
     * would, and the `catch` is left for genuine I/O failures.
     */
    const recipe = await recipeItems.read(slug);
    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }
    return NextResponse.json(recipe);
  } catch (error) {
    console.error("Error fetching recipe:", error);
    return NextResponse.json(
      { error: "Failed to fetch recipe" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    return Response.json(await updateRecipe(ctx, slug, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const ctx = await requireCurationContext(request);
    return Response.json(await deleteRecipe(ctx, slug));
  } catch (error) {
    return errorResponse(error);
  }
}
