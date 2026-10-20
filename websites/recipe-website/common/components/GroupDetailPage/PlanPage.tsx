"use client";

import { useMemo } from "react";
import { hasRunSheet } from "../../util/planSheet";
import { CookList } from "./CookList";
import { PlanHead } from "./PlanHead";
import { PlanList } from "./PlanList";
import {
  MakeAheadPanel,
  ShelfPanel,
  ShoppingPanel,
  useMakeAhead,
  usePlanShelf,
} from "./PlanRail";
import { usePlanMode } from "./planState";
import { RunSheet } from "./RunSheet";
import type { PlanPageProps } from "./types";

/**
 * A meal plan (43p1, canvas B "Plan at home, cook through it"): **Plan** —
 * the ordered list you edit, with a rail that answers "what do I need?"
 * (the shopping list, your shelf, what to make ahead) — and **Cook**, which
 * walks through it one recipe at a time. A wide screen opens on Plan, a
 * phone on Cook; the choice is kept per browser.
 *
 * The **Run sheet** (43p2, canvas C) is a third mode between them, offered
 * when the plan has one — a recipe whose steps give a bake or a chill
 * (`hasRunSheet`, Dp2-1): the same rows and `planTimes` facts as a baking
 * day's production schedule. It is never the default; a link's
 * `?mode=sheet` or this browser's last choice opens it.
 */
export function PlanPage({
  data,
  description,
  media,
  appearsIn,
  images,
  editor,
  second,
  serverMode,
}: PlanPageProps) {
  const sheet = useMemo(() => hasRunSheet(data.rows), [data.rows]);
  const [mode, setMode] = usePlanMode(serverMode, sheet);
  const shelf = usePlanShelf(data.slug, second);
  const makeAhead = useMakeAhead(data.rows);
  return (
    <div
      className="flex flex-col gap-6 pt-4 pb-8 sm:pt-7 sm:pb-12"
      data-plan-mode={mode}
    >
      <PlanHead
        data={data}
        description={description}
        media={media}
        mode={mode}
        onMode={setMode}
        sheet={sheet}
        editor={editor}
      />
      {mode === "plan" ? (
        <div className="flex flex-wrap items-start gap-8">
          <PlanList
            slug={data.slug}
            rows={data.rows}
            images={images}
            editor={editor}
          />
          <aside
            aria-label="What this plan needs"
            className="flex max-w-full min-w-0 flex-[1_1_340px] flex-col gap-4 lg:max-w-[360px]"
          >
            {editor && <ShoppingPanel slug={data.slug} editor={editor} />}
            <ShelfPanel slug={data.slug} makeable={shelf} />
            <MakeAheadPanel summary={makeAhead} />
          </aside>
        </div>
      ) : mode === "sheet" ? (
        <RunSheet
          data={data}
          images={images}
          editor={editor}
          shelf={shelf}
          onMode={setMode}
        />
      ) : (
        <div className="w-full max-w-xl">
          <CookList
            slug={data.slug}
            rows={data.rows}
            images={images}
            editor={editor}
            shelf={shelf}
            makeAhead={makeAhead}
          />
        </div>
      )}
      {appearsIn}
    </div>
  );
}

export default PlanPage;
