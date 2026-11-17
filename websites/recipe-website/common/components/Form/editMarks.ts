/**
 * How "Edit with AI" (47i) lays a request's change on the form, and takes
 * it off again — pure, so the stacking rule is a unit test, not a click.
 *
 * **The rule (Di8): the request reads the form as it is, and marks stack.**
 * A request sees what the form holds when it is sent — a fill's values, an
 * earlier request's, the person's typing. Its change is applied on top, and
 * the marks already there stay: a section a fill filled and a request then
 * changed says "from the source · edited"; a step's open uses offer (47g)
 * stays while its step is as the model read it (47g Dg4). A field the person
 * changed while the model was reading is not overwritten: the change to it
 * is skipped, and said. Undo puts a field back to what it held before the
 * first request that changed it; Accept only takes its mark away.
 */
import {
  EDIT_FIELDS,
  sameEditValue,
  type EditField,
  type EditValues,
} from "../../util/editRequest";
import type { EditMarks, EditRequestMark, FillMarks } from "./fillMarks";

/** A request's checked change, as the form is handed it. */
export interface EditChange {
  fields: readonly EditField[];
  change: Partial<EditValues>;
  request: EditRequestMark;
}

/** What laying a change on the form did. */
export interface StackedEdit {
  /** The form's values with the change laid on. */
  values: EditValues;
  marks: FillMarks;
  /** The fields changed now. */
  applied: EditField[];
  /** The fields the person changed while the model read: left alone. */
  skipped: EditField[];
}

const NO_MARKS: FillMarks = { filled: [], estimated: [] };

/**
 * Lay `edit` on `values` (the form now), given `sent` (the form as the
 * request read it) and the marks the form holds (`prev`).
 */
export function stackEdit(
  prev: FillMarks | undefined,
  values: EditValues,
  sent: EditValues,
  edit: EditChange,
): StackedEdit {
  const skipped = edit.fields.filter(
    (field) => !sameEditValue(values[field], sent[field]),
  );
  const applied = edit.fields.filter((field) => !skipped.includes(field));
  const marks = prev ?? NO_MARKS;
  if (applied.length === 0) return { values, marks, applied, skipped };
  const earlier = marks.edited;
  const before: Partial<EditValues> = { ...(earlier?.before ?? {}) };
  const after: Partial<EditValues> = { ...(earlier?.after ?? {}) };
  const next = { ...values };
  for (const field of applied) {
    /* Undo goes back to before the first request that changed it. */
    if (!earlier?.fields.includes(field)) {
      (before as Record<string, unknown>)[field] = values[field];
    }
    (next as Record<string, unknown>)[field] = edit.change[field];
    (after as Record<string, unknown>)[field] = edit.change[field];
  }
  const fields = EDIT_FIELDS.filter(
    (field) => earlier?.fields.includes(field) || applied.includes(field),
  );
  const edited: EditMarks = {
    requests: [...(earlier?.requests ?? []), edit.request],
    fields,
    /* A field changed again wants a new look. */
    accepted: (earlier?.accepted ?? []).filter(
      (field) => !applied.includes(field),
    ),
    before,
    after,
  };
  return {
    values: next,
    marks: { ...marks, edited },
    applied,
    skipped,
  };
}

/** Accept a field: its mark goes, its value stays (and Save keeps it). */
export function acceptEdit(marks: FillMarks, field: EditField): FillMarks {
  const edited = marks.edited;
  if (!edited?.fields.includes(field) || edited.accepted.includes(field)) {
    return marks;
  }
  return {
    ...marks,
    edited: { ...edited, accepted: [...edited.accepted, field] },
  };
}

/**
 * Undo fields: each back to what it held before the requests changed it,
 * and no longer theirs. The other fields stay as the form holds them.
 */
export function undoEdit(
  marks: FillMarks,
  values: EditValues,
  fields: readonly EditField[],
): { values: EditValues; marks: FillMarks } {
  const edited = marks.edited;
  if (!edited) return { values, marks };
  const undone = fields.filter((field) => edited.fields.includes(field));
  const next = { ...values };
  const before = { ...edited.before };
  const after = { ...edited.after };
  for (const field of undone) {
    (next as Record<string, unknown>)[field] = edited.before[field];
    delete (before as Record<string, unknown>)[field];
    delete (after as Record<string, unknown>)[field];
  }
  return {
    values: next,
    marks: {
      ...marks,
      edited: {
        ...edited,
        fields: edited.fields.filter((field) => !undone.includes(field)),
        accepted: edited.accepted.filter((field) => !undone.includes(field)),
        before,
        after,
      },
    },
  };
}
