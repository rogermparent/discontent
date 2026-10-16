import Link from "next/link";
import type { GroupListEntry } from "../../controller/groupPaginationConfig";
import { groupCountLabel } from "../../util/groupCountLabel";

/**
 * The newest plan, as a compact strip at the foot of the homepage (direction
 * A, usability pass 2026-10-15). It replaced a six-card Groups grid: the
 * groups are a way back into something already planned, so one line and a
 * button carry it, and "All plans" is the rest. "Plan" is what the site calls
 * a group from this pass on; the URLs stay `/group/<slug>` and `/groups`.
 *
 * Nothing at all when there are no groups.
 */
export function PlansStrip({ plan }: { plan?: GroupListEntry }) {
  if (!plan) return null;
  return (
    <section
      aria-labelledby="home-plans"
      className="flex flex-row flex-wrap items-center gap-x-6 gap-y-4 rounded-xl bg-secondary p-5 text-secondary-foreground"
    >
      <div className="flex min-w-0 flex-[1_1_20rem] flex-col gap-1">
        <h2
          id="home-plans"
          className="font-display text-xl font-semibold tracking-tight"
        >
          Plans
        </h2>
        <p className="text-sm" data-testid="plans-strip-latest">
          {plan.name}
          <span className="font-mono text-xs tabular-nums">
            {" · "}
            {groupCountLabel(
              plan.itemCount - (plan.groupCount ?? 0),
              plan.groupCount ?? 0,
            )}
          </span>
        </p>
      </div>
      <Link
        href={`/group/${plan.slug}`}
        className="inline-flex min-h-11 items-center rounded-md bg-card px-4 text-sm font-semibold text-card-foreground shadow-xs transition-colors hover:bg-card/80"
      >
        Open the plan
      </Link>
      <Link
        href="/groups"
        className="text-sm underline underline-offset-4 hover:no-underline"
      >
        All plans
      </Link>
    </section>
  );
}

export default PlansStrip;
