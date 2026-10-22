"use client";

import Link from "next/link";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { ClientListItem } from "recipe-website-common/components/ClientList";
import { RecipeGrid } from "recipe-website-common/components/List/shared";
import type { ChangedPlace } from "recipe-editor/controller/agent/changes";
import type {
  CuratorChangedRecipe,
  CuratorRunChanges,
} from "recipe-editor/controller/agent/curator";

const CHANGE_HEADINGS = {
  created: "Created",
  imported: "Imported",
  updated: "Updated",
} as const;

const PLACES: Record<ChangedPlace, { label: string; href: string }> = {
  featured: { label: "The homepage strip", href: "/" },
  inventory: { label: "What's on hand", href: "/make" },
  shopping: { label: "The shopping list", href: "/shopping" },
};

/** Cards shown per kind of change before the rest are listed as links. */
const CARDS_SHOWN = 12;

function RecipeCards({ recipes }: { recipes: CuratorChangedRecipe[] }) {
  const shown = recipes.filter((recipe) => !recipe.missing);
  const cards = shown.slice(0, CARDS_SHOWN);
  const rest = shown.slice(CARDS_SHOWN);
  const missing = recipes.filter((recipe) => recipe.missing);
  return (
    <>
      {cards.length > 0 && (
        <RecipeGrid className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((recipe) => (
            <li key={recipe.slug} data-testid="curator-changed-recipe">
              <ClientListItem
                recipe={{
                  slug: recipe.slug,
                  name: recipe.name,
                  date: recipe.date ?? 0,
                  ...(recipe.image ? { image: recipe.image } : {}),
                  ...(recipe.tags ? { tags: recipe.tags } : {}),
                }}
              />
            </li>
          ))}
        </RecipeGrid>
      )}
      {rest.length > 0 && (
        <p className="mt-2 text-sm">
          And{" "}
          {rest.map((recipe, index) => (
            <span key={recipe.slug}>
              {index > 0 ? ", " : ""}
              <Link
                href={`/recipe/${recipe.slug}`}
                className="underline underline-offset-2"
              >
                {recipe.name}
              </Link>
            </span>
          ))}
          .
        </p>
      )}
      {missing.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          No longer here: {missing.map((recipe) => recipe.slug).join(", ")}
        </p>
      )}
    </>
  );
}

/**
 * What a run changed (44d), from its tool results (`/api/agent/<id>/
 * changes`): the recipes it created, imported or updated as the site's
 * cards, the terms and plans it touched as chips, the other places it
 * wrote, and its commits — a link to the Git page, where any of it can be
 * reverted.
 */
export function ChangesCard({ changes }: { changes: CuratorRunChanges }) {
  const kinds = (["created", "imported", "updated"] as const)
    .map((change) => ({
      change,
      recipes: changes.recipes.filter((recipe) => recipe.change === change),
    }))
    .filter((kind) => kind.recipes.length > 0);
  const chips = [
    ...changes.terms.map((term) => ({
      key: `term:${term.slug}`,
      label: term.slug,
      href: `/tags/${term.slug}`,
      kind: "Tag",
    })),
    ...changes.groups.map((group) => ({
      key: `group:${group.slug}`,
      label: group.slug,
      href: `/group/${group.slug}`,
      kind: "Plan",
    })),
    ...changes.places.map((place) => ({
      key: `place:${place}`,
      label: PLACES[place].label,
      href: PLACES[place].href,
      kind: undefined,
    })),
  ];
  return (
    <section
      aria-labelledby="curator-changes-heading"
      data-testid="curator-changes"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2
        id="curator-changes-heading"
        className="font-display text-lg font-bold"
      >
        What changed
      </h2>
      <div className="mt-3 flex flex-col gap-4">
        {kinds.map(({ change, recipes }) => (
          <div key={change}>
            <h3 className="mb-2 text-sm font-semibold">
              {CHANGE_HEADINGS[change]} · {recipes.length}{" "}
              {recipes.length === 1 ? "recipe" : "recipes"}
            </h3>
            <RecipeCards recipes={recipes} />
          </div>
        ))}
        {chips.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Also touched</h3>
            <ul className="flex flex-wrap gap-1.5" aria-label="Also touched">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <Badge
                    asChild
                    variant="secondary"
                    className="min-h-6 max-w-full"
                  >
                    <Link href={chip.href}>
                      {chip.kind ? `${chip.kind}: ${chip.label}` : chip.label}
                    </Link>
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
        {changes.commits > 0 && (
          <p className="text-sm">
            <Link
              href="/git"
              className="underline underline-offset-2"
              data-testid="curator-commits"
            >
              {changes.commits} {changes.commits === 1 ? "commit" : "commits"} —
              see Git
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
