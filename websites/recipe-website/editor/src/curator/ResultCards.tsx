"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import {
  AddRecipeToList,
  type AddToList,
  type CreateList,
} from "recipe-website-common/components/ShoppingPage/AddToShopping";
import type { ShoppingListSummary } from "recipe-website-common/util/shoppingLists";
import { siteOf } from "recipe-editor/controller/agent/conversation";
import type { IntentOutcome } from "recipe-editor/controller/agent/intents";
import type { MineOutcome } from "recipe-editor/controller/agent/intents/mine";
import type { OnlineOutcome } from "recipe-editor/controller/agent/intents/online";
import type { PlanOutcome } from "recipe-editor/controller/agent/intents/plan";
import type {
  CuratorReview,
  CuratorReviewCall,
} from "recipe-editor/controller/agent/review";
import type { LinkKnown } from "./links";
import { detailLine, postReview } from "./ReviewPanel";
import { HeadsUpCallout } from "./RunParts";

/** What the mine cards' "Add to shopping list" needs (50d's picker). */
export interface CuratorShopping {
  add: AddToList;
  createList?: CreateList;
  lists?: ShoppingListSummary[];
}

/** The held call a card applies: an online pick's import, the plan's create. */
function importCallFor(
  review: CuratorReview | undefined,
  url: string,
): CuratorReviewCall | undefined {
  return review?.calls.find((call) => {
    if (call.tool !== "recipe_import") return false;
    const input = call.input as { url?: unknown } | undefined;
    return call.held.url === url || input?.url === url;
  });
}

function planCallFor(
  review: CuratorReview | undefined,
  outcome: PlanOutcome,
): CuratorReviewCall | undefined {
  const creates = (review?.calls ?? []).filter(
    (call) => call.tool === "group_create",
  );
  return (
    creates.find((call) => {
      const input = call.input as { group?: { slug?: unknown } } | undefined;
      return input?.group?.slug === outcome.slug;
    }) ?? (creates.length === 1 ? creates[0] : undefined)
  );
}

/**
 * The held calls the cards apply (51d), so the run's review panel shows only
 * the others (none, for a plan's own run).
 */
export function cardCallIds(
  outcome: IntentOutcome,
  review: CuratorReview | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (!review) return ids;
  if (outcome.kind === "online") {
    for (const item of outcome.proposed) {
      const call = importCallFor(review, item.url);
      if (call) ids.add(call.id);
    }
  } else if (outcome.kind === "plan") {
    const call = planCallFor(review, outcome);
    if (call) ids.add(call.id);
  }
  return ids;
}

type Tone = "good" | "warn" | "bad" | "plain" | "done";

/** A small marked label: its colour is the border, its words the ink. */
function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      data-testid="curator-chip"
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 text-xs leading-5 font-semibold",
        tone === "good" && "border-success",
        tone === "warn" && "border-warning",
        tone === "bad" && "border-destructive",
        tone === "plain" && "border-border text-muted-foreground",
        tone === "done" &&
          "border-transparent bg-secondary text-secondary-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** "suggested by qwen3.5:9b": a model's change, marked (Roger's rule). */
function SuggestedBy({ model }: { model: string }) {
  return (
    <span
      data-testid="curator-suggested"
      className="rounded-full bg-accent px-2 text-xs leading-6 text-accent-foreground"
    >
      suggested by {model}
    </span>
  );
}

function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

const card =
  "flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-card p-3.5";

/**
 * One call decided at a time through the review API (48b's): apply or
 * skip, the review as it now stands handed up, and focus moved to the
 * card's state line (its buttons are gone).
 */
function useDecide(
  id: string,
  onReviewed: (review: CuratorReview) => void,
): {
  busy?: string;
  errors: Record<string, string>;
  decide: (call: string, apply: boolean, focusId: string) => Promise<void>;
} {
  const [busy, setBusy] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const decide = async (call: string, apply: boolean, focusId: string) => {
    setBusy(call);
    setErrors(({ [call]: _gone, ...rest }) => rest);
    const answer = await postReview(id, [{ call, apply }]);
    setBusy(undefined);
    if ("error" in answer) {
      setErrors((before) => ({ ...before, [call]: answer.error }));
      return;
    }
    onReviewed(answer.review);
    requestAnimationFrame(() => document.getElementById(focusId)?.focus());
  };
  return { ...(busy ? { busy } : {}), errors, decide };
}

/** How a held call stands, in words, on its card. */
function decidedWords(
  call: CuratorReviewCall,
  applied: string,
): { tone: Tone; words: string } | undefined {
  switch (call.state) {
    case "applied":
      return { tone: "done", words: applied };
    case "discarded":
      return { tone: "plain", words: "Skipped" };
    case "failed":
      return { tone: "bad", words: "Failed" };
    case "expired":
      return { tone: "plain", words: "Expired" };
    default:
      return undefined;
  }
}

/** A card's state line and its two buttons: Import / Skip, Approve / Skip. */
function HeldActions({
  call,
  name,
  applyWords,
  appliedWords,
  opened,
  live,
  loaded,
  decider,
  stateId,
}: {
  call: CuratorReviewCall | undefined;
  name: string;
  applyWords: string;
  appliedWords: string;
  /** Where the applied change is ("Open it"). */
  opened?: { href: string; words: string };
  live: boolean;
  /** The review has been read (a card with no call then holds nothing). */
  loaded: boolean;
  decider: ReturnType<typeof useDecide>;
  stateId: string;
}) {
  const error = call ? decider.errors[call.id] : undefined;
  return (
    <>
      <p
        id={stateId}
        tabIndex={-1}
        data-testid="curator-card-state"
        data-state={call?.state ?? "none"}
        className="text-sm empty:hidden"
      >
        {call?.state === "applied" ? (
          <>
            <span className="font-semibold">{appliedWords}.</span>{" "}
            {opened ? (
              <Link href={opened.href} className="underline underline-offset-2">
                {opened.words}
              </Link>
            ) : null}
          </>
        ) : call?.state === "discarded" ? (
          <span className="text-muted-foreground">
            Skipped by you — nothing written.
          </span>
        ) : call?.state === "failed" ? (
          <span>
            <span className="font-semibold">Failed</span>
            {call.error ? `: ${call.error}` : ""}
          </span>
        ) : call?.state === "expired" ? (
          <span className="text-muted-foreground">
            Expired — its run was pruned before it was reviewed; nothing
            written.
          </span>
        ) : !call ? (
          <span className="text-muted-foreground">
            {live
              ? ""
              : loaded
                ? "Not held for review."
                : "Reading what it holds…"}
          </span>
        ) : null}
      </p>
      {error && (
        <p role="alert" className="border-l-2 border-destructive pl-2 text-sm">
          {error}
        </p>
      )}
      {call?.state === "pending" && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            className="min-h-9"
            disabled={live || decider.busy !== undefined}
            aria-label={`${applyWords} ${name}`}
            onClick={() => void decider.decide(call.id, true, stateId)}
          >
            {decider.busy === call.id ? "Saving…" : applyWords}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-9"
            disabled={live || decider.busy !== undefined}
            aria-label={`Skip ${name}`}
            onClick={() => void decider.decide(call.id, false, stateId)}
          >
            Skip
          </Button>
        </div>
      )}
    </>
  );
}

/** A web page as the card names it: its site and path, opening in a tab. */
function PageLink({ url, name }: { url: string; name: string }) {
  let shown = url;
  try {
    const parsed = new URL(url);
    shown = `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    /* As written. */
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={`${name} on ${siteOf(url) ?? "its site"} (opens in a new tab)`}
      className="inline-flex min-h-6 items-center gap-1 font-mono text-xs break-all text-muted-foreground underline-offset-2 hover:underline"
    >
      {shown}
      <ExternalLink aria-hidden className="size-3 shrink-0" />
    </a>
  );
}

function YourRecipe({ slug, name }: { slug: string; name: string }) {
  return (
    <Link href={`/recipe/${slug}`} className="underline underline-offset-2">
      {name}
    </Link>
  );
}

/**
 * online (51d, D2/D3): a card per held import — New, its page, the model's
 * reason, Import / Skip — then "Close to yours" (marked, not held, not
 * counted: the import form if you want one anyway), "Already yours" and
 * "You have".
 */
function OnlineResults({
  id,
  outcome,
  review,
  onReviewed,
  model,
  live,
}: {
  id: string;
  outcome: OnlineOutcome;
  review?: CuratorReview;
  onReviewed: (review: CuratorReview) => void;
  model: string;
  live: boolean;
}) {
  const decider = useDecide(id, onReviewed);
  const prefix = useId();
  const calls = outcome.proposed.map((item) => importCallFor(review, item.url));
  const decided = calls.filter(
    (call) => call && call.state !== "pending",
  ).length;
  const short = outcome.proposed.length < outcome.count;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="curator-online">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <GroupHeading>
          {outcome.proposed.length === 0
            ? `No new “${outcome.subject}” recipes`
            : `${short ? `${outcome.proposed.length} of ${outcome.count}` : outcome.proposed.length} new, held for your OK · ${decided} decided`}
        </GroupHeading>
        {outcome.proposed.length > 0 && <SuggestedBy model={model} />}
      </div>
      {outcome.proposed.length > 0 && (
        <ul className="flex flex-col gap-2.5" aria-label="New recipes, held">
          {outcome.proposed.map((item, index) => {
            const call = calls[index];
            const state = call ? decidedWords(call, "Imported") : undefined;
            const slug = call?.held.slug ?? item.slug;
            const detail = call ? detailLine(call) : undefined;
            return (
              <li
                key={item.url}
                data-testid="curator-online-card"
                data-state={call?.state ?? "none"}
                className={cn(
                  card,
                  call && call.state !== "pending" && "opacity-80",
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display font-semibold [overflow-wrap:anywhere]">
                    {item.name}
                  </p>
                  {state ? (
                    <Chip tone={state.tone}>{state.words}</Chip>
                  ) : (
                    <Chip tone="good">New</Chip>
                  )}
                </div>
                <PageLink url={item.url} name={item.name} />
                {item.why && (
                  <p className="text-sm text-muted-foreground">{item.why}</p>
                )}
                {detail && (
                  <p className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {detail}
                  </p>
                )}
                <HeldActions
                  call={call}
                  name={item.name}
                  applyWords="Import"
                  appliedWords="Imported"
                  {...(slug
                    ? { opened: { href: `/recipe/${slug}`, words: "Open it" } }
                    : {})}
                  live={live}
                  loaded={review !== undefined}
                  decider={decider}
                  stateId={`${prefix}-state-${index}`}
                />
              </li>
            );
          })}
        </ul>
      )}
      {outcome.close.length > 0 && (
        <>
          <GroupHeading>Close to yours · not counted</GroupHeading>
          <ul className="flex flex-col gap-2.5" aria-label="Close to yours">
            {outcome.close.slice(0, 5).map((item) => (
              <li
                key={item.url}
                data-testid="curator-close-card"
                className={card}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display font-semibold [overflow-wrap:anywhere]">
                    {item.name}
                  </p>
                  <Chip tone="warn">Close to yours</Chip>
                </div>
                <PageLink url={item.url} name={item.name} />
                <p className="text-sm text-muted-foreground">
                  Like your <YourRecipe {...item.like} />. Not held, and not
                  counted toward the {outcome.count}.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="min-h-9"
                  >
                    <Link
                      href={`/new-recipe?import=${encodeURIComponent(item.url)}`}
                      aria-label={`Import ${item.name} anyway`}
                    >
                      Import it anyway
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {outcome.had.length > 0 && (
        <p className="text-sm" data-testid="curator-had">
          <span className="font-semibold">Already yours: </span>
          {outcome.had.slice(0, 5).map((item, index) => (
            <span key={item.url}>
              {index > 0 ? ", " : ""}
              <YourRecipe slug={item.slug} name={item.name ?? item.slug} />
            </span>
          ))}
          .
        </p>
      )}
      {(outcome.yours?.length ?? 0) > 0 && (
        <p className="text-sm" data-testid="curator-you-have">
          <span className="font-semibold">You have: </span>
          {outcome.yours?.slice(0, 5).map((item, index) => (
            <span key={item.slug}>
              {index > 0 ? ", " : ""}
              <YourRecipe {...item} />
            </span>
          ))}
          {(outcome.yours?.length ?? 0) > 5 ? ", …" : ""}.
        </p>
      )}
    </div>
  );
}

/** A recipe of yours as a mine card: its verdict, why, Open, Add to list. */
function MineCard({
  slug,
  name,
  why,
  tone,
  verdict,
  shopping,
}: {
  slug: string;
  name: string;
  why?: string;
  tone: Tone;
  verdict: string;
  shopping?: CuratorShopping;
}) {
  return (
    <li data-testid="curator-mine-card" data-slug={slug} className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display font-semibold [overflow-wrap:anywhere]">
          {name}
        </p>
        <Chip tone={tone}>{verdict}</Chip>
      </div>
      {why && <p className="text-sm text-muted-foreground">{why}</p>}
      <div className="flex flex-wrap items-start gap-2 pt-1">
        <Button asChild size="sm" variant="outline" className="min-h-8">
          <Link href={`/recipe/${slug}`} aria-label={`Open ${name}`}>
            Open
          </Link>
        </Button>
        {shopping && (
          <AddRecipeToList
            recipe={slug}
            name={name}
            add={shopping.add}
            {...(shopping.createList
              ? { createList: shopping.createList }
              : {})}
            {...(shopping.lists ? { lists: shopping.lists } : {})}
            label="Add to shopping list"
          />
        )}
      </div>
    </li>
  );
}

/** How many near misses the cards show, as the answer does (51b's). */
const NEAR_MISSES = 5;

/**
 * mine (51d, D9): the judge's Fits, Maybe and "Close, but no" — each card
 * with its why, Open, and "Add to shopping list" (50d's picker). Nothing is
 * held: the run only read.
 */
function MineResults({
  outcome,
  shopping,
}: {
  outcome: MineOutcome;
  shopping?: CuratorShopping;
}) {
  const reasons = outcome.reasons ?? {};
  const cards = (slugs: string[], tone: Tone, verdict: string) =>
    slugs.map((slug) => (
      <MineCard
        key={slug}
        slug={slug}
        name={reasons[slug]?.name ?? slug}
        {...(reasons[slug]?.why ? { why: reasons[slug].why } : {})}
        tone={tone}
        verdict={verdict}
        {...(shopping ? { shopping } : {})}
      />
    ));
  const checked = outcome.checked;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="curator-mine">
      <GroupHeading>
        {outcome.fit.length > 0
          ? `${outcome.fit.length} that fit`
          : "None clearly fits"}
        {checked !== undefined ? ` · read ${checked}` : ""}
      </GroupHeading>
      {outcome.fit.length > 0 && (
        <ul className="flex flex-col gap-2.5" aria-label="Fits">
          {cards(outcome.fit, "good", "Fits")}
        </ul>
      )}
      {outcome.maybe.length > 0 && (
        <>
          <GroupHeading>Maybe</GroupHeading>
          <ul className="flex flex-col gap-2.5" aria-label="Maybe">
            {cards(outcome.maybe, "warn", "Maybe")}
          </ul>
        </>
      )}
      {outcome.no.length > 0 && (
        <>
          <GroupHeading>Close, but no</GroupHeading>
          <ul className="flex flex-col gap-2.5" aria-label="Close, but no">
            {cards(outcome.no.slice(0, NEAR_MISSES), "bad", "No")}
          </ul>
        </>
      )}
      {outcome.unjudged.length > 0 && (
        <p className="text-sm" data-testid="curator-unjudged">
          <span className="font-semibold">Not judged: </span>
          {outcome.unjudged.slice(0, 10).map((slug, index) => (
            <span key={slug}>
              {index > 0 ? ", " : ""}
              <YourRecipe slug={slug} name={reasons[slug]?.name ?? slug} />
            </span>
          ))}
          .
        </p>
      )}
    </div>
  );
}

/** "×1/4 · 2 servings · it makes 8", or the yield that isn't servings. */
function itemNotes(item: PlanOutcome["items"][number]): string[] {
  const notes: string[] = [];
  if (item.how === "named") notes.push("named in your ask");
  if (item.servings) {
    notes.push(`${item.servings} serving${item.servings === 1 ? "" : "s"}`);
    if (item.yields) notes.push(`it makes ${item.yields}`);
    else if (item.yieldText) {
      notes.push(
        `its yield, “${item.yieldText}”, isn't in servings: not scaled`,
      );
    } else if (!item.scale) notes.push("its yield doesn't say how many");
  }
  return notes;
}

/** "Thursday, November 25, 2027", from the plan's date. */
function planDate(date: string | undefined): string | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return undefined;
  const day = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  return day.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * plan (51d): the held meal plan as one card — its name, tags and date,
 * each dish with its label, scale and notes, the plan's heads-up (a dish
 * it couldn't find, one several recipes answer), and Approve / Skip.
 */
function PlanResult({
  id,
  outcome,
  review,
  onReviewed,
  model,
  live,
  headsUps,
  known,
}: {
  id: string;
  outcome: PlanOutcome;
  review?: CuratorReview;
  onReviewed: (review: CuratorReview) => void;
  model: string;
  live: boolean;
  headsUps: string[];
  known: LinkKnown;
}) {
  const decider = useDecide(id, onReviewed);
  const stateId = useId();
  const call = planCallFor(review, outcome);
  const state = call ? decidedWords(call, "Saved") : undefined;
  const date = planDate(outcome.date);
  if (!outcome.proposed) {
    return (
      <div
        className="flex min-w-0 flex-col gap-3"
        data-testid="curator-plan-result"
      >
        <GroupHeading>No plan to hold</GroupHeading>
        <HeadsUpCallout notes={headsUps} model={model} known={known} />
      </div>
    );
  }
  return (
    <div
      className="flex min-w-0 flex-col gap-3"
      data-testid="curator-plan-result"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <GroupHeading>A meal plan, held for your OK</GroupHeading>
        <SuggestedBy model={model} />
      </div>
      <article
        data-testid="curator-plan-card"
        data-state={call?.state ?? "none"}
        aria-labelledby={`${stateId}-name`}
        className={cn(card, "gap-3 p-4")}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p
            id={`${stateId}-name`}
            className="font-display text-lg font-bold [overflow-wrap:anywhere]"
          >
            {outcome.name}
          </p>
          {state ? (
            <Chip tone={state.tone}>{state.words}</Chip>
          ) : (
            <Chip tone="good">Held</Chip>
          )}
        </div>
        {(outcome.tags.length > 0 || date) && (
          <p className="text-sm text-muted-foreground">
            {outcome.tags.length > 0 ? `Tagged ${outcome.tags.join(", ")}` : ""}
            {outcome.tags.length > 0 && date ? " · " : ""}
            {date ? `for ${date}` : ""}
          </p>
        )}
        <ol
          className="flex flex-col divide-y divide-border"
          aria-label="Its dishes"
        >
          {outcome.items.map((item) => {
            const notes = itemNotes(item);
            return (
              <li
                key={`${item.label}:${item.slug}`}
                data-testid="curator-plan-item"
                data-slug={item.slug}
                className="grid grid-cols-[minmax(4.5rem,auto)_minmax(0,1fr)] gap-x-3 py-2 first:pt-0 last:pb-0"
              >
                <span className="font-mono text-xs leading-6 uppercase tracking-wider text-muted-foreground">
                  {item.label}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm">
                    <Link
                      href={`/recipe/${item.slug}`}
                      className="font-semibold underline-offset-2 hover:underline"
                    >
                      {item.name ?? item.slug}
                    </Link>
                    {item.scale ? (
                      <span
                        data-testid="curator-plan-scale"
                        className="ml-1.5 font-mono text-xs"
                      >
                        ×{item.scale}
                      </span>
                    ) : null}
                  </span>
                  {notes.length > 0 && (
                    <span
                      data-testid="curator-plan-notes"
                      className="text-xs text-muted-foreground"
                    >
                      {notes.join(" · ")}
                    </span>
                  )}
                  {item.why && (
                    <span className="text-xs text-muted-foreground">
                      {item.why}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        <HeadsUpCallout notes={headsUps} model={model} known={known} />
        <HeldActions
          call={call}
          name={outcome.name}
          applyWords="Approve"
          appliedWords="Saved"
          {...(outcome.slug
            ? {
                opened: {
                  href: `/group/${outcome.slug}`,
                  words: "Open the plan",
                },
              }
            : {})}
          live={live}
          loaded={review !== undefined}
          decider={decider}
          stateId={stateId}
        />
      </article>
    </div>
  );
}

/**
 * The result of an intent's plan as cards (51d), per outcome kind: online's
 * held imports, mine's judged groups, plan's held plan. Every change a card
 * makes goes through the review API, one call at a time, marked as the
 * model's — nothing applies on its own.
 */
export function ResultCards({
  id,
  outcome,
  review,
  onReviewed,
  model,
  live,
  headsUps,
  known,
  shopping,
}: {
  id: string;
  outcome: IntentOutcome;
  review?: CuratorReview;
  onReviewed: (review: CuratorReview) => void;
  model: string;
  live: boolean;
  /** The answer's heads-ups (the plan's go on its card). */
  headsUps: string[];
  known: LinkKnown;
  shopping?: CuratorShopping;
}) {
  return (
    <section
      aria-label="Results"
      data-testid="curator-results"
      data-kind={outcome.kind}
      className="flex min-w-0 flex-col gap-4"
    >
      {outcome.kind !== "plan" && (
        <HeadsUpCallout notes={headsUps} model={model} known={known} />
      )}
      {outcome.kind === "online" ? (
        <OnlineResults
          id={id}
          outcome={outcome}
          {...(review ? { review } : {})}
          onReviewed={onReviewed}
          model={model}
          live={live}
        />
      ) : outcome.kind === "mine" ? (
        <MineResults outcome={outcome} {...(shopping ? { shopping } : {})} />
      ) : (
        <PlanResult
          id={id}
          outcome={outcome}
          {...(review ? { review } : {})}
          onReviewed={onReviewed}
          model={model}
          live={live}
          headsUps={headsUps}
          known={known}
        />
      )}
    </section>
  );
}
