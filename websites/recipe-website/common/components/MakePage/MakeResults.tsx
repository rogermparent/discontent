"use client";

import { useId } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import { requirementLabel } from "../../util/ingredientNames";
import type {
  BuyNext,
  MakeableAnalysis,
  RecipeMatch,
} from "../../util/makeable";
import SearchList from "../SearchList";
import { RecipeCardLink } from "../List/shared";

/**
 * The line under a card: what to make first, what a close item stands in
 * for (32j: "≈ onion for shallot"), and what's missing. With close matches
 * not counted, a close line is missing too, and says what came near.
 */
function MatchNote({ match }: { match: RecipeMatch }) {
  if (
    match.via.length === 0 &&
    match.missing.length === 0 &&
    match.close.length === 0
  ) {
    return null;
  }
  const nearBy = new Map(
    match.close.map(({ requirement, item }) => [requirement, item]),
  );
  const counted = match.close.filter(
    ({ requirement }) => !match.missing.includes(requirement),
  );
  return (
    <div className="mx-2 my-1 flex flex-col gap-0.5 text-xs">
      {match.via.map(({ slug, name }) => (
        <p key={slug} data-testid="make-via" className="text-muted-foreground">
          Make {name.toLowerCase()} first
        </p>
      ))}
      {counted.map(({ requirement, item }) => (
        <p
          key={`${requirement.line}-${requirementLabel(requirement)}`}
          data-testid="make-close"
          className="text-muted-foreground"
        >
          <span aria-hidden>≈ </span>
          <span className="sr-only">Close match: </span>
          {item} for {requirementLabel(requirement)}
        </p>
      ))}
      {match.missing.length > 0 && (
        <p data-testid="make-missing" className="font-medium">
          Missing:{" "}
          {match.missing
            .map((requirement) => {
              const near = nearBy.get(requirement);
              const label = requirementLabel(requirement);
              return near ? `${label} (close: ${near})` : label;
            })
            .join(", ")}
        </p>
      )}
    </div>
  );
}

function MatchGrid({
  matches,
  recipes,
}: {
  matches: RecipeMatch[];
  recipes: Map<string, MassagedRecipeEntry>;
}) {
  const bySlug = new Map(matches.map((match) => [match.recipe.slug, match]));
  return (
    <SearchList
      recipeResults={matches
        .map((match) => recipes.get(match.recipe.slug))
        .filter((recipe): recipe is MassagedRecipeEntry => !!recipe)}
      highlightQuery=""
      renderItemWrapper={(recipe, content) => (
        <RecipeCardLink href={`/recipe/${recipe.slug}`}>
          {content}
          <MatchNote match={bySlug.get(recipe.slug)!} />
        </RecipeCardLink>
      )}
    />
  );
}

function Section({
  title,
  testId,
  matches,
  recipes,
}: {
  title: string;
  testId: string;
  matches: RecipeMatch[];
  recipes: Map<string, MassagedRecipeEntry>;
}) {
  const headingId = useId();
  if (matches.length === 0) return null;
  return (
    <section aria-labelledby={headingId} data-testid={testId} className="my-6">
      <h2 id={headingId} className="mb-2 text-xl font-bold">
        {title}{" "}
        <span className="font-mono text-sm font-normal text-muted-foreground">
          {matches.length}
        </span>
      </h2>
      <MatchGrid matches={matches} recipes={recipes} />
    </section>
  );
}

/** "Buy next": what one more item would unlock, best first. */
export function BuyNextList({
  buyNext,
  onHave,
}: {
  buyNext: BuyNext[];
  onHave: (item: string) => void;
}) {
  const headingId = useId();
  if (buyNext.length === 0) return null;
  return (
    <section
      aria-labelledby={headingId}
      data-testid="buy-next"
      className="my-4 rounded-md border p-3"
    >
      <h2 id={headingId} className="mb-2 text-sm font-semibold">
        Buy next
      </h2>
      <ol className="flex flex-col gap-1.5 text-sm">
        {buyNext.map((entry) => (
          <li
            key={entry.label}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>
              <span className="font-medium">{entry.label}</span>{" "}
              <span className="text-xs text-muted-foreground">
                {[
                  entry.unlocks > 0 &&
                    `makes ${entry.unlocks} more ${entry.unlocks === 1 ? "recipe" : "recipes"}`,
                  entry.helps > 0 && `${entry.helps} more one step closer`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`I have ${entry.item}`}
              onClick={() => onHave(entry.item)}
            >
              I have this
            </Button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The secondary group (U6): what another list — the operator's saved
 * inventory in a signed-in editor, or the house snapshot an export was
 * built with — makes now that this browser's list doesn't. Below the
 * results, folded away, and never in the ticker or Buy next.
 */
export function SecondaryMakeGroup({
  label,
  matches,
  recipes,
}: {
  label: string;
  matches: RecipeMatch[];
  recipes: Map<string, MassagedRecipeEntry>;
}) {
  return (
    <details data-testid="make-secondary" className="my-6 border-t pt-4">
      <summary className="cursor-pointer text-xl font-bold">
        {label}{" "}
        <span className="font-mono text-sm font-normal text-muted-foreground">
          {matches.length}
        </span>
      </summary>
      <div className="mt-2">
        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing more than this browser&apos;s list makes.
          </p>
        ) : (
          <MatchGrid matches={matches} recipes={recipes} />
        )}
      </div>
    </details>
  );
}

export function MakeResults({
  analysis,
  recipes,
}: {
  analysis: MakeableAnalysis;
  recipes: Map<string, MassagedRecipeEntry>;
}) {
  const { canMake, oneAway, twoAway, further } = analysis;
  return (
    <>
      <Section
        title="Can make now"
        testId="make-can"
        matches={canMake}
        recipes={recipes}
      />
      <Section
        title="One ingredient away"
        testId="make-one-away"
        matches={oneAway}
        recipes={recipes}
      />
      <Section
        title="Two away"
        testId="make-two-away"
        matches={twoAway}
        recipes={recipes}
      />
      {further.length > 0 && (
        <details data-testid="make-further" className="my-6">
          <summary className="cursor-pointer text-xl font-bold">
            Further away ({further.length})
          </summary>
          <div className="mt-2">
            <MatchGrid matches={further} recipes={recipes} />
          </div>
        </details>
      )}
    </>
  );
}
