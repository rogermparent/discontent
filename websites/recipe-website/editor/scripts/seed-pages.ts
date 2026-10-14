/*
 * Seed standalone pages and build their LMDB index.
 *
 * Used to regenerate the Playwright page fixtures. Writing the JSON is not
 * enough on its own — the pages list reads from LMDB now, not from a tree walk,
 * so a fixture without a rebuilt index looks exactly like an empty site.
 *
 *   pnpm tsx scripts/seed-pages.ts <target-content-dir>
 *   pnpm tsx scripts/seed-pages.ts <target-content-dir> --many 21
 *
 * `--many N` seeds N numbered pages instead ("Page 01"…, a day apart, newest
 * last) — the `many-pages` fixture, one past the editor list's 20 to a page
 * (F6c, epic 35q).
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

const DAY = 24 * 60 * 60 * 1000;

function numberedPages(count: number): Array<{ slug: string; data: Page }> {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return {
      slug: `page-${n}`,
      data: {
        name: `Page ${n}`,
        date: 1713580090456 + i * DAY,
        content: `Numbered page ${n}.`,
      },
    };
  });
}

async function main() {
  const [target, flag, count] = process.argv.slice(2);
  const many = flag === "--many" ? Number(count) : null;
  if (!target || (flag !== undefined && !(many && many > 0))) {
    console.error("usage: seed-pages.ts <target-content-dir> [--many N]");
    process.exit(1);
  }
  const contentDirectory = resolve(target);
  const pages = many ? numberedPages(many) : PAGES;

  for (const { slug, data } of pages) {
    const file = resolve(
      contentDirectory,
      pageContentConfig.dataDirectory,
      slug,
      pageContentConfig.dataFilename,
    );
    await outputJSON(file, data, { spaces: 2 });
  }

  await rebuildIndex({ config: pageContentConfig, contentDirectory });

  console.log(`Seeded ${pages.length} pages into ${contentDirectory}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
