"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { cn } from "@discontent/component-library/lib/utils";
import type { LiveJobCounts } from "recipe-editor/controller/jobs/views";

/** How often the chip reads while something runs, and while all is idle. */
export const LIVE_CHIP_POLL_MS = 5_000;
export const LIVE_CHIP_IDLE_POLL_MS = 20_000;

/*
 * One reader for every chip on the page (the masthead draws one for the
 * desktop row and one for the phone's): the first subscriber starts it,
 * the last one stops it, and nothing is read while the tab is hidden.
 */
const NONE: LiveJobCounts = { running: 0, queued: 0 };
let counts: LiveJobCounts = NONE;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let stopped = true;
/* Signed out or refused (401/403): asking again would only repeat it. */
let refused = false;

function emit(next: LiveJobCounts) {
  if (next.running === counts.running && next.queued === counts.queued) return;
  counts = next;
  for (const listener of listeners) listener();
}

async function read() {
  timer = undefined;
  if (stopped || refused) return;
  if (!document.hidden) {
    try {
      const response = await fetch("/api/jobs/live", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        refused = true;
        emit(NONE);
        return;
      }
      if (response.ok) {
        const body = (await response.json()) as Partial<LiveJobCounts>;
        emit({
          running: Number(body.running) || 0,
          queued: Number(body.queued) || 0,
        });
      }
    } catch {
      /* A failed read keeps what was shown; the next one tries again. */
    }
  }
  if (stopped) return;
  timer = setTimeout(
    read,
    counts.running + counts.queued > 0
      ? LIVE_CHIP_POLL_MS
      : LIVE_CHIP_IDLE_POLL_MS,
  );
}

function onVisible() {
  if (document.hidden || stopped || refused) return;
  if (timer) clearTimeout(timer);
  void read();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    stopped = false;
    document.addEventListener("visibilitychange", onVisible);
    void read();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearTimeout(timer);
      timer = undefined;
    }
  };
}

const current = () => counts;
const serverCounts = () => NONE;

/**
 * The masthead's live chip (48c, canvas B): "2 running · 1 queued" while a
 * job runs or waits, linking to `/jobs`; nothing at all while every job is
 * idle, so the masthead is as it was. Signed in only (the root layout
 * passes it to an owner). `compact` is the phone's "2 · 1", named in full
 * for a screen reader.
 */
export function JobsLiveChip({ compact = false }: { compact?: boolean }) {
  const { running, queued } = useSyncExternalStore(
    subscribe,
    current,
    serverCounts,
  );
  const here = usePathname() === "/jobs";
  if (running + queued === 0) return null;
  const words = [
    running > 0 ? `${running} running` : undefined,
    queued > 0 ? `${queued} queued` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href="/jobs"
      data-testid="jobs-live-chip"
      aria-current={here ? "page" : undefined}
      aria-label={compact ? `Jobs: ${words.replace(" · ", ", ")}` : undefined}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-primary/55 bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent/80",
        compact && "px-2.5",
      )}
    >
      <span
        aria-hidden
        className="size-2 rounded-full bg-primary shadow-[0_0_0_3px] shadow-primary/25 motion-safe:animate-pulse"
      />
      {compact
        ? [running, queued].filter((count) => count > 0).join(" · ")
        : words}
    </Link>
  );
}
