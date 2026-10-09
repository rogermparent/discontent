"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import StyledMarkdown from "@discontent/component-library/components/Markdown";
import { Button } from "@discontent/component-library/components/ui/button";
import { Checkbox } from "@discontent/component-library/components/ui/checkbox";
import { cn } from "@discontent/component-library/lib/utils";
import type {
  DrinkSpec,
  Ingredient,
  Instruction,
  InstructionEntry,
} from "../../../controller/types";
import { markOunces } from "../../../util/barUnits";
import { DrinkSpecBar } from "../DrinkSpec";
import { MultiplierInput } from "../Multiplier";
import { Multiplyable } from "../Multiplier/Multiplyable";

/**
 * Bar view / Cook view (27c): the recipe as something to work from, not read.
 *
 * A full-screen overlay inside the recipe view, so it shares the page's
 * `MultiplierProvider` and `UnitProvider` — whatever the reader scaled or
 * switched to on the page is what the big type shows, and the scaler is here
 * too. Common code, so the editor and the export both have it.
 *
 * Ingredients and steps are checklists, like the page's: tick an ingredient
 * off as it is gathered, a step as it is done. Each step's whole card is the
 * checkbox's label, so a tap anywhere on it still ticks it.
 *
 * The screen stays on while it is open: a `screen` wake lock, feature-detected
 * (Firefox and older Safari have none, and the view works the same without
 * it), re-acquired on `visibilitychange` because the browser drops the lock
 * whenever the tab is hidden, and released on close. Esc and the close button
 * exit. Hidden in print — the page underneath is what prints.
 */
interface FocusViewProps {
  name: string;
  drink?: DrinkSpec;
  ingredients?: Ingredient[];
  instructions?: InstructionEntry[];
}

/** Every step in order, a group's steps under the group's name. */
function flattenSteps(
  instructions: InstructionEntry[] = [],
): (Instruction & { group?: string })[] {
  return instructions.flatMap((entry) =>
    "instructions" in entry
      ? entry.instructions.map((step) => ({ ...step, group: entry.name }))
      : [entry],
  );
}

const markdownComponents = { Multiplyable };

/*
 * The page's checklists, sized for a counter: a box big enough to hit with a
 * floury thumb, nudged down to sit on the first line of the big type.
 */
const focusCheckboxClassName = "mt-1 size-7 sm:mt-1.5 [&_svg]:size-5";

/** Hold the screen awake while mounted; answer whether a lock is held. */
function useScreenWakeLock(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let active = true;

    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (!active) {
          await next.release();
          return;
        }
        sentinel = next;
        setHeld(true);
        next.addEventListener("release", () => {
          if (sentinel === next) setHeld(false);
        });
      } catch {
        /* Denied (battery saver, no user gesture): the view still works. */
        setHeld(false);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      const current = sentinel;
      sentinel = null;
      void current?.release().catch(() => {});
    };
  }, []);
  return held;
}

function FocusOverlay({
  name,
  drink,
  ingredients,
  instructions,
  label,
  onClose,
}: FocusViewProps & { label: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [done, setDone] = useState<Set<number>>(() => new Set());
  const [gathered, setGathered] = useState<Set<number>>(() => new Set());
  const awake = useScreenWakeLock();
  const steps = flattenSteps(instructions);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    /* The page underneath should not scroll behind the overlay. */
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  /* One checklist each: ingredients gathered, steps done. */
  const toggleIn =
    (setChecked: React.Dispatch<React.SetStateAction<Set<number>>>) =>
    (index: number) =>
      setChecked((previous) => {
        const next = new Set(previous);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
  const toggleStep = toggleIn(setDone);
  const toggleIngredient = toggleIn(setGathered);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label}: ${name}`}
      data-testid="focus-view"
      className="fixed inset-0 z-50 overflow-y-auto bg-background text-foreground print:hidden"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        <div className="flex flex-row items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              {label}
              {awake && (
                <span data-testid="wake-lock-status"> · screen stays on</span>
              )}
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl">{name}</h2>
          </div>
          <Button
            ref={closeRef}
            type="button"
            variant="secondary"
            onClick={onClose}
            aria-label={`Close ${label.toLowerCase()}`}
          >
            Close
          </Button>
        </div>

        <DrinkSpecBar drink={drink} />

        {ingredients && ingredients.length > 0 && (
          <section aria-label="Ingredients">
            <div className="mb-3">
              <MultiplierInput />
            </div>
            <ul className="space-y-3 text-2xl sm:text-3xl">
              {ingredients.map(({ ingredient, type }, i) =>
                type === "heading" ? (
                  <li
                    key={i}
                    className="pt-2 text-lg font-semibold text-muted-foreground"
                  >
                    <StyledMarkdown components={markdownComponents}>
                      {ingredient}
                    </StyledMarkdown>
                  </li>
                ) : (
                  <li key={i}>
                    <label
                      className={cn(
                        "flex cursor-pointer flex-row items-start gap-3 transition-opacity",
                        gathered.has(i) && "opacity-40 line-through",
                      )}
                    >
                      <Checkbox
                        checked={gathered.has(i)}
                        onCheckedChange={() => toggleIngredient(i)}
                        className={focusCheckboxClassName}
                      />
                      <span className="min-w-0 flex-1">
                        <StyledMarkdown components={markdownComponents}>
                          {markOunces(ingredient)}
                        </StyledMarkdown>
                      </span>
                    </label>
                  </li>
                ),
              )}
            </ul>
          </section>
        )}

        {steps.length > 0 && (
          <section aria-label="Steps">
            <ol className="space-y-3">
              {steps.map((step, i) => (
                <li key={i}>
                  {step.group &&
                    (i === 0 || steps[i - 1].group !== step.group) && (
                      <h3 className="mb-1 mt-3 text-lg font-semibold text-muted-foreground">
                        {step.group}
                      </h3>
                    )}
                  {/*
                    The whole card is the checkbox's label, so a tap anywhere on
                    it still ticks the step off — with a visible box to say so.
                  */}
                  <label
                    className={cn(
                      "flex w-full cursor-pointer flex-row items-start gap-4 rounded-md border border-border bg-card p-4 text-left text-xl transition-opacity sm:text-2xl",
                      done.has(i) && "opacity-40 line-through",
                    )}
                  >
                    <Checkbox
                      checked={done.has(i)}
                      onCheckedChange={() => toggleStep(i)}
                      className={focusCheckboxClassName}
                    />
                    <span className="min-w-[2ch] shrink-0 font-mono tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      {step.name && (
                        <span className="block font-semibold">{step.name}</span>
                      )}
                      <StyledMarkdown components={markdownComponents}>
                        {step.text}
                      </StyledMarkdown>
                    </span>
                  </label>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * "Bar view" on a drink, "Cook view" on everything else. A drink is a recipe
 * with a `drink` spec or the `drink` tag — a few imported drinks carry the tag
 * before anyone has filled in their spec.
 */
export function FocusViewButton({
  isDrink,
  ...props
}: FocusViewProps & { isDrink?: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const label = isDrink || props.drink ? "Bar view" : "Cook view";
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="print:hidden"
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open && <FocusOverlay {...props} label={label} onClose={close} />}
    </>
  );
}
