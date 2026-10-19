/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { ReactNode } from "react";
import { Recipe } from "../../controller/types";

import { Badge } from "@discontent/component-library/components/ui/badge";
import Markdown from "@discontent/component-library/components/Markdown";
import { getTransformedRecipeImageProps } from "../RecipeImage";
import { ScaledYield } from "./Multiplier";
import { MetaBar } from "./shared";
import { Instructions } from "./Instructions";
import { MultiplierProvider } from "./Multiplier/Provider";
import { UnitProvider } from "./Units";
import { FocusViewButton } from "./FocusView";
import { VideoPlayerProvider } from "@discontent/component-library/components/VideoPlayer/Provider";
import { VideoPlayer } from "@discontent/component-library/components/VideoPlayer";
import { RecipeJsonLD } from "./JsonLD";
import { Ingredients } from "./Ingredients";
import { AppearsIn } from "./AppearsIn";
import { SourceLine } from "./SourceLine";
import { JumpLinks } from "./JumpLinks";
import { DrinkSpecBar } from "./DrinkSpec";
import { RecipeSchedule } from "./Schedule";
import BookmarkButton from "../BookmarkButton";
import { resolveRecipeVideoSrc } from "../../controller/recipeVideo";
import { isYouTubeUrl, videoStartSeconds } from "../../util/videoUrl";
import { formatDurationLong } from "../../util/formatDuration";
import { tagSearchHref } from "../SearchForm/queryLanguage";
import { RecipeCardPlaceholder } from "../List/shared";
import { HeadsUpNotes } from "./HeadsUp";
import { matchStepIngredients } from "../../util/stepIngredients";
import { findHeadsUps } from "../../util/headsUp";

export async function RecipeView({
  recipe,
  slug,
  ingredientActions,
}: {
  recipe?: Recipe;
  slug: string;
  /**
   * Controls for the Ingredients header (35d: the editor's "Add to list"),
   * rendered inside `MultiplierProvider`. Only the editor passes them.
   */
  ingredientActions?: ReactNode;
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

  /* 42c1 (D3): worked out here, on the server, so neither the matcher nor
     `ingredientNames` ships to the browser. */
  const stepLines = matchStepIngredients(ingredients, instructions);
  const headsUps = findHeadsUps(instructions, timelines);

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
      {/* oz · ml · parts (27c): one mode for the list, the batching note and
          the focus view, worked out from the stored lines. */}
      <UnitProvider
        lines={(ingredients ?? []).map(({ ingredient }) => ingredient)}
      >
        <VideoPlayerProvider>
          <RecipeJsonLD
            recipe={recipe}
            image={recipeImageProps?.props.src}
            video={resolveRecipeVideoSrc(slug, video)}
          />
          <div className="w-full h-full p-2 print:p-0 grow flex flex-col flex-nowrap">
            <div className="container mx-auto lg:flex lg:flex-row justify-center print:w-full print:max-w-full">
              <div className="aspect-[16/10] w-full lg:aspect-auto lg:h-96 lg:max-w-96 lg:mr-4 print:hidden relative">
                {recipeImageProps ? (
                  <img {...recipeImageProps.props} alt={`Photo of ${name}`} />
                ) : (
                  image &&
                  !video && (
                    /* Named, but not on this editor (D10): not copied here
                       yet, or dropped. A monogram, not an empty frame. */
                    <div
                      className="absolute inset-0 overflow-hidden rounded-md"
                      data-testid="recipe-image-missing"
                    >
                      <RecipeCardPlaceholder name={name} />
                    </div>
                  )
                )}
                {video && (
                  <VideoPlayer
                    src={resolveRecipeVideoSrc(slug, video)}
                    className="object-cover absolute w-full h-full inset-0"
                    /* A recipe from a several-recipe video starts at its
                       chapter (36e): YouTube's `t=` is not read by the
                       embed, its `start` player parameter is; Vimeo's
                       `#t=` is not read either, so the player seeks
                       there (38c). */
                    {...(videoStartSeconds(video) === undefined
                      ? {}
                      : isYouTubeUrl(video)
                        ? {
                            config: {
                              youtube: { start: videoStartSeconds(video) },
                            },
                          }
                        : { start: videoStartSeconds(video) })}
                  />
                )}
              </div>
              <div className="flex-1 max-w-xl mx-auto lg:mx-0 print:max-w-full">
                <div className="flex flex-row items-start justify-between mt-4 mb-6">
                  <h1 className="text-3xl font-bold mr-4">{name}</h1>
                  <div className="flex flex-row items-center gap-2 print:hidden">
                    <FocusViewButton
                      name={name}
                      drink={recipe.drink}
                      isDrink={tags?.some(
                        (tag) => tag.toLowerCase() === "drink",
                      )}
                      ingredients={ingredients}
                      instructions={instructions}
                    />
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
                      ? [
                          {
                            label: "Total",
                            value: formatDurationLong(totalTime),
                          },
                        ]
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
                <DrinkSpecBar drink={recipe.drink} />
                <JumpLinks
                  ingredients={ingredients}
                  instructions={instructions}
                />
              </div>
            </div>
            {/*
             * The recipe in cooking order (42c1, canvas B): the ingredients a
             * sticky rail beside the steps from `lg`, each step with what it
             * uses, and the heads-up above them. At 1600px and wider (unless
             * the reader turned it off) a third column takes the heads-up,
             * the cook schedule and "Appears in" (canvas C). One DOM for
             * every layout; the grid areas in `recipe.css` place it.
             */}
            <div className="recipe-body w-full p-2 print:block print:w-full print:max-w-full">
              {timelines && timelines.length > 0 && (
                <div className="recipe-area-schedule min-w-0">
                  <RecipeSchedule timelines={timelines} />
                </div>
              )}
              <HeadsUpNotes
                notes={headsUps}
                className="recipe-area-headsup mx-auto mb-3 w-full max-w-xl lg:max-w-none"
              />
              {/* The scaler used to sit in a full-width sticky bar here; it now
                lives in the Ingredients header (PR 11), where recipe sites put
                it. */}
              <Ingredients
                ingredients={ingredients}
                drink={recipe.drink}
                actions={ingredientActions}
                className="recipe-area-ingredients"
              />
              <Instructions
                instructions={instructions}
                ingredients={ingredients}
                uses={stepLines}
                className="recipe-area-steps"
              />
              {/* After the recipe itself, because it is about the recipe rather
                than part of it, and because it is the one block here that
                reads a *different* content type's derived state (22b/D4). */}
              <div className="recipe-area-appears min-w-0">
                <AppearsIn slug={slug} />
              </div>
            </div>
          </div>
        </VideoPlayerProvider>
      </UnitProvider>
    </MultiplierProvider>
  );
}
