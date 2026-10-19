import type { ReactNode } from "react";
import Markdown from "@discontent/component-library/components/Markdown";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import type { Group } from "../../controller/types";
import type { ResolvedGroupItem } from "../../controller/data/resolveGroupItems";
import { readPlanPage } from "../../controller/data/readPlanPage";
import { GroupImage } from "../GroupImage";
import { RecipeImage } from "../RecipeImage";
import {
  RecipeCardPlaceholder,
  standardRecipeImageProps,
} from "../List/shared";
import type { SecondList } from "../MakePage/InventoryPanel";
import { GroupAppearsIn } from "./GroupAppearsIn";
import { PlanPage } from "./PlanPage";
import type { PlanEditor } from "./types";

/*
 * Re-exported, not redeclared: `resolveGroupItems` is what produces these, and
 * it moved to the controller in 22g so the featured-recipe routes could share
 * it. Every existing importer goes on naming it here.
 */
export type { ResolvedGroupItem } from "../../controller/data/resolveGroupItems";

export interface GroupDetailPageProps {
  group: Group;
  /** The group's own slug: links, the shelf's `group:` scope, the ticks' key. */
  slug: string;
  /**
   * Resolved in the *route*, not here: the editor and the export read recipes
   * through the same cached item read, and the order has to be the group's.
   */
  items: ResolvedGroupItem[];
  /**
   * The signed-in editor's writes (43p1): Save, Add, the More menu and the
   * shopping list. Absent on the export and for a guest — the page is then
   * read-only.
   */
  editor?: PlanEditor;
  /** From your shelf's second list (the saved one, or the export's house list). */
  second?: SecondList;
}

/**
 * One meal plan: what it is, what is in it, in order — Plan and Cook (43p1).
 *
 * A server component in both apps: it reads what the page needs
 * (`readPlanPage`: each recipe's clock from its steps, the sub-plans'
 * recipes, the holiday), renders the pictures and the description here —
 * so the export's images are generated at build time like every other card's
 * — and hands plain data to the client page. A dangling item keeps its slot
 * ("Recipe not found: x"): nothing rewrites a group when a recipe is deleted
 * (D3), and hiding it would make a meal plan silently lose a day.
 */
export default async function GroupDetailPage({
  group,
  slug,
  items,
  editor,
  second,
}: GroupDetailPageProps) {
  const data = await readPlanPage(group, slug, items);
  const images: Record<string, ReactNode> = {};
  const picture = (recipeSlug: string, name: string, image?: string) => {
    if (images[recipeSlug] !== undefined) return;
    images[recipeSlug] = image ? (
      <RecipeImage
        slug={recipeSlug}
        image={image}
        alt=""
        {...standardRecipeImageProps}
        className="h-full w-full object-cover"
        fallback={<RecipeCardPlaceholder name={name} />}
      />
    ) : (
      <RecipeCardPlaceholder name={name} />
    );
  };
  for (const row of data.rows) {
    if (row.recipe) picture(row.recipe.slug, row.recipe.name, row.recipe.image);
    for (const thumb of row.group?.thumbs ?? []) {
      const name =
        row.group?.recipes.find((recipe) => recipe.slug === thumb.slug)?.name ??
        thumb.slug;
      picture(thumb.slug, name, thumb.image);
    }
  }

  return (
    <PageMain>
      <PageSection
        maxWidth="none"
        className="mx-auto w-full max-w-6xl py-0"
        grow
      >
        <PlanPage
          data={data}
          images={images}
          editor={editor}
          second={second}
          description={
            group.description ? (
              <Markdown>{group.description}</Markdown>
            ) : undefined
          }
          media={
            group.image ? (
              <div
                data-testid="group-image"
                className="relative aspect-[4/3] w-full max-w-sm overflow-hidden rounded-md"
              >
                <GroupImage
                  slug={slug}
                  image={group.image}
                  alt={`Photo of ${group.name}`}
                  width={580}
                  height={450}
                  sizes="(max-width: 640px) 100vw, 24rem"
                  loading="eager"
                  className="absolute inset-0 h-full w-full rounded-md object-cover"
                />
              </div>
            ) : undefined
          }
          appearsIn={<GroupAppearsIn slug={slug} />}
        />
      </PageSection>
    </PageMain>
  );
}
