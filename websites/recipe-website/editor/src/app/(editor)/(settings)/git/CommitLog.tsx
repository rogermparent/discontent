"use client";

import { useState, useTransition, type ComponentType } from "react";
import {
  BookOpen,
  CalendarDays,
  FileText,
  GitMerge,
  Pencil,
  Star,
  Tag,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "@discontent/component-library/components/ui/button";
import { Skeleton } from "@discontent/component-library/components/ui/skeleton";
import { useHydrated, When } from "@/curator/time";
import {
  getCommitDiff,
  getCommitLogPage,
} from "../../../../../controller/actions/sync";
import {
  byDay,
  changeKind,
  dayHeading,
  directionWords,
  type ChangeKind,
  type Direction,
} from "../../../../../controller/sync/moved";
import type { CommitSummary } from "./types";

const KIND_ICONS: Record<ChangeKind, ComponentType<{ className?: string }>> = {
  recipe: BookOpen,
  tag: Tag,
  plan: CalendarDays,
  feature: Star,
  page: FileText,
  merge: GitMerge,
  other: Pencil,
};

function CommitLogItem({
  entry,
  direction,
  peer,
}: {
  entry: CommitSummary;
  direction?: Direction;
  peer?: string;
}) {
  const [open, setOpen] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const Icon = KIND_ICONS[changeKind(entry.message)];

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && diff === null) {
      startTransition(async () => {
        const result = await getCommitDiff(entry.hash);
        setDiff(result);
      });
    }
  }

  return (
    <div
      className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 py-2.5 sm:grid-cols-[2rem_minmax(0,1fr)_auto]"
      data-direction={direction}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground"
      >
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {/* The button's name is the title alone: the specs find it by it. */}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="min-h-6 cursor-pointer text-left text-[15px] leading-5 font-medium [overflow-wrap:anywhere] hover:underline"
          >
            {entry.title ?? entry.message}
          </button>
          {direction && peer && (
            <span
              className={clsx(
                "inline-flex items-center rounded-full border px-2 font-mono text-xs leading-5",
                direction === "in" && "border-info/50 text-info",
                direction === "unsent" && "border-warning/60 text-warning",
                direction === "out" && "text-muted-foreground",
              )}
            >
              {directionWords(direction, peer)}
            </span>
          )}
        </div>
        {open && (
          <div className="text-sm">
            <div className="my-1 font-bold">Commit Details</div>
            <ul>
              {entry.title && (
                <li>
                  <strong>Message</strong>: <span>{entry.message}</span>
                </li>
              )}
              <li>
                <strong>Author</strong>: <span>{entry.author_name}</span>
              </li>
              <li>
                <strong>Date</strong>: <span>{entry.date}</span>
              </li>
            </ul>
            <div className="mt-1 font-bold">Diff</div>
            {pending && diff === null ? (
              <Skeleton className="my-1 h-24 w-full" />
            ) : (
              <pre className="my-1 overflow-x-auto rounded bg-muted p-2 text-xs">
                {diff}
              </pre>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>
        )}
      </div>
      <span className="col-start-2 font-mono text-xs text-muted-foreground sm:col-start-3 sm:pt-1 sm:text-right">
        <When epoch={Date.parse(entry.date)} timeOnly />
      </span>
    </div>
  );
}

/**
 * What moved between them (48d, B): the history, newest first, by day,
 * each change with where it was made and where it went (`moved.ts`). A
 * change opens to its details and diff, loaded when first opened.
 */
export function CommitLog({
  initialCommits,
  initialHasMore,
  initialDirections = {},
  peer,
  now,
}: {
  initialCommits: CommitSummary[];
  initialHasMore: boolean;
  initialDirections?: Record<string, Direction>;
  peer?: string;
  /** The server's clock (epoch ms), so "Today" agrees on hydration. */
  now: number;
}) {
  const [commits, setCommits] = useState(initialCommits);
  const [directions, setDirections] = useState(initialDirections);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pending, startTransition] = useTransition();
  const local = useHydrated();

  function loadMore() {
    startTransition(async () => {
      const page = await getCommitLogPage(commits.length);
      setCommits((current) => [...current, ...page.commits]);
      setDirections((current) => ({ ...current, ...page.directions }));
      setHasMore(page.hasMore);
    });
  }

  if (commits.length === 0) {
    return <p className="text-sm text-muted-foreground">No commits yet</p>;
  }

  /* The page's read time: the same "today" on the server and in the browser. */
  const today = new Date(now);
  return (
    <div className="flex flex-col">
      {byDay(commits, local).map(({ day, commits: dayCommits }, index) => (
        /*
         * A group, not a region: commits out of date order (clock skew
         * between machines, a merged history) can make one day two runs,
         * and two regions with one name is axe's landmark-unique.
         */
        <div
          key={`${day}:${index}`}
          role="group"
          aria-label={dayHeading(day, today, local)}
        >
          <p className="flex items-baseline gap-2.5 border-b pt-3 pb-1.5 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
            <span className="text-foreground" data-testid="commit-day">
              {dayHeading(day, today, local)}
            </span>
            {dayCommits.length > 1 && (
              <span className="tracking-normal normal-case">
                {dayCommits.length} changes
              </span>
            )}
          </p>
          <ul className="flex flex-col divide-y">
            {dayCommits.map((entry) => (
              <li key={entry.hash}>
                <CommitLogItem
                  entry={entry}
                  direction={directions[entry.hash]}
                  peer={peer}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {hasMore && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3 self-start"
          disabled={pending}
          onClick={loadMore}
        >
          {pending ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
