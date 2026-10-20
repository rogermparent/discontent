"use client";

import { MassagedRecipeEntry } from "../../controller/data/read";
import type { FacetModel } from "../../util/facets";
import { PureRecipeImage } from "../RecipeImage/PureRecipeImage";
import { highlightText } from "../SearchList";
import {
  RecipeCard,
  RecipeCardLink,
  RecipeCardName,
  RecipeCardPlaceholder,
  recipeCardImageClassName,
} from "../List/shared";
import { recipeMeta, whyMatch } from "./searchView";

/**
 * The search highlight from the theme's tokens (43s, canvas B) rather than
 * the browser's yellow `<mark>`: a tint of the accent with an underline in
 * it, the text keeping its own colour. A class for the page (and the
 * palette) to carry, so no other page's marks move.
 */
export const SEARCH_MARKS =
  "[&_mark]:rounded-[2px] [&_mark]:bg-primary/15 [&_mark]:px-px [&_mark]:text-inherit [&_mark]:shadow-[inset_0_-2px_0_var(--primary)]";

/**
 * One result on `/search` (43s): a 4:5 picture, the name with the free text
 * marked, a mono meta line (what it is · how long), and the "why" line —
 * the ingredient the words matched, its amount in mono, or the description
 * when that is where they matched.
 */
export function SearchCard({
  recipe,
  model,
  highlightQuery,
  words,
  onOpen,
}: {
  recipe: MassagedRecipeEntry;
  model: FacetModel;
  /** The query's free text — never its filters (`highlightText`). */
  highlightQuery: string;
  /** The same, folded into words (`queryWords`). */
  words: readonly string[];
  onOpen?: () => void;
}) {
  const { slug, name, image } = recipe;
  const meta = recipeMeta(model, recipe);
  const why = whyMatch(recipe, words);
  return (
    <RecipeCard>
      <RecipeCardLink href={`/recipe/${slug}`} onClick={onOpen}>
        <div className="aspect-[4/5] w-full overflow-hidden bg-muted">
          {image ? (
            <PureRecipeImage
              slug={slug}
              image={image}
              alt=""
              width={400}
              height={500}
              className={recipeCardImageClassName}
              fallback={<RecipeCardPlaceholder name={name} />}
            />
          ) : (
            <RecipeCardPlaceholder name={name} />
          )}
        </div>
        <RecipeCardName className="mb-0 mt-1.5">
          {highlightText(name, highlightQuery) || name}
        </RecipeCardName>
        {meta.length > 0 && (
          <p
            data-testid="card-meta"
            className="mx-2 mt-0.5 font-mono text-xs tabular-nums text-muted-foreground"
          >
            {meta.join(" · ")}
          </p>
        )}
        {why?.kind === "ingredient" && (
          <p
            data-testid="card-why"
            className="mx-2 mt-1.5 flex items-baseline gap-1.5 text-xs"
          >
            {why.amount && (
              <b className="shrink-0 font-mono text-[0.7rem] font-medium tabular-nums text-primary">
                {why.amount}
              </b>
            )}{" "}
            <span className="min-w-0 line-clamp-2">
              {highlightText(why.rest, highlightQuery) || why.rest}
            </span>
          </p>
        )}
        {why?.kind === "description" && (
          <p
            data-testid="card-why"
            className="mx-2 mt-1.5 line-clamp-2 text-xs text-muted-foreground"
          >
            {highlightText(why.text, highlightQuery) || why.text}
          </p>
        )}
        <span aria-hidden className="block pb-2.5" />
      </RecipeCardLink>
    </RecipeCard>
  );
}
