"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Checkbox } from "@discontent/component-library/components/ui/checkbox";
import { cn } from "@discontent/component-library/lib/utils";
import { missedParts } from "recipe-editor/controller/agent/changes";
import { siteOf } from "recipe-editor/controller/agent/conversation";
import type {
  CuratorReview,
  CuratorReviewCall,
  CuratorReviewRecipe,
} from "recipe-editor/controller/agent/review";
import { detailText } from "./links";
import { ReviewThumb } from "./RunParts";

/**
 * A review answer laid over the one shown (51d review 2): a decision is
 * final (Dd6), so a later answer that still says pending — a read or a Save
 * that left before another landed — never moves a decided call back.
 */
export function keepDecided(
  before: CuratorReview | undefined,
  next: CuratorReview,
): CuratorReview {
  if (!before) return next;
  const was = new Map(before.calls.map((call) => [call.id, call]));
  let kept = false;
  const calls = next.calls.map((call) => {
    const old = was.get(call.id);
    if (call.state !== "pending" || !old || old.state === "pending") {
      return call;
    }
    kept = true;
    return old;
  });
  return kept
    ? {
        ...next,
        calls,
        pending: calls.filter((call) => call.state === "pending").length,
      }
    : next;
}

/** The state update that lays `review` over what `id` shows. */
function laidOver(id: string, review: CuratorReview) {
  return (before: { id: string; review: CuratorReview } | undefined) => ({
    id,
    review: keepDecided(before?.id === id ? before.review : undefined, review),
  });
}

/**
 * `GET /api/agent/<id>/review`, read when `key` changes while `enabled`,
 * and again on `reload` (after a refused decision, 51d review 2). Every
 * answer goes through `keepDecided`.
 */
export function useReview(
  id: string | undefined,
  key: string,
  enabled: boolean,
): {
  review?: CuratorReview;
  set: (review: CuratorReview) => void;
  reload: () => void;
} {
  const [state, setState] = useState<{ id: string; review: CuratorReview }>();
  const [reads, setReads] = useState(0);
  useEffect(() => {
    if (!id || !enabled) return;
    const controller = new AbortController();
    fetch(`/api/agent/${encodeURIComponent(id)}/review`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) =>
        response.ok ? (response.json() as Promise<CuratorReview>) : undefined,
      )
      .then((review) => {
        if (review && !controller.signal.aborted)
          setState(laidOver(id, review));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [id, key, enabled, reads]);
  return {
    ...(state && state.id === id ? { review: state.review } : {}),
    set: (review) => {
      if (id) setState(laidOver(id, review));
    },
    reload: () => setReads((count) => count + 1),
  };
}

/**
 * `POST /api/agent/<id>/review` (48b): apply or skip held calls. The
 * review as it now stands, or the editor's own words for why not. 51d's
 * result cards decide one call at a time through it.
 */
export async function postReview(
  id: string,
  decisions: {
    call: string;
    apply: boolean;
    add?: string[];
    remove?: string[];
  }[],
): Promise<{ review: CuratorReview } | { error: string }> {
  try {
    const response = await fetch(
      `/api/agent/${encodeURIComponent(id)}/review`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decisions }),
      },
    );
    const body = (await response.json().catch(() => undefined)) as
      (CuratorReview & { error?: { message?: string } }) | undefined;
    if (!response.ok || !body?.calls) {
      return {
        error:
          body?.error?.message ?? `The editor answered ${response.status}.`,
      };
    }
    return { review: body };
  } catch (failure) {
    return {
      error: `Couldn't reach the editor: ${failure instanceof Error ? failure.message : String(failure)}`,
    };
  }
}

/** The recipes a held `term_assign` would change: not already tagged. */
function tagRows(call: CuratorReviewCall): CuratorReviewRecipe[] {
  return (call.recipes ?? []).filter((recipe) => !recipe.alreadyTagged);
}

/** The recipes a held `term_assign` takes the term off (48b review). */
function removesOf(call: CuratorReviewCall): string[] {
  const input = call.input as { remove?: unknown } | undefined;
  return Array.isArray(input?.remove)
    ? input.remove.filter((slug): slug is string => typeof slug === "string")
    : [];
}

function termOf(call: CuratorReviewCall): string {
  const input = call.input as { slug?: unknown } | undefined;
  return typeof input?.slug === "string" ? input.slug : "";
}

/** One held call's detail line, in words. */
export function detailLine(call: CuratorReviewCall): string | undefined {
  const input = (call.input ?? {}) as Record<string, unknown>;
  const held = call.held;
  switch (call.tool) {
    case "recipe_create":
    case "recipe_import": {
      const parts = [
        siteOf(held.url),
        held.slug ? `as /recipe/${held.slug}` : undefined,
        held.conflict ? "a recipe already has that address" : undefined,
        held.recipes?.length && held.recipes.length > 1
          ? held.recipes.map((recipe) => recipe.name).join(" · ")
          : undefined,
        /* 51b review 7: the approved import reads the notes the preview didn't. */
        held.notesOnApproval
          ? "its notes are read when you approve it"
          : undefined,
      ].filter(Boolean);
      return parts.length ? parts.join(" · ") : undefined;
    }
    case "recipe_update":
      return call.fields?.length
        ? `changes ${call.fields.join(", ")}`
        : undefined;
    case "recipe_import_list":
      return held.recipes?.length
        ? held.recipes.map((recipe) => recipe.name).join(" · ")
        : typeof input.url === "string"
          ? input.url
          : undefined;
    default:
      return undefined;
  }
}

const STATE_WORDS: Record<
  Exclude<CuratorReviewCall["state"], "pending">,
  string
> = {
  applied: "Saved",
  discarded: "Skipped by you — nothing written",
  failed: "Failed",
  expired:
    "Expired — its run was pruned before it was reviewed; nothing written",
};

function Decided({ call }: { call: CuratorReviewCall }) {
  if (call.state === "pending") return null;
  return (
    <p
      data-testid="curator-review-state"
      data-state={call.state}
      className={cn(
        "text-xs",
        call.state === "failed" ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <span className="font-semibold">{STATE_WORDS[call.state]}</span>
      {call.state === "failed" && call.error ? `: ${call.error}` : ""}
      {call.state === "applied" && call.appliedAdd
        ? ` (${call.appliedAdd.length} of ${(call.recipes ?? []).length})`
        : ""}
    </p>
  );
}

function CallInput({ call }: { call: CuratorReviewCall }) {
  return (
    <details className="text-xs">
      <summary className="inline-flex min-h-6 cursor-pointer items-center text-muted-foreground underline underline-offset-2">
        Show the call
      </summary>
      <p className="mt-1 font-mono text-muted-foreground">{call.tool}</p>
      <pre
        tabIndex={0}
        aria-label={`${call.phrase}: input`}
        className="mt-1 max-h-48 overflow-auto rounded border border-border bg-muted p-2 font-mono text-xs leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]"
      >
        {detailText(call.input)}
      </pre>
    </details>
  );
}

/** The tagging post-check (48a), moved into the review: what it left out. */
function Missed({ call }: { call: CuratorReviewCall }) {
  const parts = missedParts(call);
  if (!parts) return null;
  const missed = call.missed ?? [];
  const rest = (call.missedCount ?? 0) - missed.length;
  return (
    <div data-testid="curator-missed" className="text-sm">
      <p className="font-semibold">Check what it left out</p>
      <p data-testid="curator-missed-term">
        {parts.found && (
          <>
            {parts.found}
            {missed.length > 0 ? ": " : "."}
            {missed.map((recipe, index) => (
              <span key={recipe.slug}>
                {index > 0 ? ", " : ""}
                <Link
                  href={`/recipe/${recipe.slug}`}
                  className="underline underline-offset-2"
                >
                  {recipe.name ?? recipe.slug}
                </Link>
              </span>
            ))}
            {missed.length > 0 && (rest > 0 ? `, and ${rest} more.` : ".")}
          </>
        )}
        {parts.unseen && ` ${parts.unseen}.`}
      </p>
    </div>
  );
}

/**
 * "Review before it saves" (variant B, Db1–Db3): the run's held writes,
 * each ticked to start; a tagging change lists its recipes one by one, so
 * a wrong one can be unticked. Save applies the ticked ones exactly as the
 * model asked (narrowed, never widened), each as its own commit, and skips
 * the rest; Skip all skips everything. The model is not asked again.
 * Decided calls say how they went.
 */
export function ReviewPanel({
  id,
  review,
  model,
  onSaved,
  onFailed,
  blocked = false,
  onBusy,
}: {
  id: string;
  review: CuratorReview;
  /** Who suggested them, by name ("Claude Sonnet 5"). */
  model: string;
  onSaved: (review: CuratorReview) => void;
  /** A Save refused: read the review again (51d review 2). */
  onFailed?: () => void;
  /** A result card is saving: wait for it (51d review 2). */
  blocked?: boolean;
  /** This panel saving, or done. */
  onBusy?: (busy: boolean) => void;
}) {
  const pending = review.calls.filter((call) => call.state === "pending");
  /* Unticked calls, and unticked recipes of a tagging call ("call\0slug"). */
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [said, setSaid] = useState("");
  const statusRef = useRef<HTMLParagraphElement>(null);

  if (review.calls.length === 0) return null;

  const toggle = (key: string, on: boolean) =>
    setOff((before) => {
      const next = new Set(before);
      if (on) next.delete(key);
      else next.add(key);
      return next;
    });

  /** What Save would write: changes ticked (a tagging call's recipes each). */
  const tickedOf = (call: CuratorReviewCall): number => {
    if (call.tool === "term_assign" && call.recipes) {
      const removes =
        removesOf(call).length > 0 && !off.has(`${call.id}\0remove`);
      return (
        tagRows(call).filter((recipe) => !off.has(`${call.id}\0${recipe.slug}`))
          .length + (removes ? 1 : 0)
      );
    }
    return off.has(call.id) ? 0 : 1;
  };
  const totalOf = (call: CuratorReviewCall): number =>
    call.tool === "term_assign" && call.recipes
      ? tagRows(call).length + (removesOf(call).length > 0 ? 1 : 0)
      : 1;
  const ticked = pending.reduce((sum, call) => sum + tickedOf(call), 0);
  const total = pending.reduce((sum, call) => sum + totalOf(call), 0);

  const send = async (applyTicked: boolean) => {
    setSaving(true);
    onBusy?.(true);
    setError(undefined);
    const decisions = pending.map((call) => {
      if (!applyTicked) return { call: call.id, apply: false };
      if (call.tool === "term_assign" && call.recipes) {
        const add = tagRows(call)
          .filter((recipe) => !off.has(`${call.id}\0${recipe.slug}`))
          .map((recipe) => recipe.slug);
        const all = tagRows(call).length;
        const removes = removesOf(call).length > 0;
        const removeOn = removes && !off.has(`${call.id}\0remove`);
        if (add.length === 0 && !removeOn) {
          return { call: call.id, apply: false };
        }
        return {
          call: call.id,
          apply: true,
          ...(add.length !== all ? { add } : {}),
          ...(removes && !removeOn ? { remove: [] } : {}),
        };
      }
      return { call: call.id, apply: !off.has(call.id) };
    });
    try {
      const answer = await postReview(id, decisions);
      if ("error" in answer) {
        setError(answer.error);
        onFailed?.();
        return;
      }
      const body = answer.review;
      const decided = body.calls.filter((call) =>
        pending.some((before) => before.id === call.id),
      );
      const count = (state: CuratorReviewCall["state"]) =>
        decided.filter((call) => call.state === state).length;
      setSaid(
        [
          count("applied") ? `Saved ${count("applied")}` : "",
          count("discarded") ? `skipped ${count("discarded")}` : "",
          count("failed") ? `${count("failed")} failed` : "",
        ]
          .filter(Boolean)
          .join(", ")
          .replace(/^./, (letter) => letter.toUpperCase()) + ".",
      );
      onSaved(body);
      requestAnimationFrame(() => statusRef.current?.focus());
    } finally {
      setSaving(false);
      onBusy?.(false);
    }
  };

  return (
    <section
      aria-labelledby="curator-review-heading"
      data-testid="curator-review"
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4",
        pending.length > 0 ? "border-primary border-[1.5px]" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2
          id="curator-review-heading"
          className="font-display text-xl font-bold tracking-tight"
        >
          {pending.length > 0 ? "Review before it saves" : "Reviewed"}
        </h2>
        <span
          data-testid="curator-review-mark"
          className="rounded-full bg-accent px-2 text-xs leading-6 text-accent-foreground"
        >
          suggested by {model}
        </span>
        {pending.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {ticked} of {total} ticked
          </span>
        )}
      </div>
      {pending.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing is written until you save. Untick what doesn&apos;t belong.
        </p>
      )}

      <ol className="flex flex-col" aria-label="Held changes">
        {review.calls.map((call) => {
          const isPending = call.state === "pending";
          if (call.tool === "term_assign" && call.recipes) {
            const term = termOf(call);
            const rows = tagRows(call);
            const already = (call.recipes ?? []).filter(
              (recipe) => recipe.alreadyTagged,
            );
            return (
              <li
                key={call.id}
                data-testid="curator-review-call"
                data-tool={call.tool}
                data-state={call.state}
                className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0"
              >
                <p className="font-semibold">{call.phrase}</p>
                <Decided call={call} />
                <ul className="flex flex-col gap-2">
                  {rows.map((recipe) => {
                    const key = `${call.id}\0${recipe.slug}`;
                    const on = !off.has(key);
                    const applied = call.appliedAdd
                      ? call.appliedAdd.includes(recipe.slug)
                      : call.state === "applied";
                    return (
                      <li
                        key={recipe.slug}
                        data-testid="curator-review-recipe"
                        data-on={String(isPending ? on : applied)}
                        className={cn(
                          "grid grid-cols-[2.75rem_3rem_minmax(0,1fr)] items-center gap-x-3",
                          !isPending && "grid-cols-[3rem_minmax(0,1fr)]",
                        )}
                      >
                        {isPending && (
                          <label className="flex size-11 cursor-pointer items-center justify-center">
                            <Checkbox
                              checked={on}
                              onCheckedChange={(value) =>
                                toggle(key, value === true)
                              }
                              aria-label={`Tag ${recipe.name} ${term}`}
                            />
                          </label>
                        )}
                        <ReviewThumb
                          slug={recipe.slug}
                          name={recipe.name}
                          {...(recipe.image ? { image: recipe.image } : {})}
                          className={cn(isPending && !on && "opacity-50")}
                        />
                        <div className="flex min-w-0 flex-col gap-1">
                          {recipe.missing ? (
                            <p className="font-medium">
                              {recipe.name}{" "}
                              <span className="text-xs text-muted-foreground">
                                not a recipe yet — a held import or create may
                                make it
                              </span>
                            </p>
                          ) : (
                            <Link
                              href={`/recipe/${recipe.slug}`}
                              className={cn(
                                "font-display font-semibold underline-offset-2 hover:underline [overflow-wrap:anywhere]",
                                isPending && !on && "text-muted-foreground",
                              )}
                            >
                              {recipe.name}
                            </Link>
                          )}
                          <p className="flex flex-wrap items-center gap-1 text-xs">
                            {(recipe.tags ?? []).slice(0, 6).map((tag) => (
                              <span
                                key={tag}
                                className="rounded border border-border px-1.5 leading-5 text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                            {isPending && on ? (
                              <span className="rounded border border-primary px-1.5 leading-5 font-semibold">
                                + {term}
                              </span>
                            ) : isPending ? (
                              <span className="text-muted-foreground">
                                skipped by you — stays as it is
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {already.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Already tagged, no change:{" "}
                    {already.map((recipe) => recipe.name).join(" · ")}
                  </p>
                )}
                {removesOf(call).length > 0 && (
                  <div className="flex items-center gap-3 text-sm">
                    {isPending && (
                      <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
                        <Checkbox
                          checked={!off.has(`${call.id}\0remove`)}
                          onCheckedChange={(value) =>
                            toggle(`${call.id}\0remove`, value === true)
                          }
                          aria-label={`Untag ${removesOf(call).join(", ")} ${term}`}
                        />
                      </label>
                    )}
                    <p data-testid="curator-review-remove">
                      Untag{" "}
                      {removesOf(call).length === 1 ? "recipe" : "recipes"}{" "}
                      {term}: {removesOf(call).join(", ")}
                    </p>
                  </div>
                )}
                {isPending && <Missed call={call} />}
                <CallInput call={call} />
              </li>
            );
          }
          const on = !off.has(call.id);
          const detail = detailLine(call);
          const target = call.target;
          return (
            <li
              key={call.id}
              data-testid="curator-review-call"
              data-tool={call.tool}
              data-state={call.state}
              className={cn(
                "grid items-start gap-x-3 border-t border-border py-3 first:border-t-0 first:pt-0",
                isPending
                  ? "grid-cols-[2.75rem_3rem_minmax(0,1fr)]"
                  : "grid-cols-[3rem_minmax(0,1fr)]",
              )}
            >
              {isPending && (
                <label className="flex size-11 cursor-pointer items-center justify-center">
                  <Checkbox
                    checked={on}
                    onCheckedChange={(value) => toggle(call.id, value === true)}
                    aria-label={call.phrase}
                  />
                </label>
              )}
              <ReviewThumb
                slug={target?.slug ?? call.held.slug ?? call.id}
                name={target?.name ?? call.held.name ?? call.phrase}
                {...(target?.image ? { image: target.image } : {})}
                className={cn(isPending && !on && "opacity-50")}
              />
              <div className="flex min-w-0 flex-col gap-1">
                <p
                  className={cn(
                    "font-display font-semibold [overflow-wrap:anywhere]",
                    isPending && !on && "text-muted-foreground",
                  )}
                >
                  {call.phrase}
                </p>
                {detail && (
                  <p className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {detail}
                  </p>
                )}
                {isPending && !on && (
                  <p className="text-xs text-muted-foreground">
                    skipped by you — nothing is written
                  </p>
                )}
                <Decided call={call} />
                <CallInput call={call} />
              </div>
            </li>
          );
        })}
      </ol>

      <p
        ref={statusRef}
        tabIndex={-1}
        role="status"
        data-testid="curator-review-status"
        className="text-sm font-semibold empty:hidden"
      >
        {said}
      </p>
      {error && (
        <p role="alert" className="border-l-2 border-destructive pl-2 text-sm">
          {error}
        </p>
      )}
      {pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          {review.live ? (
            <p className="text-sm text-muted-foreground">
              It is still working: review once it ends.
            </p>
          ) : (
            <>
              <Button
                type="button"
                className="min-h-11"
                disabled={saving || blocked}
                onClick={() => void send(true)}
              >
                {saving
                  ? "Saving…"
                  : ticked === 0
                    ? "Skip them all"
                    : `Save ${ticked} ${ticked === 1 ? "change" : "changes"}`}
              </Button>
              {ticked > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  disabled={saving || blocked}
                  onClick={() => void send(false)}
                >
                  Skip all
                </Button>
              )}
              <span className="min-w-0 flex-1 basis-60 text-xs text-muted-foreground">
                Each change is its own commit: undo any of them from Git.
              </span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
