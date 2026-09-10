import type { PaginationPage } from "@discontent/cms/pagination/types";
import Link from "next/link";
import FeaturedRecipeList from "../List/FeaturedRecipe";
import type { FeaturedRecipeListEntry } from "../../controller/paginationConfigs";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import { Button } from "@discontent/component-library/components/ui/button";
import { RecipePagination } from "../Pagination";
import { EmptyState } from "../EmptyState";

/**
 * One surface of the paginated featured-recipe index — the landing, or one
 * numbered page. Both render identically apart from their navigation, so they
 * share a component and differ only in the page they are handed.
 */
export function FeaturedRecipeIndexPageWrapper({
  page,
  isLanding,
}: {
  page: PaginationPage<FeaturedRecipeListEntry>;
  isLanding: boolean;
}) {
  return (
    <PageMain>
      <PageSection grow>
        <PageHeading>Featured Recipes</PageHeading>
        {page.items.length > 0 ? (
          <div>
            <FeaturedRecipeList featuredRecipes={page.items} />
            <RecipePagination
              basePath="/featured-recipes"
              page={page}
              isLanding={isLanding}
            />
          </div>
        ) : (
          <EmptyState
            title="No featured recipes yet"
            message="Feature a recipe to spotlight it here."
            action={
              <Button asChild>
                <Link href="/recipes">Browse all recipes</Link>
              </Button>
            }
          />
        )}
      </PageSection>
    </PageMain>
  );
}
