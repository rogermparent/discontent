"use client";

import { PureStaticImage } from "@discontent/next-static-image/src/Pure";
import { GroupThumbnailPlaceholder } from "../GroupThumbnail/Placeholder";
import GroupList from "../List/Group";
import { recipeCardImageClassName } from "../List/shared";
import { useSearch } from "./SearchContext";

/**
 * The groups a search matched, as a strip above the recipe grid (22f).
 *
 * Above the recipes rather than mixed into them: a group is a different kind of
 * answer — one card stands for a dozen recipes — and interleaving the two would
 * make the result count under the field a lie. `SearchTicker` goes on counting
 * recipes only, for the same reason.
 *
 * Matching is on the query's **free text**, never its filters (see
 * `matchedGroups`), so `tag:dessert` shows no groups at all and a plain
 * `weeknight` shows the collection even when it matches no recipe.
 */
export function GroupResults() {
  const { matchedGroups, parsedQuery, query, recordSearch } = useSearch();

  if (matchedGroups.length === 0) return null;

  return (
    <section
      className="my-4 flex flex-col gap-2"
      aria-label="Matching groups"
      data-testid="group-results"
    >
      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
        Groups
      </span>
      <GroupList
        groups={matchedGroups.map((group) => ({
          slug: group.slug,
          date: group.date,
          name: group.name,
          kind: group.kind,
          // The *deduped* membership count, where `/groups` prints the raw
          // item count. They differ only for a plan that lists one recipe
          // twice, and this is the number the `group:` filter would return.
          itemCount: group.recipes.length,
          image: group.image,
        }))}
        /*
         * A picture on a client-rendered card (22h). Two facts make it work,
         * and both are worth stating because neither is local:
         *
         * The URL resolves because the *server* has already produced this
         * variant — `PureStaticImage` only rebuilds the `/image/<src>/…-w400q75
         * .webp` path that `GroupImage` writes when a server-rendered card at
         * `standardRecipeImageProps` renders the same group. That is exactly
         * the assumption the recipe search cards have always made
         * (`SearchList`), at the same 400×600.
         *
         * And there is no member fallback here: picking a member's photo means
         * walking `items[].recipe` through the cached item reads, which is
         * server-only. The corpus carries the group's own image (D14) and
         * nothing else, so a group without one shows the placeholder where a
         * server-rendered card would borrow. Deferred: a precomputed
         * `thumbnail` on the corpus.
         */
        renderThumbnail={(group) =>
          group.image ? (
            <PureStaticImage
              uploadsDirectory="uploads/group"
              slug={group.slug}
              image={group.image}
              alt={group.name}
              width={400}
              height={600}
              className={recipeCardImageClassName}
            />
          ) : (
            <GroupThumbnailPlaceholder />
          )
        }
        // The free text, never the raw query — the same rule the recipe cards
        // follow, so `group:x` cannot go on to <mark> the word "x".
        highlightQuery={parsedQuery.text}
        // Opening a result is a commit, exactly as it is for a recipe card.
        onSelect={() => recordSearch(query)}
      />
    </section>
  );
}

export default GroupResults;
