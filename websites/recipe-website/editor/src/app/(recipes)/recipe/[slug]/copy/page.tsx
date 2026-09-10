import { getAllTags } from "recipe-website-common/controller/data/read";
import { recipeItems } from "recipe-website-common/controller/data/readRecipeItem";
import CopyForm from "./form";
import { notFound } from "next/navigation";
import { auth, signIn } from "@/auth";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";

export const dynamic = "force-dynamic";

export default async function Recipe({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await auth();
  if (!user) {
    return signIn(undefined, {
      redirectTo: `/recipe/${slug}/copy`,
    });
  }
  const recipe = await recipeItems.read(slug);
  if (!recipe) notFound();
  const allTags = await getAllTags();
  return (
    <PageMain>
      <PageSection maxWidth="xl" grow>
        <PageHeading as="h1">Copying recipe</PageHeading>
        <CopyForm recipe={recipe} allTags={allTags} />
      </PageSection>
    </PageMain>
  );
}
