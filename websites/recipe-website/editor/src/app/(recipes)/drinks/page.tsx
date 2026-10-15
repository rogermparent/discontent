import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { auth } from "@/auth";
import { DrinksPage } from "recipe-website-common/components/DrinksPage";
import { readDrinksPage } from "recipe-website-common/controller/data/readDrinksPage";
import { secondaryInventory } from "recipe-website-common/controller/secondaryInventory";
import { readInventory } from "recipe-editor/controller/curation/inventory";

export const metadata = { title: "Drinks" };

/**
 * The editor's `/drinks` (U3). The make panel judges this browser's list,
 * as the export's does (U6); a signed-in session also gets the secondary
 * group over the operator's saved inventory. A guest gets exactly the
 * export's page — no saved list read, nothing about it in the payload.
 */
export default async function Drinks() {
  const session = await auth();
  const [data, secondary] = await Promise.all([
    readDrinksPage(),
    secondaryInventory(
      session?.user?.email
        ? () =>
            readInventory({ contentDirectory: getContentDirectory() }).then(
              (inventory) => inventory.items,
            )
        : undefined,
    ),
  ]);
  return <DrinksPage data={data} secondary={secondary} />;
}
