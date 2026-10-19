import Link from "next/link";
import { Button } from "@discontent/component-library/components/ui/button";
import type { DrinksPageData } from "../../controller/drinksPage";
import { EmptyState } from "../EmptyState";
import type { SecondList } from "../MakePage/InventoryPanel";
import { PageMain, PageSection } from "../PageLayout";
import { BarIndex } from "./BarIndex";
import { DrinksShelf } from "./MakePanel";
import { SeasonPair } from "./Seasonal";

/**
 * `/drinks`, shared by both apps — canvas B, "Pour from your shelf" (42d):
 *
 * 1. the question "What drinks can I make?" over your shelf as tape labels,
 *    with Pour now and Buy next beside it (`DrinksShelf`);
 * 2. "In season": the current and next holiday side by side, each to its
 *    menu page (`SeasonPair`, 42e's `/holidays/<slug>`);
 * 3. "Browse the bar": spirit & base, style and the classics as one
 *    dot-leader index (`BarIndex`).
 *
 * The shelf and the holidays are judged in the browser (the browser's list
 * and today's date), so the export's static HTML holds neither. `second` is
 * the page's second list, as on `/make`: the signed-in editor's saved list,
 * or — on the export and for an editor guest — the house list when "Share my
 * saved inventory on the export" is on (`secondaryInventory()`); nothing by
 * default.
 */
export function DrinksPage({
  data,
  second,
}: {
  data: DrinksPageData;
  second?: SecondList;
}) {
  return (
    <PageMain>
      <PageSection
        grow
        maxWidth="none"
        className="mx-auto flex max-w-6xl flex-col gap-14 pb-12"
      >
        {data.count === 0 ? (
          <>
            <h1 className="m-0 font-display text-3xl font-bold tracking-tight">
              Drinks
            </h1>
            <EmptyState
              title="No drinks yet"
              message="Recipes tagged drink show up here."
              action={
                <Button asChild>
                  <Link href="/recipes">Browse all recipes</Link>
                </Button>
              }
            />
          </>
        ) : (
          <>
            <DrinksShelf
              count={data.count}
              second={second}
              familyOf={data.familyOf}
              meta={data.meta}
            />
            <SeasonPair holidays={data.seasonal} />
            <BarIndex
              data={{
                count: data.count,
                spirits: data.spirits,
                styles: data.styles,
                classics: data.classics,
                classicsCount: data.classicsCount,
              }}
            />
          </>
        )}
      </PageSection>
    </PageMain>
  );
}

export default DrinksPage;
