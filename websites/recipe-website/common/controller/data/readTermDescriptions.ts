import { flattenMarkdown } from "../buildIndexValue";
import { tagTermReads } from "./readTagTerms";

/**
 * How much of a description the search term card shows (43s): two or three
 * lines at its width. The card links to the term's page for the rest.
 */
export const TERM_DESCRIPTION_CAP = 240;

/**
 * `/search/term-descriptions` (43s): each recorded term's description as one
 * line of plain text, capped — what `/search`'s term card says under the
 * term's name when a `tag:` query opens on it.
 *
 * Its own document, fetched only when a card first shows, because
 * `/search/terms` is on every page's load path and descriptions are most of
 * a vocabulary's bytes. One cached item read per record (`item:tag-terms:
 * <slug>`), the reads `/holidays` already makes for its children; a term
 * with no description is left out.
 */
export async function readTermDescriptions(): Promise<Record<string, string>> {
  const tree = await tagTermReads.tree.read();
  const slugs = Object.keys(tree ?? {});
  const records = await Promise.all(
    slugs.map((slug) => tagTermReads.items.read(slug)),
  );
  const out: Record<string, string> = {};
  slugs.forEach((slug, index) => {
    const description = records[index]?.description;
    if (!description) return;
    const text = flattenMarkdown(description);
    if (!text) return;
    out[slug] =
      text.length > TERM_DESCRIPTION_CAP
        ? `${text.slice(0, TERM_DESCRIPTION_CAP - 1).trimEnd()}…`
        : text;
  });
  return out;
}
