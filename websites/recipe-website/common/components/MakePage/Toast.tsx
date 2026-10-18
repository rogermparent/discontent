"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ToastState {
  id: number;
  message: string;
  undo?: () => void;
}

/** How long a toast stays: longer when it offers Undo. */
const PLAIN_MS = 2600;
const UNDO_MS = 7000;

/**
 * `/make`'s one toast (41h): what just happened, and Undo when it can be
 * undone (Clear, a removed label, a copied list). A `role="status"` region
 * that is always in the page, so a screen reader hears each message; the
 * bar ignores the pointer except for its Undo button, so it never sits on
 * top of a control a click meant. Above the phone's tab bar.
 */
export function useUndoToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const next = useRef(0);

  const show = useCallback((message: string, undo?: () => void) => {
    next.current += 1;
    setToast({ id: next.current, message, undo });
  }, []);

  useEffect(() => {
    if (!toast) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setToast(null),
      toast.undo ? UNDO_MS : PLAIN_MS,
    );
    return () => clearTimeout(timer.current);
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
          className="flex max-w-full items-center gap-4 rounded-md bg-foreground py-2 pr-2 pl-4 text-sm text-background shadow-lg"
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              className="pointer-events-auto min-h-7 rounded border border-current px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
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
