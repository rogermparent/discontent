import { DrinksPage } from "recipe-website-common/components/DrinksPage";
import { readDrinksPage } from "recipe-website-common/controller/data/readDrinksPage";
import { secondaryInventory } from "recipe-website-common/controller/secondaryInventory";

export const metadata = { title: "Drinks" };

/**
 * The export's `/drinks` (U3): rendered at build time, with the make panel
 * judging this browser's list in the browser. `secondaryInventory()` with no
 * reader is the house snapshot — "Also makeable from the house inventory" —
 * only when the operator turned on "Share my saved inventory on the export";
 * off, the default, it answers nothing and the saved inventory never reaches
 * the static site (U6, `test/exportInventoryGuard.test.ts`,
 * `test/exportHouseInventory.test.ts`), as on `/make`.
 */
export default async function Drinks() {
  const [data, secondary] = await Promise.all([
    readDrinksPage(),
    secondaryInventory(),
  ]);
  return <DrinksPage data={data} secondary={secondary} />;
}
