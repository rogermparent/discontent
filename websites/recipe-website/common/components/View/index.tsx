/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Recipe } from "../../controller/types";

import { Badge } from "@discontent/component-library/components/ui/badge";
import Markdown from "@discontent/component-library/components/Markdown";
import { getTransformedRecipeImageProps } from "../RecipeImage";
import { ScaledYield } from "./Multiplier";
import { MetaBar } from "./shared";
import { Instructions } from "./Instructions";
import { MultiplierProvider } from "./Multiplier/Provider";
import { VideoPlayerProvider } from "@discontent/component-library/components/VideoPlayer/Provider";
import { VideoPlayer } from "@discontent/component-library/components/VideoPlayer";
import { RecipeJsonLD } from "./JsonLD";
import { Ingredients } from "./Ingredients";
import { AppearsIn } from "./AppearsIn";
import { SourceLine } from "./SourceLine";
import { RecipeSchedule } from "./Schedule";
import BookmarkButton from "../BookmarkButton";
import { resolveRecipeVideoSrc } from "../../controller/recipeVideo";
import { formatDurationLong } from "../../util/formatDuration";
import { tagSearchHref } from "../SearchForm/queryLanguage";

export async function RecipeView({
  recipe,
  slug,
}: {
  recipe?: Recipe;
  slug: string;
}) {
  if (!recipe) {
    throw new Error("Recipe data not found!");
  }

  const {
    name,
    prepTime,
    cookTime,
    description,
    image,
    instructions,
    ingredients,
    video,
    timelines,
    date,
    tags,
  } = recipe;

  // Calculate the totalTime from prepTime and cookTime if not provided
  const totalTime = recipe.totalTime || (prepTime || 0) + (cookTime || 0);

  const recipeImageProps = image
    ? await getTransformedRecipeImageProps({
        slug: slug,
        image: image,
        alt: `Photo of ${name}`,
        width: 580,
        height: 450,
        sizes: "100vw",
        className: "object-cover absolute w-full h-full inset-0 rounded-md",
        loading: "eager",
      })
    : undefined;

  return (
    <MultiplierProvider>
      <VideoPlayerProvider>
        <RecipeJsonLD recipe={recipe} image={recipeImageProps?.props.src} />
        <div className="w-full h-full p-2 print:p-0 grow flex flex-col flex-nowrap">
          <div className="container mx-auto lg:flex lg:flex-row justify-center print:w-full print:max-w-full">
            <div className="aspect-[16/10] w-full lg:aspect-auto lg:h-96 lg:max-w-96 lg:mr-4 print:hidden relative">
              {recipeImageProps && (
                <img {...recipeImageProps.props} alt={`Photo of ${name}`} />
              )}
              {video && (
                <VideoPlayer
                  src={resolveRecipeVideoSrc(slug, video)}
                  className="object-cover absolute w-full h-full inset-0"
                />
              )}
            </div>
            <div className="flex-1 max-w-xl mx-auto lg:mx-0 print:max-w-full">
              <div className="flex flex-row items-start justify-between mt-4 mb-6">
                <h1 className="text-3xl font-bold mr-4">{name}</h1>
                <div className="print:hidden">
                  <BookmarkButton recipe={{ slug, date, name, image }} />
                </div>
              </div>
              {tags && tags.length > 0 && (
                <div
                  className="flex flex-row flex-wrap items-center gap-1.5 mb-4 print:hidden"
                  aria-label="Tags"
                >
                  {tags.map((tag) => (
                    <Badge key={tag} asChild variant="secondary">
                      <Link href={tagSearchHref(tag)}>{tag}</Link>
                    </Badge>
                  ))}
                </div>
              )}
              {description && (
                <div className="my-2">
                  <Markdown>{description}</Markdown>
                </div>
              )}
              <SourceLine source={recipe.source} />
              {/* Canonical meta strip — Prep · Cook · Total · Yield. Yield scales
                  in place with the Ingredients-header scaler (both share the
                  MultiplierProvider). Fills the hero's formerly-dead right half. */}
              <MetaBar
                items={[
                  ...(prepTime
                    ? [{ label: "Prep", value: formatDurationLong(prepTime) }]
                    : []),
                  ...(cookTime
                    ? [{ label: "Cook", value: formatDurationLong(cookTime) }]
                    : []),
                  ...(totalTime
                    ? [{ label: "Total", value: formatDurationLong(totalTime) }]
                    : []),
                  ...(recipe.recipeYield
                    ? [
                        {
                          label: "Yield",
                          value: <ScaledYield recipe={recipe} />,
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          </div>
          {timelines && timelines.length > 0 && (
            <RecipeSchedule timelines={timelines} />
          )}
          {/* The scaler used to sit in a full-width sticky bar here; it now lives
              in the Ingredients header (PR 11), where recipe sites put it. */}
          <div className="justify-center flex-nowrap container mx-auto p-2 lg:flex lg:flex-row print:w-full print:max-w-full print:flex print:flex-row rounded">
            <Ingredients ingredients={ingredients} />
            <Instructions instructions={instructions} />
          </div>
          {/* Below the recipe itself, because it is about the recipe rather
              than part of it, and because it is the one block here that reads
              a *different* content type's derived state (22b/D4). */}
          <AppearsIn slug={slug} />
        </div>
      </VideoPlayerProvider>
    </MultiplierProvider>
  );
}
