"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@discontent/component-library/components/ui/sheet";
import { AISLE_LABELS, AISLES, type Aisle } from "../../util/aisles";
import {
  SHOPPING_FEATURES,
  type ShoppingFeature,
  type ShoppingSettings,
  type ShoppingStore,
} from "../../util/shoppingTypes";

/** Each switch's name and what it does — the sheet's and 42g's panel's. */
export const FEATURE_TEXT: Record<ShoppingFeature, [string, string]> = {
  merge: ["Merge", "One line per ingredient, amounts added together."],
  quantities: ["Quantities", "Show amounts, scaled to each recipe."],
  aisles: ["Aisles", "Group the list by aisle."],
  stores: ["Stores", "Split the list by store."],
  onHand: [
    "On hand",
    "Fold away what your shared “what I have” list (and salt, pepper, water) probably covers.",
  ],
  sources: ["Sources", "Show which recipes each line came from."],
  subRecipes: [
    "Sub-recipes",
    "Add a line that links another recipe (“1 batch simple syrup”) as that recipe’s ingredients.",
  ],
  holdTicks: [
    "Hold ticks",
    "Keep ticks on this device until you press Done shopping, then save them as one change.",
  ],
};

const selectClass =
  "h-10 rounded-md border border-input bg-background px-2 text-sm";

function storeId(name: string, taken: ShoppingStore[]): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "store";
  let id = base;
  for (let n = 2; taken.some((store) => store.id === id); n++)
    id = `${base}-${n}`;
  return id;
}

/**
 * Every switch, the stores, which store each aisle defaults to, and the aisle
 * order — edited as a draft and saved as one change (one commit). Its own
 * "Settings" button opens it; 42g's switches beside the list open it too
 * ("Stores and aisles"), through `open` and `onOpenChange`.
 */
export function SettingsSheet({
  settings,
  save,
  open: openProp,
  onOpenChange,
  returnFocusRef,
}: {
  settings: ShoppingSettings;
  save(patch: unknown): Promise<unknown>;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  /**
   * Opened from elsewhere ("Stores and aisles"): the element focus goes
   * back to on close, instead of the Settings button. Cleared once used.
   */
  returnFocusRef?: { current: HTMLElement | null };
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-10">
          Settings
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        data-testid="shopping-settings"
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return;
          const opener = returnFocusRef.current;
          returnFocusRef.current = null;
          event.preventDefault();
          opener.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>Shopping list settings</SheetTitle>
          <SheetDescription>
            Use only what helps today: with everything off, the list is the
            lines as written.
          </SheetDescription>
        </SheetHeader>
        {/* Mounted while open: each opening drafts from the saved settings. */}
        <SettingsForm
          settings={settings}
          save={save}
          close={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

/** The sheet's body: a draft of the settings, saved as one change. */
function SettingsForm({
  settings,
  save,
  close,
}: {
  settings: ShoppingSettings;
  save(patch: unknown): Promise<unknown>;
  close(): void;
}) {
  const [draft, setDraft] = useState(settings);
  const [newStore, setNewStore] = useState("");
  const [saving, setSaving] = useState(false);
  const ids = { add: useId(), default: useId() };

  const update = (patch: Partial<ShoppingSettings>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const moveAisle = (index: number, by: -1 | 1) => {
    const order = [...draft.aisleOrder];
    const [aisle] = order.splice(index, 1);
    order.splice(index + by, 0, aisle);
    update({ aisleOrder: order });
  };

  const submit = async () => {
    const kept = new Set(draft.stores.map((store) => store.id));
    setSaving(true);
    let result: unknown;
    try {
      result = await save({
        features: draft.features,
        aisleOrder: draft.aisleOrder,
        stores: draft.stores,
        defaultStore: kept.has(draft.defaultStore)
          ? draft.defaultStore
          : draft.stores[0].id,
        storeByAisle: Object.fromEntries(
          AISLES.map((aisle) => {
            const store = draft.storeByAisle[aisle];
            return [aisle, store && kept.has(store) ? store : null];
          }),
        ),
      });
    } finally {
      setSaving(false);
    }
    if (result) close();
  };

  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">Features</legend>
        {SHOPPING_FEATURES.map((feature) => (
          <label key={feature} className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-primary"
              checked={draft.features[feature]}
              onChange={(event) =>
                update({
                  features: {
                    ...draft.features,
                    [feature]: event.target.checked,
                  },
                })
              }
            />
            <span>
              <span className="block font-medium">
                {FEATURE_TEXT[feature][0]}
              </span>
              <span className="block text-xs text-muted-foreground">
                {FEATURE_TEXT[feature][1]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Stores</legend>
        {draft.stores.map((store, index) => (
          <div key={store.id} className="flex items-center gap-2">
            <Input
              aria-label={`Store name: ${store.name}`}
              value={store.name}
              onChange={(event) =>
                update({
                  stores: draft.stores.map((each, i) =>
                    i === index ? { ...each, name: event.target.value } : each,
                  ),
                })
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-10 p-0"
              aria-label={`Remove ${store.name}`}
              disabled={draft.stores.length === 1}
              onClick={() =>
                update({
                  stores: draft.stores.filter((_, i) => i !== index),
                })
              }
            >
              <X aria-hidden className="size-4" />
            </Button>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const name = newStore.trim();
            if (!name) return;
            update({
              stores: [
                ...draft.stores,
                { id: storeId(name, draft.stores), name },
              ],
            });
            setNewStore("");
          }}
        >
          <label htmlFor={ids.add} className="sr-only">
            New store
          </label>
          <Input
            id={ids.add}
            value={newStore}
            placeholder="Add a store"
            onChange={(event) => setNewStore(event.target.value)}
          />
          <Button type="submit" variant="outline" size="sm" className="h-10">
            Add
          </Button>
        </form>
        <label htmlFor={ids.default} className="mt-2 text-xs font-semibold">
          Default store
        </label>
        <select
          id={ids.default}
          className={selectClass}
          value={draft.defaultStore}
          onChange={(event) => update({ defaultStore: event.target.value })}
        >
          {draft.stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">
          Aisles: order and store
        </legend>
        <ol className="flex flex-col gap-2">
          {draft.aisleOrder.map((aisle: Aisle, index) => (
            <li key={aisle} className="flex items-center gap-1">
              <span className="flex-1 text-sm">{AISLE_LABELS[aisle]}</span>
              <select
                aria-label={`Store for ${AISLE_LABELS[aisle]}`}
                className={selectClass}
                value={draft.storeByAisle[aisle] ?? ""}
                onChange={(event) =>
                  update({
                    storeByAisle: {
                      ...draft.storeByAisle,
                      [aisle]: event.target.value || undefined,
                    },
                  })
                }
              >
                <option value="">Default store</option>
                {draft.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-10 p-0"
                aria-label={`Move ${AISLE_LABELS[aisle]} up`}
                disabled={index === 0}
                onClick={() => moveAisle(index, -1)}
              >
                <ArrowUp aria-hidden className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-10 p-0"
                aria-label={`Move ${AISLE_LABELS[aisle]} down`}
                disabled={index === draft.aisleOrder.length - 1}
                onClick={() => moveAisle(index, 1)}
              >
                <ArrowDown aria-hidden className="size-4" />
              </Button>
            </li>
          ))}
        </ol>
      </fieldset>

      <div className="flex gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={saving || draft.stores.some((store) => !store.name.trim())}
        >
          {saving ? "Saving…" : "Save settings"}
        </Button>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
