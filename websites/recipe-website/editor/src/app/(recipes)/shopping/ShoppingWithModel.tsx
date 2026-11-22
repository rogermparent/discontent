"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingPage,
  type ShoppingAskProgressProps,
  type ShoppingAskSurface,
  type ShoppingListsSurface,
  type ShoppingListState,
  type ShoppingPageActions,
  type ShoppingTidySurface,
} from "recipe-website-common/components/ShoppingPage";
import {
  isShoppingTidyResult,
  type TidyModels,
  type TidyRunView,
} from "recipe-website-common/util/shoppingTidy";
import {
  decideShoppingTidy,
  latestShoppingTidy,
  shoppingTidyResultAction,
  startShoppingTidy,
} from "recipe-editor/controller/actions/shoppingTidy";
import { isShoppingAskResult } from "recipe-website-common/util/shoppingAsk";
import type { ShoppingListSummary } from "recipe-website-common/util/shoppingLists";
import { UNSTORED_KEEP_MS } from "recipe-editor/controller/jobs/unstored";
import type { JobRecord } from "recipe-editor/controller/jobs/views";
import {
  shoppingAskResultAction,
  startShoppingAsk,
} from "recipe-editor/controller/actions/shoppingAsk";
import ImportProgress, {
  type ProgressWords,
} from "../new-recipe/ImportProgress";

/** Who the page's asks go to, by label ("local model qwen3:8b"). */
export interface ShoppingModelsShown {
  local?: string;
  claude?: string;
}

function words(model: string, task: "revise" | "find"): ProgressWords {
  return {
    noun: task === "find" ? "Look for more" : "Ask",
    running: `Asking ${model}…`,
    done:
      task === "find"
        ? "Done: what it found is below, marked."
        : "Done: the suggestion is below, marked.",
  };
}

/**
 * One ask's live panel (49b), as Edit with AI's: the job's steps from
 * `/api/jobs/<id>` while it runs, or — a job with no record (38-Tb5) — its
 * outcome by `shoppingAskResultAction`'s bounded long-poll. Hands the page
 * the result once.
 */
function AskProgress({
  job,
  stored,
  task,
  model,
  settled,
}: ShoppingAskProgressProps) {
  const done = useRef(false);
  /* A recordless job's end, for its panel (it follows nothing). */
  const [ended, setEnded] = useState<"done" | "failed" | "cancelled">();
  const settle = useRef(settled);
  useEffect(() => {
    settle.current = settled;
  }, [settled]);
  const finish = (outcome: Parameters<typeof settled>[0]) => {
    if (done.current) return;
    done.current = true;
    settle.current(outcome);
  };
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  useEffect(() => {
    if (stored) return;
    let stopped = false;
    const deadline = Date.now() + UNSTORED_KEEP_MS;
    const pause = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    void (async () => {
      let failures = 0;
      while (!stopped) {
        let answer: Awaited<ReturnType<typeof shoppingAskResultAction>>;
        try {
          answer = await shoppingAskResultAction(job);
          failures = 0;
        } catch (error) {
          failures += 1;
          if (failures >= 3 || Date.now() > deadline) {
            if (stopped) return;
            setEnded("failed");
            finishRef.current({ message: String(error) });
            return;
          }
          await pause(2_000);
          continue;
        }
        if (stopped) return;
        if (answer.pending && Date.now() < deadline) continue;
        setEnded(
          answer.result ? "done" : answer.cancelled ? "cancelled" : "failed",
        );
        finishRef.current({
          ...(answer.result ? { result: answer.result } : {}),
          ...(answer.cancelled ? { cancelled: true } : {}),
          ...(answer.message ? { message: answer.message } : {}),
        });
        return;
      }
    })();
    return () => {
      stopped = true;
    };
  }, [job, stored]);

  return (
    <ImportProgress
      job={job}
      words={words(model, task)}
      onSettled={(meta: JobRecord) => {
        if (meta.status === "done" && isShoppingAskResult(meta.result)) {
          finish({ result: meta.result });
        } else if (meta.status === "cancelled") {
          finish({ cancelled: true });
        } else {
          finish({
            message:
              meta.status === "done"
                ? "That job isn't an ask about the shopping list."
                : (meta.error?.message ?? "The ask did not finish."),
          });
        }
      }}
      {...(stored ? {} : { unfollowed: ended ? { status: ended } : {} })}
    />
  );
}

/**
 * 50b: a tidy run's outcome — the job store's view (`GET
 * /api/shopping/tidy?job=`) once a second and a half while it is live; a
 * job with no record (38-Tb5), by the action's bounded long-poll.
 */
async function followTidy(
  job: string,
): ReturnType<ShoppingTidySurface["follow"]> {
  const response = await fetch(
    `/api/shopping/tidy?job=${encodeURIComponent(job)}`,
    { cache: "no-store" },
  ).catch(() => undefined);
  if (!response?.ok) return shoppingTidyResultAction(job);
  const view = (await response.json()) as {
    live?: boolean;
    status?: string;
    result?: unknown;
    error?: { message?: string };
  };
  if (view.live) {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    return { pending: true };
  }
  return isShoppingTidyResult(view.result)
    ? { result: view.result }
    : {
        message:
          view.error?.message ??
          `The run ended ${view.status ?? "without an answer"}.`,
      };
}

/**
 * `/shopping` with the editor's model (49b): the shared page, and — where
 * this editor has a model (Edit with AI's: the local one, else the Claude
 * API) — the asks: a note on a proposal or merged row, and "Look for more
 * with the model". Nothing is written until the person accepts.
 */
export default function ShoppingWithModel({
  initial,
  actions,
  patchUrl,
  models,
  tidyModels,
  tidyRun,
  list,
  listNamed,
  lists,
  mealPlans,
  listActions,
}: {
  initial: ShoppingListState;
  actions: ShoppingPageActions;
  patchUrl: string;
  models: ShoppingModelsShown;
  /** 50b: the models a tidy run may pick (none: no "Tidy with the model"). */
  tidyModels?: TidyModels;
  /** 50b: the latest tidy run, as the list reads it now. */
  tidyRun?: TidyRunView;
  /** 50d: the list's id — every ask and tidy run is about this list. */
  list: string;
  /** 50d: the address named the list (`?list=`). */
  listNamed: boolean;
  /** 50d: every list not deleted, for the switcher. */
  lists: ShoppingListSummary[];
  /** 50d: the meal plans "New from a meal plan…" offers. */
  mealPlans: { slug: string; name: string }[];
  /** 50d: the list actions (`createSavedShoppingList`, `editSavedShoppingList`). */
  listActions: Pick<ShoppingListsSurface, "create" | "edit">;
}) {
  const model = models.local ?? models.claude;
  const ask = useMemo<ShoppingAskSurface | undefined>(
    () =>
      model
        ? {
            model,
            ...(models.local && models.claude ? { claude: models.claude } : {}),
            start: (input) => startShoppingAsk({ ...(input as object), list }),
            progress: (props) => <AskProgress key={props.job} {...props} />,
          }
        : undefined,
    [model, models.local, models.claude, list],
  );
  const tidy = useMemo<ShoppingTidySurface | undefined>(
    () =>
      tidyModels && tidyModels.models.length > 0
        ? {
            models: tidyModels,
            ...(tidyRun ? { initial: tidyRun } : {}),
            start: (input) => startShoppingTidy({ ...(input as object), list }),
            follow: (job) => followTidy(job),
            latest: () => latestShoppingTidy(list),
            decide: (id, action) => decideShoppingTidy(id, action, list),
          }
        : undefined,
    [tidyModels, tidyRun, list],
  );
  const surface = useMemo<ShoppingListsSurface>(
    () => ({
      lists,
      plans: mealPlans,
      create: listActions.create,
      edit: listActions.edit,
    }),
    [lists, mealPlans, listActions],
  );
  return (
    <ShoppingPage
      initial={initial}
      actions={actions}
      patchUrl={patchUrl}
      lists={surface}
      listNamed={listNamed}
      {...(ask ? { ask } : {})}
      {...(tidy ? { tidy } : {})}
    />
  );
}
