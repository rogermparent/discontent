import NewGroupForm from "./form";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { auth, signIn } from "@/auth";

export default async function NewGroup({
  searchParams,
}: {
  searchParams: Promise<{ recipe?: string }>;
}) {
  const { recipe: preselectedRecipe } = await searchParams;

  const user = await auth();
  if (!user) {
    /*
     * The preselection has to survive the sign-in round trip, or the "Group"
     * button on a recipe page loses its whole point for a signed-out owner.
     */
    const redirectTo = preselectedRecipe
      ? `/group/new?recipe=${preselectedRecipe}`
      : "/group/new";
    return signIn(undefined, { redirectTo });
  }

  return (
    <PageMain>
      <PageSection maxWidth="xl" grow>
        <NewGroupForm preselectedRecipe={preselectedRecipe} />
      </PageSection>
    </PageMain>
  );
}
