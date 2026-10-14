"use client";

import {
  useActionState,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { Button } from "@discontent/component-library/components/ui/button";
import { tagSlug } from "recipe-website-common/controller/tagSlug";
import {
  deleteTermFromForm,
  mergeTermFromForm,
  renameTermFromForm,
} from "recipe-editor/controller/actions/tagTerms";
import type { TermToolState } from "recipe-editor/controller/termTools";

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * One tool: a form whose first submit only opens the confirmation, and whose
 * second — the confirm button — goes to the server.
 *
 * The guard is on `submit`, not on a button's click, so Enter in the text
 * field asks first too (a one-field form submits implicitly). Cancel closes
 * the confirmation and keeps what was typed.
 */
function ToolForm({
  id,
  title,
  action,
  state,
  ready,
  fields,
  trigger,
  confirmation,
  confirmLabel,
  destructive = false,
}: {
  id: string;
  title: string;
  action: (formData: FormData) => void;
  state: TermToolState;
  /** Whether the fields say enough to ask (a non-empty slug). */
  ready: boolean;
  fields: ReactNode;
  trigger: string;
  confirmation: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (confirming) return;
    event.preventDefault();
    if (ready) setConfirming(true);
  };
  return (
    <form
      id={id}
      action={action}
      onSubmit={onSubmit}
      className="flex flex-col gap-2 rounded-md border p-3"
      aria-labelledby={`${id}-title`}
    >
      <h4 id={`${id}-title`} className="font-semibold">
        {title}
      </h4>
      {fields}
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      {confirming ? (
        <div
          role="group"
          aria-label={`Confirm: ${title}`}
          className="flex flex-col gap-2 rounded-md bg-muted p-3"
        >
          <p className="text-sm">{confirmation}</p>
          <div className="flex flex-wrap gap-2">
            <SubmitButton
              size="sm"
              variant={destructive ? "destructive" : "default"}
            >
              {confirmLabel}
            </SubmitButton>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            type="submit"
            size="sm"
            variant={destructive ? "destructive" : "secondary"}
            disabled={!ready}
          >
            {trigger}
          </Button>
        </div>
      )}
    </form>
  );
}

/**
 * Rename, merge into, delete (35p) — the three seats that change a term's
 * identity, which the record form above deliberately cannot: each rewrites
 * carriers, so each asks first and says how many.
 */
export default function TermTools({
  slug,
  label,
  recipes,
  groups,
  hasRecord,
  terms,
}: {
  slug: string;
  label: string;
  /** Own carriers: what a rename or merge re-tags and a delete untags. */
  recipes: number;
  groups: number;
  hasRecord: boolean;
  /** Merge targets offered in the field's list (any slug may be typed). */
  terms: { slug: string; label: string }[];
}) {
  const initial: TermToolState = {};
  const [renameState, rename] = useActionState(
    renameTermFromForm.bind(null, slug),
    initial,
  );
  const [mergeState, merge] = useActionState(
    mergeTermFromForm.bind(null, slug),
    initial,
  );
  const [deleteState, remove] = useActionState(
    deleteTermFromForm.bind(null, slug),
    initial,
  );

  const [to, setTo] = useState(renameState.values?.to ?? "");
  const [into, setInto] = useState(mergeState.values?.into ?? "");
  const carriers = `${plural(recipes, "recipe")} and ${plural(groups, "group")}`;
  const carried = recipes + groups > 0;

  return (
    <section
      aria-labelledby="term-tools-title"
      data-testid="term-tools"
      className="m-2 mt-8 flex w-full flex-col gap-3"
    >
      <h3 id="term-tools-title" className="text-xl font-bold">
        Rename, merge or delete
      </h3>
      <p className="text-sm text-muted-foreground">
        “{label}” is on {carriers}.
      </p>

      <ToolForm
        id="term-rename"
        title="Rename"
        action={rename}
        state={renameState}
        ready={Boolean(tagSlug(to)) && tagSlug(to) !== slug}
        fields={
          <TextInput
            label="New slug or label"
            name="to"
            id="term-rename-to"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        }
        trigger="Rename…"
        confirmation={
          <>
            Rename “{slug}” to “{tagSlug(to)}”? Its {carriers} are re-tagged
            {hasRecord
              ? `, and /tags/${slug} keeps leading here as an alias.`
              : "."}
          </>
        }
        confirmLabel="Confirm rename"
      />

      <ToolForm
        id="term-merge"
        title="Merge into another term"
        action={merge}
        state={mergeState}
        ready={Boolean(tagSlug(into)) && tagSlug(into) !== slug}
        fields={
          <>
            <TextInput
              label="Merge into"
              name="into"
              id="term-merge-into"
              list="term-merge-targets"
              value={into}
              onChange={(event) => setInto(event.target.value)}
            />
            <datalist id="term-merge-targets">
              {terms.map((term) => (
                <option key={term.slug} value={term.slug}>
                  {term.label}
                </option>
              ))}
            </datalist>
          </>
        }
        trigger="Merge…"
        confirmation={
          <>
            Merge “{slug}” into “{tagSlug(into)}”? Its {carriers} are re-tagged
            “{tagSlug(into)}”; its narrower terms, pins and features move there,
            and “{slug}” becomes one of its aliases. This term’s own record is
            gone afterwards — this cannot be undone here.
          </>
        }
        confirmLabel="Confirm merge"
        destructive
      />

      <ToolForm
        id="term-delete"
        title="Delete"
        action={remove}
        state={deleteState}
        ready
        fields={
          carried ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="unassign"
                defaultChecked={deleteState.values?.unassign}
              />
              Also remove the tag from its {carriers}
            </label>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing carries it, so only the record goes.
            </p>
          )
        }
        trigger="Delete…"
        confirmation={
          <>
            Delete “{slug}”?{" "}
            {carried
              ? `Only if the box is ticked are its ${carriers} untagged; otherwise the delete is refused while they carry it. `
              : ""}
            Its narrower terms and features move up to its parent. This cannot
            be undone here.
          </>
        }
        confirmLabel="Confirm delete"
        destructive
      />
    </section>
  );
}
