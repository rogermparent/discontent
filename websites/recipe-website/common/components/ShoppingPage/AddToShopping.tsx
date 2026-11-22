"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useSyncExternalStore } from "react";
import { ShoppingCart } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import { isValidScale } from "../../util/scale";
import {
  MAIN_SHOPPING_LIST,
  MAIN_SHOPPING_LIST_NAME,
  readCurrentShoppingList,
  saveCurrentShoppingList,
  shoppingListHref,
  subscribeCurrentShoppingList,
  type ShoppingListSummary,
} from "../../util/shoppingLists";
import { useMultiplier } from "../View/Multiplier/Provider";
import { useChoices } from "../View/Choices";
import { hasChoices } from "../../util/alternatives";
import {
  isActionError,
  type ShoppingActionResult,
  type ShoppingPageActions,
} from "./useShoppingList";

/**
 * 50d: an add names its list first (`addToShoppingList(list, input)`), so
 * the recipe and plan pages send the one the reader picked.
 */
export type AddToList = (
  list: string,
  input: unknown,
) => ReturnType<ShoppingPageActions["add"]>;

/** 50d: "New list…" in the picker: make a blank list, then add to it. */
export type CreateList = (input: {
  name: string;
}) => Promise<ShoppingActionResult<{ list: ShoppingListSummary }>>;

const noSubscription = () => () => {};

/** True once React owns the page (a test waits for `data-ready`). */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

const NEW_LIST = "\u0000new";

/**
 * 50d (Dd8): the list an add goes to — the one this browser used last (the
 * main list on the server, through hydration, or once that list is gone),
 * or the one picked here. Picking one makes it the current list.
 */
function useListChoice(lists: readonly ShoppingListSummary[] | undefined) {
  const stored = useSyncExternalStore(
    subscribeCurrentShoppingList,
    readCurrentShoppingList,
    () => MAIN_SHOPPING_LIST,
  );
  const known = lists ?? [];
  const current = known.some((list) => list.id === stored)
    ? stored
    : MAIN_SHOPPING_LIST;
  const [picked, setPicked] = useState<string>();
  const chosen =
    picked !== undefined &&
    (picked === NEW_LIST || known.some((list) => list.id === picked))
      ? picked
      : current;
  /* The current list first, then the others in the switcher's order. */
  const ordered = [
    ...known.filter((list) => list.id === current),
    ...known.filter((list) => list.id !== current),
  ];
  return { chosen, setPicked, ordered, current };
}

function listName(
  lists: readonly ShoppingListSummary[] | undefined,
  id: string,
): string {
  return (
    lists?.find((list) => list.id === id)?.name ??
    (id === MAIN_SHOPPING_LIST ? MAIN_SHOPPING_LIST_NAME : id)
  );
}

/** What an add answered, said in a line with a link to the list. */
function AddResult({ message, list }: { message?: string; list: string }) {
  if (!message) return null;
  return (
    <p className="text-sm" role="status" data-testid="shopping-add-result">
      {message}{" "}
      <Link
        href={
          list === MAIN_SHOPPING_LIST ? "/shopping" : shoppingListHref(list)
        }
        className="underline"
      >
        Open the list
      </Link>
    </p>
  );
}

/**
 * The picker (50d): with more than one list, which list an add goes to —
 * the current list first, then the others, and "New list…" with a name.
 */
function ListPicker({
  ordered,
  chosen,
  pick,
  newName,
  setNewName,
  canCreate,
}: {
  ordered: ShoppingListSummary[];
  chosen: string;
  pick(id: string): void;
  newName: string;
  setNewName(name: string): void;
  canCreate: boolean;
}) {
  const id = useId();
  const nameId = useId();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        To
      </label>
      <select
        id={id}
        className="h-9 min-w-0 max-w-[14rem] rounded-md border border-input bg-background px-2 text-sm"
        value={chosen}
        onChange={(event) => pick(event.target.value)}
        data-testid="shopping-add-list"
      >
        {ordered.map((list) => (
          <option key={list.id} value={list.id}>
            {list.name}
          </option>
        ))}
        {canCreate && <option value={NEW_LIST}>New list…</option>}
      </select>
      {chosen === NEW_LIST && (
        <>
          <label htmlFor={nameId} className="sr-only">
            New list&rsquo;s name
          </label>
          <Input
            id={nameId}
            value={newName}
            maxLength={80}
            placeholder="New list's name"
            className="h-9 w-44"
            onChange={(event) => setNewName(event.target.value)}
          />
        </>
      )}
    </div>
  );
}

/**
 * Add to the chosen list — making it first when it is "New list…" — and
 * say what happened. The list added to becomes the current one (Dd8).
 */
async function addAndSay(
  add: AddToList,
  input: Record<string, unknown>,
  target: { list: string; name: string } | { create: CreateList; name: string },
): Promise<{ message: string; list: string; ok?: true; created?: true }> {
  let list: string;
  let name = target.name;
  try {
    if ("create" in target) {
      const made = await target.create({ name: target.name });
      if (isActionError(made)) {
        return { message: made.error, list: MAIN_SHOPPING_LIST };
      }
      list = made.list.id;
      name = made.list.name;
    } else {
      list = target.list;
    }
  } catch {
    return {
      message:
        "Couldn't reach the editor — check the connection and try again.",
      list: MAIN_SHOPPING_LIST,
    };
  }
  let result: Awaited<ReturnType<AddToList>>;
  try {
    result = await add(list, input);
  } catch {
    return {
      message:
        "Couldn't reach the editor — check the connection and try again.",
      list,
    };
  }
  if (isActionError(result)) return { message: result.error, list };
  saveCurrentShoppingList(list);
  const n = result.added.length;
  const where =
    list === MAIN_SHOPPING_LIST ? "the shopping list" : JSON.stringify(name);
  const added = `${n} ${n === 1 ? "item" : "items"} added to ${where}.`;
  return {
    message: result.warnings?.length
      ? `${added} ${result.warnings.join(" ")}`
      : added,
    list,
    ok: true,
    ...("create" in target ? { created: true as const } : {}),
  };
}

/** The add's target from the picker's state, or a reason it can't go. */
function targetOf(
  chosen: string,
  newName: string,
  lists: readonly ShoppingListSummary[] | undefined,
  create: CreateList | undefined,
):
  | { list: string; name: string }
  | { create: CreateList; name: string }
  | undefined {
  if (chosen !== NEW_LIST)
    return { list: chosen, name: listName(lists, chosen) };
  const name = newName.trim();
  return name && create ? { create, name } : undefined;
}

/**
 * The group page's "Add to shopping list" (35d): the whole plan, nested plans
 * included, with an optional ×scale for the lot. 50d: onto the current list,
 * or — with more than one — the one picked.
 */
export function AddGroupToShopping({
  group,
  add,
  lists,
  createList,
  onAdded,
}: {
  group: string;
  add: AddToList;
  /** 50d: the lists not deleted (a picker shows with more than one). */
  lists?: ShoppingListSummary[];
  createList?: CreateList;
  /** Called once an add has landed. */
  onAdded?(list: string): void;
}) {
  const router = useRouter();
  const [scale, setScale] = useState("");
  const [said, setSaid] = useState<{ message: string; list: string }>();
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const { chosen, setPicked, ordered } = useListChoice(lists);
  const valid = !scale.trim() || isValidScale(scale);
  const target = targetOf(chosen, newName, lists, createList);
  const hydrated = useHydrated();
  return (
    <div className="flex flex-col gap-1">
      <form
        className="flex flex-wrap items-center gap-2"
        data-testid="add-group-to-shopping"
        data-ready={hydrated ? "true" : undefined}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid || !target) return;
          setBusy(true);
          try {
            const answer = await addAndSay(
              add,
              {
                group,
                ...(scale.trim() ? { scale: scale.trim() } : {}),
              },
              target,
            );
            setSaid(answer);
            if (answer.ok) {
              setPicked(undefined);
              setNewName("");
              onAdded?.(answer.list);
            }
            /* A list made here joins the picker (the server reads them). */
            if (answer.created) router.refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        <span aria-hidden className="text-sm">
          ×
        </span>
        <Input
          aria-label="Scale the plan"
          value={scale}
          placeholder="1"
          inputMode="decimal"
          className="h-9 w-16"
          aria-invalid={!valid}
          onChange={(event) => setScale(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={busy || !valid || !target}>
          <ShoppingCart aria-hidden className="size-4" />
          Add to shopping list
        </Button>
        {lists && lists.length > 1 && (
          <ListPicker
            ordered={ordered}
            chosen={chosen}
            pick={setPicked}
            newName={newName}
            setNewName={setNewName}
            canCreate={Boolean(createList)}
          />
        )}
      </form>
      <AddResult
        message={said?.message}
        list={said?.list ?? MAIN_SHOPPING_LIST}
      />
    </div>
  );
}

/**
 * A recipe's "Add to list" (35d), in the Ingredients header: at the scale the
 * reader has set, since it renders inside the recipe's `MultiplierProvider`.
 * 50d: onto the current list, or — with more than one — the one picked.
 */
export function AddRecipeToShopping({
  recipe,
  add,
  lists,
  createList,
}: {
  recipe: string;
  add: AddToList;
  /** 50d: the lists not deleted (a picker shows with more than one). */
  lists?: ShoppingListSummary[];
  createList?: CreateList;
}) {
  const router = useRouter();
  const [{ multiplier }] = useMultiplier();
  /* 45e: the reader's pick among the recipe's alternatives goes with it. */
  const choices = useChoices();
  const picks =
    choices && hasChoices(choices.choices) ? choices.path.picks : undefined;
  const [said, setSaid] = useState<{ message: string; list: string }>();
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const { chosen, setPicked, ordered } = useListChoice(lists);
  const target = targetOf(chosen, newName, lists, createList);
  /* A zero or negative scale (typed into the scaler) adds nothing: say so. */
  const invalid = multiplier !== undefined && !(multiplier.valueOf() > 0);
  const scale = multiplier && !invalid ? multiplier.toFraction() : undefined;
  return (
    <div className="flex flex-col gap-1 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="self-start"
          disabled={busy || invalid || !target}
          onClick={async () => {
            if (!target) return;
            setBusy(true);
            try {
              const answer = await addAndSay(
                add,
                {
                  recipe,
                  ...(scale ? { scale } : {}),
                  ...(picks ? { picks } : {}),
                },
                target,
              );
              setSaid(answer);
              if (answer.ok) {
                setPicked(undefined);
                setNewName("");
              }
              if (answer.created) router.refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          <ShoppingCart aria-hidden className="size-4" />
          {scale && scale !== "1" ? `Add ×${scale} to list` : "Add to list"}
        </Button>
        {lists && lists.length > 1 && (
          <ListPicker
            ordered={ordered}
            chosen={chosen}
            pick={setPicked}
            newName={newName}
            setNewName={setNewName}
            canCreate={Boolean(createList)}
          />
        )}
      </div>
      {invalid && (
        <p className="text-xs text-destructive" role="status">
          Set a scale above 0 to add this recipe.
        </p>
      )}
      <AddResult
        message={said?.message}
        list={said?.list ?? MAIN_SHOPPING_LIST}
      />
    </div>
  );
}
