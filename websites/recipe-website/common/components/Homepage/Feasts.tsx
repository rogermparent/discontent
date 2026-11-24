"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import {
  ArrowRightIcon,
  BotIcon,
  CalendarPlusIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import type { FeastCourse } from "../../controller/homepageFeasts";
import {
  countdownLabel,
  nextOccurrence,
  parseDayKey,
} from "../../util/holidays";
import { DayLeaf } from "./DayLeaf";
import { useHomeDay } from "./HomeDay";
import { Monogram } from "./Monogram";

/** One dated holiday as the homepage draws it (the route's `feastViews`). */
export interface FeastView {
  slug: string;
  rule: string;
  label: string;
  /** "52 dishes · 7 drinks · featured", spelled out on the server. */
  counts: string;
  cards: FeastCourse[];
  also: Array<Pick<FeastCourse, "slug" | "label" | "count">>;
  top: string[];
  /** The newest plan filed under it, with its lines. */
  plan?: {
    slug: string;
    name: string;
    count: string;
    lines: Array<{ href: string; name: string; slug?: string }>;
  };
  /** Editor only: `/group/new` filled in from the menu. */
  startPlanHref?: string;
  /** Editor only, with a model: `/curator` with the ask filled in. */
  curatorHref?: string;
}

const menuHref = (slug: string) => `/holidays/${slug}`;

function Countdown({ days, testId }: { days: number; testId: string }) {
  return (
    <span
      className="font-mono text-sm whitespace-nowrap text-primary tabular-nums"
      data-testid={testId}
    >
      {countdownLabel(days)}
    </span>
  );
}

/** A course on the menu row: its picture, "MAINS · 6" and the dish. */
function CourseCard({
  feast,
  course,
  pick,
}: {
  feast: FeastView;
  course: FeastCourse;
  pick?: string;
}) {
  const page = useHomeDay();
  const name = pick ? page?.names[pick] : undefined;
  const picture = pick ? (page?.cards[pick] ?? page?.thumbs[pick]) : undefined;
  return (
    <li data-testid="feast-course" data-course={course.slug}>
      <Link
        href={pick ? `/recipe/${pick}` : menuHref(feast.slug)}
        className="group grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 border-b border-border py-1.5 lg:flex lg:flex-col lg:items-stretch lg:gap-1.5 lg:border-0 lg:py-0"
      >
        <div className="size-14 overflow-hidden rounded-md bg-muted lg:aspect-square lg:size-auto">
          {picture ?? <Monogram label={name ?? course.label} small />}
        </div>
        <span className="flex min-w-0 flex-col">
          <span className="font-mono text-[0.6875rem] leading-4 font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {course.label} · {course.count}
          </span>
          <span className="text-[0.9375rem] leading-5 font-medium group-hover:underline group-hover:underline-offset-4 lg:text-sm">
            {name ?? `See the ${course.label.toLowerCase()}`}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** "On the plan: Christmas Baking · 6 recipes". */
function PlanLine({ plan }: { plan: NonNullable<FeastView["plan"]> }) {
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">On the plan:</span>{" "}
      <Link
        href={`/group/${plan.slug}`}
        className="inline-flex min-h-6 items-center font-semibold underline-offset-4 hover:underline"
      >
        {plan.name}
      </Link>{" "}
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        · {plan.count}
      </span>
    </p>
  );
}

/** A strip of small pictures, each a link named for its recipe. */
function Thumbs({
  label,
  items,
}: {
  label: string;
  items: Array<{ href: string; name: string; thumb: ReactNode }>;
}) {
  if (items.length === 0) return null;
  return (
    <ul
      aria-label={label}
      className="grid grid-cols-6 gap-1.5 sm:flex sm:flex-row sm:gap-2"
    >
      {items.map((item, index) => (
        <li key={`${index}-${item.href}`}>
          <Link
            href={item.href}
            aria-label={item.name}
            title={item.name}
            className="block aspect-square overflow-hidden rounded-md bg-muted transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:size-14"
          >
            {item.thumb}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The next holiday as its menu by course (48e, canvas B's "Next up"). */
function NextUp({
  feast,
  days,
  picks,
}: {
  feast: FeastView;
  days: number;
  picks: Map<string, string | undefined>;
}) {
  const page = useHomeDay();
  const today = page ? parseDayKey(page.today) : undefined;
  const date =
    page?.known && today ? nextOccurrence(feast.rule, today) : undefined;
  return (
    <section
      aria-labelledby="home-next-eyebrow home-next"
      className="flex flex-col gap-4"
      data-testid="next-feast"
    >
      <div className="flex flex-row flex-wrap items-center justify-between gap-4">
        <div className="flex flex-row items-center gap-4">
          <DayLeaf day={date} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p
              id="home-next-eyebrow"
              className="font-mono text-xs tracking-[0.16em] text-muted-foreground uppercase"
            >
              Next up
            </p>
            <h2 className="flex flex-row flex-wrap items-baseline gap-x-3 font-display text-[1.625rem] leading-tight font-bold tracking-tight sm:text-3xl">
              <Link
                id="home-next"
                href={menuHref(feast.slug)}
                className="underline-offset-4 hover:underline"
              >
                {feast.label}
              </Link>
              {page?.known && <Countdown days={days} testId="next-countdown" />}
            </h2>
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {feast.counts}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="hidden sm:inline-flex">
          <Link href={menuHref(feast.slug)}>
            Open the menu
            <ArrowRightIcon aria-hidden />
          </Link>
        </Button>
      </div>
      <ul
        aria-label={`${feast.label}'s menu by course`}
        className="flex flex-col lg:grid lg:grid-cols-6 lg:gap-3.5"
      >
        {feast.cards.map((course) => (
          <CourseCard
            key={course.slug}
            feast={feast}
            course={course}
            pick={
              picks.has(course.slug) ? picks.get(course.slug) : course.picks[0]
            }
          />
        ))}
      </ul>
      {feast.also.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Also on the menu:{" "}
          {feast.also.map((course, index) => (
            <Fragment key={course.slug}>
              {index > 0 && " · "}
              <Link
                href={menuHref(feast.slug)}
                className="inline-flex min-h-6 items-center gap-1 text-primary underline-offset-4 hover:underline"
              >
                {course.label}
                {/* The count as the cards write it ("SIDES · 20"), not
                    glued to the name ("Salads 2" read as a name). */}
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  · {course.count}
                </span>
              </Link>
            </Fragment>
          ))}
        </p>
      )}
      <Button asChild variant="outline" className="sm:hidden">
        <Link href={menuHref(feast.slug)}>Open the whole menu</Link>
      </Button>
      {feast.plan ? (
        <div className="flex flex-row flex-wrap items-center gap-3">
          <PlanLine plan={feast.plan} />
          <Button asChild variant="outline" size="sm">
            <Link href={`/group/${feast.plan.slug}`}>Open the plan</Link>
          </Button>
        </div>
      ) : feast.startPlanHref ? (
        <div
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground sm:flex-row sm:flex-wrap sm:items-center"
          data-testid="feast-plan-prompt"
        >
          <p className="min-w-0 text-sm sm:min-w-64 sm:flex-1">
            <b>No {feast.label} plan yet.</b>{" "}
            <span className="text-muted-foreground">
              Start one from the menu, a dish a course, or hand it to the
              curator.
            </span>
          </p>
          <Button asChild>
            <Link href={feast.startPlanHref}>
              <CalendarPlusIcon aria-hidden />
              Start a plan from the menu
            </Link>
          </Button>
          {feast.curatorHref && (
            <Button asChild variant="outline">
              <Link href={feast.curatorHref}>
                <BotIcon aria-hidden />
                Ask the curator
              </Link>
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** One of the holidays after the next: its plan, else a few of its dishes. */
function ThenCard({
  feast,
  days,
  picks,
  showShopping,
}: {
  feast: FeastView;
  days: number;
  picks: string[];
  showShopping: boolean;
}) {
  const page = useHomeDay();
  const today = page ? parseDayKey(page.today) : undefined;
  const date =
    page?.known && today ? nextOccurrence(feast.rule, today) : undefined;
  const thumb = (slug: string, name: string) =>
    page?.thumbs[slug] ?? <Monogram label={name} small />;
  const planThumbs = (feast.plan?.lines ?? []).slice(0, 6).map((line) => ({
    href: line.href,
    name: line.name,
    thumb: line.slug ? (
      thumb(line.slug, line.name)
    ) : (
      <Monogram label={line.name} small />
    ),
  }));
  const pickThumbs = picks.map((slug) => {
    const name = page?.names[slug] ?? slug;
    return { href: `/recipe/${slug}`, name, thumb: thumb(slug, name) };
  });
  return (
    <li
      className="flex min-w-0 flex-col gap-3.5 rounded-xl border border-border bg-card p-[1.125rem] text-card-foreground"
      data-testid="then-feast"
    >
      <div className="flex flex-row items-center gap-3.5">
        <DayLeaf day={date} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="flex flex-row flex-wrap items-baseline gap-x-2.5">
            <Link
              href={menuHref(feast.slug)}
              className="font-display text-xl leading-tight font-semibold tracking-tight underline-offset-4 hover:underline"
            >
              {feast.label}
            </Link>
            {page?.known && <Countdown days={days} testId="then-countdown" />}
          </h3>
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {feast.counts}
          </p>
        </div>
      </div>
      {feast.plan ? (
        <>
          <PlanLine plan={feast.plan} />
          <Thumbs label={`On ${feast.plan.name}`} items={planThumbs} />
          <div className="mt-auto flex flex-row flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/group/${feast.plan.slug}`}>Open the plan</Link>
            </Button>
            {showShopping && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/group/${feast.plan.slug}#plan-shopping-heading`}>
                  <ShoppingCartIcon aria-hidden />
                  Put it on the shopping list
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link href={menuHref(feast.slug)}>Open the menu</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          <Thumbs label={`From ${feast.label}`} items={pickThumbs} />
          {pickThumbs.length > 0 && (
            <p className="text-sm">
              {pickThumbs.map((item) => item.name).join(" · ")}
            </p>
          )}
        </>
      )}
    </li>
  );
}

/**
 * The holidays on the homepage (48e, canvas B): **Next up** — the next
 * holiday as its menu by course, each course a card with its count and its
 * lead dish (`homepageFeasts`: pins, then the dishes its description names,
 * so Thanksgiving leads with the turkey, the stuffing and a pie), its plan or
 * (editor only) a prompt to start one — then **Then**: the two after it, a
 * plan where one is filed under the holiday (Christmas Baking), else a few
 * of its dishes; and "After that".
 *
 * A client island: which holiday is next is the reader's day's
 * (`homepageDay`). Nothing renders when no holiday is within 180 days, or the
 * site has none.
 */
export function Feasts({
  feasts,
  showShopping = false,
}: {
  feasts: FeastView[];
  showShopping?: boolean;
}) {
  const page = useHomeDay();
  if (!page?.day.next) return null;
  const bySlug = new Map(feasts.map((feast) => [feast.slug, feast]));
  const next = bySlug.get(page.day.next.slug);
  if (!next) return null;
  const picks = new Map(
    page.day.next.cards.map((card) => [card.slug, card.pick]),
  );
  const then = page.day.then.flatMap((row) => {
    const feast = bySlug.get(row.slug);
    return feast ? [{ ...row, feast }] : [];
  });
  const after = page.day.after && bySlug.get(page.day.after.slug);
  return (
    <>
      <NextUp feast={next} days={page.day.next.days} picks={picks} />
      {then.length > 0 && (
        <section aria-labelledby="home-then" className="flex flex-col gap-4">
          <div className="flex flex-row flex-wrap items-baseline justify-between gap-x-4">
            <h2
              id="home-then"
              className="font-display text-2xl font-semibold tracking-tight"
            >
              Then
            </h2>
            <Link
              href="/holidays"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              All holidays
            </Link>
          </div>
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-5">
            {then.map((row) => (
              <ThenCard
                key={row.slug}
                feast={row.feast}
                days={row.days}
                picks={row.picks}
                showShopping={showShopping}
              />
            ))}
          </ul>
          {after && page.day.after && page.known && (
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              After that:{" "}
              <Link
                href={menuHref(after.slug)}
                className="text-primary underline-offset-4 hover:underline"
              >
                {after.label}
              </Link>
              , {countdownLabel(page.day.after.days)} · {after.counts}
            </p>
          )}
        </section>
      )}
    </>
  );
}

export default Feasts;
