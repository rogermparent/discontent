import type { PaginationPage } from "@discontent/cms/pagination/types";
import RecipeList from "../List";
import type { RecipeListEntry } from "../../controller/paginationConfigs";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import { EmptyState } from "../EmptyState";
import { RecipeIndexList } from "./RecipeIndexList";

/**
 * One surface of the paginated recipe index — the landing, or one numbered
 * page. Both render identically apart from their navigation, so they share a
 * component and differ only in the page they are handed.
 *
 * Still a server component. `RecipeIndexList` below it is the client half, and
 * it is handed this component's own render of the list as a slot rather than
 * the items to render: a recipe card's image is produced by an async server
 * component that resizes on disk, so the seed page has to be rendered here or
 * not at all. Only pages appended past the seed are rendered on the client.
 */
export function RecipeIndexPageWrapper({
  page,
  isLanding,
}: {
  page: PaginationPage<RecipeListEntry>;
  isLanding: boolean;
}) {
  return (
    <PageMain>
      <PageSection grow>
        <PageHeading>All Recipes</PageHeading>
        {page.items.length > 0 ? (
          <RecipeIndexList
            page={page}
            isLanding={isLanding}
            seed={<RecipeList recipes={page.items} />}
          />
        ) : (
          <EmptyState message="There are no recipes yet." />
        )}
      </PageSection>
    </PageMain>
  );
}
