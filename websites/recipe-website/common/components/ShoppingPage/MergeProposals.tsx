"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import { cn } from "@discontent/component-library/lib/utils";
import type { ShoppingProposal } from "../../util/shoppingConsolidate";
import type { ShoppingRowSource } from "../../util/shoppingView";
import { panelClass } from "./parts";
import type { ShoppingList } from "./useShoppingList";

/** "1 cup white flour", with its scale when not 1×. */
function sourceLine(source: ShoppingRowSource): string {
  return source.scale ? `${source.text} (×${source.scale})` : source.text;
}

/** The amount field's starting text: the sum, without its "≈". */
function plainAmount(proposal: ShoppingProposal): string {
  return proposal.amount.replace(/^≈\s*/, "");
}

/**
 * One proposal (49a, Da6): the lines as written with their recipes, what
 * they come to as one row, why, and Merge / Edit / Keep apart. Edit opens a
 * name and an amount field in place; its Merge sends only what was changed,
 * so an untouched amount stays the computed sum (and follows the list).
 */
function Proposal({
  proposal,
  list,
  answered,
}: {
  proposal: ShoppingProposal;
  list: ShoppingList;
  answered(message: string): void;
}) {
  const lineId = useId();
  const nameId = useId();
  const amountId = useId();
  const [editing, setEditing] = useState(false);
  /* What the person typed; untouched fields follow the proposal. */
  const [typed, setTyped] = useState<{ name?: string; amount?: string }>({});
  const name = typed.name ?? proposal.name;
  const amount = typed.amount ?? plainAmount(proposal);
  const nameField = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const sources = proposal.rows.flatMap((row) => row.sources);

  const merge = async (edited: boolean) => {
    const typedName = typed.name?.trim();
    const typedAmount = typed.amount?.trim();
    const input = {
      id: proposal.id,
      status: "merged" as const,
      ...(edited && typedName && typedName !== proposal.name
        ? { name: typedName }
        : {}),
      ...(edited && typedAmount && typedAmount !== plainAmount(proposal)
        ? { amount: typedAmount }
        : {}),
    };
    const result = await list.decideMerge(input);
    if (!result) return;
    const label =
      input.amount || input.name
        ? `${input.amount ?? proposal.amount} ${input.name ?? proposal.name}`
        : proposal.line;
    answered(`Merged into one row: ${label}.`);
  };
  const keepApart = async () => {
    const result = await list.decideMerge({
      id: proposal.id,
      status: "apart",
    });
    if (result)
      answered(
        `Kept apart: ${proposal.rows.map((row) => row.name).join(", ")}.`,
      );
  };

  return (
    <li
      className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-1"
      data-testid="shopping-proposal"
      data-proposal={proposal.id}
    >
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
        {proposal.reason}
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
          {/* 49b: "Note for the model" goes here. */}
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => {
                setEditing(false);
                setTyped({});
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
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * "Same thing, different names" (49a, Da6), at home: each open proposal —
 * rows the curated table says are one ingredient — with Merge, Edit and Keep
 * apart. Answered proposals leave the panel; what was done is said in a
 * status line, and focus goes to the panel's heading so it is not lost with
 * the button.
 */
export function MergeProposals({
  proposals,
  list,
  className,
}: {
  proposals: ShoppingProposal[];
  list: ShoppingList;
  className?: string;
}) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [message, setMessage] = useState<string | undefined>();
  if (proposals.length === 0 && !message) return null;
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
      {proposals.length > 0 && (
        <ul className="flex flex-col">
          {proposals.map((proposal) => (
            <Proposal
              key={proposal.id}
              proposal={proposal}
              list={list}
              answered={(text) => {
                setMessage(text);
                heading.current?.focus();
              }}
            />
          ))}
        </ul>
      )}
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
