import Link from "next/link";
import { ShoppingCartIcon } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import type { GroupListEntry } from "../../controller/groupPaginationConfig";
import { groupCountLabel } from "../../util/groupCountLabel";
import { RecipeThumb } from "./RecipeThumb";

/** How many of the plan's lines the panel lists before "N more". */
export const PLAN_LINES = 6;

/** One line of the plan as the panel shows it: a recipe, or a sub-plan. */
export interface PlanLine {
  href: string;
  name: string;
  /** For a recipe line: its slug and photo, for the thumbnail. */
  recipe?: { slug: string; image?: string };
}

/**
 * "On the plan" (42f, canvas B's right rail — the "Plans" strip at the foot
 * of the page until then): the newest plan by name, its first few lines with
 * their pictures, "Open the plan", and "All plans".
 *
 * **The shopping list is an editor's** (35, and the masthead's `ownerOnly`
 * link): the panel offers "Shopping list" only when the route says the
 * reader is signed in, and the export's route never says so. No count on
 * it: the canvas's "On the list · 66 lines" would mean reading the shopping
 * store on every homepage render, which the route has never done.
 *
 * Nothing at all when there are no plans.
 */
export function PlanPanel({
  plan,
  lines,
  showShopping = false,
}: {
  plan?: GroupListEntry;
  /** The plan's lines, in the plan's order; `undefined` if its read failed. */
  lines?: PlanLine[];
  showShopping?: boolean;
}) {
  if (!plan) return null;
  const shown = (lines ?? []).slice(0, PLAN_LINES);
  const more = (lines?.length ?? 0) - shown.length;
  return (
    <section
      aria-labelledby="home-plan"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-[1.125rem] text-card-foreground"
    >
      <div className="flex flex-row flex-wrap items-baseline justify-between gap-x-2">
        <h2
          id="home-plan"
          className="font-display text-lg font-semibold tracking-tight"
        >
          On the plan
        </h2>
        <Link
          href="/groups"
          className="inline-flex min-h-6 items-center text-sm text-primary underline-offset-4 hover:underline"
        >
          All plans
        </Link>
      </div>
      <div data-testid="plans-strip-latest">
        <p className="text-[0.9375rem] leading-5 font-semibold">{plan.name}</p>
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          {groupCountLabel(
            plan.itemCount - (plan.groupCount ?? 0),
            plan.groupCount ?? 0,
          )}
        </p>
      </div>
      {shown.length > 0 && (
        <ol className="flex flex-col" data-testid="plan-lines">
          {shown.map((line, index) => (
            <li
              key={`${index}-${line.href}`}
              className="grid grid-cols-[1.25rem_2.5rem_minmax(0,1fr)] items-center gap-2.5 py-1.5 text-sm leading-5"
            >
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="size-10 overflow-hidden rounded-sm bg-muted">
                {line.recipe ? (
                  <RecipeThumb
                    slug={line.recipe.slug}
                    image={line.recipe.image}
                    name={line.name}
                  />
                ) : null}
              </div>
              <Link
                href={line.href}
                className="inline-flex min-h-6 items-center underline-offset-4 hover:underline"
              >
                {line.name}
              </Link>
            </li>
          ))}
        </ol>
      )}
      {more > 0 && (
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          and {more} more
        </p>
      )}
      <div className="flex flex-row flex-wrap gap-2">
        {showShopping && (
          <Button asChild variant="outline">
            <Link href="/shopping">
              <ShoppingCartIcon aria-hidden />
              Shopping list
            </Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href={`/group/${plan.slug}`}>Open the plan</Link>
        </Button>
      </div>
    </section>
  );
}

export default PlanPanel;
