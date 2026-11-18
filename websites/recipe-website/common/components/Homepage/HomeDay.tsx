"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  homepageDay,
  type DayFeast,
  type HomepageDay,
} from "../../controller/homepageDay";
import type { ShownFeature } from "../../controller/homepageComingUp";
import { parseDayKey } from "../../util/holidays";
import { useToday } from "./useToday";

/** The day's answer and what every island draws it with. */
export interface HomeDayValue {
  day: HomepageDay;
  /** The reader's day, `YYYY-MM-DD` — the server's until the browser's is known. */
  today: string;
  /**
   * Whether `today` is the browser's own yet. Countdowns and dates wait for
   * it, so the static export never prints a number from its build day.
   */
  known: boolean;
  /** Small pictures by recipe slug, rendered on the server. */
  thumbs: Record<string, ReactNode>;
  /** Larger pictures (course cards, the warm drink), by recipe slug. */
  cards: Record<string, ReactNode>;
  /** Recipe names by slug, for the holidays' recipes. */
  names: Record<string, string>;
}

const HomeDayContext = createContext<HomeDayValue | null>(null);

/**
 * The homepage's day (48e, `homepageDay`): Tonight's turn, the next holiday
 * and the ones after it, and which recipe shows where — a recipe once on the
 * page. Worked out once here on the browser's day (the server's for the
 * first render, as everywhere on the page), so the islands cannot disagree.
 */
export function HomeDayProvider({
  serverDay,
  quick,
  warm,
  warmHolidays,
  feasts,
  featured,
  featuredLimit,
  planGroup,
  fresh,
  freshLimit,
  thumbs,
  cards,
  names,
  children,
}: {
  serverDay: string;
  quick: string[];
  warm: string[];
  warmHolidays: Array<{ slug: string; rule: string }>;
  feasts: DayFeast[];
  featured: ShownFeature[];
  featuredLimit: number;
  planGroup?: string;
  fresh: string[];
  freshLimit: number;
  thumbs: Record<string, ReactNode>;
  cards: Record<string, ReactNode>;
  names: Record<string, string>;
  children: ReactNode;
}) {
  const browserDay = useToday(null);
  const today = browserDay ?? serverDay;
  const day = useMemo(
    () =>
      homepageDay({
        today: parseDayKey(today),
        quick,
        warm,
        warmHolidays,
        feasts,
        featured,
        featuredLimit,
        ...(planGroup ? { planGroup } : {}),
        fresh,
        freshLimit,
      }),
    [
      today,
      quick,
      warm,
      warmHolidays,
      feasts,
      featured,
      featuredLimit,
      planGroup,
      fresh,
      freshLimit,
    ],
  );
  const value = useMemo(
    () => ({
      day,
      today,
      known: browserDay !== null,
      thumbs,
      cards,
      names,
    }),
    [day, today, browserDay, thumbs, cards, names],
  );
  return (
    <HomeDayContext.Provider value={value}>{children}</HomeDayContext.Provider>
  );
}

/** The day's answer; `null` outside a `HomeDayProvider`. */
export function useHomeDay(): HomeDayValue | null {
  return useContext(HomeDayContext);
}
