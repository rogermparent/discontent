import {
  readTagLabels,
  readTagPicker,
} from "recipe-website-common/controller/data/readTermPage";
import { recipeItems } from "recipe-website-common/controller/data/readRecipeItem";
import EditForm from "./form";
import { notFound } from "next/navigation";
import { getTransformedRecipeImageProps } from "recipe-website-common/components/RecipeImage";
import { auth, signIn } from "@/auth";
import { PageMain } from "recipe-website-common/components/PageLayout";

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
      redirectTo: `/recipe/${slug}/edit`,
    });
  }
  const recipe = await recipeItems.read(slug);
  if (!recipe) notFound();
  const { image } = recipe;
  const defaultImage =
    slug && image
      ? await getTransformedRecipeImageProps({
          slug,
          image,
          alt: "Heading image",
          width: 580,
          height: 450,
          className: "object-cover aspect-ratio-[16/10] h-96",
          sizes: "100vw",
        })
      : undefined;
  const [allTags, tagPicker] = await Promise.all([
    readTagLabels(),
    readTagPicker(),
  ]);
  return (
    <PageMain>
      {/* 43e1: the form draws its own frame — heading, rail and sections. */}
      <EditForm
        recipe={recipe}
        slug={slug}
        defaultImage={defaultImage}
        allTags={allTags}
        tagPicker={tagPicker}
      />
    </PageMain>
  );
}
