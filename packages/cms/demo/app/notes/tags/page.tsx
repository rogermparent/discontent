import Link from "next/link";
import { noteTagReads } from "@/lib/noteAggregateReads";

/*
 * A static segment, so it wins over the sibling `[slug]` route and
 * `/notes/tags` never resolves to a note. Same reason `browse` declares it.
 */
export const dynamic = "force-dynamic";

/**
 * The tag cloud: one cached read of one folded value.
 *
 * The surface the aggregate payoff is measured against. Because it hangs off
 * the aggregate's own tag and nothing else, a write that leaves the tag set
 * alone leaves this page's cache entry alone — even though that write changed
 * the corpus the value is folded from, and even though it dirtied a note page.
 *
 * Since F33 the value is the taxonomy's `terms` aggregate, so each row is a
 * `{slug, label, count}` rather than a bare string. The rendered `<li>` still
 * holds **only the label**: the spec reads `allInnerTexts()` and compares to
 * bare labels, and more importantly the payoff assertion compares the page's
 * HTML byte for byte across a write, so a count would make it move whenever a
 * note was added to an existing tag. The count belongs on a page that wants to
 * assert it.
 */
export default async function NoteTagsPage() {
  const tags = (await noteTagReads.terms.read()) ?? [];

  /*
   * A plain `div`, not a `main` — the root layout already renders one, and a
   * second would make `getByRole("main")` ambiguous in the specs.
   */
  return (
    <div data-testid="tag-page">
      <h1>Note tags</h1>
      <p>
        <Link href="/notes/browse">Back to notes</Link>
      </p>
      {tags.length === 0 ? (
        <p data-testid="no-tags">No tags yet.</p>
      ) : (
        <ul data-testid="tag-cloud">
          {tags.map((tag) => (
            <li key={tag.slug} data-testid="tag">
              {tag.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
