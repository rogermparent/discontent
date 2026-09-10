import Link from "next/link";
import type { ReactNode } from "react";
import type { FeaturedRecipeListEntry } from "../../../controller/paginationConfigs";
import { RecipeImage } from "../../RecipeImage";
import Markdown from "@discontent/component-library/components/Markdown";
import { GroupCard } from "./GroupCard";
import {
  RecipeCard,
  RecipeCardLink,
  RecipeCardImageContainer,
  RecipeCardName,
  RecipeCardDate,
  RecipeGrid,
  recipeCardImageClassName,
  standardRecipeImageProps,
} from "../shared";

/**
 * The "View Feature" line and the note, which only `/featured-recipes` shows —
 * the homepage strip passes neither. Shared by both card kinds so the two
 * branches cannot drift apart.
 */
function FeatureFooter({ slug, note }: { slug: string; note?: string }) {
  return (
    <>
      <div className="px-3 py-1 text-xs">
        <Link
          href={`/featured-recipe/${slug}`}
          className="text-primary hover:text-primary/80 hover:underline"
        >
          View Feature
        </Link>
      </div>
      {note && (
        <div className="px-3 py-2 text-sm prose prose-invert max-w-none">
          <Markdown>{note}</Markdown>
        </div>
      )}
    </>
  );
}

/**
 * One entry of the featured index, as whichever card it points at (22g).
 *
 * `group` is the discriminator, and it is the only one: an entry sets exactly
 * one of `recipe`/`group`, so checking the newer field keeps every record
 * written before 22g on the recipe branch with no migration.
 */
function FeaturedRecipeListItem(entry: FeaturedRecipeListEntry) {
  if (entry.group) {
    return (
      <GroupCard
        slug={entry.group}
        name={entry.groupName}
        kind={entry.groupKind}
        date={entry.date}
        footer={<FeatureFooter slug={entry.slug} note={entry.note} />}
      />
    );
  }
  return (
    <FeaturedRecipeCard
      {...entry}
      recipeSlug={entry.recipe ?? ""}
      footer={<FeatureFooter slug={entry.slug} note={entry.note} />}
    />
  );
}

function FeaturedRecipeCard({
  date,
  recipeName,
  recipeImage,
  recipeSlug,
  footer,
}: FeaturedRecipeListEntry & { recipeSlug: string; footer?: ReactNode }) {
  return (
    <RecipeCard>
      <RecipeCardLink href={`/recipe/${recipeSlug}`}>
        <RecipeCardImageContainer>
          {recipeImage && (
            <RecipeImage
              slug={recipeSlug}
              image={recipeImage}
              alt="Recipe thumbnail"
              className={recipeCardImageClassName}
              {...standardRecipeImageProps}
            />
          )}
        </RecipeCardImageContainer>
        <RecipeCardName className="line-clamp-2">{recipeName}</RecipeCardName>
        <RecipeCardDate date={date} showTime />
      </RecipeCardLink>
      {footer}
    </RecipeCard>
  );
}

export default function FeaturedRecipeList({
  featuredRecipes,
}: {
  featuredRecipes: FeaturedRecipeListEntry[];
}) {
  return (
    <RecipeGrid>
      {featuredRecipes.map((entry) => (
        <li key={entry.slug}>
          <FeaturedRecipeListItem {...entry} />
        </li>
      ))}
    </RecipeGrid>
  );
}
