"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, ListPlus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@discontent/component-library/components/ui/popover";
import { cn } from "@discontent/component-library/lib/utils";
import {
  MAIN_SHOPPING_LIST,
  listSummaryText,
  shoppingListHref,
  type ShoppingListSummary,
} from "../../util/shoppingLists";
import { isActionError, type ShoppingActionResult } from "./useShoppingList";

/** The list a page is on, as the server read it. */
export interface CurrentShoppingList {
  id: string;
  name: string;
  main?: true;
  plan?: string;
  archived?: true;
}

/** A list write's answer, as the editor's actions give it. */
export interface ShoppingListAnswer {
  list: ShoppingListSummary;
  lists: ShoppingListSummary[];
  changed: boolean;
  warnings?: string[];
}

/**
 * 50d: the page's lists and the editor's list actions, passed in as props
 * as the other actions are, so nothing here imports the editor.
 */
export interface ShoppingListsSurface {
  /** Every list not deleted, the main list first. */
  lists: ShoppingListSummary[];
  /** The meal plans "New from a meal plan…" offers, newest first. */
  plans: { slug: string; name: string }[];
  create(input: {
    name?: string;
    plan?: string;
  }): Promise<ShoppingActionResult<ShoppingListAnswer>>;
  edit(input: {
    id: string;
    name?: string;
    archived?: boolean;
  }): Promise<ShoppingActionResult<ShoppingListAnswer>>;
}

type Mode = "menu" | "new" | "plan" | "rename" | "delete";

const UNREACHABLE =
  "Couldn't reach the editor — check the connection and try again.";

const itemClass =
  "flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * 50d (Dd7): `/shopping`'s list switcher — the current list's name with a
 * menu: the lists (item counts, the plan a list was made from), New list,
 * New from a meal plan…, Rename and Delete. A list is its own address
 * (`/shopping?list=<id>`), so switching is a link; a new list opens.
 */
export function ListSwitcher({
  current,
  surface,
}: {
  current: CurrentShoppingList;
  surface: ShoppingListsSurface;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  /*
   * Review 4: a mode swaps the popover's content, the focused button with
   * it. Going in, focus lands on the form's field or Keep it; coming back,
   * on the item that opened the mode.
   */
  const contentRef = useRef<HTMLDivElement>(null);
  const cameFrom = useRef<Mode | undefined>(undefined);
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    if (mode === "menu") {
      const from = cameFrom.current;
      cameFrom.current = undefined;
      if (from) {
        root.querySelector<HTMLElement>(`[data-opens="${from}"]`)?.focus();
      }
      return;
    }
    cameFrom.current = mode;
    root
      .querySelector<HTMLElement>(
        mode === "delete" ? "[data-keep]" : "input, select",
      )
      ?.focus();
  }, [mode]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("");
  const nameId = useId();
  const planId = useId();
  const isMain = current.id === MAIN_SHOPPING_LIST;

  const reset = (next: Mode = "menu") => {
    setMode(next);
    setError(undefined);
    setName(next === "rename" ? current.name : "");
    setPlan("");
  };

  const send = async (
    call: () => Promise<ShoppingActionResult<ShoppingListAnswer>>,
    then: (answer: ShoppingListAnswer) => void,
  ) => {
    setBusy(true);
    setError(undefined);
    try {
      const answer = await call();
      if (isActionError(answer)) {
        setError(answer.error);
        return;
      }
      setOpen(false);
      reset();
      then(answer);
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  };

  const chosenPlan = surface.plans.find((each) => each.slug === plan);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            cameFrom.current = undefined;
            reset();
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 max-w-full"
            data-testid="shopping-list-switcher"
          >
            <span className="sr-only">Shopping list: </span>
            <span className="truncate font-semibold">{current.name}</span>
            <ChevronDown aria-hidden className="size-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          ref={contentRef}
          align="start"
          className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 p-2"
          data-testid="shopping-list-menu"
        >
          {mode === "menu" ? (
            <>
              <nav aria-label="Shopping lists">
                <ul className="flex flex-col">
                  {surface.lists.map((list) => {
                    const here = list.id === current.id;
                    return (
                      <li key={list.id}>
                        <Link
                          href={shoppingListHref(list.id)}
                          className={cn(itemClass, here && "font-semibold")}
                          aria-current={here ? "page" : undefined}
                          data-testid="shopping-list-choice"
                          onClick={() => setOpen(false)}
                        >
                          <Check
                            aria-hidden
                            className={cn(
                              "size-4 shrink-0",
                              here ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {listSummaryText(list)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              <div className="flex flex-col border-t border-border pt-2">
                <button
                  type="button"
                  className={itemClass}
                  data-opens="new"
                  onClick={() => reset("new")}
                >
                  <ListPlus aria-hidden className="size-4" />
                  New list
                </button>
                {surface.plans.length > 0 && (
                  <button
                    type="button"
                    className={itemClass}
                    data-opens="plan"
                    onClick={() => reset("plan")}
                  >
                    <ListPlus aria-hidden className="size-4" />
                    New from a meal plan…
                  </button>
                )}
                {!isMain && (
                  <>
                    <button
                      type="button"
                      className={itemClass}
                      data-opens="rename"
                      onClick={() => reset("rename")}
                    >
                      <Pencil aria-hidden className="size-4" />
                      Rename
                    </button>
                    <button
                      type="button"
                      className={cn(itemClass, "text-destructive")}
                      data-opens="delete"
                      onClick={() => reset("delete")}
                    >
                      <Trash2 aria-hidden className="size-4" />
                      Delete
                    </button>
                  </>
                )}
              </div>
            </>
          ) : mode === "delete" ? (
            <div
              className="flex flex-col gap-2 p-2"
              role="group"
              aria-label="Delete this list?"
            >
              <p className="text-sm">
                Delete <b>{current.name}</b>? It leaves the switcher; its lines
                are kept, and it can be brought back.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void send(
                      () => surface.edit({ id: current.id, archived: true }),
                      () => router.push(shoppingListHref(MAIN_SHOPPING_LIST)),
                    )
                  }
                >
                  Delete the list
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-keep
                  onClick={() => reset()}
                >
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="flex flex-col gap-2 p-2"
              aria-label={
                mode === "new"
                  ? "New list"
                  : mode === "plan"
                    ? "New from a meal plan"
                    : "Rename the list"
              }
              onSubmit={(event) => {
                event.preventDefault();
                const typed = name.trim();
                if (mode === "rename") {
                  if (!typed) return;
                  void send(
                    () => surface.edit({ id: current.id, name: typed }),
                    () => router.refresh(),
                  );
                  return;
                }
                if (mode === "plan" && !plan) return;
                if (mode === "new" && !typed) return;
                void send(
                  () =>
                    surface.create({
                      ...(typed ? { name: typed } : {}),
                      ...(mode === "plan" ? { plan } : {}),
                    }),
                  (answer) => router.push(shoppingListHref(answer.list.id)),
                );
              }}
            >
              {mode === "plan" && (
                <>
                  <label htmlFor={planId} className="text-sm font-medium">
                    Meal plan
                  </label>
                  <select
                    id={planId}
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                    value={plan}
                    onChange={(event) => setPlan(event.target.value)}
                    required
                  >
                    <option value="">Pick a plan</option>
                    {surface.plans.map((each) => (
                      <option key={each.slug} value={each.slug}>
                        {each.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <label htmlFor={nameId} className="text-sm font-medium">
                {mode === "plan"
                  ? "Name (the plan's, unless you type one)"
                  : "Name"}
              </label>
              <Input
                id={nameId}
                value={name}
                maxLength={80}
                placeholder={
                  mode === "plan" ? (chosenPlan?.name ?? "") : "Thanksgiving"
                }
                onChange={(event) => setName(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    busy ||
                    (mode === "plan" ? !plan : !name.trim()) ||
                    (mode === "rename" && name.trim() === current.name)
                  }
                >
                  {mode === "rename"
                    ? "Rename"
                    : mode === "plan"
                      ? "Make the list"
                      : "Start the list"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => reset()}
                >
                  Back
                </Button>
              </div>
            </form>
          )}
          {error && (
            <p className="px-2 pb-1 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </PopoverContent>
      </Popover>
      {current.archived && <DeletedList current={current} surface={surface} />}
    </div>
  );
}

/** A deleted list opened by its address: say so, and offer it back. */
function DeletedList({
  current,
  surface,
}: {
  current: CurrentShoppingList;
  surface: ShoppingListsSurface;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <p
      className="flex flex-wrap items-center gap-2 text-sm"
      role="status"
      data-testid="shopping-list-deleted"
    >
      This list is deleted.
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const answer = await surface.edit({
              id: current.id,
              archived: false,
            });
            if (isActionError(answer)) setError(answer.error);
            else router.refresh();
          } catch {
            setError(UNREACHABLE);
          } finally {
            setBusy(false);
          }
        }}
      >
        Restore it
      </Button>
      {error && (
        <span className="text-destructive" role="alert">
          {error}
        </span>
      )}
    </p>
  );
}
