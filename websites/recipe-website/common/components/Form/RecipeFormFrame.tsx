"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useStore } from "@tanstack/react-form";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { Button } from "@discontent/component-library/components/ui/button";
import { buttonVariants } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import { useRecipeForm, type RecipeFormValues } from "./formContext";
import {
  RECIPE_SECTIONS,
  changeText,
  changedFields,
  sectionAnchor,
  sectionStatuses,
  type SectionStatus,
  type StatusContext,
} from "./sections";

/*
 * Edit form B, "Review, then save" (43e1): a sticky rail of the recipe's
 * sections with what each holds, the save card under it, and the sections
 * as headings with rules. One frame for /new-recipe and /recipe/<slug>/edit.
 *
 * The rail lives beside the form, not in it — the new-recipe page's Start
 * from card is a form of its own, and forms do not nest — so the form's
 * children *portal* the rail's contents into the frame's rail slot. In the
 * React tree they stay inside the recipe form: the form instance (context),
 * `useFormStatus` (Save waits while it posts) and the server state reach
 * them; in the DOM they sit outside the `<form>`, so their submit buttons
 * name it (`form="recipe-form"`).
 */

/** The rail slot the form's rail portals into: null until it is mounted. */
const RailSlot = createContext<HTMLElement | null>(null);

/** The rail sits beside the sections from `lg` (64rem) up. */
const WIDE = "(min-width: 64rem)";

function subscribeWide(callback: () => void) {
  let list: MediaQueryList | undefined;
  try {
    list = window.matchMedia(WIDE);
    list.addEventListener("change", callback);
  } catch {
    list = undefined;
  }
  return () => list?.removeEventListener("change", callback);
}

/**
 * Whether the rail is beside the sections. The server cannot know: it
 * renders the phone's save bar (hidden from `lg` by CSS until hydration),
 * and a wide screen moves Save to the rail as it hydrates — so there is only
 * ever one Save button, one Overwrite and one message in the page.
 */
export function useWideRail(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => {
      try {
        return window.matchMedia(WIDE).matches;
      } catch {
        return false;
      }
    },
    () => false,
  );
}

/**
 * The page: its heading (and, on /new-recipe, whatever is above the form),
 * the rail slot, and the column of sections.
 */
export function RecipeFormFrame({
  eyebrow,
  title,
  children,
}: {
  /** "New recipe" or "Editing recipe" — small, above the title. */
  eyebrow?: ReactNode;
  /** The page's h1. */
  title: ReactNode;
  children: ReactNode;
}) {
  const [rail, setRail] = useState<HTMLElement | null>(null);
  return (
    <div
      className="mx-auto w-full max-w-6xl grow px-4 pt-6 pb-10 lg:grid lg:grid-cols-[13.75rem_minmax(0,1fr)] lg:gap-x-8"
      data-testid="recipe-form-frame"
    >
      <div className="lg:col-start-2 lg:row-start-1">
        <h1 className="font-display text-3xl leading-9 font-bold tracking-[-0.01em] break-words">
          {eyebrow ? (
            <>
              <span className="block font-mono text-xs leading-4 font-medium tracking-[0.05em] text-muted-foreground uppercase">
                {eyebrow}
              </span>{" "}
            </>
          ) : null}
          {title}
        </h1>
      </div>
      <div
        ref={setRail}
        className="mt-3 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mt-0"
        data-testid="recipe-form-rail-slot"
      />
      <div className="mt-5 flex max-w-[53.75rem] min-w-0 flex-col gap-7 lg:col-start-2 lg:row-start-2">
        <RailSlot.Provider value={rail}>{children}</RailSlot.Provider>
      </div>
    </div>
  );
}

/**
 * A section of the form: a heading with a rule under it, what it came from
 * ("from the page"), and anything the heading carries (a count, a toggle).
 */
export function FormSection({
  id,
  title,
  from,
  aside,
  children,
  className,
}: {
  id: Parameters<typeof sectionAnchor>[0];
  title: string;
  from?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={sectionAnchor(id)}
      className={cn(
        "flex scroll-mt-[calc(var(--sticky-chrome-offset,0px)+1rem)] flex-col gap-3 pt-2",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border pb-2">
        <h2 className="flex-1 font-display text-xl leading-7 font-semibold tracking-[-0.025em]">
          {title}
        </h2>
        {aside}
        {from ? (
          <span className="font-mono text-[0.6875rem] leading-none font-medium tracking-[0.05em] text-muted-foreground uppercase">
            {from}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

const TONE: Record<NonNullable<SectionStatus["tone"]>, string> = {
  ok: "text-success",
  warn: "text-warning",
  error: "text-destructive",
  active: "text-primary",
};

/** Which section the reader is in: the last whose top has passed the top third. */
function useCurrentSection(ids: string[]): string | undefined {
  const [current, setCurrent] = useState<string>();
  const key = ids.join(" ");
  useEffect(() => {
    const anchors = key.split(" ");
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight / 3;
      let found: string | undefined;
      for (const id of anchors) {
        const element = document.getElementById(id);
        if (!element) continue;
        if (element.getBoundingClientRect().top <= line) found = id;
      }
      setCurrent(found ?? anchors[0]);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [key]);
  return current;
}

/**
 * Picture and video are file inputs the form instance does not hold (they
 * submit as FormData): a change to one of them is seen here, from the form
 * element's own events, so the count and the Picture status include it.
 */
const PICTURE_INPUT =
  /^(image|imageUrlInput|clearImage|video|video-mode|videoUrl|clearVideo)$|-candidate$/;

/**
 * What the picture and video inputs hold right now, as one string: only the
 * set ones count (a checked box, a chosen file, typed text), so an input
 * that is absent reads the same as one that is empty.
 */
function pictureSignature(form: HTMLElement): string {
  const parts: string[] = [];
  form.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
    const name = input.getAttribute("name") ?? "";
    if (!PICTURE_INPUT.test(name)) return;
    if (input.type === "checkbox" || input.type === "radio") {
      if (input.checked) parts.push(`${name}=${input.value}`);
    } else if (input.type === "file") {
      const files = [...(input.files ?? [])].map(
        (file) => `${file.name}:${file.size}`,
      );
      if (files.length) parts.push(`${name}=${files.join(",")}`);
    } else if (input.value) {
      parts.push(`${name}=${input.value}`);
    }
  });
  return parts.sort().join("|");
}

function usePictureTouched(formId: string): boolean {
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return;
    /* Compared with the form as it mounted: typing then deleting, or
     * ticking then unticking, is no change. */
    const atMount = pictureSignature(form);
    const onChange = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      const name = target?.getAttribute?.("name") ?? "";
      if (PICTURE_INPUT.test(name)) {
        setTouched(pictureSignature(form) !== atMount);
      }
    };
    form.addEventListener("change", onChange);
    form.addEventListener("input", onChange);
    return () => {
      form.removeEventListener("change", onChange);
      form.removeEventListener("input", onChange);
    };
  }, [formId]);
  return touched;
}

export interface RecipeFormRailProps {
  mode: "create" | "edit";
  /** The rail's eyebrow: "New recipe", "New recipe · review", "Editing". */
  eyebrow: string;
  /** The Start from row, on /new-recipe only. */
  start?: SectionStatus;
  fromLabel?: StatusContext["fromLabel"];
  /** What the picture field starts with. */
  picture: "page" | "saved" | "new" | "none";
  errors?: StatusContext["errors"];
  /** "Create recipe" or "Save". */
  saveLabel: string;
  /** Where Cancel goes. */
  cancelHref: string;
  /** A roundup run holds Create (35r). */
  busy?: boolean;
  /** The server's answer to the last save (a slug conflict, a bad field). */
  message?: string;
  /** Overwrite, offered after a slug conflict. */
  overwrite?: (formData: FormData) => void;
  /** A line above the buttons (the duplicate check's "you chose a copy"). */
  notice?: ReactNode;
  /**
   * What changes are counted against: the stored recipe when editing. By
   * default the values the form was loaded with — but a failed save
   * reloads the form with what was sent, which is still not saved.
   */
  baseline?: RecipeFormValues;
}

/**
 * The rail's contents and the phone's save bar, rendered inside the recipe
 * form (see the note at the top): the section links with their statuses,
 * then the save card — or, on a phone, the jump row of section pills above
 * the form and the sticky save bar above the tab bar.
 */
export function RecipeFormRail(props: RecipeFormRailProps) {
  const {
    mode,
    eyebrow,
    start,
    fromLabel,
    picture,
    errors,
    saveLabel,
    cancelHref,
    busy,
    message,
    overwrite,
    notice,
    baseline,
  } = props;
  const slot = useContext(RailSlot);
  const wide = useWideRail();
  const form = useRecipeForm();
  const loaded = baseline ?? form.options.defaultValues!;
  const values = useStore(form.store, (state) => state.values);
  const pictureTouched = usePictureTouched("recipe-form");

  const statuses = useMemo(
    () =>
      sectionStatuses(values, {
        fromLabel,
        loaded,
        picture: pictureTouched ? "new" : picture,
        errors,
      }),
    [values, fromLabel, loaded, picture, pictureTouched, errors],
  );
  const changes =
    changedFields(loaded, values).length + (pictureTouched ? 1 : 0);
  const { count, rest } = changeText(changes);

  const rows = [
    ...(start
      ? [{ id: "start" as const, label: "Start from", status: start }]
      : []),
    ...RECIPE_SECTIONS.map((section) => ({
      id: section.id,
      label: section.label,
      status: statuses[section.id],
    })),
  ];
  const anchors = rows.map((row) => sectionAnchor(row.id));
  const current = useCurrentSection(anchors);

  /* One copy of each: in the rail when it is beside the form, else in the
   * phone's bar (see `useWideRail`). */
  const messageLine = (
    <div
      id="missing-fields-error"
      aria-live="polite"
      aria-atomic="true"
      className="empty:hidden"
    >
      {message ? (
        <p
          className="border-l-2 border-destructive pl-2 text-sm"
          data-testid="recipe-form-message"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
  const overwriteButton = overwrite ? (
    <Button
      type="submit"
      form="recipe-form"
      variant="destructive"
      formAction={overwrite}
    >
      Overwrite
    </Button>
  ) : null;
  const changeLine = (
    <p className="text-sm" data-testid="recipe-form-changes">
      {count}
      {rest ? <span className="text-muted-foreground"> {rest}</span> : null}
    </p>
  );
  const cancel = (
    <Link
      href={cancelHref}
      className={cn(buttonVariants({ variant: "ghost" }), "h-11 lg:h-9")}
    >
      Cancel
    </Link>
  );

  const rail = (
    <div className="sticky-chrome lg:top-[calc(var(--header-height)+1rem)]">
      {/* On a phone the pills scroll sideways in their own row; `contain:
          inline-size` keeps their total width out of the page's sizing — a
          scroll container still hands its content's min-content width up,
          and that stretched the page to ~660 px at 393. */}
      <nav
        aria-label="Parts of this recipe"
        className="-mx-4 border-y border-border bg-card px-4 py-2 max-lg:[contain:inline-size] lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0"
        data-testid="recipe-form-rail"
      >
        <p className="hidden px-2.5 pb-2 font-mono text-xs leading-4 font-medium tracking-[0.05em] text-muted-foreground uppercase lg:block">
          {eyebrow}
        </p>
        <ol className="relative flex gap-1.5 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible">
          {rows.map((row, index) => {
            const anchor = sectionAnchor(row.id);
            const here = current === anchor;
            const { text, tone } = row.status;
            return (
              <li key={row.id} className="shrink-0">
                <a
                  href={`#${anchor}`}
                  aria-current={here ? "location" : undefined}
                  className={cn(
                    "flex min-h-9 items-center gap-2 rounded-full border border-border px-3 text-sm whitespace-nowrap no-underline hover:bg-accent lg:min-h-8 lg:rounded-md lg:border-0 lg:px-2.5",
                    here &&
                      "border-transparent bg-accent font-semibold text-accent-foreground",
                  )}
                >
                  <span
                    className="hidden font-mono text-xs text-muted-foreground lg:inline"
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  {row.label}
                  {text ? (
                    <span
                      className={cn(
                        "font-mono text-[0.6875rem] leading-none lg:ml-auto",
                        /* On the current row the status keeps the row's own
                         * text colour (a tone colour is under 4.5:1 on the
                         * accent fill); its mark still carries the tone. */
                        here
                          ? "text-accent-foreground"
                          : cn("text-muted-foreground", tone && TONE[tone]),
                        /* The pills keep their counts and flags only. */
                        !tone && !/^\d+/.test(text) && "max-lg:hidden",
                      )}
                    >
                      <span className="sr-only">: </span>
                      {tone === "error" ? (
                        <span aria-hidden>! </span>
                      ) : tone === "ok" ? (
                        <span aria-hidden>✓ </span>
                      ) : null}
                      {text}
                    </span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
      {wide ? (
        <div
          className="mt-4 hidden flex-col gap-2.5 rounded-lg border border-border bg-card p-3 lg:flex"
          data-testid="recipe-form-save"
          data-mode={mode}
        >
          {notice}
          {messageLine}
          {changeLine}
          <SubmitButton form="recipe-form" className="w-full" disabled={busy}>
            {saveLabel}
          </SubmitButton>
          {overwriteButton}
          {cancel}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {slot ? createPortal(rail, slot) : null}
      {wide ? null : (
        <div
          className="sticky-chrome bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-2 flex flex-col gap-2 border-t border-border bg-card px-4 py-2.5 shadow-[0_-4px_6px_-1px_rgb(0_0_0/0.06)] sm:bottom-0 lg:hidden print:hidden"
          data-testid="recipe-form-savebar"
        >
          {notice}
          {messageLine}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">{changeLine}</div>
            {cancel}
            <SubmitButton
              form="recipe-form"
              className="h-11 px-6"
              disabled={busy}
            >
              {saveLabel}
            </SubmitButton>
          </div>
          {overwriteButton ? <div>{overwriteButton}</div> : null}
        </div>
      )}
    </>
  );
}
