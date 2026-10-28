"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  ChevronDown,
  Ellipsis,
  GripVertical,
  Plus,
  Refrigerator,
  Flame,
} from "lucide-react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@discontent/component-library/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@discontent/component-library/components/ui/select";
import { cn } from "@discontent/component-library/lib/utils";
import type { GroupItem, GroupItemRef } from "../../controller/types";
import {
  draftChanges,
  draftItems,
  draftScale,
  headsUpLine,
  initialDraft,
  labelRuns,
  moveRow,
  PLAN_CHANGED,
  planItemsKey,
  readLabel,
  removeRow,
  rowCaption,
  scaleBadge,
  scaleOptionValue,
  scaleOptions,
  setRowScale,
  type PlanDraft,
  type PlanRowView,
} from "../../util/planPage";
import { useSearch } from "../SearchForm/SearchContext";
import type { PlanEditor } from "./types";
import { PlanMerge } from "./PlanMerge";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** A recipe's page, at the row's scale. */
export function recipeHref(slug: string, scale?: string): string {
  const badge = scaleBadge(scale);
  return badge && scale
    ? `/recipe/${slug}?scale=${encodeURIComponent(scale.trim())}`
    : `/recipe/${slug}`;
}

/** A label's heading: the day in caps, then the rest muted (canvas B). */
export function LabelHeading({
  label,
  aside,
  className,
}: {
  label: string;
  aside?: ReactNode;
  className?: string;
}) {
  const { day, rest } = readLabel(label);
  return (
    <h3
      className={cn(
        "flex items-baseline gap-2 border-b border-border pt-3.5 pb-1 font-mono uppercase",
        className,
      )}
    >
      <span className="sr-only" data-testid="group-item-label">
        {label}
      </span>
      <span aria-hidden className="contents">
        {day ? (
          <>
            <b className="text-[0.8125rem] leading-[1.125rem] font-semibold tracking-[0.1em]">
              {day}
            </b>
            {rest && (
              <span className="text-xs tracking-[0.08em] text-muted-foreground">
                {rest}
              </span>
            )}
          </>
        ) : (
          <b className="text-[0.8125rem] leading-[1.125rem] font-semibold tracking-[0.08em]">
            {rest}
          </b>
        )}
      </span>
      {aside}
    </h3>
  );
}

/** The heads-up line from the steps, with a fridge or a flame. */
export function HeadsUp({ row }: { row: PlanRowView }) {
  if (!row.recipe) return null;
  const line = headsUpLine(row.recipe.times);
  if (!line) return null;
  const Icon = row.recipe.times.chill ? Refrigerator : Flame;
  return (
    <p
      className="flex items-start gap-1.5 text-[0.8125rem] leading-[1.125rem] text-muted-foreground"
      data-testid="plan-heads-up"
    >
      <Icon aria-hidden className="mt-0.5 size-3 shrink-0" />
      <span>{line}</span>
    </p>
  );
}

/** A square crop of the row's picture (server-rendered, 42c1's images). */
export function Thumb({
  node,
  className,
}: {
  node?: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "shrink-0 overflow-hidden rounded-md bg-muted [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_span]:text-2xl",
        className,
      )}
    >
      {node}
    </div>
  );
}

/** A sub-plan's 2×2 mosaic of member photos. */
export function Mosaic({
  row,
  images,
  className,
}: {
  row: PlanRowView;
  images: Record<string, ReactNode>;
  className?: string;
}) {
  const thumbs = row.group?.thumbs ?? [];
  return (
    <div
      aria-hidden
      className={cn(
        "grid shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-md bg-muted [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_span]:text-xs",
        className,
      )}
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="overflow-hidden bg-muted">
          {thumbs[i] ? images[thumbs[i].slug] : null}
        </div>
      ))}
    </div>
  );
}

/** The sub-plan's own recipes, opened in place (`walkGroupRecipes`). */
export function SubPlanList({
  row,
  made,
  className,
}: {
  row: PlanRowView;
  made?: ReadonlySet<string>;
  className?: string;
}) {
  const recipes = row.group?.recipes ?? [];
  const seen = new Map<string, number>();
  return (
    <ol
      className={cn(
        "flex flex-col gap-2 border-l-2 border-border py-2.5 pr-3 pl-3",
        className,
      )}
      aria-label={`In ${row.group?.name}`}
    >
      {recipes.map((recipe, i) => {
        const n = seen.get(recipe.slug) ?? 0;
        seen.set(recipe.slug, n + 1);
        const key =
          n === 0 ? `recipe:${recipe.slug}` : `recipe:${recipe.slug}#${n}`;
        const done = made?.has(key);
        return (
          <li
            key={`${i}-${recipe.slug}`}
            className="flex min-h-7 items-baseline gap-2.5 text-sm"
          >
            <span className="w-4 font-mono text-xs text-muted-foreground tabular-nums">
              {i + 1}
            </span>
            {recipe.found ? (
              <Link
                href={`/recipe/${recipe.slug}`}
                className={cn(
                  "underline-offset-4 hover:underline",
                  done && "text-muted-foreground line-through",
                  FOCUS,
                )}
              >
                {recipe.name}
              </Link>
            ) : (
              <span className="text-muted-foreground">
                Recipe not found: {recipe.slug}
              </span>
            )}
          </li>
        );
      })}
      {row.group?.truncated && (
        <li className="font-mono text-xs text-muted-foreground">and more…</li>
      )}
    </ol>
  );
}

/** The row's body: name, caption, heads-up and note — or the dangle. */
function RowBody({
  row,
  scale,
  expanded,
  onToggle,
}: {
  row: PlanRowView;
  scale?: string;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  if (row.missing) {
    return (
      <p
        className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
        data-testid="group-item-missing"
      >
        {row.missing}
      </p>
    );
  }
  if (row.group) {
    const count = row.group.recipes.length;
    return (
      <div
        className="flex min-w-0 flex-col gap-0.5"
        data-testid="group-item-group"
      >
        <Link
          href={`/group/${row.group.slug}`}
          className={cn(
            "font-display text-base leading-[1.375rem] font-semibold tracking-[-0.01em] underline-offset-4 hover:underline",
            FOCUS,
          )}
        >
          {row.group.name}
        </Link>
        <p className="flex flex-wrap items-center gap-x-2 font-mono text-xs text-muted-foreground tabular-nums">
          plan · {count} {count === 1 ? "recipe" : "recipes"}
          {onToggle && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={onToggle}
              className={cn(
                "inline-flex min-h-6 items-center gap-1 rounded-sm px-1 text-foreground hover:text-primary",
                FOCUS,
              )}
            >
              {expanded ? "Hide its recipes" : "Show its recipes"}
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-3.5 transition-transform",
                  expanded && "rotate-180",
                )}
              />
            </button>
          )}
        </p>
        {row.item.note && (
          <p className="text-sm text-muted-foreground">{row.item.note}</p>
        )}
      </div>
    );
  }
  const recipe = row.recipe!;
  return (
    <div className="flex min-w-0 flex-col gap-[3px]">
      <Link
        href={recipeHref(recipe.slug, scale)}
        className={cn(
          "font-display text-base leading-[1.375rem] font-semibold tracking-[-0.01em] underline-offset-4 hover:underline",
          FOCUS,
        )}
      >
        {recipe.name}
      </Link>
      <p className="font-mono text-xs text-muted-foreground tabular-nums">
        {rowCaption(recipe, scale)}
      </p>
      <HeadsUp row={row} />
      {row.item.note && (
        <p className="text-sm text-muted-foreground">{row.item.note}</p>
      )}
    </div>
  );
}

/** The scale select (signed in, recipe rows): ½× · 1× · 1½× · 2× · 3× · 4×. */
function ScaleSelect({
  name,
  value,
  onChange,
}: {
  name: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  const badge = scaleBadge(value) ?? "1×";
  return (
    <Select value={scaleOptionValue(value)} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        aria-label={`Scale for ${name}: ${badge}`}
        data-testid={scaleBadge(value) ? "group-item-scale" : undefined}
        className="min-w-16 font-mono tabular-nums"
      >
        {/* The badge's own words, for the read-only row's text (32-D4). */}
        <span className="sr-only">Scale </span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {scaleOptions(value).map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Move up, Move down, Remove from the plan — the keyboard's way to reorder. */
function RowMenu({
  name,
  position,
  count,
  onMove,
  onRemove,
}: {
  name: string;
  position: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const item = cn(
    "flex min-h-9 w-full items-center rounded-md px-2.5 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:hover:bg-transparent",
    FOCUS,
  );
  const act = (run: () => void) => () => {
    run();
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Move or remove ${name}`}
        >
          <Ellipsis aria-hidden className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1.5">
        <ul className="flex flex-col" aria-label={`Move or remove ${name}`}>
          <li>
            <button
              type="button"
              className={item}
              disabled={position === 0}
              onClick={act(() => onMove(position - 1))}
            >
              Move up
            </button>
          </li>
          <li>
            <button
              type="button"
              className={item}
              disabled={position === count - 1}
              onClick={act(() => onMove(position + 1))}
            >
              Move down
            </button>
          </li>
          <li>
            <button
              type="button"
              className={cn(item, "text-destructive")}
              onClick={act(onRemove)}
            >
              Remove from the plan
            </button>
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** What the Add field can name: recipes, and the other plans. */
interface Candidate {
  ref: GroupItemRef;
  name: string;
  kind: "recipe" | "plan";
}

function useCandidates(slug: string): Candidate[] {
  const { allRecipes, allGroups } = useSearch();
  return useMemo(
    () => [
      ...allRecipes.map((recipe): Candidate => ({
        ref: { recipe: recipe.slug },
        name: recipe.name,
        kind: "recipe",
      })),
      ...allGroups
        .filter((group) => group.slug !== slug)
        .map((group): Candidate => ({
          ref: { group: group.slug },
          name: group.name,
          kind: "plan",
        })),
    ],
    [allRecipes, allGroups, slug],
  );
}

const SUGGESTIONS = 6;

/**
 * "Add a recipe or a plan by name": one commit per add (`addItem`). Waits
 * while the list has unsaved changes, so an add never lands under a reorder
 * that has not been written (Dp1-4).
 */
function AddField({
  slug,
  editor,
  blocked,
}: {
  slug: string;
  editor: PlanEditor;
  blocked: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const candidates = useCandidates(slug);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: boolean; text: string }>();
  const query = text.trim().toLowerCase();
  const matches = useMemo(() => {
    if (query.length < 2) return [];
    const starts: Candidate[] = [];
    const contains: Candidate[] = [];
    for (const candidate of candidates) {
      const name = candidate.name.toLowerCase();
      if (name.startsWith(query)) starts.push(candidate);
      else if (name.includes(query)) contains.push(candidate);
    }
    return [...starts, ...contains].slice(0, SUGGESTIONS);
  }, [candidates, query]);

  async function add(candidate: Candidate | undefined) {
    if (!candidate) {
      setMessage({
        error: true,
        text: text.trim()
          ? `No recipe or plan is called “${text.trim()}”.`
          : "Type a recipe's or a plan's name.",
      });
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await editor.addItem(candidate.ref);
      if ("error" in result) {
        setMessage({ error: true, text: result.error });
      } else {
        setText("");
        setMessage({ text: `Added ${candidate.name}.` });
        router.refresh();
      }
    } catch {
      setMessage({
        error: true,
        text: "Couldn't reach the editor — check the connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 pt-4 print:hidden">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const exact = candidates.find(
            (candidate) => candidate.name.toLowerCase() === query,
          );
          void add(exact ?? matches[0]);
        }}
      >
        <label htmlFor={id} className="sr-only">
          Add a recipe or a plan
        </label>
        <div className="relative flex-1">
          <Plus
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={id}
            value={text}
            disabled={blocked || busy}
            placeholder="Add a recipe or a plan by name"
            autoComplete="off"
            aria-describedby={`${id}-hint`}
            className="h-10 pl-9"
            onChange={(event) => {
              setText(event.target.value);
              setMessage(undefined);
            }}
          />
        </div>
        <Button type="submit" disabled={blocked || busy} className="h-10">
          Add
        </Button>
      </form>
      <p id={`${id}-hint`} className="sr-only">
        {blocked
          ? "Save or undo the changes above first."
          : "Type two letters or more; the matches show below."}
      </p>
      {blocked && (
        <p className="font-mono text-xs text-muted-foreground">
          Save or undo the changes above first.
        </p>
      )}
      {!blocked && matches.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Matches">
          {matches.map((candidate) => (
            <li
              key={`${candidate.kind}:${"recipe" in candidate.ref ? candidate.ref.recipe : candidate.ref.group}`}
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void add(candidate)}
              >
                <Plus aria-hidden className="size-3.5" />
                {candidate.name}
                {candidate.kind === "plan" && (
                  <span className="font-mono text-xs text-muted-foreground">
                    plan
                  </span>
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={cn(
            "text-sm",
            message.error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/**
 * Plan mode's list (canvas B): the rows in order, under their label
 * headings, each with its number, picture, name, "time · yield · N
 * ingredients", the heads-up line from its steps and — signed in — a drag
 * handle, a scale select and a row menu. Reorder, scale and remove are a
 * draft until **Save**, which writes them as one commit (D5); Undo drops it.
 */
export function PlanList({
  slug,
  rows,
  images,
  editor,
}: {
  slug: string;
  rows: PlanRowView[];
  images: Record<string, ReactNode>;
  editor?: PlanEditor;
}) {
  const router = useRouter();
  const items = useMemo(() => rows.map((row) => row.item), [rows]);
  /*
   * The draft belongs to the rows it was made over: once the server's rows
   * change (this Save landing, an Add, another tab's write) it starts over.
   * Held with the rows' key rather than reset by remounting, so the Add
   * field's "Added …" survives the refresh that follows it.
   */
  const rowsKey = useMemo(() => JSON.stringify(items), [items]);
  const [held, setHeld] = useState<{ key: string; draft: PlanDraft }>(() => ({
    key: rowsKey,
    draft: initialDraft(rows.length),
  }));
  const draft = held.key === rowsKey ? held.draft : initialDraft(rows.length);
  const setDraft = (change: PlanDraft | ((current: PlanDraft) => PlanDraft)) =>
    setHeld((current) => {
      const base =
        current.key === rowsKey ? current.draft : initialDraft(rows.length);
      return {
        key: rowsKey,
        draft: typeof change === "function" ? change(base) : change,
      };
    });
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [dragging, setDragging] = useState<number | null>(null);
  const [armed, setArmed] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  /*
   * After a Save lands, the bar stays disabled until the refreshed rows do
   * (and the draft resets over them): no flash back to "2 changes", no
   * second Save of the same draft over the first.
   */
  const [refreshing, startRefresh] = useTransition();
  const busy = saving || refreshing;
  const [error, setError] = useState<string>();
  const changes = editor ? draftChanges(draft, items) : 0;
  /* The rows' names by `recipe:<slug>` / `group:<slug>`, for a merge's lines. */
  const baseNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const row of rows) {
      const { item } = row;
      const key =
        item.group !== undefined
          ? `group:${item.group}`
          : `recipe:${item.recipe}`;
      const name = row.recipe?.name ?? row.group?.name;
      if (name) names[key] = name;
    }
    return names;
  }, [rows]);
  const ordered = draft.order.map((index) => ({ row: rows[index], index }));
  const runs = labelRuns(ordered.map(({ row }) => row));
  const editable = Boolean(editor);

  const toggle = (index: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  async function save() {
    if (!editor || busy) return;
    setSaving(true);
    setError(undefined);
    try {
      const result = await editor.saveItems(
        draftItems(draft, items),
        planItemsKey(items),
      );
      if ("error" in result) setError(result.error);
      else startRefresh(() => router.refresh());
    } catch {
      setError(
        "Couldn't reach the editor — check the connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label="In this plan, in order"
      className="flex min-w-0 flex-[999_1_560px] flex-col"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-border pb-2">
        <h2 className="font-display text-xl font-semibold tracking-[-0.025em]">
          In order
        </h2>
        {changes > 0 ? (
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="plan-save-bar"
          >
            <span
              className="font-mono text-xs text-muted-foreground"
              role="status"
            >
              {changes} {changes === 1 ? "change" : "changes"} · not saved
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setDraft(initialDraft(rows.length));
                setError(undefined);
              }}
            >
              Undo
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : (
          editable && (
            <span className="font-mono text-xs text-muted-foreground max-sm:hidden">
              drag to reorder · scale per row
            </span>
          )
        )}
      </div>
      {error && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-2">
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
          {/* 46h (43-Dp1-11): refused, then offered a merge with the draft. */}
          {editor && error === PLAN_CHANGED && (
            <PlanMerge
              editor={editor}
              base={items}
              mine={draft.order.map((index, position) => ({
                item: draftItems(draft, items)[position],
                base: index,
              }))}
              baseNames={baseNames}
              onMerged={() => {
                setError(undefined);
                startRefresh(() => router.refresh());
              }}
            />
          )}
        </div>
      )}
      {ordered.length === 0 ? (
        <p className="py-4 text-muted-foreground" data-testid="group-empty">
          {rows.length === 0
            ? "This plan has nothing in it yet."
            : "Every row is set to come off. Save to empty the plan, or Undo."}
        </p>
      ) : (
        runs.map((run, r) => (
          <div key={`${r}-${run.label ?? ""}`}>
            {run.label && <LabelHeading label={run.label} />}
            <ol>
              {run.rows.map(({ index: position }) => {
                const { row, index } = ordered[position];
                const scale = row.recipe
                  ? draftScale(draft, index, row.item)
                  : undefined;
                const name =
                  row.recipe?.name ??
                  row.group?.name ??
                  row.missing ??
                  "this row";
                const isOpen = expanded.has(index);
                return (
                  <li
                    key={`${index}-${row.item.group ?? row.item.recipe}`}
                    data-testid="group-item"
                    draggable={editable && armed === position}
                    onDragStart={(event) => {
                      setDragging(position);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(
                        "text/plain",
                        String(position),
                      );
                    }}
                    onDragOver={(event) => {
                      if (dragging === null) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragging !== null) {
                        setDraft((current) =>
                          moveRow(current, dragging, position),
                        );
                      }
                      setDragging(null);
                      setArmed(null);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setArmed(null);
                    }}
                    className={cn(
                      "border-b border-border py-3",
                      dragging === position && "opacity-50",
                    )}
                  >
                    <div
                      className={cn(
                        "grid items-center gap-3.5 sm:gap-x-3.5",
                        editable
                          ? "grid-cols-[24px_48px_minmax(0,1fr)_auto] sm:grid-cols-[20px_24px_72px_minmax(0,1fr)_auto]"
                          : "grid-cols-[24px_48px_minmax(0,1fr)_auto] sm:grid-cols-[24px_72px_minmax(0,1fr)_auto]",
                      )}
                    >
                      {editable && (
                        <span
                          aria-hidden
                          title="Drag to reorder"
                          className="hidden cursor-grab text-muted-foreground sm:inline-flex"
                          onPointerDown={() => setArmed(position)}
                          onPointerUp={() => setArmed(null)}
                        >
                          <GripVertical className="size-4" />
                        </span>
                      )}
                      <span className="font-mono text-[0.8125rem] leading-5 font-medium text-muted-foreground tabular-nums">
                        {position + 1}
                      </span>
                      {row.group ? (
                        <Mosaic
                          row={row}
                          images={images}
                          className="size-12 sm:size-[72px]"
                        />
                      ) : (
                        <Thumb
                          node={
                            row.recipe ? images[row.recipe.slug] : undefined
                          }
                          className="size-12 sm:size-[72px]"
                        />
                      )}
                      <RowBody
                        row={row}
                        scale={scale}
                        expanded={isOpen}
                        onToggle={row.group ? () => toggle(index) : undefined}
                      />
                      <div className="flex items-center gap-1">
                        {row.recipe && editable ? (
                          <ScaleSelect
                            name={row.recipe.name}
                            value={scale}
                            onChange={(value) =>
                              setDraft((current) =>
                                setRowScale(
                                  current,
                                  index,
                                  value === "1" ? "" : value,
                                ),
                              )
                            }
                          />
                        ) : scaleBadge(scale) ? (
                          <Badge
                            variant="secondary"
                            className="font-mono tabular-nums"
                            data-testid="group-item-scale"
                          >
                            <span className="sr-only">Scale </span>
                            {scaleBadge(scale)}
                          </Badge>
                        ) : null}
                        {editable && (
                          <RowMenu
                            name={name}
                            position={position}
                            count={ordered.length}
                            onMove={(to) =>
                              setDraft((current) =>
                                moveRow(current, position, to),
                              )
                            }
                            onRemove={() =>
                              setDraft((current) =>
                                removeRow(current, position),
                              )
                            }
                          />
                        )}
                      </div>
                    </div>
                    {row.group && isOpen && (
                      <SubPlanList
                        row={row}
                        className="mt-1.5 ml-[54px] sm:ml-[110px]"
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ))
      )}
      {editor && <AddField slug={slug} editor={editor} blocked={changes > 0} />}
      <p className="pt-2.5 font-mono text-xs text-muted-foreground">
        Heads-ups come from each recipe&rsquo;s steps.
        {editor ? " Reorder and scale save together, as one commit." : ""}
      </p>
    </section>
  );
}

export type { GroupItem };
