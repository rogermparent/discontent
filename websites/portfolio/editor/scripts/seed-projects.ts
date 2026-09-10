/*
 * Seed demo projects and build their LMDB index.
 *
 * Used to generate the Playwright fixture content and the starter content a
 * fork sees. Writing the JSON is not enough on its own: the homepage *is* the
 * index, so it reads from LMDB — content without a rebuilt index renders an
 * empty site, which looks exactly like a broken homepage.
 *
 *   pnpm tsx scripts/seed-projects.ts <target-content-dir>
 */
import { copy, outputJSON } from "fs-extra";
import { resolve } from "node:path";
import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { getUploadsDirectory } from "@discontent/cms/content/filesystem";
import { projectContentConfig } from "@discontent/projects-collection/controller/projectContentConfig";
import type { Project } from "@discontent/projects-collection/controller/types";

/**
 * The one seeded cover image.
 *
 * Exactly one, on purpose: with every project imageless the fixtures could only
 * ever exercise the placeholder branch, and with all of them covered they could
 * only exercise the image branch. One of each is what makes both real in the
 * Studio grid, the index plate and the case study at the same time.
 *
 * The file is a flat generated plate rather than a photograph — a JPEG would
 * make every visual baseline hostage to an encoder version.
 */
const SEEDED_COVER = {
  slug: "content-engine",
  filename: "project-cover.png",
  // `__dirname`, not `import.meta.dirname`: tsx transpiles this to CJS, where
  // the latter is undefined — and it fails as a bare "paths[0] must be a
  // string" from node:path, naming nothing that would point you here.
  source: resolve(__dirname, "fixtures", "project-cover.png"),
};

/** Fixed epochs: a date derived from "now" would expire every visual baseline. */
const YEAR = (y: number, m = 5, d = 15) => Date.UTC(y, m, d);

const PROJECTS: Array<{ slug: string; data: Project }> = [
  {
    slug: "content-engine",
    data: {
      name: "Content Engine",
      date: YEAR(2026, 0, 12),
      summary:
        "A git-backed CMS that treats content as files, not rows — so a site outlives the tool that built it.",
      role: "Design & build",
      status: "shipped",
      featured: true,
      image: "project-cover.png",
      tags: ["cms", "next.js", "typescript", "lmdb"],
      links: [
        {
          label: "Source",
          url: "https://github.com/rogermparent/content-engine",
        },
      ],
      content: [
        "## The problem with a database-backed CMS",
        "",
        "Every CMS eventually becomes the thing you have to migrate off. The content",
        "is in its schema, the schema is in its database, and the database is in its",
        "hosting. Content Engine inverts that: content is plain JSON and markdown in",
        "a git repository, and the CMS is a *view* of it.",
        "",
        "## How it works",
        "",
        "An editor app writes files and commits them. An export app reads the same",
        "tree and produces a fully static site. An LMDB index sits beside the data as",
        "derived state — rebuildable, never authoritative — so listing and pagination",
        "stay fast without the files stopping being the source of truth.",
      ].join("\n"),
    },
  },
  {
    slug: "recipe-website",
    data: {
      name: "Recipe Website",
      date: YEAR(2025, 8, 3),
      summary:
        "A cooking site whose two real features — scaling ingredients and timing a cook — are the interface, not a footnote.",
      role: "Design & build",
      status: "shipped",
      featured: true,
      tags: ["design system", "search", "accessibility"],
      content: [
        "Most recipe sites are a wall of prose with the quantities buried in it. This",
        "one makes the two things a cook actually does — scale the batch, and work out",
        "when to start — first-class.",
        "",
        "## Scaling",
        "",
        "Quantities are marked up, not parsed out of the text, so doubling a recipe",
        "rewrites every number in place, including the ones inside instructions.",
        "",
        "## Timelines",
        "",
        "A recipe declares its steps' durations and dependencies; the site renders a",
        'schedule from them, so "start the dough at 4pm" is computed rather than',
        "written down and left to rot.",
      ].join("\n"),
    },
  },
  {
    slug: "resume-builder",
    data: {
      name: "Résumé Builder",
      date: YEAR(2024, 2, 20),
      summary:
        "Structured résumé data in, a typeset PDF and a web page out — one source, no reformatting.",
      role: "Design & build",
      status: "shipped",
      tags: ["typography", "print", "next.js"],
      content: [
        "A résumé is structured data pretending to be a document. Editing it as a",
        "document means every change is a formatting change.",
        "",
        "This keeps the data structured and renders it twice: a print stylesheet tuned",
        "for a single page, and a web version that stays readable at any width.",
      ].join("\n"),
    },
  },
  {
    slug: "discontent-design-system",
    data: {
      name: "Discontent Design System",
      date: YEAR(2025, 11, 1),
      summary:
        "A token layer whose contrast curve makes every accent choice WCAG AA by construction.",
      role: "Design",
      status: "wip",
      tags: ["design system", "color", "accessibility", "oklch"],
      content: [
        "The usual failure of a themeable design system is that theming it breaks its",
        "contrast. If a user can pick any colour, a user can pick an unreadable one.",
        "",
        "## The curve",
        "",
        "Here the accent's lightness and chroma are fixed and only the *hue* moves. In",
        "OKLCH that keeps a constant perceptual lightness, so every hue on the curve",
        "holds roughly the same contrast against its foreground. Theming becomes a",
        "one-dimensional choice that cannot produce a failing pair.",
        "",
        "The accessibility sweep that checks this should pass by construction — a",
        "failure means someone hand-authored a token instead of deriving it.",
      ].join("\n"),
    },
  },
  {
    slug: "pi-static-host",
    data: {
      name: "Raspberry Pi Static Host",
      date: YEAR(2023, 6, 8),
      summary:
        "Self-hosted static publishing on a 4GB Pi, including the build that kept running out of memory.",
      role: "Build & operations",
      status: "archived",
      tags: ["self-hosting", "ci", "linux"],
      content: [
        "Running the editor and the export build on a Raspberry Pi is a useful forcing",
        "function: it makes every accidental cost visible immediately.",
        "",
        "The interesting failure was the build OOMing on 4GB — not from the site's",
        "size, but from a bundler holding the whole module graph. Constraining the",
        "build fixed it, and the constraint turned out to be worth keeping.",
      ].join("\n"),
    },
  },
];

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: seed-projects.ts <target-content-dir>");
    process.exit(1);
  }
  const contentDirectory = resolve(target);

  for (const { slug, data } of PROJECTS) {
    const file = resolve(
      contentDirectory,
      projectContentConfig.dataDirectory,
      slug,
      projectContentConfig.dataFilename,
    );
    await outputJSON(file, data, { spaces: 2 });
  }

  // The cover, into the same tree the write path uploads to — via the CMS's own
  // `getUploadsDirectory` rather than a path spelled out here, so a seeded image
  // cannot end up somewhere the app does not look for it.
  await copy(
    SEEDED_COVER.source,
    resolve(
      getUploadsDirectory(
        projectContentConfig,
        SEEDED_COVER.slug,
        contentDirectory,
      ),
      SEEDED_COVER.filename,
    ),
  );

  // Without this the site is empty: the index is what the homepage reads.
  await rebuildIndex({ config: projectContentConfig, contentDirectory });

  console.log(`Seeded ${PROJECTS.length} projects into ${contentDirectory}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
