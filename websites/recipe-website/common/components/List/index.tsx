import Link from "next/link";
import { ReactNode } from "react";
import { MassagedRecipeEntry } from "../../controller/data/read";
import { RecipeImage } from "../RecipeImage";
import BookmarkButton from "../BookmarkButton";
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
  standardRecipeImageProps,
} from "./shared";

export function ButtonLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="">
      {children}
    </Link>
  );
}

export function RecipeListItem({
  slug,
  date,
  name,
  image,
  tags,
}: MassagedRecipeEntry) {
  return (
    <RecipeCard className="relative group">
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <BookmarkButton recipe={{ slug, date, name, image }} />
      </div>
      <RecipeCardLink href={`/recipe/${slug}`}>
        <RecipeCardImageContainer>
          {image ? (
            <RecipeImage
              slug={slug}
              image={image}
              alt="Recipe thumbnail"
              className={recipeCardImageClassName}
              {...standardRecipeImageProps}
            />
          ) : (
            <RecipeCardPlaceholder name={name} />
          )}
        </RecipeCardImageContainer>
        <RecipeCardName>{name}</RecipeCardName>
        <RecipeCardDate date={date} />
      </RecipeCardLink>
      <RecipeCardTagHint tags={tags} />
    </RecipeCard>
  );
}

export default function RecipeList({
  recipes,
}: {
  recipes: MassagedRecipeEntry[];
}) {
  return (
    <RecipeGrid>
      {recipes.map((entry) => {
        const { date, slug, name, image, tags } = entry;
        return (
          <li key={slug}>
            <RecipeListItem
              slug={slug}
              date={date}
              name={name}
              image={image}
              tags={tags}
            />
          </li>
        );
      })}
    </RecipeGrid>
  );
}
