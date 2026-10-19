"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@discontent/component-library/lib/utils";
import type { MakeKind } from "./kinds";

/**
 * The kind menu (41h), out of `MakeQuestion` so the holiday menu page (42e)
 * asks the same way: a word in a heading is a button that opens a menu of
 * `MAKE_KINDS` — recipes, dishes, drinks.
 *
 * `children` renders the heading around the word (`word` is the button), so
 * the button lives in the heading while the menu renders beside it, under the
 * button inside this `relative` wrapper — an open menu never becomes part of
 * the heading's name. Arrow keys, Home and End move, Escape closes and
 * returns focus to the word, Tab and a click outside close. One component
 * owns the refs: the React compiler's lint (`react-hooks/refs`) refuses a
 * render that reads a ref passed around inside an object.
 */
export function KindMenu({
  kind,
  kinds,
  onKind,
  detail,
  label,
  wordClassName,
  wordTestId,
  menuTestId,
  className,
  children,
}: {
  kind: MakeKind;
  kinds: MakeKind[];
  onKind: (kind: MakeKind) => void;
  /** Small mono text after each kind's word: its query, its count. */
  detail: (kind: MakeKind) => ReactNode;
  /** The menu's accessible name. */
  label: string;
  wordClassName?: string;
  wordTestId?: string;
  menuTestId?: string;
  /** The wrapper's classes; it is always `relative`. */
  className?: string;
  children: (word: ReactNode) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number }>();
  const wrapRef = useRef<HTMLDivElement>(null);
  const kindRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const place = useCallback(() => {
    const wrap = wrapRef.current?.getBoundingClientRect();
    const button = kindRef.current?.getBoundingClientRect();
    if (!wrap || !button) return;
    setAnchor({
      left: button.left - wrap.left,
      top: button.bottom - wrap.top,
    });
  }, []);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) kindRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const items = menuRef.current?.querySelectorAll<HTMLElement>(
      "[role=menuitemradio]",
    );
    const checked = menuRef.current?.querySelector<HTMLElement>(
      "[aria-checked=true]",
    );
    (checked ?? items?.[0])?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !kindRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLElement>(
        "[role=menuitemradio]",
      ) ?? []),
    ];
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = (at + 1) % items.length;
    else if (event.key === "ArrowUp")
      next = (at - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    } else if (event.key === "Tab") {
      close(false);
      return;
    }
    if (next !== undefined) {
      event.preventDefault();
      items[next]?.focus();
    }
  };

  const word = (
    <button
      ref={kindRef}
      type="button"
      className={wordClassName}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      data-testid={wordTestId}
      onClick={() => (open ? close(false) : setOpen(true))}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" && !open) {
          event.preventDefault();
          setOpen(true);
        }
      }}
    >
      {kind.word}
    </button>
  );

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      {children(word)}
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          data-testid={menuTestId}
          onKeyDown={onMenuKey}
          style={anchor}
          className="absolute z-30 mt-1.5 grid min-w-60 gap-0.5 rounded-md border border-input bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {kinds.map((each) => (
            <button
              key={each.id}
              type="button"
              role="menuitemradio"
              aria-checked={each.id === kind.id}
              tabIndex={-1}
              className="flex min-h-9 w-full items-baseline justify-between gap-4 rounded px-2.5 py-2 text-left text-[0.95rem] font-medium hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring aria-checked:bg-accent aria-checked:text-accent-foreground"
              onClick={() => {
                onKind(each);
                close(true);
              }}
            >
              {each.word}{" "}
              <small className="font-mono text-xs font-normal">
                {detail(each)}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
