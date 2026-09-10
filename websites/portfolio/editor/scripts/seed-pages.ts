/*
 * Seed standalone pages and build their LMDB index.
 *
 * Used to regenerate the Playwright page fixtures. Writing the JSON is not
 * enough on its own — the pages list reads from LMDB now, not from a tree walk,
 * so a fixture without a rebuilt index looks exactly like an empty site.
 *
 *   pnpm tsx scripts/seed-pages.ts <target-content-dir>
 *
 * Modelled on portfolio's scripts/seed-projects.ts.
 */
import { outputJSON } from "fs-extra";
import { resolve } from "node:path";
import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { pageContentConfig } from "@discontent/pages-collection/controller/pageContentConfig";
import type { Page } from "@discontent/pages-collection/controller/types";

/** Fixed epoch: a date derived from "now" would expire every visual baseline. */
const PAGES: Array<{ slug: string; data: Page }> = [
  {
    slug: "about",
    data: { name: "About", date: 1713580090456, content: "About Us" },
  },
];

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: seed-pages.ts <target-content-dir>");
    process.exit(1);
  }
  const contentDirectory = resolve(target);

  for (const { slug, data } of PAGES) {
    const file = resolve(
      contentDirectory,
      pageContentConfig.dataDirectory,
      slug,
      pageContentConfig.dataFilename,
    );
    await outputJSON(file, data, { spaces: 2 });
  }

  await rebuildIndex({ config: pageContentConfig, contentDirectory });

  console.log(`Seeded ${PAGES.length} pages into ${contentDirectory}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
