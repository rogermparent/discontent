"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  CalendarDays,
  CookingPot,
  Ellipsis,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@discontent/component-library/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@discontent/component-library/components/ui/alert-dialog";
import { cn } from "@discontent/component-library/lib/utils";
import {
  countdownLabel,
  dayKey,
  daysBetween,
  formatDayShort,
  nextOccurrence,
  parseDayKey,
} from "../../util/holidays";
import { groupKindLabel } from "../../util/groupKindLabel";
import { groupCountLabel } from "../../util/groupCountLabel";
import type { PlanHoliday, PlanPageData } from "../../util/planPage";
import { groupSearchHref, tagSearchHref } from "../SearchForm/queryLanguage";
import { useToday } from "../Homepage/useToday";
import type { PlanMode } from "./planState";
import type { PlanEditor } from "./types";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** "25 Dec" — the eyebrow's date: day and month (the canvas). */
function dayMonth(key: string): string {
  return formatDayShort(parseDayKey(key)).split(" ").slice(1).join(" ");
}

/**
 * "for Christmas, 25 Dec · in 68 days": the date and countdown wait for the
 * browser's day (42-De2), so the export's HTML never prints a stale number.
 */
export function PlanHolidayWhen({ holiday }: { holiday: PlanHoliday }) {
  const today = useToday(null);
  const next =
    today && holiday.rule
      ? nextOccurrence(holiday.rule, parseDayKey(today))
      : undefined;
  return (
    <>
      {" · "}for{" "}
      <Link
        href={`/holidays/${holiday.slug}`}
        className={cn("underline-offset-4 hover:underline", FOCUS)}
      >
        {holiday.label}
      </Link>
      {next && today ? (
        <>
          , <time dateTime={dayKey(next)}>{dayMonth(dayKey(next))}</time>
          {" · "}
          <span className="text-primary" data-testid="plan-countdown">
            {countdownLabel(daysBetween(parseDayKey(today), next))}
          </span>
        </>
      ) : null}
    </>
  );
}

/** "14 Oct 2026", from a stored date, in UTC (the same on server and client). */
function createdOn(date: number): { key: string; text: string } {
  const d = new Date(date);
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { key, text: `${dayMonth(key)} ${d.getUTCFullYear()}` };
}

/** Plan / Cook: the page's two jobs (canvas B; /shopping's switch). */
export function PlanModeSwitch({
  mode,
  onChange,
  className,
}: {
  mode: PlanMode;
  onChange: (mode: PlanMode) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Mode"
      data-testid="plan-mode"
      className={cn(
        "grid shrink-0 auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-muted p-[3px] print:hidden",
        className,
      )}
    >
      {(["plan", "cook"] as const).map((each) => {
        const Icon = each === "plan" ? CalendarDays : CookingPot;
        return (
          <button
            key={each}
            type="button"
            aria-pressed={mode === each}
            onClick={() => onChange(each)}
            className={cn(
              "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3.5 text-sm",
              mode === each
                ? "bg-background font-semibold text-foreground shadow-sm"
                : "font-medium text-muted-foreground hover:text-foreground",
              FOCUS,
            )}
          >
            <Icon aria-hidden className="size-4" />
            {each === "plan" ? "Plan" : "Cook"}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The More menu (signed in only): Edit, Feature and Delete, which asks
 * first. Delete's confirm sits outside the popover, so closing the menu
 * never takes the question away with it.
 */
function MoreMenu({ slug, editor }: { slug: string; editor: PlanEditor }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const item = cn(
    "flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
    FOCUS,
  );
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="print:hidden">
            <Ellipsis aria-hidden className="size-4" />
            More
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 p-1.5">
          <ul className="flex flex-col" aria-label="More for this plan">
            <li>
              <Link href={`/group/${slug}/edit`} className={item}>
                <Pencil aria-hidden className="size-4" />
                Edit
              </Link>
            </li>
            <li>
              {/* The form's toggle opens on Group with this one selected (22g). */}
              <Link
                href={`/featured-recipe/new?group=${slug}`}
                className={item}
              >
                <Star aria-hidden className="size-4" />
                Feature
              </Link>
            </li>
            <li>
              <button
                type="button"
                className={cn(item, "text-destructive")}
                onClick={() => {
                  setOpen(false);
                  setConfirm(true);
                }}
              >
                <Trash2 aria-hidden className="size-4" />
                Delete
              </button>
            </li>
          </ul>
        </PopoverContent>
      </Popover>
      <form
        id="delete-group-form"
        action={editor.deleteAction}
        className="contents"
      />
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this plan?</AlertDialogTitle>
            <AlertDialogDescription>
              The recipes themselves are not deleted — only the plan. If it is
              featured, it comes off the homepage strip too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                type="submit"
                form="delete-group-form"
                variant="destructive"
              >
                Delete group
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * The plan's head (canvas B): the Plans eyebrow with the holiday it is for
 * and its countdown, the title, what it is, its tags and counts, then the
 * mode switch and — signed in — More.
 */
export function PlanHead({
  data,
  description,
  media,
  mode,
  onMode,
  editor,
}: {
  data: PlanPageData;
  description?: ReactNode;
  media?: ReactNode;
  mode: PlanMode;
  onMode: (mode: PlanMode) => void;
  editor?: PlanEditor;
}) {
  const recipes = data.rows.filter(
    (row) => row.item.group === undefined,
  ).length;
  const groups = data.rows.length - recipes;
  const created = createdOn(data.date);
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-2">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          <Link
            href="/groups"
            className={cn(
              "text-primary underline-offset-4 hover:underline",
              FOCUS,
            )}
          >
            Plans
          </Link>
          {" · "}
          <span data-testid="group-kind">{groupKindLabel(data.kind)}</span>
          {data.holiday && <PlanHolidayWhen holiday={data.holiday} />}
        </p>
        <h1 className="text-[1.625rem] leading-8 font-bold tracking-[-0.01em] sm:text-3xl sm:leading-9">
          {data.name}
        </h1>
        {description && <div className="max-w-[680px]">{description}</div>}
        {media}
        <div className="flex flex-wrap items-center gap-1.5">
          {data.tags && data.tags.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-1.5 print:hidden"
              aria-label="Tags"
            >
              {data.tags.map((tag) => (
                <Badge key={tag} asChild variant="secondary">
                  <Link href={tagSearchHref(tag)}>{tag}</Link>
                </Badge>
              ))}
            </div>
          )}
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {data.tags?.length ? "· " : ""}
            {groupCountLabel(recipes, groups)} · created{" "}
            <time dateTime={created.key}>{created.text}</time>
          </span>
          {data.rows.length > 0 && (
            <Link
              href={groupSearchHref(data.slug)}
              data-testid="group-search-link"
              className={cn(
                "font-mono text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground print:hidden",
                FOCUS,
              )}
            >
              Search within this plan
            </Link>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 print:hidden">
        <PlanModeSwitch mode={mode} onChange={onMode} />
        {editor && <MoreMenu slug={data.slug} editor={editor} />}
      </div>
    </div>
  );
}
