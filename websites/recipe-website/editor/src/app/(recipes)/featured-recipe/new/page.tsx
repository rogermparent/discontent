import NewFeaturedRecipeForm from "./form";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { auth, signIn } from "@/auth";

export default async function NewFeaturedRecipe({
  searchParams,
}: {
  searchParams: Promise<{ recipe?: string; group?: string }>;
  params: Promise<{ slug: string }>;
}) {
  const { recipe: preselectedRecipe, group: preselectedGroup } =
    await searchParams;

  const user = await auth();
  if (!user) {
    /*
     * Whichever preselection brought the reader here survives the round trip —
     * the Feature button on a recipe page carries `?recipe=`, the one on a
     * group page carries `?group=` (22g), and losing either would drop them on
     * an empty form after signing in.
     */
    const redirectTo = preselectedRecipe
      ? `/featured-recipe/new?recipe=${preselectedRecipe}`
      : preselectedGroup
        ? `/featured-recipe/new?group=${preselectedGroup}`
        : "/featured-recipe/new";
    return signIn(undefined, { redirectTo });
  }

  return (
    <PageMain>
      <PageSection maxWidth="xl" grow>
        <NewFeaturedRecipeForm
          preselectedRecipe={preselectedRecipe}
          preselectedGroup={preselectedGroup}
        />
      </PageSection>
    </PageMain>
  );
}
