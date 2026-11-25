"use client";

import Link from "next/link";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@discontent/component-library/components/ui/popover";
import { cn } from "@discontent/component-library/lib/utils";
import {
  GROUP_FILTER_THRESHOLD,
  filterGroupChoices,
  groupChoiceCount,
  type GroupChoice,
} from "../../util/groupChoices";

/** `addRecipeToGroup`'s answer (editor actions). */
export type AddToGroup = (
  group: string,
  recipe: string,
) => Promise<{ ok: true; slug: string; name: string } | { error: string }>;

const noSubscription = () => () => {};

const itemClass =
  "flex min-h-11 w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60";

/**
 * The recipe page's "Group" (51, Dg1): a button that opens the groups this
 * recipe may join — newest first, a filter past eight — and "New group…" at
 * the bottom, which is the old `/group/new?recipe=` form. Picking one adds the
 * recipe at the end through a server action and says so in place, with a link
 * to the group; a group that already has it opens that group instead (Dg2).
 *
 * Without JavaScript the button stays the link it was (`/group/new`), since
 * the picker needs the client to run its action.
 */
export function GroupPicker({
  recipe,
  groups,
  add,
}: {
  recipe: string;
  groups: readonly GroupChoice[];
  add: AddToGroup;
}) {
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const newHref = `/group/new?recipe=${encodeURIComponent(recipe)}`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string>();
  const [said, setSaid] = useState<
    { ok: true; slug: string; name: string } | { error: string }
  >();
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const filterId = useId();
  const showFilter = groups.length > GROUP_FILTER_THRESHOLD;
  const shown = filterGroupChoices(groups, query);

  if (!hydrated) {
    return (
      <Button asChild size="sm">
        <Link href={newHref}>Group</Link>
      </Button>
    );
  }

  const items = () =>
    Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-picker-item]") ??
        [],
    );

  /* Arrow keys walk the filter and the rows; Home/End jump (Dg3). */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const all = items();
    if (all.length === 0) return;
    const at = all.indexOf(document.activeElement as HTMLElement);
    let next = at;
    if (event.key === "ArrowDown") next = at + 1 >= all.length ? 0 : at + 1;
    if (event.key === "ArrowUp") next = at <= 0 ? all.length - 1 : at - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = all.length - 1;
    event.preventDefault();
    all[next]?.focus();
  };

  const pick = async (group: GroupChoice) => {
    setBusy(group.slug);
    setSaid(undefined);
    try {
      const answer = await add(group.slug, recipe);
      setSaid(answer);
      if ("ok" in answer) {
        setAdded((current) => new Set(current).add(group.slug));
        setOpen(false);
        setQuery("");
      }
    } catch {
      setSaid({
        error: "Couldn't reach the editor. Check the connection and try again.",
      });
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setSaid(undefined);
          else setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <Button type="button" size="sm" data-testid="group-picker-trigger">
            Group
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="flex max-h-[min(24rem,70vh)] w-80 max-w-[calc(100vw-2rem)] flex-col gap-1 p-2"
          data-testid="group-picker"
          onKeyDown={onKeyDown}
          onOpenAutoFocus={(event) => {
            /* The filter when there is one, else the first group. */
            event.preventDefault();
            const first =
              listRef.current?.querySelector<HTMLElement>("[data-picker-item]");
            first?.focus();
          }}
        >
          <div ref={listRef} className="flex min-h-0 flex-col gap-1">
            <p className="px-2 pt-1 text-xs font-medium text-muted-foreground">
              Add to a group
            </p>
            {showFilter && (
              <>
                <label htmlFor={filterId} className="sr-only">
                  Filter groups
                </label>
                <Input
                  id={filterId}
                  data-picker-item
                  value={query}
                  placeholder="Filter groups"
                  className="h-9"
                  autoComplete="off"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </>
            )}
            <ul
              className="flex min-h-0 flex-col overflow-y-auto"
              aria-label="Groups"
            >
              {shown.map((group) => {
                const already = group.hasRecipe || added.has(group.slug);
                const body = (
                  <>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {group.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {already
                        ? "Already in it"
                        : groupChoiceCount(group.itemCount)}
                    </span>
                    {already && (
                      <Check aria-hidden className="size-4 shrink-0" />
                    )}
                  </>
                );
                return (
                  <li key={group.slug}>
                    {already ? (
                      <Link
                        href={`/group/${group.slug}`}
                        className={itemClass}
                        data-picker-item
                        data-testid="group-picker-row"
                        data-already="true"
                      >
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={itemClass}
                        data-picker-item
                        data-testid="group-picker-row"
                        disabled={busy !== undefined}
                        onClick={() => pick(group)}
                      >
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
              {shown.length === 0 && (
                <li className="px-2 py-2 text-sm text-muted-foreground">
                  {groups.length === 0
                    ? "No groups yet."
                    : "No group has that name."}
                </li>
              )}
            </ul>
            <div className="border-t border-border pt-1">
              <Link
                href={newHref}
                className={cn(itemClass, "font-medium")}
                data-picker-item
                data-testid="group-picker-new"
              >
                <Plus aria-hidden className="size-4" />
                New group…
              </Link>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {said && (
        <p
          role="status"
          className={cn(
            "basis-full text-sm",
            "error" in said && "text-destructive",
          )}
          data-testid="group-picker-result"
        >
          {"ok" in said ? (
            <>
              Added to {said.name} ·{" "}
              <Link href={`/group/${said.slug}`} className="underline">
                Open
              </Link>
            </>
          ) : (
            said.error
          )}
        </p>
      )}
    </>
  );
}
