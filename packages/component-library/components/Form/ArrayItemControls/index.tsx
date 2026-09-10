"use client";

import { ButtonGroup } from "@discontent/component-library/components/ui/button-group";
import { ListInputButton } from "@discontent/component-library/components/Form/inputs/List";

/**
 * The `+ ↑ ↓ ×` cluster that edits one row of a repeatable field.
 *
 * Promoted here because it had been reimplemented **verbatim in three files**
 * (recipe's Ingredients, Instructions and Timeline), which is how the four
 * copies had already begun to disagree about spacing. Grouped in a
 * `ButtonGroup` so the four buttons read as one instrument.
 *
 * The glyphs carry `aria-label`s: "+" and "×" alone are not usable names, and
 * the arrows are Unicode symbols a screen reader may or may not announce.
 */
export function ArrayItemControls({
  onInsert,
  onMoveUp,
  onMoveDown,
  onRemove,
  itemLabel = "item",
}: {
  onInsert: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  /** Singular noun used to build each control's accessible name. */
  itemLabel?: string;
}) {
  return (
    <ButtonGroup>
      <ListInputButton
        onClick={onInsert}
        className="ml-0"
        aria-label={`Insert ${itemLabel}`}
      >
        +
      </ListInputButton>
      <ListInputButton
        onClick={onMoveUp}
        className="ml-0"
        aria-label={`Move ${itemLabel} up`}
      >
        ↑
      </ListInputButton>
      <ListInputButton
        onClick={onMoveDown}
        className="ml-0"
        aria-label={`Move ${itemLabel} down`}
      >
        ↓
      </ListInputButton>
      <ListInputButton
        onClick={onRemove}
        className="ml-0"
        aria-label={`Remove ${itemLabel}`}
      >
        ×
      </ListInputButton>
    </ButtonGroup>
  );
}
