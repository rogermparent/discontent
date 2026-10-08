"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Input } from "@discontent/component-library/components/ui/input";
import { cn } from "@discontent/component-library/lib/utils";
import { breadcrumb, searchTags, type TagIndex } from "./tagTree";

/** As many rows as read at a glance; typing narrows to the rest. */
const MAX_OPTIONS = 8;

/**
 * "Find a tag" on `/make` (epic 28, 28g): any tag in the vocabulary that a
 * recipe carries, parent or child, shown with its breadcrumb. Picking one
 * adds `tag:<slug>` to the scope.
 *
 * The ARIA 1.2 combobox pattern: the input owns a listbox by
 * `aria-controls`, the highlighted row is `aria-activedescendant`, and focus
 * never leaves the input — arrows move the highlight, Enter picks, Escape
 * closes.
 */
export function TagSearch({
  index,
  corpusUsage,
  onPick,
}: {
  index: TagIndex;
  corpusUsage: Map<string, number>;
  onPick: (slug: string) => void;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = useMemo(
    () => searchTags(index, corpusUsage, text, MAX_OPTIONS),
    [index, corpusUsage, text],
  );
  const expanded = open && options.length > 0;

  function pick(slug: string) {
    onPick(slug);
    setText("");
    setOpen(false);
    setActive(0);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (expanded ? (current + 1) % options.length : 0));
    } else if (event.key === "ArrowUp" && expanded) {
      event.preventDefault();
      setActive((current) => (current - 1 + options.length) % options.length);
    } else if (event.key === "Enter" && expanded) {
      event.preventDefault();
      pick(options[active].slug);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative mt-2">
      <label htmlFor={id} className="sr-only">
        Find a tag
      </label>
      <Input
        id={id}
        data-testid="make-tag-search"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `${id}-${active}` : undefined}
        placeholder="Find a tag…"
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Tags"
        hidden={!expanded}
        className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
      >
        {options.map((option, position) => {
          const trail = breadcrumb(index, option.slug);
          return (
            <li
              key={option.slug}
              id={`${id}-${position}`}
              role="option"
              aria-selected={position === active}
              className={cn(
                "flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-sm",
                position === active && "bg-accent text-accent-foreground",
              )}
              /* mousedown, so the pick lands before the input's blur closes it */
              onMouseDown={(event) => {
                event.preventDefault();
                pick(option.slug);
              }}
              onMouseEnter={() => setActive(position)}
            >
              <span>
                {trail.length > 1 && (
                  <span className="text-muted-foreground">
                    {trail
                      .slice(0, -1)
                      .map((node) => node.label)
                      .join(" › ")}
                    {" › "}
                  </span>
                )}
                <span className="font-medium">{option.label}</span>
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {corpusUsage.get(option.slug) ?? 0}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
