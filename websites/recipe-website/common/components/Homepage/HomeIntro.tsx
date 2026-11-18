import type { ReactNode } from "react";
import Link from "next/link";
import {
  countLabel,
  intentSearchHref,
  type HomepageIntent,
} from "../../controller/homepageIntents";
import { HomeSearch } from "./HomeSearch";
import { TodayLine } from "./TodayLine";

/**
 * One intent as a query chip, `tag:quick 121` (42f): the query it runs, in
 * the mono face, and how much it finds. The tooltip says it in words.
 */
function IntentChip({ intent }: { intent: HomepageIntent }) {
  return (
    <Link
      href={intentSearchHref(intent.slug)}
      title={`${intent.label}: ${countLabel(intent.count, intent.noun)}`}
      className="inline-flex min-h-8 items-baseline gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[0.8125rem] leading-[1.125rem] text-card-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      data-testid="intent-chip"
    >
      tag:{intent.slug}{" "}
      <span className="text-[0.6875rem] tabular-nums text-muted-foreground">
        {intent.count}
      </span>
    </Link>
  );
}

/**
 * The top of the homepage — canvas B, "Tonight, then the next feast" (48e;
 * 42f's band before it): today's date and the days to the next holiday,
 * "What are you making?", one field for search and — for a signed-in editor
 * with a model, `ask` — Ask (43q), and the intents as `tag:` chips. The Make
 * tile moved down into Tonight.
 *
 * An `h2`: the masthead's site title stays the page's only `h1`.
 *
 * The chips are links in a `nav`, not a list: `featured-recipes`' "feature
 * again" counts every `listitem` on `/`.
 */
export function HomeIntro({
  intents,
  recipeCount,
  ask,
  holidayLabels,
}: {
  intents: HomepageIntent[];
  /** The corpus size, for the field's placeholder. */
  recipeCount: number;
  /** Editor only: wraps the search field with Ask (`HomeAsk`). */
  ask?: (field: ReactNode) => ReactNode;
  /** Holiday slug → label, for the eyebrow's countdown. */
  holidayLabels: Record<string, string>;
}) {
  const field = <HomeSearch recipeCount={recipeCount} />;
  return (
    <section
      aria-labelledby="home-start"
      className="flex max-w-[52rem] min-w-0 flex-col gap-3.5"
    >
      <div className="flex flex-col gap-1">
        <TodayLine labels={holidayLabels} />
        <h2
          id="home-start"
          className="font-display text-[clamp(1.875rem,4vw,2.75rem)] font-semibold leading-[1.02] tracking-tight"
        >
          What are you making?
        </h2>
      </div>
      {ask ? ask(field) : field}
      {intents.length > 0 && (
        <nav
          aria-label="Start a search from"
          className="flex flex-row flex-wrap gap-2"
        >
          {intents.map((intent) => (
            <IntentChip key={intent.slug} intent={intent} />
          ))}
        </nav>
      )}
    </section>
  );
}

export default HomeIntro;
