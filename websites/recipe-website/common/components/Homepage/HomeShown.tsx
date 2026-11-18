"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  homepageShown,
  type HomepageShown,
  type ShownFeature,
} from "../../controller/homepageComingUp";
import { parseDayKey } from "../../util/holidays";
import { useToday } from "./useToday";

const HomeShownContext = createContext<HomepageShown | null>(null);

/**
 * What each homepage section shows on the reader's day (47h,
 * `homepageShown`): a recipe once on the page, the earliest section
 * winning. One answer for the season, the featured list and New this week,
 * worked out once here on the browser's day — the server's day for the
 * first render, as everywhere on the page — so the three islands cannot
 * disagree.
 */
export function HomeShownProvider({
  serverDay,
  season,
  featured,
  featuredLimit,
  planGroup,
  fresh,
  freshLimit,
  children,
}: {
  serverDay: string;
  season: Array<{ slug: string; rule?: string; picks: string[] }>;
  featured: ShownFeature[];
  featuredLimit: number;
  planGroup?: string;
  fresh: string[];
  freshLimit: number;
  children: ReactNode;
}) {
  const today = useToday(null) ?? serverDay;
  const shown = useMemo(
    () =>
      homepageShown({
        today: parseDayKey(today),
        season,
        featured,
        featuredLimit,
        ...(planGroup ? { planGroup } : {}),
        fresh,
        freshLimit,
      }),
    [today, season, featured, featuredLimit, planGroup, fresh, freshLimit],
  );
  return (
    <HomeShownContext.Provider value={shown}>
      {children}
    </HomeShownContext.Provider>
  );
}

/** The day's answer; `null` outside a `HomeShownProvider`. */
export function useHomeShown(): HomepageShown | null {
  return useContext(HomeShownContext);
}
