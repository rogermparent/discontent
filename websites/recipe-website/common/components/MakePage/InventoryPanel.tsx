"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import { cn } from "@discontent/component-library/lib/utils";
import { PANTRY_STAPLES } from "../../util/makeable";
import { inventoryKey, parseInventoryText } from "../../util/inventoryText";
import type { CountFrom, Inventory, MakeSettings } from "./useInventory";
import { ImportExportDialog } from "./ImportExportDialog";
import { AddField, type AddCandidate } from "./AddField";
import {
  AddToSavedForm,
  SaveConfirm,
  type InventoryDiff,
  type SavedListEdit,
} from "./SavedInventory";
import { isFeatured } from "./kinds";
import { TapeLabel } from "./Tape";

/**
 * "Assume pantry staples" (U5): on by default, per browser, and it says what
 * it assumes — `PANTRY_STAPLES`, the list the server seats use too.
 */
function PantrySwitch({ settings }: { settings: MakeSettings }) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="flex items-start gap-2.5" data-testid="pantry-staples">
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-describedby={hintId}
        className="mt-0.5 size-4 shrink-0 accent-primary"
        checked={settings.pantryStaples}
        onChange={(event) => settings.setPantryStaples(event.target.checked)}
      />
      <span className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          Assume pantry staples
        </label>
        <span id={hintId} className="font-mono text-xs text-muted-foreground">
          {PANTRY_STAPLES.join(", ")}
        </span>
      </span>
    </div>
  );
}

/**
 * "Assume I always have" (32j): the staples the matcher counts as on hand —
 * salt, black pepper, water and ice until edited — kept in this browser
 * beside the list. Folded away by default; the summary says how many.
 */
function StaplesEditor({ settings }: { settings: MakeSettings }) {
  const {
    alwaysHave: staples,
    setStaples,
    resetStaples,
    defaultStaples,
    staplesNotice,
  } = settings;
  const [draft, setDraft] = useState("");
  const inputId = useId();
  return (
    <details className="rounded-md border px-3 py-2" data-testid="staples">
      <summary className="cursor-pointer text-xs font-semibold">
        Assume I always have ({staples.length})
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {staples.length > 0 && (
          <ul
            className="flex flex-wrap gap-1.5"
            aria-label="Assumed on hand"
            data-testid="staples-chips"
          >
            {staples.map((item) => (
              <li
                key={inventoryKey(item)}
                className="inline-flex items-center rounded-full border text-xs"
              >
                <span className="pl-2.5 pr-1 py-0.5">{item}</span>
                <button
                  type="button"
                  aria-label={`Stop assuming ${item}`}
                  className="mr-1 rounded-full p-0.5 hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() =>
                    setStaples(
                      staples.filter(
                        (kept) => inventoryKey(kept) !== inventoryKey(item),
                      ),
                    )
                  }
                >
                  <X aria-hidden className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const { items } = parseInventoryText(draft);
            if (items.length > 0) setStaples([...staples, ...items]);
            setDraft("");
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Add to what I always have
          </label>
          <Input
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="e.g. olive oil"
            autoComplete="off"
            className="h-8 text-xs"
          />
          <Button type="submit" size="sm" variant="outline" className="h-8">
            Add
          </Button>
        </form>
        {!defaultStaples && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-start h-7 px-2 text-xs"
            onClick={resetStaples}
          >
            Reset to salt, pepper, water, ice
          </Button>
        )}
        <p
          role="status"
          className="text-xs text-muted-foreground empty:hidden"
          data-testid="staples-notice"
        >
          {staplesNotice}
        </p>
      </div>
    </details>
  );
}

/** "Count close matches (≈) as had" (32j), per browser. */
function CloseSwitch({ settings }: { settings: MakeSettings }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        data-testid="make-count-close"
        className="mt-0.5 size-4 shrink-0 accent-primary"
        checked={settings.countClose}
        onChange={(event) => settings.setCountClose(event.target.checked)}
      />
      <label htmlFor={id} className="text-sm">
        Count close matches (≈) as had{" "}
        <span className="text-muted-foreground">
          — onion for a shallot, olive oil for vegetable oil
        </span>
      </label>
    </div>
  );
}

/** The page's second list (41h): whose it is, for its labels and copy. */
export interface SecondList {
  /** `saved`: the signed-in editor's saved list. `house`: the export's snapshot. */
  kind: "saved" | "house";
  items: string[];
}

const SECOND_COPY = {
  saved: { segment: "Saved list", where: "in the editor" },
  house: { segment: "House list", where: "shared with this site" },
} as const;

/**
 * "Count from" (41h): a three-way control of native radios — the arrow
 * keys move between them — with each list's size. Shown only when the page
 * has a second list.
 */
function CountFromControl({
  value,
  onChange,
  browser,
  second,
  union,
}: {
  value: CountFrom;
  onChange: (value: CountFrom) => void;
  browser: number;
  second: SecondList;
  union: number;
}) {
  const name = useId();
  const options: [CountFrom, string, number][] = [
    ["browser", "This browser", browser],
    ["saved", SECOND_COPY[second.kind].segment, second.items.length],
    ["both", "Both", union],
  ];
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0" data-testid="make-source">
      <legend className="mb-2 p-0 font-mono text-[0.72rem] tracking-[0.08em] text-muted-foreground uppercase">
        Count from
      </legend>
      <div className="grid grid-cols-3 overflow-hidden rounded-md border border-input">
        {options.map(([option, label, count], i) => {
          const checked = value === option;
          return (
            <label
              key={option}
              className={cn(
                "relative cursor-pointer px-1 py-1.5 text-center text-[0.82rem] leading-tight",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-[3px] has-[:focus-visible]:outline-ring",
                i > 0 && "border-l border-border",
                checked
                  ? "bg-foreground text-background"
                  : "hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={checked}
                onChange={() => onChange(option)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              {label}{" "}
              <small className="block font-mono text-[0.7rem] opacity-80">
                {count} {count === 1 ? "item" : "items"}
              </small>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Save to editor's state, owned by the page (it holds the saved list). */
export interface SaveToEditor {
  saved: string[];
  pending: boolean;
  error?: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  save: (diff: InventoryDiff) => void;
}

/**
 * The shelf (41h): what's on hand, as tape labels. A sticky column beside
 * the results on wide screens; above them on a phone, behind a disclosure
 * button that says what it holds ("16 on hand · lime featured"), open to
 * begin with.
 *
 * - **Labels**: tap the body to feature the ingredient (it narrows the whole
 *   page — `toggleFeature`), × to take it off (Undo in the toast). Each says
 *   its pull: how many of the recipes you can make now use it.
 * - **Clear** empties this browser's list at once (Undo); **Save to editor**
 *   (signed-in editor only) shows the diff before it commits.
 * - **Count from** (only with a second list): which list every count judges;
 *   in Saved or Both the second list's labels show as their own outlined
 *   group, featurable, with "Copy it to this browser" (Undo). The signed-in
 *   editor's saved list is also editable there item by item (42a,
 *   `savedEdit`): each label's × and "Add to saved list" commit at once,
 *   with Undo. The house list (the export, an editor guest) never is.
 * - The judge's settings — pantry staples, "Assume I always have", close
 *   matches — and Import / export.
 *
 * Each label's × is a **sibling** of its body, so each has a name of its own
 * ("Remove vodka") and nothing interactive nests.
 */
export function InventoryPanel({
  inventory,
  settings,
  second,
  union,
  featured,
  pulls,
  landed,
  suggest,
  onAdd,
  onRemove,
  onClear,
  onCopySecond,
  onToggleFeature,
  saveToEditor,
  savedEdit,
  inputRef,
  dialogOpen,
  onDialogOpenChange,
}: {
  inventory: Inventory;
  settings: MakeSettings;
  second?: SecondList;
  /** Items in this browser's list and the second together. */
  union: number;
  featured: string[];
  pulls: Map<string, number>;
  /** The item just added, by `inventoryKey`: it lands. */
  landed?: string;
  suggest: (typed: string) => AddCandidate[];
  onAdd: (items: string[]) => void;
  onRemove: (item: string) => void;
  onClear: () => void;
  onCopySecond: () => void;
  onToggleFeature: (item: string) => void;
  saveToEditor?: SaveToEditor;
  /** Per-item edits of the saved list (42a): signed-in editor only. */
  savedEdit?: SavedListEdit;
  inputRef: RefObject<HTMLInputElement | null>;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
}) {
  const { have, setHave } = inventory;
  const [open, setOpen] = useState(true);
  const panelId = useId();
  const headingId = useId();
  const source = second ? settings.source : "browser";
  /* In Saved, this browser's labels stay on the shelf but count for nothing. */
  const browserCounted = source !== "saved";
  const countedSize =
    source === "saved"
      ? (second?.items.length ?? 0)
      : source === "both"
        ? union
        : have.length;

  /* After a label's ×, focus goes to the label that took its place (or the
   * one before it, or the add field) rather than to the page's body. */
  const listRef = useRef<HTMLUListElement>(null);
  const focusAfterRemove = useRef<number | null>(null);
  useEffect(() => {
    const at = focusAfterRemove.current;
    if (at === null) return;
    focusAfterRemove.current = null;
    const bodies = listRef.current?.querySelectorAll<HTMLButtonElement>(
      ":scope > li > button:first-child",
    );
    const target = bodies?.length
      ? bodies[Math.min(at, bodies.length - 1)]
      : inputRef.current;
    target?.focus();
  }, [have, inputRef]);

  /* The saved list's × commits first and the label goes when the server's
   * list comes back; focus then moves the same way — unless it has gone
   * somewhere else meanwhile. */
  const editable = second?.kind === "saved" ? savedEdit : undefined;
  const secondListRef = useRef<HTMLUListElement>(null);
  const addSavedRef = useRef<HTMLDivElement>(null);
  const focusAfterSavedRemove = useRef<number | null>(null);
  const secondItems = second?.items;
  useEffect(() => {
    const at = focusAfterSavedRemove.current;
    if (at === null) return;
    const active = document.activeElement;
    if (active && active !== document.body) {
      if (!secondListRef.current?.contains(active)) {
        focusAfterSavedRemove.current = null;
      }
      return;
    }
    focusAfterSavedRemove.current = null;
    const bodies = secondListRef.current?.querySelectorAll<HTMLButtonElement>(
      ":scope > li > button:first-child",
    );
    const target = bodies?.length
      ? bodies[Math.min(at, bodies.length - 1)]
      : addSavedRef.current?.querySelector("input");
    target?.focus();
  }, [secondItems]);

  return (
    <aside
      aria-labelledby={headingId}
      data-testid="make-shelf"
      className="min-w-0 lg:sticky lg:top-[calc(var(--sticky-chrome-offset)+1rem)] lg:max-h-[calc(100vh-var(--sticky-chrome-offset)-2rem)] lg:overflow-y-auto lg:pr-1 lg:pb-2"
    >
      <button
        type="button"
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-left lg:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <span className="font-display text-base font-bold">
            {countedSize} on hand
          </span>
          {featured.length > 0 && (
            <span className="font-mono text-xs text-muted-foreground">
              {" "}
              · {featured.join(" and ")} featured
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </button>
      <div
        id={panelId}
        className={cn(
          "mt-3 grid gap-4 p-0.5 lg:mt-0",
          !open && "hidden lg:grid",
        )}
      >
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-2">
          <h2
            id={headingId}
            className="m-0 hidden font-display text-xl leading-none font-bold lg:block"
          >
            On hand
          </h2>
          <span
            aria-hidden
            className="hidden font-mono text-xs text-muted-foreground lg:inline"
          >
            {have.length}
          </span>
          <div className="ml-auto flex gap-1.5">
            {saveToEditor && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-expanded={saveToEditor.open}
                onClick={() => saveToEditor.setOpen(!saveToEditor.open)}
              >
                Save to editor
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={have.length === 0}
              onClick={onClear}
            >
              Clear
            </Button>
          </div>
        </div>
        {saveToEditor?.open && (
          <SaveConfirm
            browser={have}
            saved={saveToEditor.saved}
            pending={saveToEditor.pending}
            error={saveToEditor.error}
            onSave={saveToEditor.save}
            onCancel={() => saveToEditor.setOpen(false)}
          />
        )}
        <AddField suggest={suggest} onAdd={onAdd} inputRef={inputRef} />
        {have.length > 0 ? (
          <>
            <ul
              ref={listRef}
              className="m-0 flex list-none flex-wrap gap-x-1.5 gap-y-2 p-0"
              data-testid="inventory-chips"
              aria-label={
                browserCounted
                  ? "This browser's list"
                  : "This browser's list, not counted"
              }
            >
              {have.map((item, i) => (
                <TapeLabel
                  key={inventoryKey(item)}
                  item={item}
                  counted={browserCounted}
                  featured={isFeatured(item, featured)}
                  pull={browserCounted ? pulls.get(item) : undefined}
                  landed={landed === inventoryKey(item)}
                  onFeature={() => onToggleFeature(item)}
                  onRemove={() => {
                    focusAfterRemove.current = i;
                    onRemove(item);
                  }}
                />
              ))}
            </ul>
            {!browserCounted && second && (
              <p
                className="m-0 text-xs text-muted-foreground"
                data-testid="make-not-counted"
              >
                Not counted — switch Count from to This browser or Both to
                include them.
              </p>
            )}
          </>
        ) : (
          <p className="m-0 rounded border-[1.5px] border-dashed border-input p-3 text-sm text-muted-foreground">
            The list is empty. Add what&apos;s in the bar or the fridge
            {second
              ? `, or count from the ${SECOND_COPY[second.kind].segment.toLowerCase()} below.`
              : "."}
          </p>
        )}
        {second && (
          <CountFromControl
            value={source}
            onChange={settings.setSource}
            browser={have.length}
            second={second}
            union={union}
          />
        )}
        {second && source !== "browser" && (
          <div className="grid gap-2" data-testid="make-second-list">
            <h3 className="m-0 flex flex-wrap items-baseline gap-2 text-sm font-semibold">
              {SECOND_COPY[second.kind].segment}{" "}
              <span className="font-mono text-xs font-normal text-muted-foreground">
                {SECOND_COPY[second.kind].where} · {second.items.length}
              </span>
            </h3>
            {second.items.length > 0 ? (
              <ul
                ref={secondListRef}
                className="m-0 flex list-none flex-wrap gap-x-1.5 gap-y-2 p-0"
                aria-label={`The ${SECOND_COPY[second.kind].segment.toLowerCase()}`}
                aria-busy={editable?.pending || undefined}
                data-testid="make-second-labels"
              >
                {second.items.map((item, i) => (
                  <TapeLabel
                    key={inventoryKey(item)}
                    item={item}
                    kind="saved"
                    featured={isFeatured(item, featured)}
                    pull={pulls.get(item)}
                    onFeature={() => onToggleFeature(item)}
                    onRemove={
                      editable
                        ? () => {
                            focusAfterSavedRemove.current = i;
                            editable.remove(item);
                          }
                        : undefined
                    }
                    removeLabel={`Remove ${item} from the saved list`}
                  />
                ))}
              </ul>
            ) : (
              <p className="m-0 text-sm text-muted-foreground">It is empty.</p>
            )}
            {editable && (
              <div ref={addSavedRef} className="grid gap-1">
                <AddToSavedForm edit={editable} />
                {editable.error && (
                  <p role="alert" className="m-0 text-xs text-destructive">
                    {editable.error}
                  </p>
                )}
              </div>
            )}
            <div>
              <Button
                type="button"
                size="sm"
                variant="link"
                className="h-auto min-h-6 px-0"
                disabled={second.items.length === 0}
                onClick={onCopySecond}
              >
                Copy it to this browser
              </Button>
            </div>
          </div>
        )}
        <div className="grid gap-3">
          <PantrySwitch settings={settings} />
          <StaplesEditor settings={settings} />
          <CloseSwitch settings={settings} />
        </div>
        <div className="flex flex-wrap gap-2">
          <ImportExportDialog
            have={have}
            setHave={setHave}
            open={dialogOpen}
            onOpenChange={onDialogOpenChange}
          />
        </div>
      </div>
    </aside>
  );
}
