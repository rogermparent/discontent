import Link from "next/link";
import {
  countLabel,
  type HomepageIntent,
} from "../../controller/homepageIntents";
import { MakeTile } from "./MakeTile";
import { TodayLine } from "./TodayLine";
import { intentTileClassName } from "./tileStyles";

/** One intent tile: a term page, what it is for, and how much it holds. */
function IntentTile({ intent }: { intent: HomepageIntent }) {
  return (
    <Link
      href={intent.href ?? `/tags/${intent.slug}`}
      className={intentTileClassName()}
      data-testid="intent-tile"
    >
      <span className="font-display text-xl font-bold leading-tight">
        {intent.label}
      </span>
      <span className="text-sm leading-snug text-muted-foreground">
        {intent.description}
      </span>
      <span className="mt-auto font-mono text-xs tabular-nums text-primary">
        {countLabel(intent.count, intent.noun)}
      </span>
    </Link>
  );
}

/**
 * The top of the homepage (direction A, usability pass 2026-10-15): today's
 * date, the question "What are you making?", and a row of equal tiles that
 * answer it — "What can I make?" first, as the accent tile, then the intents
 * the vocabulary supports (`HOMEPAGE_INTENTS`).
 *
 * An `h2`: the masthead's site title stays the page's only `h1`.
 *
 * Two columns on a phone (the Make tile spans both), then as many 196 px
 * columns as fit — so five tiles sit in one row on a laptop and nothing ever
 * scrolls sideways.
 */
export function HomeIntro({ intents }: { intents: HomepageIntent[] }) {
  return (
    <section aria-labelledby="home-start" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <TodayLine />
        <h2
          id="home-start"
          className="font-display text-[clamp(1.875rem,4.4vw,3.125rem)] font-semibold leading-[1.02] tracking-tight"
        >
          What are you making?
        </h2>
      </div>
      <nav
        aria-label="Ways in"
        className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(196px,1fr))]"
      >
        <MakeTile />
        {intents.map((intent) => (
          <IntentTile key={intent.slug} intent={intent} />
        ))}
      </nav>
    </section>
  );
}

export default HomeIntro;
