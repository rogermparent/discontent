"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ArrowRight, Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { buttonVariants } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import { almanacView } from "../../controller/holidaysPage";
import {
  findTags,
  type BoardColumn,
  type BoardFamily,
  type BoardRow,
  type TagBoardData,
} from "../../controller/tagBoardPage";
import { facetQuery, facetSearchHref } from "../../util/facets";
import { dayKey, formatDayShort, parseDayKey } from "../../util/holidays";
import { ALMANAC_HREF, daysTo, holidayHref } from "../HolidaysPage/shared";
import { useToday } from "../Homepage/useToday";
import { EmptyState } from "../EmptyState";
import { Leader, plural, useQueryCount } from "./parts";

const termHref = (slug: string) => `/tags/${slug}`;

/** Holidays the aside lists, soonest first. */
const BOARD_HOLIDAYS = 5;
/** Families the run-in list shows before "All N families". */
const FAMILIES_SHOWN = 30;
/** Rows "Find a tag" offers at once. */
const FIND_OPTIONS = 8;

/**
 * `/tags` as canvas B draws it, "Narrow it down" (43t): a Find field over
 * every name and alias, a **Combine** bar that hands `tag:a tag:b` to
 * search (D3), the Food shelf (four facet columns and Collections) beside
 * the dated Holidays, the Drinks shelf (Style, Strength & method, Spirit &
 * base and the Families run-in list) and the other tags folded away.
 *
 * Every row is a link to its term page; the `+` beside it adds it to
 * Combine. The `+` shows on hover where there is a pointer that hovers, and
 * always where there is not (a phone: canvas B's "long-press to combine"
 * became a visible button, Dt4). On a phone each column is a disclosure,
 * Holidays first.
 */
export function TagBoard({
  data,
  pictures,
  serverDay,
  actions,
}: {
  data: TagBoardData;
  /** Each holiday's picture, rendered on the server. */
  pictures: Record<string, ReactNode>;
  serverDay: string;
  /** Signed-in only: "New term". */
  actions?: ReactNode;
}) {
  const [combined, setCombined] = useState<string[]>([]);
  const names = useMemo(
    () => new Map(data.finder.map((entry) => [entry.slug, entry])),
    [data.finder],
  );
  const toggle = (slug: string) =>
    setCombined((current) =>
      current.includes(slug)
        ? current.filter((each) => each !== slug)
        : [...current, slug],
    );
  const on = new Set(combined);
  const hasFood = data.food.length > 0 || data.collections !== undefined;
  const hasDrinks = data.drinks.length > 0 || data.families.length > 0;

  return (
    <div className="flex flex-col gap-8" data-testid="tag-board">
      <div className="flex flex-col gap-3.5 rounded-xl border border-border bg-card p-4 sm:p-[18px]">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="m-0 font-display text-[1.75rem] leading-9 font-bold tracking-[-0.025em] sm:text-3xl">
            Tags
          </h1>
          {actions}
        </div>
        <TagFinder data={data} />
        <p className="m-0 text-[0.8125rem] leading-[18px] text-muted-foreground lg:hidden">
          Tap + beside a row to combine it with another.
        </p>
        <CombineBar
          combined={combined}
          names={names}
          onRemove={toggle}
          onClear={() => setCombined([])}
        />
      </div>

      {(hasFood || data.holidays.length > 0) && (
        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-10">
          {hasFood && (
            <Shelf
              id="tags-food"
              title="Food"
              ticker={`${plural(data.foodCount, "recipe")} · four ways in · + adds a row to Combine`}
              count={data.foodCount}
              className="order-2 lg:order-none"
            >
              <div className="lg:grid lg:grid-cols-4 lg:gap-x-7">
                {data.food.slice(0, 3).map((col, index) => (
                  <Column
                    key={col.id}
                    column={col}
                    on={on}
                    onToggle={toggle}
                    defaultOpen={index === 0}
                  />
                ))}
                <div className="flex min-w-0 flex-col lg:gap-5">
                  {data.food.slice(3).map((col) => (
                    <Column
                      key={col.id}
                      column={col}
                      on={on}
                      onToggle={toggle}
                      defaultOpen={false}
                    />
                  ))}
                  {data.collections && (
                    <Column
                      column={data.collections}
                      on={on}
                      onToggle={toggle}
                      defaultOpen={false}
                      heading={`${data.collections.rows.length}`}
                    />
                  )}
                </div>
              </div>
            </Shelf>
          )}
          {data.holidays.length > 0 && (
            <Holidays
              data={data}
              pictures={pictures}
              serverDay={serverDay}
              className="order-1 lg:order-none"
            />
          )}
        </div>
      )}

      {hasDrinks && (
        <Shelf
          id="tags-drinks"
          title="Drinks"
          ticker={`${plural(data.drinkCount, "drink")} · style, strength, method, spirit, family`}
          count={data.drinkCount}
        >
          <div className="lg:grid lg:grid-cols-5 lg:gap-x-7">
            {data.drinks.map((col) => (
              <Column
                key={col.id}
                column={col}
                on={on}
                onToggle={toggle}
                defaultOpen={false}
              />
            ))}
            {data.families.length > 0 && (
              <Families data={data} className="lg:col-span-2" />
            )}
          </div>
          {data.drinkCollections.length > 0 && (
            <p
              className="m-0 border-t border-border pt-3 text-sm text-muted-foreground lg:border-t-0 lg:pt-0"
              data-testid="tag-drink-collections"
            >
              <span className="font-mono text-xs tracking-[0.08em] uppercase">
                In collections
              </span>{" "}
              {data.drinkCollections.map((row, index) => (
                <span key={row.slug}>
                  {index > 0 && " · "}
                  <Link
                    href={termHref(row.slug)}
                    className="inline-flex min-h-6 items-center text-foreground hover:text-primary"
                  >
                    {row.label}
                  </Link>{" "}
                  <b className="font-mono text-xs font-normal">{row.count}</b>
                </span>
              ))}
            </p>
          )}
        </Shelf>
      )}

      <OtherTags
        data={data}
        alone={!hasFood && !hasDrinks && data.holidays.length === 0}
      />
      {!hasFood &&
        !hasDrinks &&
        data.holidays.length === 0 &&
        data.other.length === 0 && (
          <EmptyState message="No recipes have tags yet." />
        )}
    </div>
  );
}

// --- Find ------------------------------------------------------------------

/**
 * "Find a tag": the ARIA 1.2 combobox `/make`'s `TagSearch` is (28g), over
 * every term's label, slug and aliases. Picking one opens its page.
 */
function TagFinder({ data }: { data: TagBoardData }) {
  const id = useId();
  const listId = `${id}-list`;
  const router = useRouter();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = useMemo(
    () => findTags(data.finder, text, FIND_OPTIONS),
    [data.finder, text],
  );
  const expanded = open && options.length > 0;

  function pick(slug: string) {
    setOpen(false);
    router.push(termHref(slug));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (expanded ? (current + 1) % options.length : 0));
    } else if (event.key === "ArrowUp" && expanded) {
      event.preventDefault();
      setActive((current) => (current - 1 + options.length) % options.length);
    } else if (event.key === "Enter" && expanded) {
      event.preventDefault();
      pick(options[active].slug);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className="flex h-12 items-center gap-2.5 rounded-md border border-input bg-card px-3 text-muted-foreground shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
      >
        <Search aria-hidden className="size-5 shrink-0" />
        <span className="sr-only">Find a tag</span>
        <input
          id={id}
          type="search"
          role="combobox"
          data-testid="tag-find"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded ? `${id}-${active}` : undefined}
          placeholder={`Find a tag — ${data.names} names and aliases`}
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className="min-w-0 flex-1 border-0 bg-transparent text-[0.9375rem] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>
      <ul
        id={listId}
        role="listbox"
        aria-label="Tags"
        hidden={!expanded}
        className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
      >
        {options.map((option, position) => (
          <li
            key={option.slug}
            id={`${id}-${position}`}
            role="option"
            aria-selected={position === active}
            className={cn(
              "flex min-h-9 cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-sm",
              position === active && "bg-accent text-accent-foreground",
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              pick(option.slug);
            }}
            onMouseEnter={() => setActive(position)}
          >
            <span className="min-w-0">
              {option.trail.length > 0 && (
                <span className="text-muted-foreground">
                  {option.trail.join(" › ")}
                  {" › "}
                </span>
              )}
              <span className="font-medium">{option.label}</span>
              {option.alias && (
                <span className="text-muted-foreground">
                  {" "}
                  · also {option.alias}
                </span>
              )}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {option.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Combine ------------------------------------------------------------------

function CombineBar({
  combined,
  names,
  onRemove,
  onClear,
}: {
  combined: string[];
  names: ReadonlyMap<string, { label: string; facet?: string }>;
  onRemove: (slug: string) => void;
  onClear: () => void;
}) {
  const query = facetQuery(combined);
  const count = useQueryCount(query);
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="tag-combine"
      aria-live="polite"
    >
      <span className="mr-1 font-mono text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Combine
      </span>
      {combined.length === 0 ? (
        <span className="text-sm text-muted-foreground">
          Pick two or more rows with + to see what they share.
        </span>
      ) : (
        <>
          {combined.map((slug, index) => {
            const entry = names.get(slug);
            const label = entry?.label ?? slug;
            return (
              <span key={slug} className="contents">
                {index > 0 && (
                  <span
                    aria-hidden
                    className="font-mono text-sm text-muted-foreground"
                  >
                    +
                  </span>
                )}
                <span
                  className="inline-flex min-h-8 items-center gap-1 rounded-md bg-primary py-0 pr-1 pl-2.5 text-sm font-medium text-primary-foreground"
                  data-testid="tag-combine-token"
                >
                  {entry?.facet && (
                    <small className="mr-0.5 font-mono text-[0.6875rem] opacity-85">
                      {entry.facet}
                    </small>
                  )}
                  {label}
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    onClick={() => onRemove(slug)}
                    className="inline-flex size-6 items-center justify-center rounded-sm hover:bg-primary-foreground/15 focus-visible:outline-2 focus-visible:outline-primary-foreground"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </span>
              </span>
            );
          })}
          <Link
            href={facetSearchHref(combined)}
            className={cn(buttonVariants({ size: "sm" }), "ml-2")}
            data-testid="tag-combine-show"
          >
            {count === undefined
              ? "Show recipes"
              : `Show ${plural(count, "recipe")}`}
            <ArrowRight aria-hidden />
          </Link>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex min-h-6 items-center text-sm text-primary underline-offset-4 hover:underline"
          >
            Clear
          </button>
          <span className="ml-auto hidden font-mono text-xs text-muted-foreground sm:inline">
            opens search: {query}
          </span>
        </>
      )}
    </div>
  );
}

// --- shelves -------------------------------------------------------------------

function Shelf({
  id,
  title,
  ticker,
  count,
  className,
  children,
}: {
  id: string;
  title: string;
  ticker: string;
  count: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("flex min-w-0 flex-col gap-3.5", className)}
      data-testid="tag-shelf"
    >
      <div className="flex items-baseline justify-between gap-3 border-b-2 border-foreground pb-1 lg:pb-2">
        <h2
          id={id}
          className="m-0 font-display text-lg font-semibold tracking-[-0.02em] lg:text-xl"
        >
          {title}
        </h2>
        <span className="hidden font-mono text-[0.6875rem] tracking-[0.1em] text-muted-foreground uppercase lg:inline">
          {ticker}
        </span>
        <span className="font-mono text-xs text-muted-foreground lg:hidden">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

/**
 * One facet group. Wide: a heading (the root's link and the group's total)
 * over every row. On a phone, a disclosure; the list is in the page either
 * way, hidden by CSS while folded, so the export's HTML carries every link.
 */
function Column({
  column,
  on,
  onToggle,
  defaultOpen,
  heading,
}: {
  column: BoardColumn;
  on: ReadonlySet<string>;
  onToggle: (slug: string) => void;
  defaultOpen: boolean;
  /** The number beside a heading, when not the group's total. */
  heading?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const listId = useId();
  const number = heading ?? `${column.total}`;
  const rows = column.rows.length;
  return (
    <div
      className="min-w-0 border-b border-border lg:border-b-0"
      data-testid="tag-column"
      data-group={column.id}
    >
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-13 w-full items-center gap-2.5 text-left font-display text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
        >
          <ChevronDown
            aria-hidden
            className={cn("size-4 -rotate-90 transition-transform", open && "rotate-0")}
          />
          <span className="flex-1">{column.label}</span>
          <span className="font-mono text-xs font-normal text-muted-foreground">
            {rows} · {number}
          </span>
        </button>
        <span className="mb-1 hidden items-baseline justify-between gap-2 border-b border-border py-1.5 font-display text-[0.9375rem] font-semibold lg:flex">
          {column.root ? (
            <Link href={termHref(column.root)} className="hover:text-primary">
              {column.label}
            </Link>
          ) : (
            <span>{column.label}</span>
          )}
          <span className="font-mono text-[0.6875rem] font-normal text-muted-foreground">
            {number}
          </span>
        </span>
      </h3>
      <ul
        id={listId}
        className={cn("m-0 list-none p-0 pb-2 lg:block lg:pb-0", !open && "hidden")}
      >
        {column.rows.map((row) => (
          <BoardLine
            key={row.slug}
            row={row}
            pressed={on.has(row.slug)}
            onToggle={onToggle}
          />
        ))}
      </ul>
    </div>
  );
}

function BoardLine({
  row,
  pressed,
  onToggle,
}: {
  row: BoardRow;
  pressed: boolean;
  onToggle: (slug: string) => void;
}) {
  return (
    <li
      className="group/row flex items-center gap-1"
      style={row.depth > 0 ? { paddingLeft: `${row.depth * 14}px` } : undefined}
    >
      <Leader
        href={termHref(row.slug)}
        label={row.label}
        count={row.count}
        testId="tag-row"
        className={cn(
          "min-h-9 text-[0.9375rem] lg:min-h-7 lg:text-[0.84375rem]",
          pressed && "font-semibold text-primary",
        )}
      />
      <button
        type="button"
        aria-pressed={pressed}
        aria-label={
          pressed ? `Combined: ${row.label}` : `Combine with ${row.label}`
        }
        onClick={() => onToggle(row.slug)}
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-sm border border-transparent text-muted-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring",
          pressed
            ? "bg-primary text-primary-foreground"
            : "group-hover/row:border-input [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100",
        )}
      >
        {pressed ? (
          <Check aria-hidden className="size-3.5" />
        ) : (
          <Plus aria-hidden className="size-3.5" />
        )}
      </button>
    </li>
  );
}

// --- holidays ------------------------------------------------------------------

/**
 * The Holidays aside: the next few, soonest first on the browser's day (the
 * export is static — `useToday`, as the almanac does), each to its menu.
 * The numbers wait for the browser; the order is the server's until then.
 */
function Holidays({
  data,
  pictures,
  serverDay,
  className,
}: {
  data: TagBoardData;
  pictures: Record<string, ReactNode>;
  serverDay: string;
  className?: string;
}) {
  const browserDay = useToday(null);
  const today = parseDayKey(browserDay ?? serverDay);
  const counted = browserDay !== null;
  const dated = almanacView(data.holidays, today).dated.slice(
    0,
    BOARD_HOLIDAYS,
  );
  const id = useId();
  return (
    <aside
      aria-labelledby={id}
      className={cn(
        "flex flex-col gap-1.5 lg:rounded-xl lg:border lg:border-border lg:bg-card lg:p-[18px]",
        className,
      )}
      data-testid="tag-holidays"
    >
      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1 lg:border-b-0 lg:pb-0">
        <h2
          id={id}
          className="m-0 font-display text-lg font-semibold tracking-[-0.02em]"
        >
          Holidays
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          {data.holidayCount}
        </span>
      </div>
      <ol className="m-0 list-none p-0">
        {dated.map((holiday) => {
          const words = daysTo(holiday.days);
          return (
            <li key={holiday.slug} className="border-b border-border">
              <Link
                href={holidayHref(holiday.slug)}
                className="group grid min-h-16 grid-cols-[48px_minmax(0,1fr)_44px] items-center gap-3 py-2 lg:grid-cols-[56px_minmax(0,1fr)_48px]"
                data-testid="tag-holiday"
              >
                <span className="flex flex-col font-mono tabular-nums">
                  {counted ? (
                    <>
                      <b className="text-[1.375rem] leading-none font-medium">
                        {words ? holiday.days : "Today"}
                      </b>
                      {words && (
                        <span className="text-[0.65625rem] leading-4 tracking-[0.1em] text-muted-foreground uppercase">
                          {holiday.days === 1 ? "day" : "days"}
                        </span>
                      )}
                    </>
                  ) : (
                    <span aria-hidden className="text-muted-foreground">
                      ·
                    </span>
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-display text-base leading-[22px] font-semibold group-hover:text-primary">
                    {holiday.label}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    <time dateTime={dayKey(holiday.date)} className="inline-block">
                      {formatDayShort(holiday.date)}
                    </time>{" "}
                    · {plural(holiday.recipes, "recipe")}
                    {holiday.plans > 0 && ` · ${plural(holiday.plans, "plan")}`}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="size-11 overflow-hidden rounded-md bg-muted lg:size-12"
                >
                  {pictures[holiday.slug]}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <Link
        href={ALMANAC_HREF}
        className="inline-flex min-h-6 items-center gap-1 pt-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        data-testid="tag-almanac-link"
      >
        Each holiday&apos;s menu, in the almanac
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </aside>
  );
}

// --- families ------------------------------------------------------------------

/**
 * Families — the drink names under `drink` (Df3) — as a run-in list, most
 * made first, a family's own families in brackets after it ("Margarita 5
 * (Frozen Margarita 2)"). The first `FAMILIES_SHOWN`, then "All N
 * families" opens the rest in place: 43k left ~113 of them.
 */
function Families({
  data,
  className,
}: {
  data: TagBoardData;
  className?: string;
}) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const shown = all ? data.families : data.families.slice(0, FAMILIES_SHOWN);
  const hidden = data.families.length - shown.length;
  return (
    <div
      className={cn("min-w-0 border-b border-border lg:border-b-0", className)}
      data-testid="tag-families"
    >
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-13 w-full items-center gap-2.5 text-left font-display text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
        >
          <ChevronDown
            aria-hidden
            className={cn("size-4 -rotate-90 transition-transform", open && "rotate-0")}
          />
          <span className="flex-1">Families</span>
          <span className="font-mono text-xs font-normal text-muted-foreground">
            {data.familyCount}
          </span>
        </button>
        <span className="mb-1 hidden items-baseline justify-between gap-2 border-b border-border py-1.5 font-display text-[0.9375rem] font-semibold lg:flex">
          <span>Families</span>
          <span className="font-mono text-[0.6875rem] font-normal text-muted-foreground">
            {data.familyCount} · versions of one drink
          </span>
        </span>
      </h3>
      <div id={listId} className={cn("pb-3 lg:block lg:pb-0", !open && "hidden")}>
        <p className="m-0 text-[0.84375rem] leading-6">
          {shown.map((row, index) => (
            <span key={row.slug}>
              {index > 0 && <span aria-hidden> · </span>}
              <FamilyItem row={row} />
            </span>
          ))}
        </p>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setAll(true)}
            className="mt-1 inline-flex min-h-6 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            All {data.familyCount} families
            <ArrowRight aria-hidden className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function FamilyItem({ row }: { row: BoardFamily }) {
  return (
    <>
      <Link
        href={termHref(row.slug)}
        className="hover:text-primary"
        data-testid="tag-family"
      >
        {row.label}
      </Link>{" "}
      <b className="font-mono text-[0.6875rem] font-normal text-muted-foreground">
        {row.count}
      </b>
      {row.children.length > 0 && (
        <span className="text-muted-foreground">
          {" ("}
          {row.children.map((child, index) => (
            <span key={child.slug}>
              {index > 0 && ", "}
              <FamilyItem row={child} />
            </span>
          ))}
          {")"}
        </span>
      )}
    </>
  );
}

// --- other tags ------------------------------------------------------------------

/** "N other tags": what no group places, folded away. */
function OtherTags({ data, alone }: { data: TagBoardData; alone: boolean }) {
  if (data.other.length === 0) return null;
  return (
    <details
      className="group/other border-y border-border"
      data-testid="tag-other"
      open={alone}
    >
      <summary className="flex min-h-13 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 py-2 [&::-webkit-details-marker]:hidden">
        <ChevronDown
          aria-hidden
          className="size-4 -rotate-90 transition-transform group-open/other:rotate-0"
        />
        <span className="font-display text-base font-semibold">
          {plural(data.other.length, "other tag")}
        </span>
        {data.otherOnce > 0 && (
          <span className="text-sm text-muted-foreground">
            {data.otherOnce} used once — a term or a family would put them on
            this board
          </span>
        )}
      </summary>
      <div
        className="flex flex-row flex-wrap items-center gap-2 pb-4"
        data-testid="tag-index"
      >
        {data.other.map((tag) => (
          <Link
            key={tag.slug}
            href={termHref(tag.slug)}
            className="inline-flex min-h-7 items-baseline gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-[0.8125rem] font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            {tag.label}
            <span className="font-mono text-[0.6875rem] opacity-75">
              {tag.count}
            </span>
          </Link>
        ))}
      </div>
    </details>
  );
}
