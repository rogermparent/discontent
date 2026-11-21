"use client";

import { useEffect, useId, useRef, useState, type Ref } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import { Textarea } from "@discontent/component-library/components/ui/textarea";
import { cn } from "@discontent/component-library/lib/utils";
import type { ShoppingProposal } from "../../util/shoppingConsolidate";
import {
  SHOPPING_ASK_NOTE_MAX,
  stillOpen,
  type ShoppingAskDecision,
  type ShoppingFindResult,
  type ShoppingModelProposal,
  type ShoppingReviseResult,
} from "../../util/shoppingAsk";
import type {
  ShoppingRow,
  ShoppingRowSource,
  ShoppingView,
} from "../../util/shoppingView";
import { panelClass } from "./parts";
import type { ShoppingList } from "./useShoppingList";
import type { ShoppingAsker } from "./useShoppingAsk";

/** "1 cup white flour", with its scale when not 1×. */
function sourceLine(source: ShoppingRowSource): string {
  return source.scale ? `${source.text} (×${source.scale})` : source.text;
}

/** The amount field's starting text: the sum, without its "≈". */
function plainAmount(proposal: ShoppingProposal): string {
  return proposal.amount.replace(/^≈\s*/, "");
}

/** "Local model qwen3:8b": a sentence starts with a capital. */
function capital(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** The mark a model's suggestion carries (48b: AI-made, so marked). */
function ModelMark({ model }: { model: string }) {
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
function NoteField({
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
}: {
  result: ShoppingReviseResult;
  list: ShoppingList;
  asker: ShoppingAsker;
  retry(): void;
  answered(message: string): void;
}) {
  const model = result.model ?? "the model";
  const tryClaude =
    result.claudeAvailable &&
    result.backend !== "claude" &&
    (result.status === "refused" || result.status === "failed");
  if (result.status === "refused" || result.status === "failed") {
    return (
      <div className="flex flex-col gap-2" data-testid="shopping-ask-result">
        <p className="border-l-2 border-destructive pl-2 text-sm">
          {result.status === "refused"
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
function AskOutcome({
  topic,
  list,
  asker,
  answered,
}: {
  topic: string;
  list: ShoppingList;
  asker: ShoppingAsker;
  answered(message: string): void;
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
          />
        ) : null}
      </div>
    </>
  );
}

/**
 * One proposal (49a, Da6): the lines as written with their recipes, what
 * they come to as one row, why, and Merge / Edit / Keep apart. Edit opens a
 * name and an amount field in place; its Merge sends only what was changed,
 * so an untouched amount stays the computed sum (and follows the list).
 *
 * 49b: Edit has a note for the model too, with "Ask the model" (Db1), and
 * the note is stored with an edited Merge. A model's own proposal (Db2,
 * `found`) is marked as its suggestion and is answered by its names.
 */
function Proposal({
  proposal,
  list,
  asker,
  found,
  answered,
}: {
  proposal: ShoppingProposal;
  list: ShoppingList;
  asker?: ShoppingAsker;
  /** A model's proposal: who suggested it, and what Merge sends. */
  found?: { model: string; decision: ShoppingAskDecision };
  answered(message: string): void;
}) {
  const lineId = useId();
  const nameId = useId();
  const amountId = useId();
  const noteId = useId();
  const [editing, setEditing] = useState(false);
  /* What the person typed; untouched fields follow the proposal. */
  const [typed, setTyped] = useState<{ name?: string; amount?: string }>({});
  const [note, setNote] = useState("");
  const name = typed.name ?? proposal.name;
  const amount = typed.amount ?? plainAmount(proposal);
  const nameField = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const sources = proposal.rows.flatMap((row) => row.sources);
  /* A table proposal is answered by its id; a model's by its names. */
  const target = found ? { keys: found.decision.keys } : { id: proposal.id };
  const asking = !!asker?.available;

  const merge = async (edited: boolean) => {
    const typedName = typed.name?.trim();
    const typedAmount = typed.amount?.trim();
    const typedNote = edited ? note.trim() : "";
    const ownName =
      edited && typedName && typedName !== proposal.name
        ? typedName
        : found?.decision.name;
    const input = {
      ...target,
      status: "merged" as const,
      ...(ownName ? { name: ownName } : {}),
      ...(edited && typedAmount && typedAmount !== plainAmount(proposal)
        ? { amount: typedAmount }
        : {}),
      ...(typedNote ? { note: typedNote } : {}),
    };
    const result = await list.decideMerge(input);
    if (!result) return;
    const label =
      input.amount || (edited && typedName && typedName !== proposal.name)
        ? `${input.amount ?? proposal.amount} ${ownName ?? proposal.name}`
        : proposal.line;
    answered(`Merged into one row: ${label}.`);
  };
  const keepApart = async () => {
    const result = await list.decideMerge({ ...target, status: "apart" });
    if (result)
      answered(
        `Kept apart: ${proposal.rows.map((row) => row.name).join(", ")}.`,
      );
  };
  const askModel = () => {
    if (!asker || !note.trim()) return;
    void asker.ask(
      { task: "revise", ...target, note: note.trim() },
      { kind: "revise", id: proposal.id },
    );
  };

  return (
    <li
      className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-1"
      data-testid="shopping-proposal"
      data-proposal={proposal.id}
      data-source={found ? "model" : "table"}
    >
      {found ? <ModelMark model={found.model} /> : null}
      <ul
        className="flex flex-col gap-0.5 text-sm"
        aria-label={`Lines for ${proposal.name}`}
      >
        {sources.map((source) => (
          <li key={source.id} className="break-words">
            {sourceLine(source)}
            <span className="text-muted-foreground">
              {" · "}
              {source.recipeName ?? source.recipe ?? "typed in"}
            </span>
          </li>
        ))}
      </ul>
      <p id={lineId} className="font-semibold break-words">
        <span aria-hidden>→ </span>
        <span className="sr-only">As one row: </span>
        {proposal.line}
      </p>
      <p className="text-xs text-muted-foreground">
        {proposal.reason || (found ? `Suggested by ${found.model}` : "")}
        {proposal.estimated && " · ≈ volume and weight added by density"}
      </p>
      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void merge(true);
          }}
        >
          <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-1">
              <label htmlFor={nameId} className="text-xs font-semibold">
                Name
              </label>
              <Input
                ref={nameField}
                id={nameId}
                value={name}
                maxLength={120}
                onChange={(event) =>
                  setTyped((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={amountId} className="text-xs font-semibold">
                Amount
              </label>
              <Input
                id={amountId}
                value={amount}
                maxLength={60}
                onChange={(event) =>
                  setTyped((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
                className="h-10"
              />
            </div>
          </div>
          {asking ? (
            <NoteField id={noteId} value={note} onChange={setNote} />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              className="h-9"
              disabled={list.working}
            >
              Merge
              <span className="sr-only"> as edited</span>
            </Button>
            {asking ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                disabled={asker!.busy || !note.trim()}
                onClick={askModel}
              >
                Ask the model
                <span className="sr-only"> about {proposal.name}</span>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => {
                setEditing(false);
                setTyped({});
                setNote("");
                requestAnimationFrame(() => editButton.current?.focus());
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="h-9"
            disabled={list.working}
            onClick={() => void merge(false)}
          >
            Merge
            <span className="sr-only"> into {proposal.line}</span>
          </Button>
          <Button
            ref={editButton}
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={list.working}
            onClick={() => {
              setEditing(true);
              requestAnimationFrame(() => nameField.current?.focus());
            }}
          >
            Edit
            <span className="sr-only">
              {" "}
              before merging into {proposal.name}
            </span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
            disabled={list.working}
            onClick={() => void keepApart()}
          >
            Keep apart
            <span className="sr-only"> from {proposal.name}</span>
          </Button>
        </div>
      )}
      {asker?.available ? (
        <AskOutcome
          topic={proposal.id}
          list={list}
          asker={asker}
          answered={answered}
        />
      ) : null}
    </li>
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
 * 49b (Db2): "Look for more with the model" — the list's names, what a
 * shopper buys as one thing — and what it found, each marked as its
 * suggestion with the usual Merge / Edit / Keep apart. Derived: they live
 * in the job's result until answered, never in the list.
 */
function FindMore({
  list,
  asker,
  proposals,
  answered,
}: {
  list: ShoppingList;
  asker: ShoppingAsker;
  proposals: ShoppingProposal[];
  answered(message: string): void;
}) {
  const { found } = asker;
  const result =
    found?.result.task === "find"
      ? (found.result as ShoppingFindResult)
      : undefined;
  const model = result?.model ?? asker.model;
  const open: ShoppingModelProposal[] = (found?.open ?? []).filter((each) =>
    stillOpen(each, list.merges, proposals),
  );
  const tryClaude =
    result &&
    result.claudeAvailable &&
    result.backend !== "claude" &&
    (result.status === "refused" || result.status === "failed");
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={asker.busy}
          onClick={() => void asker.ask({ task: "find" }, { kind: "find" })}
        >
          Look for more with the model
        </Button>
        <span className="text-xs text-muted-foreground">
          {asker.model} reads the list’s names; nothing changes until you merge.
        </span>
      </div>
      <div role="status" className="empty:hidden" data-testid="shopping-find">
        {result &&
        (result.status === "refused" || result.status === "failed") ? (
          <p className="border-l-2 border-destructive pl-2 text-sm">
            {result.status === "refused"
              ? `${capital(model)}'s answer was not used: ${result.problem}.`
              : `Nothing was suggested: ${result.problem}.`}
          </p>
        ) : null}
        {result?.status === "found" && result.proposals.length === 0 ? (
          <p className="text-sm">
            {capital(model)} found nothing more to merge in {result.names}{" "}
            names.
          </p>
        ) : null}
        {result?.status === "found" &&
        result.proposals.length > 0 &&
        open.length === 0 ? (
          <p className="text-sm">Every suggestion from {model} is answered.</p>
        ) : null}
      </div>
      {tryClaude ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={asker.busy}
            onClick={() =>
              void asker.ask({ task: "find", claude: true }, { kind: "find" })
            }
          >
            Try with Claude
          </Button>
        </div>
      ) : null}
      {open.length > 0 ? (
        <ul className="flex flex-col" aria-label={`Suggested by ${model}`}>
          {open.map((each) => (
            <Proposal
              key={each.proposal.id}
              proposal={each.proposal}
              list={list}
              asker={asker}
              found={{ model, decision: each.decision }}
              answered={(text) => {
                asker.answeredFound(each.proposal.id);
                answered(text);
              }}
            />
          ))}
        </ul>
      ) : null}
      {result?.status === "found" && result.dropped.length > 0 ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer py-1">
            Left out by the check ({result.dropped.length})
          </summary>
          <ul className="ml-3 flex flex-col gap-0.5">
            {result.dropped.map((why) => (
              <li key={why}>{why}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/**
 * "Same thing, different names" (49a, Da6), at home: each open proposal —
 * rows the curated table says are one ingredient — with Merge, Edit and Keep
 * apart. Answered proposals leave the panel; what was done is said in a
 * status line, and focus goes to the panel's heading so it is not lost with
 * the button.
 *
 * 49b: with a model here (`asker`), a note and "Ask the model" in each
 * Edit, a merged row's note (from its menu), and "Look for more with the
 * model" — every answer marked, and written only by Accept or Merge.
 */
export function MergeProposals({
  proposals,
  list,
  asker,
  view,
  className,
}: {
  proposals: ShoppingProposal[];
  list: ShoppingList;
  asker?: ShoppingAsker;
  /** The whole list's view: a merged row's line for its note. */
  view?: ShoppingView;
  className?: string;
}) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [message, setMessage] = useState<string | undefined>();
  /* 49b: the model may look when two or more lines are still to buy. */
  const findable =
    !!asker?.available &&
    list.settings.features.merge &&
    list.items.filter((item) => !item.checked).length >= 2;
  const about = asker?.available ? asker.about : undefined;
  const pending = !!asker?.running && asker.running.job !== asker.settledJob;
  if (proposals.length === 0 && !message && !findable && !about && !pending) {
    return null;
  }
  const answered = (text: string) => {
    setMessage(text);
    heading.current?.focus();
  };
  return (
    <section
      className={cn(panelClass, "print:hidden", className)}
      aria-labelledby={headingId}
      data-testid="shopping-proposals"
    >
      <h2
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className="font-semibold outline-none"
      >
        Same thing, different names
        {proposals.length > 0 && ` (${proposals.length})`}
      </h2>
      {proposals.length > 0 && (
        <p className="mb-1 text-xs text-muted-foreground">
          These lines look like one thing to buy. Merge makes them one row, on
          this list and on later ones; Keep apart stops asking.
        </p>
      )}
      <p
        role="status"
        className={cn("text-sm", message ? "py-1" : "sr-only")}
        data-testid="shopping-proposals-status"
      >
        {message}
      </p>
      {asker?.message ? (
        <p
          role="alert"
          className="border-l-2 border-destructive pl-2 text-sm"
          data-testid="shopping-ask-message"
        >
          {asker.message}
        </p>
      ) : null}
      {/*
        The running ask's live panel, once for the whole panel (49b review):
        it settles the ask even when the card it was about has gone (merged,
        kept apart, closed) — a panel inside that card would stop polling
        with it and leave every Ask disabled.
      */}
      {asker?.running && asker.surface && asker.running.job !== asker.settledJob
        ? asker.surface.progress({
            job: asker.running.job,
            stored: asker.running.stored,
            task: asker.running.task,
            model: asker.running.model,
            settled: (outcome) => asker.settle(asker.running!.job, outcome),
          })
        : null}
      {about && asker && view ? (
        <AboutMerge
          key={about}
          id={about}
          view={view}
          list={list}
          asker={asker}
          answered={answered}
        />
      ) : null}
      {proposals.length > 0 && (
        <ul className="flex flex-col">
          {proposals.map((proposal) => (
            <Proposal
              key={proposal.id}
              proposal={proposal}
              list={list}
              asker={asker}
              answered={answered}
            />
          ))}
        </ul>
      )}
      {findable && asker ? (
        <FindMore
          list={list}
          asker={asker}
          proposals={proposals}
          answered={answered}
        />
      ) : null}
    </section>
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
