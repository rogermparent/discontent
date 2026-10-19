"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, type ReactNode } from "react";
import {
  holidayAfter,
  kindCounts,
  MENU_LEAD_CARDS,
  MORE_GROUP,
  recipesOfKind,
  type HolidayEntry,
  type HolidayMenuData,
  type HolidayRecipe,
  type MenuGroup,
} from "../../controller/holidaysPage";
import {
  dayKey,
  formatDayShort,
  nextOccurrence,
  parseDayKey,
  daysBetween,
} from "../../util/holidays";
import { useToday } from "../Homepage/useToday";
import { MAKE_KINDS, withKind, type MakeKind } from "../MakePage/kinds";
import { KindMenu } from "../MakePage/KindMenu";
import { SLOT } from "../MakePage/MakeQuestion";
import {
  ALMANAC_HREF,
  countsLine,
  daysTo,
  holidayHref,
  kindCount,
} from "./shared";

/** The kind a `?kind=` names, by its word (`dishes`, `drinks`); else all. */
export function kindOfParam(param: string | null | undefined): MakeKind {
  return MAKE_KINDS.find((kind) => kind.word === param) ?? MAKE_KINDS[0];
}

/** The almanac fields "Then …" needs. */
export type MenuSibling = Pick<
  HolidayEntry,
  "slug" | "label" | "rule" | "recipes" | "dishes" | "drinks"
>;

export interface HolidayMenuProps {
  menu: HolidayMenuData;
  siblings: MenuSibling[];
  /** Lead-card pictures, rendered on the server, by recipe slug. */
  pictures: Record<string, ReactNode>;
  /** The record's description and picture, rendered on the server. */
  intro?: ReactNode;
  serverDay: string;
}

/**
 * The menu with `?kind=` read from the URL. The export prerenders this page,
 * where there are no search params, so the route wraps it in a `Suspense`
 * whose fallback is the same menu showing every kind (`HolidayMenu` with no
 * param) — the static HTML is the whole menu, and the browser narrows it.
 */
export function HolidayMenuFromUrl(props: HolidayMenuProps) {
  const params = useSearchParams();
  return <HolidayMenu {...props} kindParam={params.get("kind")} />;
}

/**
 * One holiday's menu (42e, the /drinks canvas's variant C, generalised to
 * recipes): the countdown as the headline, the first few recipes as
 * pictures (pinned first), the holiday after it, then the menu itself —
 * dot-leader lines grouped by course for dishes and by style for drinks,
 * "More" for the rest.
 *
 * **The kind** is a word in the menu's heading that opens `MAKE_KINDS`'
 * menu (`KindMenu`, as on `/make`): recipes, dishes, drinks. It lives in
 * `?kind=<word>`, so a link shares it, and "What can I make?" carries it on
 * to `/make` as the query's kind (`withKind`).
 *
 * **Today is the browser's**, as on the almanac: the countdown waits for it
 * (`useToday(null)`), and the server's day only places the first render.
 */
export function HolidayMenu({
  menu,
  siblings,
  pictures,
  intro,
  serverDay,
  kindParam,
}: HolidayMenuProps & { kindParam?: string | null }) {
  const kind = kindOfParam(kindParam);
  const router = useRouter();
  const pathname = usePathname();
  const heroId = useId();
  const menuId = useId();

  const browserDay = useToday(null);
  const today = parseDayKey(browserDay ?? serverDay);
  const date = menu.rule ? nextOccurrence(menu.rule, today) : undefined;
  const days =
    browserDay !== null && date ? daysBetween(today, date) : undefined;
  const then =
    browserDay !== null ? holidayAfter(siblings, menu.slug, today) : undefined;

  const shown = recipesOfKind(menu.recipes, kind.id);
  const lead = shown.slice(0, MENU_LEAD_CARDS);
  const counts = kindCounts(menu.counts);
  const labels = useMemo(
    () =>
      new Map(
        [...menu.courses, ...menu.styles].flatMap((group) =>
          group.recipes.map((recipe) => [recipe.slug, group] as const),
        ),
      ),
    [menu.courses, menu.styles],
  );
  const makeHref = `/make?q=${encodeURIComponent(
    withKind(`tag:${menu.slug}`, kind),
  )}`;

  const setKind = (next: MakeKind) => {
    const query = next.id === MAKE_KINDS[0].id ? "" : `?kind=${next.word}`;
    router.replace(`${pathname}${query}`, { scroll: false });
  };

  const words = days !== undefined ? daysTo(days) : undefined;

  return (
    <div className="flex flex-col gap-14 sm:gap-20">
      <section aria-labelledby={heroId} className="flex flex-col gap-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-foreground pb-2.5">
          <p className="m-0 font-mono text-xs font-medium tracking-[0.1em] text-foreground uppercase">
            <Link
              href={ALMANAC_HREF}
              className="inline-flex min-h-6 items-center hover:text-primary"
            >
              Holidays
            </Link>{" "}
            ·{" "}
            <span data-testid="holiday-counts">
              {menu.counts.recipes > 0
                ? countsLine(menu.counts)
                : "nothing yet"}
            </span>
          </p>
          {date && (
            <time
              dateTime={dayKey(date)}
              className="inline-block font-mono text-xs font-medium tracking-[0.1em] text-foreground uppercase"
            >
              {formatDayShort(date)}
            </time>
          )}
        </div>
        <h1
          id={heroId}
          data-testid="holiday-hero"
          className="m-0 font-display text-[clamp(3.25rem,1.4rem+7vw,7.5rem)] leading-[0.92] font-extrabold tracking-[-0.045em] text-balance"
        >
          {words && (
            <>
              <span className="font-mono font-semibold tracking-[-0.06em] text-primary">
                {days}
              </span>{" "}
              {words}{" "}
            </>
          )}
          {menu.label}
          {days === 0 ? " is today" : ""}.
        </h1>
        {intro}
        {lead.length > 0 && (
          <ul
            className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4"
            data-testid="holiday-lead"
          >
            {lead.map((recipe) => (
              <li key={recipe.slug}>
                <Link
                  href={`/recipe/${recipe.slug}`}
                  className="group flex flex-col gap-2"
                >
                  <div className="aspect-[4/5] w-full overflow-hidden rounded-sm bg-muted">
                    {pictures[recipe.slug]}
                  </div>
                  <span className="font-display text-base leading-tight font-semibold group-hover:text-primary sm:text-xl">
                    {recipe.name}
                  </span>
                  <span className="-mt-1 font-mono text-xs text-muted-foreground uppercase">
                    {metaOf(recipe, labels).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {then && (
          <Link
            href={holidayHref(then.slug)}
            data-testid="holiday-then"
            className="flex flex-col gap-1 border-y border-border py-4 hover:text-primary"
          >
            <span className="font-display text-xl leading-tight font-semibold tracking-[-0.02em] sm:text-[1.75rem]">
              Then {then.label}, in{" "}
              <span className="font-mono font-medium">{then.days}</span>{" "}
              {then.days === 1 ? "day" : "days"} —{" "}
              <span className="font-mono font-medium">{countsLine(then)}</span>.
            </span>
          </Link>
        )}
      </section>

      <section aria-labelledby={menuId} className="flex flex-col gap-8">
        <KindMenu
          kind={kind}
          kinds={MAKE_KINDS}
          onKind={setKind}
          label="What kind of recipe"
          wordClassName={SLOT}
          wordTestId="holiday-kind"
          menuTestId="holiday-kind-menu"
          detail={(each) => counts.get(each.id) ?? 0}
          className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 border-b-2 border-foreground pb-3"
        >
          {(word) => (
            <>
              <h2
                id={menuId}
                data-testid="holiday-menu-heading"
                className="m-0 font-display text-[clamp(2.25rem,1.4rem+3.5vw,4.5rem)] leading-none font-extrabold tracking-[-0.04em]"
              >
                On the menu: {word}
              </h2>
              {shown.length > 0 && (
                <Link
                  href={makeHref}
                  data-testid="holiday-make-link"
                  className="inline-flex min-h-6 items-center text-primary underline-offset-4 hover:underline"
                >
                  What can I make?
                </Link>
              )}
            </>
          )}
        </KindMenu>
        {shown.length === 0 ? (
          <p className="m-0 text-muted-foreground" data-testid="holiday-empty">
            {menu.counts.recipes === 0
              ? `Nothing is filed under ${menu.label} yet.`
              : `No ${kind.word} for ${menu.label} yet.`}{" "}
            <Link
              href={`/tags/${menu.slug}`}
              className="inline-flex min-h-6 items-center text-primary underline-offset-4 hover:underline"
            >
              The {menu.label} tag page
            </Link>
          </p>
        ) : kind.id === "any" &&
          menu.courses.length > 0 &&
          menu.styles.length > 0 ? (
          <>
            <MenuPart
              title="Dishes"
              count={kindCount(menu.counts.dishes, "food")}
              groups={menu.courses}
            />
            <MenuPart
              title="Drinks"
              count={kindCount(menu.counts.drinks, "drinks")}
              groups={menu.styles}
            />
          </>
        ) : (
          <MenuGroups
            groups={
              kind.id === "drinks" || menu.courses.length === 0
                ? menu.styles
                : menu.courses
            }
            level={3}
          />
        )}
        <p className="m-0 text-sm">
          <Link
            href={`/tags/${menu.slug}`}
            className="inline-flex min-h-6 items-center text-primary underline-offset-4 hover:underline"
          >
            Everything tagged {menu.label}
          </Link>
          {" · "}
          <Link
            href={ALMANAC_HREF}
            className="inline-flex min-h-6 items-center text-primary underline-offset-4 hover:underline"
          >
            All holidays
          </Link>
        </p>
      </section>
    </div>
  );
}

/** A lead card's line: course or style, then the base. */
function metaOf(
  recipe: HolidayRecipe,
  groups: Map<string, MenuGroup>,
): string[] {
  const group = groups.get(recipe.slug);
  return [
    group && group.slug !== MORE_GROUP ? group.label : undefined,
    recipe.base,
  ].filter((part): part is string => !!part);
}

/** "Dishes" or "Drinks", when the menu shows both. */
function MenuPart({
  title,
  count,
  groups,
}: {
  title: string;
  count: string;
  groups: MenuGroup[];
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-4">
        <h3
          id={id}
          className="m-0 font-display text-2xl leading-none font-bold tracking-[-0.03em] sm:text-[2rem]"
        >
          {title}
        </h3>
        <span className="font-mono text-xs text-muted-foreground">{count}</span>
      </div>
      <MenuGroups groups={groups} level={4} />
    </section>
  );
}

/** The groups in newspaper columns, each a dot-leader list. */
function MenuGroups({ groups, level }: { groups: MenuGroup[]; level: 3 | 4 }) {
  const Heading = level === 3 ? "h3" : "h4";
  return (
    <div className="columns-1 gap-x-12 md:columns-2 lg:columns-3">
      {groups.map((group) => (
        <div
          key={group.slug}
          data-testid="menu-group"
          className="mb-8 flex break-inside-avoid flex-col gap-1.5"
        >
          <div className="flex items-baseline justify-between gap-3 border-b border-foreground pb-1.5">
            <Heading className="m-0 font-mono text-xs leading-4 font-semibold tracking-[0.12em] uppercase">
              {group.label}
            </Heading>
            <span className="font-mono text-xs text-muted-foreground">
              {group.recipes.length}
            </span>
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {group.recipes.map((recipe) => (
              <li key={recipe.slug}>
                <Link
                  href={`/recipe/${recipe.slug}`}
                  className="group flex min-h-10 items-baseline gap-2 py-1"
                >
                  <span className="font-display text-lg leading-snug font-semibold tracking-[-0.01em] group-hover:text-primary sm:text-xl">
                    {recipe.name}
                  </span>
                  {recipe.base && (
                    <>
                      <i
                        aria-hidden
                        className="min-w-4 flex-1 -translate-y-1 border-b-2 border-dotted border-muted-foreground/55 group-hover:border-primary"
                      />
                      <span className="shrink-0 font-mono text-sm text-muted-foreground">
                        {recipe.base}
                      </span>
                    </>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
