"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  CookingPot,
  Play,
  ShoppingCart,
} from "lucide-react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import {
  aheadNotes,
  cookCaption,
  formatTotalTime,
  hasLabels,
  labelRuns,
  madeLine,
  scaleBadge,
  tickKeys,
  yieldLine,
  type PlanRowView,
} from "../../util/planPage";
import { formatBake, formatOven } from "../../util/planTimes";
import type { MakeAhead } from "../../util/planTimes";
import type { Makeable } from "../MakePage/useMakeable";
import { COOK_VIEW_PARAM } from "../../util/cookViewParam";
import {
  LabelHeading,
  Mosaic,
  SubPlanList,
  Thumb,
  recipeHref,
} from "./PlanList";
import {
  MakeAheadBody,
  ShoppingPanel,
  makeAheadCaption,
  planMakeHref,
  shelfCaption,
} from "./PlanRail";
import { useMadeCount, useMadeTicks } from "./planState";
import type { PlanEditor } from "./types";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** The recipe page with its cook view open, at the row's scale. */
function cookViewHref(slug: string, scale?: string): string {
  const href = recipeHref(slug, scale);
  return `${href}${href.includes("?") ? "&" : "?"}${COOK_VIEW_PARAM}=1`;
}

function rowName(row: PlanRowView): string {
  return row.recipe?.name ?? row.group?.name ?? row.missing ?? "this row";
}

/** A made tick: a 44 px target on a phone (WCAG 2.5.8 asks 24). */
function Tick({
  done,
  name,
  onToggle,
}: {
  done: boolean;
  name: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={done}
      aria-label={done ? `Unmark ${name}` : `Mark ${name} made`}
      onClick={onToggle}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-md",
        FOCUS,
      )}
    >
      <span
        className={cn(
          "inline-flex size-[22px] items-center justify-center rounded-sm border-[1.5px]",
          done
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input bg-background",
        )}
      >
        {done && <Check aria-hidden className="size-3.5" />}
      </span>
    </button>
  );
}

/** "2 made" on a sub-plan row: the child plan's own ticks, in this browser. */
function SubPlanMade({ slug }: { slug: string }) {
  const made = useMadeCount(slug);
  return made > 0 ? <> · {made} made</> : null;
}

/** One row of the cook list: tick, picture, name, a short caption. */
function CookRow({
  row,
  number,
  done,
  images,
  onToggle,
  highlight,
}: {
  row: PlanRowView;
  number: number;
  done: boolean;
  images: Record<string, ReactNode>;
  onToggle?: () => void;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const scale = row.recipe ? row.item.scale : undefined;
  const badge = scaleBadge(scale);
  return (
    <li
      data-testid="group-item"
      data-made={done ? "true" : undefined}
      className={cn(
        "flex flex-col border-b border-border py-2",
        highlight && "-mx-2 rounded-md bg-accent px-2 text-accent-foreground",
      )}
    >
      <div className="grid grid-cols-[44px_48px_minmax(0,1fr)_auto] items-center gap-2.5">
        {onToggle ? (
          <Tick done={done} name={rowName(row)} onToggle={onToggle} />
        ) : (
          <span />
        )}
        {row.group ? (
          <Mosaic
            row={row}
            images={images}
            className={cn("size-12", done && "opacity-55")}
          />
        ) : (
          <Thumb
            node={row.recipe ? images[row.recipe.slug] : undefined}
            className={cn("size-12", done && "opacity-55")}
          />
        )}
        <div className="min-w-0">
          {row.missing ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="group-item-missing"
            >
              {row.missing}
            </p>
          ) : (
            <Link
              href={
                row.group
                  ? `/group/${row.group.slug}`
                  : recipeHref(row.recipe!.slug, scale)
              }
              className={cn(
                "font-display text-[0.9375rem] leading-5 font-semibold tracking-[-0.01em] underline-offset-4 hover:underline",
                done && "text-muted-foreground line-through",
                FOCUS,
              )}
              {...(row.group ? { "data-testid": "group-item-group" } : {})}
            >
              {rowName(row)}
            </Link>
          )}
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {row.recipe ? (
              [
                String(number),
                done
                  ? yieldLine(row.recipe, scale)
                  : cookCaption(row.recipe, scale),
              ]
                .filter(Boolean)
                .join(" · ")
            ) : row.group ? (
              <>
                {number} · plan · {row.group.recipes.length}{" "}
                {row.group.recipes.length === 1 ? "recipe" : "recipes"}
                <SubPlanMade slug={row.group.slug} />
              </>
            ) : (
              String(number)
            )}
          </p>
        </div>
        {row.group ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-expanded={open}
            aria-label={
              open ? "Hide the plan's recipes" : "Show the plan's recipes"
            }
            onClick={() => setOpen((current) => !current)}
          >
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 transition-transform",
                open && "rotate-180",
              )}
            />
          </Button>
        ) : badge ? (
          <Badge variant="secondary" className="font-mono tabular-nums">
            <span className="sr-only">Scale </span>
            {badge}
          </Badge>
        ) : (
          <span />
        )}
      </div>
      {row.group && open && (
        <SubPlanList row={row} className="mt-1.5 ml-[54px]" />
      )}
    </li>
  );
}

/** Up next (canvas B): the first row not made, big, with its way in. */
function UpNext({
  row,
  number,
  total,
  images,
  onMade,
}: {
  row: PlanRowView;
  number: number;
  total: number;
  images: Record<string, ReactNode>;
  onMade: () => void;
}) {
  const recipe = row.recipe;
  const scale = recipe ? row.item.scale : undefined;
  const notes = recipe ? aheadNotes(recipe.times) : [];
  const facts = recipe
    ? [
        recipe.totalTime ? formatTotalTime(recipe.totalTime) : undefined,
        yieldLine(recipe, scale),
        recipe.times.bake
          ? `${formatBake(recipe.times.bake.value)}${recipe.times.oven ? ` at ${formatOven(recipe.times.oven.value)}` : ""}`
          : undefined,
      ].filter(Boolean)
    : [];
  return (
    <section
      aria-label="Up next"
      data-testid="plan-up-next"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 text-card-foreground"
    >
      <p className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Up next · {number} of {total}
      </p>
      {recipe ? (
        <Thumb
          node={images[recipe.slug]}
          className="aspect-[16/10] w-full rounded-lg [&_span]:text-5xl"
        />
      ) : row.group ? (
        <Mosaic
          row={row}
          images={images}
          className="aspect-[16/10] w-full rounded-lg"
        />
      ) : null}
      <div className="flex flex-col gap-0.5">
        <Link
          href={
            recipe
              ? recipeHref(recipe.slug, scale)
              : `/group/${row.group!.slug}`
          }
          className={cn(
            "font-display text-xl leading-[1.625rem] font-semibold tracking-[-0.02em] underline-offset-4 hover:underline",
            FOCUS,
          )}
        >
          {rowName(row)}
        </Link>
        {facts.length > 0 && (
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {facts.join(" · ")}
          </p>
        )}
      </div>
      {notes.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-md bg-accent px-3 py-2.5 text-sm text-accent-foreground">
          <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-1">
            {notes.map(({ sentence, step }) => (
              <p key={sentence}>
                Step {step}: &ldquo;{sentence}&rdquo;
              </p>
            ))}
          </div>
        </div>
      )}
      {recipe ? (
        <Button asChild className="min-h-11 w-full">
          <Link href={cookViewHref(recipe.slug, scale)}>
            <Play aria-hidden className="size-4" />
            Open in cook view
          </Link>
        </Button>
      ) : (
        <Button asChild className="min-h-11 w-full">
          <Link href={`/group/${row.group!.slug}?mode=cook`}>
            <Play aria-hidden className="size-4" />
            Cook through the plan
          </Link>
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full"
        onClick={onMade}
      >
        <Check aria-hidden className="size-4" />
        Mark made
      </Button>
    </section>
  );
}

/** A line under the list: a link, or a fold that opens in place. */
function LineRow({
  icon,
  label,
  caption,
  href,
  children,
}: {
  icon: ReactNode;
  label: string;
  caption: string;
  href?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const inner = (
    <>
      <span className="inline-flex items-center gap-2.5">
        {icon}
        {label}
      </span>
      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-normal text-muted-foreground">
        {caption}
        {children && (
          <ChevronDown
            aria-hidden
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        )}
      </span>
    </>
  );
  const rowClass = cn(
    "flex min-h-12 w-full items-center justify-between gap-3 border-b border-border px-1 text-left text-[0.9375rem] font-medium",
    FOCUS,
  );
  if (href && !children) {
    return (
      <Link href={href} className={rowClass}>
        {inner}
      </Link>
    );
  }
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        className={rowClass}
        onClick={() => setOpen((current) => !current)}
      >
        {inner}
      </button>
      {open && <div className="flex flex-col gap-3 py-3">{children}</div>}
    </div>
  );
}

/**
 * Cook mode (canvas B's phone): how far through the plan this browser is,
 * the next thing to make with its way in, then what's left and what's made
 * — or, for a plan with labels (a week), the rows under their day headings
 * with the ticks inline. Ticks stay in this browser (D5).
 */
export function CookList({
  slug,
  rows,
  images,
  editor,
  shelf,
  makeAhead,
}: {
  slug: string;
  rows: PlanRowView[];
  images: Record<string, ReactNode>;
  editor?: PlanEditor;
  shelf: Makeable;
  makeAhead: MakeAhead;
}) {
  const { made, toggle, clear } = useMadeTicks(slug);
  const keys = tickKeys(rows.map((row) => row.item));
  const countable = rows
    .map((row, index) => ({ row, index, key: keys[index] }))
    .filter(({ row }) => !row.missing);
  const total = countable.length;
  const done = countable.filter(({ key }) => made.has(key)).length;
  const next = countable.find(({ key }) => !made.has(key));
  const byLabel = hasLabels(rows);
  const subPlans = rows.some((row) => row.group);

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span
            className="font-mono text-sm font-medium tabular-nums"
            data-testid="plan-made-count"
          >
            {madeLine(done, total)}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {subPlans ? "the sub-plan counts as one · " : ""}ticks stay on this
            phone
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={madeLine(done, total)}
        >
          <i
            className="block h-full rounded-full bg-primary"
            style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
          />
        </div>
        {done > 0 && (
          <button
            type="button"
            onClick={clear}
            className={cn(
              "inline-flex min-h-6 items-center self-start font-mono text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground",
              FOCUS,
            )}
          >
            Start over
          </button>
        )}
      </div>

      {byLabel ? (
        <section aria-label="The plan, by label">
          {/* The labels are h3s (`LabelHeading`): an h2 first keeps the
           * page's outline in order (43p1 review). */}
          <h2 className="sr-only">The plan, by label</h2>
          {labelRuns(rows).map((run, r) => {
            const nextHere = run.rows.some(
              ({ index }) => index === next?.index,
            );
            return (
              <div key={`${r}-${run.label ?? ""}`}>
                {run.label ? (
                  <LabelHeading
                    label={run.label}
                    aside={
                      nextHere ? (
                        <span className="ml-auto text-xs tracking-[0.08em] text-primary">
                          up next
                        </span>
                      ) : undefined
                    }
                  />
                ) : null}
                <ol>
                  {run.rows.map(({ row, index }) => (
                    <CookRow
                      key={`${index}-${keys[index]}`}
                      row={row}
                      number={index + 1}
                      done={made.has(keys[index])}
                      images={images}
                      highlight={index === next?.index}
                      onToggle={
                        row.missing ? undefined : () => toggle(keys[index])
                      }
                    />
                  ))}
                </ol>
                {nextHere && next?.row.recipe && (
                  <Button asChild className="mt-2.5 min-h-11 w-full">
                    <Link
                      href={cookViewHref(
                        next.row.recipe.slug,
                        next.row.item.scale,
                      )}
                    >
                      <Play aria-hidden className="size-4" />
                      Cook {next.row.recipe.name}
                      {scaleBadge(next.row.item.scale)
                        ? ` at ${scaleBadge(next.row.item.scale)}`
                        : ""}
                    </Link>
                  </Button>
                )}
              </div>
            );
          })}
        </section>
      ) : (
        <>
          {next ? (
            <UpNext
              row={next.row}
              number={next.index + 1}
              total={rows.length}
              images={images}
              onMade={() => toggle(next.key)}
            />
          ) : total > 0 ? (
            <p
              className="rounded-xl border border-border bg-card p-3.5 text-sm"
              role="status"
            >
              Everything on the plan is made.
            </p>
          ) : (
            <p className="text-muted-foreground" data-testid="group-empty">
              This plan has nothing in it yet.
            </p>
          )}
          {countable.some(
            ({ key, index }) => !made.has(key) && index !== next?.index,
          ) || rows.some((row) => row.missing) ? (
            <section aria-label="Still to make" className="flex flex-col">
              <h2 className="pb-1 font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Still to make
              </h2>
              <ol>
                {rows.map((row, index) =>
                  index === next?.index || made.has(keys[index]) ? null : (
                    <CookRow
                      key={`${index}-${keys[index]}`}
                      row={row}
                      number={index + 1}
                      done={false}
                      images={images}
                      onToggle={
                        row.missing ? undefined : () => toggle(keys[index])
                      }
                    />
                  ),
                )}
              </ol>
            </section>
          ) : null}
          {done > 0 && (
            <section aria-label="Made" className="flex flex-col">
              <h2 className="pb-1 font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Made
              </h2>
              <ol>
                {rows.map((row, index) =>
                  made.has(keys[index]) && !row.missing ? (
                    <CookRow
                      key={`${index}-${keys[index]}`}
                      row={row}
                      number={index + 1}
                      done
                      images={images}
                      onToggle={() => toggle(keys[index])}
                    />
                  ) : null,
                )}
              </ol>
            </section>
          )}
        </>
      )}

      <div className="flex flex-col">
        {editor &&
          (editor.shopping ? (
            <LineRow
              icon={<ShoppingCart aria-hidden className="size-5" />}
              label="Shopping list"
              caption={`${editor.shopping.lines} ${editor.shopping.lines === 1 ? "line" : "lines"} · ${editor.shopping.ticked} ticked`}
              href="/shopping"
            />
          ) : (
            <LineRow
              icon={<ShoppingCart aria-hidden className="size-5" />}
              label="Shopping list"
              caption="not on it"
            >
              <ShoppingPanel slug={slug} editor={editor} />
            </LineRow>
          ))}
        <LineRow
          icon={<CookingPot aria-hidden className="size-5" />}
          label="From your shelf"
          caption={shelfCaption(shelf)}
          href={planMakeHref(slug)}
        />
        <LineRow
          icon={<Clock aria-hidden className="size-5" />}
          label="Make ahead"
          caption={makeAheadCaption(makeAhead)}
        >
          <MakeAheadBody summary={makeAhead} />
        </LineRow>
      </div>
    </div>
  );
}
