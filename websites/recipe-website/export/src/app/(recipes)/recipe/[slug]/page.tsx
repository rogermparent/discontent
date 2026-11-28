import { notFound } from "next/navigation";
import { recipeItems } from "recipe-website-common/controller/data/readRecipeItem";
import { RecipeView } from "recipe-website-common/components/View";
import { readAllRecipeIds } from "recipe-website-common/controller/data/readRecipePages";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import {
  gramsBankOrSeed,
  readGramsBankEntries,
} from "recipe-website-common/controller/data/readGramsBank";
import { recipesByDate } from "recipe-website-common/controller/paginationConfigs";
import { staticSlugParams } from "../../../../staticSlugParams";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";

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

export default async function Recipe({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const recipe = await recipeItems.read(slug);
  if (!recipe) notFound();
  /* 51f: "Show grams" from the gram bank, read at build time (Df6). */
  const gramsBank = await readGramsBankEntries().catch(gramsBankOrSeed);

  return (
    <PageMain>
      <PageSection maxWidth="none" className="py-0" grow>
        <RecipeView recipe={recipe} slug={slug} gramsBank={gramsBank} />
      </PageSection>
    </PageMain>
  );
}

/*
 * A keys-only walk of the sorted keyspace, not a read of the content index
 * (F7). The old form deserialized every recipe's whole index value to throw
 * all of it away and keep the slug; the keyspace *is* the slug list.
 */
export async function generateStaticParams() {
  /*
   * Never empty, and loud when the index is missing: see `staticSlugParams`.
   */
  return staticSlugParams(readAllRecipeIds, recipeContentConfig, recipesByDate);
}
