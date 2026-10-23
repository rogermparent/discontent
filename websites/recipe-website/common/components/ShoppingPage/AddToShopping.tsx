"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ShoppingCart } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import { isValidScale } from "../../util/scale";
import { useMultiplier } from "../View/Multiplier/Provider";
import { useChoices } from "../View/Choices";
import { hasChoices } from "../../util/alternatives";
import { isActionError, type ShoppingPageActions } from "./useShoppingList";

type Add = ShoppingPageActions["add"];

const noSubscription = () => () => {};

/** True once React owns the page (a test waits for `data-ready`). */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/** What an add answered, said in a line with a link to the list. */
function AddResult({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-sm" role="status" data-testid="shopping-add-result">
      {message}{" "}
      <Link href="/shopping" className="underline">
        Open the list
      </Link>
    </p>
  );
}

async function addAndSay(
  add: Add,
  input: Record<string, unknown>,
): Promise<string> {
  let result: Awaited<ReturnType<Add>>;
  try {
    result = await add(input);
  } catch {
    return "Couldn't reach the editor — check the connection and try again.";
  }
  if (isActionError(result)) return result.error;
  const n = result.added.length;
  const added = `${n} ${n === 1 ? "item" : "items"} added to the shopping list.`;
  return result.warnings?.length
    ? `${added} ${result.warnings.join(" ")}`
    : added;
}

/**
 * The group page's "Add to shopping list" (35d): the whole plan, nested plans
 * included, with an optional ×scale for the lot.
 */
export function AddGroupToShopping({
  group,
  add,
}: {
  group: string;
  add: Add;
}) {
  const [scale, setScale] = useState("");
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const valid = !scale.trim() || isValidScale(scale);
  const hydrated = useHydrated();
  return (
    <div className="flex flex-col gap-1">
      <form
        className="flex items-center gap-2"
        data-testid="add-group-to-shopping"
        data-ready={hydrated ? "true" : undefined}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid) return;
          setBusy(true);
          try {
            setMessage(
              await addAndSay(add, {
                group,
                ...(scale.trim() ? { scale: scale.trim() } : {}),
              }),
            );
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
        <Button type="submit" size="sm" disabled={busy || !valid}>
          <ShoppingCart aria-hidden className="size-4" />
          Add to shopping list
        </Button>
      </form>
      <AddResult message={message} />
    </div>
  );
}

/**
 * A recipe's "Add to list" (35d), in the Ingredients header: at the scale the
 * reader has set, since it renders inside the recipe's `MultiplierProvider`.
 */
export function AddRecipeToShopping({
  recipe,
  add,
}: {
  recipe: string;
  add: Add;
}) {
  const [{ multiplier }] = useMultiplier();
  /* 45e: the reader's pick among the recipe's alternatives goes with it. */
  const choices = useChoices();
  const picks =
    choices && hasChoices(choices.choices) ? choices.path.picks : undefined;
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  /* A zero or negative scale (typed into the scaler) adds nothing: say so. */
  const invalid = multiplier !== undefined && !(multiplier.valueOf() > 0);
  const scale = multiplier && !invalid ? multiplier.toFraction() : undefined;
  return (
    <div className="flex flex-col gap-1 print:hidden">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="self-start"
        disabled={busy || invalid}
        onClick={async () => {
          setBusy(true);
          try {
            setMessage(
              await addAndSay(add, {
                recipe,
                ...(scale ? { scale } : {}),
                ...(picks ? { picks } : {}),
              }),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <ShoppingCart aria-hidden className="size-4" />
        {scale && scale !== "1" ? `Add ×${scale} to list` : "Add to list"}
      </Button>
      {invalid && (
        <p className="text-xs text-destructive" role="status">
          Set a scale above 0 to add this recipe.
        </p>
      )}
      <AddResult message={message} />
    </div>
  );
}
