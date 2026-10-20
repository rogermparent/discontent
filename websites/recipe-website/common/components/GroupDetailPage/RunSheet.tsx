"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { ArrowRight, Pencil, Play } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import { formatOven } from "../../util/planTimes";
import type { PlanPageData, PlanRowView } from "../../util/planPage";
import {
  buildPlanSheet,
  dayBeforeNote,
  formatYieldSum,
  yieldSumLabel,
  type PlanSheet,
  type SheetRow,
} from "../../util/planSheet";
import type { Makeable } from "../MakePage/useMakeable";
import { Tick } from "./CookList";
import { Mosaic, Thumb, recipeHref } from "./PlanList";
import { ShoppingPanel, planMakeHref, shelfSummary } from "./PlanRail";
import { useMadeTicks, useMixedTicks, type PlanMode } from "./planState";
import type { PlanEditor, PlanShoppingSummary } from "./types";

/*
 * The run sheet (43p2, canvas C "The run sheet", on 43p1's page): a baking
 * day as a production schedule — the counts up top, then the plan as a
 * table you work down (desktop) or two lists (a phone): what to mix and
 * chill the day before, ticked "mixed" as you go; each bake's minutes drawn
 * to scale on baking day; what each makes, big; ticked "made". Under it,
 * the shopping docket and your shelf. Every number comes from the steps
 * and the stores (`planSheet.ts`); what isn't found says "not set".
 */

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const captionClass = "font-mono text-xs text-muted-foreground";

/** A tape label as a heading (canvas C's `h-tape--up`), accent for baking day. */
function SheetTape({
  children,
  accent,
  large,
  className,
}: {
  children: ReactNode;
  accent?: boolean;
  large?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "make-tape px-2 py-1 font-mono font-medium tracking-[0.1em] uppercase leading-none",
        large ? "text-sm" : "text-[0.6875rem]",
        className,
      )}
      data-kind="have"
      data-featured={accent ? "true" : undefined}
    >
      {children}
    </span>
  );
}

/** A chill time as tape: "chill ≥ 3 h" (canvas C). */
function ChillTape({ children }: { children: ReactNode }) {
  return (
    <span
      className="make-tape px-2 py-1 font-mono text-[0.75rem] leading-none whitespace-nowrap"
      data-kind="have"
    >
      {children}
    </span>
  );
}

function rowName(row: PlanRowView): string {
  return row.recipe?.name ?? row.group?.name ?? row.missing ?? "this row";
}

function rowHref(row: PlanRowView): string | undefined {
  if (row.recipe) return recipeHref(row.recipe.slug, row.item.scale);
  if (row.group) return `/group/${row.group.slug}`;
  return undefined;
}

/**
 * The oven bar (canvas C): the bake's range drawn to the plan's scale — the
 * solid bar its low end, the pale one behind it the top. Decoration: the
 * caption beside it says the minutes.
 */
function OvenBar({ bake }: { bake?: SheetRow["bake"] }) {
  return (
    <div
      aria-hidden
      data-testid="sheet-oven-bar"
      className="relative h-2.5 overflow-hidden rounded-[2px] bg-muted lg:h-3.5"
    >
      {bake && bake.high > bake.low && (
        <i
          className="absolute inset-y-0 left-0 bg-primary/35"
          style={{ width: `${bake.high}%` }}
        />
      )}
      {bake && (
        <b
          className="absolute inset-y-0 left-0 bg-primary"
          style={{ width: `${bake.low}%` }}
        />
      )}
    </div>
  );
}

/** "7–9 min a batch", "11–13 min a batch, then 10 min in the freezer". */
function bakeCaption(row: SheetRow): string {
  if (!row.bake) return "bake not set";
  return [
    [row.bake.text, row.bake.oven].filter(Boolean).join(" "),
    ...row.after,
  ].join(", ");
}

// --- the hero ------------------------------------------------------------------

function Stat({
  value,
  label,
  primary,
  testId,
}: {
  value: ReactNode;
  label: ReactNode;
  primary?: boolean;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col-reverse gap-0.5 border-b border-border py-3 odd:border-r odd:pr-3 even:pl-3 lg:gap-1 lg:border-b-0 lg:border-l lg:px-5 lg:py-0 lg:odd:border-r-0 lg:odd:pr-5 lg:even:pl-5"
    >
      <dt className="font-mono text-[0.6875rem] leading-4 font-medium tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "font-mono text-[2rem] leading-none font-medium tracking-[-0.03em] tabular-nums lg:text-[2.75rem]",
          primary && "text-primary",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Recipes · doughs chill · one oven · what it all makes (canvas C). */
function Stats({ sheet }: { sheet: PlanSheet }) {
  const { summary } = sheet;
  const chill = summary.chilling.length;
  const chillLabel = summary.doughs
    ? chill === 1
      ? "dough chills"
      : "doughs chill"
    : chill === 1
      ? "recipe chills"
      : "recipes chill";
  return (
    <dl
      data-testid="sheet-stats"
      className="grid grid-cols-2 border-t-2 border-foreground lg:flex lg:border-t-0"
    >
      <Stat
        value={sheet.recipes}
        label={`${sheet.recipes === 1 ? "recipe" : "recipes"}${
          sheet.plans > 0
            ? ` + ${sheet.plans} ${sheet.plans === 1 ? "plan" : "plans"}`
            : ""
        }`}
      />
      <Stat value={chill} label={chillLabel} />
      {sheet.oven ? (
        <Stat
          value={
            <>
              {sheet.oven.degrees}°
              <span className="lg:hidden">{sheet.oven.unit}</span>
            </>
          }
          label={
            <>
              one oven
              <span className="hidden lg:inline">, {sheet.oven.unit}</span>
            </>
          }
        />
      ) : summary.ovens.length > 1 ? (
        <Stat value={summary.ovens.length} label="oven temperatures" />
      ) : (
        <Stat value="—" label="oven not set" />
      )}
      {sheet.yields ? (
        <Stat
          testId="sheet-yields"
          value={formatYieldSum(sheet.yields)}
          label={yieldSumLabel(sheet.yields)}
          primary
        />
      ) : (
        <Stat testId="sheet-yields" value="—" label="makes not set" />
      )}
    </dl>
  );
}

// --- the table (desktop) -------------------------------------------------------

function RecipeCell({
  row,
  images,
  done,
}: {
  row: PlanRowView;
  images: Record<string, ReactNode>;
  done: boolean;
}) {
  const href = rowHref(row);
  return (
    <div className="flex items-center gap-3.5">
      {row.group ? (
        <Mosaic row={row} images={images} className="size-14" />
      ) : row.recipe ? (
        <Thumb node={images[row.recipe.slug]} className="size-14" />
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        {href ? (
          <Link
            href={href}
            className={cn(
              "font-display text-[1.0625rem] leading-[1.375rem] font-semibold tracking-[-0.015em] underline-offset-4 hover:underline",
              done && "text-muted-foreground line-through",
              FOCUS,
            )}
          >
            {rowName(row)}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">{row.missing}</span>
        )}
        {row.group && (
          <span className={captionClass}>
            plan · {row.group.recipes.length}{" "}
            {row.group.recipes.length === 1 ? "recipe" : "recipes"}
          </span>
        )}
      </div>
    </div>
  );
}

function DayBeforeCell({
  row,
  mixed,
  onMixed,
}: {
  row: SheetRow;
  mixed: boolean;
  onMixed: () => void;
}) {
  if (row.row.group) {
    return <span className={captionClass}>a plan of its own</span>;
  }
  if (!row.row.recipe) return null;
  const name = row.row.recipe.name;
  return (
    <div className="flex items-center gap-1">
      {row.chill && (
        <Tick
          done={mixed}
          name={name}
          onToggle={onMixed}
          mark={`Mark ${name} ${row.dough ? "dough " : ""}mixed`}
          unmark={`Unmark ${name} ${row.dough ? "dough" : "mixed"}`}
        />
      )}
      <div className="flex min-w-0 flex-col items-start gap-1">
        {row.chill ? (
          <ChillTape>chill {row.chill}</ChillTape>
        ) : (
          <span className={captionClass}>chill not set</span>
        )}
        {row.ahead.length > 0 && (
          <span className={captionClass}>{row.ahead.join(" · ")}</span>
        )}
      </div>
    </div>
  );
}

function BakingCell({ row }: { row: SheetRow }) {
  if (row.row.group) {
    return (
      <Link
        href={
          row.row.group.sheet
            ? `/group/${row.row.group.slug}?mode=sheet`
            : `/group/${row.row.group.slug}`
        }
        className={cn(
          "inline-flex min-h-6 items-center gap-1 text-sm text-primary underline-offset-4 hover:underline",
          FOCUS,
        )}
      >
        {row.row.group.sheet ? "Its own run sheet" : "Open the plan"}
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    );
  }
  if (!row.row.recipe) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <OvenBar bake={row.bake} />
      <span className={captionClass}>{bakeCaption(row)}</span>
    </div>
  );
}

function Makes({ row, compact }: { row: SheetRow; compact?: boolean }) {
  if (!row.row.recipe) return null;
  return (
    <div className="flex flex-col items-end text-right">
      <b
        className={cn(
          "font-mono leading-none font-medium tracking-[-0.03em] tabular-nums",
          compact ? "text-[1.625rem]" : "text-[2.125rem]",
        )}
      >
        {row.makes ? row.makes.number : "—"}
      </b>
      <span className="font-mono text-[0.6875rem] leading-4 tracking-[0.05em] text-muted-foreground">
        {row.makes ? row.makes.unit : "not set"}
      </span>
    </div>
  );
}

const headClass =
  "border-b border-foreground py-3 text-left align-middle font-mono text-[0.6875rem] font-medium tracking-[0.1em] text-muted-foreground uppercase";

function SheetTable({
  sheet,
  images,
  made,
  mixed,
  onMade,
  onMixed,
}: {
  sheet: PlanSheet;
  images: Record<string, ReactNode>;
  made: ReadonlySet<string>;
  mixed: ReadonlySet<string>;
  onMade: (key: string) => void;
  onMixed: (key: string) => void;
}) {
  return (
    <table
      className="hidden w-full table-fixed border-collapse lg:table"
      data-testid="sheet-table"
    >
      <caption className="sr-only">
        The run sheet: each recipe&rsquo;s day before, baking day and what it
        makes
      </caption>
      <colgroup>
        <col className="w-12" />
        <col />
        <col className="w-[230px]" />
        <col className="w-[300px]" />
        <col className="w-[130px]" />
        <col className="w-14" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className={headClass}>
            #
          </th>
          <th scope="col" className={headClass}>
            Recipe
          </th>
          <th scope="col" className={headClass}>
            <SheetTape>Day before · mix + chill</SheetTape>
          </th>
          <th scope="col" className={headClass}>
            <span className="flex items-center justify-between gap-2">
              <SheetTape accent>
                Baking day{sheet.oven ? ` · ${formatOven(sheet.oven)}` : ""}
              </SheetTape>
              <span className="tracking-normal normal-case">
                {sheet.scale.caption}
              </span>
            </span>
          </th>
          <th scope="col" className={cn(headClass, "text-right")}>
            Makes
          </th>
          <th scope="col" className={headClass}>
            <span className="sr-only">Made</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {sheet.rows.map((row) => {
          const done = made.has(row.tick);
          return (
            <tr
              key={`${row.position}-${row.tick}`}
              data-testid="sheet-row"
              data-made={done ? "true" : undefined}
              className="border-b border-border"
            >
              <td className="h-[84px] py-2 align-middle font-mono text-[1.75rem] leading-none text-muted-foreground tabular-nums">
                {row.number}
              </td>
              <th
                scope="row"
                className="py-2 pr-5 text-left align-middle font-normal"
              >
                <RecipeCell row={row.row} images={images} done={done} />
              </th>
              <td className="py-2 pr-5 align-middle" data-testid="sheet-ahead">
                <DayBeforeCell
                  row={row}
                  mixed={mixed.has(row.tick)}
                  onMixed={() => onMixed(row.tick)}
                />
              </td>
              <td className="py-2 pr-5 align-middle" data-testid="sheet-bake">
                <BakingCell row={row} />
              </td>
              <td className="py-2 align-middle" data-testid="sheet-makes">
                <Makes row={row} />
              </td>
              <td className="py-2 pl-2 align-middle">
                {!row.row.missing && (
                  <Tick
                    done={done}
                    name={rowName(row.row)}
                    onToggle={() => onMade(row.tick)}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// --- the lists (a phone) -------------------------------------------------------

function ListHead({
  id,
  children,
  aside,
}: {
  id: string;
  children: ReactNode;
  aside: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b-2 border-foreground pb-2">
      <h3 id={id}>{children}</h3>
      <span className={captionClass}>{aside}</span>
    </div>
  );
}

function DayBefore({
  sheet,
  mixed,
  onMixed,
}: {
  sheet: PlanSheet;
  mixed: ReadonlySet<string>;
  onMixed: (key: string) => void;
}) {
  const chilling = sheet.rows.filter((row) => row.chill && row.row.recipe);
  const note = dayBeforeNote(sheet);
  return (
    <section
      aria-labelledby="sheet-day-before-heading"
      data-testid="sheet-day-before"
      className="flex flex-col lg:hidden"
    >
      <ListHead id="sheet-day-before-heading" aside="mix + chill">
        <SheetTape large>Day before</SheetTape>
      </ListHead>
      {chilling.length > 0 ? (
        <ul>
          {chilling.map((row) => {
            const recipe = row.row.recipe!;
            const done = mixed.has(row.tick);
            return (
              <li
                key={`${row.position}-${row.tick}`}
                className="grid min-h-14 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border"
              >
                <Tick
                  done={done}
                  name={recipe.name}
                  onToggle={() => onMixed(row.tick)}
                  mark={`Mark ${recipe.name} ${row.dough ? "dough " : ""}mixed`}
                  unmark={`Unmark ${recipe.name} ${row.dough ? "dough" : "mixed"}`}
                />
                <Link
                  href={recipeHref(recipe.slug, row.row.item.scale)}
                  className={cn(
                    "font-display text-[0.9375rem] leading-5 font-semibold underline-offset-4 hover:underline",
                    done && "text-muted-foreground line-through",
                    FOCUS,
                  )}
                >
                  {recipe.name}
                </Link>
                <ChillTape>{row.chill}</ChillTape>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="border-b border-border py-3 text-sm text-muted-foreground">
          No chill read from the steps.
        </p>
      )}
      {note && <p className={cn(captionClass, "pt-2")}>{note}</p>}
    </section>
  );
}

function BakingDay({ sheet }: { sheet: PlanSheet }) {
  return (
    <section
      aria-labelledby="sheet-baking-heading"
      data-testid="sheet-baking-day"
      className="flex flex-col lg:hidden"
    >
      <ListHead
        id="sheet-baking-heading"
        aside={[sheet.oven ? formatOven(sheet.oven) : "", sheet.scale.caption]
          .filter(Boolean)
          .join(" · ")}
      >
        <SheetTape large accent>
          Baking day
        </SheetTape>
      </ListHead>
      {/* The yield column is a fixed width, so every row's bar track is
       * the same length and the bars stay to one scale. */}
      <ol>
        {sheet.rows.map((row) => {
          const href = rowHref(row.row);
          return (
            <li
              key={`${row.position}-${row.tick}`}
              className="grid grid-cols-[44px_minmax(0,1fr)_6.5rem] items-center gap-x-2 gap-y-1 border-b border-border py-3"
            >
              <span className="row-span-2 font-mono text-[1.625rem] leading-none text-muted-foreground tabular-nums">
                {row.number}
              </span>
              {href ? (
                <Link
                  href={href}
                  className={cn(
                    "font-display text-[0.9375rem] leading-5 font-semibold underline-offset-4 hover:underline",
                    FOCUS,
                  )}
                >
                  {rowName(row.row)}
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {row.row.missing}
                </span>
              )}
              <div className="row-span-2">
                <Makes row={row} compact />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                {row.row.group ? (
                  <BakingCell row={row} />
                ) : row.row.recipe ? (
                  <>
                    <OvenBar bake={row.bake} />
                    <span className={captionClass}>
                      {/* C-phone: the rest and what sets ride with the bake;
                       * the keeps are said once, under Day before. */}
                      {[bakeCaption(row), row.rest, ...row.sets]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <p className={cn(captionClass, "pt-2")}>
        Times read from each recipe&rsquo;s steps; one batch each.
      </p>
    </section>
  );
}

// --- the docket and the shelf ----------------------------------------------------

/**
 * The shopping docket (canvas C): the plan's lines on the list, by aisle,
 * and the big ones — `buildShoppingView`'s rows, read on the server. Its
 * torn foot is `plan.css`'s `clip-path`.
 */
function Docket({ summary }: { summary: PlanShoppingSummary }) {
  const docket = summary.docket;
  return (
    <section
      aria-labelledby="sheet-docket-heading"
      data-testid="sheet-docket"
      className="plan-docket flex flex-col gap-3 border border-border bg-card px-5 pt-5 pb-8 text-card-foreground"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="sheet-docket-heading">
          <SheetTape>On the list</SheetTape>
        </h3>
        <span className="font-mono text-[0.8125rem] tabular-nums">
          {summary.lines} {summary.lines === 1 ? "line" : "lines"} ·{" "}
          {summary.rows} {summary.rows === 1 ? "row" : "rows"} ·{" "}
          {summary.ticked} ticked
        </span>
      </div>
      {docket && docket.aisles.length > 0 && (
        <dl
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm"
          aria-label="Rows by aisle"
          data-testid="sheet-aisles"
        >
          {docket.aisles.map(({ aisle, label, rows }) => (
            <div key={aisle} className="contents">
              <dt>{label}</dt>
              <dd className="text-right font-mono font-medium tabular-nums">
                {rows}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {docket && docket.big.length > 0 && (
        <>
          <hr className="border-border" />
          <p className={captionClass} data-testid="sheet-big-ones">
            The big ones: {docket.big.join(" · ")}
          </p>
        </>
      )}
      <Link
        href="/shopping"
        className={cn(
          "inline-flex min-h-6 items-center gap-1 self-start text-sm text-primary underline-offset-4 hover:underline",
          FOCUS,
        )}
      >
        Open the list
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}

/** From your shelf, as the sheet prints it: big counts, the nearest's tapes. */
function SheetShelf({ slug, makeable }: { slug: string; makeable: Makeable }) {
  const summary = shelfSummary(makeable);
  const open = (
    <Link
      href={planMakeHref(slug)}
      className={cn(
        "inline-flex min-h-6 items-center gap-1 text-primary underline-offset-4 hover:underline",
        FOCUS,
      )}
    >
      Open in Make
      <ArrowRight aria-hidden className="size-4" />
    </Link>
  );
  return (
    <section
      aria-labelledby="sheet-shelf-heading"
      data-testid="sheet-shelf"
      className="flex flex-col gap-3 lg:pt-5"
    >
      <h3 id="sheet-shelf-heading" className="self-start">
        <SheetTape>From your shelf</SheetTape>
      </h3>
      {makeable.status === "empty" ? (
        <p className="text-sm text-muted-foreground">
          Nothing on your list yet. Say what you have on Make, and this counts
          what the plan needs.
        </p>
      ) : makeable.status === "error" ? (
        <p className="text-sm text-muted-foreground" role="alert">
          Couldn&rsquo;t read the recipes.{" "}
          <button
            type="button"
            className={cn("underline underline-offset-4", FOCUS)}
            onClick={makeable.retry}
          >
            Try again
          </button>
        </p>
      ) : !summary ? (
        <p className="text-sm text-muted-foreground" role="status">
          Checking your shelf…
        </p>
      ) : (
        <>
          <p
            className="font-mono text-2xl leading-[1.1] font-medium tracking-[-0.03em] tabular-nums lg:text-[2.125rem]"
            data-testid="sheet-shelf-counts"
          >
            {summary.ready}{" "}
            <span className="text-base tracking-normal text-muted-foreground">
              ready
            </span>{" "}
            · {summary.near}{" "}
            <span className="text-base tracking-normal text-muted-foreground">
              1–2 away
            </span>{" "}
            · {summary.more}{" "}
            <span className="text-base tracking-normal text-muted-foreground">
              need more
            </span>
          </p>
          {summary.nearest && summary.nearest.missing.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm">{summary.nearest.name} needs</p>
              <ul className="flex flex-wrap gap-1.5" aria-label="Missing">
                {summary.nearest.missing.slice(0, 6).map((name) => (
                  <li
                    key={name}
                    className="make-tape inline-flex min-h-6 items-center px-2.5 py-1 font-mono text-xs"
                    data-kind="missing"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className={captionClass}>
            Counting {makeable.counted.length}{" "}
            {makeable.counted.length === 1 ? "item" : "items"} on hand, and the
            pantry staples
          </p>
        </>
      )}
      <p className="text-sm">{open}</p>
    </section>
  );
}

// --- the sheet ---------------------------------------------------------------------

export function RunSheet({
  data,
  images,
  editor,
  shelf,
  onMode,
}: {
  data: PlanPageData;
  images: Record<string, ReactNode>;
  editor?: PlanEditor;
  shelf: Makeable;
  onMode: (mode: PlanMode) => void;
}) {
  const sheet = useMemo(() => buildPlanSheet(data.rows), [data.rows]);
  const made = useMadeTicks(data.slug);
  const mixed = useMixedTicks(data.slug);
  const go = (mode: PlanMode) => {
    onMode(mode);
    try {
      window.scrollTo({ top: 0 });
    } catch {
      /* A test browser without scrolling: the mode still changed. */
    }
  };
  return (
    <section
      aria-labelledby="run-sheet-heading"
      data-testid="plan-run-sheet"
      className="flex flex-col gap-7"
    >
      <h2 id="run-sheet-heading" className="sr-only">
        Run sheet
      </h2>
      <div className="flex flex-col gap-4 lg:flex-row-reverse lg:items-end lg:justify-between lg:gap-8 lg:border-b-2 lg:border-foreground lg:pb-6">
        <Stats sheet={sheet} />
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button
            type="button"
            className="min-h-11 w-full lg:w-auto"
            onClick={() => go("cook")}
          >
            <Play aria-hidden className="size-4" />
            Start the bake
          </Button>
          {editor && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => go("plan")}
            >
              <Pencil aria-hidden className="size-4" />
              Edit the sheet
            </Button>
          )}
        </div>
      </div>

      <div className="hidden flex-col gap-3 lg:flex">
        <SheetTable
          sheet={sheet}
          images={images}
          made={made.made}
          mixed={mixed.made}
          onMade={made.toggle}
          onMixed={mixed.toggle}
        />
        <p className={captionClass}>
          Chill, rest and bake times are read from each recipe&rsquo;s steps.
          One batch each, as the recipes give it; more sheets mean more batches.
        </p>
      </div>

      <DayBefore sheet={sheet} mixed={mixed.made} onMixed={mixed.toggle} />
      <BakingDay sheet={sheet} />

      <div className="grid items-start gap-8 lg:grid-cols-2">
        {editor &&
          (editor.shopping ? (
            <Docket summary={editor.shopping} />
          ) : (
            <ShoppingPanel slug={data.slug} editor={editor} />
          ))}
        <SheetShelf slug={data.slug} makeable={shelf} />
      </div>
    </section>
  );
}
