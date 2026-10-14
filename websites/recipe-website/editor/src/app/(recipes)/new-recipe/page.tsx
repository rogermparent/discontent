import NewRecipeWorkspace from "./workspace";
import { auth, signIn } from "@/auth";
import {
  readTagLabels,
  readTagVocabulary,
} from "recipe-website-common/controller/data/readTermPage";
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
  const [allTags, vocabulary] = await Promise.all([
    readTagLabels(),
    readTagVocabulary(),
  ]);

  return (
    <PageMain>
      <PageSection maxWidth="xl" grow>
        {/* 35r: the roundup picker above the form; the single-URL import
            inside the form is unchanged, and waits while a run is in flight. */}
        <NewRecipeWorkspace
          initialState={initialState}
          allTags={allTags}
          terms={vocabulary.map(({ slug, label }) => ({ slug, label }))}
        />
      </PageSection>
    </PageMain>
  );
}
