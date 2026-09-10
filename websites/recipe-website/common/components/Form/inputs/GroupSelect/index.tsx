"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  Errors,
  FieldWrapper,
  baseInputStyle,
} from "@discontent/component-library/components/Form";
import { groupKindLabel } from "../../../../util/groupKindLabel";
import type { GroupSearchEntry } from "../../../../controller/data/readGroupSearchCorpus";

/**
 * Pick a group, for the featured-recipe form (22g).
 *
 * A native `<select>` rather than `RecipeSelectInput`'s modal: groups are
 * counted in tens where recipes are counted in hundreds, `/search/groups`
 * already serves every one of them as a single small document (22f), and a
 * one-tap list is a better control than a search dialog for a set that fits on
 * screen. It is also the feed the browse rail and the ⌘K rows read, so the
 * picker cannot drift out of step with what the reader is offered elsewhere.
 *
 * The one thing it borrows wholesale from `RecipeSelectInput` is honesty about
 * a **dangling slug**: a feature whose group has since been deleted or renamed
 * must not render as an empty picker while going on submitting the old slug —
 * an edit that touched nothing would look like it had cleared the field. So a
 * `defaultValue` the fetch did not return keeps an option of its own, selected,
 * and says what it is.
 */
export function GroupSelectInput({
  name,
  id = name,
  defaultValue,
  label,
  errors,
  required = false,
}: {
  name: string;
  id?: string;
  label?: string;
  defaultValue?: string;
  errors?: string[];
  required?: boolean;
}) {
  const [groups, setGroups] = useState<GroupSearchEntry[]>([]);
  const [value, setValue] = useState<string>(defaultValue ?? "");

  /*
   * Fetched once, on mount. The corpus is a single document the client already
   * pulls on `/search`, and nothing on this form can change it, so there is no
   * dependency worth re-running on.
   */
  useEffect(() => {
    let cancelled = false;
    fetch("/search/groups")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch groups: ${response.status}`);
        }
        return response.json();
      })
      .then((entries: GroupSearchEntry[]) => {
        if (!cancelled) setGroups(entries);
      })
      .catch((error) => {
        console.error("Failed to fetch groups", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const missing = Boolean(value) && !groups.some((g) => g.slug === value);

  return (
    <FieldWrapper label={label} id={id}>
      <Errors errors={errors} />
      <select
        name={name}
        id={id}
        required={required}
        className={clsx(baseInputStyle, "px-2 py-1")}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      >
        <option value="">Select a group…</option>
        {missing && (
          <option value={value} data-testid="group-select-missing">
            {value} (group not found)
          </option>
        )}
        {groups.map((group) => (
          <option key={group.slug} value={group.slug}>
            {group.name} · {groupKindLabel(group.kind)}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

export default GroupSelectInput;
