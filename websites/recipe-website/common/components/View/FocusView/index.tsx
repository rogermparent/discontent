"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
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
import type { StepLines } from "../../../util/stepIngredients";
import { markOunces } from "../../../util/barUnits";
import { stepPlainText } from "../../../util/stepPlainText";
import { COOK_VIEW_PARAM } from "../../../util/cookViewParam";
import { DrinkSpecBar } from "../DrinkSpec";
import { MultiplierInput } from "../Multiplier";
import { Multiplyable } from "../Multiplier/Multiplyable";
import { StepText, TimerAnnouncer, TimerTray } from "../Timers";
import {
  readCookProgress,
  sessionStore,
  writeCookProgress,
  type CookLayout,
  type CookProgress,
} from "./cookProgress";

/**
 * Bar view / Cook view (27c; one step at a time since 42c2, canvas B): the
 * recipe as something to work from, not read.
 *
 * A full-screen overlay inside the recipe view, so it shares the page's
 * `MultiplierProvider`, `UnitProvider` and `TimersProvider` — whatever the
 * reader scaled or switched to on the page is what the big type shows, a
 * timer started on the page is still running here, and the scaler is here
 * too. Common code, so the editor and the export both have it.
 *
 * Two layouts, switched by "One step" / "All steps": one step on screen with
 * Back and Done (Done ticks the step and moves on) and the ingredient lines
 * that step names (42c1's matches, scaled); or every ingredient and step as
 * checklists, as before. The cook view opens on one step; the bar view on
 * all steps — a drink is a list to pour, two steps long (Dc2-4). Ticks, the
 * step on screen and the layout are kept per recipe in sessionStorage
 * (`cookProgress.ts`).
 *
 * The screen stays on while it is open: a `screen` wake lock, feature-detected
 * (Firefox and older Safari have none, and the view works the same without
 * it), re-acquired on `visibilitychange` because the browser drops the lock
 * whenever the tab is hidden, and released on close. Esc and the close button
 * exit. Hidden in print — the page underneath is what prints.
 */
interface FocusViewProps {
  name: string;
  /** The recipe's slug: the key its ticks are kept under. */
  slug: string;
  drink?: DrinkSpec;
  ingredients?: Ingredient[];
  instructions?: InstructionEntry[];
  /** 42c1's step → ingredient-line matches, computed on the server. */
  uses?: StepLines;
}

type FlatStep = Instruction & { group?: string; uses?: number[] };

/** Every step in order, a group's steps under the group's name, with what each uses. */
function flattenSteps(
  instructions: InstructionEntry[] = [],
  uses?: StepLines,
): FlatStep[] {
  return instructions.flatMap((entry, i) =>
    "instructions" in entry
      ? (entry.instructions ?? []).map((step, j) => ({
          ...step,
          group: entry.name,
          uses: uses?.[i]?.[j],
        }))
      : [{ ...entry, uses: uses?.[i]?.[0] }],
  );
}

/** A step as a short line for the Done button: its title, or its words. */
function stepPreview(step: FlatStep): string {
  return step.name || stepPlainText(step.text);
}

/**
 * A step checkbox's name: its title and words as plain text, so the timer
 * buttons inside its label (their countdown changing twice a second) are not
 * part of it (42c2 review).
 */
function stepCheckboxName(step: FlatStep): string {
  const words = stepPlainText(step.text);
  return step.name ? `${step.name}. ${words}` : words;
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

/** One ingredient line as a checklist row, in the view's big type. */
function IngredientCheck({
  line,
  checked,
  onToggle,
  className,
}: {
  line: string;
  checked: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-row items-start gap-3 transition-opacity",
        checked && "opacity-40 line-through",
        className,
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        className={focusCheckboxClassName}
      />
      <span className="min-w-0 flex-1">
        <StyledMarkdown components={markdownComponents}>
          {markOunces(line)}
        </StyledMarkdown>
      </span>
    </label>
  );
}

/** Every ingredient line as a checklist, headings between. */
function IngredientChecklist({
  ingredients,
  gathered,
  onToggle,
  className,
}: {
  ingredients: Ingredient[];
  gathered: Set<number>;
  onToggle: (index: number) => void;
  className?: string;
}) {
  return (
    <ul className={cn("space-y-3", className)}>
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
            <IngredientCheck
              line={ingredient}
              checked={gathered.has(i)}
              onToggle={() => onToggle(i)}
            />
          </li>
        ),
      )}
    </ul>
  );
}

function FocusOverlay({
  name,
  slug,
  drink,
  ingredients = [],
  instructions,
  uses,
  label,
  defaultLayout,
  onClose,
}: FocusViewProps & {
  label: string;
  defaultLayout: CookLayout;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const stepRef = useRef<HTMLElement>(null);
  /* Set by Done: once the next step renders, focus moves to it. */
  const focusStep = useRef(false);
  const awake = useScreenWakeLock();
  const steps = useMemo(
    () => flattenSteps(instructions, uses),
    [instructions, uses],
  );
  const [progress, setProgress] = useState<CookProgress>(() =>
    readCookProgress(sessionStore(), slug, {
      steps: steps.length,
      ingredients: ingredients.length,
      fallbackLayout: defaultLayout,
    }),
  );
  useEffect(() => {
    writeCookProgress(sessionStore(), slug, progress);
  }, [slug, progress]);

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

  useEffect(() => {
    if (!focusStep.current) return;
    focusStep.current = false;
    stepRef.current?.focus();
  }, [progress.step]);

  const done = new Set(progress.done);
  const gathered = new Set(progress.gathered);
  /* No steps, no step to show: the checklist alone. */
  const layout: CookLayout = steps.length === 0 ? "list" : progress.layout;
  const current = Math.min(progress.step, Math.max(0, steps.length - 1));
  const step = steps[current];
  const last = current === steps.length - 1;
  const next = steps[current + 1];

  /* One checklist each: ingredients gathered, steps done. */
  const toggle = (key: "done" | "gathered", index: number) =>
    setProgress((previous) => {
      const set = new Set(previous[key]);
      if (set.has(index)) set.delete(index);
      else set.add(index);
      return { ...previous, [key]: [...set].sort((a, b) => a - b) };
    });
  const toggleStep = (index: number) => toggle("done", index);
  const toggleIngredient = (index: number) => toggle("gathered", index);
  const setLayout = (value: CookLayout) =>
    setProgress((previous) => ({ ...previous, layout: value }));
  /*
   * Back on the first step and Done on a finished last step do nothing, but
   * stay focusable (`aria-disabled`, not `disabled`): disabling the button in
   * the reader's hand would drop focus to <body>, and the next Tab out of
   * the dialog (42c2 review).
   */
  const canGoBack = current > 0;
  const canFinish = !(last && done.has(current));
  const back = () => {
    if (!canGoBack) return;
    setProgress((previous) => ({
      ...previous,
      step: Math.max(0, Math.min(previous.step, steps.length - 1) - 1),
    }));
  };
  /* Done: tick the step on screen and move to the next, focus with it. */
  const finish = () => {
    if (!canFinish) return;
    if (!last) focusStep.current = true;
    setProgress((previous) => {
      const at = Math.min(previous.step, steps.length - 1);
      const ticked = new Set(previous.done).add(at);
      return {
        ...previous,
        done: [...ticked].sort((a, b) => a - b),
        step: Math.min(at + 1, steps.length - 1),
      };
    });
  };

  const stepLines = (step?.uses ?? []).filter(
    (index) => ingredients[index] && ingredients[index].type !== "heading",
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label}: ${name}`}
      data-testid="focus-view"
      data-layout={layout}
      className="fixed inset-0 z-50 overflow-y-auto bg-background text-foreground print:hidden"
    >
      <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-4 px-4 pt-6">
        <div className="flex flex-row items-start justify-between gap-4">
          <div className="min-w-0">
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

        {ingredients.length > 0 && <MultiplierInput />}

        {steps.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-2">
              <p
                className="font-mono text-sm text-muted-foreground"
                data-testid="cook-progress"
                aria-live={layout === "step" ? "polite" : undefined}
              >
                {layout === "step" ? (
                  <>
                    Step{" "}
                    <b className="font-semibold text-foreground">
                      {current + 1}
                    </b>{" "}
                    of {steps.length}
                  </>
                ) : (
                  `${done.size} of ${steps.length} steps done`
                )}
              </p>
              <div
                role="group"
                aria-label="Layout"
                className="ml-auto inline-flex rounded-md bg-muted p-0.5"
              >
                {(
                  [
                    ["step", "One step"],
                    ["list", "All steps"],
                  ] as const
                ).map(([value, text]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={layout === value}
                    onClick={() => setLayout(value)}
                    className={cn(
                      "min-h-8 rounded-sm px-3 py-1 text-sm font-medium transition-colors",
                      layout === value
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
            {layout === "step" && (
              /* Canvas B's step bar: done, the current one, the rest. */
              <div
                aria-hidden="true"
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
                }}
              >
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full",
                      done.has(i)
                        ? "bg-primary"
                        : i === current
                          ? "bg-primary/40"
                          : "bg-muted",
                    )}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inside the modal, where a screen reader still hears it. */}
        <TimerAnnouncer />
        <TimerTray
          variant="inline"
          className="sticky top-0 z-10 -mx-4 bg-background px-4 py-2"
        />

        {layout === "step" && step ? (
          <section
            ref={stepRef}
            tabIndex={-1}
            aria-label={`Step ${current + 1}`}
            data-testid="cook-step"
            className="flex flex-col gap-5 rounded-md pb-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {step.group && (
              <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                {step.group}
              </p>
            )}
            <label
              className={cn(
                "flex cursor-pointer flex-row items-start gap-4 text-xl leading-relaxed transition-opacity sm:text-2xl",
                done.has(current) && "opacity-40 line-through",
              )}
            >
              <Checkbox
                checked={done.has(current)}
                onCheckedChange={() => toggleStep(current)}
                aria-label={stepCheckboxName(step)}
                className={focusCheckboxClassName}
              />
              <span className="min-w-0 flex-1">
                {step.name && (
                  <span className="block font-semibold">{step.name}</span>
                )}
                <StepText
                  text={step.text}
                  step={current + 1}
                  components={markdownComponents}
                />
              </span>
            </label>
            {stepLines.length > 0 && (
              <section
                aria-label="For this step"
                data-testid="cook-step-uses"
                className="border-t border-border pt-3"
              >
                <p className="pb-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  For this step
                </p>
                <ul className="space-y-2 text-lg sm:text-xl">
                  {stepLines.map((index) => (
                    <li key={index}>
                      <IngredientCheck
                        line={ingredients[index].ingredient}
                        checked={gathered.has(index)}
                        onToggle={() => toggleIngredient(index)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {ingredients.length > 0 && (
              <details className="rounded-md border border-border bg-card px-4 py-2">
                <summary className="cursor-pointer py-1 font-medium">
                  All ingredients
                </summary>
                <IngredientChecklist
                  ingredients={ingredients}
                  gathered={gathered}
                  onToggle={toggleIngredient}
                  className="py-2 text-lg sm:text-xl"
                />
              </details>
            )}
          </section>
        ) : (
          <>
            {ingredients.length > 0 && (
              <section aria-label="Ingredients">
                <IngredientChecklist
                  ingredients={ingredients}
                  gathered={gathered}
                  onToggle={toggleIngredient}
                  className="text-2xl sm:text-3xl"
                />
              </section>
            )}

            {steps.length > 0 && (
              <section aria-label="Steps" className="pb-6">
                <ol className="space-y-3">
                  {steps.map((each, i) => (
                    <li key={i}>
                      {each.group &&
                        (i === 0 || steps[i - 1].group !== each.group) && (
                          <h3 className="mb-1 mt-3 text-lg font-semibold text-muted-foreground">
                            {each.group}
                          </h3>
                        )}
                      {/*
                        The whole card is the checkbox's label, so a tap
                        anywhere on it still ticks the step off — with a
                        visible box to say so. A timer button inside it is its
                        own control (the label ignores taps on it).
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
                          aria-label={stepCheckboxName(each)}
                          className={focusCheckboxClassName}
                        />
                        <span className="min-w-[2ch] shrink-0 font-mono tabular-nums text-muted-foreground">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          {each.name && (
                            <span className="block font-semibold">
                              {each.name}
                            </span>
                          )}
                          <StepText
                            text={each.text}
                            step={i + 1}
                            components={markdownComponents}
                          />
                        </span>
                      </label>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}

        {layout === "step" && step && (
          <nav
            aria-label="Steps"
            className="sticky bottom-0 -mx-4 mt-auto grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-border bg-card px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3"
          >
            <Button
              type="button"
              variant="outline"
              className="h-14 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              aria-disabled={!canGoBack || undefined}
              onClick={back}
            >
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
            <Button
              type="button"
              className="h-14 min-w-0 justify-between gap-3 px-4 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              aria-disabled={!canFinish || undefined}
              onClick={finish}
              data-testid="cook-done"
            >
              <span className="flex min-w-0 flex-col items-start text-left leading-tight">
                {/* Full strength: at 85% the small line missed 4.5:1 on
                    the primary fill (axe, 42c2). */}
                <span className="text-xs">
                  {next
                    ? `Done · step ${current + 2}`
                    : done.has(current)
                      ? "Last step done"
                      : "Done · last step"}
                </span>
                {next && (
                  <span className="max-w-full truncate text-[0.95rem] font-semibold">
                    {stepPreview(next)}
                  </span>
                )}
              </span>
              <ArrowRight aria-hidden="true" className="size-5" />
            </Button>
          </nav>
        )}
      </div>
    </div>
  );
}

const noSubscription = () => () => {};

function askedForCookView(): boolean {
  try {
    return (
      new URLSearchParams(window.location.search).get(COOK_VIEW_PARAM) === "1"
    );
  } catch {
    return false;
  }
}

/**
 * "Bar view" on a drink, "Cook view" on everything else. A drink is a recipe
 * with a `drink` spec or the `drink` tag — a few imported drinks carry the tag
 * before anyone has filled in their spec.
 *
 * A page opened at `?cook=1` (43p1) opens the view as it hydrates — never on
 * the server, so the HTML matches — and closing it drops the parameter, so a
 * reload stays on the page.
 */
export function FocusViewButton({
  isDrink,
  ...props
}: FocusViewProps & { isDrink?: boolean }) {
  const [opened, setOpen] = useState<boolean | null>(null);
  const asked = useSyncExternalStore(
    noSubscription,
    askedForCookView,
    () => false,
  );
  const open = opened ?? asked;
  const close = useCallback(() => {
    setOpen(false);
    if (!askedForCookView()) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(COOK_VIEW_PARAM);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* Closed all the same; the address keeps its parameter. */
    }
  }, []);
  const bar = Boolean(isDrink || props.drink);
  const label = bar ? "Bar view" : "Cook view";
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
      {open && (
        <FocusOverlay
          {...props}
          label={label}
          defaultLayout={bar ? "list" : "step"}
          onClose={close}
        />
      )}
    </>
  );
}
