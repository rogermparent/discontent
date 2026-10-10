import CreateForm from "./form";
import { auth, signIn } from "@/auth";
import { readTagLabels } from "recipe-website-common/controller/data/readTermPage";
import { reduceRecipeImport } from "./common";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";

export default async function NewRecipe({
  searchParams,
}: {
  searchParams: Promise<{ import?: string }>;
}) {
  const { import: importURL } = await searchParams;
  const user = await auth();
  if (!user) {
    return signIn(undefined, {
      redirectTo: `/new-recipe`,
    });
  }

  const initialState = importURL
    ? await reduceRecipeImport(null, importURL)
    : null;
  const allTags = await readTagLabels();

  return (
    <PageMain>
      <PageSection maxWidth="xl" grow>
        <CreateForm initialState={initialState} allTags={allTags} />
      </PageSection>
    </PageMain>
  );
}
