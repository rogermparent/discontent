"use client";

import { useState, useTransition } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Skeleton } from "@discontent/component-library/components/ui/skeleton";
import {
  getCommitDiff,
  getCommitLogPage,
} from "../../../../../controller/actions/sync";
import type { CommitSummary } from "./types";

function CommitLogItem({ entry }: { entry: CommitSummary }) {
  const [open, setOpen] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full text-left my-1 font-bold cursor-pointer"
      >
        {entry.message}
      </button>
      {open && (
        <div className="text-sm">
          <div className="font-bold my-1">Commit Details</div>
          <ul>
            <li>
              <strong>Author</strong>: <span>{entry.author_name}</span>
            </li>
            <li>
              <strong>Date</strong>: <span>{entry.date}</span>
            </li>
          </ul>
          <div className="font-bold mt-1">Diff</div>
          {pending && diff === null ? (
            <Skeleton className="w-full h-24 my-1" />
          ) : (
            <pre className="overflow-x-auto text-xs bg-muted p-2 rounded my-1">
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
  );
}

export function CommitLog({
  initialCommits,
  initialHasMore,
}: {
  initialCommits: CommitSummary[];
  initialHasMore: boolean;
}) {
  const [commits, setCommits] = useState(initialCommits);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    startTransition(async () => {
      const page = await getCommitLogPage(commits.length);
      setCommits((current) => [...current, ...page.commits]);
      setHasMore(page.hasMore);
    });
  }

  if (commits.length === 0) {
    return <p className="text-sm text-muted-foreground">No commits yet</p>;
  }

  return (
    <div>
      <ul className="border-t border-border">
        {commits.map((entry) => (
          <li key={entry.hash} className="border-b border-border py-1">
            <CommitLogItem entry={entry} />
          </li>
        ))}
      </ul>
      {hasMore && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={pending}
          onClick={loadMore}
        >
          {pending ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
