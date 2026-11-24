"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import { listLayers } from "../../util/shoppingChanges";
import {
  listRules,
  promoteLayer,
  type RuleListing,
} from "../../util/shoppingWalk";
import type { ShoppingLeftOff } from "../../util/shoppingView";
import { panelClass } from "./parts";
import { changedBy } from "./ShoppingRowView";
import type { ShoppingList } from "./useShoppingList";

/**
 * 50a: the page's layers UI — what was left off with Restore, the "As
 * written" switch — and (50c) the Changes panel's two tiers.
 */

/** Who left a row off, in the panel's words. */
function leftOffBy(entry: ShoppingLeftOff): string {
  if (entry.source === "built-in") return "always left off";
  if (entry.source === "rule") return "your rule for every list";
  return changedBy({ source: "layer", by: entry.by });
}

/**
 * "Left off the list (N)", collapsed: each row with its reason and who said
 * so, and Restore — a rule's (water) writes a rule bringing it back; a
 * layer's turns that change off.
 */
export function LeftOffPanel({
  entries,
  list,
}: {
  entries: ShoppingLeftOff[];
  list: ShoppingList;
}) {
  const [status, setStatus] = useState("");
  const summaryRef = useRef<HTMLElement>(null);
  if (entries.length === 0 && !status) return null;
  const restore = async (entry: ShoppingLeftOff) => {
    /* A rule's row by the key it matched, never its label (49a, canned). */
    const done =
      entry.source === "layer" && entry.id
        ? await list.setLayer(entry.id, false)
        : await list.leaveOff({
            ...(entry.key ? { key: entry.key } : { name: entry.row.name }),
            leaveOff: false,
          });
    if (!done?.changed) return;
    setStatus(`Back on the list: ${entry.row.label}.`);
    /*
     * The button is gone with its row: focus goes to the panel's summary,
     * or — the last one restored — to the row now back on the list.
     */
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLInputElement>(
        `[data-testid="shopping-row"][data-key="${CSS.escape(entry.row.key)}"] input[type="checkbox"]`,
      );
      (summaryRef.current ?? row)?.focus();
    });
  };
  return (
    <section
      className="print:hidden"
      aria-label="Left off the list"
      data-testid="shopping-left-off"
    >
      <p role="status" className="sr-only">
        {status}
      </p>
      {entries.length > 0 && (
        <details className="rounded-md border px-3 py-2">
          <summary
            ref={summaryRef}
            className="min-h-10 cursor-pointer py-2 font-semibold"
          >
            Left off the list ({entries.length})
          </summary>
          <p className="text-xs text-muted-foreground">
            Not bought, so not on the list. Restore puts a line back
            {list.canLayer ? "" : " (in the editor)"}.
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {entries.map((entry) => (
              <li
                key={entry.row.key}
                className="flex min-h-11 flex-wrap items-center gap-2 py-1.5 text-sm"
                data-testid="shopping-left-off-row"
              >
                <span className="min-w-0 flex-1 break-words">
                  {entry.row.label}
                  <span className="block text-xs text-muted-foreground">
                    {entry.reason} · {leftOffBy(entry)}
                  </span>
                </span>
                {list.canLayer && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    disabled={list.working}
                    onClick={() => void restore(entry)}
                    aria-label={`Restore ${entry.row.label}`}
                  >
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** A switch in the Changes panel's words: "On: <what>". */
function Switch({
  on,
  label,
  disabled,
  onChange,
}: {
  on: boolean;
  label: string;
  disabled: boolean;
  onChange(on: boolean): void;
}) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm">
      <input
        type="checkbox"
        role="switch"
        className="size-5 accent-primary"
        checked={on}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={`On: ${label}`}
      />
      On
    </label>
  );
}

/**
 * "Changes" (50c, the mock-up's two tiers): **Rules · every list** — the
 * built-in leave-offs, a person's leave-offs and renames, 49a's merges and
 * kept-apart names, aisles by name — each with a switch (an aisle, a
 * setting, has Remove only) and Remove (not a built-in); and **This list**
 * — its layers in the order they apply, each with who made it, a switch
 * (off is undo: the change stays, to turn back on), Remove, and "Always do
 * this", which makes it rules where it can be said by names (Dc5). A
 * change none of whose lines is left is not shown.
 */
export function ChangesPanel({ list }: { list: ShoppingList }) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState("");
  const listings = useMemo(
    () =>
      listLayers(list.layers, list.items).filter((listing) => !listing.stale),
    [list.layers, list.items],
  );
  const rules = useMemo(
    () => listRules(list.rules, list.merges, list.settings),
    [list.rules, list.merges, list.settings],
  );
  if (!list.canLayer) return null;
  const said = (text: string) => {
    setStatus(text);
    requestAnimationFrame(() => headingRef.current?.focus());
  };
  const switchRule = async (rule: RuleListing, on: boolean) => {
    if (rule.source === "built-in") {
      await list.leaveOff({ key: rule.key!, leaveOff: on });
    } else if (rule.source !== "aisle") {
      await list.setRule({
        kind:
          rule.source === "merge" || rule.source === "apart" ? "merge" : "rule",
        id: rule.id,
        on,
      });
    }
  };
  const removeRule = async (rule: RuleListing) => {
    const done =
      rule.source === "merge" || rule.source === "apart"
        ? await list.splitMerge(rule.id)
        : rule.source === "aisle"
          ? await list.removeRule({ kind: "aisle", key: rule.id })
          : await list.removeRule({ kind: "rule", id: rule.id });
    if (done) said(`Removed the rule: ${rule.text}.`);
  };
  const ruleWrites = list.canRule;
  return (
    <section
      className={cn(panelClass, "print:hidden")}
      aria-labelledby={headingId}
      data-testid="shopping-changes"
    >
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="font-semibold"
      >
        Changes ({listings.length})
      </h2>
      <p className="mb-1 text-xs text-muted-foreground">
        The list you shop from is your recipes’ lines with these on top, in
        order. Rules match by name on every list; this list’s changes go with
        it.
      </p>
      <p role="status" className="sr-only">
        {status}
      </p>
      <details className="border-t border-border" data-testid="shopping-rules">
        <summary className="min-h-10 cursor-pointer py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <h3 className="inline">Rules · every list ({rules.length})</h3>
        </summary>
        <ul className="flex flex-col divide-y divide-border">
          {rules.map((rule) => (
            <li
              key={`${rule.source}:${rule.id}`}
              className="flex flex-col gap-1 py-2"
              data-testid="shopping-rule"
              data-source={rule.source}
              data-on={rule.on ? "true" : "false"}
            >
              <span
                className={cn(
                  "text-sm break-words",
                  !rule.on && "text-muted-foreground line-through",
                )}
              >
                {rule.text}
              </span>
              <span className="text-xs text-muted-foreground">
                {rule.detail}
              </span>
              <span className="flex flex-wrap items-center gap-3">
                {rule.switchable && (
                  <Switch
                    on={rule.on}
                    label={rule.text}
                    disabled={
                      list.working ||
                      (rule.source !== "built-in" && !ruleWrites)
                    }
                    onChange={(on) => void switchRule(rule, on)}
                  />
                )}
                {rule.removable && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    disabled={
                      list.working ||
                      (rule.source !== "merge" &&
                        rule.source !== "apart" &&
                        !ruleWrites)
                    }
                    onClick={() => void removeRule(rule)}
                    aria-label={`Remove rule: ${rule.text}`}
                  >
                    Remove
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </details>
      <h3 className="border-t border-border pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        This list
      </h3>
      {listings.length === 0 && (
        <p className="py-2 text-sm">
          No changes on this list. Accepted suggestions land here, in order.
        </p>
      )}
      <ol className="flex flex-col divide-y divide-border">
        {listings.map(({ layer, text }) => {
          const promotion = promoteLayer(layer, list.items);
          const whyId = `${headingId}-${layer.id}-why`;
          return (
            <li
              key={layer.id}
              className="flex flex-col gap-1 py-2"
              data-testid="shopping-change"
              data-on={layer.on ? "true" : "false"}
            >
              <span
                className={cn(
                  "text-sm break-words",
                  !layer.on && "text-muted-foreground line-through",
                )}
              >
                {text}
              </span>
              <span className="text-xs text-muted-foreground">
                {changedBy({
                  source: "layer",
                  by: layer.by,
                  ...(layer.edited ? { edited: true as const } : {}),
                })}
              </span>
              <span className="flex flex-wrap items-center gap-3">
                <Switch
                  on={layer.on}
                  label={text}
                  disabled={list.working}
                  onChange={(on) => void list.setLayer(layer.id, on)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={list.working}
                  onClick={async () => {
                    const done = await list.removeLayer(layer.id);
                    if (done) said(`Removed: ${text}.`);
                  }}
                  aria-label={`Remove change: ${text}`}
                >
                  Remove
                </Button>
                {ruleWrites && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    disabled={list.working || !promotion.ok}
                    aria-describedby={promotion.ok ? undefined : whyId}
                    onClick={async () => {
                      const done = await list.promoteLayer(layer.id);
                      if (done) said(`Now a rule for every list: ${text}.`);
                    }}
                    aria-label={`Always do this: ${text}`}
                  >
                    Always do this
                  </Button>
                )}
              </span>
              {ruleWrites && !promotion.ok && (
                <span id={whyId} className="text-xs text-muted-foreground">
                  {promotion.why}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** "As written": the list's rows before any merge, rule or change. */
export function AsWrittenSwitch({
  on,
  onChange,
}: {
  on: boolean;
  onChange(on: boolean): void;
}) {
  return (
    <label
      className="flex min-h-10 items-center gap-2 text-sm print:hidden"
      data-testid="shopping-as-written"
    >
      <input
        type="checkbox"
        role="switch"
        className="size-5 accent-primary"
        checked={on}
        onChange={(event) => onChange(event.target.checked)}
      />
      As written
      <span className="text-xs text-muted-foreground">
        (before merges, rules and changes)
      </span>
    </label>
  );
}
