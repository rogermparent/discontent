import { Recipe as JsonLDRecipe, WithContext } from "schema-dts";
import { Recipe } from "../../../controller/types";
import { flattenMarkdown } from "recipe-website-common/controller/buildIndexValue";
import { getWebsiteRoot } from "@discontent/cms/util/getWebsiteRoot";
import { minutesToDuration } from "recipe-website-common/util/isoDuration";
import { recipeOnPath } from "recipe-website-common/util/readChoices";

function buildJsonLDIngredients(
  recipe: Recipe,
): JsonLDRecipe["recipeIngredient"] {
  const { ingredients } = recipe;

  const recipeIngredient = [];

  if (ingredients) {
    for (const ingredient of ingredients) {
      if (!ingredient.type) {
        recipeIngredient.push(flattenMarkdown(ingredient.ingredient));
      }
    }
  }

  return recipeIngredient as JsonLDRecipe["recipeIngredient"];
}

export function buildJsonLDInstructions(
  recipe: Recipe,
): JsonLDRecipe["recipeInstructions"] {
  const { instructions } = recipe;

  const recipeInstructions = [];

  if (instructions) {
    for (const instructionEntry of instructions) {
      if ("instructions" in instructionEntry) {
        recipeInstructions.push({
          "@type": "HowToSection",
          /* The group's own name (G6: every section used to be "To Store"). */
          name: instructionEntry.name || undefined,
          itemListElement: instructionEntry.instructions.map(
            ({ text, name }) => ({
              "@type": "HowToStep",
              text: flattenMarkdown(text),
              name,
            }),
          ),
        });
      } else {
        recipeInstructions.push({
          "@type": "HowToStep",
          text: flattenMarkdown(instructionEntry.text),
          name: instructionEntry.name,
        });
      }
    }
  }

  return recipeInstructions as JsonLDRecipe["recipeInstructions"];
}

/** A site-relative path made absolute; an absolute URL passed through. */
function absoluteUrl(src: string): string {
  return /^https?:\/\//.test(src) ? src : getWebsiteRoot() + src;
}

/**
 * The recipe as schema.org JSON-LD. `image` and `video` are the sources the
 * page itself renders (a transformed image path; `resolveRecipeVideoSrc`'s
 * URL or upload path), made absolute here.
 *
 * Since 26d it carries what the recipe stores beyond the lists: the
 * description (flattened, as the index flattens it), the yield, the times as
 * ISO-8601 durations, the video, and — for a drink — `recipeCategory: "Drink"`
 * and its method as `cookingMethod`.
 */
export function buildRecipeJsonLD(
  stored: Recipe,
  image: string | undefined,
  video?: string,
): JsonLDRecipe {
  /* 45e (G2, G6): one recipe for a crawler — the default option of each
     set of alternatives, its lines, its steps and its yield. */
  const recipe = recipeOnPath(stored);
  const { name } = recipe;

  const jsonLD: WithContext<JsonLDRecipe> = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    ...(image ? { image: absoluteUrl(image) } : {}),
    name,
    recipeIngredient: buildJsonLDIngredients(recipe),
    recipeInstructions: buildJsonLDInstructions(recipe),
  };

  const description = recipe.description
    ? flattenMarkdown(recipe.description)
    : "";
  if (description) jsonLD.description = description;

  if (recipe.recipeYield) jsonLD.recipeYield = recipe.recipeYield;

  /* `totalTime` falls back to prep + cook, exactly as the page shows it. */
  const prepTime = minutesToDuration(recipe.prepTime);
  const cookTime = minutesToDuration(recipe.cookTime);
  const totalTime = minutesToDuration(
    recipe.totalTime || (recipe.prepTime || 0) + (recipe.cookTime || 0),
  );
  if (prepTime) jsonLD.prepTime = prepTime;
  if (cookTime) jsonLD.cookTime = cookTime;
  if (totalTime) jsonLD.totalTime = totalTime;

  if (video) {
    jsonLD.video = {
      "@type": "VideoObject",
      name,
      contentUrl: absoluteUrl(video),
    };
  }

  /* A drink spec's presence is what makes a recipe a drink (25a/D1). */
  if (recipe.drink) {
    jsonLD.recipeCategory = "Drink";
    if (recipe.drink.method) jsonLD.cookingMethod = recipe.drink.method;
  }

  // schema.org keywords: a comma-separated list of the recipe's tags.
  if (recipe.tags && recipe.tags.length > 0) {
    jsonLD.keywords = recipe.tags.join(", ");
  }

  // The citation, in the vocabulary a crawler already reads (D6/22a).
  // `isBasedOn` is schema.org's "derived from this work" — exactly what an
  // imported or adapted recipe's `source.url` is.
  if (recipe.source?.url) {
    jsonLD.isBasedOn = recipe.source.url;
  }

  return jsonLD;
}

/**
 * JSON for an inline `<script type="application/ld+json">`. `JSON.stringify`
 * leaves `<` alone, so a recipe name holding `</script>` (from an imported
 * page, or pasted text's first line) would close the tag and run what
 * follows: a stored XSS. `<` is the same character to a JSON parser
 * and nothing to the HTML tokenizer; `>` and `&` are escaped alike.
 */
export function serializeJsonLD(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function RecipeJsonLD({
  recipe,
  image,
  video,
}: {
  recipe: Recipe;
  image?: string;
  video?: string;
}) {
  const recipeJsonLD = buildRecipeJsonLD(recipe, image, video);
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLD(recipeJsonLD) }}
    />
  );
}
