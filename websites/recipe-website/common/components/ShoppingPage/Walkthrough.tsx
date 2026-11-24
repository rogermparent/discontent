"use client";

/**
 * 50c: the walkthrough (the mock-up Roger approved, 2026-11-21) — one card
 * at a time, each a suggestion with what the list reads now and after:
 * the list's own "same thing, different names" (49a, by "Built-in") first,
 * then a model's tidy run's (50b). Accept (A), Skip (S), Edit (E), a note
 * to the model, Accept the rest; then the done state, with the skipped
 * cards to reopen. Keys work while focus is in the panel and not in a
 * field; after an action focus goes to the next card's title, and the
 * counts are said in a live region.
 */
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import { Textarea } from "@discontent/component-library/components/ui/textarea";
import { cn } from "@discontent/component-library/lib/utils";
import type { ShoppingProposal } from "../../util/shoppingConsolidate";
import type { ShoppingLayerOp } from "../../util/shoppingLayers";
import {
  TIDY_KIND_LABELS,
  TIDY_NOTE_MAX,
  type TidyOn,
  type TidyRunView,
  type TidySuggestionView,
} from "../../util/shoppingTidy";
import type { ShoppingView } from "../../util/shoppingView";
import {
  applyWalkEdits,
  nextCard,
  pickRun,
  suggestionDiff,
  walkCards,
  walkCounts,
  walkFields,
  type WalkAnswered,
  type WalkCard,
  type WalkCompose,
  type WalkDiff,
} from "../../util/shoppingWalk";
import {
  AskOutcome,
  MergeAsks,
  NoteField,
  hasMergeAsks,
  plainAmount,
  sourceLine,
} from "./MergeProposals";
import { panelClass } from "./parts";
import {
  TidyControls,
  type ShoppingTidySurface,
  type TidyRunning,
} from "./Tidy";
import type { ShoppingList } from "./useShoppingList";
import type { ShoppingAsker } from "./useShoppingAsk";

/** The keys a card answers, while focus is in the panel (not in a field). */
interface CardKeys {
  a?(): void;
  s?(): void;
  e?(): void;
}

function isField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest("input, textarea, select, [contenteditable='true']")
  );
}

/** A reason as a sentence: "Both are flour" → "Both are flour." */
function sentence(text: string | undefined): string {
  const said = text?.trim() ?? "";
  return !said || /[.!?…:]$/.test(said) ? said : `${said}.`;
}

/**
 * A key's hint on its button. The letter is CSS content, not text: a button
 * named by `aria-label` ("Skip: <title>") must show only words its name holds
 * (axe's label-content-name-mismatch, WCAG 2.5.3), and "Skip S" doesn't.
 */
function Kbd({ children }: { children: string }) {
  return (
    <kbd
      aria-hidden
      data-key={children}
      className="ml-1.5 rounded border border-b-2 border-current/40 px-1 font-mono text-[0.6875rem] leading-none opacity-80 after:content-[attr(data-key)]"
    />
  );
}

function Chip({
  children,
  tone = "kind",
}: {
  children: React.ReactNode;
  tone?: "kind" | "warn" | "by" | "drop";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs",
        tone === "kind" &&
          "bg-primary/10 font-semibold uppercase tracking-wide text-primary",
        tone === "drop" &&
          "bg-destructive/10 font-semibold uppercase tracking-wide text-destructive",
        tone === "warn" && "border border-dashed border-border",
        tone === "by" && "px-0 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** Now → After: the rows as they read, and as they would (Dc2). */
function Diff({
  diff,
  editing,
}: {
  diff: WalkDiff;
  editing?: React.ReactNode;
}) {
  return (
    <div className="@container">
      <div className="grid gap-2 @md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Now
          </span>
          <ul className="flex flex-col gap-1.5" aria-label="Now">
            {diff.now.length === 0 ? (
              <li className="rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground">
                already changed
              </li>
            ) : (
              diff.now.map((line) => (
                <li
                  key={line.key}
                  className="rounded-md border border-border px-2.5 py-1.5 text-sm break-words"
                >
                  {line.label}
                </li>
              ))
            )}
          </ul>
        </div>
        <span aria-hidden className="text-muted-foreground @md:pt-6">
          <span className="@md:hidden">↓</span>
          <span className="hidden @md:inline">→</span>
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            After
          </span>
          <ul
            className="flex flex-col gap-1.5"
            aria-label="After"
            data-testid="shopping-card-after"
          >
            {diff.after.map((line) => (
              <li
                key={`${line.key}${line.leftOff ? ":off" : ""}`}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm break-words",
                  line.leftOff
                    ? "bg-destructive/10 text-destructive line-through decoration-destructive/40"
                    : "bg-primary/10",
                )}
              >
                {line.label}
                {line.leftOff && (
                  <span className="block text-xs no-underline">
                    <span className="sr-only"> — </span>left off: {line.leftOff}
                  </span>
                )}
                {line.notes?.map((note) => (
                  <span
                    key={note}
                    className="block text-xs text-muted-foreground"
                  >
                    {note}
                  </span>
                ))}
                {line.movedTo && (
                  <span className="block text-xs text-muted-foreground">
                    moved to {line.movedTo}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {editing}
        </div>
      </div>
    </div>
  );
}

interface CardProps {
  list: ShoppingList;
  compose: WalkCompose;
  titleRef: RefObject<HTMLHeadingElement | null>;
  keysRef: RefObject<CardKeys>;
  busy: boolean;
  /** A tidy job (a run, or this card's ask) is running. */
  running?: TidyRunning;
  pending: number;
  acceptRest(): void;
}

/** A model's suggestion (50b): its kind, warnings, who, Now → After. */
function ModelCard({
  card,
  suggestion,
  tidy,
  model,
  accept,
  skip,
  ask,
  ...props
}: CardProps & {
  card: WalkCard & { source: "model" };
  suggestion: TidySuggestionView;
  tidy: ShoppingTidySurface;
  /** The picker's model's name: who "Tell the model…" asks. */
  model: string;
  accept(ops?: ShoppingLayerOp[]): Promise<void>;
  skip(): Promise<void>;
  ask(note: string): Promise<void>;
}) {
  const { list, compose, titleRef, keysRef, busy, running } = props;
  const noteId = useId();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const fields = useMemo(
    () => walkFields(suggestion.ops, list.items),
    [suggestion.ops, list.items],
  );
  const edited = editing ? applyWalkEdits(suggestion.ops, values) : undefined;
  const ops = edited && "ops" in edited ? edited.ops : suggestion.ops;
  const diff = useMemo(() => suggestionDiff(compose, ops), [compose, ops]);
  const dropsOnly = suggestion.ops.every((op) => op.op === "drop");
  const doAccept = () => {
    if (busy) return;
    if (edited && "error" in edited) return;
    void accept(editing ? ops : undefined);
  };
  const toggleEdit = () => {
    if (fields.length === 0) return;
    setEditing((on) => !on);
    setValues({});
    /* Review 6: to the first field, as the built-in card does. */
    requestAnimationFrame(() =>
      document.getElementById(`${noteId}-${fields[0].id}`)?.focus(),
    );
  };
  useEffect(() => {
    keysRef.current = {
      a: doAccept,
      s: () => !busy && void skip(),
      ...(fields.length > 0 ? { e: toggleEdit } : {}),
    };
  });
  return (
    <article
      className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3.5"
      data-testid="shopping-tidy-suggestion"
      data-suggestion={suggestion.id}
      data-status={card.status}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={dropsOnly ? "drop" : "kind"}>
          {TIDY_KIND_LABELS[suggestion.kind]}
        </Chip>
        {suggestion.revised && <Chip tone="warn">Revised</Chip>}
        {suggestion.warnings.map((warning) => (
          <Chip key={warning} tone="warn">
            {warning}
          </Chip>
        ))}
        <Chip tone="by">Suggested by {card.model}</Chip>
      </div>
      <h3
        ref={titleRef}
        tabIndex={-1}
        className="font-display text-lg font-semibold break-words outline-none"
        data-testid="shopping-card-title"
      >
        {suggestion.title}
      </h3>
      {suggestion.reason && (
        <p className="text-sm break-words">{suggestion.reason}</p>
      )}
      {suggestion.revised && (
        <p className="text-xs text-muted-foreground break-words">
          Asked again with your note: “{suggestion.revised.note}”
        </p>
      )}
      {card.status === "skipped" && (
        <p className="text-xs text-muted-foreground">
          You skipped this one; Accept still takes it.
        </p>
      )}
      <Diff
        diff={diff}
        editing={
          editing ? (
            <div
              className="flex flex-col gap-2"
              data-testid="shopping-card-edit"
            >
              {fields.map((field) => (
                <div key={field.id} className="flex flex-col gap-1">
                  <label
                    htmlFor={`${noteId}-${field.id}`}
                    className="text-xs font-semibold"
                  >
                    {field.label}
                    {field.optional && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        (empty: the list’s own)
                      </span>
                    )}
                  </label>
                  <Input
                    id={`${noteId}-${field.id}`}
                    value={values[field.id] ?? field.value}
                    maxLength={field.field === "text" ? 500 : 120}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.id]: event.target.value,
                      }))
                    }
                    className="h-10"
                  />
                </div>
              ))}
              {edited && "error" in edited && (
                <p role="alert" className="text-xs text-destructive">
                  {edited.error}
                </p>
              )}
            </div>
          ) : null
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="h-10"
          disabled={busy || (!!edited && "error" in edited)}
          onClick={doAccept}
          aria-label={`Accept${editing ? " as edited" : ""}: ${suggestion.title}`}
          aria-keyshortcuts="A"
        >
          Accept{editing ? " as edited" : ""}
          <Kbd>A</Kbd>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10"
          disabled={busy}
          onClick={() => void skip()}
          aria-label={`Skip: ${suggestion.title}`}
          aria-keyshortcuts="S"
        >
          Skip
          <Kbd>S</Kbd>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10"
          disabled={fields.length === 0}
          onClick={toggleEdit}
          aria-expanded={editing}
          aria-keyshortcuts="E"
          title={
            fields.length === 0
              ? "Nothing here to edit: it changes no name, amount or note"
              : undefined
          }
        >
          {editing ? "Cancel edit" : "Edit"}
          <Kbd>E</Kbd>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10"
          aria-expanded={asking}
          disabled={!!running}
          onClick={() => {
            setAsking((on) => !on);
            requestAnimationFrame(() => noteRef.current?.focus());
          }}
        >
          Tell the model…
        </Button>
        {props.pending > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10"
            disabled={busy}
            onClick={props.acceptRest}
          >
            Accept the rest
          </Button>
        )}
      </div>
      {asking && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!note.trim() || running) return;
            void ask(note.trim()).then(() => {
              setAsking(false);
              setNote("");
            });
          }}
        >
          <label htmlFor={noteId} className="text-xs font-semibold">
            Note for the model
          </label>
          <Textarea
            ref={noteRef}
            id={noteId}
            rows={2}
            maxLength={TIDY_NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. I’ll buy jarred purée; just get pear nectar for the liquid"
            className="min-h-11"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="h-10 self-start"
            disabled={!note.trim() || !!running || !tidy}
          >
            Ask {model} again with this note
          </Button>
        </form>
      )}
    </article>
  );
}

/**
 * The list's own proposal (49a) as a card "by Built-in" (Dc3): Accept =
 * Merge (a rule for every list, as before), Skip (this page only), Edit
 * (name and amount), Keep apart, and — with a model here — 49b's note.
 */
function BuiltInCard({
  card,
  proposal,
  asker,
  accept,
  skip,
  keepApart,
  answered,
  decided,
  ...props
}: CardProps & {
  card: WalkCard & { source: "built-in" };
  proposal: ShoppingProposal;
  asker?: ShoppingAsker;
  accept(edit?: {
    name?: string;
    amount?: string;
    note?: string;
  }): Promise<void>;
  skip(): void;
  keepApart(): Promise<void>;
  answered(message: string): void;
  /** The ask's suggestion accepted: the card is answered, as Accept's is. */
  decided(status: "merged" | "apart"): void;
}) {
  const { list, titleRef, keysRef, busy } = props;
  const nameId = useId();
  const amountId = useId();
  const noteId = useId();
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState<{ name?: string; amount?: string }>({});
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const sources = proposal.rows.flatMap((row) => row.sources);
  const name = typed.name ?? proposal.name;
  const amount = typed.amount ?? plainAmount(proposal);
  const askable = !!asker?.available;

  const doAccept = () => {
    if (busy) return;
    if (!editing) {
      void accept();
      return;
    }
    const typedName = typed.name?.trim();
    const typedAmount = typed.amount?.trim();
    void accept({
      ...(typedName && typedName !== proposal.name ? { name: typedName } : {}),
      ...(typedAmount && typedAmount !== plainAmount(proposal)
        ? { amount: typedAmount }
        : {}),
    });
  };
  const toggleEdit = () => {
    setEditing((on) => !on);
    setTyped({});
    requestAnimationFrame(() => nameRef.current?.focus());
  };
  useEffect(() => {
    keysRef.current = { a: doAccept, s: () => !busy && skip(), e: toggleEdit };
  });
  return (
    <article
      className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3.5"
      data-testid="shopping-proposal"
      data-proposal={proposal.id}
      data-source="table"
      data-status={card.status}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip>Merge</Chip>
        <Chip tone="by">Built-in</Chip>
      </div>
      <h3
        ref={titleRef}
        tabIndex={-1}
        className="font-display text-lg font-semibold break-words outline-none"
        data-testid="shopping-card-title"
      >
        Same thing, different names: {proposal.name}
      </h3>
      <p className="text-sm break-words">
        {sentence(proposal.reason) || "These lines look like one thing to buy."}{" "}
        Accept merges them on this list and on later ones; Keep apart stops
        asking.
        {proposal.estimated && " ≈ volume and weight added by density."}
      </p>
      <div className="@container">
        <div className="grid gap-2 @md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Now
            </span>
            <ul
              className="flex flex-col gap-1.5"
              aria-label={`Lines for ${proposal.name}`}
            >
              {sources.map((source) => (
                <li
                  key={source.id}
                  className="rounded-md border border-border px-2.5 py-1.5 text-sm break-words"
                >
                  {sourceLine(source)}
                  <span className="text-muted-foreground">
                    {" · "}
                    {source.recipeName ?? source.recipe ?? "typed in"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <span aria-hidden className="text-muted-foreground @md:pt-6">
            <span className="@md:hidden">↓</span>
            <span className="hidden @md:inline">→</span>
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              After
            </span>
            <p className="rounded-md bg-primary/10 px-2.5 py-1.5 text-sm font-semibold break-words">
              <span className="sr-only">As one row: </span>
              {editing && (typed.name || typed.amount)
                ? `${amount} ${name}`
                : proposal.line}
            </p>
            {editing && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor={nameId} className="text-xs font-semibold">
                    Name
                  </label>
                  <Input
                    ref={nameRef}
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
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="h-10"
          disabled={busy || list.working}
          onClick={doAccept}
          aria-label={
            editing
              ? `Accept as edited: merge into ${amount} ${name}`
              : `Accept: merge into ${proposal.line}`
          }
          aria-keyshortcuts="A"
        >
          Accept{editing ? " as edited" : ""}
          <Kbd>A</Kbd>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10"
          disabled={busy}
          onClick={skip}
          aria-label={`Skip: ${proposal.name}`}
          aria-keyshortcuts="S"
        >
          Skip
          <Kbd>S</Kbd>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10"
          onClick={toggleEdit}
          aria-expanded={editing}
          aria-keyshortcuts="E"
        >
          {editing ? "Cancel edit" : "Edit"}
          <Kbd>E</Kbd>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10"
          disabled={busy || list.working}
          onClick={() => void keepApart()}
        >
          Keep apart
          <span className="sr-only"> from {proposal.name}</span>
        </Button>
        {askable && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10"
            aria-expanded={asking}
            onClick={() => {
              setAsking((on) => !on);
              requestAnimationFrame(() => noteRef.current?.focus());
            }}
          >
            Tell the model…
          </Button>
        )}
        {props.pending > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10"
            disabled={busy}
            onClick={props.acceptRest}
          >
            Accept the rest
          </Button>
        )}
      </div>
      {asking && asker && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!note.trim()) return;
            void asker.ask(
              { task: "revise", id: proposal.id, note: note.trim() },
              { kind: "revise", id: proposal.id },
            );
          }}
        >
          <NoteField
            id={noteId}
            value={note}
            onChange={setNote}
            fieldRef={noteRef}
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="h-10 self-start"
            disabled={asker.busy || !note.trim()}
          >
            Ask the model
            <span className="sr-only"> about {proposal.name}</span>
          </Button>
        </form>
      )}
      {askable && asker && (
        <AskOutcome
          topic={proposal.id}
          list={list}
          asker={asker}
          answered={answered}
          decided={decided}
        />
      )}
    </article>
  );
}

/**
 * "Suggestions" in Plan (50c): the cards one at a time with their progress,
 * the done state, and — where this editor has a model — "Tidy with the
 * model" and its earlier runs. 49b's asks that belong to no card (a merged
 * row's note, a running ask) show here too.
 */
export function Walkthrough({
  list,
  proposals,
  asker,
  tidy,
  view,
}: {
  list: ShoppingList;
  /** 49a: open "same thing, different names" proposals. */
  proposals: ShoppingProposal[];
  asker?: ShoppingAsker;
  tidy?: ShoppingTidySurface;
  /** The whole list's view: a merged row's line for its note. */
  view: ShoppingView;
}) {
  const headingId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const keysRef = useRef<CardKeys>({});
  const [runs, setRuns] = useState<TidyRunView[]>(tidy?.runs ?? []);
  const [picked, setPicked] = useState<string>();
  const run = pickRun(runs, picked);
  const [answered, setAnswered] = useState<ReadonlyMap<string, WalkAnswered>>(
    () => new Map(),
  );
  const cards = useMemo(
    () =>
      walkCards({
        proposals,
        answered,
        ...(run ? { run } : {}),
        present: new Set(list.items.map((each) => each.id)),
      }),
    [proposals, answered, run, list.items],
  );
  const [cursor, setCursor] = useState<string>();
  const [viewing, setViewing] = useState<string>();
  const current =
    (viewing ? cards.find((card) => card.id === viewing) : undefined) ??
    nextCard(cards, cursor);
  const counts = walkCounts(cards);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState<TidyRunning>();
  const offered = tidy?.models.models ?? [];
  const [model, setModel] = useState(
    offered.find((each) => each.default)?.id ?? offered[0]?.id ?? "",
  );
  const [on, setOn] = useState<TidyOn>("current");
  /* After an action, focus the next card's title (or the done state's). */
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    if (focusTick === 0) return;
    (titleRef.current ?? doneRef.current)?.focus();
  }, [focusTick]);
  /* Tb4: an unmount flag set on every mount (Strict Mode mounts twice). */
  const stopped = useRef(false);
  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);

  const compose = useMemo<WalkCompose>(
    () => ({
      items: list.items,
      settings: list.settings,
      inventory: list.inventory,
      merges: list.merges,
      layers: list.layers,
      rules: list.rules,
    }),
    [
      list.items,
      list.settings,
      list.inventory,
      list.merges,
      list.layers,
      list.rules,
    ],
  );

  const words = (id: string) =>
    offered.find((each) => each.id === id)?.name ?? id;

  const moved = (card: WalkCard, text: string) => {
    setViewing(undefined);
    setCursor(card.id);
    setMessage(text);
    setFocusTick((tick) => tick + 1);
  };
  const replaceRun = (next: TidyRunView) =>
    setRuns((current) =>
      current.map((each) => (each.id === next.id ? next : each)),
    );
  const remember = (id: string, entry: WalkAnswered | undefined) =>
    setAnswered((current) => {
      const next = new Map(current);
      if (entry) next.set(id, entry);
      else next.delete(id);
      return next;
    });

  /** Accept one card; `false` when it did not take (the message says why). */
  async function acceptCard(
    card: WalkCard,
    edit?: { ops?: ShoppingLayerOp[]; name?: string; amount?: string },
  ): Promise<boolean> {
    if (card.source === "built-in") {
      const result = await list.decideMerge({
        id: card.proposal.id,
        status: "merged",
        ...(edit?.name ? { name: edit.name } : {}),
        ...(edit?.amount ? { amount: edit.amount } : {}),
      });
      if (!result) return false;
      remember(card.id, { status: "accepted", proposal: card.proposal });
      return true;
    }
    if (!tidy) return false;
    const answer = await tidy
      .decide(card.id, "accept", edit?.ops)
      .catch((error: unknown) => ({ message: String(error), run: undefined }));
    if (answer.run) replaceRun(answer.run);
    if (answer.message) {
      setMessage(answer.message);
      return false;
    }
    return true;
  }

  async function accept(
    card: WalkCard,
    edit?: { ops?: ShoppingLayerOp[]; name?: string; amount?: string },
  ) {
    setBusy(true);
    const done = await acceptCard(card, edit);
    if (done && card.source === "model") await list.reload();
    setBusy(false);
    if (!done) return;
    moved(
      card,
      card.source === "built-in"
        ? `Merged into one row: ${edit?.name || edit?.amount ? `${edit.amount ?? card.proposal.amount} ${edit.name ?? card.proposal.name}` : card.proposal.line}.`
        : `Accepted${edit?.ops ? " as edited" : ""}: ${card.suggestion.title}. It is in Changes, where you can turn it off.`,
    );
  }

  async function skip(card: WalkCard) {
    if (card.source === "built-in") {
      remember(card.id, { status: "skipped", proposal: card.proposal });
      moved(
        card,
        `Skipped: ${card.proposal.name}. It is asked again next time.`,
      );
      return;
    }
    if (!tidy) return;
    setBusy(true);
    const answer = await tidy
      .decide(card.id, "skip")
      .catch((error: unknown) => ({ message: String(error), run: undefined }));
    setBusy(false);
    if (answer.run) replaceRun(answer.run);
    if (answer.message) {
      setMessage(answer.message);
      return;
    }
    moved(card, `Skipped: ${card.suggestion.title}.`);
  }

  async function keepApart(card: WalkCard & { source: "built-in" }) {
    setBusy(true);
    const result = await list.decideMerge({
      id: card.proposal.id,
      status: "apart",
    });
    setBusy(false);
    if (!result) return;
    remember(card.id, { status: "apart", proposal: card.proposal });
    moved(
      card,
      `Kept apart: ${card.proposal.rows.map((row) => row.name).join(", ")}.`,
    );
  }

  async function acceptRest() {
    setBusy(true);
    setMessage("");
    let accepted = 0;
    let last: WalkCard | undefined;
    let stoppedAt: WalkCard | undefined;
    for (const card of cards) {
      if (card.status !== "pending") continue;
      if (!(await acceptCard(card))) {
        stoppedAt = card;
        break;
      }
      accepted += 1;
      last = card;
    }
    if (accepted > 0 && cards.some((card) => card.source === "model")) {
      await list.reload();
    }
    setBusy(false);
    const done =
      accepted === 1
        ? "Accepted 1 suggestion."
        : `Accepted ${accepted} suggestions.`;
    /* Review 3: a refusal part-way is said, not covered by the count. */
    if (stoppedAt) {
      const what =
        stoppedAt.source === "built-in"
          ? stoppedAt.proposal.name
          : stoppedAt.suggestion.title;
      setViewing(stoppedAt.id);
      setMessage(
        (said) =>
          `${done} Stopped at “${what}”${said ? `: ${said}` : list.error ? `: ${list.error}` : "."}`,
      );
      setFocusTick((tick) => tick + 1);
      return;
    }
    if (last) moved(last, done);
  }

  /** Follow a tidy job to its end; the outcome, or `undefined` once unmounted. */
  async function follow(job: string) {
    for (;;) {
      let outcome: Awaited<ReturnType<ShoppingTidySurface["follow"]>>;
      try {
        outcome = await tidy!.follow(job);
      } catch (error) {
        outcome = { message: String(error) };
      }
      if (stopped.current) return undefined;
      if (!outcome.pending) return outcome;
    }
  }

  async function refreshRuns() {
    const latest = await tidy!.runsNow().catch(() => ({ runs: undefined }));
    if (latest.runs) setRuns(latest.runs);
    return latest.runs;
  }

  async function startRun() {
    if (!tidy) return;
    setMessage("");
    let started: Awaited<ReturnType<ShoppingTidySurface["start"]>>;
    try {
      started = await tidy.start({ model, on });
    } catch (error) {
      started = { message: `The run did not start: ${String(error)}` };
    }
    if (!started.job) {
      setMessage(started.message ?? "The run did not start.");
      return;
    }
    setRunning({ job: started.job, model: words(model), task: "tidy" });
    const outcome = await follow(started.job);
    if (!outcome) return;
    setRunning(undefined);
    if (outcome.result?.status === "done") {
      const fresh = await refreshRuns();
      setPicked(undefined);
      setCursor(undefined);
      setViewing(undefined);
      const n = fresh?.[0]?.counts.pending ?? 0;
      setMessage(
        `${outcome.result.model ?? "The model"} made ${n === 1 ? "1 suggestion" : `${n} suggestions`}.`,
      );
    } else {
      setMessage(
        outcome.result?.status === "failed"
          ? `Nothing was suggested: ${outcome.result.problem}.`
          : (outcome.message ?? "The run did not finish."),
      );
    }
  }

  async function askCard(card: WalkCard & { source: "model" }, note: string) {
    if (!tidy) return;
    setMessage("");
    const started = await tidy
      .ask({ suggestion: card.id, note, ...(model ? { model } : {}) })
      .catch((error: unknown) => ({ message: String(error), job: undefined }));
    if (!started.job) {
      setMessage(started.message ?? "The model was not asked.");
      return;
    }
    setRunning({ job: started.job, model: words(model), task: "revise" });
    const outcome = await follow(started.job);
    if (!outcome) return;
    setRunning(undefined);
    if (outcome.result?.status === "done" && outcome.result.task === "revise") {
      await refreshRuns();
      setViewing(card.id);
      setMessage(`Revised: ${outcome.result.suggestion.title}.`);
      setFocusTick((tick) => tick + 1);
    } else {
      setMessage(
        outcome.result?.status === "failed"
          ? `The card stays as it was: ${outcome.result.problem}.`
          : (outcome.message ?? "The ask did not finish."),
      );
    }
  }

  const reopen = (card: WalkCard) => {
    if (card.source === "built-in") remember(card.id, undefined);
    setViewing(card.id);
    setMessage(
      `Reopened: ${card.source === "built-in" ? card.proposal.name : card.suggestion.title}.`,
    );
    setFocusTick((tick) => tick + 1);
  };

  /* No card: the keys do nothing (a card's own effect sets them first). */
  useEffect(() => {
    if (!current) keysRef.current = {};
  });

  const shown = !!tidy || cards.length > 0 || hasMergeAsks(asker) || !!message;
  if (!shown) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    /* Review 6: a held key is one press, not a card after card. */
    if (event.repeat || isField(event.target)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const handler = keysRef.current[event.key.toLowerCase() as keyof CardKeys];
    if (!handler || !current) return;
    event.preventDefault();
    handler();
  };
  const tally = `${counts.accepted} accepted · ${counts.skipped} skipped · ${counts.pending} to go`;
  const skipped = cards.filter((card) => card.status === "skipped");
  const cardProps: CardProps = {
    list,
    compose,
    titleRef,
    keysRef,
    busy: busy || list.working,
    ...(running ? { running } : {}),
    pending: counts.pending,
    acceptRest: () => void acceptRest(),
  };

  return (
    <section
      className={cn(panelClass, "flex flex-col gap-3 print:hidden")}
      aria-labelledby={headingId}
      data-testid="shopping-walkthrough"
      onKeyDown={onKeyDown}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="font-semibold">
          Suggestions
        </h2>
        {cards.length > 0 && (
          <span
            className="font-mono text-xs tabular-nums text-muted-foreground"
            aria-hidden
          >
            {tally}
          </span>
        )}
      </div>
      <p
        role="status"
        className={cn("text-sm", message ? "" : "sr-only")}
        data-testid="shopping-walkthrough-status"
      >
        {message}
        {cards.length > 0 && <span className="sr-only"> {tally}.</span>}
      </p>
      {cards.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-hidden>
          {cards.map((card) => (
            <span
              key={card.id}
              className={cn(
                "h-1.5 w-4 rounded-full",
                card.id === current?.id
                  ? "bg-foreground"
                  : card.status === "accepted"
                    ? "bg-primary"
                    : card.status === "pending"
                      ? "bg-border"
                      : "bg-muted-foreground/40",
              )}
            />
          ))}
        </div>
      )}
      <MergeAsks
        list={list}
        {...(asker ? { asker } : {})}
        view={view}
        answered={(text) => {
          setMessage(text);
          setFocusTick((tick) => tick + 1);
        }}
      />
      {current?.source === "built-in" && (
        <BuiltInCard
          key={current.id}
          card={current}
          proposal={current.proposal}
          {...(asker ? { asker } : {})}
          accept={(edit) => accept(current, edit)}
          skip={() => void skip(current)}
          keepApart={() => keepApart(current)}
          decided={(status) => {
            /* Review: an ask's Accept answers the card, so the done state shows. */
            remember(current.id, {
              status: status === "merged" ? "accepted" : "apart",
              proposal: current.proposal,
            });
            setCursor(current.id);
            setViewing(undefined);
          }}
          answered={(text) => {
            setMessage(text);
            setFocusTick((tick) => tick + 1);
          }}
          {...cardProps}
        />
      )}
      {current?.source === "model" && tidy && (
        <ModelCard
          key={`${current.id}:${current.suggestion.revised?.at ?? ""}`}
          card={current}
          suggestion={current.suggestion}
          tidy={tidy}
          model={words(model)}
          accept={(ops) => accept(current, ops ? { ops } : undefined)}
          skip={() => skip(current)}
          ask={(note) => askCard(current, note)}
          {...cardProps}
        />
      )}
      {!current && cards.length > 0 && (
        <div
          className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3.5"
          data-testid="shopping-walkthrough-done"
        >
          <h3
            ref={doneRef}
            tabIndex={-1}
            className="font-display text-lg font-semibold outline-none"
          >
            That’s every suggestion
          </h3>
          <p className="text-sm">
            {counts.accepted === 1
              ? "1 accepted"
              : `${counts.accepted} accepted`}
            {cards.some((card) => card.source === "model") &&
              ", each in Changes, where you can switch it off"}
            .{skipped.length > 0 && ` ${skipped.length} skipped:`}
          </p>
          {skipped.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Skipped">
              {skipped.map((card) => (
                <li key={card.id}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-10 whitespace-normal text-left"
                    onClick={() => reopen(card)}
                  >
                    <span className="sr-only">Reopen: </span>
                    {card.source === "built-in"
                      ? card.proposal.name
                      : card.suggestion.title}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {cards.length === 0 && tidy && !running && (
        <p className="text-sm text-muted-foreground">
          No suggestions to walk through. Tidy with the model below to get some.
        </p>
      )}
      {run && run.leftOut.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer">
            Left out by the check ({run.leftOut.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {run.leftOut.map((why) => (
              <li key={why} className="break-words">
                {why}
              </li>
            ))}
          </ul>
        </details>
      )}
      {tidy && list.canLayer && (
        <TidyControls
          models={tidy.models}
          model={model}
          setModel={setModel}
          on={on}
          setOn={setOn}
          {...(running ? { running } : {})}
          start={() => void startRun()}
          runs={runs}
          {...(run ? { picked: run.id } : {})}
          pick={(id) => {
            setPicked(id);
            setCursor(undefined);
            setViewing(undefined);
            setMessage(
              `Showing the run of ${runs.find((each) => each.id === id)?.model ?? "the model"}.`,
            );
          }}
        />
      )}
    </section>
  );
}
