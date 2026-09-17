import Link from "next/link";
import { notFound } from "next/navigation";
import { getFeaturedRecipeBySlug } from "recipe-website-common/controller/data/readFeaturedRecipes";
import { groupItems } from "recipe-website-common/controller/data/readGroupItem";
import { getGroupBySlug } from "recipe-website-common/controller/data/readGroups";
import { recipeItems } from "recipe-website-common/controller/data/readRecipeItem";
import { resolveGroupItems } from "recipe-website-common/controller/data/resolveGroupItems";
import { resolveTermPage } from "recipe-website-common/controller/data/readTermPage";
import { deleteFeaturedRecipe } from "../../../../../controller/actions/featuredRecipes";
import { Button } from "@discontent/component-library/components/ui/button";
import FeaturedRecipeDetailPage from "recipe-website-common/components/FeaturedRecipeDetailPage";
import { ConfirmDeleteButton } from "@discontent/component-library/components/ConfirmDelete";

export const dynamic = "force-dynamic";

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
  /*
   * A featured group (22g), through the cached group read rather than the raw
   * one: the body reads the same record, and a missing group is `null` here
   * rather than a throw, so the title degrades to the slug exactly as the
   * recipe branch below does.
   */
  /*
   * A featured term (24c), before the group branch for the reason the cards
   * check the newer field first. `resolveTermPage` is `null` for a slug with no
   * record and no carriers, so the title degrades to the slug exactly as the
   * two branches below do.
   */
  if (featuredRecipe.term) {
    const term = await resolveTermPage(featuredRecipe.term);
    return { title: term?.label || featuredRecipe.term || slug };
  }
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
  const {
    date,
    recipe: recipeSlug,
    group: groupSlug,
    term: termSlug,
    note,
  } = featuredRecipe;

  const deleteFeaturedRecipeWithSlug = deleteFeaturedRecipe.bind(
    null,
    date,
    slug,
  );

  const actions = (
    <>
      <form
        id="delete-featured-recipe-form"
        action={deleteFeaturedRecipeWithSlug}
        className="contents"
      />
      <ConfirmDeleteButton
        formId="delete-featured-recipe-form"
        itemLabel="feature"
        title="Remove this feature?"
        description={`The ${termSlug ? "term" : groupSlug ? "group" : "recipe"} itself is not deleted — only its place on the homepage.`}
      />
      <Button asChild size="sm">
        <Link href={`/featured-recipe/${slug}/edit`}>Edit</Link>
      </Button>
    </>
  );

  /*
   * A featured term (24c). `resolveTermPage` answers `null` when the slug has
   * no record *and* no carriers — which 404s the feature's page, the same
   * answer the two branches below give a feature whose target is gone. A record
   * that was deleted while its tag is still on recipes is not gone in that
   * sense: the term page still renders, under the fold's label.
   */
  if (termSlug) {
    const term = await resolveTermPage(termSlug);
    if (!term) notFound();
    return (
      <FeaturedRecipeDetailPage
        kind="term"
        term={term}
        note={note}
        actions={actions}
      />
    );
  }

  /*
   * A featured group (22g). `getGroupBySlug` is the raw read and throws ENOENT
   * for a group that has been deleted — which 404s the *feature's* page, the
   * same answer this route has always given a feature whose target is gone.
   */
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
        actions={actions}
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
      actions={actions}
    />
  );
}
