"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@discontent/component-library/components/ui/popover";
import { cn } from "@discontent/component-library/lib/utils";
import type { MatcherMember } from "./makeMath";
import { FOCUS, MatcherMark } from "./Tape";

/**
 * A matcher on this browser's list (42m2): "✱ any bean", which counts every
 * bean the recipes name as on hand. Its body opens a small popover to
 * **refine** it — the family's members the current scope uses, each with
 * how many recipes ask for it and a checkbox; "Keep only these" replaces the
 * matcher with the ones ticked (one change, Undo). The popover also
 * features it, since the body no longer does. The × removes it like any
 * label.
 */
export function MatcherTape({
  item,
  pull,
  featured,
  landed,
  members,
  onRefine,
  onToggleFeature,
  onRemove,
}: {
  item: string;
  pull?: number;
  featured: boolean;
  landed?: boolean;
  /** The family's members in scope; read when the popover opens. */
  members: () => MatcherMember[];
  onRefine: (chosen: string[]) => void;
  onToggleFeature: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<MatcherMember[]>([]);
  const headingId = useId();
  const hintId = useId();
  const noun = item.replace(/^any\s+/i, "");
  return (
    <li
      className="make-tape"
      data-kind="have"
      data-matcher="true"
      data-featured={featured ? "true" : undefined}
      data-landed={landed ? "true" : undefined}
    >
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) {
            setShown(members());
            setChosen(new Set());
          }
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="make-matcher"
            aria-haspopup="dialog"
            className={cn(
              "inline-flex min-h-7 items-center gap-1.5 py-1 pr-1 pl-2.5 font-mono text-[0.8rem] leading-none",
              FOCUS,
            )}
          >
            <MatcherMark />
            {item}
            {pull ? (
              <span aria-hidden className="text-[0.68rem] opacity-75">
                {pull}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          role="dialog"
          aria-labelledby={headingId}
          aria-describedby={hintId}
          data-testid="make-matcher-refine"
          className="grid w-72 gap-3"
        >
          <h3 id={headingId} className="m-0 text-sm font-semibold">
            Which {noun}s do you have?
          </h3>
          <p id={hintId} className="m-0 text-xs text-muted-foreground">
            Every {noun} counts as on hand now. Tick the ones you have to keep
            only those.
          </p>
          {shown.length > 0 ? (
            <ul className="m-0 grid max-h-64 list-none gap-0.5 overflow-y-auto p-0">
              {shown.map((member) => (
                <MemberRow
                  key={member.name}
                  member={member}
                  checked={chosen.has(member.name)}
                  onChange={(checked) =>
                    setChosen((before) => {
                      const next = new Set(before);
                      if (checked) next.add(member.name);
                      else next.delete(member.name);
                      return next;
                    })
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">
              No {noun}s in these recipes.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={chosen.size === 0}
              onClick={() => {
                const kept = shown
                  .map((member) => member.name)
                  .filter((name) => chosen.has(name));
                setOpen(false);
                onRefine(kept);
              }}
            >
              Keep only these
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={featured}
              onClick={() => {
                setOpen(false);
                onToggleFeature();
              }}
            >
              {featured ? "Stop featuring" : "Feature it"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={`Remove ${item}`}
        onClick={onRemove}
        className={cn(
          "inline-flex min-h-7 min-w-6 items-center justify-center pr-2 pl-0.5 opacity-70 hover:opacity-100",
          FOCUS,
        )}
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </li>
  );
}

function MemberRow({
  member,
  checked,
  onChange,
}: {
  member: MatcherMember;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <li className="flex min-h-7 items-center gap-2.5 rounded px-1 hover:bg-accent hover:text-accent-foreground">
      <input
        id={id}
        type="checkbox"
        className="size-4 shrink-0 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label
        htmlFor={id}
        className="flex grow cursor-pointer items-baseline justify-between gap-2 py-1 text-sm"
      >
        <span>{member.name}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {member.recipes} {member.recipes === 1 ? "recipe" : "recipes"}
        </span>
      </label>
    </li>
  );
}
