"use client";

import { useActionState, useId } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { updateSettings } from "../settings/actions";
import { SettingsCard } from "../SettingsCard";

/**
 * "Share my saved inventory on the export" (usability pass, U6) — off by
 * default. On, the next Build bakes a snapshot of the saved inventory into
 * the static site (`SITE_HOUSE_INVENTORY`, see `controller/exportEnv.ts`),
 * where visitors see what it adds as "Also makeable from the house
 * inventory" on What can I make? and Drinks. Off, nothing about the list
 * reaches the export. Saved through the shared `updateSettings`.
 */
export function ShareInventoryForm({ enabled }: { enabled: boolean }) {
  const [state, formAction] = useActionState(updateSettings, null);
  const id = useId();
  const hintId = useId();
  return (
    <form action={formAction} className="p-2" data-testid="share-inventory">
      <SettingsCard
        title="Your saved inventory"
        description="What can I make? and Drinks always judge each visitor's own list, kept in their browser."
      >
        <input type="hidden" name="shareInventoryOnExport.present" value="1" />
        <div className="flex items-start gap-3">
          <input
            id={id}
            type="checkbox"
            name="shareInventoryOnExport"
            aria-describedby={hintId}
            className="mt-1 size-4 shrink-0 accent-primary"
            defaultChecked={enabled}
          />
          <span className="flex flex-col gap-1">
            <label htmlFor={id} className="font-medium">
              Share my saved inventory on the export
            </label>
            <span id={hintId} className="text-sm text-muted-foreground">
              Off by default. When on, the next build includes a snapshot of
              your saved inventory, and visitors see what it adds as “Also
              makeable from the house inventory”. When off, nothing about it
              reaches the export.
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton>Save</SubmitButton>
          {state && (
            <span
              role="status"
              className={`text-sm ${state.success ? "text-primary" : "text-destructive"}`}
            >
              {state.message}
            </span>
          )}
        </div>
      </SettingsCard>
    </form>
  );
}
