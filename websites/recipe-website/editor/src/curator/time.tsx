"use client";

import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

/** False on the server and while hydrating, true once React owns the page. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/**
 * When something happened. The server (the Pi, whose zone is not the
 * reader's) and the first client render say it the same fixed way, in UTC
 * ("Oct 21, 14:05 UTC"), so hydration matches; once mounted it is redrawn
 * in the reader's own zone and locale — the homepage's server-day-then-
 * browser-day order (42f). `timeOnly` drops the date ("14:05 UTC").
 */
export function whenText(
  epoch: number,
  local: boolean,
  { timeOnly = false }: { timeOnly?: boolean } = {},
): string {
  const date = new Date(epoch);
  const day = timeOnly ? {} : ({ month: "short", day: "numeric" } as const);
  if (local) {
    return date.toLocaleString(undefined, {
      ...day,
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return `${date.toLocaleString("en-US", {
    ...day,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  })} UTC`;
}

/** A `<time>`: UTC from the server, the reader's zone once hydrated. */
export function When({
  epoch,
  timeOnly,
}: {
  epoch: number;
  timeOnly?: boolean;
}) {
  const local = useHydrated();
  return (
    <time dateTime={new Date(epoch).toISOString()}>
      {whenText(epoch, local, { timeOnly })}
    </time>
  );
}
