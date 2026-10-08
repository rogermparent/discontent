"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import {
  breadcrumb,
  childrenInScope,
  rootsInScope,
  type TagIndex,
} from "./tagTree";

/** Root chips at most, before the search box is the way in. */
const ROOT_LIMIT = 12;

function TagChip({
  label,
  count,
  pressed,
  onToggle,
}: {
  label: string;
  count: number;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <Badge asChild variant={pressed ? "default" : "secondary"}>
      <button type="button" aria-pressed={pressed} onClick={onToggle}>
        {label}
        {/* The ticker reads the scope's total aloud; the per-chip count is a
            visual aid, and keeping it out of the name keeps the name the tag. */}
        <span className="font-mono opacity-70" aria-hidden>
          {count}
        </span>
      </button>
    </Badge>
  );
}

/**
 * `/make`'s top-level tags (epic 28, 28g): the vocabulary's roots, ordered
 * by how many recipes in scope sit under each. A root with children has a
 * toggle that shows them in a row of their own; every chip, parent or child,
 * toggles `tag:<slug>` in the scope. A root with a selected child opens by
 * itself, so a pick is always visible.
 */
export function TagPicks({
  index,
  usage,
  selected,
  onToggle,
}: {
  index: TagIndex;
  usage: Map<string, number>;
  /** Folded `tag:` values the scope selects. */
  selected: Set<string>;
  onToggle: (slug: string) => void;
}) {
  const id = useId();
  /* What the person chose; a selected child opens its root until closed. */
  const [toggled, setToggled] = useState<Map<string, boolean>>(() => new Map());
  const roots = rootsInScope(index, usage, selected, ROOT_LIMIT);
  const openRoots = roots.filter(
    (root) =>
      (index.get(root)?.children.length ?? 0) > 0 &&
      (toggled.get(root) ??
        [...selected].some(
          (slug) => slug !== root && breadcrumb(index, slug)[0]?.slug === root,
        )),
  );

  if (roots.length === 0) return null;
  return (
    <div className="my-2 flex flex-col gap-1.5">
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Top-level tags"
      >
        {roots.map((slug) => {
          const node = index.get(slug);
          if (!node) return null;
          const hasChildren =
            childrenInScope(index, usage, selected, slug).length > 0;
          const isOpen = openRoots.includes(slug);
          return (
            <span key={slug} className="inline-flex items-center">
              <TagChip
                label={node.label}
                count={usage.get(slug) ?? 0}
                pressed={selected.has(slug)}
                onToggle={() => onToggle(slug)}
              />
              {hasChildren && (
                <button
                  type="button"
                  className="ml-0.5 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-expanded={isOpen}
                  aria-controls={`${id}-${slug}`}
                  aria-label={`Narrower tags of ${node.label}`}
                  onClick={() =>
                    setToggled((current) => new Map(current).set(slug, !isOpen))
                  }
                >
                  {isOpen ? (
                    <ChevronDown className="size-4" aria-hidden />
                  ) : (
                    <ChevronRight className="size-4" aria-hidden />
                  )}
                </button>
              )}
            </span>
          );
        })}
      </div>
      {openRoots.map((root) => (
        <div
          key={root}
          id={`${id}-${root}`}
          className="flex flex-wrap items-center gap-1.5 border-l-2 border-border pl-2"
          role="group"
          aria-label={`Narrower tags of ${index.get(root)?.label ?? root}`}
        >
          {childrenInScope(index, usage, selected, root).map((slug) => (
            <TagChip
              key={slug}
              label={index.get(slug)?.label ?? slug}
              count={usage.get(slug) ?? 0}
              pressed={selected.has(slug)}
              onToggle={() => onToggle(slug)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
