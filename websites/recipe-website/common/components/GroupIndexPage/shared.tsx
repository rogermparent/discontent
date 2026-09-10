import type { PaginationPage } from "@discontent/cms/pagination/types";
import Link from "next/link";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import type { GroupListEntry } from "../../controller/groupPaginationConfig";
import { EmptyState } from "../EmptyState";
import GroupList from "../List/Group";
import { RecipePagination } from "../Pagination";

/**
 * One surface of the paginated group index — the landing, or one numbered page.
 * Both render identically apart from their navigation, so they share a
 * component and differ only in the page they are handed.
 */
export function GroupIndexPageWrapper({
  page,
  isLanding,
}: {
  page: PaginationPage<GroupListEntry>;
  isLanding: boolean;
}) {
  return (
    <PageMain>
      <PageSection grow>
        <PageHeading>Groups</PageHeading>
        {page.items.length > 0 ? (
          <div>
            <GroupList groups={page.items} />
            <RecipePagination
              basePath="/groups"
              page={page}
              isLanding={isLanding}
            />
          </div>
        ) : (
          <EmptyState
            title="No groups yet"
            message="Group recipes into a meal plan or a collection to see them here."
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
