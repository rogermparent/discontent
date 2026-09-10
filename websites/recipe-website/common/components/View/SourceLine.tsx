import { RecipeSource } from "../../controller/types";
import { hostnameLabel } from "../../util/hostnameLabel";

/**
 * The citation under a recipe's description (D6/22a).
 *
 * This is what replaced the `*Imported from [url](url)*` line the importer
 * used to paste onto the front of every imported description (D7): the same
 * fact, rendered from a field instead of from prose, so it survives editing
 * the description and can be styled as the aside it always was.
 *
 * `rel="nofollow noopener"` because these are arbitrary third-party pages the
 * site neither vouches for nor wants to hand a window reference to. Renders
 * nothing at all for a recipe with no source — most of the corpus.
 */
export function SourceLine({ source }: { source?: RecipeSource }) {
  if (!source?.url) {
    return null;
  }
  const label = source.name || hostnameLabel(source.url) || source.url;
  return (
    <p
      data-testid="recipe-source"
      className="my-2 text-sm text-muted-foreground"
    >
      Source:{" "}
      <a
        href={source.url}
        rel="nofollow noopener"
        target="_blank"
        className="underline underline-offset-2 hover:text-foreground"
      >
        {label}
      </a>
      {source.author ? <> &middot; {source.author}</> : null}
    </p>
  );
}
