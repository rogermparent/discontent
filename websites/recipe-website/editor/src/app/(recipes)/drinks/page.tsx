import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { auth } from "@/auth";
import { DrinksPage } from "recipe-website-common/components/DrinksPage";
import { readDrinksPage } from "recipe-website-common/controller/data/readDrinksPage";
import { secondaryInventory } from "recipe-website-common/controller/secondaryInventory";
import { readInventory } from "recipe-editor/controller/curation/inventory";

export const metadata = { title: "Drinks" };

/**
 * The editor's `/drinks` (U3; 42d). The shelf counts this browser's list,
 * as the export's does (U6), unless Count from — the same per-browser
 * setting as `/make` (41h) — chooses the page's second list: for a
 * signed-in session the operator's saved inventory. A guest gets exactly
 * the export's page — no saved list read; the house list only when this
 * process was built with one, which by default it is not (as on `/make`).
 */
export default async function Drinks() {
  const session = await auth();
  const signedIn = !!session?.user?.email;
  const [data, secondary] = await Promise.all([
    readDrinksPage(),
    secondaryInventory(
      signedIn
        ? () =>
            readInventory({ contentDirectory: getContentDirectory() }).then(
              (inventory) => inventory.items,
            )
        : undefined,
    ),
  ]);
  return (
    <DrinksPage
      data={data}
      second={
        secondary && {
          kind: signedIn ? "saved" : "house",
          items: secondary.items,
        }
      }
    />
  );
}
