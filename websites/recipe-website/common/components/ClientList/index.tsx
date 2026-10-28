import type { ReactNode } from "react";
import { MassagedRecipeEntry } from "../../controller/data/read";
import { PureRecipeImage } from "../RecipeImage/PureRecipeImage";
import {
  RecipeCard,
  RecipeCardLink,
  RecipeCardImageContainer,
  RecipeCardName,
  RecipeCardDate,
  RecipeCardMeta,
  RecipeCardPlaceholder,
  RecipeCardTagHint,
  RecipeGrid,
  recipeCardImageClassName,
} from "../List/shared";

export function ClientListItem({
  recipe: { slug, date, name, image, tags },
  meta,
}: {
  recipe: MassagedRecipeEntry;
  /** A line in place of the date (46e: a term page's time). */
  meta?: ReactNode;
}) {
  return (
    <RecipeCard>
      <RecipeCardLink href={`/recipe/${slug}`}>
        <RecipeCardImageContainer>
          {image ? (
            <PureRecipeImage
              slug={slug}
              image={image}
              alt="Recipe thumbnail"
              width={400}
              height={600}
              className={recipeCardImageClassName}
              fallback={<RecipeCardPlaceholder name={name} />}
            />
          ) : (
            <RecipeCardPlaceholder name={name} />
          )}
        </RecipeCardImageContainer>
        <RecipeCardName>{name}</RecipeCardName>
        {meta !== undefined ? (
          <RecipeCardMeta>{meta}</RecipeCardMeta>
        ) : (
          date && <RecipeCardDate date={date} />
        )}
      </RecipeCardLink>
      <RecipeCardTagHint tags={tags} />
    </RecipeCard>
  );
}

export default function ClientRecipeList({
  recipes,
}: {
  recipes: MassagedRecipeEntry[];
}) {
  return (
    <RecipeGrid>
      {recipes &&
        recipes.map((recipe) => {
          return (
            <li key={recipe.slug}>
              <ClientListItem recipe={recipe} />
            </li>
          );
        })}
    </RecipeGrid>
  );
}
