import NewFeaturedRecipeForm from "./form";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { auth, signIn } from "@/auth";

export default async function NewFeaturedRecipe({
  searchParams,
}: {
  searchParams: Promise<{ recipe?: string; group?: string; term?: string }>;
  params: Promise<{ slug: string }>;
}) {
  const {
    recipe: preselectedRecipe,
    group: preselectedGroup,
    term: preselectedTerm,
  } = await searchParams;

  const user = await auth();
  if (!user) {
    /*
     * Whichever preselection brought the reader here survives the round trip —
     * the Feature button on a recipe page carries `?recipe=`, the one on a
     * group page carries `?group=` (22g), the one on a term page carries
     * `?term=` (24c), and losing any of them would drop the reader on an empty
     * form after signing in.
     */
    const redirectTo = preselectedRecipe
      ? `/featured-recipe/new?recipe=${preselectedRecipe}`
      : preselectedGroup
        ? `/featured-recipe/new?group=${preselectedGroup}`
        : preselectedTerm
          ? `/featured-recipe/new?term=${preselectedTerm}`
          : "/featured-recipe/new";
    return signIn(undefined, { redirectTo });
  }

  return (
    <PageMain>
      <PageSection maxWidth="xl" grow>
        <NewFeaturedRecipeForm
          preselectedRecipe={preselectedRecipe}
          preselectedGroup={preselectedGroup}
          preselectedTerm={preselectedTerm}
        />
      </PageSection>
    </PageMain>
  );
}
