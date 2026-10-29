import { readTagPicker } from "recipe-website-common/controller/data/readTermPage";
import { recipeItems } from "recipe-website-common/controller/data/readRecipeItem";
import EditForm from "./form";
import { notFound } from "next/navigation";
import { getTransformedRecipeImageProps } from "recipe-website-common/components/RecipeImage";
import { auth, signIn } from "@/auth";
import { PageMain } from "recipe-website-common/components/PageLayout";
import { fillSourceUrl } from "recipe-editor/controller/curation/fillGaps";
import {
  llmConfig,
  llmUnconfiguredMessage,
} from "recipe-editor/controller/llm/client";
import { readerLabel } from "recipe-editor/controller/llm/readerLabel";

export const dynamic = "force-dynamic";

/** A job id as `?fill=` may carry it: one value, the store's shape. */
function fillJobParam(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" && /^[0-9A-Z]{26}$/.test(value)
    ? value
    : undefined;
}

export default async function Recipe({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ fill?: string | string[] }>;
}) {
  const { slug } = await params;
  const fillJob = fillJobParam((await searchParams).fill);
  const user = await auth();
  if (!user) {
    return signIn(undefined, {
      redirectTo: `/recipe/${slug}/edit${fillJob ? `?fill=${fillJob}` : ""}`,
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
  const tagPicker = await readTagPicker();
  /* 45b: what "Fill gaps from the source" reads, and who estimates. */
  const fillSource = fillSourceUrl(recipe);
  /* 46f: who "Look for alternatives with the model" asks, or why none. */
  const config = llmConfig();
  const choicesModel = config ? readerLabel(config) : undefined;
  return (
    <PageMain>
      {/* 43e1: the form draws its own frame — heading, rail and sections. */}
      <EditForm
        recipe={recipe}
        slug={slug}
        defaultImage={defaultImage}
        tagPicker={tagPicker}
        fillSource={fillSource}
        llmModel={fillSource ? config?.model : undefined}
        choicesModel={choicesModel}
        choicesUnavailable={
          choicesModel
            ? undefined
            : `No model is set up in this editor, so none can be asked (${llmUnconfiguredMessage()}).`
        }
        initialFillJob={fillSource ? fillJob : undefined}
      />
    </PageMain>
  );
}
