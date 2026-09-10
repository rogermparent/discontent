import { notFound } from "next/navigation";
import { getFeaturedRecipeBySlug } from "recipe-website-common/controller/data/readFeaturedRecipes";
import { readAllFeaturedRecipeIds } from "recipe-website-common/controller/data/readFeaturedRecipePages";
import { groupItems } from "recipe-website-common/controller/data/readGroupItem";
import { getGroupBySlug } from "recipe-website-common/controller/data/readGroups";
import { recipeItems } from "recipe-website-common/controller/data/readRecipeItem";
import { resolveGroupItems } from "recipe-website-common/controller/data/resolveGroupItems";
import FeaturedRecipeDetailPage from "recipe-website-common/components/FeaturedRecipeDetailPage";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let featuredRecipe;
  try {
    featuredRecipe = await getFeaturedRecipeBySlug({ slug });
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      notFound();
    }
    throw e;
  }
  /* A featured group (22g) — see the editor's twin for why this read is the
   * cached one and why a missing group degrades to the slug. */
  if (featuredRecipe.group) {
    const group = await groupItems.read(featuredRecipe.group);
    return { title: group?.name || featuredRecipe.group || slug };
  }
  /*
   * A dangling reference has always been possible here — the recipe can be
   * deleted while the feature remains — so `null` was already the answer. The
   * cached read hands it back as a value instead of as a swallowed exception.
   */
  const recipe = featuredRecipe.recipe
    ? await recipeItems.read(featuredRecipe.recipe)
    : null;
  return { title: recipe?.name || featuredRecipe.recipe || slug };
}

export default async function FeaturedRecipePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let featuredRecipe;
  try {
    featuredRecipe = await getFeaturedRecipeBySlug({ slug });
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      notFound();
    }
    throw e;
  }
  const { recipe: recipeSlug, group: groupSlug, note } = featuredRecipe;

  /* The same body as the editor's, minus the actions — see that file. */
  if (groupSlug) {
    let group;
    try {
      group = await getGroupBySlug({ slug: groupSlug });
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") {
        notFound();
      }
      throw e;
    }
    return (
      <FeaturedRecipeDetailPage
        kind="group"
        group={group}
        groupSlug={groupSlug}
        items={await resolveGroupItems(group)}
        note={note}
      />
    );
  }

  /*
   * The whole recipe record, rendered under the *featured recipe's* slug. This
   * is the surface that proves the item tag has to be keyed by item rather than
   * by path: this URL is a function of the feature's slug, and nothing the
   * recipe write knows could name it (§2, F19).
   */
  const recipe = recipeSlug ? await recipeItems.read(recipeSlug) : null;
  if (!recipe || !recipeSlug) notFound();

  return (
    <FeaturedRecipeDetailPage
      kind="recipe"
      recipe={recipe}
      recipeSlug={recipeSlug}
      note={note}
    />
  );
}

/*
 * A keys-only walk of the sorted keyspace, not a read of the content index
 * (F7) — see `recipe/[slug]`. Unblocked here by D2b, which gave featured
 * recipes a keyspace of their own.
 *
 * Never empty, for the reason `createPaginatedIndexRoute` and
 * `generateTagStaticParams` both document: `output: "export"` rejects a dynamic
 * route whose params come back empty — "Page … is missing
 * generateStaticParams()" is raised for an empty array, not just for a missing
 * function. A content directory with no featured recipes is an ordinary state
 * (a new site, and the `search-corpus` fixture), and without this the build
 * fails outright rather than emitting a site with no featured recipes in it.
 * §12.3 recorded this as a latent defect; it is reproducible, and this is the
 * fix. The placeholder names no feature, and the route `notFound()`s it exactly
 * as it would at runtime, so the export writes a 404 body there.
 */
export async function generateStaticParams() {
  const slugs = await readAllFeaturedRecipeIds();
  if (slugs.length === 0) return [{ slug: "_" }];
  return slugs.map((slug) => ({ slug }));
}
