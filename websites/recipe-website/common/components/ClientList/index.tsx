import { MassagedRecipeEntry } from "../../controller/data/read";
import { PureStaticImage } from "@discontent/next-static-image/src/Pure";
import {
  RecipeCard,
  RecipeCardLink,
  RecipeCardImageContainer,
  RecipeCardName,
  RecipeCardDate,
  RecipeCardPlaceholder,
  RecipeCardTagHint,
  RecipeGrid,
  recipeCardImageClassName,
} from "../List/shared";

export function ClientListItem({
  recipe: { slug, date, name, image, tags },
}: {
  recipe: MassagedRecipeEntry;
}) {
  return (
    <RecipeCard>
      <RecipeCardLink href={`/recipe/${slug}`}>
        <RecipeCardImageContainer>
          {image ? (
            <PureStaticImage
              slug={slug}
              image={image}
              alt="Recipe thumbnail"
              width={400}
              height={600}
              className={recipeCardImageClassName}
            />
          ) : (
            <RecipeCardPlaceholder name={name} />
          )}
        </RecipeCardImageContainer>
        <RecipeCardName>{name}</RecipeCardName>
        {date && <RecipeCardDate date={date} />}
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
