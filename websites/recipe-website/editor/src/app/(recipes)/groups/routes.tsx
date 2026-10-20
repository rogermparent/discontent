import type { PaginationPage } from "@discontent/cms/pagination/types";
import { createPaginatedIndexRoute } from "@discontent/cms/pagination/next/createPaginatedIndexRoute";
import { groupPages } from "recipe-website-common/controller/data/readGroupPages";
import type { GroupListEntry } from "recipe-website-common/controller/groupPaginationConfig";
import {
  GroupIndexPageWrapper,
  type PlanIndexExtras,
} from "recipe-website-common/components/GroupIndexPage/shared";
import { curationContextFor } from "recipe-editor/controller/apiContext";
import { readShoppingItems } from "recipe-editor/controller/curation/shopping";
import { auth } from "@/auth";

/**
 * What a signed-in editor sees on /groups beyond the export's list (43p1):
 * "New plan", and each plan's lines on the shopping list (through `via`,
 * nested plans included). A guest gets the export's page. A failed list
 * read leaves the captions off rather than failing the page.
 */
async function readExtras(): Promise<PlanIndexExtras | undefined> {
  const email = (await auth())?.user?.email;
  if (!email) return undefined;
  const onList: Record<string, number> = {};
  try {
    for (const item of await readShoppingItems(curationContextFor(email))) {
      for (const slug of new Set(item.via ?? [])) {
        onList[slug] = (onList[slug] ?? 0) + 1;
      }
    }
  } catch {
    /* No captions. */
  }
  return { onList, canCreate: true };
}

async function EditorGroupIndex({
  page,
  isLanding,
}: {
  page: PaginationPage<GroupListEntry>;
  isLanding: boolean;
}) {
  return (
    <GroupIndexPageWrapper
      page={page}
      isLanding={isLanding}
      extras={await readExtras()}
    />
  );
}

/**
 * The editor's `/groups` and `/groups/[page]`: the shared list (the
 * export's `groupIndexRoutes`), with the signed-in extras.
 */
export const editorGroupIndexRoutes = createPaginatedIndexRoute({
  reads: groupPages,
  render: (page, { isLanding }) => (
    <EditorGroupIndex page={page} isLanding={isLanding} />
  ),
});
