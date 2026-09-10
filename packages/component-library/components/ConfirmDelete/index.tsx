"use client";

import { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@discontent/component-library/components/ui/alert-dialog";
import { Button } from "@discontent/component-library/components/ui/button";

/**
 * A destructive submit button that asks first.
 *
 * Deleting a recipe, a project or a page was one stray click — there is no
 * `window.confirm` anywhere in this repo, and the delete forms submitted
 * immediately.
 *
 * Two details are load-bearing:
 *
 * **The confirm button carries a distinct name.** The trigger stays "Delete";
 * the confirm reads "Delete recipe", "Delete project", and so on. Fourteen
 * specs across both sites locate the trigger with
 * `getByRole("button", { name: "Delete", exact: true })`, and a confirm button
 * also called "Delete" would make every one of them ambiguous — turning the
 * `.click()` calls into strict-mode failures. With a distinct label the trigger
 * still resolves uniquely and each spec needs exactly one added click.
 *
 * **The confirm is associated by `form=`, not by nesting.** Radix renders the
 * dialog content in a portal, so the confirm button is not a DOM descendant of
 * the form it submits — `type="submit"` alone would do nothing. The `form`
 * attribute is what crosses that boundary, and it is why the host form needs an
 * `id`.
 */
export function ConfirmDeleteButton({
  formId,
  onConfirm,
  itemLabel,
  title,
  description,
  triggerLabel = "Delete",
  size = "sm",
  children,
}: {
  /**
   * `id` of the form this submits — see the portal note above. Mutually
   * exclusive with `onConfirm`.
   */
  formId?: string;
  /** Handler form, for deletes that are a click rather than a form submission. */
  onConfirm?: () => void;
  /** Singular noun for the confirm button: "recipe" → "Delete recipe". */
  itemLabel: string;
  title?: string;
  description?: ReactNode;
  triggerLabel?: string;
  size?: "sm" | "default";
  /** Custom trigger. Must not be a submit button. */
  children?: ReactNode;
}) {
  const confirmLabel = `Delete ${itemLabel}`;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {children ?? (
          // type="button" matters: this trigger usually sits *inside* the very
          // form it must not submit.
          <Button type="button" size={size} variant="destructive">
            {triggerLabel}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {title ?? `Delete this ${itemLabel}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? "This cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction asChild>
            {formId ? (
              <Button type="submit" form={formId} variant="destructive">
                {confirmLabel}
              </Button>
            ) : (
              <Button type="button" variant="destructive" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmDeleteButton;
