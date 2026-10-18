"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { X } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import type { MakeKind } from "./kinds";

/** A blank in the question: the accent, a dotted underline, the h1's type. */
const SLOT =
  "rounded-sm px-[0.06em] text-primary underline decoration-dotted decoration-[0.07em] underline-offset-[0.12em] hover:decoration-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * The page's question is its `<h1>` (41h): "What **drinks** can I make with
 * **lime**?" Its blanks are the controls — the kind word opens a menu of the
 * kinds (`MAKE_KINDS`: recipes, dishes, drinks), and each featured
 * ingredient is a button that stops featuring it. Buttons are phrasing
 * content, so a heading may hold them, and axe's `nested-interactive` is
 * about controls inside controls, which a heading is not. The menu itself is
 * rendered beside the heading, not in it, so an open menu never becomes part
 * of the heading's name.
 */
export function MakeQuestion({
  kind,
  kinds,
  counts,
  featured,
  onKind,
  onUnfeature,
}: {
  kind: MakeKind;
  kinds: MakeKind[];
  /** What each kind would hold if chosen now. */
  counts: Map<string, number>;
  featured: string[];
  onKind: (kind: MakeKind) => void;
  onUnfeature: (name: string) => void;
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

  return (
    <div ref={wrapRef} className="relative">
      <h1
        data-testid="make-question"
        className="m-0 max-w-[22ch] font-display text-[clamp(2rem,1.2rem+3.2vw,3.4rem)] leading-[1.08] font-extrabold tracking-tight text-balance"
      >
        What{" "}
        <button
          ref={kindRef}
          type="button"
          className={SLOT}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          data-testid="make-kind"
          onClick={() => (open ? close(false) : setOpen(true))}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && !open) {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          {kind.word}
        </button>{" "}
        can I make
        {featured.map((name, i) => (
          <Fragment key={name}>
            {i === 0 ? " with " : i === featured.length - 1 ? " and " : ", "}
            <button
              type="button"
              className={cn(SLOT, "inline-flex items-baseline")}
              aria-label={`${name} — stop featuring`}
              onClick={() => onUnfeature(name)}
            >
              {name}
              <X
                aria-hidden
                className="ml-[0.08em] size-[0.42em] self-start opacity-70"
              />
            </button>
          </Fragment>
        ))}
        ?
      </h1>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="What kind of recipe"
          data-testid="make-kind-menu"
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
                {each.query || "everything"} · {counts.get(each.id) ?? 0}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
