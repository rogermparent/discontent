"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

interface ToastState {
  id: number;
  message: string;
  undo?: () => void;
  /** Focus Undo as the toast appears (Clear: its button just went away). */
  focusUndo?: boolean;
}

export interface ToastOptions {
  /** Move focus to Undo when the toast appears. */
  focusUndo?: boolean;
}

/** How long a toast stays: longer when it offers Undo. */
const PLAIN_MS = 2600;
const UNDO_MS = 7000;

/** A key press typed into a field is the field's own undo, not ours. */
function editable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/**
 * `/make`'s one toast (41h): what just happened, and Undo when it can be
 * undone (Clear, a removed label, a copied list). A `role="status"` region
 * that is always in the page, so a screen reader hears each message. Above
 * the phone's tab bar.
 *
 * Undo by keyboard (41h review, WCAG 2.2.1 and 2.1.1):
 *
 * - the timer **pauses** while the pointer is over the toast or focus is in
 *   it, and starts again from the top when it leaves;
 * - `focusUndo` moves focus to Undo as it appears (Clear, whose own button
 *   disables itself);
 * - **Ctrl+Z / ⌘Z** undoes while the toast is up, unless focus is in a
 *   text field (that is the field's own undo) — the way back after a
 *   label's ×, whose focus goes to the next label.
 *
 * After Undo, focus that was in the toast goes to `fallbackFocus` (the add
 * field) rather than to the page's body. A plain toast ("Added lime.")
 * ignores the pointer, so it never sits on top of a control a click meant.
 */
export function useUndoToast(fallbackFocus?: RefObject<HTMLElement | null>) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [paused, setPaused] = useState({ hover: false, focus: false });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const next = useRef(0);
  const undoRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const show = useCallback(
    (message: string, undo?: () => void, options: ToastOptions = {}) => {
      next.current += 1;
      setPaused({ hover: false, focus: false });
      setToast({
        id: next.current,
        message,
        undo,
        focusUndo: options.focusUndo,
      });
    },
    [],
  );

  /* No useCallback: the React Compiler memoizes it (a manual one over a
   * ref's `.current` is one it refuses to keep). */
  const runUndo = () => {
    if (!toast?.undo) return;
    const hadFocus = !!barRef.current?.contains(document.activeElement);
    toast.undo();
    setToast(null);
    setPaused({ hover: false, focus: false });
    if (hadFocus) fallbackFocus?.current?.focus();
  };
  /* The key handler calls the latest one, without re-subscribing. */
  const undoNow = useRef(runUndo);
  useEffect(() => {
    undoNow.current = runUndo;
  });

  const held = paused.hover || paused.focus;
  useEffect(() => {
    clearTimeout(timer.current);
    if (!toast || held) return;
    timer.current = setTimeout(
      () => setToast(null),
      toast.undo ? UNDO_MS : PLAIN_MS,
    );
    return () => clearTimeout(timer.current);
  }, [toast, held]);

  useEffect(() => {
    if (toast?.focusUndo) undoRef.current?.focus();
  }, [toast]);

  useEffect(() => {
    if (!toast?.undo) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "z" ||
        !(event.ctrlKey || event.metaKey) ||
        event.shiftKey ||
        event.altKey ||
        editable(event.target)
      ) {
        return;
      }
      event.preventDefault();
      undoNow.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toast]);

  const element = (
    <div
      role="status"
      data-testid="make-toast"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 lg:bottom-6"
    >
      {toast && (
        <div
          key={toast.id}
          ref={barRef}
          className={
            "flex max-w-full items-center gap-4 rounded-md bg-foreground py-2 pr-2 pl-4 text-sm text-background shadow-lg" +
            (toast.undo ? " pointer-events-auto" : "")
          }
          onPointerEnter={() => setPaused((p) => ({ ...p, hover: true }))}
          onPointerLeave={() => setPaused((p) => ({ ...p, hover: false }))}
          onFocus={() => setPaused((p) => ({ ...p, focus: true }))}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setPaused((p) => ({ ...p, focus: false }));
            }
          }}
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              ref={undoRef}
              type="button"
              aria-keyshortcuts="Control+Z Meta+Z"
              className="min-h-7 rounded border border-current px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={runUndo}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );

  return { show, element };
}
