"use client";

import { JumpLinksRow, showJumpLinksOnPath } from "./JumpLinks";
import { useChoices } from "./Choices";

/**
 * The jump row on the reader's path (45e): `JumpLinks`' rule over the lines
 * and steps the chosen path shows, so its count follows a pick as the steps
 * do. The server renders the default path's answer; a recipe without
 * alternatives has one path — every line and step — so its row is the one
 * `JumpLinks` always rendered.
 */
export function PathJumpLinks({
  headings,
  entrySteps,
}: {
  /** Per ingredient line, whether it is a stored heading. */
  headings: boolean[];
  /** Steps per instruction entry (a bare step counts one). */
  entrySteps: number[];
}) {
  const path = useChoices()?.path;
  const show = showJumpLinksOnPath({
    headings,
    lines: path?.lines ?? headings.map(() => true),
    entries: path?.entries ?? entrySteps.map(() => true),
    steps: path
      ? path.steps.reduce(
          (sum, entry) => sum + entry.filter((step) => step.shown).length,
          0,
        )
      : entrySteps.reduce((sum, count) => sum + count, 0),
  });
  return show ? <JumpLinksRow /> : null;
}
