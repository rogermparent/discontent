"use client";

import { useEffect, useId, useRef, useState, type Ref } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Textarea } from "@discontent/component-library/components/ui/textarea";
import type { ShoppingProposal } from "../../util/shoppingConsolidate";
import {
  SHOPPING_ASK_NOTE_MAX,
  type ShoppingReviseResult,
} from "../../util/shoppingAsk";
import type {
  ShoppingRow,
  ShoppingRowSource,
  ShoppingView,
} from "../../util/shoppingView";
import type { ShoppingList } from "./useShoppingList";
import type { ShoppingAsker } from "./useShoppingAsk";

/** "1 cup white flour", with its scale when not 1×. */
export function sourceLine(source: ShoppingRowSource): string {
  return source.scale ? `${source.text} (×${source.scale})` : source.text;
}

/** The amount field's starting text: the sum, without its "≈". */
export function plainAmount(proposal: ShoppingProposal): string {
  return proposal.amount.replace(/^≈\s*/, "");
}

/** "Local model qwen3:8b": a sentence starts with a capital. */
function capital(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** The mark a model's suggestion carries (48b: AI-made, so marked). */
export function ModelMark({ model }: { model: string }) {
  return (
    <span
      className="make-tape self-start px-2 py-1 font-mono text-[0.75rem] leading-none"
      data-kind="missing"
      data-testid="shopping-model-mark"
    >
      Suggested by {model}
    </span>
  );
}

/** "Note for the model": what a follow-up ask sends, and Merge stores. */
export function NoteField({
  id,
  value,
  onChange,
  fieldRef,
}: {
  id: string;
  value: string;
  onChange(value: string): void;
  fieldRef?: Ref<HTMLTextAreaElement>;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold">
        Note for the model
      </label>
      <Textarea
        ref={fieldRef}
        id={id}
        rows={2}
        maxLength={SHOPPING_ASK_NOTE_MAX}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="e.g. use grams · these are different, one is salted · call it plain flour"
        className="min-h-11"
      />
    </div>
  );
}

/**
 * The latest revise's answer for one topic (Db1): marked "Suggested by
 * <model>", its before → after (or "keep these apart" and why), and Accept
 * — which writes the decision, the note with it — or Discard. A refused or
 * failed answer says why, with "Try with Claude" where Claude is here.
 * Nothing is written unless Accept is pressed.
 */
function Suggestion({
  result,
  list,
  asker,
  retry,
  answered,
  decided,
}: {
  result: ShoppingReviseResult;
  list: ShoppingList;
  asker: ShoppingAsker;
  retry(): void;
  answered(message: string): void;
  /** 50c: the decision written (a walkthrough card counts it as answered). */
  decided?(status: "merged" | "apart"): void;
}) {
  const model = result.model ?? "the model";
  /* 49c (Dc1): a unit the lines can't be given in — no model would change it. */
  const cannotConvert = result.status === "refused" && !!result.cannotConvert;
  const tryClaude =
    result.claudeAvailable &&
    result.backend !== "claude" &&
    !cannotConvert &&
    (result.status === "refused" || result.status === "failed");
  if (result.status === "refused" || result.status === "failed") {
    return (
      <div className="flex flex-col gap-2" data-testid="shopping-ask-result">
        <p className="border-l-2 border-destructive pl-2 text-sm">
          {cannotConvert
            ? `${capital(result.problem)}.`
            : result.status === "refused"
              ? `${capital(model)}'s answer was not used: ${result.problem}.`
              : `Nothing was suggested: ${result.problem}.`}
        </p>
        <div className="flex flex-wrap gap-2">
          {tryClaude ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              disabled={asker.busy}
              onClick={retry}
            >
              Try with Claude
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              asker.clearRevised();
              answered("Dismissed; nothing changed.");
            }}
          >
            Dismiss
          </Button>
        </div>
      </div>
    );
  }
  const accept = async () => {
    const answer = await list.decideMerge(result.decision);
    if (!answer) return;
    asker.clearRevised();
    decided?.(result.status === "merge" ? "merged" : "apart");
    answered(
      result.status === "merge"
        ? `Accepted ${model}'s suggestion: ${result.proposal.line}.`
        : `Accepted ${model}'s suggestion: kept apart ${result.target.rows.map((row) => row.name).join(", ")}.`,
    );
  };
  return (
    <div
      className="flex flex-col gap-2 rounded-r-md border-l-2 border-primary bg-muted px-3 py-2.5"
      data-testid="shopping-ask-result"
    >
      <ModelMark model={model} />
      {result.status === "merge" ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-sm">
          <dt className="text-muted-foreground">Before</dt>
          <dd className="break-words line-through decoration-muted-foreground/60">
            {result.target.line}
          </dd>
          <dt className="text-muted-foreground">After</dt>
          <dd className="font-semibold break-words">{result.proposal.line}</dd>
        </dl>
      ) : (
        <p className="text-sm font-semibold">
          {result.target.merged
            ? "Split this row and keep its names apart"
            : "Keep these apart"}
        </p>
      )}
      {result.status === "merge" &&
      result.proposal.rows.length < result.target.rows.length ? (
        <p className="text-xs text-muted-foreground">
          Only {result.proposal.rows.map((row) => row.name).join(" and ")}; the
          rest stay their own rows.
        </p>
      ) : null}
      {(result.status === "merge" ? result.proposal.reason : result.reason) ? (
        <p className="text-xs text-muted-foreground">
          {result.status === "merge" ? result.proposal.reason : result.reason}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Your note, saved with it if you accept: “{result.note}”
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-9"
          disabled={list.working}
          onClick={() => void accept()}
        >
          Accept
          <span className="sr-only"> {model}&apos;s suggestion</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => {
            asker.clearRevised();
            answered(`Discarded ${model}'s suggestion; nothing changed.`);
          }}
        >
          Discard
        </Button>
      </div>
    </div>
  );
}

/**
 * Where one topic's ask shows (a proposal's card, a merged row's note): the
 * job's live panel while it runs, then its suggestion. The live region is
 * mounted before the answer, so its words are announced (47i's review).
 */
export function AskOutcome({
  topic,
  list,
  asker,
  answered,
  decided,
}: {
  topic: string;
  list: ShoppingList;
  asker: ShoppingAsker;
  answered(message: string): void;
  decided?(status: "merged" | "apart"): void;
}) {
  const { revised } = asker;
  const result =
    revised?.topic.kind === "revise" &&
    revised.topic.id === topic &&
    revised.result.task === "revise"
      ? (revised.result as ShoppingReviseResult)
      : undefined;
  return (
    <>
      <div role="status" className="empty:hidden">
        {result ? (
          <Suggestion
            result={result}
            list={list}
            asker={asker}
            retry={() =>
              revised &&
              void asker.ask({ ...revised.input, claude: true }, revised.topic)
            }
            answered={answered}
            {...(decided ? { decided } : {})}
          />
        ) : null}
      </div>
    </>
  );
}

/** Every merged row of a view, by its decision's id. */
function mergedRow(view: ShoppingView, id: string): ShoppingRow | undefined {
  return [
    ...view.stores.flatMap((list) =>
      list.sections.flatMap((section) => section.rows),
    ),
    ...view.onHand,
    ...view.checked,
  ].find((row) => row.merge?.id === id);
}

/**
 * 49b (Db1): a merged row's "Ask the model about this", opened from its
 * menu — the row as it reads and what it was made from, a note, and Ask;
 * the answer shows here, marked, with Accept and Discard.
 */
function AboutMerge({
  id,
  view,
  list,
  asker,
  answered,
}: {
  id: string;
  view: ShoppingView;
  list: ShoppingList;
  asker: ShoppingAsker;
  answered(message: string): void;
}) {
  const headingId = useId();
  const noteId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState("");
  const row = mergedRow(view, id);
  const gone = !row?.merge;
  useEffect(() => {
    field.current?.focus();
  }, [id]);
  /* Split, kept apart or taken off the list: the note has nothing to ask about. */
  const { closeAbout } = asker;
  useEffect(() => {
    if (gone) closeAbout();
  }, [gone, closeAbout]);
  if (!row?.merge) return null;
  return (
    <section
      className="flex flex-col gap-2 border-b border-border pb-3"
      aria-labelledby={headingId}
      data-testid="shopping-ask-about"
    >
      <h3 id={headingId} className="text-sm font-semibold break-words">
        Ask the model about {row.label}
      </h3>
      <p className="text-xs text-muted-foreground break-words">
        merged from:{" "}
        {row.merge.from
          .map((line) =>
            line.recipeName || line.recipe
              ? `${line.text} (${line.recipeName ?? line.recipe})`
              : line.text,
          )
          .join(" · ")}
      </p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void asker.ask(
            { task: "revise", id, note: note.trim() },
            { kind: "revise", id },
          );
        }}
      >
        <NoteField
          id={noteId}
          value={note}
          onChange={setNote}
          fieldRef={field}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            size="sm"
            className="h-9"
            disabled={asker.busy || !note.trim()}
          >
            Ask the model
            <span className="sr-only"> about {row.name}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              asker.closeAbout();
              answered("Closed the note; nothing changed.");
            }}
          >
            Close
          </Button>
        </div>
      </form>
      <AskOutcome topic={id} list={list} asker={asker} answered={answered} />
    </section>
  );
}

/**
 * 49b's asks that belong to no card (50c): the running ask's live panel —
 * once for the whole walkthrough, so it settles even when the card it was
 * about has gone (49b review) — its message, and a merged row's "Ask the
 * model about this", opened from the row's menu. Nothing shows when none
 * of them is there.
 */
export function MergeAsks({
  list,
  asker,
  view,
  answered,
}: {
  list: ShoppingList;
  asker?: ShoppingAsker;
  /** The whole list's view: a merged row's line for its note. */
  view?: ShoppingView;
  answered(message: string): void;
}) {
  const about = asker?.available ? asker.about : undefined;
  if (!asker) return null;
  return (
    <>
      {asker.message ? (
        <p
          role="alert"
          className="border-l-2 border-destructive pl-2 text-sm"
          data-testid="shopping-ask-message"
        >
          {asker.message}
        </p>
      ) : null}
      {asker.running && asker.surface && asker.running.job !== asker.settledJob
        ? asker.surface.progress({
            job: asker.running.job,
            stored: asker.running.stored,
            task: asker.running.task,
            model: asker.running.model,
            settled: (outcome) => asker.settle(asker.running!.job, outcome),
          })
        : null}
      {about && view ? (
        <AboutMerge
          key={about}
          id={about}
          view={view}
          list={list}
          asker={asker}
          answered={answered}
        />
      ) : null}
    </>
  );
}

/** 49b: whether `MergeAsks` has something to show. */
export function hasMergeAsks(asker?: ShoppingAsker): boolean {
  if (!asker) return false;
  return (
    !!asker.message ||
    (asker.available && !!asker.about) ||
    (!!asker.running && asker.running.job !== asker.settledJob)
  );
}

/**
 * In the store (49a, Da6): open proposals are a quiet line that opens Plan,
 * where they are answered.
 */
export function ProposalsLine({
  count,
  openPlan,
}: {
  count: number;
  openPlan(): void;
}) {
  if (count === 0) return null;
  return (
    <p
      className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground print:hidden"
      data-testid="shopping-proposals-line"
    >
      {count === 1
        ? "1 line looks like another under a different name."
        : `${count} sets of lines look like one thing under different names.`}
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-9 px-0"
        onClick={openPlan}
      >
        Review in Plan
      </Button>
    </p>
  );
}
