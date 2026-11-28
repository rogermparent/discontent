import Link from "next/link";
import { notFound } from "next/navigation";
import { recipeItems } from "recipe-website-common/controller/data/readRecipeItem";
import { RecipeView } from "recipe-website-common/components/View";
import { deleteRecipe } from "../../../../../controller/actions";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  PageMain,
  PageSection,
  PageActions,
} from "recipe-website-common/components/PageLayout";
import { ConfirmDeleteButton } from "@discontent/component-library/components/ConfirmDelete";
import { auth } from "@/auth";
import { AddRecipeToShopping } from "recipe-website-common/components/ShoppingPage/AddToShopping";
import {
  addToShoppingList,
  createSavedShoppingList,
} from "recipe-editor/controller/actions/shopping";
import { curationContextFor } from "recipe-editor/controller/apiContext";
import { addRecipeToGroup } from "recipe-editor/controller/actions/groups";
import { readGroupChoices } from "recipe-editor/controller/curation/groups";
import { GroupPicker } from "recipe-website-common/components/GroupPicker";
import { readShoppingLists } from "recipe-editor/controller/curation/shopping";
import { readGramsBankEntries } from "recipe-website-common/controller/data/readGramsBank";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const recipe = await recipeItems.read(slug);
  if (!recipe) notFound();
  return { title: recipe?.name || slug };
}

export default async function RecipePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const recipe = await recipeItems.read(slug);
  if (!recipe) notFound();
  const { date } = recipe;

  const deleteRecipeWithId = deleteRecipe.bind(null, date, slug);
  /* The shopping list is the signed-in editor's (35d): no button for a guest. */
  const email = (await auth())?.user?.email;
  const signedIn = Boolean(email);
  /* 50d: the lists the add may go to; a failed read offers the main list. */
  const lists = email
    ? await readShoppingLists(curationContextFor(email)).catch(() => undefined)
    : undefined;

  /* 51: the groups the "Group" button offers; a failed read offers none. */
  const groupChoices = email
    ? await readGroupChoices(curationContextFor(email), slug).catch(
        () => undefined,
      )
    : undefined;

  /* 51f: "Show grams" works its estimates out from the gram bank. */
  const gramsBank = await readGramsBankEntries().catch(() => []);

  return (
    <PageMain>
      <PageSection maxWidth="none" className="py-0" grow>
        <RecipeView
          recipe={recipe}
          slug={slug}
          gramsBank={gramsBank}
          ingredientActions={
            signedIn ? (
              <AddRecipeToShopping
                recipe={slug}
                add={addToShoppingList}
                createList={createSavedShoppingList}
                {...(lists ? { lists } : {})}
              />
            ) : undefined
          }
        />
      </PageSection>
      {signedIn && (
        <PageActions>
          <form
            id="delete-recipe-form"
            action={deleteRecipeWithId}
            className="contents"
          />
          <ConfirmDeleteButton
            formId="delete-recipe-form"
            itemLabel="recipe"
            description="This removes the recipe and its uploads, and commits the removal."
          />
          <Button asChild size="sm">
            <Link href={`/recipe/${slug}/edit`}>Edit</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/recipe/${slug}/copy`}>Copy</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/featured-recipe/new?recipe=${slug}`}>Feature</Link>
          </Button>
          <GroupPicker
            recipe={slug}
            groups={groupChoices ?? []}
            add={addRecipeToGroup}
          />
        </PageActions>
      )}
    </PageMain>
  );
}
