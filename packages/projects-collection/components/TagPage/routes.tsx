import { notFound } from "next/navigation";
import { projectTagReads } from "../../controller/data/readTagIndex";
import { ProjectTagIndexPage, ProjectTagPage } from "./shared";

/**
 * The `/tags` and `/tags/[tag]` route handlers, defined once and re-exported by
 * the editor's and the export's route files.
 *
 * One carrier, so no union (the recipe site's equivalent merges recipes and
 * groups). Both reads are O(1) lookups of values folded at write time.
 */

/** `/tags` — every term with its project count, sorted by slug. */
export async function tagIndexRoute() {
  const terms = (await projectTagReads.terms.read()) ?? [];
  return <ProjectTagIndexPage tags={terms} />;
}

/** `/tags/[tag]` — one term's projects. */
export async function tagRoute({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  /*
   * One term's row, cached under that term's own tag (32e: the by-term
   * aggregate is keyed), so retagging one project expires only its terms'
   * pages.
   */
  const entry = await projectTagReads.byTerm.readKey(tag);
  /*
   * An unknown slug is a 404, not an empty page. The folded value only holds
   * slugs a project actually carries, so a missing key means the URL is wrong
   * rather than the term being empty.
   */
  if (!entry) notFound();
  return <ProjectTagPage label={entry.label} projects={entry.items} />;
}

/**
 * Every tag page the export should emit.
 *
 * Never empty (T10). `output: "export"` rejects a dynamic route whose params
 * come back empty, and a portfolio with no tags at all is the state a fork
 * starts in. One placeholder is emitted instead and `tagRoute` answers it with
 * `notFound()`, exactly as it would at runtime.
 */
export async function generateTagStaticParams(): Promise<{ tag: string }[]> {
  /* The term cloud's slugs are the by-term keys (one walk folds both). */
  const slugs = ((await projectTagReads.terms.read()) ?? []).map(
    (term) => term.slug,
  );
  if (slugs.length === 0) return [{ tag: "_" }];
  return slugs.map((tag) => ({ tag }));
}
